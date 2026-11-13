/**
 * InView in the browser: values wrapped in InView wait until their element
 * scrolls into view. A stand-in IntersectionObserver lets each test decide
 * when an element enters or leaves the viewport.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { installClientDom, installIntersectionObserverStub, flush } from "./helpers.js";

installClientDom();
const viewport = installIntersectionObserverStub();
const { default: MateriaJS, InView, Bind } = await import("materiajs");
const v2 = await import("materiajs/v2/elements");

const materia = new MateriaJS({ data: {}, handlers: {}, triggers: {}, delegate: {} });
window.Materia = materia;

/**
 * Renders an element into the page and returns its DOM node.
 * @param {Object} element - A v2 element.
 * @param {MateriaJS} [instance] - The Materia instance to render with.
 * @returns {HTMLElement} The rendered node.
 */
function show(element, instance = materia) {
  return instance.render(element, (node) => document.querySelector("#app").appendChild(node)) ??
    document.querySelector("#app").lastElementChild;
}

test("an InView attribute or $ property is applied only once the element is in view", () => {
  const p = show(new v2.P({ title: InView("Hello"), $textContent: InView("Visible") }));

  assert.equal(p.hasAttribute("title"), false);
  assert.equal(p.textContent, "");

  viewport.enter(p);

  assert.equal(p.getAttribute("title"), "Hello");
  assert.equal(p.textContent, "Visible");
});

test("the initial option shows until the element is in view", () => {
  const p = show(new v2.P({ $textContent: InView("Loaded", { initial: "Loading" }), dataState: InView("ready", { initial: "waiting" }) }));

  assert.equal(p.textContent, "Loading");
  assert.equal(p.dataset.state, "waiting");

  viewport.enter(p);

  assert.equal(p.textContent, "Loaded");
  assert.equal(p.dataset.state, "ready");
});

test("by default a revealed value stays and the element stops being watched", () => {
  const p = show(new v2.P({ $textContent: InView("Seen") }));

  viewport.enter(p);
  viewport.leave(p);

  assert.equal(p.textContent, "Seen");
  assert.equal(viewport.observersFor(p).length, 0);
});

test("with once: false the value reverts when the element leaves and returns when it re-enters", () => {
  const p = show(new v2.P({ title: InView("Here", { once: false }), $textContent: InView("On", { initial: "Off", once: false }) }));

  viewport.enter(p);
  assert.equal(p.getAttribute("title"), "Here");
  assert.equal(p.textContent, "On");

  viewport.leave(p);
  assert.equal(p.hasAttribute("title"), false);
  assert.equal(p.textContent, "Off");

  viewport.enter(p);
  assert.equal(p.textContent, "On");
  assert.equal(viewport.observersFor(p).length, 1);
});

test("margin and threshold come from the InView, then the instance defaults, then 0px and 0.1", () => {
  const custom = new MateriaJS({ data: {}, handlers: {}, triggers: {}, delegate: {}, inView: { margin: "50px" } });

  const builtIn = show(new v2.P({ $textContent: InView("a") }));
  const fromDefaults = show(new v2.P({ $textContent: InView("b") }), custom);
  const fromOptions = show(new v2.P({ $textContent: InView("c", { margin: "200px", threshold: 0.5 }) }), custom);

  assert.deepEqual(viewport.observersFor(builtIn)[0].options, { rootMargin: "0px", threshold: 0.1 });
  assert.deepEqual(viewport.observersFor(fromDefaults)[0].options, { rootMargin: "50px", threshold: 0.1 });
  assert.deepEqual(viewport.observersFor(fromOptions)[0].options, { rootMargin: "200px", threshold: 0.5 });
});

test("elements with the same margin and threshold share one observer", () => {
  const a = show(new v2.P({ $textContent: InView("a", { margin: "10px" }) }));
  const b = show(new v2.P({ $textContent: InView("b", { margin: "10px" }) }));
  const c = show(new v2.P({ $textContent: InView("c", { margin: "20px" }) }));

  assert.equal(viewport.observersFor(a)[0], viewport.observersFor(b)[0]);
  assert.notEqual(viewport.observersFor(a)[0], viewport.observersFor(c)[0]);
});

test("without IntersectionObserver, InView values are applied immediately", () => {
  const stub = globalThis.IntersectionObserver;
  delete globalThis.IntersectionObserver;
  try {
    const p = show(new v2.P({ $textContent: InView("Now", { initial: "Later" }) }));
    assert.equal(p.textContent, "Now");
  } finally {
    globalThis.IntersectionObserver = stub;
  }
});

test("InView on an event key logs an error and registers no event", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  let clicks = 0;
  const button = show(new v2.Button({ __click: InView(() => clicks++) }));

  button.click();
  await flush();

  assert.equal(clicks, 0);
  assert.equal(button.hasAttribute("data-delegate-id"), false);
  assert.match(String(errors.mock.calls[0].arguments[0]), /InView.*__click/);
});

test("whole $classList, $style, $dataset, and $children values revert cleanly with once: false", () => {
  const div = show(
    new v2.Div({
      $classList: InView(["shown", "big"], { initial: ["hidden"], once: false }),
      $style: InView({ color: "red" }, { once: false }),
      $dataset: InView({ state: "on", extra: "x" }, { initial: { state: "off" }, once: false }),
      $children: InView([new v2.Span("child")], { once: false }),
    })
  );

  assert.equal(div.className, "hidden");
  assert.equal(div.dataset.state, "off");

  viewport.enter(div);
  assert.equal(div.className, "shown big");
  assert.equal(div.style.color, "red");
  assert.deepEqual({ ...div.dataset }, { state: "on", extra: "x" });
  assert.equal(div.textContent, "child");

  viewport.leave(div);
  assert.equal(div.className, "hidden");
  assert.equal(div.hasAttribute("style"), false);
  assert.deepEqual({ ...div.dataset }, { state: "off" });
  assert.equal(div.childNodes.length, 0);
});

test("an InView $contentEditable is removed again when the element leaves", () => {
  const div = show(new v2.Div({ $contentEditable: InView("true", { once: false }) }));

  viewport.enter(div);
  assert.equal(div.contentEditable, "true");

  viewport.leave(div);
  assert.equal(div.hasAttribute("contenteditable"), false);
});

// --- Phase 2: collections, children, and composition ---

/** Counts the registered handlers for a binding key. */
const handlerCount = (key) => (materia.review().handlers[key] || []).length;

test("an InView class inside $classList is added on reveal while the other classes stay", () => {
  const div = show(new v2.Div({ $classList: ["card", InView("fade-in"), "wide"] }));

  assert.equal(div.className, "card wide");

  viewport.enter(div);

  assert.equal(div.className, "card fade-in wide");
});

test("InView values inside $style and $dataset apply on reveal, with initial values before", () => {
  const div = show(
    new v2.Div({
      $style: { color: "blue", opacity: InView("1", { initial: "0" }) },
      $dataset: { kind: "card", state: InView("visible") },
    })
  );

  assert.equal(div.style.opacity, "0");
  assert.equal(div.style.color, "blue");
  assert.deepEqual({ ...div.dataset }, { kind: "card" });

  viewport.enter(div);

  assert.equal(div.style.opacity, "1");
  assert.deepEqual({ ...div.dataset }, { kind: "card", state: "visible" });
});

test("an InView $children item renders only on reveal, and its siblings are not rebuilt", () => {
  const div = show(
    new v2.Div({
      $children: [new v2.Span({ id: "before" }), InView(new v2.Em({ id: "late", $textContent: "late" })), new v2.Span({ id: "after" })],
    })
  );
  const before = div.querySelector("#before");

  assert.equal(div.querySelector("#late"), null);

  viewport.enter(div);

  assert.equal(div.querySelector("#late").textContent, "late");
  assert.equal(div.querySelector("#before"), before);
  assert.deepEqual([...div.children].map((child) => child.id), ["before", "late", "after"]);
});

test("a revealed InView class survives a bound $classList update", async () => {
  materia.set("tone", "dark");
  const div = show(new v2.Div({ $classList: [Bind("tone"), InView("fade-in")] }));

  viewport.enter(div);
  materia.set("tone", "light");
  await flush();

  assert.equal(div.className, "light fade-in");
});

test("InView(Bind(...)) registers no handler before reveal and updates live after", async () => {
  materia.set("greeting", "hi");
  const p = show(new v2.P({ $textContent: InView(Bind("greeting")), $classList: ["x", InView(Bind("greeting"))] }));

  assert.equal(handlerCount("greeting"), 0);
  assert.equal(p.textContent, "");

  viewport.enter(p);
  assert.equal(p.textContent, "hi");
  assert.equal(p.className, "x hi");

  materia.set("greeting", "hello");
  await flush();

  assert.equal(p.textContent, "hello");
  assert.equal(p.className, "x hello");
});

test("toggling an InView(Bind) in and out does not register duplicate handlers", async () => {
  materia.set("count", "1");
  const p = show(
    new v2.P({
      $textContent: InView(Bind("count"), { once: false }),
      $classList: ["c", InView(Bind("count", ({ data }) => `n${data}`), { once: false })],
    })
  );

  for (let i = 0; i < 3; i++) {
    viewport.enter(p);
    viewport.leave(p);
  }
  viewport.enter(p);

  assert.equal(handlerCount("count"), 2);
  assert.equal(p.className, "c n1");
});

test("a hidden InView(Bind) does not apply binding updates until it is shown again", async () => {
  materia.set("status", "a");
  const p = show(new v2.P({ $textContent: InView(Bind("status"), { initial: "-", once: false }) }));

  viewport.enter(p);
  viewport.leave(p);
  materia.set("status", "b");
  await flush();

  assert.equal(p.textContent, "-");

  viewport.enter(p);
  assert.equal(p.textContent, "b");
});

test("elements removed by a re-render or by destroy() stop being observed", async () => {
  materia.set("rows", ["a"]);
  const list = show(
    new v2.Ul({
      $children: Bind("rows", ({ data, elements: { Li }, core: { InView } }) =>
        data.map((row) => new Li({ $classList: ["row", InView("fade-in")], $textContent: row }))
      ),
    })
  );
  const firstRow = list.firstElementChild;
  assert.equal(viewport.observersFor(firstRow).length, 1);

  materia.set("rows", ["b"]);
  await flush();
  assert.equal(viewport.observersFor(firstRow).length, 0);

  const card = show(new v2.Div({ $classList: [InView("fade-in")] }));
  materia.destroy(card);
  assert.equal(viewport.observersFor(card).length, 0);
});

test("without IntersectionObserver, InView items in collections and children apply immediately and stay live", async () => {
  const stub = globalThis.IntersectionObserver;
  delete globalThis.IntersectionObserver;
  try {
    materia.set("mode", "on");
    const div = show(
      new v2.Div({
        $classList: ["a", InView(Bind("mode"))],
        $children: [InView(Bind("mode", ({ data, elements: { B } }) => new B(data)))],
      })
    );

    assert.equal(div.className, "a on");
    assert.equal(div.textContent, "on");

    materia.set("mode", "off");
    await flush();

    assert.equal(div.className, "a off");
    assert.equal(div.textContent, "off");
  } finally {
    globalThis.IntersectionObserver = stub;
  }
});

test("an InView child with several elements renders them all on reveal", () => {
  const div = show(new v2.Div({ $children: [InView([new v2.Em("one"), new v2.Strong("two")])] }));

  viewport.enter(div);

  assert.deepEqual([...div.children].map((child) => child.tagName), ["EM", "STRONG"]);
});

test("a toggled InView child swaps between its initial and revealed content, cleaning up bindings", async () => {
  materia.set("note", "n1");
  const div = show(
    new v2.Div({
      $children: [InView(new v2.Span({ $textContent: Bind("note") }), { initial: new v2.I("wait"), once: false })],
    })
  );
  const baseline = handlerCount("note");

  assert.equal(div.textContent, "wait");

  viewport.enter(div);
  assert.equal(div.textContent, "n1");
  assert.equal(handlerCount("note"), baseline + 1);

  viewport.leave(div);
  assert.equal(div.textContent, "wait");
  assert.equal(handlerCount("note"), baseline);
});

test("a revealed InView child survives a re-render caused by a sibling Bind", async () => {
  materia.set("caption", "c1");
  const div = show(new v2.Div({ $children: [Bind("caption"), InView(new v2.Em("shown"))] }));

  viewport.enter(div);
  materia.set("caption", "c2");
  await flush();

  assert.equal(div.textContent, "c2shown");
});

test("InView values returned by a Bind handler work and do not pile up on re-render", async () => {
  materia.set("tabs", ["x"]);
  const div = show(
    new v2.Div({
      $classList: Bind("tabs", ({ data, core: { InView } }) => ["tabs", InView(`count-${data.length}`)]),
      $children: Bind("tabs", ({ data, elements: { B }, core: { InView } }) => data.map((tab) => InView(new B(tab)))),
    })
  );

  assert.equal(div.textContent, "");
  viewport.enter(div);
  assert.equal(div.className, "tabs count-1");
  assert.equal(div.textContent, "x");

  materia.set("tabs", ["x", "y"]);
  await flush();
  assert.equal(viewport.observersFor(div).length, 1, "re-rendered values share one observer");

  viewport.enter(div);

  assert.equal(div.className, "tabs count-2");
  assert.equal(div.textContent, "xy");
  assert.equal(viewport.observersFor(div).length, 0, "all one-shot values revealed");
});

test("an InView added to an element that is already in view reveals right away", async () => {
  materia.set("late", "a");
  const div = show(new v2.Div({ $classList: ["base", InView("seen", { once: false })], $children: Bind("late", ({ data, core: { InView } }) => [InView(data)]) }));

  viewport.enter(div);
  assert.equal(div.textContent, "a");

  materia.set("late", "b");
  await flush();

  assert.equal(div.textContent, "b");
});

test("re-revealing a toggled InView(Bind) child does not register its binding again", () => {
  materia.set("pulse", "p");
  const div = show(new v2.Div({ $children: [InView(Bind("pulse"), { once: false })] }));
  const baseline = handlerCount("pulse");

  viewport.enter(div);
  viewport.leave(div);
  viewport.enter(div);

  assert.equal(div.textContent, "p");
  assert.equal(handlerCount("pulse"), baseline + 1);
});

test("an InView child removed by a re-render is ignored when the element later scrolls into view", async () => {
  materia.set("maybe", true);
  const div = show(
    new v2.Div({
      $classList: [InView("watched", { once: false })],
      $children: Bind("maybe", ({ data, core: { InView } }) => (data ? [InView("child")] : [])),
    })
  );

  materia.set("maybe", false);
  await flush();
  viewport.enter(div);

  assert.equal(div.textContent, "");
  assert.equal(div.className, "watched");
});

test("a re-render that changes an InView's margin stops the old observer watching the element", async () => {
  materia.set("gap", "10px");
  const div = show(
    new v2.Div({ $classList: Bind("gap", ({ data, core: { InView } }) => [InView("x", { margin: data })]) })
  );
  assert.equal(viewport.observersFor(div)[0].options.rootMargin, "10px");
  viewport.enter(div);
  assert.equal(div.className, "x");

  materia.set("gap", "30px");
  await flush();

  assert.deepEqual(viewport.observersFor(div).map((observer) => observer.options.rootMargin), ["30px"]);
});

// --- Phase 3: hydration edge cases (hand-written server registry) ---

/** A serialized InView as a server-rendered page hands it over. */
const serialized = (id, value, options = {}) => ({ __materiaInView: true, id, value, options });

test("hydration skips entries whose element or child anchor is no longer on the page", async () => {
  document.querySelector("#app").insertAdjacentHTML(
    "beforeend",
    `<div data-inview-id="kept"><!--something else--><span>x</span></div>`
  );

  const hydrated = new MateriaJS({
    data: {},
    handlers: {},
    triggers: {},
    delegate: {},
    inViewEntries: {
      gone: [{ kind: "value", property: "$textContent", depth: 0, inView: serialized("g", "never") }],
      kept: [{ kind: "child", property: "$children", depth: 0, inView: serialized("k", "late"), template: [], anchorId: "missing", nodeCount: 0 }],
    },
  });
  await flush();

  const kept = document.querySelector('[data-inview-id="kept"]');
  assert.equal(viewport.observersFor(kept).length, 0);
  assert.equal(kept.textContent, "x");
  hydrated.destroy(kept);
});

test("hydration without IntersectionObserver applies InView values immediately", async () => {
  document.querySelector("#app").insertAdjacentHTML("beforeend", `<p data-inview-id="eager">Waiting</p>`);
  const stub = globalThis.IntersectionObserver;
  delete globalThis.IntersectionObserver;
  try {
    new MateriaJS({
      data: {},
      handlers: {},
      triggers: {},
      delegate: {},
      inViewEntries: {
        eager: [{ kind: "value", property: "$textContent", depth: 0, inView: serialized("e", "Now", { initial: "Waiting" }) }],
      },
    });
    await flush();

    assert.equal(document.querySelector('[data-inview-id="eager"]').textContent, "Now");
  } finally {
    globalThis.IntersectionObserver = stub;
  }
});
