(() => {
  "use strict";

  function start() {
    const atmosphere = document.querySelector(".ai-atmosphere");
    const canvas = document.querySelector(".ai-code-rain");
    const heading = document.querySelector(".ai-animated-title");
    const typed = document.querySelector("[data-typed-title]");
    const button = document.querySelector(".ai-motion-toggle");
    if (!atmosphere || !canvas || !heading || !typed || !button) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const root = document.documentElement;
    const title = heading.getAttribute("aria-label");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motionKey = "jacob-richey-ai-motion";
    const alphabet = Array.from("0011ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓ");
    const pick = () => alphabet[Math.floor(Math.random() * alphabet.length)];
    let userPaused = false;
    try { userPaused = window.localStorage.getItem(motionKey) === "paused"; } catch {}

    // A 15-second performance: one typo, a correction, a reading pause, erase.
    // Only the decorative span changes. The heading's accessible name is stable.
    const frames = [{ at: 0, text: "" }];
    let at = 450;
    let text = "";
    for (const character of "AI-genert") {
      at += 130; text += character; frames.push({ at, text });
    }
    at += 580; text = text.slice(0, -1); frames.push({ at, text });
    for (const character of "ated research") {
      at += 125; text += character; frames.push({ at, text });
    }
    at += 7650;
    while (text) {
      at += 65; text = text.slice(0, -1); frames.push({ at, text });
    }

    let width = 0, height = 0, columns = [], ink = "#39ed77", headInk = "#ceffdd";
    let running = false, request = null, previous = null, painted = -Infinity, elapsed = 0;

    function palette() {
      ink = window.getComputedStyle(root).getPropertyValue("--ai-rain").trim() || "#39ed77";
      headInk = root.dataset.theme === "light" ? "#195d32" : "#ceffdd";
    }

    function resize() {
      width = atmosphere.clientWidth;
      height = atmosphere.clientHeight;
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      columns = [];
      for (let x = -10; x < width && columns.length < 220; x += 9 + Math.random() * 10) {
        const size = 11 + Math.random() * 7;
        const count = 24 + Math.floor(Math.random() * 35);
        columns.push({
          x, size, step: size * (1.15 + Math.random() * 0.3),
          speed: 17 + Math.random() * 38, opacity: 0.35 + Math.random() * 0.65,
          start: Math.random() * (height + count * size * 1.4),
          glyphs: Array.from({ length: count }, pick), nextChange: elapsed,
        });
      }
      draw();
    }

    function draw() {
      context.clearRect(0, 0, width, height);
      context.textBaseline = "top";
      for (const column of columns) {
        if (elapsed >= column.nextChange) {
          for (let i = 0; i < 3; i++) column.glyphs[Math.floor(Math.random() * column.glyphs.length)] = pick();
          column.glyphs[0] = pick();
          column.nextChange = elapsed + 100 + Math.random() * 450;
        }
        const cycle = height + column.glyphs.length * column.step;
        const head = (column.start + elapsed * column.speed / 1000) % cycle;
        context.font = `${column.size}px monospace`;
        for (let i = 0; i < column.glyphs.length; i++) {
          const y = head - i * column.step;
          if (y < -column.size || y > height) continue;
          context.globalAlpha = column.opacity * (1 - i / column.glyphs.length);
          context.fillStyle = i === 0 ? headInk : ink;
          context.fillText(column.glyphs[i], column.x, y);
        }
      }
      context.globalAlpha = 1;
    }

    function typeTitle() {
      const position = elapsed % 15000;
      let value = "";
      for (const frame of frames) {
        if (frame.at > position) break;
        value = frame.text;
      }
      if (typed.textContent !== value) typed.textContent = value;
    }

    function tick(now) {
      request = null;
      if (!running || document.hidden) return;
      if (previous !== null) elapsed += now - previous;
      previous = now;
      // Twenty paints per second are enough for the slow background streams.
      if (elapsed - painted >= 50) {
        draw(); typeTitle(); painted = elapsed;
      }
      request = window.requestAnimationFrame(tick);
    }

    function stopFrame() {
      if (request !== null) window.cancelAnimationFrame(request);
      request = null;
      previous = null;
    }

    function resumeFrame() {
      if (running && !document.hidden && request === null) request = window.requestAnimationFrame(tick);
    }

    function setRunning(value) {
      running = value;
      root.dataset.aiEffects = running ? "running" : "paused";
      button.querySelector("[data-motion-label]").textContent = running ? "Pause effects" : "Play effects";
      button.querySelector(".ai-motion-icon").textContent = running ? "Ⅱ" : "▷";
      button.setAttribute("aria-label", running ? "Pause code rain and title animation" : "Play code rain and title animation");
      if (running) {
        elapsed = 0; painted = -Infinity;
        for (const column of columns) column.nextChange = 0;
        typeTitle(); resumeFrame();
      } else {
        stopFrame(); typed.textContent = title; draw();
      }
    }

    palette(); resize();
    atmosphere.classList.add("is-animated");
    button.hidden = false;
    button.addEventListener("click", () => {
      userPaused = running;
      try { window.localStorage.setItem(motionKey, userPaused ? "paused" : "playing"); } catch {}
      setRunning(!running);
    });
    reduced.addEventListener?.("change", () => setRunning(!reduced.matches && !userPaused));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopFrame();
      else resumeFrame();
    });
    window.addEventListener("pagehide", stopFrame);
    window.addEventListener("pageshow", resumeFrame);
    window.addEventListener("resize", resize);
    new MutationObserver(() => { palette(); draw(); }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    setRunning(!reduced.matches && !userPaused);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
