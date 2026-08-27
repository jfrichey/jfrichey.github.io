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

function heatColor(value, ceiling, index, seed) {
  // This figure records only the odometer. Zero-odometer sites receive a very
  // narrow iid band of pale blues, while positive values run down a single
  // logarithmic glacier scale. Initial and final occupancy are deliberately
  // not encoded.
  if (!value) {
    const zeroColors = [
      [211, 231, 237],
      [215, 233, 239],
      [218, 235, 240],
      [208, 228, 235],
    ];
    let hash = Math.imul(index + seed, 0x45d9f3b);
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    hash ^= hash >>> 16;
    return zeroColors[(hash >>> 0) % zeroColors.length];
  }
  const t = Math.pow(Math.min(1, Math.log1p(value) / Math.log1p(ceiling)), 0.68);
  if (t < 0.25) return interpolate([190, 224, 232], [103, 177, 194], t / 0.25);
  if (t < 0.5) return interpolate([103, 177, 194], [69, 130, 161], (t - 0.25) / 0.25);
  if (t < 0.75) return interpolate([69, 130, 161], [55, 86, 130], (t - 0.5) / 0.25);
  return interpolate([55, 86, 130], [34, 57, 97], (t - 0.75) / 0.25);
}

async function main() {
  // Each panel is a genuinely large periodic lattice. The same point-source
  // perturbation is used in all three backgrounds; only the density changes.
  const width = 720;
  const height = 720;
  const addedParticles = 1200;
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

  const gap = 8;
  const combinedWidth = width * samples.length + gap * (samples.length - 1);
  const pixels = Buffer.alloc(combinedWidth * height * 4);
  for (let index = 0; index < combinedWidth * height; index += 1) {
    pixels[index * 4] = 105;
    pixels[index * 4 + 1] = 145;
    pixels[index * 4 + 2] = 161;
    pixels[index * 4 + 3] = 255;
  }
  for (let panel = 0; panel < samples.length; panel += 1) {
    const sample = samples[panel];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceIndex = y * width + x;
        const outputIndex = (y * combinedWidth + panel * (width + gap) + x) * 4;
        const rgb = heatColor(
          sample.odometer[sourceIndex],
          sample.ceiling,
          sourceIndex,
          specs[panel].seed,
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
    .webp({ quality: 94, effort: 6 })
    .toFile(output);
  process.stdout.write(`${output}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
