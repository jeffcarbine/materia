# Materia

A lightweight JavaScript framework for rendering both server-side and client-side HTML.

![npm](https://img.shields.io/npm/v/materiajs)
![license](https://img.shields.io/npm/l/materiajs)

> **Materia v2 is rolling out gradually.** This README documents the v2 syntax. The v1 syntax still works unchanged, and its documentation lives in [`v1/README.md`](v1/README.md). See [Migrating from v1](#migrating-from-v1) for how the two relate.

## Table of Contents

- [Description](#description)
- [Installation](#installation)
- [Import](#import)
- [Elements](#elements)
  - [Attributes](#attributes)
  - [`$` Properties](#-properties)
  - [Children](#children)
  - [Components](#components)
- [Rendering](#rendering)
  - [Client-side Render](#client-side-render)
  - [Server-side Render](#server-side-render)
- [Binding with `Bind`](#binding-with-bind)
  - [Handler Context](#handler-context)
  - [Binding Multiple Keys](#binding-multiple-keys)
  - [Nested Binds](#nested-binds)
  - [Bound Children](#bound-children)
- [Importing with `Import`](#importing-with-import)
- [Managing the Data](#managing-the-data)
- [Events](#events)
- [Viewport Classes](#viewport-classes)
- [Debugging](#debugging)
- [Migrating from v1](#migrating-from-v1)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Description

Materia is a lightweight JavaScript framework designed for rendering both server-side and client-side HTML. It includes a library of all valid HTML elements, including SVG elements, and provides a simple API for binding and rendering.

In v2, everything Materia does on top of plain HTML is spelled out explicitly:

- **HTML attributes** are written as-is (`id`, `href`, `dataTheme`).
- **DOM properties** Materia manages start with `$` (`$textContent`, `$children`, `$classList`).
- **Events** start with `__` (`__click`, `__submit`), and their handlers can be wrapped with the `Handle` helper.
- **Data binding** uses the `Bind` helper, and **code shared with the browser** uses the `Import` helper.

## Installation

```sh
npm i materiajs
```

## Import

```js
import MateriaJS, { Bind, Import, Handle } from "materiajs";
import { Div, H1, P } from "materiajs/v2/elements";
```

| Import | Contents |
|---|---|
| `materiajs` | The `MateriaJS` class (default export), plus the `Bind`, `Import`, and `Handle` helpers |
| `materiajs/v2/elements` | The v2 element library |
| `materiajs/engine` | The Express view engine for server-side rendering |
| `materiajs/elements` | The v1 element library (see [Migrating from v1](#migrating-from-v1)) |

## Elements

Every HTML and SVG element is available as a class from `materiajs/v2/elements`. Pass a single object of attributes, `$` properties, and `__` events:

```js
import { A } from "materiajs/v2/elements";

const link = new A({
  href: "/about",
  $classList: ["nav-link"],
  $textContent: "About",
});
```

As a shorthand, a string sets the text of most elements, the `src` of `Img` and `Script`, and the `href` of `Link`:

```js
new P("Hello");
new Img("/images/logo.png");
```

### Attributes

Any valid HTML attribute is written by its name. Data attributes can be written in camelCase (`dataTheme` renders as `data-theme`) or with a hyphen (`"data-theme"`):

```js
new Body({ dataTheme: "dark" });
// <body data-theme="dark"></body>
```

### `$` Properties

Keys that start with `$` set DOM properties instead of HTML attributes:

| Property | Value | Effect |
|---|---|---|
| `$textContent` | string | The element's text |
| `$innerHTML` | string | The element's raw HTML |
| `$children` | array | The element's child elements and text (see [Children](#children)) |
| `$classList` | array of strings | The element's classes |
| `$style` | object | Inline styles, with camelCase property names |
| `$dataset` | object | Data attributes, with camelCase keys |

Any other `$` key sets the matching DOM property, so `$contentEditable` sets `element.contentEditable`.

Use either `$classList` or the plain `class` attribute on an element, not both: whichever is applied last replaces the other's classes.

```js
new Section({
  $classList: ["welcome-section", "padding-m"],
  $style: { marginBottom: "2rem" },
  $dataset: { userId: "42" },
});
// <section class="welcome-section padding-m" style="margin-bottom:2rem;" data-user-id="42"></section>
```

### Children

Children are always passed through `$children`, as an array of elements and strings:

```js
new Main({
  $children: [
    new H1({ $textContent: "Welcome" }),
    new P("Thanks for stopping by."),
    "Plain text works too.",
  ],
});
```

`$children` is the only way to add children in v2. The v1 shorthands (passing an array straight to the constructor, `child`, `children`, or passing a `Bind` as the whole argument) are ignored by v2 elements.

### Components

A component is a class that extends a v2 element and adjusts its props:

```js
// components/card.html.js
import { Div } from "materiajs/v2/elements";

export class Card extends Div {
  constructor(props = {}) {
    props.$classList = ["card", ...(props.$classList || [])];
    super(props);
  }
}
```

## Rendering

### Client-side Render

`render` takes an element and either a CSS selector to append it to, or a callback that receives the rendered DOM element:

```js
const materia = new MateriaJS({ data: {}, handlers: {}, triggers: {}, delegate: {} });

materia.render(new P("Hello"), "#app");

materia.render(new P("Hello"), (element) => {
  document.body.prepend(element);
});
```

With no second argument, `render` returns the DOM element.

### Server-side Render

Materia renders views on the server through an Express view engine. Views are files with the extension `.html.js`:

```js
// index.js
import express from "express";
import engine from "materiajs/engine";

const app = express();
engine(app);

app.get("/", (req, res) => {
  res.render("index", { title: "Home" });
});

app.listen(3000);
```

A view exports a default function that receives the data passed to `res.render` and returns an element tree. A view can also export `props`, the initial data that its `Bind` calls read. This data is serialized into the page so the browser can keep the bindings live:

```js
// views/index.html.js
import { Bind } from "materiajs";
import { Html, Head, Title, Body, Main, H1 } from "materiajs/v2/elements";

export const props = {
  user: { name: "Ada", theme: "dark" },
};

export default (data) =>
  new Html({
    $children: [
      new Head({ $children: [new Title(data.title)] }),
      new Body({
        dataTheme: Bind("user.theme"),
        $children: [
          new Main({
            $children: [
              new H1({
                $textContent: Bind("user.name", ({ data: name }) => `Welcome, ${name}!`),
              }),
            ],
          }),
        ],
      }),
    ],
  });
```

To set app-wide data, pass it to the engine: `engine(app, { siteName: "My Site" })`. Values in `props` can also be functions; each one receives the `res.render` data, may be `async`, and its result is stored under its key.

## Binding with `Bind`

`Bind` connects a value to a piece of Materia data, called its **binding key**. The value renders from the current data and re-renders whenever that data changes. Binding keys can use dot notation and array indexes (`"user.name"`, `"items[0]"`).

`Bind` can be used as the value of any attribute, `$` property, or item in `$classList`, `$style`, `$dataset`, or `$children`. It takes up to three arguments:

```js
Bind(binding);                      // renders the bound value as-is
Bind(binding, handler);             // renders handler's return value
Bind(binding, imports, handler);    // also passes imports to handler
```

```js
new P({ $textContent: Bind("user.name") });

new P({ $textContent: Bind("user.name", ({ data: name }) => `Hi, ${name}`) });
```

### Handler Context

The handler receives one object:

| Key | Contents |
|---|---|
| `data` | The bound value (an array of values when binding multiple keys) |
| `imports` | Whatever was passed as `Bind`'s second argument, with any `Import` helpers resolved to their modules |
| `elements` | The v2 element library, so handlers can build elements without importing them |
| `core` | `{ Bind, Import, Handle }`, so handlers can create nested bindings and event handlers |

Handlers run on the server for the first render and again in the browser whenever the data changes. They must be self-contained: use the handler context instead of variables from the surrounding module, and pass outside values in through `imports`.

### Binding Multiple Keys

Pass an array of binding keys to depend on several values at once. `data` is then an array in the same order:

```js
new P({
  $textContent: Bind(["user", "system"], ({ data: [user, system] }) =>
    `${user.name} is using the ${system.theme} theme`
  ),
});
```

### Nested Binds

`Bind` can appear inside `$classList`, `$style`, and `$dataset`, next to static values:

```js
const isDevelopment = true;

new Section({
  $classList: [
    "welcome-section",
    Bind("user.theme", isDevelopment, ({ data: theme, imports: isDevelopment }) =>
      isDevelopment ? `theme-${theme} debug` : `theme-${theme}`
    ),
  ],
  $style: {
    color: Bind("user.theme", ({ data: theme }) => (theme === "dark" ? "red" : "blue")),
    marginBottom: "2rem",
  },
  $dataset: {
    userTheme: Bind("user.theme"),
  },
});
```

Only the bound part updates when the data changes; the static classes, styles, and data attributes stay in place.

### Bound Children

A `Bind` on `$children` returns an array of children, which is re-rendered whenever the data changes. Return an empty array to render nothing. Build the children with `elements` from the handler context, and use `core.Bind` to bind values inside them:

```js
new Ul({
  $children: Bind("todos", ({ data: todos, elements: { Li }, core: { Bind } }) =>
    todos.map((todo, index) =>
      new Li({
        $classList: [Bind(`todos[${index}].done`, ({ data: done }) => (done ? "done" : ""))],
        $textContent: todo.title,
      })
    )
  ),
});
```

A `Bind` inside a static `$children` array also stays live:

```js
new Div({
  $children: [new Span({ $textContent: Bind("user.name") })],
});
```

## Importing with `Import`

Handlers run in the browser, where they can't see the server's module imports. `Import(module, path)` passes a module to a handler on the server and tells the browser where to load it from:

```js
import { Bind, Import } from "materiajs";
import { Card } from "../components/card.html.js";

new Section({
  $children: Bind(
    ["user", "system"],
    [Import(Card, "/components/card.html.js"), isDevelopment],
    ({ data: [user, system], imports: [Card, isDevelopment], elements: { Div }, core: { Bind } }) =>
      isDevelopment
        ? [
            new Card({ $textContent: `${user.name}, age ${user.age}, theme ${system.theme}` }),
            new Div({ $textContent: Bind("secret", ({ data }) => `The secret is ${data}!`) }),
          ]
        : []
  ),
});
```

The path must be a URL the browser can load, so serve the file statically:

```js
app.use("/components", express.static("components"));
```

`Bind`'s imports can be a single value, an array, or an object. Plain values (like `isDevelopment` above) are passed through unchanged.

## Managing the Data

Change data through the `MateriaJS` instance, and the bindings on that key re-render. In the browser, a server-rendered page exposes its instance as `window.Materia`.

Updates match binding keys exactly. Setting `"user.name"` re-renders `Bind("user.name")` but not `Bind("user")`, and setting `"user"` doesn't re-render `Bind("user.name")`. Bind to the key you change, or call `run("user")` to re-run a key and every key beneath it.

| Method | Effect |
|---|---|
| `get(binding)` | Returns the value at `binding` (an empty string if it doesn't exist) |
| `set(binding, value)` | Sets the value at `binding` |
| `update(binding, object)` | Merges `object` into the object at `binding` |
| `sum(binding, number)` | Adds `number` to the number at `binding` |
| `sumUpdate(binding, object)` | Adds each number in `object` to the matching key at `binding` |
| `push(binding, value)` | Appends `value` to the array at `binding` |
| `unshift(binding, value)` | Prepends `value` to the array at `binding` |
| `pushMany(binding, values)` | Appends each of `values` to the array at `binding` |
| `setInArray(binding, query, value)` | Replaces the first array item matching `query`, or appends `value` if none matches |
| `pull(binding, query)` | Removes the first array item matching `query` |
| `run(binding)` | Re-runs the bindings for `binding` and every key beneath it, without changing data |
| `destroy(bindingOrElement)` | For a key, deletes its data, its bound elements, and its handlers. For an element, removes it and its handlers and event delegates |

```js
Materia.set("user.name", "Grace");
Materia.push("todos", { title: "Write docs", done: false });
Materia.update("user", { theme: "light" });
```

These methods are the same in v1 and v2.

## Events

Event handlers are keys that start with `__` followed by the event name. Like `Bind` handlers, they receive a single object to destructure:

```js
new Button({
  $textContent: "Save",
  __click: ({ target, event }) => {
    Materia.set("saved", true);
  },
});

new Form({
  method: "POST",
  action: "/submit",
  __submit: ({ target: form }) => {
    console.log(new FormData(form));
  },
});
```

| Key | Contents |
|---|---|
| `target` | The element the event was registered on |
| `event` | The browser event |
| `imports` | Whatever was passed to `Handle` as imports, with any `Import` helpers resolved (`null` without `Handle` imports) |
| `elements` | The v2 element library |
| `core` | `{ Bind, Import, Handle }` |

### Event Imports with `Handle`

Event handlers are serialized and run in the browser, so like `Bind` handlers they must be self-contained. To give a handler access to a module or an outside value, wrap it with `Handle`. It works like `Bind` without the binding key:

```js
Handle(handler);           // same as passing handler directly
Handle(imports, handler);  // passes imports to handler
```

```js
import { Bind, Import, Handle } from "materiajs";
import { formatPrice } from "../utils/format.js";

const currency = "USD";

new Button({
  $textContent: "Show total",
  __click: Handle(
    [Import(formatPrice, "/utils/format.js"), currency],
    ({ target, imports: [formatPrice, currency] }) => {
      target.textContent = formatPrice(Materia.get("cart.total"), currency);
    }
  ),
});
```

As with `Bind`, imports can be a single value, an array, or an object, and each `Import` path must be a URL the browser can load.

### Default Actions

**Materia always prevents the default action of events it handles.** Adding `__click` to a link stops navigation, and adding `__submit` to a form stops it from submitting. Materia assumes that if you have asked it to handle an event, you want to handle it completely. To keep the browser's default behavior, don't attach a Materia handler to that event.

The exception is `__clickOutside`: the clicks it reacts to belong to other elements, so their default actions are left alone.

### Special Events

- `__clickOutside` runs when the user clicks anywhere outside the element. `target` is the element itself.
- `__keydown:Key` runs when a specific key is pressed inside the element, such as `"__keydown:Enter"` or `"__keydown:Escape"`.
- `__load` runs once the element is in the page.

DOM mutation events (`childList`, `attributes:*`, `characterData`) are not yet part of the v2 syntax; they remain available through the v1 elements.

## Viewport Classes

Add a `dataVclass` attribute to add a class to an element when it enters the viewport, which is useful for animations and lazy loading:

```js
new Div({
  dataVclass: "fade-in",
  dataVclassMargin: "50px", // optional: add the class 50px before the element is visible
  $textContent: "This gets the 'fade-in' class when visible",
});
```

```css
[data-vclass="fade-in"] { opacity: 0; transition: opacity 0.5s ease-in-out; }
.fade-in { opacity: 1; }
```

## Debugging

`review()` returns the current state of a MateriaJS instance:

```js
const state = Materia.review();
console.log(state.data);     // current data
console.log(state.handlers); // binding handlers
console.log(state.triggers); // triggers
console.log(state.delegate); // event delegates
```

## Migrating from v1

v2 is being rolled out gradually. Nothing is removed in this release:

- `materiajs/elements` still exports the v1 elements, with all of the v1 syntax documented in [`v1/README.md`](v1/README.md).
- The `MateriaJS` class renders v1 and v2 elements side by side; each element is handled by the syntax of the library it came from. You can migrate one view or component at a time.
- The v1 syntax is marked for deprecation in the source and will be removed in a future major version.

To migrate a view, switch its element import to `materiajs/v2/elements` and update its syntax:

| v1 | v2 |
|---|---|
| `new Div([a, b])` | `new Div({ $children: [a, b] })` |
| `children: [a, b]` / `child: a` | `$children: [a, b]` |
| `textContent: "Hi"` | `$textContent: "Hi"` |
| `innerHTML: "<b>Hi</b>"` | `$innerHTML: "<b>Hi</b>"` |
| `class: "a b"` | `$classList: ["a", "b"]` (`class` still works as a plain attribute, but don't combine the two) |
| `style: { color: "red" }` | `$style: { color: "red" }` |
| `"data-user-id": 1` | `dataUserId: 1`, or `$dataset: { userId: 1 }` |
| `binding: "name", textContent: (name) => name` | `$textContent: Bind("name", ({ data: name }) => name)` |
| `pipe: { Card: "/card.js" }` | `Bind(key, Import(Card, "/card.js"), handler)` |
| `(data, elements, pipe) => ...` | `({ data, elements, imports, core }) => ...` |
| `click: handler` | `__click: handler` |
| `"keydown:Enter": handler` | `"__keydown:Enter": handler` |
| `(target, pipe, elements, event) => ...` | `({ target, event, imports, elements, core }) => ...` |
| event `pipe: { fn: "/fn.js" }` | `__click: Handle(Import(fn, "/fn.js"), handler)` |
| `preventDefault: "click"` | Not needed; Materia always prevents the default for events it handles |
| `if: condition` | Leave the element out of `$children`, or return `[]` from a bound `$children` handler |

v2 intentionally has no equivalent for these v1 shorthands:

- passing an array of children directly to the constructor;
- `child` and `children` (use `$children`);
- passing a `Bind` as the whole constructor argument (bind `$children` instead);
- a second constructor argument for children.

Components should accept a single props object and extend v2 elements.

## Contributing

Contributions are welcome! If you have any ideas, suggestions, or bug reports, please open an issue on GitHub. If you would like to contribute code, you can do so by forking the repository and creating a pull request. Please ensure that your code follows the project's coding standards and that `npm test` passes.

To contribute:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature-branch`).
3. Make your changes.
4. Commit your changes (`git commit -m 'Add some feature'`).
5. Push to the branch (`git push origin feature-branch`).
6. Open a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contact

For questions or feedback, please contact [Jeff Carbine](mailto:jeff@carbine.co).
