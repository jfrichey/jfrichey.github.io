#!/usr/bin/env node

"use strict";

const path = require("path");
const sharp = require("sharp");

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(width, height, density, seed, addedParticles, limit) {
  const random = mulberry32(seed);
  const count = width * height;
  const particles = new Uint16Array(count);
  const odometer = new Uint32Array(count);
  const queued = new Uint8Array(count);
  const stack = new Int32Array(count);

  for (let index = 0; index < count; index += 1) {
    particles[index] = random() < density ? 1 : 0;
  }

  const center = Math.floor(height / 2) * width + Math.floor(width / 2);
  particles[center] += addedParticles;
  stack[0] = center;
  queued[center] = 1;
  let stackSize = 1;
  let topplings = 0;

  const pushIfActive = (index) => {
    if (particles[index] < 2 || queued[index]) return;
    queued[index] = 1;
    stack[stackSize] = index;
    stackSize += 1;
  };

  while (stackSize && topplings < limit) {
    stackSize -= 1;
    const index = stack[stackSize];
    queued[index] = 0;
    if (particles[index] < 2) continue;

    particles[index] -= 2;
    odometer[index] += 1;
    topplings += 1;
    pushIfActive(index);

    const x = index % width;
    const y = Math.floor(index / width);
    for (let particle = 0; particle < 2; particle += 1) {
      const direction = Math.floor(random() * 4);
      let destination;
      if (direction === 0) destination = y * width + (x + 1 === width ? 0 : x + 1);
      else if (direction === 1) destination = y * width + (x === 0 ? width - 1 : x - 1);
      else if (direction === 2) destination = (y + 1 === height ? 0 : y + 1) * width + x;
      else destination = (y === 0 ? height - 1 : y - 1) * width + x;
      particles[destination] += 1;
      pushIfActive(destination);
    }
  }

  const positive = [];
  for (const value of odometer) {
    if (value) positive.push(value);
  }
  positive.sort((a, b) => a - b);

  return {
    particles,
    odometer,
    topplings,
    visited: positive.length,
    ceiling: positive[Math.floor(positive.length * 0.996)] || 1,
    settled: stackSize === 0,
  };
}

function interpolate(first, second, amount) {
  const t = Math.max(0, Math.min(1, amount));
  return first.map((value, index) => Math.round(value + (second[index] - value) * t));
}

function heatColor(value, ceiling, particleCount) {
  // Occupancy is encoded by lightness: particles are dark, empty sites are
  // light.  Hue still records the logarithmic toppling count.
  if (!value) return particleCount ? [34, 57, 70] : [178, 205, 217];
  const t = Math.pow(Math.min(1, Math.log1p(value) / Math.log1p(ceiling)), 0.68);
  let color;
  if (t < 0.26) color = interpolate([189, 218, 230], [91, 157, 181], t / 0.26);
  else if (t < 0.52) color = interpolate([91, 157, 181], [104, 113, 166], (t - 0.26) / 0.26);
  else if (t < 0.76) color = interpolate([104, 113, 166], [224, 133, 108], (t - 0.52) / 0.24);
  else color = interpolate([224, 133, 108], [244, 194, 103], (t - 0.76) / 0.24);
  if (!particleCount) return interpolate(color, [222, 235, 241], 0.12);
  return interpolate(color, particleCount > 1 ? [9, 23, 31] : [28, 48, 60], 0.5);
}

async function main() {
  // Each panel is a genuinely large periodic lattice. The same point-source
  // perturbation is used in all three backgrounds; only the density changes.
  const width = 426;
  const height = 720;
  const addedParticles = 800;
  const specs = [
    { name: "subcritical", density: 0.58, seed: 612768, limit: 6_000_000 },
    { name: "critical", density: 0.705, seed: 3649909, limit: 24_000_000 },
    { name: "supercritical", density: 0.78, seed: 14981, limit: 24_000_000 },
  ];
  const samples = specs.map((spec) =>
    simulate(width, height, spec.density, spec.seed, addedParticles, spec.limit),
  );

  samples.forEach((sample, index) => {
    const coverage = (100 * sample.visited) / (width * height);
    process.stdout.write(
      `${specs[index].name}: ${sample.topplings.toLocaleString()} topplings, `
      + `${coverage.toFixed(1)}% visited, ${sample.settled ? "settled" : "still active"}\n`,
    );
  });

  const combinedWidth = width * samples.length;
  const pixels = Buffer.alloc(combinedWidth * height * 4);
  for (let panel = 0; panel < samples.length; panel += 1) {
    const sample = samples[panel];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceIndex = y * width + x;
        const outputIndex = (y * combinedWidth + panel * width + x) * 4;
        const rgb = heatColor(
          sample.odometer[sourceIndex],
          sample.ceiling,
          sample.particles[sourceIndex],
        );
        pixels[outputIndex] = rgb[0];
        pixels[outputIndex + 1] = rgb[1];
        pixels[outputIndex + 2] = rgb[2];
        pixels[outputIndex + 3] = 255;
      }
    }
  }

  const output = path.join(__dirname, "..", "math_images", "avalanche_regimes_torus.webp");
  await sharp(pixels, { raw: { width: combinedWidth, height, channels: 4 } })
    .resize({ width: combinedWidth * 2, height: height * 2, kernel: "lanczos3" })
    .webp({ quality: 94, effort: 6 })
    .toFile(output);
  process.stdout.write(`${output}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
