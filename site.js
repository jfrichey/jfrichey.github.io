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

  document.querySelectorAll("[data-source-guess]").forEach((guess) => {
    const prompt = guess.querySelector(".guess-prompt");
    const toggle = () => {
      const revealed = guess.classList.toggle("is-revealed");
      guess.setAttribute("aria-pressed", String(revealed));
      if (prompt) {
        prompt.textContent = revealed
          ? "The walk began here — click to hide"
          : "Where did the walker start? Click to reveal";
      }
    };
    guess.addEventListener("click", toggle);
  });

  function mulberry32(seed) {
    return function random() {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fitCanvas(canvas) {
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, Math.round(box.width * ratio));
    const height = Math.max(260, Math.round(box.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return { width, height, ratio };
  }

  const electionPalette = [
    "#315d9a",
    "#d77b4b",
    "#4a8d7b",
    "#a26b9a",
    "#d1a53e",
    "#697b49",
    "#8c5860",
    "#4c8394",
  ];

  function drawElection1D(canvas, seed) {
    const { width, height, ratio } = fitCanvas(canvas);
    const ctx = canvas.getContext("2d");
    const random = mulberry32(seed);
    let points = Array.from({ length: 25 }, (_, id) => ({
      x: 0.035 + 0.93 * random(),
      id,
    })).sort((a, b) => a.x - b.x);

    while (points.length > 8) {
      const sizes = points.map((point, index) => {
        const left = index === 0 ? 0 : (points[index - 1].x + point.x) / 2;
        const right =
          index === points.length - 1
            ? 1
            : (point.x + points[index + 1].x) / 2;
        return right - left;
      });
      const smallest = sizes.indexOf(Math.min(...sizes));
      points.splice(smallest, 1);
    }

    ctx.fillStyle = "#f8f5ee";
    ctx.fillRect(0, 0, width, height);
    const leftPad = 34 * ratio;
    const rightPad = 25 * ratio;
    const lineY = height * 0.54;
    const usable = width - leftPad - rightPad;
    points.forEach((point, index) => {
      const left = index === 0 ? 0 : (points[index - 1].x + point.x) / 2;
      const right =
        index === points.length - 1
          ? 1
          : (point.x + points[index + 1].x) / 2;
      const x0 = leftPad + left * usable;
      const x1 = leftPad + right * usable;
      ctx.fillStyle = electionPalette[index % electionPalette.length] + "35";
      ctx.fillRect(x0, lineY - 76 * ratio, x1 - x0, 152 * ratio);
      ctx.strokeStyle = electionPalette[index % electionPalette.length];
      ctx.lineWidth = 2 * ratio;
      ctx.beginPath();
      ctx.moveTo(x0, lineY - 76 * ratio);
      ctx.lineTo(x0, lineY + 76 * ratio);
      ctx.stroke();
      const px = leftPad + point.x * usable;
      ctx.fillStyle = electionPalette[index % electionPalette.length];
      ctx.beginPath();
      ctx.arc(px, lineY, 7 * ratio, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = "#1d1e1c";
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    ctx.moveTo(leftPad, lineY);
    ctx.lineTo(width - rightPad, lineY);
    ctx.stroke();
    ctx.fillStyle = "#5c5d58";
    ctx.font = `${12 * ratio}px Georgia`;
    ctx.fillText("0", leftPad - 3 * ratio, lineY + 105 * ratio);
    ctx.fillText("1", width - rightPad - 3 * ratio, lineY + 105 * ratio);
    ctx.font = `${14 * ratio}px Georgia`;
    ctx.fillText(
      "Eight survivors and their Voronoi constituencies",
      leftPad,
      35 * ratio,
    );
  }

  function drawElection2D(canvas, seed) {
    const { width, height, ratio } = fitCanvas(canvas);
    const ctx = canvas.getContext("2d");
    const random = mulberry32(seed);
    let points = Array.from({ length: 26 }, (_, id) => ({
      x: 0.04 + 0.92 * random(),
      y: 0.06 + 0.88 * random(),
      id,
    }));
    const gridW = 150;
    const gridH = 105;

    function assignments(candidates) {
      const owners = new Uint16Array(gridW * gridH);
      const counts = new Uint32Array(candidates.length);
      for (let gy = 0; gy < gridH; gy += 1) {
        const y = (gy + 0.5) / gridH;
        for (let gx = 0; gx < gridW; gx += 1) {
          const x = (gx + 0.5) / gridW;
          let owner = 0;
          let best = Infinity;
          candidates.forEach((point, index) => {
            const d = (x - point.x) ** 2 + (y - point.y) ** 2;
            if (d < best) {
              best = d;
              owner = index;
            }
          });
          owners[gy * gridW + gx] = owner;
          counts[owner] += 1;
        }
      }
      return { owners, counts };
    }

    while (points.length > 9) {
      const { counts } = assignments(points);
      let smallest = 0;
      for (let i = 1; i < counts.length; i += 1) {
        if (counts[i] < counts[smallest]) smallest = i;
      }
      points.splice(smallest, 1);
    }

    const { owners } = assignments(points);
    const image = ctx.createImageData(gridW, gridH);
    const rgb = electionPalette.map((hex) => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ]);
    for (let i = 0; i < owners.length; i += 1) {
      const color = rgb[owners[i] % rgb.length];
      image.data[4 * i] = Math.round(0.76 * color[0] + 0.24 * 248);
      image.data[4 * i + 1] = Math.round(0.76 * color[1] + 0.24 * 245);
      image.data[4 * i + 2] = Math.round(0.76 * color[2] + 0.24 * 238);
      image.data[4 * i + 3] = 255;
    }
    const offscreen = document.createElement("canvas");
    offscreen.width = gridW;
    offscreen.height = gridH;
    offscreen.getContext("2d").putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offscreen, 0, 0, width, height);
    points.forEach((point, index) => {
      ctx.fillStyle = "#fffdf8";
      ctx.strokeStyle = "#171817";
      ctx.lineWidth = 2 * ratio;
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, 7 * ratio, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#171817";
      ctx.font = `bold ${9 * ratio}px Helvetica`;
      ctx.textAlign = "center";
      ctx.fillText(String(index + 1), point.x * width, point.y * height + 3 * ratio);
    });
    ctx.textAlign = "left";
  }

  document.querySelectorAll("[data-figure-deck]").forEach((deck) => {
    const tabs = [...deck.querySelectorAll("[data-deck-tab]")];
    const panels = [...deck.querySelectorAll("[data-deck-panel]")];
    const select = (tab) => {
      const name = tab.dataset.deckTab;
      tabs.forEach((item) =>
        item.setAttribute("aria-selected", String(item === tab)),
      );
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.deckPanel !== name;
      });
      if (name === "election") window.dispatchEvent(new Event("resize"));
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => select(tab));
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const next = tabs[(index + direction + tabs.length) % tabs.length];
        next.focus();
        select(next);
      });
    });
  });

  document.querySelectorAll("[data-election-lab]").forEach((lab, labIndex) => {
    const canvas = lab.querySelector("canvas");
    const buttons = [...lab.querySelectorAll("[data-election-mode]")];
    const rerun = lab.querySelector("[data-election-rerun]");
    let mode = "1d";
    let sample = 0;
    const draw = () => {
      const seed = 32041 + labIndex * 103 + sample * 997;
      if (mode === "1d") drawElection1D(canvas, seed);
      else drawElection2D(canvas, seed);
    };
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        mode = button.dataset.electionMode;
        buttons.forEach((item) =>
          item.setAttribute("aria-pressed", String(item === button)),
        );
        draw();
      });
    });
    rerun?.addEventListener("click", () => {
      sample += 1;
      draw();
    });
    draw();
    window.addEventListener("resize", draw, { passive: true });
  });

  function gaussian(random) {
    const u = Math.max(random(), 1e-9);
    const v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function matrixColor(value) {
    const t = Math.max(-1, Math.min(1, value));
    if (t < 0) {
      const a = 1 + t;
      return [Math.round(36 + 203 * a), Math.round(65 + 174 * a), Math.round(125 + 114 * a)];
    }
    return [Math.round(239 - 62 * t), Math.round(239 - 166 * t), Math.round(239 - 185 * t)];
  }

  function drawMatrix(canvas, kind, seed) {
    const { width, height } = fitCanvas(canvas);
    const ctx = canvas.getContext("2d");
    const random = mulberry32(seed);
    const n = 28;
    const matrix = Array.from({ length: n }, () => new Float64Array(n));
    if (kind === "wishart") {
      const dimension = 8;
      const vectors = Array.from({ length: n }, () =>
        Float64Array.from({ length: dimension }, () => gaussian(random)),
      );
      for (let i = 0; i < n; i += 1) {
        for (let j = i; j < n; j += 1) {
          let sum = 0;
          for (let k = 0; k < dimension; k += 1) sum += vectors[i][k] * vectors[j][k];
          const value = i === j ? 0 : sum / Math.sqrt(dimension);
          matrix[i][j] = matrix[j][i] = value;
        }
      }
    } else {
      for (let i = 0; i < n; i += 1) {
        for (let j = i; j < n; j += 1) {
          const value = i === j ? 0 : gaussian(random);
          matrix[i][j] = matrix[j][i] = value;
        }
      }
    }
    const values = matrix.flatMap((row) => [...row].map(Math.abs));
    values.sort((a, b) => a - b);
    const scale = values[Math.floor(values.length * 0.96)] || 1;
    const cell = Math.min(width, height) / n;
    const ox = (width - cell * n) / 2;
    const oy = (height - cell * n) / 2;
    ctx.fillStyle = "#11151d";
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const [r, g, b] = matrixColor(matrix[i][j] / scale);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(ox + j * cell, oy + i * cell, cell + 0.4, cell + 0.4);
      }
    }
  }

  document.querySelectorAll("[data-matrix-lab]").forEach((lab, labIndex) => {
    const wishart = lab.querySelector('[data-matrix="wishart"]');
    const goe = lab.querySelector('[data-matrix="goe"]');
    const rerun = lab.querySelector("[data-matrix-rerun]");
    let sample = 0;
    const draw = () => {
      drawMatrix(wishart, "wishart", 8101 + labIndex * 17 + sample * 301);
      drawMatrix(goe, "goe", 9101 + labIndex * 17 + sample * 301);
    };
    rerun?.addEventListener("click", () => {
      sample += 1;
      draw();
    });
    draw();
    window.addEventListener("resize", draw, { passive: true });
  });
})();
