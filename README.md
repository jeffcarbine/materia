# Materia

A lightweight JavaScript framework for rendering both server-side and client-side HTML.

![npm](https://img.shields.io/npm/v/materiajs)
![license](https://img.shields.io/npm/l/materiajs)

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
- [Binding](#binding)
  - [Nested Bindings](#nested-bindings)
  - [Triggers](#triggers)
  - [The Pipe](#the-pipe)
    - [Client-side Pipe](#client-side-pipe)
    - [Server-side Pipe](#server-side-pipe)
  - [Managing the Data](#managing-the-data)
  - [Manipulating the data](#manipulating-the-data)
  - [Cleaning Up Data and Elements](#cleaning-up-data-and-elements)
- [Viewport Classes](#viewport-classes)
- [Events](#events)
  - [Preventing Default](#preventing-default)
  - [Special Event Types](#special-event-types)
- [Debugging](#debugging)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Description

Materia is a lightweight JavaScript framework designed for rendering both server-side and client-side HTML. It includes a library of all valid HTML elements, including SVG elements, and provides a simple API for binding and rendering.

## Prerequisites

- Node.js (version 12 or higher)

## Installation

You can install the package via npm:

```sh
npm i materiajs
```

## Import

To use Materia directly, import it into your project.

```js
import MateriaJS from "materiajs";
```

If you wish to use server-side rendering, import the engine into your project

```js
import engine from "materiajs/engine";
import express from "express";

const app = express();
engine(app);
```

## Elements

Materia includes a library of all 161 valid HTML elements, including SVG elements. You can import any of these elements from the included `elements` file.

```js
import { Div, H1, Img, P } from "materiajs/elements";

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
- `binding` the key to bind the attribute to

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

To client-side render, import `MateriaJS` and call the `render()` method. `render()` takes in three parameters:

- the object to render
- a callback function or query selector string (optional)
- the depth of rendering (optional)

```js
import MateriaJS from "materiajs";

const materia = new MateriaJS();

// renders an element and runs a callback
materia.render(new H1("Hello World"), (element) =>
  document.body.appendChild(element)
);

// renders an element and appends it to "body"
materia.render(new H1("Hello World"), "body");
```

## Server-side Render

Materia can server-side render your layouts. The filename extension that Materia looks for is `.html.js`.

To server-side render, import the engine

```js
import engine from "materiajs/engine";
import express from "express";

const app = express();
engine(app);
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

## Binding

Binding functions are anonymous functions that run anytime a bound piece of data is updated on a MateriaJS instance. The function is bound to the data via a string known as a **binding key**. This can be a single value, or can be dot notation of a larger object.

To bind, set the `binding` property on an element to the desired binding key, then pass an anonymous function to an element's property. The anonymous function can accept up to three parameters:

- The data being bound
- The `materiajs/elements` library of elements (optional, when you need access to Materia elements)
- The piped data to the function (optional, when you need access to piped components/functions)

### Server-side binding setup

You can pre-bind values from the server by declaring `props`. The `props` declaration must be an object with unique key/value pairs. The values may be static values, or may be anonymous functions with a parameter of `data`. The `data` parameter is the same as the `data` parameter that is passed to the view.

You can declare app-wide bindings by passing the `props` to the engine, or you can declare view-specific bindings by creating a secondary export of `props` in your view.

```js
// App-wide binding
const props = {
  someBool: true,
  username: "John Doe",
  someData: () => {
    return Model.find();
  },
};

const app = express();
engine(app, props);
```

```js
// View-specific binding
export const props = {
  someBool: true,
  username: "John Doe",
  someData: () => {
    return Model.find();
  },
};
```

### Client-side binding setup

To set data for binding on the client-side, you need to add data to a MateriaJS instance using the `.set()` method. The first parameter of the `set()` method is the binding key.

```js
const materia = new MateriaJS();

materia.set("test", {
  class: "test-element",
  text: "This is a test of binding",
  children: ["one", "two", "three"],
});
```

Then, instead of writing static values in your elements, you can define the binding on each element that needs data binding, and then access that data via the anonymous function.

### Nested Bindings

You can bind to specific nested properties within your data objects by using dot notation in your binding keys. This allows for more granular control over which elements update when specific parts of your data change.

**Important notes about nested bindings:**

1. You can bind to any nested property (e.g., `"test.class"`, `"user.profile.name"`, etc.)
2. Updating a parent binding (e.g., `"test"`) will **not** automatically trigger child bindings (e.g., `"test.class"`)
3. Child bindings must be updated directly, or you can manually trigger them using `run()` on the parent binding

```js
const element = new Div({
  binding: "test.class",
  class: (class) => class,
  children: [
    new P({
      binding: "test.text",
      textContent: (text) => text,
    }),
    new Div({
      binding: "test",
      pipe: {
        SomeComponent,
      },
      children: (test, elements, pipe) => {
        const { Span } = elements;
        const { SomeComponent } = pipe;

        return test.children.map((item) => {
          return new SomeComponent({
            child: new Span(item),
          });
        });
      },
    }),
  ],
});
```

### Triggers

Triggers allow you to make binding handlers re-run when related data changes, even if the main binding itself hasn't changed. This is particularly useful when you want a binding to update based on changes to nested properties within the main binding's data.

When you define triggers on an element, any changes to those trigger bindings will cause the element's main binding handler to re-execute. **Trigger paths are relative to the main binding** - they represent nested properties within the main binding's data structure. The trigger bindings themselves don't pass their data to the handler - the handler still receives data from its main binding.

```js
const materia = new MateriaJS();

materia.set("user", {
  profile: {
    name: "John Doe",
    email: "john@example.com",
  },
  settings: {
    theme: "dark",
    language: "en",
  },
});

const userCard = new Div({
  binding: "user",
  triggers: ["profile.name", "settings.theme"], // These are relative to "user"
  class: (user) => `user-card theme-${user.settings.theme}`,
  children: (user) => [
    new H2(user.profile.name),
    new P(user.profile.email),
    new Span(`Theme: ${user.settings.theme}`),
  ],
});

// This will cause the userCard to re-render because "user.profile.name" matches the trigger "profile.name"
materia.set("user.profile.name", "Jane Doe");

// This will also cause the userCard to re-render because "user.settings.theme" matches the trigger "settings.theme"
materia.set("user.settings.theme", "light");

// This will NOT cause the userCard to re-render because "user.profile.email" doesn't match any triggers
materia.set("user.profile.email", "jane@example.com");
```

**Key points about triggers:**

- Triggers are defined as an array of binding strings in the `triggers` property
- **Trigger paths are relative to the main binding** (e.g., `binding: "user"` with `triggers: ["profile.name"]` means changes to `"user.profile.name"` will trigger the handler)
- When any trigger binding changes, the main binding's handler re-executes
- The handler function still receives data from the main binding, not from the trigger bindings
- Triggers are useful for making components reactive to nested property changes within the main binding's data
- You can have multiple triggers on a single element

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

The data is the reference to the data at time of render, and the path is the path to the file from the client-side so that the data can be imported at the time of re-render.

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

### Managing the Data

#### Getting Data

You can retrieve data from a MateriaJS instance using the `get()` method:

```js
const materia = new MateriaJS();

materia.set("user", {
  name: "John Doe",
  settings: {
    theme: "dark",
    notifications: true,
  },
  friends: ["Alice", "Bob", "Charlie"],
});

// Get simple values
const userName = materia.get("user.name"); // "John Doe"
const theme = materia.get("user.settings.theme"); // "dark"

// Get array values
const firstFriend = materia.get("user.friends[0]"); // "Alice"
const allFriends = materia.get("user.friends"); // ["Alice", "Bob", "Charlie"]

// Get entire objects
const userSettings = materia.get("user.settings"); // {theme: "dark", notifications: true}
```

#### Manually Running Bindings

You can manually trigger a binding to re-render using the `run()` method:

```js
// This will cause all elements bound to "user.name" to re-render
materia.run("user.name");

// This will cause all elements bound to "user" to re-render
materia.run("user");
```

### Manipulating the data

Materia has the following methods to manipulate its data:

1. `set(binding, data)`
2. `push(binding, data)`
3. `pushMany(binding, data)`
4. `setInArray(binding, query, data)`
5. `update(binding, data)`
6. `pull(binding, data)`

```js
const materia = new MateriaJS();
```

`materia.set` allows you to set any value of the data.

```js
materia.set("test.class", "new-class");
```

`materia.push` allows you to push to an array value within the data, assuming the value you are trying to push to is an array.

```js
materia.push("test.children", "four");
```

`materia.pushMany` allows you to push multiple values to an array at once.

```js
materia.pushMany("test.children", ["five", "six", "seven"]);
```

`materia.update` allows you to update multiple properties of an object at once without overwriting the entire object.

```js
materia.update("test", {
  class: "updated-class",
  text: "Updated text",
});
// This updates only the specified properties, leaving other properties intact
```

`materia.setInArray` finds a matching object in an array and updates it, or adds it if not found.

```js
materia.set("users", [
  { id: 1, name: "John", active: true },
  { id: 2, name: "Jane", active: false },
]);

// Update existing user
materia.setInArray(
  "users",
  { id: 1 },
  { id: 1, name: "John Doe", active: true }
);

// Add new user (since id: 3 doesn't exist)
materia.setInArray("users", { id: 3 }, { id: 3, name: "Bob", active: true });
```

`materia.pull` removes a matching object from an array.

```js
// Remove user with id: 2
materia.pull("users", { id: 2 });
```

Any element's property bound verbatim to the value being manipulated will have it's value updated.

```js
materia.set("test", {
  class: "test-element",
  text: "This is a test of binding",
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

materia.set("test.name.first", "Joe"); // will not cause the "test.name" binding to update since we are being more specific
materia.update("test", {
  class: "new-class"
}); // will cause the "test" bound elements to update since we are modifying that binding
```

### Cleaning Up Data and Elements

The `destroy()` method allows you to clean up data, handlers, and DOM elements. It can accept either a binding string or a DOM element.

**Destroying by binding:**

```js
// Remove data and all associated elements for a binding
materia.destroy("test.name");

// This will:
// - Delete the data at "test.name"
// - Remove any DOM elements bound to "test.name"
// - Clean up all handlers for "test.name"
```

**Destroying by element:**

```js
const element = document.querySelector(".some-element");

// Remove element and clean up all associated handlers and delegates
materia.destroy(element);

// This will:
// - Remove the element from the DOM
// - Clean up all handlers connected to this element
// - Remove any event delegates connected to this element
// - Disconnect any IntersectionObservers for this element
```

The `destroy()` method is useful for:

- Cleaning up when components are no longer needed
- Preventing memory leaks by removing unused handlers
- Dynamic content management where elements are frequently added/removed

## Viewport Classes

MateriaJS includes a built-in feature for automatically adding CSS classes when elements enter the viewport. This is useful for animations, lazy loading, or other viewport-based interactions.

### Basic Usage

Add a `data-vclass` attribute to any element with the class name you want to add when it enters the viewport:

```js
const element = new Div({
  "data-vclass": "fade-in",
  textContent: "This will get the 'fade-in' class when visible",
});
```

When this element enters the viewport, MateriaJS will automatically add the `fade-in` class to the element's `className`.

### Custom Root Margin

You can control when the class is added by setting a custom root margin using `data-vclass-margin`:

```js
const element = new Div({
  "data-vclass": "slide-up",
  "data-vclass-margin": "50px", // Add class when element is 50px from entering viewport
  textContent: "Animation triggers 50px early",
});
```

### CSS Example

```css
/* Initial state - elements start invisible/offset */
[data-vclass="fade-in"] {
  opacity: 0;
  transition: opacity 0.5s ease-in-out;
}

/* Applied when element enters viewport */
.fade-in {
  opacity: 1;
}

/* Initial state - element starts below */
[data-vclass="slide-up"] {
  transform: translateY(20px);
  transition: transform 0.3s ease-out;
}

/* Applied when element enters viewport */
.slide-up {
  transform: translateY(0);
}
```

This feature uses the Intersection Observer API under the hood and automatically cleans up observers when elements are removed from the DOM.

## Events

You can add event delegation to any element by passing an anonymous function to the event key name.

The anonymous function accepts four parameters:

- the target element itself
- the pipe
- the elements library
- the event

```js
import { CustomComponent } from "./customComponent.html.js";

const button = new Button({
  class: "submit",
  pipe: {
    CustomComponent: {
      data: CustomComponent,
      path: "./customComponent.html.js",
    },
  },
  click: (target, pipe, elements, event) => {
    const { CustomComponent } = pipe;
    const { Div } = elements;
    const eventType = event.type;

    // Create a new element using the piped component and elements
    const newElement = new Div({
      children: [new CustomComponent({ eventType })],
    });

    target.appendChild(newElement);
  },
});
```

### Preventing default

Since Materia handles it's events via delegation, you can't preventDefault inside the anonymous function. By the time the anonymous function has run, the default can no longer be prevented.

```js
const form = new Form({
  submit: (form, pipe, event) {
    event.preventDefault(); // will not work, default will have already ocurred
  }
})
```

Instead, pass a preventDefault value to the element with either a string or an array of strings of the events you want to prevent default on.

```js
const form = new Form({
  preventDefault: "submit",
  submit: (form, pipe, event) => {
    // default is now prevented properly
  },
});

const form2 = new Form({
  preventDefault: ["submit", "click"], // multiple defaults to prevent
  submit: (form, pipe, event) => {
    // default is now prevented properly
  },
  click: (form, pipe, event) => {
    // default is prevented here too
  },
  "keydown:Enter": (form, pipe, event) => {
    // default is not prevented here
  },
});
```

### Special Event Types

MateriaJS supports several special event types for enhanced functionality:

**`clickOutside`** - Triggers when clicking anywhere outside the element:

```js
const modal = new Div({
  class: "modal",
  clickOutside: (target, pipe, elements, event) => {
    // Close modal when clicking outside
    target.style.display = "none";
  },
  children: [
    /* modal content */
  ],
});
```

**`keydown:` prefix** - Listen for specific key presses:

```js
const input = new Input({
  "keydown:Enter": (target, pipe, elements, event) => {
    // Handle Enter key press
    console.log("Enter key pressed!");
  },
  "keydown:Escape": (target, pipe, elements, event) => {
    // Handle Escape key press
    target.blur();
  },
});
```

**Mutation events** - React to DOM changes:

```js
const container = new Div({
  childList: (target, pipe, mutation) => {
    // Triggered when child elements are added or removed
    console.log("Children changed:", mutation);
  },
  "attributes:class": (target, pipe, mutation) => {
    // Triggered when the class attribute changes
    console.log("Class attribute changed:", mutation);
  },
});
```

Available mutation events:

- `childList` - Child elements added/removed
- `attributes` - Any attribute changed
- `attributes:attributeName` - Specific attribute changed (e.g., `attributes:class`)
- `characterData` - Text content changed

## Debugging

### Reviewing Current State

You can inspect the current state of a MateriaJS instance using the `review()` method, which returns an object containing the current data, handlers, triggers, and delegates:

```js
const materia = new MateriaJS();

materia.set("user", { name: "John", age: 30 });

const state = materia.review();
console.log(state.data); // Shows current data: {user: {name: "John", age: 30}}
console.log(state.handlers); // Shows current binding handlers
console.log(state.triggers); // Shows current triggers
console.log(state.delegate); // Shows current event delegates
```

## Contributing

Contributions are welcome! If you have any ideas, suggestions, or bug reports, please open an issue on GitHub. If you would like to contribute code, you can do so by forking the repository and creating a pull request. Please ensure that your code follows the project's coding standards.

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
