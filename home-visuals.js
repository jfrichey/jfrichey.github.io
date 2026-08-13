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

  function mix(a, b, amount) {
    const t = Math.max(0, Math.min(1, amount));
    return a.map((value, index) => Math.round(value + (b[index] - value) * t));
  }

  function makeSandpile(n, density, seed, addedParticles = 10) {
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

    return {
      n,
      density,
      random,
      height,
      odometer,
      queued,
      stack,
      stackSize: 1,
      topplings: 0,
      center,
      settled: false,
    };
  }

  function pushIfActive(model, index) {
    if (model.height[index] < 2 || model.queued[index]) return;
    model.queued[index] = 1;
    model.stack[model.stackSize] = index;
    model.stackSize += 1;
  }

  function topple(model) {
    if (!model.stackSize) {
      model.settled = true;
      return false;
    }

    model.stackSize -= 1;
    const index = model.stack[model.stackSize];
    model.queued[index] = 0;
    if (model.height[index] < 2) return true;

    model.height[index] -= 2;
    model.odometer[index] += 1;
    model.topplings += 1;
    pushIfActive(model, index);

    const x = index % model.n;
    const y = Math.floor(index / model.n);
    for (let particle = 0; particle < 2; particle += 1) {
      const direction = Math.floor(model.random() * 4);
      let destination;
      if (direction === 0) destination = y * model.n + (x + 1 === model.n ? 0 : x + 1);
      else if (direction === 1) destination = y * model.n + (x === 0 ? model.n - 1 : x - 1);
      else if (direction === 2) destination = (y + 1 === model.n ? 0 : y + 1) * model.n + x;
      else destination = (y === 0 ? model.n - 1 : y - 1) * model.n + x;

      model.height[destination] += 1;
      pushIfActive(model, destination);
    }
    return true;
  }

  function advance(model, budget) {
    for (let step = 0; step < budget; step += 1) {
      if (!topple(model)) break;
    }
  }

  function traceColor(odometer, height, maximum) {
    if (!odometer) return height ? [19, 34, 41] : [10, 20, 26];
    const t = Math.log1p(odometer) / Math.max(1, Math.log1p(maximum));
    if (t < 0.48) return mix([38, 72, 119], [108, 73, 128], t / 0.48);
    if (t < 0.78) return mix([108, 73, 128], [202, 77, 48], (t - 0.48) / 0.3);
    return mix([202, 77, 48], [255, 224, 126], (t - 0.78) / 0.22);
  }

  document.querySelectorAll("[data-home-soc-lab]").forEach((lab) => {
    const canvas = lab.querySelector("[data-home-soc-canvas]");
    const toggle = lab.querySelector("[data-home-soc-toggle]");
    const context = canvas.getContext("2d");
    const n = 51;
    const panelSpecs = [
      {
        density: 0.55,
        seeds: [254589, 464047, 778234],
        label: "subcritical",
        rho: "ρ = 0.55",
        budget: 4,
      },
      {
        density: 0.7,
        seeds: [45131, 359318, 464047, 673505, 778234],
        label: "critical window",
        rho: "ρ ≈ ρc",
        budget: 20,
      },
      {
        density: 0.76,
        seeds: [149860, 254589, 359318],
        label: "supercritical",
        rho: "ρ = 0.76",
        budget: 34,
      },
    ];
    const imageCanvases = panelSpecs.map(() => {
      const imageCanvas = document.createElement("canvas");
      imageCanvas.width = n;
      imageCanvas.height = n;
      return imageCanvas;
    });
    let models = [];
    let playing = !reducedMotion;
    let visible = true;
    let startedAt = performance.now();
    let lastFrame = 0;
    let run = 0;

    function reset() {
      models = panelSpecs.map((spec) =>
        makeSandpile(n, spec.density, spec.seeds[run % spec.seeds.length]),
      );
      startedAt = performance.now();
      if (reducedMotion) {
        advance(models[0], 340);
        advance(models[1], 5200);
        advance(models[2], 7600);
      }
      draw();
    }

    function fitCanvas() {
      const box = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(330, box.width);
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

    function paintModel(model, imageCanvas) {
      const imageContext = imageCanvas.getContext("2d");
      const image = imageContext.createImageData(n, n);
      let maximum = 1;
      for (let index = 0; index < model.odometer.length; index += 1) {
        maximum = Math.max(maximum, model.odometer[index]);
      }
      for (let index = 0; index < model.odometer.length; index += 1) {
        const active = model.height[index] >= 2;
        const color = active
          ? [255, 242, 166]
          : traceColor(model.odometer[index], model.height[index], maximum);
        image.data[index * 4] = color[0];
        image.data[index * 4 + 1] = color[1];
        image.data[index * 4 + 2] = color[2];
        image.data[index * 4 + 3] = 255;
      }
      imageContext.putImageData(image, 0, 0);
    }

    function draw() {
      const { width, height } = fitCanvas();
      context.fillStyle = "#0a141a";
      context.fillRect(0, 0, width, height);

      const outer = Math.max(9, width * 0.018);
      const gap = Math.max(5, width * 0.009);
      const labelHeight = 43;
      const panelWidth = (width - outer * 2 - gap * 2) / 3;
      const side = Math.min(panelWidth, height - labelHeight - outer * 1.35);
      const top = labelHeight;

      models.forEach((model, index) => {
        paintModel(model, imageCanvases[index]);
        const left = outer + index * (panelWidth + gap) + (panelWidth - side) / 2;
        context.imageSmoothingEnabled = false;
        context.drawImage(imageCanvases[index], left, top, side, side);

        context.strokeStyle = "rgba(255, 255, 255, .16)";
        context.lineWidth = 1;
        context.strokeRect(left + 0.5, top + 0.5, side - 1, side - 1);

        context.fillStyle = "rgba(244, 240, 232, .62)";
        context.font = "600 9px Helvetica Neue, Arial, sans-serif";
        context.textAlign = "left";
        context.textBaseline = "middle";
        context.fillText(panelSpecs[index].label.toUpperCase(), left, 16);
        context.fillStyle = index === 1 ? "#ffcf72" : "rgba(244, 240, 232, .88)";
        context.font = "italic 13px Georgia, serif";
        context.fillText(panelSpecs[index].rho, left, 31);

        if (model.settled) {
          context.fillStyle = "rgba(8, 16, 21, .68)";
          context.fillRect(left, top + side - 20, side, 20);
          context.fillStyle = "rgba(244, 240, 232, .78)";
          context.font = "600 8px Helvetica Neue, Arial, sans-serif";
          context.textAlign = "center";
          context.fillText("SETTLED", left + side / 2, top + side - 10);
        }
      });
      context.textAlign = "left";
    }

    function frame(now) {
      if (playing && visible && now - lastFrame >= 31) {
        lastFrame = now;
        models.forEach((model, index) => advance(model, panelSpecs[index].budget));
        draw();
        if (now - startedAt > 14500) {
          run += 1;
          reset();
        }
      }
      requestAnimationFrame(frame);
    }

    toggle.addEventListener("click", () => {
      if (reducedMotion) {
        run += 1;
        reset();
        toggle.textContent = "New run";
        return;
      }
      playing = !playing;
      toggle.setAttribute("aria-pressed", String(playing));
      toggle.textContent = playing ? "Pause" : "Play";
    });

    canvas.addEventListener("click", () => {
      run += 1;
      reset();
    });

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
      }, { threshold: 0.05 });
      observer.observe(lab);
    }

    window.addEventListener("resize", draw, { passive: true });
    if (reducedMotion) {
      toggle.setAttribute("aria-pressed", "false");
      toggle.textContent = "New run";
    }
    reset();
    requestAnimationFrame(frame);
  });
})();
