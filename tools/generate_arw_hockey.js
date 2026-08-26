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

class DrivenDissipativeARW {
  constructor(size, lambda, seed) {
    this.size = size;
    this.count = size * size;
    this.sleepProbability = lambda / (1 + lambda);
    this.random = mulberry32(seed);
    this.active = new Uint16Array(this.count);
    this.sleeping = new Uint8Array(this.count);
    this.queued = new Uint8Array(this.count);
    this.stack = new Int32Array(this.count);
    this.stackSize = 0;
    this.added = 0;
    this.exited = 0;
  }

  enqueue(site) {
    if (this.active[site] === 0 || this.queued[site]) return;
    this.queued[site] = 1;
    this.stack[this.stackSize] = site;
    this.stackSize += 1;
  }

  addAndStabilize() {
    const site = Math.floor(this.random() * this.count);
    this.added += 1;
    if (this.sleeping[site]) {
      this.sleeping[site] = 0;
      this.active[site] = 2;
    } else {
      this.active[site] += 1;
    }
    this.enqueue(site);
    this.stabilize();
  }

  stabilize() {
    const size = this.size;
    while (this.stackSize > 0) {
      this.stackSize -= 1;
      const site = this.stack[this.stackSize];
      this.queued[site] = 0;

      while (this.active[site] > 0) {
        // Diaconis--Fulton ARW instruction: a sleep instruction succeeds only
        // for a lone active particle; otherwise it is consumed without effect.
        if (this.random() < this.sleepProbability) {
          if (this.active[site] === 1) {
            this.active[site] = 0;
            this.sleeping[site] = 1;
            break;
          }
          continue;
        }

        this.active[site] -= 1;
        const x = site % size;
        const y = Math.floor(site / size);
        const direction = Math.floor(this.random() * 4);
        let destination = -1;
        if (direction === 0 && x + 1 < size) destination = site + 1;
        else if (direction === 1 && x > 0) destination = site - 1;
        else if (direction === 2 && y + 1 < size) destination = site + size;
        else if (direction === 3 && y > 0) destination = site - size;

        if (destination < 0) {
          this.exited += 1;
          continue;
        }

        if (this.sleeping[destination]) {
          this.sleeping[destination] = 0;
          this.active[destination] = 2;
        } else {
          this.active[destination] += 1;
        }
        this.enqueue(destination);
      }
    }
  }

  snapshot() {
    return {
      sleeping: Uint8Array.from(this.sleeping),
      added: this.added,
      retained: this.added - this.exited,
    };
  }
}

const palette = [
  [0.00, [239, 247, 249]],
  [0.15, [221, 238, 242]],
  [0.30, [190, 220, 228]],
  [0.45, [143, 191, 205]],
  [0.55, [105, 162, 183]],
  [0.62, [79, 127, 164]],
  [0.68, [61, 95, 139]],
  [0.75, [42, 67, 105]],
  [0.85, [29, 45, 76]],
  [1.00, [22, 31, 52]],
];

function colorForDensity(value) {
  const density = Math.max(0, Math.min(1, value));
  let index = 0;
  while (index + 1 < palette.length && density > palette[index + 1][0]) index += 1;
  if (index === palette.length - 1) return palette[index][1];
  const [leftPosition, left] = palette[index];
  const [rightPosition, right] = palette[index + 1];
  const amount = (density - leftPosition) / (rightPosition - leftPosition);
  return left.map((component, channel) => (
    Math.round(component + amount * (right[channel] - component))
  ));
}

function localDensityRaster(sleeping, size, radius) {
  const stride = size + 1;
  const integral = new Uint32Array(stride * stride);
  for (let y = 0; y < size; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < size; x += 1) {
      rowSum += sleeping[y * size + x];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowSum;
    }
  }

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(size, y + radius + 1);
    for (let x = 0; x < size; x += 1) {
      const left = Math.max(0, x - radius);
      const right = Math.min(size, x + radius + 1);
      const sum = integral[bottom * stride + right]
        - integral[top * stride + right]
        - integral[bottom * stride + left]
        + integral[top * stride + left];
      const area = (right - left) * (bottom - top);
      const color = colorForDensity(sum / area);
      const output = (y * size + x) * 4;
      pixels[output] = color[0];
      pixels[output + 1] = color[1];
      pixels[output + 2] = color[2];
      pixels[output + 3] = 255;
    }
  }
  return pixels;
}

function plotPoint(sample, siteCount, plot) {
  return {
    x: plot.left + (sample.added / siteCount / plot.xMax) * plot.width,
    y: plot.bottom - (sample.retained / siteCount / plot.yMax) * plot.height,
  };
}

function overlayFor(samples, sampleIndex, size, width, height) {
  const siteCount = size * size;
  const plot = { left: 693, bottom: 544, width: 415, height: 420, xMax: 1.5, yMax: 0.82 };
  const line = samples.slice(0, sampleIndex + 1).map((sample) => {
    const point = plotPoint(sample, siteCount, plot);
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }).join(" ");
  const horizontalRules = [0.2, 0.4, 0.6, 0.8].map((density) => {
    const y = plot.bottom - (density / plot.yMax) * plot.height;
    return `<line x1="${plot.left}" y1="${y}" x2="${plot.left + plot.width}" y2="${y}" class="rule"/>`;
  }).join("");

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <style>
        .axis{font:600 18px Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;fill:#506a79}
        .rule{stroke:#d5e3e9;stroke-width:1.2}
      </style>
      <rect x="45" y="67" width="536" height="536" rx="10" fill="none" stroke="#a9c3d1" stroke-width="2"/>
      <rect x="640" y="67" width="516" height="536" rx="10" fill="#f8fbfc" stroke="#a9c3d1" stroke-width="2"/>
      ${horizontalRules}
      <line x1="${plot.left}" y1="${plot.bottom}" x2="${plot.left + plot.width}" y2="${plot.bottom}" stroke="#587485" stroke-width="2"/>
      <line x1="${plot.left}" y1="${plot.bottom}" x2="${plot.left}" y2="${plot.bottom - plot.height}" stroke="#587485" stroke-width="2"/>
      <polyline points="${line}" fill="none" stroke="#c95449" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      <text class="axis" x="${plot.left + plot.width / 2}" y="584" text-anchor="middle">time</text>
      <text class="axis" x="661" y="${plot.bottom - plot.height / 2}" text-anchor="middle" transform="rotate(-90 661 ${plot.bottom - plot.height / 2})">density</text>
    </svg>
  `);
}

async function main() {
  const size = 128;
  const radius = Math.ceil(Math.log2(size));
  const targetDensity = 1.5;
  const growthFrames = 120;
  const holdFrames = 14;
  const model = new DrivenDissipativeARW(size, 1, 0xa41c927);
  const targetAdditions = Math.round(targetDensity * model.count);
  const samples = [model.snapshot()];

  for (let frame = 1; frame < growthFrames; frame += 1) {
    const target = Math.round((frame / (growthFrames - 1)) * targetAdditions);
    while (model.added < target) model.addAndStabilize();
    samples.push(model.snapshot());
    process.stdout.write(`\rsimulating ${frame}/${growthFrames - 1}`);
  }
  process.stdout.write("\n");
  const finalSample = samples[samples.length - 1];
  process.stdout.write(
    `final retained density ${(finalSample.retained / model.count).toFixed(3)}; `
    + `smoothing window ${2 * radius + 1} x ${2 * radius + 1}\n`,
  );

  const frameWidth = 1200;
  const frameHeight = 675;
  const heatmapSize = 520;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arw-hockey-"));
  const outputDirectory = path.join(__dirname, "..", "math_images");
  const gifOutput = path.join(outputDirectory, "arw_hockey.gif");
  const stillOutput = path.join(outputDirectory, "arw_hockey_static.webp");

  try {
    let finalFrame;
    for (let frame = 0; frame < growthFrames + holdFrames; frame += 1) {
      const sampleIndex = Math.min(frame, growthFrames - 1);
      const sample = samples[sampleIndex];
      const densityPixels = localDensityRaster(sample.sleeping, size, radius);
      const densityImage = await sharp(densityPixels, {
        raw: { width: size, height: size, channels: 4 },
      }).resize(heatmapSize, heatmapSize, { kernel: "cubic" }).png({ compressionLevel: 3 }).toBuffer();
      const overlay = overlayFor(samples, sampleIndex, size, frameWidth, frameHeight);
      const filename = path.join(directory, `frame-${String(frame).padStart(3, "0")}.png`);

      await sharp({
        create: { width: frameWidth, height: frameHeight, channels: 4, background: "#eaf4f8" },
      }).composite([
        { input: densityImage, left: 53, top: 75 },
        { input: overlay, left: 0, top: 0 },
      ]).png({ compressionLevel: 3 }).toFile(filename);
      finalFrame = filename;
      process.stdout.write(`\rrendering ${frame + 1}/${growthFrames + holdFrames}`);
    }
    process.stdout.write("\n");

    await sharp(finalFrame).resize(896, 504, { fit: "fill", kernel: "lanczos3" })
      .webp({ quality: 88, effort: 5 }).toFile(stillOutput);

    const encoding = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-framerate", "10",
      "-i", path.join(directory, "frame-%03d.png"),
      "-filter_complex",
      "fps=8,scale=896:504:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=80:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
      "-loop", "0", gifOutput,
    ], { encoding: "utf8" });
    if (encoding.status !== 0) throw new Error(encoding.stderr || "ffmpeg failed");
    process.stdout.write(`${gifOutput}\n${stillOutput}\n`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
