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

  function randomSeed() {
    if (window.crypto?.getRandomValues) {
      const value = new Uint32Array(1);
      window.crypto.getRandomValues(value);
      return value[0];
    }
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }

  function makeSandpile(width, height, density, seed, addedParticles = 22) {
    const random = mulberry32(seed);
    const count = width * height;
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
    const center = Math.floor(height / 2) * width + Math.floor(width / 2);
    particles[center] += addedParticles;
    enqueue(center);

    function topple() {
      if (!stackSize) return false;
      stackSize -= 1;
      const source = stack[stackSize];
      queued[source] = 0;
      if (particles[source] < 2) return true;

      particles[source] -= 2;
      odometer[source] += 1;
      topplings += 1;
      enqueue(source);

      const x = source % width;
      const y = Math.floor(source / width);
      for (let particle = 0; particle < 2; particle += 1) {
        const direction = Math.floor(random() * 4);
        let destination;
        if (direction === 0) destination = y * width + ((x + 1) % width);
        else if (direction === 1) destination = y * width + ((x + width - 1) % width);
        else if (direction === 2) destination = ((y + 1) % height) * width + x;
        else destination = ((y + height - 1) % height) * width + x;
        particles[destination] += 1;
        enqueue(destination);
      }
      return true;
    }

    return {
      width,
      height,
      particles,
      odometer,
      get settled() {
        return stackSize === 0;
      },
      get topplings() {
        return topplings;
      },
      topple,
    };
  }

  function advance(model, budget) {
    for (let step = 0; step < budget; step += 1) {
      if (!model.topple()) break;
    }
  }

  function cellColor(odometer, particles) {
    if (!odometer) return particles ? [34, 57, 70] : [178, 205, 217];
    const heat = clamp(Math.log1p(odometer) / Math.log(82), 0, 1);
    let color;
    if (heat < 0.34) color = mix([189, 218, 230], [91, 157, 181], heat / 0.34);
    else if (heat < 0.64) color = mix([91, 157, 181], [104, 113, 166], (heat - 0.34) / 0.3);
    else if (heat < 0.84) color = mix([104, 113, 166], [224, 133, 108], (heat - 0.64) / 0.2);
    else color = mix([224, 133, 108], [244, 194, 103], (heat - 0.84) / 0.16);
    if (!particles) return mix(color, [222, 235, 241], 0.12);
    return mix(color, particles > 1 ? [9, 23, 31] : [28, 48, 60], 0.5);
  }

  document.querySelectorAll("[data-regime-visual]").forEach((visual, visualIndex) => {
    const canvas = visual.querySelector("canvas");
    const rerunButton = visual.querySelector("[data-regime-rerun]");
    const context = canvas.getContext("2d");
    const gridWidth = 60;
    const gridHeight = 100;
    const specs = [
      { density: 0.58, label: "subcritical", rho: "ρ = 0.58", budget: 1 },
      { density: 0.71, label: "critical window", rho: "ρ≈ρ", rhoSubscript: "c", rhoSuffix: "(ℤ²)≈0.72", budget: 5 },
      { density: 0.78, label: "supercritical", rho: "ρ = 0.78", budget: 10 },
    ];
    const imageCanvases = specs.map(() => {
      const imageCanvas = document.createElement("canvas");
      imageCanvas.width = gridWidth;
      imageCanvas.height = gridHeight;
      return imageCanvas;
    });

    let models = [];
    let run = 0;
    let visible = true;
    let startedAt = performance.now();
    let lastFrame = 0;

    function reset(now = performance.now()) {
      const seed = (randomSeed() + visualIndex * 0x9e3779b9 + run * 0x85ebca6b) >>> 0;
      models = specs.map((spec, index) =>
        makeSandpile(
          gridWidth,
          gridHeight,
          spec.density,
          (seed + index * 0x27d4eb2d) >>> 0,
        ),
      );
      startedAt = now;
      if (reducedMotion) {
        advance(models[0], 2200);
        advance(models[1], 12000);
        advance(models[2], 22000);
      }
      draw();
    }

    function fitCanvas() {
      const box = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(330, box.width);
      const height = Math.max(250, box.height);
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      return { width, height };
    }

    function paintModel(model, imageCanvas) {
      const imageContext = imageCanvas.getContext("2d");
      const image = imageContext.createImageData(gridWidth, gridHeight);
      for (let index = 0; index < model.odometer.length; index += 1) {
        const color = cellColor(model.odometer[index], model.particles[index]);
        image.data[index * 4] = color[0];
        image.data[index * 4 + 1] = color[1];
        image.data[index * 4 + 2] = color[2];
        image.data[index * 4 + 3] = 255;
      }
      imageContext.putImageData(image, 0, 0);
    }

    function draw() {
      const { width, height } = fitCanvas();
      context.fillStyle = "#071016";
      context.fillRect(0, 0, width, height);
      const panelWidth = width / 3;

      models.forEach((model, index) => {
        paintModel(model, imageCanvases[index]);
        const left = index * panelWidth;
        context.imageSmoothingEnabled = false;
        context.drawImage(imageCanvases[index], left, 0, panelWidth + 0.5, height);

        if (index) {
          context.fillStyle = "rgba(255,255,255,.2)";
          context.fillRect(left - 1, 0, 2, height);
        }
        context.font = "italic 10px Georgia, serif";
        let rhoWidth = context.measureText(specs[index].rho).width;
        if (specs[index].rhoSubscript) {
          context.font = "italic 7px Georgia, serif";
          rhoWidth += context.measureText(specs[index].rhoSubscript).width + 1;
          context.font = "italic 10px Georgia, serif";
          rhoWidth += context.measureText(specs[index].rhoSuffix).width + 1;
        }
        const headingWidth = context.measureText(specs[index].label.toUpperCase()).width;
        const labelWidth = Math.min(panelWidth - 16, Math.max(86, rhoWidth + 16, headingWidth + 16));
        context.fillStyle = "rgba(5, 12, 18, .78)";
        context.fillRect(left + 8, 9, labelWidth, 40);
        context.fillStyle = "rgba(255,255,255,.76)";
        context.font = "700 9px Helvetica Neue, Arial, sans-serif";
        context.textAlign = "left";
        context.textBaseline = "middle";
        context.fillText(specs[index].label.toUpperCase(), left + 16, 21);
        context.fillStyle = index === 1 ? "#ffd36e" : "rgba(255,255,255,.92)";
        context.font = "italic 10px Georgia, serif";
        const rhoX = left + 16;
        context.fillText(specs[index].rho, rhoX, 37);
        if (specs[index].rhoSubscript) {
          const rhoWidth = context.measureText(specs[index].rho).width;
          context.font = "italic 7px Georgia, serif";
          context.fillText(specs[index].rhoSubscript, rhoX + rhoWidth + 1, 41);
          const subscriptWidth = context.measureText(specs[index].rhoSubscript).width;
          context.font = "italic 10px Georgia, serif";
          context.fillText(specs[index].rhoSuffix, rhoX + rhoWidth + subscriptWidth + 2, 37);
        }

        if (model.settled && index < 2) {
          context.fillStyle = "rgba(5, 12, 18, .72)";
          context.fillRect(left + 8, height - 27, 58, 18);
          context.fillStyle = "rgba(255,255,255,.74)";
          context.font = "700 8px Helvetica Neue, Arial, sans-serif";
          context.fillText("SETTLED", left + 15, height - 18);
        }
      });
    }

    function frame(now) {
      if (visible && !reducedMotion && now - lastFrame >= 42) {
        lastFrame = now;
        if (now - startedAt > 1300) {
          models.forEach((model, index) => advance(model, specs[index].budget));
          draw();
        }
        if (now - startedAt > 30000) {
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
        { threshold: 0.04 },
      );
      observer.observe(visual);
    }

    window.addEventListener("resize", draw, { passive: true });
    rerunButton?.addEventListener("click", () => {
      run += 1;
      reset();
    });
    reset();
    requestAnimationFrame(frame);
  });
})();
