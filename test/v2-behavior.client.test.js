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
  assert.deepEqual(Object.keys(context.core).sort(), ["Bind", "Handle", "Import", "InView"]);
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

test("a nested Bind updates only its own element, leaving siblings untouched", async () => {
  materia.set("label", "one");
  materia.render(
    new v2.Div({
      id: "form",
      $children: [
        new v2.Input({ id: "field" }),
        new v2.Span({ id: "label", $textContent: Bind("label") }),
      ],
    }),
    "#app"
  );
  const field = $("#field");
  field.value = "typed";

  materia.set("label", "two");
  await flush();

  assert.equal($("#label").textContent, "two");
  assert.equal($("#field"), field);
  assert.equal($("#field").value, "typed");
});

test("re-rendering a bound list does not pile up handlers for removed items", async () => {
  materia.set("rows", ["x"]);
  materia.render(
    new v2.Ul({
      $children: Bind("rows", ({ data, elements: { Li }, core: { Bind } }) =>
        data.map(() => new Li({ $textContent: Bind("label") }))
      ),
    }),
    "#app"
  );

  for (let i = 0; i < 5; i++) {
    materia.set("rows", ["x", `y${i}`]);
    await flush();
    materia.set("label", `l${i}`);
    await flush();
  }

  const live = document.querySelectorAll("[data-handler-id]").length;
  const labelHandlers = materia.review().handlers.label.length;
  assert.ok(labelHandlers <= live, `${labelHandlers} label handlers for ${live} live bound elements`);
});

test("a Bind on several keys updates when any of them changes", async () => {
  materia.set("first", "Ada");
  materia.set("last", "Lovelace");
  materia.render(
    new v2.P({ id: "full", $textContent: Bind(["first", "last"], ({ data: [first, last] }) => `${first} ${last}`) }),
    "#app"
  );

  materia.set("last", "Byron");
  await flush();

  assert.equal($("#full").textContent, "Ada Byron");
});

test("Bind imports given as an object or array resolve in the browser", async () => {
  const { greet } = await import("./fixtures/greeter.js");
  materia.render(
    new v2.P({
      id: "imported",
      $textContent: Bind("name", { greet: Import(greet, "/fixtures/greeter.js"), marks: ["!", "?"] }, ({ data, imports }) => imports.greet(data) + imports.marks.join("")),
    }),
    "#app"
  );

  assert.match($("#imported").textContent, /^Hello, .+!\?$/);
});

test("a handler whose element was removed is dropped on its next update", async () => {
  materia.set("cells", ["a"]);
  materia.set("cellLabel", "x");
  materia.render(
    new v2.Ul({
      $children: Bind("cells", ({ data, elements: { Li, Span }, core: { Bind } }) =>
        data.map(() => new Li({ $children: [new Span({ $textContent: Bind("cellLabel") })] }))
      ),
    }),
    "#app"
  );

  materia.set("cells", ["a", "b"]);
  await flush();
  materia.set("cellLabel", "y");
  await flush();

  const live = [...document.querySelectorAll("span[data-handler-id]")].filter((span) => span.textContent === "y");
  assert.equal(materia.review().handlers.cellLabel.length, live.length);
});

test("text that looks like code is rendered as plain text", () => {
  const p = materia.render(new v2.P({ $textContent: "class notes start at 9", title: "() => soon" }));

  assert.equal(p.textContent, "class notes start at 9");
  assert.equal(p.getAttribute("title"), "() => soon");
});

test("a listed $ property without special handling sets the DOM property", () => {
  const div = materia.render(new v2.Div({ $contentEditable: "true" }));

  assert.equal(div.contentEditable, "true");
});

test("a Bind item in $children that returns several elements adds them all", async () => {
  materia.set("tags", ["x", "y"]);
  materia.render(
    new v2.P({
      id: "tags",
      $children: ["Tags: ", Bind("tags", ({ data, elements: { Span } }) => data.map((tag) => new Span(tag)))],
    }),
    "#app"
  );

  assert.equal($("#tags").textContent, "Tags: xy");

  materia.push("tags", "z");
  await flush();

  assert.equal($("#tags").textContent, "Tags: xyz");
});

test("a bound element that was never added to the page drops its handler on update", async () => {
  materia.set("detached", "a");
  materia.render(new v2.P({ $textContent: Bind("detached") }));
  assert.equal(materia.review().handlers.detached.length, 1);

  materia.set("detached", "b");
  await flush();

  assert.equal(materia.review().handlers.detached.length, 0);
});

test("__clickOutside ignores clicks once its element is removed", async () => {
  let calls = 0;
  materia.render(new v2.Div({ id: "gone", __clickOutside: () => calls++ }), "#app");
  $("#gone").remove();

  document.body.click();
  await flush();

  assert.equal(calls, 0);
});

test("an Import falls back to the module's default export", async () => {
  const button = document.createElement("button");
  button.dataset.delegateId = "default-import";
  $("#app").appendChild(button);

  const hydrated = new MateriaJS({
    data: {},
    handlers: {},
    triggers: {},
    delegate: {
      click: [
        {
          target: "default-import",
          func: "({ target, imports: greet }) => { target.textContent = greet('Hedy'); }",
          pipe: null,
          preventDefault: true,
          v2: true,
          imports: {
            path: new URL("./fixtures/default-greeter.js", import.meta.url).href,
            componentName: "missing",
          },
        },
      ],
    },
  });

  button.click();
  await flush();
  hydrated.destroy(button);

  assert.equal(button.textContent, "Hi, Hedy");
});
