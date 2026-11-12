/**
 * Fixture view for the engine test: reads app props, view props, function
 * props, request data, and the user passed to `res.render`.
 */
import { Bind } from "materiajs";
import { Div, P } from "materiajs/v2/elements";

export const props = {
  greeting: "Hello",
  fromRequest: (data) => `page ${data.page}`,
  lazy: () => async () => "loaded later",
};

export default (data) =>
  new Div({
    $children: [
      new P({ id: "greeting", $textContent: Bind("greeting", ({ data: greeting }) => `${greeting}, ${data.user.name}`) }),
      new P({ id: "site", $textContent: Bind("siteName") }),
      new P({ id: "request", $textContent: Bind("fromRequest") }),
      new P({ id: "lazy", $textContent: Bind("lazy") }),
      new P({ id: "materia", $textContent: data.materia.greeting }),
    ],
  });
