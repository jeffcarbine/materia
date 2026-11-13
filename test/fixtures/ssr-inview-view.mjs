/**
 * Server-side fixture for the InView hydration test: renders InView values
 * (top-level, inside a bound $classList, and as a $children item) with
 * instance defaults, and prints `{ html, state }` as handed to the browser.
 */
import MateriaJS, { Bind, InView } from "materiajs";
import { Div, P, Span, Em, I } from "materiajs/v2/elements";
import { waitForServerDocument } from "../helpers.js";

const materia = new MateriaJS({ inView: { margin: "25px" } });
await waitForServerDocument(materia);
materia.set("tone", "dark");

const html = materia.render(
  new Div({
    $children: [
      new P({ id: "top", title: InView("t"), $textContent: InView("Shown", { initial: "Waiting" }) }),
      new Div({ id: "panel", $classList: ["panel", Bind("tone"), InView("fade-in")] }),
      new Div({
        id: "kids",
        $children: [
          new Span({ id: "first", $textContent: "first" }),
          InView(new Em({ id: "late", $textContent: Bind("tone") }), { initial: new I("loading") }),
          new Span({ id: "last", $textContent: "last" }),
        ],
      }),
    ],
  })
);

const { data, handlers, triggers, delegate, inView, inViewEntries } = materia.review();
process.stdout.write(
  JSON.stringify({ html, state: { data, handlers, triggers, delegate, inView, inViewEntries } })
);
process.exit(0);
