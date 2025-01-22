# Materia

A lightweight JavaScript framework for rendering both server-side and client-side HTML.

![npm](https://img.shields.io/npm/v/materia)
![license](https://img.shields.io/npm/l/materia)

## Table of Contents

- [Description](#description)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Import](#import)
- [Elements](#elements)
  - [Properties](#properties)
  - [Property Exceptions](#property-exceptions)
  - [Specialized Elements](#specialized-elements)
  - [Property Shorthands](#property-shorthands)
- [Rendering](#rendering)
  - [Client-side Render](#client-side-render)
  - [Server-side Render](#server-side-render)
- [Data Binding](#data-binding)
  - [The Pipe](#the-pipe)
    - [Client-side Pipe](#client-side-pipe)
    - [Server-side Pipe](#server-side-pipe)
  - [Updating the data](#updating-the-data)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Description

Materia is a lightweight JavaScript framework designed for rendering both server-side and client-side HTML. It includes a library of all valid HTML elements, including SVG elements, and provides a simple API for data binding and rendering.

## Prerequisites

- Node.js (version 12 or higher)

## Installation

You can install the package via npm:

```sh
npm i materia
```

## Import

To use Materia directly, import it into your project.

```js
import materia from "materia";
```

If you wish to use server-side rendering, import the engine into your project

```js
import engine from "materia/engine";
import express from "express";

const app = express();
engine(express);
```

## Elements

Materia includes a library of all 161 valid HTML elements, including SVG elements. You can import any of these elements from the included `elements` file.

```js
import { Div, H1, Img, P } from "materia/elements";

const element = new Div({
  class: "card",
  children: [
    new H1("Hello World"),
    new Img("image.webp"),
    new P("This is an example card"),
  ],
});
```

### Properties

Properties of an element in Materia are the same as an Element in JavaScript, with a few exceptions listed below.

```js
const element = document.querySelector("#element");
element.id = "foo";
element.tagName = "div";
element.textContent = "Hello World";
element.tabindex = -1;

const alsoElement = new Div({
  id: "foo",
  textContent: "Hello World",
  tabindex: -1,
});

// both create <div id="foo" tabindex="-1">Hello World</div>
```

### Property Exceptions

There are a few exceptions to this rule:

- `children` accepts an array of objects to render as the element's children
- `child` accepts a single object to render as the element's sole child
- `class` in lieu of className, for simplicity - however `className` does still work
- `if` conditionally renders an element
- `binding` the data value to bind the attribute to

```js
const showElement = false;

const element = new Div({
  children: [
    new Div({
      child: new P({
        textContent: "This always shows",
      }),
    }),
    new Div({
      if: showElement,
      child: new P({
        class: "conditional",
        textContent: "This only renders if showElement is true",
      }),
    }),
  ],
});
```

### Specialized Elements

Materia also includes a number of specialized elements to simplify the process:

- `Stylesheet` extends `Link` - adds `rel="stylesheet"` automatically
- `PreLoadStyle` extends `Link` - adds `rel`, `as`, and `onload` to pre-load stylesheets
- `Module` extends `Script` - adds `type="module`
- `HiddenInput`, `TextInput`, `SearchInput`, `TelInput`, `UrlInput`, `EmailInput`, `PasswordInput`, `DateInput`, `MonthInput`, `WeekInput`, `TimeInput`, `DateTimeLocalInput`, `NumberInput`, `RangeInput`, `ColorInput`, `CheckboxInput`, `RadioInput`, `ResetInput` all extend `Input` and add their appropriate `type`
- `LazyImg` extends `Img` and adds `loading="lazy"`

### Property Shorthands

You can shorthand properties in an element by passing a single value into it, in the even that element only needs a certain single value

- Arrays will shorthand `children`
- Objects will shorthand `child`
- Strings will generally shorthand `textContent`
- Functions will shorthand data binds (more on that later)

```js
const element = new Div([
  new Div(new P("This always shows")),
  new Div({
    if: showElement,
    child: new P({
      class: "conditional",
      textContent: "This only renders if showElement is true",
    }),
  }),
]);
```

Some elments have unique shorthands:

- Img: string shorthand creates the `src` attribute
- Select: array shorthand wraps each child in an Option(), unless already wrapped
- Ul & Ol: array shorthand wraps each child in a Li(), unless already wrapped
- Dl: array shorthand wraps each child in a Dt(), unless already wrapped
- Thead: array shorthand wraps each child in a Th() unless already wrapped, and wraps the children in a Tr(), unless already wrapped
- Tbody: array shorthand wraps first child in a Th() and subsequent children in a Td() unless already wrapped, and wraps the children in a Tr(), unless already wrapped

## Rendering

### Client-side Render

To client-side render, import `materia` and call the `render()` method. `render()` takes in three parameters:

- the object to render
- the data to data-bind (optional)
- either a target to append the rendered element to, or a callback function

```js
import materia from "materia";

// renders an element and runs a callback
materia.create(new H1("Hello World"), (element) =>
  document.body.appendChild(element)
);

// renders an element with attached data and runs a callback
materia.create(new H1("Hello World"), {foo: "bar"}, (element) =>
  document.body.appendChild(element)
);

// renders an element with attached data and appends it to "body"
materia.create(new H1("Hello World"), {foo: "bar"}, "body";

// renders an element and appends it to "body"
materia.create(new H1("Hello World"), "body";
```

## Server-side Render

Materia can server-side rener your layouts. The filename extension that Materia looks for is `.html.js`.

To server-side render, import the engine

```js
import engine from "materia/engine";
import express from "express";

const app = express();
engine(express);
```

And then you can write your views using Materia with the extension of `.html.js`. Materia templates export a default function with a parameter of `data`, which contains the data being sent from the server.

```js
/// index.html.js
export default (data) => {
  return new Html([
    new Head([new Title(data.title), new Stylesheet("styles/site.css")]),
    new Body([
      new Main([
        new Section({
          id: "welcome",
          children: [
            new H1(`Welcome to ${data.pageName}`),
            new P(data.pageWelcomeText),
          ],
        }),
      ]),
    ]),
  ]);
};

app.get("/", (req, res) => {
  res.render("index", {
    title: "Welcome to my website",
    pageName: "Home",
    pageWelcomeText: "Welcome to my website",
  });
});
```

You can easily create a layout template to be shared across your views:

```js
// layout.html.js
export const layout = (data, content) => {
  return new Html([
    new Head([new Title(data.title), new Stylesheet("styles/site.css")]),
    new Body([new Main(content || {})]),
  ]);
};
```

```js
// index.html.js
import { layout } from "./layout.html.js";

export default (data) => {
  return layout(data, {
    id: "welcome",
    children: [
      new H1(`Welcome to ${data.pageName}`),
      new P(data.pageWelcomeText),
    ],
  });
};

app.get("/", (req, res) => {
  res.render("index", {
    title: "Welcome to my website",
    pageName: "Home",
    pageWelcomeText: "Welcome to my website",
  });
});
```

## Data Binding

Data-bind functions are anonymous functions that run anytime a bound piece of data is updated on `materia`.

To data-bind, pass an anonymous function to an element's property. The anonymous function accepts three parameters:

- The data being bound
- The `materia/elements` library of elements
- The piped data to the function

To start, you need to add data to `materia.data` using the `.set()` method. The first parameter of the `set()` function is known as the `binding`.

```js
materia.data.set("test", {
  class: "test-element",
  text: "This is a test of data-binding",
  children: ["one", "two", "three"],
});
```

Then, instead of writing static values in your data, you can define the binding, and then access that data via the anonymous function.

```js
const element = new Div({
  binding: "test",
  class: (test) => test.class,
  children: [new P((test) => test.text)],
});
```

### The Pipe

Since the binding functions are anonymous, they don't inheritly have access to the values defined outside of it. In order to access external data, you need to first pipe it to your element.

#### Client-side Pipe

If you are client-side, you can simply pass the values directly

```js
import { Component } from "./someComponent.html.js";

const element = new Div({
  binding: "test",
  pipe: {
    Component,
  }
  class: (test) => test.class,
  children: [
    new P((test) => test.text),
    new Ul({
      children: (test, elements, pipe) => {
        const { Component } = pipe;
        const { Li } = elements;

        const children = [];

        element.children.forEach((child) => {
          children.push(new Li(child));
        });

        return children;
      },
    }),
  ],
});
```

#### Server-side Pipe

If you are server-side, you might need to pass additional data to the pipe.

If the value you are piping is self-contained in the file, you can simply pipe directly to that data. If that data is imported from elsewhere, you will need to pass `data` and `path` values instead.

The data is the reference to the data at time of render, and the path is the path to the file from the clieint-side so that the data can be imported at the time of re-render;

```js
import { Component } from "./someComponent.html.js";

const camelize = (str) => {
  // a function that takes a string and turns it into camel case, for example
}

const element = new Div({
  binding: "test",
  pipe: {
    camelize,
    Component: {
      data: Component,
      path: "/path/to/someComponent.html.js",
    }
  }
  class: (test) => test.class,
  children: [
    new P((test) => test.text),
    new Ul({
      children: (test, elements, pipe) => {
        const { Component, camelize } = pipe;
        const { Li } = elements;

        const children = [];

        test.children.forEach((child) => {
          children.push(new Li(camelize(child)));
        });

        return children;
      },
    }),
  ],
});
```

### Updating the data

To update the data, you can use the `materia.set()` or `materia.push()` methods.

`materia.set` allows you to push to any value of the data, assuming that data is set.

```js
materia.push("test.class", "new-class");
```

`materia.push` allows you to push to an array value within the data, assuming the value you are trying to push to is an array.

```js
materia.push("test.children", "four");
```

Any element bound to the value being updated will be updated. However, if you have a binding that is more specific, that binding will run instead.

```js
materia.data.set("test", {
  class: "test-element",
  text: "This is a test of data-binding",
  children: ["one", "two", "three"],
  name: {
    first: "John",
    last: "Doe",
  }
});

const element = new Div({
  binding: "test",
  pipe: {
    camelize,
    Component: {
      data: Component,
      path: "/path/to/someComponent.html.js",
    }
  }
  class: (test) => test.class,
  children: [
    new P((test) => test.text),
    new Div({
      binding: "test.name",
      children: (name, element) => {
        const { Span } = element;

        return [new Span(name.first), new Span(name.last)];
      }
    }),
    new Ul({
      children: (test, elements, pipe) => {
        const { Component, camelize } = pipe;
        const { Li } = elements;

        const children = [];

        test.children.forEach((child) => {
          children.push(new Li(camelize(child)));
        });

        return children;
      },
    }),
  ],
});

materia.set("test.name.first", "Joe"); // will conly cause the "test-name" bound element to re-render
materia.set("test.class", "new-class"); // will cause the "test" bound elements to re-render
```

## Contributing

Contributions are welcome! If you have any ideas, suggestions, or bug reports, please open an issue on GitHub. If you would like to contribute code, you can do so by forking the repository and creating a pull request. Please ensure that your code follows the project's coding standards and includes appropriate tests.

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
