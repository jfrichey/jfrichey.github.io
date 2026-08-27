(() => {
  "use strict";

  const header = document.querySelector(".site-header");
  const menuButton = document.querySelector(".menu-toggle");
  if (header && menuButton) {
    menuButton.addEventListener("click", () => {
      const open = header.classList.toggle("menu-open");
      menuButton.setAttribute("aria-expanded", String(open));
    });
    header.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        header.classList.remove("menu-open");
        menuButton.setAttribute("aria-expanded", "false");
      });
    });
  }

  const railLinks = [...document.querySelectorAll(".rail a")];
  if (railLinks.length && "IntersectionObserver" in window) {
    const targets = railLinks
      .map((link) => document.querySelector(link.getAttribute("href")))
      .filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        railLinks.forEach((link) => {
          link.classList.toggle(
            "is-current",
            link.getAttribute("href") === `#${visible.target.id}`,
          );
        });
      },
      { rootMargin: "-28% 0px -46%", threshold: [0.05, 0.2, 0.5] },
    );
    targets.forEach((target) => observer.observe(target));
  }

  const walkPalette = [
    [7, 4, 19],
    [35, 12, 86],
    [102, 22, 127],
    [190, 48, 112],
    [241, 111, 91],
    [255, 201, 106],
    [255, 244, 186],
  ];

  function randomSeed() {
    if (window.crypto?.getRandomValues) {
      const value = new Uint32Array(1);
      window.crypto.getRandomValues(value);
      return value[0];
    }
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }

  function walkColor(intensity) {
    const position = Math.max(0, Math.min(1, intensity)) * (walkPalette.length - 1);
    const low = Math.floor(position);
    const high = Math.min(low + 1, walkPalette.length - 1);
    const amount = position - low;
    return walkPalette[low].map((value, index) =>
      Math.round(value + (walkPalette[high][index] - value) * amount),
    );
  }

  function simulateWalk(canvas, star, seed, steps = 1_000_000) {
    const random = mulberry32(seed);
    const xPositions = new Int32Array(steps + 1);
    const yPositions = new Int32Array(steps + 1);
    let x = 0;
    let y = 0;
    let xmin = 0;
    let xmax = 0;
    let ymin = 0;
    let ymax = 0;

    for (let step = 1; step <= steps; step += 1) {
      const direction = Math.floor(random() * 4);
      if (direction === 0) x += 1;
      else if (direction === 1) x -= 1;
      else if (direction === 2) y += 1;
      else y -= 1;
      xPositions[step] = x;
      yPositions[step] = y;
      if (x < xmin) xmin = x;
      else if (x > xmax) xmax = x;
      if (y < ymin) ymin = y;
      else if (y > ymax) ymax = y;
    }

    const padding = Math.max(20, Math.round(0.055 * Math.max(xmax - xmin, ymax - ymin)));
    xmin -= padding;
    xmax += padding;
    ymin -= padding;
    ymax += padding;

    const targetRatio = 4 / 3;
    let width = xmax - xmin + 1;
    let height = ymax - ymin + 1;
    if (width / height < targetRatio) {
      const extra = Math.ceil(targetRatio * height - width);
      xmin -= Math.floor(extra / 2);
      xmax += Math.ceil(extra / 2);
    } else {
      const extra = Math.ceil(width / targetRatio - height);
      ymin -= Math.floor(extra / 2);
      ymax += Math.ceil(extra / 2);
    }
    width = xmax - xmin + 1;
    height = ymax - ymin + 1;

    const visits = new Uint32Array(width * height);
    for (let step = 0; step <= steps; step += 1) {
      visits[(yPositions[step] - ymin) * width + xPositions[step] - xmin] += 1;
    }

    let maximum = 0;
    let occupied = 0;
    for (const count of visits) {
      if (!count) continue;
      occupied += 1;
      if (count > maximum) maximum = count;
    }
    const histogram = new Uint32Array(maximum + 1);
    for (const count of visits) {
      if (count) histogram[count] += 1;
    }
    const target = Math.floor(occupied * 0.997);
    let cumulative = 0;
    let ceiling = 2;
    for (let count = 1; count < histogram.length; count += 1) {
      cumulative += histogram[count];
      if (cumulative >= target) {
        ceiling = Math.max(2, count);
        break;
      }
    }

    const pixels = new Uint8ClampedArray(width * height * 4);
    const logCeiling = Math.log1p(ceiling);
    for (let index = 0; index < visits.length; index += 1) {
      const count = visits[index];
      const intensity = count
        ? Math.pow(Math.min(1, Math.log1p(count) / logCeiling), 0.72)
        : 0;
      const color = walkColor(intensity);
      pixels[index * 4] = color[0];
      pixels[index * 4 + 1] = color[1];
      pixels[index * 4 + 2] = color[2];
      pixels[index * 4 + 3] = 255;
    }

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    sourceCanvas.getContext("2d").putImageData(new ImageData(pixels, width, height), 0, 0);

    canvas.width = 1200;
    canvas.height = 900;
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
    star.style.left = `${(100 * (0 - xmin)) / Math.max(1, width - 1)}%`;
    star.style.top = `${(100 * (0 - ymin)) / Math.max(1, height - 1)}%`;
    canvas.setAttribute(
      "aria-label",
      `Occupation heat map of a newly simulated million-step planar random walk`,
    );
  }

  document.querySelectorAll("[data-source-guess]").forEach((lab) => {
    const map = lab.querySelector("[data-source-map]");
    const canvas = lab.querySelector("[data-source-canvas]");
    const star = lab.querySelector(".source-star");
    const prompt = lab.querySelector(".guess-prompt");
    const rerun = lab.querySelector("[data-source-rerun]");
    if (!map || !canvas || !star) return;
    let generation = 0;

    const reveal = (shown) => {
      map.classList.toggle("is-revealed", shown);
      map.setAttribute("aria-pressed", String(shown));
      if (prompt) {
        prompt.textContent = shown
          ? "The walk began here — click to hide"
          : "Where did the walker start? Click to reveal";
      }
    };

    const generate = () => {
      generation += 1;
      const currentGeneration = generation;
      reveal(false);
      map.disabled = true;
      if (rerun) rerun.disabled = true;
      if (prompt) prompt.textContent = "Simulating a new walk…";
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          if (currentGeneration !== generation) return;
          simulateWalk(canvas, star, randomSeed());
          map.disabled = false;
          if (rerun) rerun.disabled = false;
          if (prompt) prompt.textContent = "Where did the walker start? Click to reveal";
        }, 0);
      });
    };

    map.addEventListener("click", () => {
      reveal(!map.classList.contains("is-revealed"));
    });
    rerun?.addEventListener("click", generate);
    generate();
  });

  function mulberry32(seed) {
    return function random() {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(random) {
    const u = Math.max(random(), 1e-12);
    const v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function gamma(random, shape) {
    if (shape < 1) {
      return gamma(random, shape + 1) * Math.pow(Math.max(random(), 1e-12), 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    while (true) {
      let x;
      let v;
      do {
        x = gaussian(random);
        v = 1 + c * x;
      } while (v <= 0);
      v *= v * v;
      const u = random();
      if (
        u < 1 - 0.0331 * x ** 4 ||
        Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))
      ) {
        return d * v;
      }
    }
  }

  function symmetricEigenvalues(matrix) {
    const n = matrix.length;
    const values = matrix.map((row) => Float64Array.from(row));
    for (let sweep = 0; sweep < 28; sweep += 1) {
      let largest = 0;
      for (let p = 0; p < n - 1; p += 1) {
        for (let q = p + 1; q < n; q += 1) {
          const offDiagonal = values[p][q];
          largest = Math.max(largest, Math.abs(offDiagonal));
          if (Math.abs(offDiagonal) < 1e-10) continue;
          const app = values[p][p];
          const aqq = values[q][q];
          const angle = 0.5 * Math.atan2(2 * offDiagonal, aqq - app);
          const cosine = Math.cos(angle);
          const sine = Math.sin(angle);

          for (let k = 0; k < n; k += 1) {
            if (k === p || k === q) continue;
            const akp = values[k][p];
            const akq = values[k][q];
            values[k][p] = values[p][k] = cosine * akp - sine * akq;
            values[k][q] = values[q][k] = sine * akp + cosine * akq;
          }
          values[p][p] =
            cosine * cosine * app -
            2 * sine * cosine * offDiagonal +
            sine * sine * aqq;
          values[q][q] =
            sine * sine * app +
            2 * sine * cosine * offDiagonal +
            cosine * cosine * aqq;
          values[p][q] = values[q][p] = 0;
        }
      }
      if (largest < 1e-8) break;
    }
    return values.map((row, index) => row[index]).sort((a, b) => a - b);
  }

  function goeEigenvalues(n, random) {
    const matrix = Array.from({ length: n }, () => new Float64Array(n));
    const scale = Math.sqrt(n);
    for (let row = 0; row < n; row += 1) {
      for (let column = row; column < n; column += 1) {
        const value = gaussian(random) * (row === column ? Math.SQRT2 : 1) / scale;
        matrix[row][column] = matrix[column][row] = value;
      }
    }
    return symmetricEigenvalues(matrix);
  }

  function wishartEigenvalues(n, dimension, random) {
    const lower = Array.from({ length: n }, () => new Float64Array(n));
    for (let row = 0; row < n; row += 1) {
      lower[row][row] = Math.sqrt(2 * gamma(random, (dimension - row) / 2));
      for (let column = 0; column < row; column += 1) {
        lower[row][column] = gaussian(random);
      }
    }

    const matrix = Array.from({ length: n }, () => new Float64Array(n));
    const scale = Math.sqrt(dimension * n);
    for (let row = 0; row < n; row += 1) {
      for (let column = row; column < n; column += 1) {
        let product = 0;
        for (let k = 0; k <= Math.min(row, column); k += 1) {
          product += lower[row][k] * lower[column][k];
        }
        const centered = (product - (row === column ? dimension : 0)) / scale;
        matrix[row][column] = matrix[column][row] = centered;
      }
    }
    return symmetricEigenvalues(matrix);
  }

  function fitDisplayCanvas(canvas) {
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, box.width);
    const height = Math.max(270, box.height);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { context, width, height };
  }

  function kernelDensity(values, x, bandwidth = 0.17) {
    let density = 0;
    for (const value of values) {
      const z = (x - value) / bandwidth;
      density += Math.exp(-0.5 * z * z);
    }
    return density / (values.length * bandwidth * Math.sqrt(2 * Math.PI));
  }

  document.querySelectorAll("[data-spectrum-lab]").forEach((lab, labIndex) => {
    const canvas = lab.querySelector("[data-spectrum-canvas]");
    const slider = lab.querySelector("[data-spectrum-slider]");
    const label = lab.querySelector("[data-spectrum-label]");
    if (!canvas || !slider) return;

    const ratios = [0.008, 0.02, 0.05, 0.12, 0.3, 0.75, 2, 6, 20];
    const n = 14;
    const sampleCount = 36;
    const goe = [];
    const goeRandom = mulberry32(82103 + labIndex * 193);
    for (let sample = 0; sample < sampleCount; sample += 1) {
      goe.push(...goeEigenvalues(n, goeRandom));
    }
    const wishartCache = new Map();

    const wishartAt = (index) => {
      if (wishartCache.has(index)) return wishartCache.get(index);
      const ratio = ratios[index];
      const dimension = Math.max(n + 1, Math.round(ratio * n ** 3));
      const random = mulberry32(93811 + labIndex * 251 + index * 100003);
      const values = [];
      for (let sample = 0; sample < sampleCount; sample += 1) {
        values.push(...wishartEigenvalues(n, dimension, random));
      }
      wishartCache.set(index, { dimension, values });
      return wishartCache.get(index);
    };

    const draw = () => {
      const index = Number(slider.value);
      const ratio = ratios[index];
      const { dimension, values: wishart } = wishartAt(index);
      const { context, width, height } = fitDisplayCanvas(canvas);
      const left = 54;
      const right = 22;
      const top = 38;
      const bottom = 38;
      const center = (top + height - bottom) / 2;
      const xMin = -3.15;
      const xMax = 3.55;
      const plotWidth = width - left - right;
      const xPixel = (value) => left + ((value - xMin) / (xMax - xMin)) * plotWidth;

      context.fillStyle = "#f7f2e9";
      context.fillRect(0, 0, width, height);
      context.lineWidth = 1;
      context.font = "11px Helvetica Neue, Arial, sans-serif";
      context.textBaseline = "middle";

      for (let tick = -3; tick <= 3; tick += 1) {
        const x = xPixel(tick);
        context.strokeStyle = tick === 0 ? "rgba(23,24,23,.28)" : "rgba(23,24,23,.1)";
        context.beginPath();
        context.moveTo(x, top);
        context.lineTo(x, height - bottom);
        context.stroke();
        context.fillStyle = "#666862";
        context.textAlign = "center";
        context.fillText(String(tick), x, height - 18);
      }

      context.strokeStyle = "rgba(23,24,23,.35)";
      context.beginPath();
      context.moveTo(left, center);
      context.lineTo(width - right, center);
      context.stroke();

      const steps = Math.max(160, Math.round(plotWidth / 3));
      const goeDensity = [];
      const wishartDensity = [];
      let maximum = 0;
      for (let step = 0; step <= steps; step += 1) {
        const xValue = xMin + (step / steps) * (xMax - xMin);
        const topDensity = kernelDensity(goe, xValue);
        const bottomDensity = kernelDensity(wishart, xValue);
        goeDensity.push(topDensity);
        wishartDensity.push(bottomDensity);
        maximum = Math.max(maximum, topDensity, bottomDensity);
      }
      const amplitude = (height - top - bottom) * 0.34;

      const drawDensity = (density, color, direction) => {
        context.beginPath();
        context.moveTo(left, center);
        density.forEach((value, step) => {
          const x = left + (step / steps) * plotWidth;
          const y = center + direction * (9 + (value / maximum) * amplitude);
          context.lineTo(x, y);
        });
        context.lineTo(width - right, center);
        context.closePath();
        context.fillStyle = `${color}24`;
        context.fill();
        context.beginPath();
        density.forEach((value, step) => {
          const x = left + (step / steps) * plotWidth;
          const y = center + direction * (9 + (value / maximum) * amplitude);
          if (step === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.strokeStyle = color;
        context.lineWidth = 2.2;
        context.stroke();
      };

      drawDensity(goeDensity, "#2557c7", -1);
      drawDensity(wishartDensity, "#c64d32", 1);

      const pointBand = Math.min(44, (height - top - bottom) * 0.13);
      const drawPoints = (values, color, direction, seed) => {
        const random = mulberry32(seed);
        context.fillStyle = color;
        for (const value of values) {
          if (value < xMin || value > xMax) continue;
          const y = center + direction * (11 + random() * pointBand);
          context.beginPath();
          context.arc(xPixel(value), y, 1.35, 0, Math.PI * 2);
          context.fill();
        }
      };
      drawPoints(goe, "rgba(37,87,199,.55)", -1, 1109);
      drawPoints(wishart, "rgba(198,77,50,.55)", 1, 2909 + index);

      context.font = "700 11px Helvetica Neue, Arial, sans-serif";
      context.textAlign = "left";
      context.fillStyle = "#2557c7";
      context.fillText("GOE", left, 19);
      context.fillStyle = "#c64d32";
      context.fillText("CENTERED WISHART", left + 54, 19);
      context.fillStyle = "#666862";
      context.font = "italic 12px Georgia, serif";
      context.textAlign = "right";
      context.fillText("real eigenvalue", width - right, height - 18);

      const state = index <= 2 ? "Different laws" : index <= 5 ? "Transition" : "Nearly overlapping";
      if (label) label.textContent = `${state} · d/n³ = ${ratio}`;
      canvas.setAttribute(
        "aria-label",
        `Empirical eigenvalue distributions for GOE and centered Wishart matrices with n ${n}, d ${dimension}, and d over n cubed ${ratio}`,
      );
    };

    slider.addEventListener("input", draw);
    window.addEventListener("resize", draw, { passive: true });
    draw();
  });
})();
