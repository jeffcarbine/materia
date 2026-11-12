/**
 * v2 behavior in the browser: Bind-driven values and children update when data
 * changes, and `__` events fire.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { installClientDom, flush } from "./helpers.js";

installClientDom();
const { default: MateriaJS, Bind, Import, Handle } = await import("materiajs");
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

/**
 * Renders a button with the given __click value and clicks it.
 * @param {*} handler - The __click value.
 * @returns {Promise<HTMLElement>} The clicked button.
 */
async function clickWith(handler) {
  const id = `btn-${Math.random().toString(36).slice(2)}`;
  materia.render(new v2.Button({ id, __click: handler }), "#app");
  $(`#${id}`).click();
  await flush();
  return $(`#${id}`);
}

test("a bare-function __ event handler receives the v2 context object", async () => {
  let context;
  const button = await clickWith((ctx) => (context = ctx));

  assert.equal(context.target, button);
  assert.equal(context.event.type, "click");
  assert.equal(context.imports, null);
  assert.equal(context.elements, v2);
  assert.deepEqual(Object.keys(context.core).sort(), ["Bind", "Handle", "Import"]);
});

test("Handle passes plain imports and resolves Import helpers", async () => {
  const { greet } = await import("./fixtures/greeter.js");
  let result;
  await clickWith(
    Handle([Import(greet, "/fixtures/greeter.js"), "Ada"], ({ imports: [greet, name] }) => {
      result = greet(name);
    })
  );

  assert.equal(result, "Hello, Ada");
});

test("a client hydrated from server delegate state runs the handler with imports loaded", async () => {
  const button = document.createElement("button");
  button.dataset.delegateId = "hydrated";
  $("#app").appendChild(button);

  const hydrated = new MateriaJS({
    data: {},
    handlers: {},
    triggers: {},
    delegate: {
      click: [
        {
          target: "hydrated",
          func: "({ target, imports }) => { target.textContent = imports.greet('Grace'); }",
          pipe: null,
          preventDefault: true,
          v2: true,
          imports: {
            greet: {
              path: new URL("./fixtures/greeter.js", import.meta.url).href,
              componentName: "greet",
            },
          },
        },
      ],
    },
  });

  button.click();
  await flush();
  hydrated.destroy(button);

  assert.equal(button.textContent, "Hello, Grace");
});

test("__keydown:Key and __clickOutside handlers receive the v2 context object", async () => {
  let keyContext, outsideContext;
  materia.render(
    new v2.Input({ id: "keys", "__keydown:Enter": (ctx) => (keyContext = ctx) }),
    "#app"
  );
  materia.render(new v2.Div({ __clickOutside: (ctx) => (outsideContext = ctx) }), "#app");

  $("#keys").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  document.body.click();
  await flush();

  assert.equal(keyContext.target, $("#keys"));
  assert.equal(keyContext.event.key, "Enter");
  assert.equal(keyContext.elements, v2);
  assert.equal(outsideContext.event.type, "click");
  assert.equal(outsideContext.elements, v2);
});

test("Bind handlers can use Handle from core", async () => {
  let core;
  materia.render(
    new v2.Div({ $textContent: Bind("name", ({ data, core: c }) => ((core = c), data)) }),
    "#app"
  );

  assert.equal(typeof Handle, "function");
  assert.equal(core.Handle, Handle);
});

test("a Handle on an element inside $children that also holds a Bind keeps working", async () => {
  let received;
  materia.render(
    new v2.Div({
      $children: [
        new v2.Span({ $textContent: Bind("name") }),
        new v2.Button({ id: "nested-handle", __click: Handle("ok", ({ imports }) => (received = imports)) }),
      ],
    }),
    "#app"
  );

  $("#nested-handle").click();
  await flush();

  assert.equal(received, "ok");
});

test("a __load handler receives the v2 context object when rendered in the browser", async () => {
  let context;
  materia.render(new v2.Div({ id: "loaded", __load: (ctx) => (context = ctx) }), "#app");
  await flush();

  assert.equal(context.target, $("#loaded"));
  assert.equal(context.event.type, "load");
  assert.equal(context.elements, v2);
});

test("a hydrated __load delegate runs with the v2 context object on page load", async () => {
  const div = document.createElement("div");
  div.dataset.delegateId = "hydrated-load";
  $("#app").appendChild(div);

  const hydrated = new MateriaJS({
    data: {},
    handlers: {},
    triggers: {},
    delegate: {
      load: [
        {
          target: "hydrated-load",
          func: "({ target, event, imports }) => { target.textContent = event.type + ':' + imports; }",
          pipe: null,
          preventDefault: true,
          v2: true,
          imports: "ready",
        },
      ],
    },
  });

  hydrated.loadHandler();
  await flush();

  assert.equal(div.textContent, "load:ready");
});

test("__clickOutside runs only for clicks outside its element, with that element as target", async () => {
  const calls = [];
  materia.render(
    new v2.Div({
      id: "menu",
      $children: [new v2.Button({ id: "menu-item" })],
      __clickOutside: ({ target }) => calls.push(target),
    }),
    "#app"
  );

  $("#menu-item").click();
  await flush();
  assert.equal(calls.length, 0, "a click inside the element should not count as outside");

  const outside = new window.MouseEvent("click", { bubbles: true, cancelable: true });
  document.body.dispatchEvent(outside);
  await flush();
  assert.deepEqual(calls, [$("#menu")]);
  assert.equal(outside.defaultPrevented, false, "clicks elsewhere keep their default action");
});
