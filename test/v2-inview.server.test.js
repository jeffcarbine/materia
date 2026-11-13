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
  assert.equal(
    materia.render(new v2.P({ title: InView("Later"), $textContent: InView("Shown", { initial: "Loading" }) })),
    "<!DOCTYPE html><p>Loading</p>"
  );
});
