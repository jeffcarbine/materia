/**
 * v1 public surface: every export and Materia method that shipped on `main`
 * (recorded in fixtures/v1-public-surface.json) must still exist.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const baseline = JSON.parse(
  await readFile(new URL("./fixtures/v1-public-surface.json", import.meta.url))
);
const pkg = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url))
);

for (const [entry, names] of Object.entries(baseline.entryPoints)) {
  test(`package entry "${entry}" still exports everything it did in v1`, async () => {
    assert.ok(pkg.exports[entry], `package.json no longer exports "${entry}"`);

    const specifier = entry === "." ? "materiajs" : `materiajs/${entry.slice(2)}`;
    const mod = await import(specifier);
    const missing = names.filter((name) => !(name in mod));

    assert.deepEqual(missing, [], `missing v1 exports from "${entry}"`);
  });
}

test("the Materia class still has every v1 public method", async () => {
  const MateriaJS = (await import("materiajs")).default;
  const missing = baseline.materiaMethods.filter(
    (name) => typeof MateriaJS.prototype[name] !== "function"
  );

  assert.deepEqual(missing, []);
});

test("the legacy Materia prop list still contains every v1 prop", async () => {
  const { validMateriaProps } = await import("materiajs/attributes");
  const missing = baseline.legacyMateriaProps.filter(
    (name) => !validMateriaProps.includes(name)
  );

  assert.deepEqual(missing, []);
});
