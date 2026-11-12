/**
 * v2 behavior in the browser: Bind-driven values and children update when data
 * changes, and `__` events fire.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { installClientDom, flush } from "./helpers.js";

installClientDom();
const { default: MateriaJS, Bind } = await import("materiajs");
const v2 = await import("materiajs/v2/elements");

const materia = new MateriaJS({
  data: { name: "Ada", items: ["a"] },
  handlers: {},
  triggers: {},
  delegate: {},
});
window.Materia = materia;

const $ = (selector) => document.querySelector(selector);

test("a Bind on $textContent updates when its data changes", async () => {
  materia.render(
    new v2.P({ id: "greeting", $textContent: Bind("name", ({ data }) => `Hi ${data}`) }),
    "#app"
  );
  assert.equal($("#greeting").textContent, "Hi Ada");

  materia.set("name", "Grace");
  await flush();

  assert.equal($("#greeting").textContent, "Hi Grace");
});

test("a Bind on $children re-renders the list with v2 elements", async () => {
  materia.render(
    new v2.Ul({
      id: "list",
      $children: Bind("items", ({ data, elements }) =>
        data.map((item) => new elements.Li({ $textContent: item }))
      ),
    }),
    "#app"
  );
  assert.equal($("#list").children.length, 1);

  materia.push("items", "b");
  await flush();

  assert.deepEqual([...$("#list").children].map((li) => li.textContent), ["a", "b"]);
});

test("a Bind nested inside static $children still updates", async () => {
  materia.render(
    new v2.Div({ $children: [new v2.Span({ id: "inner", $textContent: Bind("name") })] }),
    "#app"
  );

  materia.set("name", "Hedy");
  await flush();

  assert.equal($("#inner").textContent, "Hedy");
});

test("a __click handler runs when the element is clicked", async () => {
  let clicks = 0;
  materia.render(new v2.Button({ id: "go", __click: () => clicks++ }), "#app");

  $("#go").click();
  await flush();

  assert.equal(clicks, 1);
});
