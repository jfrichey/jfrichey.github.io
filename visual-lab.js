(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function mixColor(a, b, t) {
    const s = clamp(t, 0, 1);
    return a.map((value, index) => Math.round(value + (b[index] - value) * s));
  }

  function fitCanvas(canvas) {
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(300, box.width);
    const height = Math.max(280, box.height);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, width, height, ratio };
  }

  function formatCount(value) {
    return new Intl.NumberFormat("en-US").format(value);
  }

  // ---------------------------------------------------------------------------
  // Finite-volume activated random walk
  // ---------------------------------------------------------------------------

  document.querySelectorAll("[data-arw-lab]").forEach((lab, labIndex) => {
    const canvas = lab.querySelector("[data-arw-canvas]");
    const playButton = lab.querySelector("[data-arw-play]");
    const newButton = lab.querySelector("[data-arw-new]");
    const eventsOutput = document.querySelector("[data-arw-events]");
    const activeOutput = document.querySelector("[data-arw-active]");
    const wokenOutput = document.querySelector("[data-arw-woken]");
    const n = 47;
    const sleepProbability = 0.35;
    let realization = 0;
    let random;
    let particles;
    let sleepingAt;
    let activeCount;
    let activeIds;
    let odometer;
    let events;
    let woken;
    let playing = !reducedMotion;
    let visible = true;
    let lastMetricUpdate = 0;

    function addParticle(x, y, active) {
      const id = particles.length;
      particles.push({ x, y, active, alive: true });
      const index = y * n + x;
      if (active) {
        activeIds.push(id);
        activeCount[index] += 1;
      } else {
        sleepingAt[index] = id + 1;
      }
    }

    function initialize(seed) {
      random = mulberry32(seed);
      particles = [];
      sleepingAt = new Int32Array(n * n);
      activeCount = new Uint16Array(n * n);
      activeIds = [];
      odometer = new Uint32Array(n * n);
      events = 0;
      woken = 0;
      const center = Math.floor(n / 2);

      for (let y = 1; y < n - 1; y += 1) {
        for (let x = 1; x < n - 1; x += 1) {
          const radius = Math.hypot(x - center, y - center) / center;
          const density = 0.55 - 0.08 * radius;
          if ((x !== center || y !== center) && random() < density) {
            addParticle(x, y, false);
          }
        }
      }
      for (let i = 0; i < 6; i += 1) addParticle(center, center, true);
    }

    function reset() {
      const baseSeed = 45131 + labIndex * 101 + realization * 7919;
      let chosenSeed = baseSeed;
      let fallbackSeed = baseSeed;
      let fallbackScore = -Infinity;

      // Rejection-sample the random seed so the displayed avalanche is large
      // enough to have shape, but not so large that it fills the whole box.
      for (let attempt = 0; attempt < 36; attempt += 1) {
        const candidateSeed = baseSeed + attempt * 104729;
        initialize(candidateSeed);
        while (activeIds.length && events < 16000) step();
        let visitedSites = 0;
        for (let i = 0; i < odometer.length; i += 1) visitedSites += odometer[i] > 0 ? 1 : 0;
        const score = Math.min(events, 9000) - 8 * Math.max(0, visitedSites - 1050);
        if (score > fallbackScore) {
          fallbackScore = score;
          fallbackSeed = candidateSeed;
        }
        if (!activeIds.length && events >= 3000 && events <= 14000 && visitedSites >= 380 && visitedSites <= 1050) {
          chosenSeed = candidateSeed;
          break;
        }
        chosenSeed = fallbackSeed;
      }

      initialize(chosenSeed);
      playing = !reducedMotion;
      playButton.setAttribute("aria-pressed", String(playing));
      playButton.textContent = playing ? "Pause" : "Play";
      updateMetrics(true);
      draw();
    }

    function removeActiveAt(position) {
      activeIds[position] = activeIds[activeIds.length - 1];
      activeIds.pop();
    }

    function step() {
      if (!activeIds.length || events >= 240000) return false;
      const activePosition = Math.floor(random() * activeIds.length);
      const id = activeIds[activePosition];
      const particle = particles[id];
      const source = particle.y * n + particle.x;

      if (
        activeCount[source] === 1 &&
        sleepingAt[source] === 0 &&
        random() < sleepProbability
      ) {
        particle.active = false;
        activeCount[source] -= 1;
        sleepingAt[source] = id + 1;
        removeActiveAt(activePosition);
        events += 1;
        return true;
      }

      const direction = Math.floor(random() * 4);
      const dx = direction === 0 ? 1 : direction === 1 ? -1 : 0;
      const dy = direction === 2 ? 1 : direction === 3 ? -1 : 0;
      activeCount[source] -= 1;
      odometer[source] += 1;
      particle.x += dx;
      particle.y += dy;
      events += 1;

      if (particle.x < 0 || particle.x >= n || particle.y < 0 || particle.y >= n) {
        particle.alive = false;
        particle.active = false;
        removeActiveAt(activePosition);
        return true;
      }

      const destination = particle.y * n + particle.x;
      const sleepingId = sleepingAt[destination] - 1;
      if (sleepingId >= 0) {
        const sleeper = particles[sleepingId];
        sleeper.active = true;
        sleepingAt[destination] = 0;
        activeCount[destination] += 1;
        activeIds.push(sleepingId);
        woken += 1;
      }
      activeCount[destination] += 1;
      return true;
    }

    function traceColor(value, maxLog) {
      if (!value) return [10, 18, 25];
      const t = Math.log1p(value) / maxLog;
      if (t < 0.52) return mixColor([22, 54, 79], [218, 72, 52], t / 0.52);
      return mixColor([218, 72, 52], [255, 224, 126], (t - 0.52) / 0.48);
    }

    function draw() {
      const { ctx, width, height } = fitCanvas(canvas);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#09131c";
      ctx.fillRect(0, 0, width, height);
      const size = Math.min(width, height) * 0.88;
      const cell = size / n;
      const ox = (width - size) / 2;
      const oy = (height - size) / 2;
      let maximum = 1;
      for (let i = 0; i < odometer.length; i += 1) maximum = Math.max(maximum, odometer[i]);
      const maxLog = Math.log1p(maximum);

      for (let y = 0; y < n; y += 1) {
        for (let x = 0; x < n; x += 1) {
          const index = y * n + x;
          const [r, g, b] = traceColor(odometer[index], maxLog);
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(ox + x * cell, oy + y * cell, cell + 0.35, cell + 0.35);
        }
      }

      ctx.strokeStyle = "rgba(255,255,255,.16)";
      ctx.lineWidth = 1;
      ctx.strokeRect(ox - 0.5, oy - 0.5, size + 1, size + 1);

      const dot = clamp(cell * 0.23, 0.7, 2.2);
      ctx.fillStyle = "rgba(216, 225, 218, .5)";
      for (let index = 0; index < sleepingAt.length; index += 1) {
        if (!sleepingAt[index]) continue;
        const x = index % n;
        const y = Math.floor(index / n);
        ctx.beginPath();
        ctx.arc(ox + (x + 0.5) * cell, oy + (y + 0.5) * cell, dot, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let index = 0; index < activeCount.length; index += 1) {
        if (!activeCount[index]) continue;
        const x = index % n;
        const y = Math.floor(index / n);
        const radius = clamp(cell * (0.34 + 0.06 * Math.log1p(activeCount[index])), 1.2, 4.4);
        const px = ox + (x + 0.5) * cell;
        const py = oy + (y + 0.5) * cell;
        const glow = ctx.createRadialGradient(px, py, 0, px, py, radius * 3.2);
        glow.addColorStop(0, "rgba(255, 248, 175, 1)");
        glow.addColorStop(0.26, "rgba(255, 218, 104, .86)");
        glow.addColorStop(1, "rgba(255, 193, 77, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, radius * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function updateMetrics(force = false) {
      const now = performance.now();
      if (!force && now - lastMetricUpdate < 140) return;
      lastMetricUpdate = now;
      eventsOutput.textContent = formatCount(events);
      activeOutput.textContent = formatCount(activeIds.length);
      wokenOutput.textContent = formatCount(woken);
    }

    function frame() {
      if (playing && visible && activeIds.length && events < 240000) {
        const steps = activeIds.length > 130 ? 32 : activeIds.length > 45 ? 18 : 8;
        for (let i = 0; i < steps; i += 1) {
          if (!step()) break;
        }
        draw();
        updateMetrics();
      }
      if (playing && (!activeIds.length || events >= 240000)) {
        playing = false;
        playButton.setAttribute("aria-pressed", "false");
        playButton.textContent = activeIds.length ? "Limit reached" : "Settled";
        updateMetrics(true);
      }
      requestAnimationFrame(frame);
    }

    playButton.addEventListener("click", () => {
      if (!activeIds.length || events >= 240000) {
        realization += 1;
        reset();
        return;
      }
      playing = !playing;
      playButton.setAttribute("aria-pressed", String(playing));
      playButton.textContent = playing ? "Pause" : "Play";
    });

    newButton.addEventListener("click", () => {
      realization += 1;
      reset();
    });

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
      }, { threshold: 0.05 });
      observer.observe(lab);
    }
    window.addEventListener("resize", draw, { passive: true });
    reset();
    requestAnimationFrame(frame);
  });

  // ---------------------------------------------------------------------------
  // Weighted Parry sampler for the SFT forbidding 1001
  // ---------------------------------------------------------------------------

  document.querySelectorAll("[data-sft-lab]").forEach((lab, labIndex) => {
    const canvas = lab.querySelector("[data-sft-canvas]");
    const blocked = lab.querySelector("[data-sft-blocked]");
    const slider = document.querySelector("[data-sft-bias]");
    const betaOutput = document.querySelector("[data-sft-beta]");
    const densityOutput = lab.querySelector("[data-sft-density]");
    const forbidden = 0b1001;
    const stateMask = 0b111;
    const rowCount = 7;
    let beta = Number(slider.value);
    let transition;
    let rows;
    let random = mulberry32(12041 + labIndex * 61);
    let lastAdvance = performance.now();
    let blockedUntil = 0;
    let visible = true;

    function buildTransition() {
      const weight = [1, Math.exp(beta)];
      const right = new Float64Array(8).fill(1);
      const nextVector = new Float64Array(8);
      let lambda = 1;
      for (let iteration = 0; iteration < 220; iteration += 1) {
        nextVector.fill(0);
        for (let state = 0; state < 8; state += 1) {
          for (let bit = 0; bit <= 1; bit += 1) {
            if (((state << 1) | bit) === forbidden) continue;
            const next = ((state << 1) | bit) & stateMask;
            nextVector[state] += weight[bit] * right[next];
          }
        }
        lambda = Math.max(...nextVector);
        for (let state = 0; state < 8; state += 1) right[state] = nextVector[state] / lambda;
      }

      transition = Array.from({ length: 8 }, () => [0, 0]);
      for (let state = 0; state < 8; state += 1) {
        let total = 0;
        for (let bit = 0; bit <= 1; bit += 1) {
          if (((state << 1) | bit) === forbidden) continue;
          const next = ((state << 1) | bit) & stateMask;
          transition[state][bit] = weight[bit] * right[next];
          total += transition[state][bit];
        }
        transition[state][0] /= total;
        transition[state][1] /= total;
      }

      const stationary = new Float64Array(8).fill(1 / 8);
      const nextStationary = new Float64Array(8);
      for (let iteration = 0; iteration < 500; iteration += 1) {
        nextStationary.fill(0);
        for (let state = 0; state < 8; state += 1) {
          for (let bit = 0; bit <= 1; bit += 1) {
            const probability = transition[state][bit];
            if (!probability) continue;
            const next = ((state << 1) | bit) & stateMask;
            nextStationary[next] += stationary[state] * probability;
          }
        }
        stationary.set(nextStationary);
      }
      let density = 0;
      for (let state = 0; state < 8; state += 1) {
        density += stationary[state] * transition[state][1];
      }
      densityOutput.textContent = density.toFixed(3);
    }

    function sampleBit(state) {
      return random() < transition[state][0] ? 0 : 1;
    }

    function newRow() {
      let state = Math.floor(random() * 8);
      const bits = [(state >> 2) & 1, (state >> 1) & 1, state & 1];
      for (let i = 0; i < 140; i += 1) {
        const bit = sampleBit(state);
        state = ((state << 1) | bit) & stateMask;
        bits.push(bit);
      }
      return { state, bits: bits.slice(-92), blocked: false };
    }

    function rebuildRows() {
      rows = Array.from({ length: rowCount }, newRow);
    }

    function advance() {
      let anyBlocked = false;
      rows.forEach((row) => {
        row.blocked = row.state === 0b100;
        const bit = sampleBit(row.state);
        row.state = ((row.state << 1) | bit) & stateMask;
        row.bits.push(bit);
        row.bits.shift();
        anyBlocked ||= row.blocked;
      });
      if (anyBlocked) blockedUntil = performance.now() + 480;
    }

    function draw(progress = 0) {
      const { ctx, width, height } = fitCanvas(canvas);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#071315";
      ctx.fillRect(0, 0, width, height);
      const marginX = Math.max(18, width * 0.035);
      const usableWidth = width - 2 * marginX;
      const rowGap = height / (rowCount + 1.2);
      const cell = clamp(usableWidth / 42, 11, 22);
      const visibleCells = Math.ceil(usableWidth / cell) + 2;
      const start = Math.max(0, rows[0].bits.length - visibleCells - 1);

      ctx.strokeStyle = "rgba(139, 212, 193, .09)";
      ctx.lineWidth = 1;
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const y = rowGap * (rowIndex + 0.95);
        ctx.beginPath();
        ctx.moveTo(marginX, y + cell * 0.55);
        ctx.lineTo(width - marginX, y + cell * 0.55);
        ctx.stroke();

        const bits = rows[rowIndex].bits;
        for (let index = start; index < bits.length; index += 1) {
          const drawIndex = index - start;
          const x = marginX + drawIndex * cell - progress * cell;
          if (x < marginX - cell || x > width - marginX + cell) continue;
          const bit = bits[index];
          const newest = index >= bits.length - 4;
          if (bit) {
            ctx.fillStyle = newest ? "#ffd377" : "#e9b95f";
            ctx.fillRect(x + cell * 0.2, y - cell * 0.05, cell * 0.55, cell * 0.92);
          } else {
            ctx.strokeStyle = newest ? "#9be1ce" : "#5ca894";
            ctx.lineWidth = newest ? 2.1 : 1.4;
            ctx.beginPath();
            ctx.arc(x + cell * 0.48, y + cell * 0.4, cell * 0.26, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        if (rows[rowIndex].blocked && performance.now() < blockedUntil) {
          const x = width - marginX - cell * 0.6;
          ctx.strokeStyle = "rgba(255, 116, 96, .9)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x - cell * 3.9, y - cell * 0.15, cell * 4.05, cell * 1.08);
        }
      }

      const gradient = ctx.createLinearGradient(0, 0, marginX * 1.8, 0);
      gradient.addColorStop(0, "#071315");
      gradient.addColorStop(1, "rgba(7, 19, 21, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, marginX * 1.8, height);
    }

    function frame(now) {
      const duration = reducedMotion ? 1000000 : 560;
      if (visible && now - lastAdvance >= duration) {
        advance();
        lastAdvance = now;
      }
      const progress = visible ? clamp((now - lastAdvance) / duration, 0, 1) : 0;
      blocked.classList.toggle("is-visible", now < blockedUntil);
      if (visible) draw(progress);
      requestAnimationFrame(frame);
    }

    slider.addEventListener("input", () => {
      beta = Number(slider.value);
      betaOutput.textContent = `β = ${beta.toFixed(1)}`;
      buildTransition();
      rebuildRows();
      lastAdvance = performance.now();
      draw();
    });

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
      }, { threshold: 0.05 });
      observer.observe(lab);
    }
    window.addEventListener("resize", () => draw(), { passive: true });
    buildTransition();
    rebuildRows();
    betaOutput.textContent = `β = ${beta.toFixed(1)}`;
    requestAnimationFrame(frame);
  });

  // ---------------------------------------------------------------------------
  // Wishart matrix to GOE-like spectrum
  // ---------------------------------------------------------------------------

  function jacobiEigenvalues(input, n) {
    const matrix = new Float64Array(input);
    for (let sweep = 0; sweep < 24; sweep += 1) {
      let largest = 0;
      for (let p = 0; p < n - 1; p += 1) {
        for (let q = p + 1; q < n; q += 1) {
          const pq = p * n + q;
          const value = matrix[pq];
          largest = Math.max(largest, Math.abs(value));
          if (Math.abs(value) < 1e-10) continue;
          const pp = p * n + p;
          const qq = q * n + q;
          const angle = 0.5 * Math.atan2(2 * value, matrix[qq] - matrix[pp]);
          const cosine = Math.cos(angle);
          const sine = Math.sin(angle);

          for (let k = 0; k < n; k += 1) {
            if (k === p || k === q) continue;
            const kp = k * n + p;
            const kq = k * n + q;
            const oldP = matrix[kp];
            const oldQ = matrix[kq];
            const newP = cosine * oldP - sine * oldQ;
            const newQ = sine * oldP + cosine * oldQ;
            matrix[kp] = matrix[p * n + k] = newP;
            matrix[kq] = matrix[q * n + k] = newQ;
          }

          const app = matrix[pp];
          const aqq = matrix[qq];
          matrix[pp] = cosine * cosine * app - 2 * sine * cosine * value + sine * sine * aqq;
          matrix[qq] = sine * sine * app + 2 * sine * cosine * value + cosine * cosine * aqq;
          matrix[pq] = matrix[q * n + p] = 0;
        }
      }
      if (largest < 1e-8) break;
    }
    return Array.from({ length: n }, (_, index) => matrix[index * n + index]).sort((a, b) => a - b);
  }

  document.querySelectorAll("[data-matrix-transition-lab]").forEach((lab, labIndex) => {
    const canvas = lab.querySelector("[data-matrix-transition-canvas]");
    const slider = document.querySelector("[data-matrix-dimension]");
    const dimensionLabel = document.querySelector("[data-matrix-dimension-label]");
    const animateButton = lab.querySelector("[data-matrix-animate]");
    const newButton = lab.querySelector("[data-matrix-new]");
    const n = 28;
    const maximumDimension = 512;
    let sample = 0;
    let gaussianColumns;
    let matrix;
    let eigenvalues;
    let dimension;
    let animating = !reducedMotion;
    let direction = 1;
    let lastSweep = performance.now();
    let visible = true;

    function sliderToDimension(value) {
      return Math.min(maximumDimension, Math.round(4 * 2 ** (Number(value) / 15)));
    }

    function makeGaussianColumns() {
      const random = mulberry32(77117 + labIndex * 67 + sample * 3571);
      gaussianColumns = Array.from(
        { length: n },
        () => Float64Array.from({ length: maximumDimension }, () => gaussian(random)),
      );
    }

    function calculate() {
      dimension = sliderToDimension(slider.value);
      dimensionLabel.textContent = `d = ${dimension}`;
      matrix = new Float64Array(n * n);
      const scale = Math.sqrt(n * dimension);
      for (let i = 0; i < n; i += 1) {
        for (let j = i; j < n; j += 1) {
          let sum = 0;
          for (let k = 0; k < dimension; k += 1) {
            sum += gaussianColumns[i][k] * gaussianColumns[j][k];
          }
          const value = (sum - (i === j ? dimension : 0)) / scale;
          matrix[i * n + j] = matrix[j * n + i] = value;
        }
      }
      eigenvalues = jacobiEigenvalues(matrix, n);
      draw();
    }

    function heatColor(value) {
      const t = clamp(value / 0.72, -1, 1);
      if (t < 0) return mixColor([39, 79, 153], [239, 236, 224], 1 + t);
      return mixColor([239, 236, 224], [203, 72, 52], t);
    }

    function draw() {
      const { ctx, width, height } = fitCanvas(canvas);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#0b1118";
      ctx.fillRect(0, 0, width, height);
      const pad = Math.max(18, width * 0.026);
      const matrixSize = Math.min(height - 2 * pad - 26, width * 0.53);
      const cell = matrixSize / n;
      const mx = pad;
      const my = (height - matrixSize) / 2 + 9;

      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
          const [r, g, b] = heatColor(matrix[i * n + j]);
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(mx + j * cell, my + i * cell, cell + 0.3, cell + 0.3);
        }
      }
      ctx.strokeStyle = "rgba(255,255,255,.3)";
      ctx.strokeRect(mx - 0.5, my - 0.5, matrixSize + 1, matrixSize + 1);
      ctx.fillStyle = "rgba(255,255,255,.65)";
      ctx.font = "700 10px Helvetica Neue, Arial, sans-serif";
      ctx.letterSpacing = "1px";
      ctx.fillText("STANDARDIZED WISHART MATRIX", mx, my - 12);

      const plotLeft = mx + matrixSize + Math.max(38, width * 0.055);
      const plotRight = width - pad;
      const plotTop = height * 0.2;
      const plotBottom = height * 0.79;
      const axisY = plotBottom;
      const xMin = -3.35;
      const xMax = 3.35;
      const toX = (value) => plotLeft + ((value - xMin) / (xMax - xMin)) * (plotRight - plotLeft);

      ctx.strokeStyle = "rgba(255,255,255,.27)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotLeft, axisY);
      ctx.lineTo(plotRight, axisY);
      ctx.stroke();
      [-2, 0, 2].forEach((tick) => {
        const x = toX(tick);
        ctx.beginPath();
        ctx.moveTo(x, axisY - 5);
        ctx.lineTo(x, axisY + 5);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.52)";
        ctx.font = "11px Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText(String(tick), x, axisY + 21);
      });

      ctx.strokeStyle = "rgba(132, 206, 181, .62)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let step = 0; step <= 120; step += 1) {
        const xValue = -2 + (4 * step) / 120;
        const density = Math.sqrt(Math.max(0, 4 - xValue * xValue)) / (2 * Math.PI);
        const x = toX(xValue);
        const y = axisY - density * (plotBottom - plotTop) * 2.15;
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      const bins = new Map();
      eigenvalues.forEach((value, index) => {
        const x = toX(clamp(value, xMin, xMax));
        const bin = Math.round(x / 8);
        const stack = bins.get(bin) || 0;
        bins.set(bin, stack + 1);
        const y = axisY - 12 - stack * 12;
        ctx.fillStyle = index % 2 ? "#ffb16f" : "#ffd27f";
        ctx.beginPath();
        ctx.arc(x, y, 4.3, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,.67)";
      ctx.font = "700 10px Helvetica Neue, Arial, sans-serif";
      ctx.fillText("EIGENVALUES", plotLeft, plotTop - 18);
      ctx.fillStyle = "rgba(132, 206, 181, .82)";
      ctx.font = "italic 12px Georgia, serif";
      ctx.fillText("semicircle law", plotLeft, plotTop);
      ctx.fillStyle = "rgba(255,255,255,.48)";
      ctx.font = "12px Georgia, serif";
      ctx.fillText(`n = ${n} · d = ${dimension}`, plotLeft, height - pad);
      ctx.textAlign = "left";
    }

    function frame(now) {
      if (animating && visible && now - lastSweep > 620) {
        let value = Number(slider.value) + direction * 2;
        if (value >= 100) {
          value = 100;
          direction = -1;
        } else if (value <= 0) {
          value = 0;
          direction = 1;
        }
        slider.value = String(value);
        calculate();
        lastSweep = now;
      }
      requestAnimationFrame(frame);
    }

    slider.addEventListener("input", () => {
      animating = false;
      animateButton.setAttribute("aria-pressed", "false");
      animateButton.textContent = "Animate sweep";
      calculate();
    });

    animateButton.addEventListener("click", () => {
      animating = !animating;
      animateButton.setAttribute("aria-pressed", String(animating));
      animateButton.textContent = animating ? "Pause sweep" : "Animate sweep";
      lastSweep = performance.now();
    });

    newButton.addEventListener("click", () => {
      sample += 1;
      makeGaussianColumns();
      calculate();
    });

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
      }, { threshold: 0.05 });
      observer.observe(lab);
    }
    window.addEventListener("resize", draw, { passive: true });
    makeGaussianColumns();
    calculate();
    animateButton.setAttribute("aria-pressed", String(animating));
    animateButton.textContent = animating ? "Pause sweep" : "Animate sweep";
    requestAnimationFrame(frame);
  });

  // ---------------------------------------------------------------------------
  // Animated one-dimensional Voronoi elimination
  // ---------------------------------------------------------------------------

  const electionPalette = [
    "#2f5d9b", "#d57748", "#4b907c", "#9d6297", "#cfa63f", "#77884f",
    "#9b525c", "#438093", "#774f9f", "#b56e2e", "#347f68", "#b64a72",
  ];

  document.querySelectorAll("[data-election-animation]").forEach((lab, labIndex) => {
    const canvas = lab.querySelector("[data-election-canvas]");
    const playButton = lab.querySelector("[data-election-play]");
    const newButton = lab.querySelector("[data-election-new]");
    const roundOutput = document.querySelector("[data-election-round]");
    const countOutput = document.querySelector("[data-election-count]");
    const nextOutput = document.querySelector("[data-election-next]");
    let sample = 0;
    let stages;
    let stageIndex = 0;
    let stageElapsed = 0;
    let lastFrame = performance.now();
    let playing = !reducedMotion;
    let visible = true;
    const stageDuration = 1050;

    function boundaries(points) {
      return points.map((point, index) => ({
        id: point.id,
        x: point.x,
        left: index === 0 ? 0 : (points[index - 1].x + point.x) / 2,
        right: index === points.length - 1 ? 1 : (point.x + points[index + 1].x) / 2,
      }));
    }

    function makeStages() {
      const random = mulberry32(88031 + labIndex * 43 + sample * 1697);
      let points = Array.from({ length: 24 }, (_, id) => ({
        id,
        x: 0.018 + 0.964 * random(),
      })).sort((a, b) => a.x - b.x);
      stages = [];
      while (points.length >= 6) {
        const territories = boundaries(points);
        let eliminated = null;
        if (points.length > 6) {
          eliminated = territories.reduce((best, territory) =>
            territory.right - territory.left < best.right - best.left ? territory : best,
          ).id;
        }
        stages.push({ territories, eliminated });
        if (eliminated === null) break;
        points = points.filter((point) => point.id !== eliminated);
      }
      stageIndex = 0;
      stageElapsed = 0;
      lastFrame = performance.now();
      playing = !reducedMotion;
      playButton.setAttribute("aria-pressed", String(playing));
      playButton.textContent = playing ? "Pause" : "Play";
      updateElectionStats();
      drawElection(0);
    }

    function updateElectionStats() {
      const stage = stages[stageIndex];
      roundOutput.textContent = String(stageIndex);
      countOutput.textContent = String(stage.territories.length);
      nextOutput.textContent = stage.eliminated === null ? "final six" : `candidate ${stage.eliminated + 1}`;
    }

    function interpolatedTerritories(progress) {
      const current = stages[stageIndex];
      if (stageIndex >= stages.length - 1) return current.territories;
      const nextMap = new Map(stages[stageIndex + 1].territories.map((item) => [item.id, item]));
      return current.territories.map((item) => {
        const next = nextMap.get(item.id);
        if (!next) return { ...item, opacity: 1 - progress };
        return {
          ...item,
          left: item.left + (next.left - item.left) * progress,
          right: item.right + (next.right - item.right) * progress,
          opacity: 1,
        };
      });
    }

    function drawElection(progress) {
      const { ctx, width, height } = fitCanvas(canvas);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#f8f4eb";
      ctx.fillRect(0, 0, width, height);
      const left = Math.max(28, width * 0.055);
      const right = width - left;
      const usable = right - left;
      const bandTop = height * 0.25;
      const bandBottom = height * 0.76;
      const lineY = height * 0.54;
      const territories = interpolatedTerritories(progress);
      const eliminated = stages[stageIndex].eliminated;

      territories.forEach((territory) => {
        const color = electionPalette[territory.id % electionPalette.length];
        const opacity = territory.opacity ?? 1;
        ctx.globalAlpha = opacity;
        ctx.fillStyle = `${color}31`;
        ctx.fillRect(left + territory.left * usable, bandTop, (territory.right - territory.left) * usable, bandBottom - bandTop);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(left + territory.left * usable, bandTop);
        ctx.lineTo(left + territory.left * usable, bandBottom);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      ctx.strokeStyle = "#232522";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left, lineY);
      ctx.lineTo(right, lineY);
      ctx.stroke();

      territories.forEach((territory) => {
        const x = left + territory.x * usable;
        const color = electionPalette[territory.id % electionPalette.length];
        const opacity = territory.opacity ?? 1;
        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        ctx.strokeStyle = "#f8f4eb";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, lineY, territory.id === eliminated ? 9 : 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#343632";
        ctx.font = "700 9px Helvetica Neue, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(territory.id + 1), x, lineY - 16);
        if (territory.id === eliminated) {
          ctx.strokeStyle = `rgba(192, 55, 43, ${0.65 + 0.35 * Math.sin(progress * Math.PI)})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(x, lineY, 14 + 5 * Math.sin(progress * Math.PI), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });

      ctx.textAlign = "left";
      ctx.fillStyle = "#60625c";
      ctx.font = "12px Georgia, serif";
      ctx.fillText("0", left - 3, bandBottom + 28);
      ctx.textAlign = "right";
      ctx.fillText("1", right + 3, bandBottom + 28);
      ctx.textAlign = "left";
      ctx.fillStyle = "#363834";
      ctx.font = "600 14px Georgia, serif";
      const label = eliminated === null
        ? "Six survivors"
        : `Candidate ${eliminated + 1} has the smallest constituency`;
      ctx.fillText(label, left, 35);
    }

    function frame(now) {
      const elapsed = now - lastFrame;
      lastFrame = now;
      if (playing && visible) stageElapsed += elapsed;
      const progress = clamp(stageElapsed / stageDuration, 0, 1);
      const moveProgress = progress < 0.42 ? 0 : (progress - 0.42) / 0.58;
      if (visible) drawElection(moveProgress);
      if (playing && visible && progress >= 1) {
        if (stageIndex < stages.length - 1) {
          stageIndex += 1;
          stageElapsed = 0;
          updateElectionStats();
        } else {
          playing = false;
          playButton.setAttribute("aria-pressed", "false");
          playButton.textContent = "Replay";
        }
      }
      requestAnimationFrame(frame);
    }

    playButton.addEventListener("click", () => {
      if (stageIndex >= stages.length - 1) {
        stageIndex = 0;
        stageElapsed = 0;
        playing = true;
        updateElectionStats();
      } else {
        playing = !playing;
      }
      lastFrame = performance.now();
      playButton.setAttribute("aria-pressed", String(playing));
      playButton.textContent = playing ? "Pause" : "Play";
    });

    newButton.addEventListener("click", () => {
      sample += 1;
      makeStages();
    });

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        lastFrame = performance.now();
      }, { threshold: 0.05 });
      observer.observe(lab);
    }
    window.addEventListener("resize", () => drawElection(0), { passive: true });
    makeStages();
    requestAnimationFrame(frame);
  });

  // ---------------------------------------------------------------------------
  // Random-walk source guessing interaction
  // ---------------------------------------------------------------------------

  document.querySelectorAll("[data-source-lab]").forEach((lab) => {
    const map = lab.querySelector("[data-source-map]");
    const guessMark = lab.querySelector("[data-source-guess-mark]");
    const line = lab.querySelector("[data-source-line]");
    const revealButton = lab.querySelector("[data-source-reveal]");
    const resetButton = lab.querySelector("[data-source-reset]");
    const instruction = lab.querySelector("[data-source-instruction]");
    const feedback = document.querySelector("[data-source-feedback]");
    const trueX = 508.2;
    const trueY = 375.5;
    let guess = null;

    function placeGuess(event) {
      const box = map.getBoundingClientRect();
      const x = clamp(((event.clientX - box.left) / box.width) * 1000, 0, 1000);
      const y = clamp(((event.clientY - box.top) / box.height) * 762.71, 0, 762.71);
      guess = { x, y };
      guessMark.setAttribute("cx", x.toFixed(2));
      guessMark.setAttribute("cy", y.toFixed(2));
      line.setAttribute("x2", x.toFixed(2));
      line.setAttribute("y2", y.toFixed(2));
      map.classList.add("has-guess");
      map.classList.remove("is-revealed");
      revealButton.disabled = false;
      instruction.textContent = "Guess placed — move it or reveal the source";
      feedback.textContent = "Guess recorded. The occupation map contains no arrow of time—only repeated visits.";
    }

    function reveal() {
      if (!guess) return;
      map.classList.add("is-revealed");
      const distance = Math.hypot(guess.x - trueX, guess.y - trueY) / 10;
      feedback.textContent = distance < 3
        ? `Remarkably close: ${distance.toFixed(1)}% of the image width from the true source.`
        : `Your guess was ${distance.toFixed(1)}% of the image width from the true source.`;
      instruction.textContent = "The star is the true starting site";
      revealButton.disabled = true;
    }

    function reset() {
      guess = null;
      map.classList.remove("has-guess", "is-revealed");
      revealButton.disabled = true;
      instruction.textContent = "Click the image to place your guess";
      feedback.textContent = "No guess yet.";
    }

    map.addEventListener("click", placeGuess);
    revealButton.addEventListener("click", reveal);
    resetButton.addEventListener("click", reset);
  });
})();
