/**
 * InView on the server: the helper's shape, and that server output shows only
 * the initial value (or nothing) for values waiting to scroll into view.
 */
import test from "node:test";
import assert from "node:assert/strict";
import MateriaJS, { InView, INVIEW_MARKER } from "materiajs";
import * as v2 from "materiajs/v2/elements";
import { waitForServerDocument } from "./helpers.js";

const materia = new MateriaJS({});
await waitForServerDocument(materia);

test("InView returns a marked helper holding the value and its options", () => {
  assert.equal(INVIEW_MARKER, Symbol.for("materiaInView"));

  const plain = InView("fade-in");
  assert.equal(plain[INVIEW_MARKER], true);
  assert.equal(plain.value, "fade-in");
  assert.deepEqual(plain.options, {});

  const configured = InView({ marginTop: "1rem" }, { initial: { marginTop: "2rem" }, margin: "100px", threshold: 0.5, once: false });
  assert.deepEqual(configured.value, { marginTop: "1rem" });
  assert.deepEqual(configured.options, { initial: { marginTop: "2rem" }, margin: "100px", threshold: 0.5, once: false });
});

test("server output shows the initial value, or nothing, for an InView value", () => {
  assert.match(
    materia.render(new v2.P({ title: InView("Later"), $textContent: InView("Shown", { initial: "Loading" }) })),
    /^<!DOCTYPE html><p data-inview-id="[^"]+">Loading<\/p>$/
  );
});

test("server output marks InView elements and child anchors, and the registry describes them", () => {
  const html = materia.render(
    new v2.Div({
      $classList: ["a", InView("b")],
      $children: [InView(new v2.Em("late"), { initial: "soon" })],
    })
  );
  const id = html.match(/data-inview-id="([^"]+)"/)[1];
  const anchor = html.match(/<!--materia-inview:([^-]+)-->soon/)[1];
  const entries = materia.review().inViewEntries[id];

  assert.match(html, /class="a"/);
  assert.deepEqual(entries.map((entry) => entry.kind).sort(), ["child", "collection"]);
  assert.equal(entries.find((entry) => entry.kind === "child").anchorId, anchor);
  assert.equal(entries.find((entry) => entry.kind === "collection").inView.__materiaInView, true);
});

test("a full page's startup script hands the InView registry and defaults to the browser", () => {
  const server = new MateriaJS({ inView: { margin: "40px" } });
  const page = server.render(
    new v2.Html({ $children: [new v2.Head({}), new v2.Body({ $children: [new v2.P({ $textContent: InView("x") })] })] })
  );

  assert.match(page, /inViewEntries/);
  assert.match(page, /\\"margin\\":\\"40px\\"/);
});
