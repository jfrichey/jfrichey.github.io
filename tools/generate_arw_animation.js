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

function makeModel(size, density, seed, addedParticles) {
  const random = mulberry32(seed);
  const count = size * size;
  const particles = new Uint16Array(count);
  const odometer = new Uint32Array(count);
  const queued = new Uint8Array(count);
  const stack = new Int32Array(count);
  let stackSize = 0;
  let topplings = 0;

  function enqueue(index) {
    if (particles[index] < 2 || queued[index]) return;
    queued[index] = 1;
    stack[stackSize] = index;
    stackSize += 1;
  }

  for (let index = 0; index < count; index += 1) {
    particles[index] = random() < density ? 1 : 0;
  }
  const center = Math.floor(size / 2) * size + Math.floor(size / 2);
  particles[center] += addedParticles;
  enqueue(center);

  function advanceTo(target) {
    while (stackSize && topplings < target) {
      stackSize -= 1;
      const source = stack[stackSize];
      queued[source] = 0;
      if (particles[source] < 2) continue;

      particles[source] -= 2;
      odometer[source] += 1;
      topplings += 1;
      enqueue(source);

      const x = source % size;
      const y = Math.floor(source / size);
      for (let particle = 0; particle < 2; particle += 1) {
        const direction = Math.floor(random() * 4);
        let destination;
        if (direction === 0) destination = y * size + ((x + 1) % size);
        else if (direction === 1) destination = y * size + ((x + size - 1) % size);
        else if (direction === 2) destination = ((y + 1) % size) * size + x;
        else destination = ((y + size - 1) % size) * size + x;
        particles[destination] += 1;
        enqueue(destination);
      }
    }
  }

  return { size, seed, odometer, advanceTo };
}

function mix(first, second, amount) {
  const t = Math.max(0, Math.min(1, amount));
  return first.map((value, index) => Math.round(value + (second[index] - value) * t));
}

function sampleStops(stops, amount) {
  const scaled = Math.max(0, Math.min(1, amount)) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  return mix(stops[index], stops[index + 1], scaled - index);
}

const heat = [
  [190, 224, 232],
  [103, 177, 194],
  [69, 130, 161],
  [55, 86, 130],
  [34, 57, 97],
];

const zeroColors = [
  [211, 231, 237],
  [215, 233, 239],
  [218, 235, 240],
  [208, 228, 235],
];

function colorFor(model, index, ceiling) {
  const value = model.odometer[index];
  if (!value) {
    let hash = Math.imul(index + model.seed, 0x45d9f3b);
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    hash ^= hash >>> 16;
    return zeroColors[(hash >>> 0) % zeroColors.length];
  }
  const t = Math.pow(Math.min(1, Math.log1p(value) / Math.log1p(ceiling)), 0.68);
  return sampleStops(heat, t);
}

function render(models, ceilings, gap) {
  const size = models[0].size;
  const width = size * models.length + gap * (models.length - 1);
  const pixels = Buffer.alloc(width * size * 4);

  for (let index = 0; index < width * size; index += 1) {
    pixels[index * 4] = 105;
    pixels[index * 4 + 1] = 145;
    pixels[index * 4 + 2] = 161;
    pixels[index * 4 + 3] = 255;
  }

  models.forEach((model, panel) => {
    const left = panel * (size + gap);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const source = y * size + x;
        const output = (y * width + left + x) * 4;
        const color = colorFor(model, source, ceilings[panel]);
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
  const size = 384;
  const gap = 8;
  const growthFrames = 84;
  const holdFrames = 12;
  const specs = [
    { density: 0.58, seed: 0x13d73, added: 240, target: 100_000, ceiling: 260 },
    { density: 0.71, seed: 0x5d813, added: 240, target: 180_000, ceiling: 320 },
    { density: 0.78, seed: 0xb334b, added: 240, target: 2_400_000, ceiling: 700 },
  ];
  const models = specs.map((spec) => makeModel(size, spec.density, spec.seed, spec.added));
  const ceilings = specs.map((spec) => spec.ceiling);
  const frameDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arw-glacier-"));
  const output = path.join(__dirname, "..", "math_images", "arw_regimes_glacier.gif");

  try {
    for (let frame = 0; frame < growthFrames + holdFrames; frame += 1) {
      if (frame < growthFrames) {
        const progress = frame / (growthFrames - 1);
        specs.forEach((spec, index) => {
          models[index].advanceTo(Math.round(spec.target * progress));
        });
      }

      const rendered = render(models, ceilings, gap);
      const filename = path.join(frameDirectory, `frame-${String(frame).padStart(3, "0")}.png`);
      await sharp(rendered.pixels, {
        raw: { width: rendered.width, height: rendered.height, channels: 4 },
      }).png({ compressionLevel: 3 }).toFile(filename);
      process.stdout.write(`\rframe ${frame + 1}/${growthFrames + holdFrames}`);
    }
    process.stdout.write("\n");

    const encoding = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-framerate", "10",
      "-i", path.join(frameDirectory, "frame-%03d.png"),
      "-filter_complex",
      "split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
      "-loop", "0", output,
    ], { encoding: "utf8" });
    if (encoding.status !== 0) throw new Error(encoding.stderr || "ffmpeg failed");
    process.stdout.write(`${output}\n`);
  } finally {
    fs.rmSync(frameDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
