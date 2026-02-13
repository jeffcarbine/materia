import { Div } from "./elements.html.js";

const oldFormat = new Div({
  if: condition,
  binding: "someValue",
  class: (someValue) => `class-${someValue}`,
  children: [new Div(), new Div()],
});

const newFormat =
  condition &&
  new Div(
    {
      // Materia-specific properties
      $_binding: "user",
      $_trigger: "systemThemeChange",
      $_imports: {
        themeOverride,
        $light900,
        userPanel: new ExternalModule(
          UserPanel,
          "/components/userPanel.html.js",
        ),
      },

      // DOM Properties ($ prefix)
      $text: (user) => `Hello, ${user.name}!`,
      $style: {
        color: (user, imports) => {
          const { $light900 } = imports;

          return user.isPremium ? $light900 : "black";
        },
        fontSize: "16px",
        padding: "1rem",
      },
      $data: {
        userId: (user) => user.id,
      },
      $classList: ["card", "p-sm", "ml-2"],

      id: "user-card",
      ariaLabel: "User card",
      tabindex: -1,

      // Events - __ prefix prevents default, single _ allows default behavior
      __click: (card) => console.log("Card clicked!", card),
      _load: (card, event, imports, elements) =>
        console.log("Card loaded!", card, event, imports, elements),
    },
    (user, imports, elements) => {
      const { UserPanel } = imports;
      const { P, Button } = elements;

      return new UserPanel([
        new P(`Welcome back, ${user.name}!`),
        new Button("View Profile", {
          __click: () => console.log("View profile clicked!"),
        }),
      ]);
      ``;
    },
  );
