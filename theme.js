(() => {
  "use strict";

  const root = document.documentElement;
  const storageKey = "jacob-richey-theme";
  const valid = (value) => value === "light" || value === "dark";
  const page = new URL(window.location.href);
  const preview = root.dataset.themePreview === "true" || page.protocol === "file:";
  let storageAvailable = true;
  let preference = null;

  function savePreference(value) {
    try {
      window.localStorage.setItem(storageKey, value);
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }
  }

  function readPreference(migrate = false) {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (valid(saved)) return saved;
      if (migrate) {
        const previous = window.localStorage.getItem("jacob-richey-ai-theme");
        if (valid(previous)) {
          savePreference(previous);
          return previous;
        }
      }
      return null;
    } catch {
      storageAvailable = false;
      return preference;
    }
  }

  preference = readPreference(true);
  const linkedTheme = page.searchParams.get("theme");
  if (valid(linkedTheme)) {
    // A local preview may have separate storage for each HTML file. The link
    // carries the latest choice, overriding an older value saved by this file.
    preference = linkedTheme;
    savePreference(preference);
  }

  const currentTheme = () => preference || "dark";

  function updateNavigation() {
    const carryTheme = preview || !storageAvailable;
    const current = new URL(window.location.href);
    const directory = new URL(".", current).href;
    for (const link of document.querySelectorAll("a[href]")) {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || link.hasAttribute("download")) continue;
      let destination;
      try {
        destination = new URL(href, document.baseURI);
      } catch {
        continue;
      }
      // Keep PDFs, external sites, and in-page anchors untouched. Every page
      // of this site lives in the same directory, in both source and previews.
      if (!["file:", "http:", "https:"].includes(destination.protocol)
        || !/\.html$/i.test(destination.pathname)
        || new URL(".", destination).href !== directory) continue;
      if (carryTheme && preference) destination.searchParams.set("theme", preference);
      else destination.searchParams.delete("theme");
      link.setAttribute("href", destination.pathname.split("/").pop() + destination.search + destination.hash);
    }
    // Preserve the current choice on reload even if storage is blocked. Hosted
    // pages with working shared storage keep their ordinary, clean URLs.
    if (carryTheme || valid(current.searchParams.get("theme"))) {
      if (carryTheme && preference) current.searchParams.set("theme", preference);
      else current.searchParams.delete("theme");
      if (current.href !== window.location.href) {
        try {
          window.history.replaceState(window.history.state, "", current.href);
        } catch {
          // Sandboxed previews may forbid history edits; page links still work.
        }
      }
    }
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const matrix = root.dataset.palette === "matrix";
      meta.setAttribute("content", theme === "dark"
        ? (matrix ? "#030906" : "#111a23")
        : (matrix ? "#eef8ef" : "#e7f1f8"));
    }
    updateNavigation();
    const button = document.querySelector(".theme-toggle");
    if (!button) return;
    const next = theme === "dark" ? "Light mode" : "Dark mode";
    button.querySelector("[data-theme-label]").textContent = next;
    button.setAttribute("aria-label", `Switch to ${next.toLowerCase()}`);
    button.title = `Switch to ${next.toLowerCase()}`;
  }

  // Runs in the head so a saved theme is applied before the page is painted.
  applyTheme(currentTheme());

  function connectToggle() {
    const button = document.querySelector(".theme-toggle");
    if (!button) return;
    applyTheme(currentTheme());
    button.hidden = false;
    button.addEventListener("click", () => {
      preference = root.dataset.theme === "dark" ? "light" : "dark";
      savePreference(preference);
      applyTheme(preference);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", connectToggle, { once: true });
  } else {
    connectToggle();
  }

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    // Back/Forward may restore the old DOM without running the head script.
    if (storageAvailable) preference = readPreference();
    applyTheme(currentTheme());
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : null;
    applyTheme(currentTheme());
  });
})();
