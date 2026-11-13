/**
 * Server-side fixture for the InView hydration test: renders InView values
 * (top-level, inside a bound $classList, and as a $children item) with
 * instance defaults, and prints `{ html, state }` as handed to the browser.
 */
import MateriaJS, { Bind, Import, InView } from "materiajs";
import { Div, P, Span, Em, I } from "materiajs/v2/elements";
import { Badge } from "./components/badge.js";
import { waitForServerDocument } from "../helpers.js";

const materia = new MateriaJS({ inView: { margin: "25px" } });
await waitForServerDocument(materia);
materia.set("tone", "dark");

const badgePath = new URL("./components/badge.js", import.meta.url).href;

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
      // a component instance inside InView
      new Div({
        id: "comp",
        $children: [
          InView(new Badge({ id: "badge", $children: [new Span({ $textContent: Bind("tone") })] }), {
            initial: "…",
          }),
        ],
      }),
      // an InView(Bind) whose handler builds a component through Import
      new Div({
        id: "bound-comp",
        $children: [
          InView(
            Bind("tone", Import(Badge, badgePath), ({ data, imports: Badge }) =>
              new Badge({ id: "made", $textContent: `made ${data}` })
            )
          ),
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
