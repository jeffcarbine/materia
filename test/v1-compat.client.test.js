/**
 * v1 compatibility in the browser: legacy bindings update the DOM when data
 * changes, and legacy event keys still fire.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { installClientDom, flush } from "./helpers.js";

installClientDom();
const { default: MateriaJS } = await import("materiajs");
const el = await import("materiajs/elements");

const materia = new MateriaJS({
  data: { name: "Ada", items: ["a"] },
  handlers: {},
  triggers: {},
  delegate: {},
});
window.Materia = materia;

const $ = (selector) => document.querySelector(selector);

test("a bound text value updates when its data changes", async () => {
  materia.render(
    new el.P({ id: "greeting", binding: "name", textContent: (name) => `Hi ${name}` }),
    "#app"
  );
  assert.equal($("#greeting").textContent, "Hi Ada");

  materia.set("name", "Grace");
  await flush();

  assert.equal($("#greeting").textContent, "Hi Grace");
});

test("bound children re-render when an item is pushed", async () => {
  materia.render(
    new el.Ul({
      id: "list",
      binding: "items",
      children: (items) => items.map((item) => new el.Li(item)),
    }),
    "#app"
  );
  assert.equal($("#list").children.length, 1);

  materia.push("items", "b");
  await flush();

  assert.deepEqual([...$("#list").children].map((li) => li.textContent), ["a", "b"]);
});

test("a legacy `click` key runs its handler", async () => {
  let clicks = 0;
  materia.render(new el.Button({ id: "go", click: () => clicks++ }), "#app");

  $("#go").click();
  await flush();

  assert.equal(clicks, 1);
});

test("get, set, and update keep their v1 data semantics", () => {
  materia.set("user.profile.age", 30);
  materia.update("user.profile", { city: "Paris" });

  assert.equal(materia.get("user.profile.age"), 30);
  assert.equal(materia.get("user.profile.city"), "Paris");
  assert.equal(materia.get("missing.path"), "");
});
