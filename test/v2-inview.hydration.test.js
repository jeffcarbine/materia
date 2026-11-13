/**
 * InView on a server-rendered page: the server shows initial states, and the
 * browser picks up the pending InView values on load and reveals them as
 * elements scroll into view.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { installClientDom, installIntersectionObserverStub, flush } from "./helpers.js";

const fixture = fileURLToPath(new URL("./fixtures/ssr-inview-view.mjs", import.meta.url));
const { html, state } = JSON.parse(execFileSync(process.execPath, [fixture], { encoding: "utf8" }));

installClientDom(`<!DOCTYPE html><html><body>${html.replace("<!DOCTYPE html>", "")}</body></html>`);
const viewport = installIntersectionObserverStub();
const { default: MateriaJS } = await import("materiajs");
const materia = new MateriaJS(state);
window.Materia = globalThis.Materia = materia;
await flush();

const $ = (selector) => document.querySelector(selector);

test("the server-rendered page shows each InView's initial state", () => {
  assert.equal($("#top").textContent, "Waiting");
  assert.equal($("#top").hasAttribute("title"), false);
  assert.equal($("#panel").className, "panel dark");
  assert.equal($("#kids").textContent, "firstloadinglast");
});

test("top-level InView values reveal on scroll, using the defaults from the server", () => {
  assert.equal(viewport.observersFor($("#top"))[0].options.rootMargin, "25px");

  viewport.enter($("#top"));

  assert.equal($("#top").textContent, "Shown");
  assert.equal($("#top").getAttribute("title"), "t");
});

test("a revealed InView class in a bound $classList survives a binding update after hydration", async () => {
  viewport.enter($("#panel"));
  assert.equal($("#panel").className, "panel dark fade-in");

  materia.set("tone", "light");
  await flush();

  assert.equal($("#panel").className, "panel light fade-in");
});

test("an InView child replaces its initial content on scroll without rebuilding its siblings", async () => {
  const first = $("#first");

  viewport.enter($("#kids"));
  await flush();

  assert.equal($("#late").textContent, "light");
  assert.equal($("#kids").textContent, "firstlightlast");
  assert.equal($("#first"), first);
});

test("a component inside InView renders with its classes, handlers, and bindings after hydration", async () => {
  assert.equal($("#comp").textContent, "…");

  viewport.enter($("#comp"));
  await flush();

  const badge = $("#badge");
  assert.equal(badge.className, "badge");
  assert.equal(badge.textContent, "light");

  badge.click();
  await flush();
  assert.equal(badge.dataset.clicked, "yes");

  materia.set("tone", "blue");
  await flush();
  assert.equal($("#badge").textContent, "blue");
});

test("an InView(Bind) whose handler builds an imported component works after hydration", async () => {
  assert.equal($("#bound-comp").textContent, "");

  viewport.enter($("#bound-comp"));
  await flush();

  assert.equal($("#made").className, "badge");
  assert.equal($("#made").textContent, "made blue");

  materia.set("tone", "green");
  await flush();
  assert.equal($("#made").textContent, "made green");

  $("#made").click();
  await flush();
  assert.equal($("#made").dataset.clicked, "yes");
});
