/**
 * v1 compatibility on the server: legacy element construction and server-side
 * rendering keep working exactly as they did before the v2 rollout.
 */
import test from "node:test";
import assert from "node:assert/strict";
import MateriaJS from "materiajs";
import * as el from "materiajs/elements";
import { waitForServerDocument } from "./helpers.js";

const materia = new MateriaJS({});
await waitForServerDocument(materia);

test("v1 elements are not marked as v2 elements", () => {
  assert.equal(new el.Div({}).isV2Element, undefined);
});

test("v1 elements keep legacy child, event, and data-* keys", () => {
  const div = new el.Div({
    child: "x",
    click: () => {},
    "attributes:open": () => {},
    "keydown:Enter": () => {},
    "data-id": "1",
  });

  for (const key of ["child", "click", "attributes:open", "keydown:Enter", "data-id"]) {
    assert.ok(key in div, `expected v1 element to keep "${key}"`);
  }
});

test("v1 elements ignore v2-only $ properties and __ events", () => {
  const div = new el.Div({ $children: ["x"], $textContent: "x", __click: () => {} });

  assert.equal("$children" in div, false);
  assert.equal("$textContent" in div, false);
  assert.equal("__click" in div, false);
});

test("a string argument becomes text, or src/href for media and links", () => {
  assert.equal(new el.P("hello").textContent, "hello");
  assert.equal(new el.Img("a.png").src, "a.png");
  assert.equal(new el.Link("a.css").href, "a.css");
});

test("server render outputs attributes, data-* keys, and children", () => {
  const html = materia.render(
    new el.Div({ class: "box", "data-x": "1", children: [new el.P("hi"), "text"] })
  );

  assert.equal(html, `<!DOCTYPE html><div class="box" data-x="1"><p>hi</p>text</div>`);
});

test("a single child passed with `child` renders inside its parent", () => {
  assert.equal(
    materia.render(new el.Div({ child: new el.Span("one") })),
    `<!DOCTYPE html><div><span>one</span></div>`
  );
});

test("array shorthand wraps list items in the right child element", () => {
  assert.equal(
    materia.render(new el.Ul(["a", "b"])),
    `<!DOCTYPE html><ul><li>a</li><li>b</li></ul>`
  );
});

test("an element with a falsy `if` renders nothing", () => {
  assert.equal(materia.render(new el.Div({ if: false, textContent: "x" })), null);
});

test("a function value with a `binding` renders the bound data on the server", () => {
  materia.set("name", "Ada");
  const html = materia.render(
    new el.P({ binding: "name", textContent: (name) => `Hi ${name}` })
  );

  assert.match(html, /^<!DOCTYPE html><p data-handler-id="[^"]+">Hi Ada<\/p>$/);
});

test("legacy event keys mark the element for event delegation", () => {
  const html = materia.render(new el.Button({ click: () => {}, textContent: "go" }));

  assert.match(html, /<button data-delegate-id="[^"]+">go<\/button>/);
});
