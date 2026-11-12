/**
 * Shared helpers for the MateriaJS compatibility and v2 behavior tests.
 *
 * `materia.js` decides at import time whether it is running on the server
 * (no `window`) or the client, so server and client suites live in separate
 * files. `node --test` runs every file in its own process, which keeps those
 * two modes from leaking into each other.
 */
import { JSDOM } from "jsdom";

/**
 * Waits for `materia.js` to finish loading jsdom for server-side rendering.
 * The server document is created asynchronously after import, so rendering
 * immediately after import would see `document` as undefined.
 * @param {Object} materia - A MateriaJS instance.
 * @returns {Promise<void>}
 */
export async function waitForServerDocument(materia) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if (materia.render("probe") !== undefined) return;
    } catch {
      // document is not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("materia.js never finished loading its server document");
}

/**
 * Installs a jsdom window as the browser globals `materia.js` expects.
 * Must run before `materia.js` is imported so it takes the client path.
 * @returns {JSDOM} The installed jsdom instance.
 */
export function installClientDom() {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body><main id="app"></main></body></html>`,
    { url: "http://localhost/" }
  );
  const { window } = dom;

  // jsdom does not implement IntersectionObserver; a no-op stand-in is enough
  // because these tests do not exercise viewport classes.
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  for (const name of [
    "window",
    "document",
    "Element",
    "HTMLElement",
    "Node",
    "Event",
    "KeyboardEvent",
    "MutationObserver",
    "IntersectionObserver",
  ]) {
    globalThis[name] = name === "window" ? window : window[name];
  }

  return dom;
}

/**
 * Lets queued binding handlers (which are async) settle.
 * @returns {Promise<void>}
 */
export function flush() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}
