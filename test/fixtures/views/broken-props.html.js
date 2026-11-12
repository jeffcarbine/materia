/** Fixture view whose `props` export is not an object. */
import { P } from "materiajs/v2/elements";

export const props = "not an object";

export default () => new P("rendered anyway");
