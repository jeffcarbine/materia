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
const { default: MateriaJS, InView } = await import("materiajs");
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
