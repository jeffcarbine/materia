import {
  validHTMLAttributes,
  validDOMProperties,
  validEvents,
  validMutations,
  validMateriaProps,
} from "materiajs/validProps";

export class Element {
  initialize(config = {}, children = null) {
    if (typeof config === "object") {
      if (Array.isArray(config)) {
        // if it is an array, then it is handled as children
        this.handleChildren(config);
      } else if (config instanceof Element) {
        // if it is an element, then it is handled as a single child
        this.handleChildren([config]);
      } else {
        // otherwise, it is handled properly as a config
        this.handleObjectConfig(config);
      }
    } else {
      // if it is a primitive value, then it is handled uniquely based on the Element type
      this.handlePrimitiveConfig(config);
    }

    if (children) {
      // If children is a function and we have a binding, assign it directly for data-binding
      if (typeof children === "function" && config.$_bind) {
        this.children = children;
      } else {
        // check if the children is an array, if not wrap it in an array
        if (!Array.isArray(children)) {
          children = [children];
        }

        this.handleChildren(children);
      }
    }
  }

  handleChildren(arr) {
    if (!this.children) {
      this.children = arr;
    } else if (typeof this.children === "object") {
      if (Array.isArray(this.children)) {
        // if it is an array, spread it and the new array into a new array
        this.children = [...arr, ...this.children];
      } else {
        // otherwise it's an object and we can wrap it and spread the new array
        this.children = [...arr, this.children];
      }
    } else {
      // if it's a primitive value, then wrap it in a Div and spread the new array
      this.children = [...arr, new Div(this.children)];
    }
  }

  handleObjectConfig(config) {
    const validProps = [
      ...validHTMLAttributes,
      ...validDOMProperties,
      ...validMateriaProps,
    ];
    const validEventsAndMutations = [...validEvents, ...validMutations];

    for (let key in config) {
      // Default value if it's a valid prop directly (attributes, DOM props, materia props, data attributes)
      let isValid = validProps.includes(key) || key.startsWith("data");

      // Check if it's an event with __ prefix (events with preventDefault)
      if (key.startsWith("__")) {
        const eventName = key.slice(2);
        isValid =
          validEvents.includes(eventName) || eventName.startsWith("keydown:");
      }
      // Check if it's an event with _ prefix (events with no preventDefault and mutations)
      else if (key.startsWith("_")) {
        const eventName = key.slice(1);
        isValid =
          validEventsAndMutations.includes(eventName) ||
          eventName.startsWith("keydown:") ||
          eventName.startsWith("attributes:");
      }

      if (isValid) {
        this[key] = config[key];
      }
    }
  }

  handlePrimitiveConfig(config) {
    const primitiveHandlers = {
      img: (config) => (this.src = config),
      script: (config) => (this.src = config),
      link: (config) => (this.href = config),
      default: (config) => (this.textContent = config),
    };

    (primitiveHandlers[this.$tagName] || primitiveHandlers.default)(config);
  }
}

export class Html extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "html";
    this.initialize(config, children);
  }
}
export class Head extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "head";
    this.initialize(config, children);
  }
}

export class Link extends Element {
  constructor(config) {
    super(config);
    this.$tagName = "link";
    this.initialize(config);
  }
}

export class Stylesheet extends Link {
  constructor(config) {
    super(config);
    this.rel = "stylesheet";
  }
}

export class PreLoadStyle extends Link {
  constructor(config) {
    super(config);
    this.rel = "preload";
    this.as = "style";
    this.onload = "this.onload=null;this.rel='stylesheet'";
  }
}

export class Meta extends Element {
  constructor(config) {
    super(config);
    this.$tagName = "meta";
    this.initialize(config);
  }
}

export class Style extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "style";
    this.initialize(config, children);
  }
}

export class Title extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "title";
    this.initialize(config, children);
  }
}

export class Body extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "body";
    this.initialize(config, children);
  }
}

export class Address extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "address";
    this.initialize(config, children);
  }
}

export class Article extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "article";
    this.initialize(config, children);
  }
}

export class Aside extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "aside";
    this.initialize(config, children);
  }
}

export class Footer extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "footer";
    this.initialize(config, children);
  }
}

export class Header extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "header";
    this.initialize(config, children);
  }
}

export class H1 extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "h1";
    this.initialize(config, children);
  }
}

export class H2 extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "h2";
    this.initialize(config, children);
  }
}

export class H3 extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "h3";
    this.initialize(config, children);
  }
}

export class H4 extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "h4";
    this.initialize(config, children);
  }
}

export class H5 extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "h5";
    this.initialize(config, children);
  }
}

export class H6 extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "h6";
    this.initialize(config, children);
  }
}

export class Hgroup extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "hgroup";

    if (!this.children) {
      this.children = [];
    }

    if (typeof config === "object" && !Array.isArray(config) && config.h) {
      const heading = new Element();
      heading.$tagName = `h${config.h}`;
      heading.initialize({
        textContent: config.textContent,
      });

      this.children.push(heading);

      delete config.h;
      delete config.textContent;
    }

    if (
      typeof config === "object" &&
      !Array.isArray(config) &&
      config.subheading
    ) {
      this.children.push(
        new P({
          textContent: config.subheading,
        }),
      );

      delete config.subheading;
    }

    if (
      typeof config === "object" &&
      !Array.isArray(config) &&
      config.preheading
    ) {
      this.children.unshift(
        new P({
          textContent: config.preheading,
        }),
      );

      delete config.preheading;
    }

    this.initialize(config, children);
  }
}

export class Main extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "main";
    this.initialize(config, children);
  }
}

export class Nav extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "nav";
    this.initialize(config, children);
  }
}

export class Section extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "section";
    this.initialize(config, children);
  }
}

export class Blockquote extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "blockquote";
    this.initialize(config, children);
  }
}

export class Dd extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "dd";
    this.initialize(config, children);
  }
}

export class Div extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "div";
    this.initialize(config, children);
  }
}

export class Dl extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "dl";
    this.initialize(config, children);
  }
}

export class Dt extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "dt";
    this.initialize(config, children);
  }
}

export class Figcaption extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "figcaption";
    this.initialize(config, children);
  }
}

export class Figure extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "figure";
    this.initialize(config, children);
  }
}

export class Hr extends Element {
  constructor(config) {
    super(config);
    this.$tagName = "hr";
    this.initialize(config);
  }
}

export class Menu extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "menu";
    this.initialize(config, children);
  }
}

export class P extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "p";
    this.initialize(config, children);
  }
}

export class Pre extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "pre";
    this.initialize(config, children);
  }
}

export class ListElement extends Element {
  constructor(config, children) {
    super(config, children);

    // if we have config.children
    if (
      typeof config === "object" &&
      !Array.isArray(config) &&
      config.children &&
      Array.isArray(config.children)
    ) {
      // ensure that they are all wrapped in Li elements
      config.children = config.children.map((child) =>
        child instanceof Li ? child : new Li(child),
      );
    }
  }
}

export class Ul extends ListElement {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "ul";

    this.initialize(config, children);
  }
}

export class Ol extends ListElement {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "ol";

    this.initialize(config, children);
  }
}

export class Li extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "li";
    this.initialize(config, children);
  }
}

export class A extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "a";

    // if the href is an external link, then add the noopener and noreferrer attributes
    if (
      typeof config === "object" &&
      !Array.isArray(config) &&
      config.href &&
      config.href.startsWith("http")
    ) {
      if (!config.rel) {
        config.rel = "noopener noreferrer";
      } else if (!config.rel.includes("noopener noreferrer")) {
        config.rel += " noopener noreferrer";
      }
    }

    this.initialize(config, children);
  }
}

export class Abbr extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "abbr";
    this.initialize(config, children);
  }
}

export class B extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "b";
    this.initialize(config, children);
  }
}

export class Bdi extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "bdi";
    this.initialize(config, children);
  }
}

export class Bdo extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "bdo";
    this.initialize(config, children);
  }
}

export class Br extends Element {
  constructor(config) {
    super(config);
    this.$tagName = "br";
    this.initialize(config);
  }
}

export class Cite extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "cite";
    this.initialize(config, children);
  }
}

export class Code extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "code";
    this.initialize(config, children);
  }
}

export class Data extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "data";
    this.initialize(config, children);
  }
}

export class Dfn extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "dfn";
    this.initialize(config, children);
  }
}

export class Em extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "em";
    this.initialize(config, children);
  }
}

export class I extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "i";
    this.initialize(config, children);
  }
}

export class Kbd extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "kbd";
    this.initialize(config, children);
  }
}

export class Mark extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "mark";
    this.initialize(config, children);
  }
}

export class Q extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "q";
    this.initialize(config, children);
  }
}

export class Rp extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "rp";
    this.initialize(config, children);
  }
}

export class Rt extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "rt";
    this.initialize(config, children);
  }
}

export class Ruby extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "ruby";
    this.initialize(config, children);
  }
}

export class S extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "s";
    this.initialize(config, children);
  }
}

export class Samp extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "samp";
    this.initialize(config, children);
  }
}

export class Small extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "small";
    this.initialize(config, children);
  }
}

export class Span extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "span";
    this.initialize(config, children);
  }
}

export class Strong extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "strong";
    this.initialize(config, children);
  }
}

export class Sub extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "sub";
    this.initialize(config, children);
  }
}

export class Sup extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "sup";
    this.initialize(config, children);
  }
}

export class Time extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "time";
    this.initialize(config, children);
  }
}

export class U extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "u";
    this.initialize(config, children);
  }
}

export class Var extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "var";
    this.initialize(config, children);
  }
}

export class Wbr extends Element {
  constructor(config) {
    super(config);
    this.$tagName = "wbr";
    this.initialize(config);
  }
}

export class Area extends Element {
  constructor(config) {
    super(config);
    this.$tagName = "area";
    this.initialize(config);
  }
}

export class Audio extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "audio";
    this.initialize(config, children);
  }
}

export class Img extends Element {
  constructor(config) {
    super(config);
    this.$tagName = "img";
    this.initialize(config);
  }
}

export class LazyImg extends Img {
  constructor(config) {
    super(config);
    this.loading = "lazy";
  }
}

export class Map extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "map";
    this.initialize(config, children);
  }
}

export class Track extends Element {
  constructor(config) {
    super(config);
    this.$tagName = "track";
    this.initialize(config);
  }
}

export class Video extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "video";
    this.initialize(config, children);
  }
}

export class Embed extends Element {
  constructor(config) {
    super(config);
    this.$tagName = "embed";
    this.initialize(config);
  }
}

export class Iframe extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "iframe";
    this.initialize(config, children);
  }
}

export class Object extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "object";
    this.initialize(config, children);
  }
}

export class Param extends Element {
  constructor(config) {
    super(config);
    this.$tagName = "param";
    this.initialize(config);
  }
}

export class Picture extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "picture";
    this.initialize(config, children);
  }
}

export class Source extends Element {
  constructor(config) {
    super(config);
    this.$tagName = "source";
    this.initialize(config);
  }
}

export class Canvas extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "canvas";
    this.initialize(config, children);
  }
}

export class Noscript extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "noscript";
    this.initialize(config, children);
  }
}

export class Script extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "script";
    this.defer = true;
    this.initialize(config, children);
  }
}

export class Module extends Script {
  constructor(config, children) {
    super(config, children);
    this.type = "module";
  }
}

export class Del extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "del";
    this.initialize(config, children);
  }
}

export class Ins extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "ins";
    this.initialize(config, children);
  }
}

export class Caption extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "caption";
    this.initialize(config, children);
  }
}

export class Col extends Element {
  constructor(config) {
    super(config);
    this.$tagName = "col";
    this.initialize(config);
  }
}

export class Colgroup extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "colgroup";
    this.initialize(config, children);
  }
}

export class Table extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "table";
    this.initialize(config, children);
  }
}

export class TBody extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "tbody";
    this.initialize(config, children);
  }
}

export class Td extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "td";
    this.initialize(config, children);
  }
}

export class Tfoot extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "tfoot";
    this.initialize(config, children);
  }
}

export class Th extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "th";
    this.initialize(config, children);
  }
}

export class THead extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "thead";
    this.initialize(config, children);
  }
}

export class Tr extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "tr";
    this.initialize(config, children);
  }
}

export class Button extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "button";
    this.initialize(config, children);
  }
}

export class Datalist extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "datalist";
    this.initialize(config, children);
  }
}

export class Fieldset extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "fieldset";
    this.initialize(config, children);
  }
}

export class Form extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "form";

    // if no config or not an object, create an empty object
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      config = {};
    }

    if (!config?.method) {
      config.method = "POST";
    }

    this.initialize(config, children);
  }
}

export class Input extends Element {
  constructor(config) {
    super(config);
    this.$tagName = "input";
    this.initialize(config);
  }
}

export class HiddenInput extends Input {
  constructor(config) {
    super(config);
    this.type = "hidden";
  }
}

export class TextInput extends Input {
  constructor(config) {
    super(config);
    this.type = "text";
  }
}

export class SearchInput extends Input {
  constructor(config) {
    super(config);
    this.type = "search";
  }
}

export class TelInput extends Input {
  constructor(config) {
    super(config);
    this.type = "tel";
  }
}

export class UrlInput extends Input {
  constructor(config) {
    super(config);
    this.type = "url";
  }
}

export class EmailInput extends Input {
  constructor(config) {
    super(config);
    this.type = "email";
  }
}

export class PasswordInput extends Input {
  constructor(config) {
    super(config);
    this.type = "password";
  }
}

export class DateInput extends Input {
  constructor(config) {
    super(config);
    this.type = "date";
  }
}

export class MonthInput extends Input {
  constructor(config) {
    super(config);
    this.type = "month";
  }
}

export class WeekInput extends Input {
  constructor(config) {
    super(config);
    this.type = "week";
  }
}

export class TimeInput extends Input {
  constructor(config) {
    super(config);
    this.type = "time";
  }
}

export class DatetimeLocalInput extends Input {
  constructor(config) {
    super(config);
    this.type = "datetime-local";
  }
}

export class NumberInput extends Input {
  constructor(config) {
    super(config);
    this.type = "number";
  }
}

export class RangeInput extends Input {
  constructor(config) {
    super(config);
    this.type = "range";
  }
}

export class ColorInput extends Input {
  constructor(config) {
    super(config);
    this.type = "color";
  }
}

export class CheckboxInput extends Input {
  constructor(config) {
    super(config);
    this.type = "checkbox";
  }
}

export class RadioInput extends Input {
  constructor(config) {
    super(config);
    this.type = "radio";
  }
}

export class FileInput extends Input {
  constructor(config) {
    super(config);
    this.type = "file";
  }
}

export class SubmitInput extends Input {
  constructor(config) {
    super(config);
    this.type = "submit";
  }
}

export class ImageInput extends Input {
  constructor(config) {
    super(config);
    this.type = "image";
  }
}

export class ResetInput extends Input {
  constructor(config) {
    super(config);
    this.type = "reset";
  }
}

export class ButtonInput extends Input {
  constructor(config) {
    super(config);
    this.type = "button";
  }
}

export class Label extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "label";
    this.initialize(config, children);
  }
}

export class Legend extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "legend";
    this.initialize(config, children);
  }
}

export class Meter extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "meter";
    this.initialize(config, children);
  }
}

export class Optgroup extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "optgroup";
    this.initialize(config, children);
  }
}

export class Option extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "option";
    this.initialize(config, children);
  }
}

export class Output extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "output";
    this.initialize(config, children);
  }
}

export class Progress extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "progress";
    this.initialize(config, children);
  }
}

export class Select extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "select";
    this.initialize(config, children);
  }
}

export class Textarea extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "textarea";
    this.initialize(config, children);
  }
}

export class Details extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "details";
    this.initialize(config, children);
  }
}

export class Dialog extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "dialog";
    this.initialize(config, children);
  }
}

export class Summary extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "summary";
    this.initialize(config, children);
  }
}

export class Slot extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "slot";
    this.initialize(config, children);
  }
}

export class Template extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "template";
    this.initialize(config, children);
  }
}

export class Svg extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "svg";
    this.version = "1.1";
    this.xmlns = "http://www.w3.org/2000/svg";
    this.initialize(config, children);
  }
}

export class Circle extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "circle";
    this.initialize(config, children);
  }
}

export class Ellipse extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "ellipse";
    this.initialize(config, children);
  }
}

export class Line extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "line";
    this.initialize(config, children);
  }
}

export class Path extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "path";
    this.initialize(config, children);
  }
}

export class Polygon extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "polygon";
    this.initialize(config, children);
  }
}

export class Polyline extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "polyline";
    this.initialize(config, children);
  }
}

export class Rect extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "rect";
    this.initialize(config, children);
  }
}

export class Text extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "text";
    this.initialize(config, children);
  }
}

export class Tspan extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "tspan";
    this.initialize(config, children);
  }
}

export class G extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "g";
    this.initialize(config, children);
  }
}

export class Defs extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "defs";
    this.initialize(config, children);
  }
}

export class LinearGradient extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "linearGradient";
    this.initialize(config, children);
  }
}

export class RadialGradient extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "radialGradient";
    this.initialize(config, children);
  }
}

export class Stop extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "stop";
    this.initialize(config, children);
  }
}

export class Use extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "use";
    this.initialize(config, children);
  }
}

export class Symbol extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "symbol";
    this.initialize(config, children);
  }
}

export class ClipPath extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "clipPath";
    this.initialize(config, children);
  }
}

export class Pattern extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "pattern";
    this.initialize(config, children);
  }
}

export class Mask extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "mask";
    this.initialize(config, children);
  }
}

export class Filter extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "filter";
    this.initialize(config, children);
  }
}

export class FeGaussianBlur extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "feGaussianBlur";
    this.initialize(config, children);
  }
}

export class FeOffset extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "feOffset";
    this.initialize(config, children);
  }
}

export class FeBlend extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "feBlend";
    this.initialize(config, children);
  }
}

export class FeColorMatrix extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "feColorMatrix";
    this.initialize(config, children);
  }
}

export class FeComponentTransfer extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "feComponentTransfer";
    this.initialize(config, children);
  }
}

export class FeComposite extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "feComposite";
    this.initialize(config, children);
  }
}

export class FeConvolveMatrix extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "feConvolveMatrix";
    this.initialize(config, children);
  }
}

export class FeDiffuseLighting extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "feDiffuseLighting";
    this.initialize(config, children);
  }
}

export class FeDisplacementMap extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "feDisplacementMap";
    this.initialize(config, children);
  }
}

export class FeFlood extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "feFlood";
    this.initialize(config, children);
  }
}

export class FeImage extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "feImage";
    this.initialize(config, children);
  }
}

export class FeMerge extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "feMerge";
    this.initialize(config, children);
  }
}

export class FeMorphology extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "feMorphology";
    this.initialize(config, children);
  }
}

export class FeSpecularLighting extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "feSpecularLighting";
    this.initialize(config, children);
  }
}

export class FeTile extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "feTile";
    this.initialize(config, children);
  }
}

export class FeTurbulence extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "feTurbulence";
    this.initialize(config, children);
  }
}

export class Math extends Element {
  constructor(config, children) {
    super(config, children);
    this.$tagName = "math";
    this.initialize(config, children);
  }
}
