/**
 * Server-side fixture for the hydration test: renders a v2 view shaped like a
 * real page and prints `{ html, state }`, where `state` is the data, handlers,
 * triggers, and delegates a server-rendered page hands to the browser.
 */
import MateriaJS, { Bind, Import, Handle } from "materiajs";
import { Html, Head, Body, Main, H1, P, Section, Span, Ul, Button } from "materiajs/v2/elements";
import { greet } from "./greeter.js";
import { waitForServerDocument } from "../helpers.js";

const materia = new MateriaJS();
await waitForServerDocument(materia);

materia.set("user", { name: "Ada", theme: "dark", lang: "en" });
materia.set("items", ["a"]);

const greeterPath = new URL("./greeter.js", import.meta.url).href;

const html = materia.render(
  new Html({
    lang: Bind("user.lang"),
    $children: [
      new Head({}),
      new Body({
        dataTheme: Bind("user.theme"),
        $children: [
          new Main({
            $children: [
              new H1({ id: "title", $textContent: Bind("user.name", ({ data }) => `Welcome, ${data}`) }),
              new P({
                id: "greeting",
                $children: [Bind("user.name", Import(greet, greeterPath), ({ data, imports: greet }) => greet(data))],
              }),
              new P({ id: "mixed", $children: ["Signed in as ", Bind("user.name", "!", ({ data, imports: mark }) => data + mark)] }),
              new Section({
                id: "panel",
                $classList: ["panel", Bind("user.theme", ({ data }) => `theme-${data}`)],
                $style: { color: Bind("user.theme", ({ data }) => (data === "dark" ? "red" : "blue")) },
                $children: [
                  new Span({ id: "static", $textContent: "static" }),
                  new Button({
                    id: "greet",
                    __click: Handle(Import(greet, greeterPath), ({ target, imports: greet }) => {
                      target.textContent = greet(Materia.get("user.name"));
                    }),
                  }),
                ],
              }),
              new P({
                id: "actions",
                $children: [
                  Bind("user.name", ({ data }) => `${data}: `),
                  new Button({
                    id: "bare",
                    __click: ({ target }) => {
                      target.textContent = "bare";
                    },
                  }),
                  new Button({
                    id: "say",
                    __click: Handle("hi", ({ target, imports }) => {
                      target.textContent = imports;
                    }),
                  }),
                ],
              }),
              new Ul({
                id: "items",
                $children: Bind("items", ({ data, elements: { Li } }) =>
                  data.map((item) => new Li({ $textContent: item }))
                ),
              }),
            ],
          }),
        ],
      }),
    ],
  })
);

const { data, handlers, triggers, delegate } = materia.review();
process.stdout.write(JSON.stringify({ html, state: { data, handlers, triggers, delegate } }));
process.exit(0);
