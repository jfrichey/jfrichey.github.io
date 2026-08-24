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

  document.querySelectorAll("[data-slideshow]").forEach((slideshow) => {
    const slides = [...slideshow.querySelectorAll("[data-slide]")];
    const previous = slideshow.querySelector("[data-slide-prev]");
    const next = slideshow.querySelector("[data-slide-next]");
    const counter = slideshow.querySelector("[data-slide-counter]");
    const title = slideshow.querySelector("[data-slide-title]");
    const caption = slideshow.querySelector("[data-slide-caption]");
    if (!slides.length) return;
    let selected = Math.max(0, slides.findIndex((slide) => !slide.hidden));

    const select = (index) => {
      selected = (index + slides.length) % slides.length;
      slides.forEach((slide, slideIndex) => {
        const active = slideIndex === selected;
        slide.hidden = !active;
        slide.setAttribute("aria-hidden", String(!active));
      });
      const active = slides[selected];
      if (counter) counter.textContent = `${selected + 1} / ${slides.length}`;
      if (title) title.textContent = active.dataset.title || "";
      if (caption) caption.textContent = active.dataset.caption || "";
      window.dispatchEvent(new Event("resize"));
    };

    previous?.addEventListener("click", () => select(selected - 1));
    next?.addEventListener("click", () => select(selected + 1));
    select(selected);
  });

  const walkSamples = [
    { src: "math_images/random_walk_source.webp", x: 50.82, y: 49.232 },
    { src: "math_images/random_walk_source_2.webp", x: 86.9716, y: 53.5623 },
    { src: "math_images/random_walk_source_3.webp", x: 59.5638, y: 40.1547 },
    { src: "math_images/random_walk_source_4.webp", x: 56.3241, y: 75.0575 },
  ];

  document.querySelectorAll("[data-source-guess]").forEach((lab) => {
    const map = lab.querySelector("[data-source-map]");
    const image = lab.querySelector("img");
    const star = lab.querySelector(".source-star");
    const prompt = lab.querySelector(".guess-prompt");
    const rerun = lab.querySelector("[data-source-rerun]");
    if (!map || !image || !star) return;
    let sample = 0;

    const reveal = (shown) => {
      map.classList.toggle("is-revealed", shown);
      map.setAttribute("aria-pressed", String(shown));
      if (prompt) {
        prompt.textContent = shown
          ? "The walk began here — click to hide"
          : "Where did the walker start? Click to reveal";
      }
    };

    const showSample = (index) => {
      sample = (index + walkSamples.length) % walkSamples.length;
      const nextSample = walkSamples[sample];
      image.src = nextSample.src;
      image.alt = `Occupation heat map of four-million-step planar random walk sample ${sample + 1}`;
      star.style.left = `${nextSample.x}%`;
      star.style.top = `${nextSample.y}%`;
      reveal(false);
    };

    map.addEventListener("click", () => {
      reveal(!map.classList.contains("is-revealed"));
    });
    rerun?.addEventListener("click", () => showSample(sample + 1));
    showSample(0);
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
