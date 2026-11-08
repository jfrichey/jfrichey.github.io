// Animation behavior checks with a simulated clock; no browser rendering claimed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "..", "ai-effects.js"), "utf8");
const title = "AI-generated research";

function load({ reduce = false, blocked = false, store = new Map() } = {}) {
  const root = { dataset: { theme: "dark" } };
  const typed = { textContent: title }, label = {}, icon = {};
  const buttonEvents = {}, documentEvents = {}, windowEvents = {};
  let reducedChange;
  const system = { matches: reduce, addEventListener(name, callback) { reducedChange = callback; } };
  const heading = { getAttribute() { return title; } };
  const button = {
    hidden: true, querySelector(selector) { return selector === "[data-motion-label]" ? label : icon; },
    setAttribute() {}, addEventListener(name, callback) { buttonEvents[name] = callback; },
  };
  const xs = new Set(); let paints = 0;
  const context = { setTransform() {}, clearRect() { paints++; }, fillText(char, x) { xs.add(x); } };
  const canvas = { getContext() { return context; } };
  const atmosphere = { clientWidth: 1200, clientHeight: 800, classList: { add() {} } };
  const selectors = { ".ai-atmosphere": atmosphere, ".ai-code-rain": canvas,
    ".ai-animated-title": heading, "[data-typed-title]": typed, ".ai-motion-toggle": button };
  const document = {
    readyState: "complete", hidden: false, documentElement: root,
    querySelector(selector) { return selectors[selector]; },
    addEventListener(name, callback) { documentEvents[name] = callback; },
  };
  let requestId = 0;
  const queued = new Map();
  const window = {
    devicePixelRatio: 2, matchMedia() { return system; },
    getComputedStyle() { return { getPropertyValue() { return "#39ed77"; } }; },
    requestAnimationFrame(callback) { queued.set(++requestId, callback); return requestId; },
    cancelAnimationFrame(id) { queued.delete(id); },
    addEventListener(name, callback) { windowEvents[name] = callback; },
    localStorage: {
      getItem(key) { if (blocked) throw Error("blocked"); return store.get(key); },
      setItem(key, value) { if (blocked) throw Error("blocked"); store.set(key, value); },
    },
  };
  vm.runInNewContext(source, { document, window, MutationObserver: class { observe() {} } });
  return {
    root, typed, label, button, heading, canvas, queued, store, xs,
    get paints() { return paints; },
    step(now) { const callbacks = [...queued.values()]; queued.clear(); callbacks.forEach((callback) => callback(now)); },
    click() { buttonEvents.click(); },
    hide(value) { document.hidden = value; documentEvents.visibilitychange(); },
    reduce(value) { system.matches = value; reducedChange(); },
  };
}

test("title mistypes, corrects, pauses, erases and repeats on a 15-second loop", () => {
  const p = load();
  assert.equal(p.typed.textContent, "");
  p.step(0); p.step(1800); assert.equal(p.typed.textContent, "AI-genert");
  p.step(4000); assert.equal(p.typed.textContent, title);
  p.step(10000); assert.equal(p.typed.textContent, title);
  p.step(12500); assert.ok(p.typed.textContent.length < title.length);
  p.step(15000); assert.equal(p.typed.textContent, "");
  assert.equal(p.heading.getAttribute("aria-label"), title);
  assert.ok(p.xs.size > 50, "dense, irregular streams span the background");
  assert.equal(p.canvas.width, 1800, "pixel ratio is capped at 1.5");
});

test("pause stops both effects, restores the complete heading, and persists", () => {
  const p = load(); p.step(0); p.step(1800); p.click();
  assert.equal(p.typed.textContent, title);
  assert.equal(p.root.dataset.aiEffects, "paused");
  assert.equal(p.queued.size, 0);
  assert.equal(p.label.textContent, "Play effects");
  const next = load({ store: p.store });
  assert.equal(next.root.dataset.aiEffects, "paused");
  next.click(); assert.equal(next.root.dataset.aiEffects, "running");
});

test("reduced motion starts still and changing the preference stops active effects", () => {
  const p = load({ reduce: true });
  assert.equal(p.typed.textContent, title); assert.equal(p.queued.size, 0);
  p.reduce(false); assert.equal(p.queued.size, 1);
  p.reduce(true); assert.equal(p.queued.size, 0); assert.equal(p.typed.textContent, title);
});

test("hidden tabs stop drawing and resume without jumping through missed time", () => {
  const p = load(); p.step(0); p.step(1800); const text = p.typed.textContent;
  p.hide(true); assert.equal(p.queued.size, 0);
  const paints = p.paints; p.step(30000); assert.equal(p.paints, paints);
  p.hide(false); p.step(31000); assert.equal(p.typed.textContent, text);
});

test("the pause button works with blocked storage", () => {
  const p = load({ blocked: true }); p.click();
  assert.equal(p.root.dataset.aiEffects, "paused"); assert.equal(p.typed.textContent, title);
  p.click(); assert.equal(p.root.dataset.aiEffects, "running");
});
