/** Fixture view: a full page with an InView value, for the engine defaults test. */
import { InView } from "materiajs";
import { Html, Head, Body, P } from "materiajs/v2/elements";

export default () =>
  new Html({ $children: [new Head({}), new Body({ $children: [new P({ $textContent: InView("x") })] })] });
