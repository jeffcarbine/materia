import {
  validHTMLAttributes,
  validDOMProperties,
  validEvents,
  validMutations,
  validMateriaProps,
} from "./validProps";

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
      // check if the children is an array, if not wrap it in an array
      if (!Array.isArray(children)) {
        children = [children];
      }

      this.handleChildren(children);
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

    (primitiveHandlers[this.tagName] || primitiveHandlers.default)(config);
  }

  // TODO: determine if this should be deprecated
  classList = {
    add: (className) => {
      if (!this.class) {
        this.class = className;
      } else if (!this.class.includes(className)) {
        this.class += ` ${className}`;
      }
    },
  };
}

export class Html extends Element {
  constructor(config) {
    super(config);
    this.tagName = "html";
    this.initialize(config);
  }
}
export class Head extends Element {
  constructor(config) {
    super(config);
    this.tagName = "head";
    this.initialize(config);
  }
}

export class Link extends Element {
  constructor(config) {
    super(config);
    this.tagName = "link";
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
    this.tagName = "meta";
    this.initialize(config);
  }
}

export class Style extends Element {
  constructor(config) {
    super(config);
    this.tagName = "style";
    this.initialize(config);
  }
}

export class Title extends Element {
  constructor(config) {
    super(config);
    this.tagName = "title";
    this.initialize(config);
  }
}

export class Body extends Element {
  constructor(config) {
    super(config);
    this.tagName = "body";
    this.initialize(config);
  }
}

export class Address extends Element {
  constructor(config) {
    super(config);
    this.tagName = "address";
    this.initialize(config);
  }
}

export class Article extends Element {
  constructor(config) {
    super(config);
    this.tagName = "article";
    this.initialize(config);
  }
}

export class Aside extends Element {
  constructor(config) {
    super(config);
    this.tagName = "aside";
    this.initialize(config);
  }
}

export class Footer extends Element {
  constructor(config) {
    super(config);
    this.tagName = "footer";
    this.initialize(config);
  }
}

export class Header extends Element {
  constructor(config) {
    super(config);
    this.tagName = "header";
    this.initialize(config);
  }
}

export class H1 extends Element {
  constructor(config) {
    super(config);
    this.tagName = "h1";
    this.initialize(config);
  }
}

export class H2 extends Element {
  constructor(config) {
    super(config);
    this.tagName = "h2";
    this.initialize(config);
  }
}

export class H3 extends Element {
  constructor(config) {
    super(config);
    this.tagName = "h3";
    this.initialize(config);
  }
}

export class H4 extends Element {
  constructor(config) {
    super(config);
    this.tagName = "h4";
    this.initialize(config);
  }
}

export class H5 extends Element {
  constructor(config) {
    super(config);
    this.tagName = "h5";
    this.initialize(config);
  }
}

export class H6 extends Element {
  constructor(config) {
    super(config);
    this.tagName = "h6";
    this.initialize(config);
  }
}

export class Hgroup extends Element {
  constructor(config) {
    super(config);
    this.tagName = "hgroup";

    if (!this.children) {
      this.children = [];
    }

    if (config.h) {
      const heading = new Element();
      heading.tagName = `h${config.h}`;
      heading.initialize({
        textContent: config.textContent,
      });

      this.children.push(heading);

      delete config.h;
      delete config.textContent;
    }

    if (config.subheading) {
      this.children.push(
        new P({
          textContent: config.subheading,
        }),
      );

      delete config.subheading;
    }

    if (config.preheading) {
      this.children.unshift(
        new P({
          textContent: config.preheading,
        }),
      );

      delete config.preheading;
    }

    this.initialize(config);
  }
}

export class Main extends Element {
  constructor(config) {
    super(config);
    this.tagName = "main";
    this.initialize(config);
  }
}

export class Nav extends Element {
  constructor(config) {
    super(config);
    this.tagName = "nav";
    this.initialize(config);
  }
}

export class Section extends Element {
  constructor(config) {
    super(config);
    this.tagName = "section";
    this.initialize(config);
  }
}

export class Blockquote extends Element {
  constructor(config) {
    super(config);
    this.tagName = "blockquote";
    this.initialize(config);
  }
}

export class Dd extends Element {
  constructor(config) {
    super(config);
    this.tagName = "dd";
    this.initialize(config);
  }
}

export class Div extends Element {
  constructor(config) {
    super(config);
    this.tagName = "div";
    this.initialize(config);
  }
}

export class Dl extends Element {
  constructor(config) {
    super(config);
    this.tagName = "dl";
    this.initialize(config);
  }
}

export class Dt extends Element {
  constructor(config) {
    super(config);
    this.tagName = "dt";
    this.initialize(config);
  }
}

export class Figcaption extends Element {
  constructor(config) {
    super(config);
    this.tagName = "figcaption";
    this.initialize(config);
  }
}

export class Figure extends Element {
  constructor(config) {
    super(config);
    this.tagName = "figure";
    this.initialize(config);
  }
}

export class Hr extends Element {
  constructor(config) {
    super(config);
    this.tagName = "hr";
    this.initialize(config);
  }
}

export class Menu extends Element {
  constructor(config) {
    super(config);
    this.tagName = "menu";
    this.initialize(config);
  }
}

export class P extends Element {
  constructor(config) {
    super(config);
    this.tagName = "p";
    this.initialize(config);
  }
}

export class Pre extends Element {
  constructor(config) {
    super(config);
    this.tagName = "pre";
    this.initialize(config);
  }
}

export class ListElement extends Element {
  constructor(config) {
    super(config);

    // if we have config.children
    if (config.children && Array.isArray(config.children)) {
      // ensure that they are all wrapped in Li elements
      config.children = config.children.map((child) =>
        child instanceof Li ? child : new Li(child),
      );
    }
  }
}

export class Ul extends ListElement {
  constructor(config) {
    super(config);
    this.tagName = "ul";

    this.initialize(config);
  }
}

export class Ol extends ListElement {
  constructor(config) {
    super(config);
    this.tagName = "ol";

    this.initialize(config);
  }
}

export class Li extends Element {
  constructor(config) {
    super(config);
    this.tagName = "li";
    this.initialize(config);
  }
}

export class A extends Element {
  constructor(config) {
    super(config);
    this.tagName = "a";

    // if the href is an external link, then add the noopener and noreferrer attributes
    if (config.href && config.href.startsWith("http")) {
      if (!config.rel) {
        config.rel = "noopener noreferrer";
      } else if (!config.rel.includes("noopener noreferrer")) {
        config.rel += " noopener noreferrer";
      }
    }

    this.initialize(config);
  }
}

export class Abbr extends Element {
  constructor(config) {
    super(config);
    this.tagName = "abbr";
    this.initialize(config);
  }
}

export class B extends Element {
  constructor(config) {
    super(config);
    this.tagName = "b";
    this.initialize(config);
  }
}

export class Bdi extends Element {
  constructor(config) {
    super(config);
    this.tagName = "bdi";
    this.initialize(config);
  }
}

export class Bdo extends Element {
  constructor(config) {
    super(config);
    this.tagName = "bdo";
    this.initialize(config);
  }
}

export class Br extends Element {
  constructor(config) {
    super(config);
    this.tagName = "br";
    this.initialize(config);
  }
}

export class Cite extends Element {
  constructor(config) {
    super(config);
    this.tagName = "cite";
    this.initialize(config);
  }
}

export class Code extends Element {
  constructor(config) {
    super(config);
    this.tagName = "code";
    this.initialize(config);
  }
}

export class Data extends Element {
  constructor(config) {
    super(config);
    this.tagName = "data";
    this.initialize(config);
  }
}

export class Dfn extends Element {
  constructor(config) {
    super(config);
    this.tagName = "dfn";
    this.initialize(config);
  }
}

export class Em extends Element {
  constructor(config) {
    super(config);
    this.tagName = "em";
    this.initialize(config);
  }
}

export class I extends Element {
  constructor(config) {
    super(config);
    this.tagName = "i";
    this.initialize(config);
  }
}

export class Kbd extends Element {
  constructor(config) {
    super(config);
    this.tagName = "kbd";
    this.initialize(config);
  }
}

export class Mark extends Element {
  constructor(config) {
    super(config);
    this.tagName = "mark";
    this.initialize(config);
  }
}

export class Q extends Element {
  constructor(config) {
    super(config);
    this.tagName = "q";
    this.initialize(config);
  }
}

export class Rp extends Element {
  constructor(config) {
    super(config);
    this.tagName = "rp";
    this.initialize(config);
  }
}

export class Rt extends Element {
  constructor(config) {
    super(config);
    this.tagName = "rt";
    this.initialize(config);
  }
}

export class Ruby extends Element {
  constructor(config) {
    super(config);
    this.tagName = "ruby";
    this.initialize(config);
  }
}

export class S extends Element {
  constructor(config) {
    super(config);
    this.tagName = "s";
    this.initialize(config);
  }
}

export class Samp extends Element {
  constructor(config) {
    super(config);
    this.tagName = "samp";
    this.initialize(config);
  }
}

export class Small extends Element {
  constructor(config) {
    super(config);
    this.tagName = "small";
    this.initialize(config);
  }
}

export class Span extends Element {
  constructor(config) {
    super(config);
    this.tagName = "span";
    this.initialize(config);
  }
}

export class Strong extends Element {
  constructor(config) {
    super(config);
    this.tagName = "strong";
    this.initialize(config);
  }
}

export class Sub extends Element {
  constructor(config) {
    super(config);
    this.tagName = "sub";
    this.initialize(config);
  }
}

export class Sup extends Element {
  constructor(config) {
    super(config);
    this.tagName = "sup";
    this.initialize(config);
  }
}

export class Time extends Element {
  constructor(config) {
    super(config);
    this.tagName = "time";
    this.initialize(config);
  }
}

export class U extends Element {
  constructor(config) {
    super(config);
    this.tagName = "u";
    this.initialize(config);
  }
}

export class Var extends Element {
  constructor(config) {
    super(config);
    this.tagName = "var";
    this.initialize(config);
  }
}

export class Wbr extends Element {
  constructor(config) {
    super(config);
    this.tagName = "wbr";
    this.initialize(config);
  }
}

export class Area extends Element {
  constructor(config) {
    super(config);
    this.tagName = "area";
    this.initialize(config);
  }
}

export class Audio extends Element {
  constructor(config) {
    super(config);
    this.tagName = "audio";
    this.initialize(config);
  }
}

export class Img extends Element {
  constructor(config) {
    super(config);
    this.tagName = "img";
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
  constructor(config) {
    super(config);
    this.tagName = "map";
    this.initialize(config);
  }
}

export class Track extends Element {
  constructor(config) {
    super(config);
    this.tagName = "track";
    this.initialize(config);
  }
}

export class Video extends Element {
  constructor(config) {
    super(config);
    this.tagName = "video";
    this.initialize(config);
  }
}

export class Embed extends Element {
  constructor(config) {
    super(config);
    this.tagName = "embed";
    this.initialize(config);
  }
}

export class Iframe extends Element {
  constructor(config) {
    super(config);
    this.tagName = "iframe";
    this.initialize(config);
  }
}

export class Object extends Element {
  constructor(config) {
    super(config);
    this.tagName = "object";
    this.initialize(config);
  }
}

export class Param extends Element {
  constructor(config) {
    super(config);
    this.tagName = "param";
    this.initialize(config);
  }
}

export class Picture extends Element {
  constructor(config) {
    super(config);
    this.tagName = "picture";
    this.initialize(config);
  }
}

export class Source extends Element {
  constructor(config) {
    super(config);
    this.tagName = "source";
    this.initialize(config);
  }
}

export class Canvas extends Element {
  constructor(config) {
    super(config);
    this.tagName = "canvas";
    this.initialize(config);
  }
}

export class Noscript extends Element {
  constructor(config) {
    super(config);
    this.tagName = "noscript";
    this.initialize(config);
  }
}

export class Script extends Element {
  constructor(config) {
    super(config);
    this.tagName = "script";
    this.defer = true;
    this.initialize(config);
  }
}

export class Module extends Script {
  constructor(config) {
    super(config);
    this.type = "module";
  }
}

export class Del extends Element {
  constructor(config) {
    super(config);
    this.tagName = "del";
    this.initialize(config);
  }
}

export class Ins extends Element {
  constructor(config) {
    super(config);
    this.tagName = "ins";
    this.initialize(config);
  }
}

export class Caption extends Element {
  constructor(config) {
    super(config);
    this.tagName = "caption";
    this.initialize(config);
  }
}

export class Col extends Element {
  constructor(config) {
    super(config);
    this.tagName = "col";
    this.initialize(config);
  }
}

export class Colgroup extends Element {
  constructor(config) {
    super(config);
    this.tagName = "colgroup";
    this.initialize(config);
  }
}

export class Table extends Element {
  constructor(config) {
    super(config);
    this.tagName = "table";
    this.initialize(config);
  }
}

export class TBody extends Element {
  constructor(config) {
    super(config);
    this.tagName = "tbody";
    this.initialize(config);
  }
}

export class Td extends Element {
  constructor(config) {
    super(config);
    this.tagName = "td";
    this.initialize(config);
  }
}

export class Tfoot extends Element {
  constructor(config) {
    super(config);
    this.tagName = "tfoot";
    this.initialize(config);
  }
}

export class Th extends Element {
  constructor(config) {
    super(config);
    this.tagName = "th";
    this.initialize(config);
  }
}

export class THead extends Element {
  constructor(config) {
    super(config);
    this.tagName = "thead";
    this.initialize(config);
  }
}

export class Tr extends Element {
  constructor(config) {
    super(config);
    this.tagName = "tr";
    this.initialize(config);
  }
}

export class Button extends Element {
  constructor(config) {
    super(config);
    this.tagName = "button";
    this.initialize(config);
  }
}

export class Datalist extends Element {
  constructor(config) {
    super(config);
    this.tagName = "datalist";
    this.initialize(config);
  }
}

export class Fieldset extends Element {
  constructor(config) {
    super(config);
    this.tagName = "fieldset";
    this.initialize(config);
  }
}

export class Form extends Element {
  constructor(config) {
    super(config);
    this.tagName = "form";

    // if no config, create an empty object
    if (!config) {
      config = {};
    }

    if (!config?.method) {
      config.method = "POST";
    }

    this.initialize(config);
  }
}

export class Input extends Element {
  constructor(config) {
    super(config);
    this.tagName = "input";
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
  constructor(config) {
    super(config);
    this.tagName = "label";
    this.initialize(config);
  }
}

export class Legend extends Element {
  constructor(config) {
    super(config);
    this.tagName = "legend";
    this.initialize(config);
  }
}

export class Meter extends Element {
  constructor(config) {
    super(config);
    this.tagName = "meter";
    this.initialize(config);
  }
}

export class Optgroup extends Element {
  constructor(config) {
    super(config);
    this.tagName = "optgroup";
    this.initialize(config);
  }
}

export class Option extends Element {
  constructor(config) {
    super(config);
    this.tagName = "option";
    this.initialize(config);
  }
}

export class Output extends Element {
  constructor(config) {
    super(config);
    this.tagName = "output";
    this.initialize(config);
  }
}

export class Progress extends Element {
  constructor(config) {
    super(config);
    this.tagName = "progress";
    this.initialize(config);
  }
}

export class Select extends Element {
  constructor(config) {
    super(config);
    this.tagName = "select";
    this.initialize(config);
  }
}

export class Textarea extends Element {
  constructor(config) {
    super(config);
    this.tagName = "textarea";
    this.initialize(config);
  }
}

export class Details extends Element {
  constructor(config) {
    super(config);
    this.tagName = "details";
    this.initialize(config);
  }
}

export class Dialog extends Element {
  constructor(config) {
    super(config);
    this.tagName = "dialog";
    this.initialize(config);
  }
}

export class Summary extends Element {
  constructor(config) {
    super(config);
    this.tagName = "summary";
    this.initialize(config);
  }
}

export class Slot extends Element {
  constructor(config) {
    super(config);
    this.tagName = "slot";
    this.initialize(config);
  }
}

export class Template extends Element {
  constructor(config) {
    super(config);
    this.tagName = "template";
    this.initialize(config);
  }
}

export class Svg extends Element {
  constructor(config) {
    super(config);
    this.tagName = "svg";
    this.version = "1.1";
    this.xmlns = "http://www.w3.org/2000/svg";
    this.initialize(config);
  }
}

export class Circle extends Element {
  constructor(config) {
    super(config);
    this.tagName = "circle";
    this.initialize(config);
  }
}

export class Ellipse extends Element {
  constructor(config) {
    super(config);
    this.tagName = "ellipse";
    this.initialize(config);
  }
}

export class Line extends Element {
  constructor(config) {
    super(config);
    this.tagName = "line";
    this.initialize(config);
  }
}

export class Path extends Element {
  constructor(config) {
    super(config);
    this.tagName = "path";
    this.initialize(config);
  }
}

export class Polygon extends Element {
  constructor(config) {
    super(config);
    this.tagName = "polygon";
    this.initialize(config);
  }
}

export class Polyline extends Element {
  constructor(config) {
    super(config);
    this.tagName = "polyline";
    this.initialize(config);
  }
}

export class Rect extends Element {
  constructor(config) {
    super(config);
    this.tagName = "rect";
    this.initialize(config);
  }
}

export class Text extends Element {
  constructor(config) {
    super(config);
    this.tagName = "text";
    this.initialize(config);
  }
}

export class Tspan extends Element {
  constructor(config) {
    super(config);
    this.tagName = "tspan";
    this.initialize(config);
  }
}

export class G extends Element {
  constructor(config) {
    super(config);
    this.tagName = "g";
    this.initialize(config);
  }
}

export class Defs extends Element {
  constructor(config) {
    super(config);
    this.tagName = "defs";
    this.initialize(config);
  }
}

export class LinearGradient extends Element {
  constructor(config) {
    super(config);
    this.tagName = "linearGradient";
    this.initialize(config);
  }
}

export class RadialGradient extends Element {
  constructor(config) {
    super(config);
    this.tagName = "radialGradient";
    this.initialize(config);
  }
}

export class Stop extends Element {
  constructor(config) {
    super(config);
    this.tagName = "stop";
    this.initialize(config);
  }
}

export class Use extends Element {
  constructor(config) {
    super(config);
    this.tagName = "use";
    this.initialize(config);
  }
}

export class Symbol extends Element {
  constructor(config) {
    super(config);
    this.tagName = "symbol";
    this.initialize(config);
  }
}

export class ClipPath extends Element {
  constructor(config) {
    super(config);
    this.tagName = "clipPath";
    this.initialize(config);
  }
}

export class Pattern extends Element {
  constructor(config) {
    super(config);
    this.tagName = "pattern";
    this.initialize(config);
  }
}

export class Mask extends Element {
  constructor(config) {
    super(config);
    this.tagName = "mask";
    this.initialize(config);
  }
}

export class Filter extends Element {
  constructor(config) {
    super(config);
    this.tagName = "filter";
    this.initialize(config);
  }
}

export class FeGaussianBlur extends Element {
  constructor(config) {
    super(config);
    this.tagName = "feGaussianBlur";
    this.initialize(config);
  }
}

export class FeOffset extends Element {
  constructor(config) {
    super(config);
    this.tagName = "feOffset";
    this.initialize(config);
  }
}

export class FeBlend extends Element {
  constructor(config) {
    super(config);
    this.tagName = "feBlend";
    this.initialize(config);
  }
}

export class FeColorMatrix extends Element {
  constructor(config) {
    super(config);
    this.tagName = "feColorMatrix";
    this.initialize(config);
  }
}

export class FeComponentTransfer extends Element {
  constructor(config) {
    super(config);
    this.tagName = "feComponentTransfer";
    this.initialize(config);
  }
}

export class FeComposite extends Element {
  constructor(config) {
    super(config);
    this.tagName = "feComposite";
    this.initialize(config);
  }
}

export class FeConvolveMatrix extends Element {
  constructor(config) {
    super(config);
    this.tagName = "feConvolveMatrix";
    this.initialize(config);
  }
}

export class FeDiffuseLighting extends Element {
  constructor(config) {
    super(config);
    this.tagName = "feDiffuseLighting";
    this.initialize(config);
  }
}

export class FeDisplacementMap extends Element {
  constructor(config) {
    super(config);
    this.tagName = "feDisplacementMap";
    this.initialize(config);
  }
}

export class FeFlood extends Element {
  constructor(config) {
    super(config);
    this.tagName = "feFlood";
    this.initialize(config);
  }
}

export class FeImage extends Element {
  constructor(config) {
    super(config);
    this.tagName = "feImage";
    this.initialize(config);
  }
}

export class FeMerge extends Element {
  constructor(config) {
    super(config);
    this.tagName = "feMerge";
    this.initialize(config);
  }
}

export class FeMorphology extends Element {
  constructor(config) {
    super(config);
    this.tagName = "feMorphology";
    this.initialize(config);
  }
}

export class FeSpecularLighting extends Element {
  constructor(config) {
    super(config);
    this.tagName = "feSpecularLighting";
    this.initialize(config);
  }
}

export class FeTile extends Element {
  constructor(config) {
    super(config);
    this.tagName = "feTile";
    this.initialize(config);
  }
}

export class FeTurbulence extends Element {
  constructor(config) {
    super(config);
    this.tagName = "feTurbulence";
    this.initialize(config);
  }
}

export class Math extends Element {
  constructor(config) {
    super(config);
    this.tagName = "math";
    this.initialize(config);
  }
}
