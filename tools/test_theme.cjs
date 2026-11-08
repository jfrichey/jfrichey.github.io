// Controller regression checks; these simulate page lifecycles, not browser rendering.
// Run from any directory with: node tools/test_theme.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "..", "theme.js"), "utf8");
const key = "jacob-richey-theme";

function page({
  url = "https://jfrichey.github.io/index.html", saved, dark = false,
  blocked = false, writeBlocked = false, preview = false, matrix = false,
  store = new Map(), links = ["research.html", "ai.html"], historyBlocked = false,
} = {}) {
  if (saved !== undefined) store.set(key, saved);
  let ready = false;
  const windowEvents = {}, documentEvents = {}, systemEvents = {}, buttonEvents = {};
  const location = { href: url };
  const root = { dataset: {}, style: {} };
  if (matrix) root.dataset.palette = "matrix";
  if (preview) root.dataset.themePreview = "true";
  const label = { textContent: "" }, attributes = {};
  const meta = { setAttribute(name, value) { this[name] = value; } };
  const button = {
    hidden: true, querySelector() { return label; },
    setAttribute(name, value) { attributes[name] = value; },
    addEventListener(name, callback) { buttonEvents[name] = callback; },
  };
  const anchors = links.map((link) => ({
    value: typeof link === "string" ? link : link.href,
    getAttribute(name) { return name === "href" ? this.value : null; },
    setAttribute(name, value) { if (name === "href") this.value = value; },
    hasAttribute(name) { return name === "download" && Boolean(link.download); },
  }));
  const document = {
    documentElement: root, readyState: "loading",
    get baseURI() { return location.href; },
    querySelector(selector) { return selector.startsWith("meta") ? meta : ready ? button : null; },
    querySelectorAll() { return ready ? anchors : []; },
    addEventListener(name, callback) { documentEvents[name] = callback; },
  };
  const system = { matches: dark, addEventListener(name, callback) { systemEvents[name] = callback; } };
  const history = {
    state: { untouched: true },
    replaceState(state, title, href) {
      if (historyBlocked) throw Error("history unavailable");
      this.state = state;
      location.href = new URL(href, location.href).href;
    },
  };
  const window = {
    location, history, matchMedia() { return system; },
    localStorage: {
      getItem(k) { if (blocked) throw Error("storage unavailable"); return store.get(k) ?? null; },
      setItem(k, value) {
        if (blocked || writeBlocked) throw Error("storage unavailable");
        store.set(k, value);
      },
    },
    addEventListener(name, callback) { windowEvents[name] = callback; },
  };
  vm.runInNewContext(source, { document, window, URL });
  return {
    root, label, attributes, meta, button, store, location, history, anchors,
    ready() { ready = true; document.readyState = "complete"; documentEvents.DOMContentLoaded?.(); },
    click() { buttonEvents.click(); },
    system(value) { system.matches = value; systemEvents.change?.(); },
    restore() { windowEvents.pageshow?.({ persisted: true }); },
    storage(value, eventKey = key) {
      if (eventKey === null) store.clear();
      else if (value === null) store.delete(eventKey);
      else store.set(eventKey, value);
      windowEvents.storage?.({ key: eventKey, newValue: value });
    },
    link(index) { return new URL(anchors[index].value, location.href).href; },
  };
}

test("local-file navigation carries the choice despite separate per-file storage", () => {
  const ai = page({ url: "file:///MathLab/website/ai-preview.html", matrix: true, saved: "light",
    links: ["research-preview.html?view=all#processes"] });
  ai.ready(); ai.click();
  const research = page({ url: ai.link(0), saved: "light" });
  assert.equal(research.root.dataset.theme, "dark");
  assert.equal(new URL(ai.link(0)).searchParams.get("view"), "all");
  assert.equal(new URL(ai.link(0)).hash, "#processes");
  research.ready(); research.click();
  const next = page({ url: research.link(1), dark: true });
  assert.equal(next.root.dataset.theme, "light");
});

test("hosted pages share the saved preference without changing clean URLs", () => {
  const first = page({ saved: "light" }); first.ready();
  assert.equal(first.root.dataset.theme, "light"); first.click();
  const ai = page({ url: first.link(1), matrix: true, store: first.store }); ai.ready();
  assert.equal(ai.root.dataset.theme, "dark");
  assert.equal(ai.meta.content, "#030906");
  assert.equal(new URL(first.link(1)).search, "");
  ai.click();
  const research = page({ store: ai.store, dark: true });
  assert.equal(research.root.dataset.theme, "light");
});

test("Back/Forward restoration reads the latest shared choice", () => {
  const first = page({ saved: "light" }); first.ready();
  const second = page({ store: first.store }); second.ready(); second.click();
  first.restore();
  assert.equal(first.root.dataset.theme, "dark");
  first.click(); second.restore();
  assert.equal(second.root.dataset.theme, "light");
});

test("HTTP previews carry a choice even when each preview has its own storage", () => {
  const first = page({ preview: true, saved: "light" }); first.ready(); first.click();
  const second = page({ preview: true, url: first.link(0), saved: "light" });
  assert.equal(second.root.dataset.theme, "dark");
});

for (const restriction of [{ blocked: true }, { writeBlocked: true }]) {
  test(`navigation works with ${restriction.blocked ? "blocked" : "read-only"} storage`, () => {
    const first = page(restriction); first.ready(); first.click();
    const second = page({ ...restriction, url: first.link(0) });
    assert.equal(second.root.dataset.theme, "light");
    second.ready(); second.click();
    assert.equal(second.root.dataset.theme, "dark");
    second.restore();
    assert.equal(second.root.dataset.theme, "dark");
  });
}

test("preview reloads retain the current selection without writable storage", () => {
  const first = page({ preview: true, blocked: true }); first.ready(); first.click();
  const reloaded = page({ preview: true, blocked: true, url: first.location.href });
  assert.equal(reloaded.root.dataset.theme, "light");
  assert.equal(first.history.state.untouched, true);
});

test("history restrictions do not break the button or link handoff", () => {
  const first = page({ preview: true, blocked: true, historyBlocked: true });
  first.ready(); first.click();
  assert.equal(first.root.dataset.theme, "light");
  const second = page({ url: first.link(0), blocked: true });
  assert.equal(second.root.dataset.theme, "light");
});

test("external URLs, PDFs, downloads and in-page anchors remain unchanged", () => {
  const links = ["#sft", "pagedocs/example.pdf", "https://example.com/research.html",
    "mailto:someone@example.com", "../elsewhere/page.html", "javascript:void(0)",
    "mailto:someone@example.html", { href: "research.html", download: true }];
  const p = page({ preview: true, links }); p.ready(); p.click();
  assert.deepEqual(p.anchors.map((a) => a.value), links.map((link) => typeof link === "string" ? link : link.href));
});

test("new visits default to dark regardless of device preference, while the toggle still wins", () => {
  const p = page({ dark: false, preview: true });
  assert.equal(p.root.dataset.theme, "dark"); assert.equal(p.button.hidden, true);
  p.ready(); assert.equal(p.button.hidden, false); assert.equal(p.label.textContent, "Light mode");
  assert.equal(new URL(p.link(0)).search, "");
  p.system(true); p.system(false); assert.equal(p.root.dataset.theme, "dark");
  p.click(); p.system(true); p.system(false); assert.equal(p.root.dataset.theme, "light");
  assert.equal(p.attributes["aria-label"], "Switch to dark mode");
});

test("cross-tab updates and clearing the setting resynchronize the toggle", () => {
  const p = page({ saved: "dark" }); p.ready();
  p.storage("light"); assert.equal(p.root.dataset.theme, "light");
  p.storage("dark"); assert.equal(p.label.textContent, "Light mode");
  p.storage(null); assert.equal(p.root.dataset.theme, "dark");
  p.storage("light", "unrelated"); assert.equal(p.root.dataset.theme, "dark");
  p.click(); p.storage(null, null); assert.equal(p.root.dataset.theme, "dark");
});

test("invalid stored or linked values do not become themes", () => {
  const p = page({ saved: "invalid", dark: true, url: "https://jfrichey.github.io/ai.html?theme=invalid" });
  assert.equal(p.root.dataset.theme, "dark");
  p.ready(); p.system(false); assert.equal(p.root.dataset.theme, "dark");
});

test("the earlier AI-only preference migrates to the shared key", () => {
  const store = new Map([["jacob-richey-ai-theme", "dark"]]);
  const p = page({ store });
  assert.equal(p.root.dataset.theme, "dark"); assert.equal(store.get(key), "dark");
});
