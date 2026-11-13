/**
 * v2 server rendering end to end: render a page on the server, load it in a
 * browser with the state the server handed over, then change data and check
 * that every binding on the page updates in place.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { installClientDom, flush } from "./helpers.js";

const fixture = fileURLToPath(new URL("./fixtures/ssr-view.mjs", import.meta.url));
const { html, state } = JSON.parse(execFileSync(process.execPath, [fixture], { encoding: "utf8" }));

// Load the server's page without its bootstrap script; the test plays that role.
installClientDom(html.replace(/<script[\s\S]*?<\/script>/g, ""));
const { default: MateriaJS } = await import("materiajs");
const materia = new MateriaJS(state);
// Server-rendered pages expose the instance globally for handlers to use
window.Materia = globalThis.Materia = materia;

const $ = (selector) => document.querySelector(selector);
const staticSpan = $("#static");

materia.set("user.theme", "light");
materia.set("user.lang", "fr");
materia.set("user.name", "Grace");
materia.push("items", "b");
await flush();

test("the server-rendered page matches the initial data", () => {
  assert.match(html, /<body[^>]*data-theme="dark"/);
  assert.match(html, /Welcome, Ada/);
});

test("Binds on the html and body attributes update after hydration", () => {
  assert.equal(document.documentElement.lang, "fr");
  assert.equal(document.body.dataset.theme, "light");
});

test("nested Binds deep inside static $children update after hydration", () => {
  assert.equal($("#title").textContent, "Welcome, Grace");
  assert.equal($("#mixed").textContent, "Signed in as Grace!");
});

test("Binds inside $classList and $style update after hydration", () => {
  assert.equal($("#panel").className, "panel theme-light");
  assert.equal($("#panel").style.color, "blue");
});

test("a Bind as the $children value re-renders its list after hydration", () => {
  assert.deepEqual([...$("#items").children].map((li) => li.textContent), ["a", "b"]);
});

test("static elements are not rebuilt when unrelated data changes", () => {
  assert.equal($("#static"), staticSpan);
  assert.doesNotMatch(document.documentElement.outerHTML, /\[object Object\]/);
});

test("a Handle with an Import still works after the page updates", async () => {
  $("#greet").click();
  await flush();

  assert.equal($("#greet").textContent, "Hello, Grace");
});

test("a Handle inside a re-rendered $children keeps working after hydration", async () => {
  assert.equal($("#actions").firstChild.textContent, "Grace: ");

  $("#say").click();
  $("#bare").click();
  await flush();

  assert.equal($("#say").textContent, "hi");
  assert.equal($("#bare").textContent, "bare");
});

test("a Bind with a single imported function re-renders after hydration", () => {
  assert.equal($("#greeting").textContent, "Hello, Grace");
});
