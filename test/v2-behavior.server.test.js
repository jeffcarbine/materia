/**
 * v2 behavior on the server: the marked v2 element surface, explicit `$`
 * properties, `__` events, `$children`, `Bind`, and `Import`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import MateriaJS, { Bind, Import, BIND_MARKER } from "materiajs";
import * as v2 from "materiajs/v2/elements";
import * as v1 from "materiajs/elements";
import { waitForServerDocument } from "./helpers.js";

const materia = new MateriaJS({});
await waitForServerDocument(materia);
materia.set("name", "Ada");

test("v2 elements are marked so render can route them to the v2 path", () => {
  assert.equal(new v2.Div({}).isV2Element, true);
  assert.equal(Object.keys(v2).length, Object.keys(v1).length);
});

test("v2 elements keep $ properties, __ events, and normal attributes", () => {
  const div = new v2.Div({ $children: [], __submit: () => {}, id: "a", dataTheme: "dark" });

  for (const key of ["$children", "__submit", "id", "dataTheme"]) {
    assert.ok(key in div, `expected v2 element to keep "${key}"`);
  }
});

test("v2 elements drop legacy child and event syntax", () => {
  const div = new v2.Div({
    child: "x",
    children: ["x"],
    click: () => {},
    "attributes:open": () => {},
    "keydown:Enter": () => {},
  });

  for (const key of ["child", "children", "click", "attributes:open", "keydown:Enter"]) {
    assert.equal(key in div, false, `v2 element should drop "${key}"`);
  }
});

test("v2 elements reject array and direct Bind shorthand for children", () => {
  assert.equal("children" in new v2.Ul(["a"]), false);
  assert.equal("$children" in new v2.Ul(["a"]), false);
  assert.equal("$children" in new v2.Div(Bind("name")), false);
});

test("Bind and Import return marked helper objects", () => {
  const handler = ({ data }) => data;

  assert.equal(Bind("name")[BIND_MARKER], true);
  assert.equal(Bind("name", handler).handler, handler);
  assert.deepEqual(Bind("name", { fmt: 1 }, handler).imports, { fmt: 1 });
  assert.deepEqual(
    { component: Import("upper", "/x.js").component, path: Import("upper", "/x.js").path },
    { component: "upper", path: "/x.js" }
  );
});

test("server render applies camelCase data, $classList, $style, $dataset, and $children", () => {
  const html = materia.render(
    new v2.Div({
      dataTheme: "dark",
      $classList: ["a", "b"],
      $style: { color: "red" },
      $dataset: { k: "v" },
      $children: [new v2.P({ $textContent: "hi" })],
    })
  );

  assert.equal(
    html,
    `<!DOCTYPE html><div data-theme="dark" class="a b" style="color:red;" data-k="v"><p>hi</p></div>`
  );
});

test("a Bind value renders its handler's result on the server", () => {
  const html = materia.render(
    new v2.P({ $textContent: Bind("name", ({ data }) => `Hi ${data}`) })
  );

  assert.match(html, /<p data-handler-id="[^"]+">Hi Ada<\/p>/);
});

test("Bind handlers receive the v2 element constructors", () => {
  const html = materia.render(
    new v2.Div({
      $children: Bind("name", ({ data, elements }) => [new elements.Strong({ $textContent: data })]),
    })
  );

  assert.match(html, /<strong>Ada<\/strong>/);
});

test("a Bind with imports still renders on the server", () => {
  const html = materia.render(
    new v2.Div({
      $textContent: Bind("name", { fmt: Import("upper", "/x.js") }, ({ data }) => data),
    })
  );

  assert.match(html, />Ada<\/div>$/);
});

test("__ events mark the element for event delegation", () => {
  const html = materia.render(new v2.Form({ __submit: () => {} }));

  assert.match(html, /<form data-delegate-id="[^"]+"[^>]*><\/form>/);
});
