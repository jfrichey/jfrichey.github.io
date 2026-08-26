#!/usr/bin/env node

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const sharp = require("sharp");

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class PointSourceARW {
  constructor(size, density, lambda, seed) {
    this.size = size;
    this.count = size * size;
    this.seed = seed;
    this.random = mulberry32(seed);
    this.sleepProbability = lambda / (1 + lambda);
    this.active = new Uint16Array(this.count);
    this.sleeping = new Uint8Array(this.count);
    this.odometer = new Uint32Array(this.count);
    this.queued = new Uint8Array(this.count);
    this.queue = new Int32Array(this.count);
    this.head = 0;
    this.tail = 0;
    this.queueSize = 0;
    this.additions = 0;
    this.instructions = 0;
    this.exited = 0;

    for (let site = 0; site < this.count; site += 1) {
      this.sleeping[site] = this.random() < density ? 1 : 0;
    }
  }

  enqueue(site) {
    if (this.active[site] === 0 || this.queued[site]) return;
    this.queued[site] = 1;
    this.queue[this.tail] = site;
    this.tail = (this.tail + 1) % this.count;
    this.queueSize += 1;
  }

  addAtOrigin() {
    if (this.queueSize !== 0) return false;
    const center = Math.floor(this.size / 2) * this.size + Math.floor(this.size / 2);
    if (this.sleeping[center]) {
      this.sleeping[center] = 0;
      this.active[center] = 2;
    } else {
      this.active[center] += 1;
    }
    this.additions += 1;
    this.enqueue(center);
    return true;
  }

  // Breadth-first legal toppling order: one instruction per queued site. This
  // exposes the avalanche front without changing the ARW rules.
  advance(budget) {
    let used = 0;
    while (this.queueSize > 0 && used < budget) {
      const site = this.queue[this.head];
      this.head = (this.head + 1) % this.count;
      this.queueSize -= 1;
      this.queued[site] = 0;
      if (this.active[site] === 0) continue;

      this.odometer[site] += 1;
      this.instructions += 1;
      used += 1;

      if (this.random() < this.sleepProbability) {
        if (this.active[site] === 1) {
          this.active[site] = 0;
          this.sleeping[site] = 1;
        }
        this.enqueue(site);
        continue;
      }

      this.active[site] -= 1;
      const x = site % this.size;
      const y = Math.floor(site / this.size);
      const direction = Math.floor(this.random() * 4);
      let destination = -1;
      if (direction === 0 && x + 1 < this.size) destination = site + 1;
      else if (direction === 1 && x > 0) destination = site - 1;
      else if (direction === 2 && y + 1 < this.size) destination = site + this.size;
      else if (direction === 3 && y > 0) destination = site - this.size;

      if (destination < 0) {
        this.exited += 1;
      } else if (this.sleeping[destination]) {
        this.sleeping[destination] = 0;
        this.active[destination] = 2;
        this.enqueue(destination);
      } else {
        this.active[destination] += 1;
        this.enqueue(destination);
      }
      this.enqueue(site);
    }
    return used;
  }
}

function mix(first, second, amount) {
  const t = Math.max(0, Math.min(1, amount));
  return first.map((value, index) => Math.round(value + (second[index] - value) * t));
}

const heat = [
  [190, 224, 232],
  [103, 177, 194],
  [69, 130, 161],
  [55, 86, 130],
  [34, 57, 97],
];

const zeroColors = [
  [222, 238, 242],
  [218, 235, 240],
  [214, 232, 238],
  [225, 240, 243],
];

function heatColor(model, index, ceiling) {
  const value = model.odometer[index];
  if (value === 0) {
    let hash = Math.imul(index + model.seed, 0x45d9f3b);
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    hash ^= hash >>> 16;
    return zeroColors[(hash >>> 0) % zeroColors.length];
  }

  const scaled = Math.pow(Math.min(1, Math.log1p(value) / Math.log1p(ceiling)), 0.68);
  const position = scaled * (heat.length - 1);
  const left = Math.min(heat.length - 2, Math.floor(position));
  return mix(heat[left], heat[left + 1], position - left);
}

function render(models, ceilings, gap) {
  const size = models[0].size;
  const width = size * models.length + gap * (models.length - 1);
  const pixels = Buffer.alloc(width * size * 4);

  for (let index = 0; index < width * size; index += 1) {
    pixels[index * 4] = 88;
    pixels[index * 4 + 1] = 126;
    pixels[index * 4 + 2] = 143;
    pixels[index * 4 + 3] = 255;
  }

  models.forEach((model, panel) => {
    const left = panel * (size + gap);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const source = y * size + x;
        const output = (y * width + left + x) * 4;
        const color = heatColor(model, source, ceilings[panel]);
        pixels[output] = color[0];
        pixels[output + 1] = color[1];
        pixels[output + 2] = color[2];
        pixels[output + 3] = 255;
      }
    }
  });

  return { pixels, width, height: size };
}

async function main() {
  const size = 320;
  const gap = 10;
  const lambda = 1;
  const growthFrames = 84;
  const holdFrames = 12;
  const specs = [
    { density: 0.45, seed: 0x13d73, budget: 3_000, ceiling: 55 },
    { density: 0.66, seed: 0x5d813, budget: 18_000, ceiling: 260 },
    { density: 0.80, seed: 0xb334b, budget: 52_000, ceiling: 1_100 },
  ];
  const models = specs.map((spec) => new PointSourceARW(size, spec.density, lambda, spec.seed));
  const ceilings = specs.map((spec) => spec.ceiling);
  const frameDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arw-regimes-"));
  const outputDirectory = path.join(__dirname, "..", "math_images");
  const gifOutput = path.join(outputDirectory, "arw_regimes_glacier.gif");
  const stillOutput = path.join(outputDirectory, "arw_regimes_static.webp");

  try {
    let finalFrame;
    for (let frame = 0; frame < growthFrames + holdFrames; frame += 1) {
      if (frame < growthFrames) {
        models.forEach((model, index) => {
          if (model.queueSize === 0) model.addAtOrigin();
          model.advance(specs[index].budget);
        });
      }

      const rendered = render(models, ceilings, gap);
      const filename = path.join(frameDirectory, `frame-${String(frame).padStart(3, "0")}.png`);
      await sharp(rendered.pixels, {
        raw: { width: rendered.width, height: rendered.height, channels: 4 },
      }).png({ compressionLevel: 3 }).toFile(filename);
      finalFrame = filename;
      process.stdout.write(`\rframe ${frame + 1}/${growthFrames + holdFrames}`);
    }
    process.stdout.write("\n");

    models.forEach((model, index) => {
      process.stdout.write(
        `${specs[index].density.toFixed(2)}: ${model.additions} additions, `
        + `${model.instructions.toLocaleString()} instructions, ${model.exited} exits\n`,
      );
    });

    await sharp(finalFrame).webp({ quality: 92, effort: 6 }).toFile(stillOutput);

    const encoding = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-framerate", "8",
      "-i", path.join(frameDirectory, "frame-%03d.png"),
      "-filter_complex",
      "split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
      "-loop", "0", gifOutput,
    ], { encoding: "utf8" });
    if (encoding.status !== 0) throw new Error(encoding.stderr || "ffmpeg failed");
    process.stdout.write(`${gifOutput}\n${stillOutput}\n`);
  } finally {
    fs.rmSync(frameDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
