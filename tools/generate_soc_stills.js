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

function simulate(n, density, seed, addedParticles = 4, limit = 2_000_000) {
  const random = mulberry32(seed);
  const count = n * n;
  const height = new Uint16Array(count);
  const odometer = new Uint32Array(count);
  const queued = new Uint8Array(count);
  const stack = new Int32Array(count);

  for (let index = 0; index < count; index += 1) {
    height[index] = random() < density ? 1 : 0;
  }

  const center = Math.floor(n / 2) * n + Math.floor(n / 2);
  height[center] += addedParticles;
  stack[0] = center;
  queued[center] = 1;
  let stackSize = 1;
  let topplings = 0;

  const pushIfActive = (index) => {
    if (height[index] < 2 || queued[index]) return;
    queued[index] = 1;
    stack[stackSize] = index;
    stackSize += 1;
  };

  while (stackSize && topplings < limit) {
    stackSize -= 1;
    const index = stack[stackSize];
    queued[index] = 0;
    if (height[index] < 2) continue;

    height[index] -= 2;
    odometer[index] += 1;
    topplings += 1;
    pushIfActive(index);

    const x = index % n;
    const y = Math.floor(index / n);
    for (let particle = 0; particle < 2; particle += 1) {
      const direction = Math.floor(random() * 4);
      let destination;
      if (direction === 0) destination = y * n + (x + 1 === n ? 0 : x + 1);
      else if (direction === 1) destination = y * n + (x === 0 ? n - 1 : x - 1);
      else if (direction === 2) destination = (y + 1 === n ? 0 : y + 1) * n + x;
      else destination = (y === 0 ? n - 1 : y - 1) * n + x;
      height[destination] += 1;
      pushIfActive(destination);
    }
  }

  const positive = [];
  for (const value of odometer) if (value) positive.push(value);
  positive.sort((a, b) => a - b);
  return {
    odometer,
    topplings,
    visited: positive.length,
    ceiling: positive[Math.floor(positive.length * 0.995)] || 1,
    settled: stackSize === 0,
  };
}

function interpolate(first, second, amount) {
  const t = Math.max(0, Math.min(1, amount));
  return first.map((value, index) => Math.round(value + (second[index] - value) * t));
}

function color(value, ceiling) {
  if (!value) return [7, 18, 26];
  const t = Math.pow(
    Math.min(1, Math.log1p(value) / Math.log1p(ceiling)),
    0.76,
  );
  if (t < 0.32) return interpolate([25, 44, 79], [62, 76, 139], t / 0.32);
  if (t < 0.62) return interpolate([62, 76, 139], [150, 66, 118], (t - 0.32) / 0.3);
  if (t < 0.84) return interpolate([150, 66, 118], [224, 91, 61], (t - 0.62) / 0.22);
  return interpolate([224, 91, 61], [255, 221, 121], (t - 0.84) / 0.16);
}

async function main() {
  const n = 320;
  const density = 0.705;
  const gap = 4;
  const seeds = [612768, 3649909];
  const samples = seeds.map((seed) => simulate(n, density, seed));
  samples.forEach((sample, index) => {
    if (!sample.settled) throw new Error(`sample ${index + 1} did not settle`);
    process.stdout.write(
      `sample ${index + 1}: ${sample.topplings.toLocaleString()} topplings, `
      + `${sample.visited.toLocaleString()} visited sites\n`,
    );
  });

  const width = n * samples.length + gap;
  const pixels = Buffer.alloc(width * n * 4);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const outputIndex = (y * width + x) * 4;
      let rgb = [7, 18, 26];
      if (x < n) rgb = color(samples[0].odometer[y * n + x], samples[0].ceiling);
      else if (x >= n + gap) {
        const sourceX = x - n - gap;
        rgb = color(samples[1].odometer[y * n + sourceX], samples[1].ceiling);
      }
      pixels[outputIndex] = rgb[0];
      pixels[outputIndex + 1] = rgb[1];
      pixels[outputIndex + 2] = rgb[2];
      pixels[outputIndex + 3] = 255;
    }
  }

  const output = path.join(__dirname, "..", "math_images", "soc_avalanches.webp");
  await sharp(pixels, { raw: { width, height: n, channels: 4 } })
    .resize({ width: 2048, kernel: "lanczos3" })
    .webp({ quality: 94, effort: 6 })
    .toFile(output);
  process.stdout.write(`${output}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
