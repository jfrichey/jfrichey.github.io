(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function mulberry32(seed) {
    return function random() {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function mix(a, b, amount) {
    const t = clamp(amount, 0, 1);
    return a.map((value, index) => Math.round(value + (b[index] - value) * t));
  }

  function poisson(random, mean) {
    if (mean <= 0) return 0;
    const threshold = Math.exp(-mean);
    let product = 1;
    let count = 0;
    do {
      count += 1;
      product *= random();
    } while (product > threshold);
    return count - 1;
  }

  function makeModel(size, seed) {
    const count = size * size;
    const center = Math.floor(size / 2);
    const random = mulberry32(seed);
    const active = new Uint16Array(count);
    const sleeping = new Uint8Array(count);
    const odometer = new Uint32Array(count);
    const queued = new Uint8Array(count);
    const radii = new Uint8Array(count);
    const maxRadius = Math.ceil(Math.SQRT2 * center);
    const buckets = Array.from({ length: maxRadius + 1 }, () => []);
    let outerBucket = 0;
    let activeParticles = 0;
    let sleepingParticles = 0;
    let events = 0;

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const index = y * size + x;
        radii[index] = Math.min(
          maxRadius,
          Math.floor(Math.hypot(x - center, y - center)),
        );
      }
    }

    function enqueue(index) {
      if (!active[index] || queued[index]) return;
      const radius = radii[index];
      buckets[radius].push(index);
      queued[index] = 1;
      outerBucket = Math.max(outerBucket, radius);
    }

    function initializeMound() {
      const moundRadius = size * 0.16;
      for (let y = 1; y < size - 1; y += 1) {
        for (let x = 1; x < size - 1; x += 1) {
          const distance = Math.hypot(x - center, y - center);
          if (distance > moundRadius) continue;
          const profile = 1 - (distance / moundRadius) ** 2;
          const mean = 0.14 + 7.2 * profile ** 1.55;
          const particles = poisson(random, mean);
          if (!particles) continue;
          const index = y * size + x;
          active[index] = particles;
          activeParticles += particles;
          enqueue(index);
        }
      }
    }

    function popOutermost() {
      while (outerBucket >= 0) {
        const bucket = buckets[outerBucket];
        while (bucket.length) {
          const index = bucket.pop();
          queued[index] = 0;
          if (active[index]) return index;
        }
        outerBucket -= 1;
      }
      return -1;
    }

    function step() {
      if (!activeParticles) return false;
      const source = popOutermost();
      if (source < 0) return false;

      // A legal, frontier-first stabilization schedule for ARW: isolated
      // particles may sleep; otherwise one active particle makes a nearest-
      // neighbor step. The schedule changes the movie, not the final state.
      if (active[source] === 1 && random() < 0.42) {
        active[source] = 0;
        sleeping[source] = 1;
        activeParticles -= 1;
        sleepingParticles += 1;
        events += 1;
        return true;
      }

      const x = source % size;
      const y = Math.floor(source / size);
      const direction = Math.floor(random() * 4);
      const nx = direction === 0 ? x + 1 : direction === 1 ? x - 1 : x;
      const ny = direction === 2 ? y + 1 : direction === 3 ? y - 1 : y;

      active[source] -= 1;
      odometer[source] += 1;
      events += 1;
      enqueue(source);

      if (nx <= 0 || nx >= size - 1 || ny <= 0 || ny >= size - 1) {
        activeParticles -= 1;
        return true;
      }

      const destination = ny * size + nx;
      if (sleeping[destination]) {
        sleeping[destination] = 0;
        sleepingParticles -= 1;
        active[destination] += 2;
        activeParticles += 1;
      } else {
        active[destination] += 1;
      }
      enqueue(destination);
      return true;
    }

    initializeMound();
    return {
      active,
      sleeping,
      odometer,
      get activeParticles() {
        return activeParticles;
      },
      get sleepingParticles() {
        return sleepingParticles;
      },
      get events() {
        return events;
      },
      step,
    };
  }

  document.querySelectorAll("[data-home-arw]").forEach((figure, figureIndex) => {
    const canvas = figure.querySelector("[data-home-arw-canvas]");
    const context = canvas.getContext("2d");
    const size = 69;
    const imageCanvas = document.createElement("canvas");
    const imageContext = imageCanvas.getContext("2d");
    imageCanvas.width = size;
    imageCanvas.height = size;

    let run = 0;
    let model;
    let visible = true;
    let phaseStarted = performance.now();
    let settledAt = 0;
    let lastFrame = 0;

    function reset(now = performance.now()) {
      const seeds = [31091, 77237, 126271, 208049];
      model = makeModel(size, seeds[(run + figureIndex) % seeds.length]);
      phaseStarted = now;
      settledAt = 0;
      if (reducedMotion) {
        while (model.activeParticles && model.events < 500000) model.step();
      }
      draw();
    }

    function fitCanvas() {
      const box = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(320, box.width);
      const height = Math.max(230, box.height);
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      return { width, height };
    }

    function cellColor(index, maximum) {
      const active = model.active[index];
      if (active) {
        const heat = clamp(Math.log1p(active) / Math.log(8), 0, 1);
        return mix([255, 213, 104], [239, 93, 66], heat);
      }
      if (model.sleeping[index]) return [87, 166, 188];
      const visits = model.odometer[index];
      if (!visits) return [8, 17, 23];
      const trace = Math.log1p(visits) / Math.log1p(maximum);
      if (trace < 0.62) {
        return mix([15, 29, 42], [62, 55, 92], trace / 0.62);
      }
      return mix([62, 55, 92], [119, 62, 93], (trace - 0.62) / 0.38);
    }

    function draw() {
      const { width, height } = fitCanvas();
      context.fillStyle = "#081117";
      context.fillRect(0, 0, width, height);

      let maximum = 1;
      for (let index = 0; index < model.odometer.length; index += 1) {
        maximum = Math.max(maximum, model.odometer[index]);
      }
      const image = imageContext.createImageData(size, size);
      for (let index = 0; index < model.odometer.length; index += 1) {
        const color = cellColor(index, maximum);
        image.data[index * 4] = color[0];
        image.data[index * 4 + 1] = color[1];
        image.data[index * 4 + 2] = color[2];
        image.data[index * 4 + 3] = 255;
      }
      imageContext.putImageData(image, 0, 0);

      const side = Math.min(width, height) * 0.96;
      const left = (width - side) / 2;
      const top = (height - side) / 2;
      context.imageSmoothingEnabled = false;
      context.drawImage(imageCanvas, left, top, side, side);

      const vignette = context.createRadialGradient(
        width / 2,
        height / 2,
        side * 0.18,
        width / 2,
        height / 2,
        side * 0.72,
      );
      vignette.addColorStop(0, "rgba(4, 10, 14, 0)");
      vignette.addColorStop(1, "rgba(4, 10, 14, .28)");
      context.fillStyle = vignette;
      context.fillRect(left, top, side, side);
    }

    function advance(budget) {
      for (let step = 0; step < budget; step += 1) {
        if (!model.step()) break;
      }
    }

    function frame(now) {
      if (visible && !reducedMotion && now - lastFrame >= 32) {
        lastFrame = now;
        if (now - phaseStarted > 850 && model.activeParticles) {
          const budget = clamp(
            Math.round(650 + model.activeParticles * 1.45),
            850,
            2300,
          );
          advance(budget);
          draw();
        }
        if (!model.activeParticles) {
          if (!settledAt) settledAt = now;
          if (now - settledAt > 3600) {
            run += 1;
            reset(now);
          }
        } else if (now - phaseStarted > 19000 || model.events >= 500000) {
          run += 1;
          reset(now);
        }
      }
      requestAnimationFrame(frame);
    }

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          visible = entries[0].isIntersecting;
        },
        { threshold: 0.05 },
      );
      observer.observe(figure);
    }

    window.addEventListener("resize", draw, { passive: true });
    reset();
    requestAnimationFrame(frame);
  });
})();
