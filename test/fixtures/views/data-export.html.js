/** Fixture view that exports its initial data as `data` instead of `props`. */
import { Bind } from "materiajs";
import { P } from "materiajs/v2/elements";

export const data = { motto: "Data export" };

export default () => new P({ $textContent: Bind("motto") });
