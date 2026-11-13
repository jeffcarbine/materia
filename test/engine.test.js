/**
 * The Express view engine, exercised with a stub app so the test needs no
 * server: it registers the `.html.js` engine and the browser module routes,
 * and renders views with app, view, function, and request props.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import engine from "materiajs/engine";

const views = fileURLToPath(new URL("./fixtures/views/", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));

/**
 * Builds a stub Express app that records what the engine registers.
 * @returns {Object} The stub app.
 */
function stubApp() {
  const app = { engines: {}, settings: {}, routes: {} };
  app.engine = (ext, fn) => (app.engines[ext] = fn);
  app.set = (key, value) => (app.settings[key] = value);
  app.get = (route, fn) => (app.routes[route] = fn);
  return app;
}

const app = stubApp();
await engine(app, { siteName: "Materia" });

/**
 * Renders a view through the registered engine.
 * @param {string} file - The view file name.
 * @param {Object} data - The `res.render` data.
 * @returns {Promise<string>} The rendered HTML.
 */
const renderView = (file, data) =>
  new Promise((resolve, reject) =>
    app.engines["html.js"](path.join(views, file), data, (error, html) =>
      error ? reject(error) : resolve(html)
    )
  );

test("the engine registers the .html.js view engine", () => {
  assert.equal(app.settings["view engine"], "html.js");
  assert.equal(typeof app.engines["html.js"], "function");
});

test("the engine serves materia's modules for the browser", () => {
  const expected = {
    "/materia.js": "materia.js",
    "/materiajs/elements": "elements.html.js",
    "/materiajs/v2/elements": "elements-v2.html.js",
    "/materiajs/attributes": "attributes.js",
    "/materiajs/validProps": "validProps.js",
  };

  for (const [route, file] of Object.entries(expected)) {
    let sent;
    app.routes[route]({}, { sendFile: (filePath) => (sent = filePath) });
    assert.equal(sent, path.join(root, file), route);
  }
});

test("a view renders with app props, view props, function props, and request data", async () => {
  const data = { page: 2, user: { name: "Ada" } };
  const html = await renderView("page.html.js", data);

  assert.match(html, /<p id="greeting"[^>]*>Hello, Ada<\/p>/);
  assert.match(html, /<p id="site"[^>]*>Materia<\/p>/);
  assert.match(html, /<p id="request"[^>]*>page 2<\/p>/);
  assert.match(html, /<p id="lazy"[^>]*>loaded later<\/p>/);
  assert.match(html, /<p id="materia">Hello<\/p>/);
  assert.equal(data.materia.siteName, "Materia");
});

test("a cached view renders again on the next request", async () => {
  const html = await renderView("page.html.js", { page: 3, user: { name: "Grace" } });

  assert.match(html, /Hello, Grace/);
  assert.match(html, /page 3/);
});

test("a view whose props are not an object still renders, with an error logged", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const html = await renderView("broken-props.html.js", {});

  assert.match(html, /rendered anyway/);
  assert.match(String(errors.mock.calls[0].arguments[0]), /Expected an object/);
});

test("a view that fails to load reports the error", async (t) => {
  t.mock.method(console, "error", () => {});

  await assert.rejects(renderView("missing.html.js", {}));
});

test("a view can export its initial data as `data`, or export none", async () => {
  assert.match(await renderView("data-export.html.js", {}), />Data export<\/p>/);
  assert.match(await renderView("bare.html.js", {}), />No props<\/p>/);
});

test("InView defaults passed to the engine reach the page's startup script", async () => {
  const configured = stubApp();
  await engine(configured, {}, { inView: { margin: "77px", threshold: 0.3 } });

  const html = await new Promise((resolve, reject) =>
    configured.engines["html.js"](path.join(views, "inview.html.js"), {}, (error, out) =>
      error ? reject(error) : resolve(out)
    )
  );

  assert.match(html, /data-inview-id/);
  assert.match(html, /\\"margin\\":\\"77px\\",\\"threshold\\":0.3/);
});
