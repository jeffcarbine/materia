/**
 * Fixture component for the InView hydration test: adds its own class and a
 * click handler in the constructor, like a typical v2 component.
 */
import { Div } from "materiajs/v2/elements";

export class Badge extends Div {
  constructor(props = {}) {
    props.$classList = ["badge", ...(props.$classList || [])];
    props.__click = ({ target }) => {
      target.dataset.clicked = "yes";
    };
    super(props);
  }
}
