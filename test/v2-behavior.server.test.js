/**
 * v2 behavior on the server: the marked v2 element surface, explicit `$`
 * properties, `__` events, `$children`, `Bind`, and `Import`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import MateriaJS, { Bind, Import, Handle, BIND_MARKER, HANDLE_MARKER } from "materiajs";
import { greet } from "./fixtures/greeter.js";
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

test("Handle returns a marked helper with optional imports", () => {
  const handler = ({ target }) => target;

  assert.equal(HANDLE_MARKER, Symbol.for("materiaHandle"));
  assert.equal(Handle(handler)[HANDLE_MARKER], true);
  assert.equal(Handle(handler).handler, handler);
  assert.equal(Handle(handler).imports, null);
  assert.deepEqual(Handle({ n: 1 }, handler).imports, { n: 1 });
  assert.equal(Handle({ n: 1 }, handler).handler, handler);
});

/**
 * Returns the most recently registered delegate for an event.
 * @param {string} event - The delegate event name.
 * @returns {Object} The delegate entry.
 */
const lastDelegate = (event) => materia.review().delegate[event].at(-1);

test("a server-rendered __ event is stored as a v2 delegate with its handler as a string", () => {
  materia.render(new v2.Button({ __click: ({ target }) => target }));
  const delegate = lastDelegate("click");

  assert.equal(delegate.v2, true);
  assert.equal(typeof delegate.func, "string");
  assert.equal(delegate.imports, null);
});

test("Handle imports are serialized into the delegate state, with Import as a path", () => {
  materia.render(
    new v2.Button({
      __click: Handle(
        { greet: Import(greet, "/fixtures/greeter.js"), prefix: ">" },
        ({ imports }) => imports.greet(imports.prefix)
      ),
    })
  );
  const delegate = lastDelegate("click");

  assert.equal(delegate.v2, true);
  assert.deepEqual(delegate.imports, {
    greet: { path: "/fixtures/greeter.js", componentName: "greet" },
    prefix: ">",
  });
  assert.equal(JSON.parse(JSON.stringify(delegate)).imports.greet.path, "/fixtures/greeter.js");
});

test("every v2 element class constructs with no arguments, an object, or a string", () => {
  const failures = [];
  for (const [name, ElementClass] of Object.entries(v2)) {
    for (const args of [[], [{}], ["text"]]) {
      try {
        const element = new ElementClass(...args);
        assert.equal(element.isV2Element, true);
      } catch (error) {
        failures.push(`${name}(${JSON.stringify(args).slice(1, -1)}): ${error.message}`);
      }
    }
  }

  assert.deepEqual(failures, []);
});

test("a string argument sets src on Img and Script, href on Link, and text elsewhere", () => {
  assert.equal(new v2.Img("a.png").src, "a.png");
  assert.equal(new v2.Script("a.js").src, "a.js");
  assert.equal(new v2.Link("a.css").href, "a.css");
  assert.equal(new v2.P("hi").$textContent, "hi");
});

test("the classList.add helper appends classes without duplicates", () => {
  const div = new v2.Div({});
  div.classList.add("a");
  div.classList.add("b");
  div.classList.add("a");

  assert.equal(div.class, "a b");
});

test("external links get noopener and noreferrer added to rel", () => {
  assert.equal(new v2.A({ href: "https://example.com" }).rel, "noopener noreferrer");
  assert.equal(new v2.A({ href: "https://example.com", rel: "me" }).rel, "me noopener noreferrer");
  assert.equal(new v2.A({ href: "/local" }).rel, undefined);
});

test("Hgroup builds its heading and subheadings as v2 children", () => {
  const html = materia.render(
    new v2.Hgroup({ h: 2, $textContent: "Title", preheading: "Pre", subheading: "Sub" })
  );

  assert.equal(html, "<!DOCTYPE html><hgroup><p>Pre</p><h2>Title</h2><p>Sub</p></hgroup>");
});

test("Ul and Ol wrap plain text $children items in Li elements", () => {
  assert.equal(
    materia.render(new v2.Ul({ $children: ["a", new v2.Li("b")] })),
    "<!DOCTYPE html><ul><li>a</li><li>b</li></ul>"
  );
  assert.equal(materia.render(new v2.Ol({ $children: [1] })), "<!DOCTYPE html><ol><li>1</li></ol>");
});

test("$innerHTML sets raw HTML", () => {
  assert.equal(
    materia.render(new v2.Div({ $innerHTML: "<b>x</b>" })),
    "<!DOCTYPE html><div><b>x</b></div>"
  );
});

test("v2 elements drop $ keys that are not listed DOM properties", () => {
  assert.equal("$hidden" in new v2.Div({ $hidden: true }), false);
});

test("Bind imports can be arrays and plain values, resolved for server render", () => {
  const html = materia.render(
    new v2.P({
      $textContent: Bind("name", [Import(greet, "/fixtures/greeter.js"), "!"], ({ data, imports: [greet, mark] }) => greet(data) + mark),
    })
  );

  assert.match(html, />Hello, Ada!<\/p>/);
  const handler = materia.review().handlers.name.at(-1);
  assert.deepEqual(handler.pipe, [{ path: "/fixtures/greeter.js", componentName: "greet" }, "!"]);
});

test("Handle accepts null imports with a handler", () => {
  const handler = () => {};

  assert.equal(Handle(null, handler).imports, null);
  assert.equal(Handle(null, handler).handler, handler);
});

test("a null value leaves the property unset", () => {
  assert.equal(materia.render(new v2.P({ $textContent: null })), "<!DOCTYPE html><p></p>");
});

test("$tagName overrides the tag, and an element without a tag renders as a div", () => {
  assert.equal(materia.render(new v2.Div({ $tagName: "section" })), "<!DOCTYPE html><section></section>");
  assert.equal(materia.render(new v2.Element({})), "<!DOCTYPE html><div></div>");
});
