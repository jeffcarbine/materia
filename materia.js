// Import all the elements
import * as elements from "materiajs/elements";
import * as elements_v2 from "materiajs/v2/elements";
import {
  validAttributes,
  validEvents,
  validMutations,
} from "materiajs/attributes";

// Standard Library Imports
let document, fs;

// Allows for client-side an server-side only behaviors
const isServer = typeof window === "undefined";

// Set up jsdom and fs for server-side rendering
if (isServer) {
  Promise.all([import("jsdom"), import("fs")])
    .then(([jsdom, fsModule]) => {
      const { JSDOM } = jsdom;
      const { window } = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
      document = window.document;
      fs = fsModule;
    })
    .catch((err) => {
      console.error("Failed to load modules:", err);
      document = null; // Fallback: Set document to null
      fs = null; // Fallback: Set fs to null
    });
} else {
  document = window.document;
}

const IMPORT_MARKER = Symbol.for("materiaImport");
const BIND_MARKER = Symbol.for("materiaBind");
const HANDLE_MARKER = Symbol.for("materiaHandle");
const INVIEW_MARKER = Symbol.for("materiaInView");
// marks the stand-in object that renders an InView `$children` item
const INVIEW_PLACEHOLDER = Symbol("materiaInViewPlaceholder");
// marks an InView value with nothing to show yet (dropped from collections)
const INVIEW_OMIT = Symbol("materiaInViewOmit");

export { BIND_MARKER, HANDLE_MARKER, INVIEW_MARKER };

export function Import(component, path) {
  return {
    [IMPORT_MARKER]: true,
    component,
    path,
  };
}

// parameters are flexible, so you don't have to pass null parameters if one or more are not needed.
// passing just the first defaults to the simplest handler case
export function Bind(binding, importsOrHandler, handler) {
  if (importsOrHandler === undefined && handler === undefined) {
    return {
      [BIND_MARKER]: true,
      binding,
      imports: null,
      handler: ({ data }) => data,
    };
  }

  if (typeof importsOrHandler === "function") {
    return {
      [BIND_MARKER]: true,
      binding,
      imports: null,
      handler: importsOrHandler,
    };
  }

  return {
    [BIND_MARKER]: true,
    binding,
    imports: importsOrHandler,
    handler,
  };
}

/**
 * Wraps a v2 event handler, optionally with imports, the same way `Bind`
 * wraps a binding handler. A bare function on a `__` event key is treated as
 * `Handle(fn)`.
 * @param {*|Function} importsOrHandler - The imports, or the handler when no imports are needed.
 * @param {Function} [handler] - The handler, called with `{ target, event, imports, elements, core }`.
 * @returns {Object} A marked handle object.
 */
export function Handle(importsOrHandler, handler) {
  if (handler === undefined && typeof importsOrHandler === "function") {
    return { [HANDLE_MARKER]: true, imports: null, handler: importsOrHandler };
  }

  return { [HANDLE_MARKER]: true, imports: importsOrHandler ?? null, handler };
}

/**
 * Holds a v2 value back until its element scrolls into view.
 * @param {*} value - The value to apply once the element is in view.
 * @param {Object} [options] - `initial` (shown until then), `margin`
 *   (IntersectionObserver rootMargin), `threshold`, and `once` (default true;
 *   false reverts the value when the element leaves the viewport).
 * @returns {Object} A marked InView object.
 */
export function InView(value, options = {}) {
  return { [INVIEW_MARKER]: true, value, options: { ...options } };
}

/**
 * The main MateriaJS class.
 * @class Materia
 * @param {Object} params - The parameters for the Materia class when initializing.
 * @param {Object} params.data - The data object for the data bindings.
 * @param {Object} params.handlers - The handlers object for the template engine.
 * @param {Object} params.delegate - The delegate object for the event delegation.
 * @returns {Materia} The Materia class.
 */
class MateriaJS {
  constructor(params) {
    if (params?.inView) {
      this.#inViewDefaults = { ...this.#inViewDefaults, ...params.inView };
    }

    if (!isServer) {
      // Get the data and handlers from the params
      const { data, handlers, triggers, delegate } = params;

      // Set the data and handlers
      this.#data = data;
      this.#handlers = handlers;
      this.#triggers = triggers;
      this.#delegate = delegate;

      this.#enableEventDelegation();
      this.#observeViewportClassElements();

      // Add all pipes to the unimported list and schedule idle pipe importing
      this.#initializeUnimportedPipes();

      // Pick up InView values from a server-rendered page
      if (params.inViewEntries) {
        this.#v2HydrateInView(params.inViewEntries);
      }
    }
  }

  /**
   * The handlers object for the template engine.
   */
  #handlers = {};

  /**
   * The triggers object for the template engine.
   */
  #triggers = {};

  /**
   * WeakMap to track element -> Set of handler IDs.
   * This allows efficient lookup and cleanup of handlers when elements are removed.
   */
  #elementHandlerMap = new WeakMap();

  /**
   * Gets the value from a binding string
   * @param {string} binding - The binding to get the value for.
   * @returns {*} The bindingValue of the specified binding.
   */
  get(binding) {
    // every value defaults to an empty string unless it is set
    let defaultType = "";

    const value = binding
      .split(/[\.\[\]]/) // Split the binding string into parts
      .filter(Boolean) // Remove empty parts
      .reduce((acc, part) => {
        if (acc === null || acc === undefined) {
          return defaultType; // Stop traversal if parent is null/undefined
        }

        // Check if the part is an array index
        const arrayMatch = part.match(/^\d+$/);
        if (arrayMatch) {
          const index = parseInt(part, 10); // Convert index to a number
          if (!Array.isArray(acc) || acc[index] === undefined) {
            return defaultType; // Return default if index is invalid
          }
          return acc[index];
        }

        // Handle object keys
        if (acc[part] === undefined) {
          return defaultType; // Return default if key is missing
        }
        return acc[part];
      }, this.#data);

    return value;
  }

  /**
   * Creates nested binding structure and sets the value.
   * Does not trigger handlers or circuit breaker checks.
   * @param {string} binding - The binding path to create.
   * @param {*} value - The value to set at the binding.
   * @returns {boolean} True if successful, false if there was an error.
   */
  #createNestedBinding(binding, value) {
    // Split the binding string into individual keys
    const keys = binding.split(/[\.[\]]/).filter(Boolean);
    let target = this.#data;

    // Iterate over the keys to traverse the data structure
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const arrayMatch = key.match(/(\w+)\[(\d+)\]/);

      if (arrayMatch) {
        // Handle array notation (e.g., "arrayKey[0]")
        const [, arrayKey, arrayIndex] = arrayMatch;

        // Initialize the array if it doesn't exist
        if (!target[arrayKey]) {
          target[arrayKey] = [];
        }

        // Ensure the target is an array
        if (!Array.isArray(target[arrayKey])) {
          console.error(`Error: ${arrayKey} is not an array.`);
          return false;
        }

        if (i === keys.length - 1) {
          // Set the value at the specified array index
          target[arrayKey][arrayIndex] = value;
        } else {
          // Traverse to the next level in the array
          if (!target[arrayKey][arrayIndex]) {
            target[arrayKey][arrayIndex] = {};
          }
          target = target[arrayKey][arrayIndex];
        }
      } else {
        if (i === keys.length - 1) {
          // Set the value at the specified key
          target[key] = value;
        } else {
          // Traverse to the next level in the object
          if (!target[key]) {
            target[key] = {};
          } else if (typeof target[key] !== "object") {
            console.error(
              `Error: Cannot set property on non-object value at ${key}`
            );
            return false;
          }
          target = target[key];
        }
      }
    }

    return true;
  }

  /**
   * Deep equality check for comparing values (handles primitives, arrays, objects).
   * @param {*} a - First value to compare
   * @param {*} b - Second value to compare
   * @returns {boolean} True if values are deeply equal
   */
  #deepEqual(a, b) {
    // Handle primitive types and null/undefined
    if (a === b) return true;

    // Handle null/undefined cases
    if (a == null || b == null) return false;

    // Handle different types
    if (typeof a !== typeof b) return false;

    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.#deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    // Handle objects
    if (typeof a === "object" && typeof b === "object") {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);

      if (keysA.length !== keysB.length) return false;

      for (const key of keysA) {
        if (!keysB.includes(key)) return false;
        if (!this.#deepEqual(a[key], b[key])) return false;
      }
      return true;
    }

    // For everything else, use strict equality
    return false;
  }

  set(binding, value) {
    // Check circuit breaker first
    if (this.#checkCircuitBreaker(binding)) {
      console.error(
        `CIRCUIT BREAKER TRIPPED: Infinite loop detected for binding "${binding}". ` +
          `This binding has been updated ${
            this.#circuitBreaker.maxUpdates
          }+ times in ${this.#circuitBreaker.timeWindow}ms. ` +
          `Blocking further updates to prevent infinite loop.`
      );
      return;
    }

    // Validate binding
    if (typeof binding !== "string" || binding.trim() === "") {
      console.error("Invalid binding: Binding must be a non-empty string.");
      return;
    }

    // Validate value
    if (value === undefined) {
      console.error("Invalid value: Value cannot be undefined.");
      return;
    }

    // make sure the value being set isn't identical to the current value
    // to prevent infinite loops or unnecessary updates
    const currentValue = this.get(binding);

    // Deep equality check for arrays and objects
    if (this.#deepEqual(currentValue, value)) {
      return;
    }

    // Create the nested binding and set the value
    const success = this.#createNestedBinding(binding, value);

    if (!success) {
      return;
    }

    // Handle any updates to bindings
    this.#handleBindingUpdate(binding);
  }

  /**
   * Sums a value to a binding if it exists
   * @param {*} binding
   * @param {*} value
   * @returns
   */
  sum(binding, value) {
    const currentValue = this.get(binding);
    if (typeof currentValue === "number" && typeof value === "number") {
      this.set(binding, currentValue + value);
    } else {
      console.error(`Error: Cannot sum non-numeric values at ${binding}`);
    }
  }

  /**
   * Updates multiple bindings based on an object structure
   * @param {string} binding - The root binding to update
   * @param {Object} data - The data object containing updates
   */
  update(binding, data) {
    // Validate binding
    if (typeof binding !== "string" || binding.trim() === "") {
      console.error("Invalid binding: Binding must be a non-empty string.");
      return;
    }

    // Validate data
    if (typeof data !== "object" || data === null) {
      console.error("Invalid data: Data must be a non-null object.");
      return;
    }

    // Check to see if the key/value pairs being updated aren't identical
    // to the current values to prevent infinite loops or unnecessary updates
    const currentValue = this.get(binding);
    let identical = true;
    for (const key in data) {
      if (currentValue[key] !== data[key]) {
        identical = false;
        break;
      }
    }

    if (identical) {
      return;
    }

    const updateRecursive = (currentBinding, currentData) => {
      if (
        typeof currentData !== "object" ||
        currentData === null ||
        Array.isArray(currentData)
      ) {
        this.set(currentBinding, currentData);
        return;
      }

      for (const key in currentData) {
        const newBinding = currentBinding ? `${currentBinding}.${key}` : key;
        const value = currentData[key];

        if (Array.isArray(value)) {
          this.set(newBinding, value);
        } else if (typeof value === "object" && value !== null) {
          updateRecursive(newBinding, value);
        } else {
          this.set(newBinding, value);
        }
      }
    };

    updateRecursive(binding, data);
  }

  /**
   * Sums multiple bindings based on an object structure
   * @param {*} binding
   * @param {*} data
   */
  sumUpdate(binding, data) {
    // Validate binding
    if (typeof binding !== "string" || binding.trim() === "") {
      console.error("Invalid binding: Binding must be a non-empty string.");
      return;
    }

    // Validate data
    if (typeof data !== "object" || data === null) {
      console.error("Invalid data: Data must be a non-null object.");
      return;
    }

    const updateRecursive = (currentBinding, currentData) => {
      if (
        typeof currentData !== "object" ||
        currentData === null ||
        Array.isArray(currentData)
      ) {
        this.sum(currentBinding, currentData);
        return;
      }

      for (const key in currentData) {
        const newBinding = currentBinding ? `${currentBinding}.${key}` : key;
        const value = currentData[key];

        if (Array.isArray(value)) {
          this.sum(newBinding, value);
        } else if (typeof value === "object" && value !== null) {
          updateRecursive(newBinding, value);
        } else {
          this.sum(newBinding, value);
        }
      }
    };

    updateRecursive(binding, data);
  }

  /**
   * Pushes a value to a binding if it is an array
   * @param {string} binding - The binding to push the value to.
   * @param {*} value - The value to push to the binding.
   */
  push(binding, value) {
    // Validate binding
    if (typeof binding !== "string" || binding.trim() === "") {
      console.error("Invalid binding: Binding must be a non-empty string.");
      return;
    }

    // Validate value
    if (value === undefined) {
      console.error("Invalid value: Value cannot be undefined.");
      return;
    }

    let target = this.get(binding);

    if (target === "") {
      target = [];
      // then we need to replace the null value with an empty array
      this.#createNestedBinding(binding, target);
    }

    if (!target) {
      console.error(`Error: binding ${binding} is not defined.`);
      return;
    }

    if (Array.isArray(target)) {
      target.push(value);

      this.#handleBindingUpdate(binding);
    } else {
      console.error(`Error: ${binding} is not an array.`);
    }
  }

  /**
   * Unshifts a value to a binding if it is an array
   * @param {string} binding - The binding to unshift the value to.
   * @param {*} value - The value to unshift to the binding.
   */
  unshift(binding, value) {
    // Validate binding
    if (typeof binding !== "string" || binding.trim() === "") {
      console.error("Invalid binding: Binding must be a non-empty string.");
      return;
    }

    // Validate value
    if (value === undefined) {
      console.error("Invalid value: Value cannot be undefined.");
      return;
    }

    let target = this.get(binding);

    if (target === "") {
      target = [];
      // then we need to replace the null value with an empty array
      this.#createNestedBinding(binding, target);
    }

    if (!target) {
      console.error(`Error: binding ${binding} is not defined.`);
      return;
    }

    if (Array.isArray(target)) {
      target.unshift(value);
      this.#handleBindingUpdate(binding);
    } else {
      console.error(`Error: ${binding} is not an array.`);
    }
  }

  /**
   * Pushes multiple values to a binding if it is an array.
   * @param {string} binding - The binding to push the values to.
   * @param {Array} values - The array of values to push.
   */
  pushMany(binding, values) {
    // Validate binding
    if (typeof binding !== "string" || binding.trim() === "") {
      console.error("Invalid binding: Binding must be a non-empty string.");
      return;
    }

    // Validate values
    if (!Array.isArray(values)) {
      console.error("Invalid values: Must be an array.");
      return;
    }

    let target = this.get(binding);

    if (target === "") {
      target = [];
      this.#createNestedBinding(binding, target);
    }

    if (!target) {
      console.error(`Error: binding ${binding} is not defined.`);
      return;
    }

    if (Array.isArray(target)) {
      target.push(...values);
      this.#handleBindingUpdate(binding);
    } else {
      console.error(`Error: ${binding} is not an array.`);
    }
  }

  /**
   * Finds a matching value in an array and updates it, or
   * adds the value to the array if it doesn't exist.
   */
  setInArray(binding, query, value) {
    // Get the value from the binding
    const target = this.get(binding, "array");

    if (!target) {
      console.error(`Error: ${binding} is not defined.`);
      return;
    }

    if (!Array.isArray(target)) {
      console.error(`Error: ${binding} is not an array.`);
      return;
    }

    // Define the queryFunction
    const queryFunction = (query) => {
      return (element) => {
        return Object.keys(query).every((key) => element[key] === query[key]);
      };
    };

    const arrayIndex = target.findIndex(queryFunction(query));

    if (arrayIndex > -1) {
      target[arrayIndex] = value;
    } else {
      target.push(value);
    }

    const updatedIndex = arrayIndex > -1 ? arrayIndex : target.length - 1;
    this.#handleBindingUpdate(`${binding}[${updatedIndex}]`);
  }

  /**
   * Removes a matching value from an array.
   */
  pull(binding, query) {
    // Get the value from the binding
    const target = this.get(binding, "array");

    if (!target) {
      console.error(`Error: ${binding} is not defined.`);
      return null;
    }

    if (!Array.isArray(target)) {
      console.error(`Error: ${binding} is not an array.`);
      return null;
    }

    // Define the queryFunction
    const queryFunction = (query) => {
      return (element) => {
        return Object.keys(query).every((key) => element[key] === query[key]);
      };
    };

    const arrayIndex = target.findIndex(queryFunction(query));

    if (arrayIndex > -1) {
      // return the removed element
      const removedElement = target.splice(arrayIndex, 1);
      this.#handleBindingUpdate(binding);
      return removedElement[0];
    } else {
      console.warn(
        `Warning: No matching element found in ${binding} for removal.`
      );
    }

    return null;
  }

  /**
   * Runs the handlers if a binding is updated via set or push
   * @param {string} binding - The binding to update.
   */
  #handleBindingUpdate(binding) {
    const checkHandlers = async (binding) => {
      if (this.#handlers[binding]) {
        for (const handler of this.#handlers[binding]) {
          this.#handle(binding, handler);
        }
      }
    };

    const checkTriggers = async (binding) => {
      if (this.#triggers[binding]) {
        for (const trigger of this.#triggers[binding]) {
          const { binding, handler } = trigger;

          this.#handle(binding, handler);
        }
      }
    };

    if (!isServer) {
      checkHandlers(binding);
      checkTriggers(binding);
    }
  }

  /**
   * Manually runs a binding
   */
  run(binding) {
    for (const key in this.#handlers) {
      if (key === binding || key.startsWith(binding + ".")) {
        for (const handler of this.#handlers[key]) {
          this.#handle(key, handler);
        }
      }
    }
  }

  /**
   * The data object for the data bindings.
   */
  #data = {};

  /**
   * Circuit breaker to prevent infinite loops.
   * Tracks update counts and timestamps per binding.
   */
  #circuitBreaker = {
    // Map of binding -> array of recent update timestamps
    updates: new Map(),
    // Maximum updates allowed within the time window
    maxUpdates: 20,
    // Time window in milliseconds
    timeWindow: 1000,
    // Whether the circuit breaker has been tripped
    tripped: new Set(),
  };

  /**
   * Lets you check to see what the data is currently at
   * @returns {Object} The review object, which contains the data, handlers and delegate.
   */
  review() {
    return {
      data: this.#data,
      handlers: this.#handlers,
      triggers: this.#triggers,
      delegate: this.#delegate,
      inView: this.#inViewDefaults,
      inViewEntries: this.#inViewRegistry,
    };
  }

  /**
   * Generates a unique ID.
   * @returns {string} The unique ID.
   */
  #generateUniqueId() {
    return HANDLER_ID_PREFIX + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Converts a camelCase string to a hyphenated string.
   * @param {string} str - The camelCase string to convert.
   * @returns {string} The hyphenated string.
   */
  #camelToHyphen(str) {
    return str.replace(/[A-Z]/g, (match) => "-" + match.toLowerCase());
  }

  /**
   * Sets an attribute on an element.
   * @param {Element} element - The element to set the attribute on.
   * @param {string} key - The key of the attribute.
   * @param {string} value - The value of the attribute.
   * @param {string} bindingId - The ID of the binding.
   * @param {number} depth - The depth of the rendering.
   * @returns {void}
   */
  #setElementAttribute(element, key, value, depth = 0) {
    // TODO(v3): Legacy v1 setter for unprefixed `textContent`, `innerHTML`,
    // `child`, `children`, `prepend`, and `append`; v2 uses
    // `#setElementAttribute_v2` with `$` properties and `$children` only.

    // there is no element in the DOM to set this value to
    if (!element) return;

    if (key === "style") {
      this.#setStyle(element, value);
    } else if (validAttributes.includes(key) || key.startsWith("data-")) {
      this.#setAttribute(element, key, value);
    } else if (key === "innerHTML") {
      this.#setInnerHTML(element, value);
    } else if (key === "prepend") {
      this.#prependChild(element, value, depth);
    } else if (key === "children" || key === "child") {
      this.#setChildren(element, key, value, depth);
    } else if (key === "textContent") {
      this.#setTextContent(element, value);
    } else if (key === "append") {
      this.#appendChild(element, value, depth);
    }
  }

  #setElementAttribute_v2(element, key, value, depth = 0) {
    if (value === null) return;

    if (this.#isInView(value)) {
      this.#v2RegisterInView(element, key, value, depth);
      return;
    }

    value = this.#v2ProcessBindableValue(element, key, value, depth);

    this.#v2ApplyValue(element, key, value, depth);
  }

  /**
   * Writes an already-processed v2 value to the element (no Bind or InView
   * registration).
   * @param {Element} element - The element.
   * @param {string} key - The property or attribute key.
   * @param {*} value - The evaluated value.
   * @param {number} depth - The render depth.
   */
  #v2ApplyValue(element, key, value, depth = 0) {
    if (key === "$textContent") {
      this.#setTextContent(element, value);
    } else if (key === "$innerHTML") {
      this.#setInnerHTML(element, value);
    } else if (key === "$children") {
      // `#setChildren` only clears when element children exist, so clear
      // text-only content here to avoid appending on every update
      if (element.hasChildNodes() && element.children.length === 0) {
        this.#clearChildren(element);
      }
      this.#setChildren(element, "children", value, depth);
    } else if (key === "$style") {
      this.#setStyle(element, value);
    } else if (key === "$dataset" && typeof value === "object") {
      Object.assign(element.dataset, value);
    } else if (key === "$classList" && Array.isArray(value)) {
      element.className = "";
      const classes = value
        .filter((className) => className && typeof className === "string")
        .flatMap((className) => className.split(/\s+/))
        .filter(Boolean);
      if (classes.length > 0) {
        element.classList.add(...classes);
      }
    } else if (key.startsWith("$")) {
      element[key.slice(1)] = value;
    } else if (validAttributes.includes(key) || this.#isDataAttribute_v2(key)) {
      this.#setAttribute(element, this.#attributeName_v2(key), value);
    }
  }

  #isDataAttribute_v2(key) {
    return key.startsWith("data-") || /^data[A-Z]/.test(key);
  }

  #attributeName_v2(key) {
    if (!/^data[A-Z]/.test(key)) return key;

    return (
      "data-" +
      key
        .slice(4)
        .replace(/^[A-Z]/, (match) => match.toLowerCase())
        .replace(/[A-Z]/g, (match) => "-" + match.toLowerCase())
    );
  }

  /**
   * Sets an attribute on an element.
   * @param {Element} element - The element to set the attribute on.
   * @param {string} key - The key of the attribute.
   * @param {string} value - The value of the attribute.
   * @returns {void}
   */
  #setAttribute(element, key, value) {
    const booleanAttributes = [
      "required",
      "checked",
      "disabled",
      "readonly",
      "selected",
    ];

    if (booleanAttributes.includes(key) && value === false) {
      // element.removeAttribute(key);
      element[key] = false;
    } else {
      const hasUpperCase = /[A-Z]/.test(key);
      if (hasUpperCase) {
        element.setAttributeNS(null, key, value);
      } else {
        element.setAttribute(key, value);
      }
    }
  }

  /**
   * Sets the style of an element.
   * @param {Element} element - The element to set the style on.
   * @param {string|Object} value - The style to set.
   * @returns {void}
   */
  #setStyle(element, value) {
    let style = "";
    if (typeof value === "string") {
      style = value;
    } else if (typeof value === "object") {
      for (let key in value) {
        const property = key.includes("-") ? key : this.#camelToHyphen(key);
        style += `${property}:${value[key]};`;
      }
    }
    element.setAttribute("style", style);
  }

  /**
   * Sets the innerHTML of an element.
   * @param {Element} element - The element to set the inner HTML on.
   * @param {string} value - The inner HTML to set.
   * @returns {void}
   */
  #setInnerHTML(element, value) {
    element.innerHTML = value;
  }

  /**
   * Prepends a child to an element.
   * @param {Element} element - The element to prepend the child to.
   * @param {string|Object} value - The value to prepend.
   * @param {number} depth - The depth of the rendering.
   * @returns {void}
   */
  #prependChild(element, value, depth) {
    if (typeof value !== "object") {
      element.prepend(document.createTextNode(value));
    } else {
      const childElement = this.render(value, null, depth + 1);
      if (childElement !== null) {
        element.prepend(childElement);
      }
    }
  }

  /**
   * Sets the children of an element.
   * @param {Element} element - The element to set the children on.
   * @param {string} key - The key of the children.
   * @param {Array} value - The value of the children.
   * @param {number} depth - The depth of the rendering.
   */
  #setChildren(element, key, value, depth, parentBinding) {
    let children = key === "children" ? value : [value];

    if (children === null) {
      // transform it into an empty array
      children = [];
    }

    // check to see if the children value is valid
    if (!Array.isArray(children)) {
      console.error(
        `Invalid children value for key: ${key}, expected an array, got: ${value}`
      );
      console.error(`Element Info:
        tagName: ${element.tagName}
        id: ${element.id}
        className: ${element.className}
        outerHTML: ${element.outerHTML}
      `);

      // set the children to an empty array so we can move on
      children = [];
    }

    if (element.children.length > 0 || value === null) {
      this.#clearChildren(element);
      if (value === null) return;
    }

    // filter boolean values out of the children array
    children = children.filter(Boolean);

    children.forEach((child) => {
      const childElement = this.render(child, null, depth + 1);
      if (childElement !== null) {
        element.appendChild(childElement);
      }
    });
  }

  /**
   * Sets the text content of an element.
   * @param {Element} element - The element to set the text content on.
   * @param {string} value - The value of the text content.
   * @returns {void}
   */
  #setTextContent(element, value) {
    element.textContent = "";
    element.appendChild(document.createTextNode(value));
  }

  /**
   * Appends a child
   * @param {Element} element - The element to append the child to.
   * @param {string|Object} value - The value to append.
   * @param {number} depth - The depth of the rendering.
   * @returns {void}
   */
  #appendChild(element, value, depth) {
    if (typeof value !== "object") {
      element.appendChild(document.createTextNode(value));
    } else {
      const childElement = this.render(value, null, depth + 1);
      if (childElement !== null) {
        element.appendChild(childElement);
      }
    }
  }

  /**
   * Stores imported components so they aren't imported multiple times
   * @type {Object}
   */
  importedComponents = {};

  /**
   * Ensures that any piped functions are stringified properly
   */
  #encodePipe(pipe) {
    for (let key in pipe) {
      if (typeof pipe[key] === "function") {
        pipe[key] = this.#stringifyFunction(pipe[key]);
      } else if (
        pipe.key !== null &&
        typeof pipe[key] === "object" &&
        pipe[key] !== null
      ) {
        if (pipe[key].path && !pipe[key].path.startsWith(IMPORT_PREFIX)) {
          pipe[key].path = `${IMPORT_PREFIX}${pipe[key].path}`;
        }
      }
    }
    return pipe;
  }

  #pendingPipeImports = [];

  // Method to initialize unimported pipes
  #initializeUnimportedPipes() {
    // Iterate through handlers and add pipes to the unimported list
    for (const binding in this.#handlers) {
      this.#handlers[binding].forEach((handler) => {
        // v2 handlers keep their imports in `pipe` in a different shape and
        // resolve them on demand (`#v2ResolveStoredImports`), so skip them
        if (handler.pipe && !handler.v2) {
          this.addUnimportedPipe(handler.pipe);
        }
      });
    }

    // Iterate through delegates and add pipes to the unimported list
    for (const event in this.#delegate) {
      this.#delegate[event].forEach((delegate) => {
        if (delegate.pipe) {
          this.addUnimportedPipe(delegate.pipe);
        }
      });
    }

    // Schedule idle pipe importing
    this.scheduleIdlePipeImports();
  }

  // Method to add unimported pipes to the list
  addUnimportedPipe(pipe) {
    this.#pendingPipeImports.push(pipe);
  }

  // Method to schedule idle pipe importing
  scheduleIdlePipeImports() {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(this.processUnimportedPipes.bind(this));
    } else {
      // Fallback for browsers that do not support requestIdleCallback
      setTimeout(this.processUnimportedPipes.bind(this), 100);
    }
  }

  // Method to process unimported pipes during idle times
  processUnimportedPipes(deadline) {
    // Track failed pipes to avoid infinite growth
    const failedPipes = new WeakSet();

    while (
      this.#pendingPipeImports.length > 0 &&
      (deadline.timeRemaining() > 0 || deadline.didTimeout)
    ) {
      const pipe = this.#pendingPipeImports.shift();
      this.#resolvePipeImports(pipe).catch((error) => {
        console.error("Error importing pipe:", error);
        // Only re-add if not already failed before
        if (typeof pipe === "object" && pipe !== null) {
          if (!failedPipes.has(pipe)) {
            failedPipes.add(pipe);
            this.#pendingPipeImports.push(pipe);
          } else {
            // Drop pipe after one retry to avoid infinite growth
            console.warn("Dropping pipe after repeated failure:", pipe);
          }
        }
      });
    }

    // If there are still unimported pipes, schedule the next idle callback
    if (this.#pendingPipeImports.length > 0) {
      this.scheduleIdlePipeImports();
    }
  }

  #importCache = {};

  /**
   * Validates and sanitizes a module path.
   * @param {string} path - The module path to validate.
   * @returns {string|null} The sanitized path or null if invalid.
   */
  #sanitizePath(path) {
    const allowedPrefixes = ["@", "./", "../", "/"];
    const isValid = allowedPrefixes.some((prefix) => path.startsWith(prefix));

    if (!isValid) {
      console.error(`Invalid module path: ${path}`);
      return null;
    }

    // Remove any potentially dangerous characters
    return path.replace(/[^a-zA-Z0-9_\-./@]/g, "");
  }

  async #resolvePipeImports(pipe) {
    for (let key in pipe) {
      if (typeof pipe[key] === "string") {
        if (pipe[key].startsWith(IMPORT_PREFIX)) {
          let path = pipe[key].replace(IMPORT_PREFIX, "");

          // Sanitize the path before importing
          path = this.#sanitizePath(path);
          if (!path) {
            pipe[key] = null; // Set to null if the path is invalid
            continue;
          }

          // Check if the component is already imported
          if (this.#importCache[path]) {
            pipe[key] =
              this.#importCache[path][key] || this.#importCache[path].default;
          } else {
            try {
              // Dynamically import the component
              const module = await import(path);

              // Cache the imported module
              this.#importCache[path] = module;

              // Check for named export or default export
              const component = module[key] || module.default;

              if (component) {
                pipe[key] = component;
              } else {
                console.error(`Component ${key} not found in ${path}`);
              }
            } catch (error) {
              console.error(`Error importing ${path}:`, error);
              pipe[key] = null; // Fallback: Set pipe[key] to null
            }
          }
        } else if (this.#isStringifiedFunction(pipe[key])) {
          try {
            const func = this.#parseStringifiedFunction(pipe[key]);
            pipe[key] = func;
          } catch (error) {
            console.error("Error parsing stringified function:", error);
            pipe[key] = null; // Fallback: Set pipe[key] to null
          }
        }
      }
    }
    return pipe;
  }

  /**
   * Processes a handler for a binding
   * @param {string} binding - The binding to process the handler for.
   * @param {Object} handler - The handler to process.
   */
  async #handle(binding, handler) {
    if (handler.v2 === true) {
      await this.#handle_v2(binding, handler);
      return;
    }

    let { element, func, property, pipe, bindings } = handler;

    let value;

    // for server-side binding, the func will be a string so we
    // will need to parse it
    if (typeof func === "string") {
      func = new Function("data", `return ${func}`)(this.#data);
      handler.func = func;
    }

    // check to see if any of the pipe values are strings that need to be imported
    if (pipe) {
      pipe = await this.#resolvePipeImports(pipe);
    }

    // Construct data based on whether this handler uses array bindings
    let data;
    if (bindings && bindings.length > 1) {
      // Array binding - construct object with all bound values
      data = [];
      bindings.forEach((b, i) => {
        data[i] = this.get(b);
      });
    } else {
      // Single binding - use the binding value directly
      data = this.get(binding);
    }

    value = func(data, elements, pipe);

    // Always resolve element by handlerId
    if (typeof element === "string") {
      const query = "[data-handler-id='" + element + "']";
      element = document.querySelector(query);
      handler.element = element ? element.dataset.handlerId : null;
    }

    // Check if the element is a DOM element and if it no longer exists
    if (element instanceof Element) {
      if (!document.body.contains(element) && element.tagName !== "HTML") {
        // Remove the handler from the list of handlers
        const handlers = this.#handlers[binding];
        if (handlers) {
          const index = handlers.indexOf(handler);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        }
        return; // Exit the function as the element no longer exists
      }
    }

    this.#setElementAttribute(element, property, value);
  }

  async #handle_v2(binding, handler) {
    let { element, func, property, pipe, bindings, collectionTemplate } =
      handler;

    if (typeof func === "string") {
      func = this.#parseStringifiedFunction(func);
      handler.func = func;
    }

    const data = this.#v2GetBindingData(binding, bindings);
    const imports = await this.#v2ResolveStoredImports(pipe);

    if (collectionTemplate && handler.templateSerialized) {
      collectionTemplate = await this.#v2ReviveTemplate(collectionTemplate);
      handler.collectionTemplate = collectionTemplate;
      handler.templateSerialized = false;
    }

    if (typeof element === "string") {
      const query = "[data-handler-id='" + element + "']";
      element = document.querySelector(query);
    }

    // The element was removed (e.g. its list re-rendered); drop the handler
    // so re-renders don't accumulate stale ones
    if (
      !(element instanceof Element) ||
      (!document.body.contains(element) && element.tagName !== "HTML")
    ) {
      this.#handlers[binding] = (this.#handlers[binding] || []).filter(
        (existing) => existing !== handler
      );
      return;
    }

    // a binding inside a hidden top-level InView waits until it is shown
    if (!collectionTemplate && this.#v2IsInViewHidden(element, property)) {
      return;
    }

    const value = collectionTemplate
      ? this.#v2EvaluateCollectionTemplate(
          property,
          collectionTemplate,
          element,
          handler.depth
        )
      : func({
          data,
          imports,
          elements: elements_v2,
          core: { Bind, Import, Handle, InView },
        });

    this.#setElementAttribute_v2(element, property, value);
  }

  /**
   * The delegate object for the event delegation.
   */
  #delegate = {};

  /**
   * The types of events that can be delegated.
   */
  #eventTypes = [...validEvents, ...validMutations];

  /**
   * Adds an event delegate for an element
   * @param {Element} element - The element to add the event delegate to
   * @param {string} event - The event to add the delegate for
   * @param {Function} func - The function to run when the event is triggered
   */
  #addEventDelegate(element, event, func, pipe, preventDefault, v2Options = null) {
    // first, we need to check what kind of event is being registered
    // -- if it is a load or resize function that are being set to the
    // window, then they need to be handled differently and just get
    // pushed to their corresponding arrays
    let target = element;

    if (isServer) {
      target = element.dataset.delegateId;
    }

    if (isServer) {
      func = this.#stringifyFunction(func);
    }

    // if the event is clickOutside, we need to modify the event to click
    // and the target to the document
    // v2 keeps the element as the target and matches clicks outside it at
    // dispatch; those clicks belong to other elements, so their default
    // action is left alone
    if (event === "clickOutside") {
      event = "click";

      if (v2Options) {
        v2Options = { ...v2Options, outside: true };
        preventDefault = false;
      } else {
        target = "document";
      }
    }

    this.#registerEvent(event, target, pipe, func, preventDefault, v2Options);
  }

  #createEventListener(event) {
    // Add a new event listener for that event
    if (event.includes("keydown:")) {
      // this is a special keydown event
      const key = event.replace("keydown:", "");

      // add an event listener for that specific key
      document.addEventListener("keydown", (e) => {
        if (e.key === key) {
          this.#eventHandler(e);
        }
      });
    } else {
      document.addEventListener(event, this.#eventHandler.bind(this), false);
    }
  }

  /**
   * Registers an event for an element
   * @param {string} event - The event to register
   * @param {Element} target - The target element to register the event for
   * @param {Function} func - The function to run when the event is triggered
   * @param {boolean} preventDefault - Whether to prevent the default behavior of the event
   */
  #registerEvent(event, target, pipe, func, preventDefault, v2Options = null) {
    // check to see if the object already has an instance of the event (which, if it does, it means we have already
    // registered an Event Listener for it)
    if (this.#delegate[event] === undefined) {
      // if it doesn't, then set that delegate event to an empty array
      this.#delegate[event] = [];

      if (!isServer) {
        this.#createEventListener(event);
      }
    }

    // check to see if the pipe has any path values that need to be promoted
    if (pipe) {
      for (let key in pipe) {
        if (
          pipe[key] !== null &&
          typeof pipe[key] === "object" &&
          pipe[key].path
        ) {
          pipe[key] = pipe[key].path;
        }
      }
    }

    const eventData = {
      target,
      func,
      pipe,
      preventDefault,
    };

    if (func.name !== undefined) {
      eventData.name = func.name;
    }

    if (v2Options) {
      eventData.v2 = true;
      if (v2Options.outside) eventData.outside = true;
      eventData.imports = isServer
        ? this.#v2SerializeImports(v2Options.imports) ?? null
        : v2Options.imports ?? null;

      // v2 load handlers take the context object, so adapt them to the
      // positional calls made by the load paths below
      if (event === "load" && !isServer) {
        const handler = func;
        func = (loadTarget, _pipe, _elements, loadEvent) =>
          this.#v2RunEventHandler(handler, loadTarget, loadEvent, eventData.imports);
      }
    }

    if (event === "load" && !isServer) {
      // Check if element is in the DOM before executing
      if (document.body.contains(target)) {
        // Element is in DOM, execute immediately
        func(target, pipe, elements, { type: "load", target });
      } else {
        // Element not in DOM yet, defer until it is
        this.#deferLoadEvent(target, func, pipe);
      }
    } else {
      this.#delegate[event].push(eventData);
    }
  }

  /**
   * Defers a load event until the target element is in the DOM
   * Uses MutationObserver to watch for when the element is added
   * @param {Element} target - The target element
   * @param {Function} func - The load handler function
   * @param {Object} pipe - The pipe data
   */
  #deferLoadEvent(target, func, pipe) {
    // Use MutationObserver to watch for when the element is added to the DOM
    const observer = new MutationObserver((mutations, obs) => {
      if (document.body.contains(target)) {
        // Element is now in the DOM, execute the load handler
        func(target, pipe, elements, { type: "load", target });
        obs.disconnect(); // Stop observing
      }
    });

    // Start observing the document body for added nodes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Safety timeout: disconnect after 5 seconds if element never appears
    setTimeout(() => {
      if (observer) {
        observer.disconnect();
        console.warn(
          "Load event deferred for more than 5 seconds, giving up:",
          target
        );
      }
    }, 5000);
  }

  /**
   * Checks the lineage of an element to try to find a match to a delegate
   * @param {Event} event - The event to check
   * @param {Element} element - The element to check
   * @returns {Element|false} - The matching element or false
   */
  #getMatchingTarget(event, element) {
    let node = event.target;
    while (node !== null) {
      if (node === element) {
        return element;
      }
      node = node.parentNode;
    }
    return false;
  }

  /**
   * Handles an event
   * @param {Event} event - The event to handle
   */
  async #eventHandler(event) {
    try {
      var eventArr = this.#delegate[event.type] || [];

      // if this is a keypress, check that it is the enter key
      if (event.type === "keypress") {
        let key = event.which || event.keyCode;
        // if it is the enter key...
        if (key === 13) {
          // .. then we treat it like a click
          eventArr = eventArr.concat(this.#delegate["click"]);
        }
      }

      // if this is a keydown event, we need to check for the specific key event too
      if (event.type === "keydown") {
        let key = event.key;

        // add the keydown event to the eventArr
        eventArr = eventArr.concat(this.#delegate["keydown:" + key]);
      }

      for (const eventObj of eventArr) {
        let { target, func, pipe, preventDefault, v2, imports, outside } =
          eventObj;

        // if the target is a string, then we need to get the element
        // and update the delegate
        if (typeof target === "string") {
          if (target === "document") {
            target = document;
          } else {
            target = document.querySelector(
              "[data-delegate-id=" + target + "]"
            );
          }

          eventObj.target = target;
        }

        // if the function is a stringified function, we need to parse it
        if (typeof func === "string") {
          func = this.#parseStringifiedFunction(func);
          eventObj.func = func;
        }

        // check whether the element or its direct parent match
        // the key
        let match = outside
          ? this.#v2GetOutsideTarget(event, target)
          : this.#getMatchingTarget(event, target);

        // set the disabled bool
        let disabled = false;

        // if the #getMatchingTarget returned a node
        if (match !== false) {
          // stop events if the element is disabled
          if (match.disabled === true) {
            disabled = true;
          }

          // run the function and pass the target
          if (!disabled) {
            if (preventDefault) event.preventDefault();

            try {
              if (v2) {
                await this.#v2RunEventHandler(func, match, event, imports);
                continue;
              }

              if (pipe) pipe = await this.#resolvePipeImports(pipe);
              func(match, pipe, elements, event);
            } catch (error) {
              console.error("Error executing event handler:", error);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error handling event:", error);
    }
  }

  loadHandler() {
    // this runs on page load, so we need to pull all the load delegates
    // and handle them
    let loadDelegates = this.#delegate.load;

    if (loadDelegates !== undefined) {
      loadDelegates.forEach(async (delegate) => {
        let { target, func, pipe } = delegate;

        if (pipe) {
          pipe = await this.#resolvePipeImports(pipe);
        }

        if (typeof target === "string") {
          target = document.querySelector("[data-delegate-id=" + target + "]");
          delegate.target = target;
        }

        if (typeof func === "string") {
          func = this.#parseStringifiedFunction(func);
          delegate.func = func;
        }

        if (delegate.v2) {
          this.#v2RunEventHandler(func, target, { type: "load", target }, delegate.imports);
          return;
        }

        func(target, pipe, elements);
      });
    }
  }

  /**
   * The mutation configuration for the mutation observer.
   */
  #mutationConfig = {
    attributes: true,
    // attributeFilter: [
    //   "class",
    //   "id",
    //   "value",
    //   "data-icon",
    //   "data-active",
    //   "data-state",
    //   "data-page",
    //   "checked",
    //   "open",
    //   "style",
    // ],
    childList: true,
    subtree: true,
    characterData: true,
  };

  /**
   * Checks if a mutation is valid
   * @param {string} event - The event to check
   */
  #isValidMutation(event) {
    if (
      event === "childList" ||
      event.includes("attributes") ||
      event === "characterData" ||
      event === "subtree"
    ) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * The mutation callback for the mutation observer.
   * @param {MutationRecord[]} mutationsList - The list of mutations to process.
   */
  #mutationCallback(mutationsList) {
    let significantChange = false;

    for (var i = 0; i < mutationsList.length; i++) {
      let mutation = mutationsList[i];

      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        this.#executeCheck(mutation);
        significantChange = true;
      } else if (mutation.type === "attributes") {
        this.#executeCheck(mutation);
        significantChange = true;
      } else if (mutation.type === "characterData") {
        this.#executeCheck(mutation);
        significantChange = true;
      }
    }

    // Trigger garbage collection only if significant changes occurred
    if (significantChange) {
      this.#debouncedGarbageCollect();
    }
  }

  /**
   * Whether we are observing mutations.
   */
  #observingMutations = false;

  /**
   * The mutation observer for observing mutations.
   * Is set to null initially, and then created when event delegationis enabled
   * via the #observeMutations function
   */
  #observer = null;

  /**
   * Starts observing mutations.
   */
  #observeMutations() {
    // Select the node that will be observed for mutations
    const targetNode = document.querySelector("body");

    // Bind the mutation callback to the correct context
    const boundMutationCallback = this.#mutationCallback.bind(this);

    // Create an observer instance linked to the bound callback function
    this.#observer = new MutationObserver(boundMutationCallback);

    // Start observing the target node for configured mutations
    this.#observer.observe(targetNode, this.#mutationConfig);
  }

  /**
   * Executes a check for a mutation
   * @param {MutationRecord} mutation - The mutation to check
   */
  #executeCheck(mutation) {
    let mutationTarget = mutation.target;

    let type = mutation.type;
    let attributeName = type === "attributes" ? mutation.attributeName : false;

    let funcs = attributeName
      ? this.#delegate[type + ":" + attributeName]
      : this.#delegate[type];

    if (funcs !== undefined) {
      funcs.forEach(async (funcObj) => {
        let { func, target, pipe } = funcObj;

        if (pipe) {
          pipe = await this.#resolvePipeImports(pipe);
        }

        // if the target is a string, then we need to get the element
        if (typeof target === "string") {
          target = document.querySelector(`[data-delegate-id="${target}"]`);
          funcObj.target = target;
        }

        // if the function is a stringified function, we need to parse it
        if (typeof func === "string") {
          func = this.#parseStringifiedFunction(func);
          funcObj.func = func;
        }

        // check to see if the element itself is the
        // mutation or if the element exists as a child
        // of the mutation
        if (mutationTarget.nodeType === 1 && mutationTarget === target) {
          func(mutationTarget, pipe, mutation);
        }
      });
    }
  }

  /**
   * Enables event delegation on the client side
   */
  #enableEventDelegation() {
    for (var event in this.#delegate) {
      // if it is a mutation, then we don't need to register an event with the document
      // because mutations are handled below by our mutationObserver
      if (!this.#isValidMutation(event)) {
        // then add a new event listener for that event
        this.#createEventListener(event);
      } else if (!this.#observingMutations) {
        // then we need to start observing mutations
        this.#observeMutations();

        // set the #observingMutations bool to true
        this.#observingMutations = true;
      }
    }
  }

  /**
   * Callback function for the IntersectionObserver.
   *
   * @param {IntersectionObserverEntry[]} entries - The entries being observed.
   * @param {IntersectionObserver} vclassObserver - The observer instance.
   */
  #observerCallback(entries, vclassObserver) {
    // reivew all the corresponding vclass entries
    entries.forEach((entry) => {
      // if we find it to be intersecting the viewport
      if (entry.isIntersecting) {
        // get the element
        let element = entry.target;
        // get it's vclass data property, plus a space
        let vclass = " " + element.dataset.vclass;
        // add that to the end of the element's className
        element.className += vclass;
        // and then stop observing this entry
        vclassObserver.unobserve(element);
      }
    });
  }

  /**
   * Map to track IntersectionObservers for elements.
   */
  #intersectionObservers = new Map();

  /**
   * Observes elements with the data-vclass attribute and adds the specified class when they enter the viewport.
   */
  #observeViewportClassElements() {
    // on page load, get all the elements that have a data-vclass property
    const vclassElements = document.querySelectorAll(
      `[${DATA_VCLASS}]:not([${DATA_VCLASS_OBSERVED}=true])`
    );

    // and then observe each one
    vclassElements.forEach((element) => {
      // check just in case there are no matching elements
      if (element) {
        // observe it!

        // create the intersection observer for vclass
        var vclassObserver = new IntersectionObserver(this.#observerCallback, {
          rootMargin: element.dataset.vclassMargin || "0px",
          threshold: 0.1,
        });

        vclassObserver.observe(element);
        element.dataset.vclassObserved = true;

        // Track the observer for cleanup
        this.#intersectionObservers.set(element, vclassObserver);
      }
    });
  }

  /**
   * Renders the template into HTML.
   *
   * @param {Object} template - The JSON object representing the template.
   * @param {function|string} [callbackOrQuery] - The callback function to call after rendering or a query for an element to append the new element to.
   * @param {number} [depth=0] - The depth of the rendering.
   * @returns {String|Element|null} The HTML string of the element, an Element object, or null if there is a callbackOrQuery parameter
   */
  render(template, callbackOrQuery, depth = 0) {
    if (!template) {
      return null;
    }

    // Check if the template has an "if" property and if it's falsy, return null
    // TODO(v3): remove the if property
    if (template.hasOwnProperty("if") && !template.if) {
      return null;
    }

    // If the template is a string, return a text node
    if (typeof template === "string") {
      return document.createTextNode(template);
    }

    // TODO(v3): Make the v2 render path the default after v1 render
    // compatibility is no longer required.
    if (template.isV2Element === true) {
      return this.#render_v2(template, callbackOrQuery, depth);
    }

    // Create the element
    const tagName = template.tagName || "div";
    const element = document.createElementNS(
      this.#getNamespace(tagName),
      tagName
    );

    // if this is the server, we need to encode the pipe
    if (isServer) {
      template.pipe = this.#encodePipe(template.pipe);
    }

    // Pull out the pipe for this element to pass along
    const pipe = isServer ? template.pipe : this.#encodePipe(template.pipe);

    // Pull out the preventDefault value if there is one
    // TODO(v3): Deprecate the legacy `preventDefault` prop with the v1 render path.
    const preventDefaults = template.preventDefault
      ? Array.isArray(template.preventDefault)
        ? template.preventDefault
        : [template.preventDefault]
      : [];

    // Process each key/value pair in the template
    Object.keys(template).forEach((key) => {
      let value = template[key];

      // TODO(v3): Deprecate unprefixed event keys (`click`), `attributes:*`,
      // and bare `keydown:*`; v2 uses `__`-prefixed events instead.
      if (
        this.#eventTypes.includes(key) ||
        key.startsWith("attributes:") ||
        key.startsWith("keydown:")
      ) {
        // check to see if the default should be prevented
        const preventDefault = preventDefaults.includes(key);

        // create a delegateId if the element doesn't already have one
        if (!element.dataset.delegateId) {
          element.dataset.delegateId = this.#generateUniqueId();
        }

        this.#addEventDelegate(element, key, value, pipe, preventDefault);
      } else {
        if (this.#isStringifiedFunction(value)) {
          value = this.#parseStringifiedFunction(value);
        }

        // If the value is a function and the key isn't an event, it's a binding
        // TODO(v3): Deprecate function values paired with `binding`/`triggers`/
        // `pipe`; v2 uses explicit `Bind(...)` and `Import(...)` helpers.
        if (typeof value === "function" && !this.#eventTypes.includes(key)) {
          let binding = template.binding;
          let triggers = template.triggers || [];

          // if the binding is undefined, we need to alert the user and continue the render
          if (!binding) {
            // console.error(
            //   `No binding found for function value: ${value.toString()}`
            // );
          } else {
            this.#processFunctionValue(
              element,
              key,
              value,
              { ...pipe },
              binding,
              triggers,
              depth
            );
          }
        } else if (value !== null) {
          this.#setElementAttribute(element, key, value, depth);
        }
      }
    });

    // Handle server-side rendering
    if (isServer && depth === 0) {
      return this.#handleServerSideRendering(element);
    } else {
      // handle client-side rendering
      if (callbackOrQuery) {
        if (typeof callbackOrQuery === "function") {
          callbackOrQuery(element);
        } else {
          document.querySelector(callbackOrQuery).appendChild(element);
        }
      } else {
        return element;
      }
    }
  }

  // `render()` handles empty, `if`, and string templates before dispatching here
  #render_v2(template, callbackOrQuery, depth = 0) {
    if (template[INVIEW_PLACEHOLDER]) {
      return this.#v2RenderInViewChild(template[INVIEW_PLACEHOLDER]);
    }

    const tagName = template.$tagName || template.tagName || "div";
    const element = document.createElementNS(
      this.#getNamespace(tagName),
      tagName
    );

    Object.keys(template).forEach((key) => {
      let value = template[key];

      if (
        key === "isV2Element" ||
        key === "tagName" ||
        key === "$tagName" ||
        key === "$_binding" ||
        key === "$_imports"
      ) {
        return;
      }

      if (this.#isEventKey_v2(key) && this.#isInView(value)) {
        console.error(
          `InView is not supported on event keys; "${key}" was not registered.`
        );
        return;
      }

      if (this.#isEventKey_v2(key)) {
        if (!element.dataset.delegateId) {
          element.dataset.delegateId = this.#generateUniqueId();
        }

        this.#v2AddEventDelegate(element, key.slice(2), value);
        return;
      }

      // v2 values are never stringified functions (events and Bind/Handle
      // carry their own markers), so strings are always rendered as text
      this.#setElementAttribute_v2(element, key, value, depth);
    });

    if (isServer && depth === 0) {
      return this.#handleServerSideRendering(element);
    } else {
      if (callbackOrQuery) {
        if (typeof callbackOrQuery === "function") {
          callbackOrQuery(element);
        } else {
          document.querySelector(callbackOrQuery).appendChild(element);
        }
      } else {
        return element;
      }
    }
  }

  /**
   * Registers a v2 `__` event. Bare functions are normalized to `Handle(fn)`;
   * v2 events always prevent the default action.
   * @param {Element} element - The element the event is registered on.
   * @param {string} event - The event name, without the `__` prefix.
   * @param {Function|Object} value - A handler function or `Handle(...)` object.
   */
  #v2AddEventDelegate(element, event, value) {
    const { handler, imports } = this.#isHandle(value) ? value : Handle(value);

    this.#addEventDelegate(element, event, handler, null, true, { imports });
  }

  /**
   * Runs a v2 event handler with the v2 context object.
   * @param {Function} handler - The event handler.
   * @param {Element|Document} target - The element the event was registered on.
   * @param {Event|Object} event - The browser event.
   * @param {*} imports - The stored `Handle` imports.
   * @returns {Promise<*>} The handler's return value.
   */
  async #v2RunEventHandler(handler, target, event, imports) {
    return handler({
      target,
      event,
      imports: (await this.#v2ResolveStoredImports(imports)) ?? null,
      elements: elements_v2,
      core: { Bind, Import, Handle, InView },
    });
  }

  /**
   * Matches a v2 `__clickOutside` delegate: the element itself when the event
   * started outside it, or false.
   * @param {Event} event - The browser event.
   * @param {Element} element - The element the delegate was registered on.
   * @returns {Element|false} The element, or false when the click was inside it.
   */
  #v2GetOutsideTarget(event, element) {
    if (!element || !element.isConnected) return false;

    return element.contains(event.target) ? false : element;
  }

  /**
   * Defaults for InView observers; overridable with the constructor's
   * `inView` option.
   */
  #inViewDefaults = { margin: "0px", threshold: 0.1 };

  /**
   * InView entries per element: `{ property, inView, options, revealed, depth }`.
   */
  #inViewEntries = new WeakMap();

  /**
   * Shared IntersectionObservers, one per `margin|threshold` option set.
   */
  #inViewObservers = new Map();

  #isInView(value) {
    return !!value && value[INVIEW_MARKER] === true;
  }

  /**
   * Resolves an InView's options against the instance and built-in defaults.
   * @param {Object} inView - The InView object.
   * @returns {{ margin: string, threshold: number, once: boolean }}
   */
  #v2InViewOptions(inView) {
    const { margin, threshold, once } = inView.options;
    return {
      margin: margin ?? this.#inViewDefaults.margin,
      threshold: threshold ?? this.#inViewDefaults.threshold,
      once: once ?? true,
    };
  }

  /**
   * Elements currently watched for InView values.
   */
  #inViewElements = new Set();

  /**
   * Revealed InView objects per element (consulted when collections are
   * evaluated, so revealed values survive re-renders).
   */
  #inViewRevealed = new WeakMap();

  /**
   * The key revealed state is tracked by: a server-assigned id for InViews
   * revived from a server-rendered page, otherwise the object itself.
   * @param {Object} inView - The InView object.
   * @returns {string|Object} The identity key.
   */
  #v2InViewIdentity(inView) {
    return inView.id ?? inView;
  }

  #v2IsRevealed(element, inView) {
    return !!this.#inViewRevealed.get(element)?.has(this.#v2InViewIdentity(inView));
  }

  #v2MarkRevealed(element, inView, revealed) {
    if (!this.#inViewRevealed.has(element)) {
      this.#inViewRevealed.set(element, new Set());
    }
    const set = this.#inViewRevealed.get(element);
    const identity = this.#v2InViewIdentity(inView);
    revealed ? set.add(identity) : set.delete(identity);
  }

  /**
   * InView entries recorded on the server, by element id, for the page's
   * startup script.
   */
  #inViewRegistry = {};

  /**
   * Server-assigned ids for InView objects.
   */
  #inViewIds = new WeakMap();

  #v2InViewServerId(inView) {
    if (!this.#inViewIds.has(inView)) {
      this.#inViewIds.set(inView, this.#generateUniqueId());
    }
    return this.#inViewIds.get(inView);
  }

  /**
   * Picks up the InView entries a server-rendered page handed over: finds
   * each element (and child anchor), revives its values, and starts
   * watching it.
   * @param {Object} registry - Serialized entries by element id.
   * @returns {Promise<void>}
   */
  async #v2HydrateInView(registry) {
    for (const id in registry) {
      const element = document.querySelector(`[data-inview-id="${id}"]`);
      if (!element) continue;

      for (const record of registry[id]) {
        const entry = this.#v2InViewEntry(
          record.kind,
          record.property,
          await this.#v2ReviveTemplate(record.inView),
          record.depth,
          await this.#v2ReviveTemplate(record.template)
        );

        if (record.kind === "child") {
          entry.anchor = this.#v2FindInViewAnchor(element, record.anchorId);
          if (!entry.anchor) continue;

          entry.nodes = [];
          let node = entry.anchor.nextSibling;
          while (node && entry.nodes.length < record.nodeCount) {
            entry.nodes.push(node);
            node = node.nextSibling;
          }
        }

        if (this.#v2TrackInView(element, entry)) {
          this.#v2SetInView(element, entry, true);
        }
      }
    }
  }

  /**
   * Finds a server-rendered InView child anchor comment.
   * @param {Element} element - The parent element.
   * @param {string} anchorId - The anchor's id.
   * @returns {Comment|null} The anchor.
   */
  #v2FindInViewAnchor(element, anchorId) {
    const walker = document.createTreeWalker(element, 128 /* SHOW_COMMENT */);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.data === `materia-inview:${anchorId}`) return node;
    }
    return null;
  }

  /**
   * Whether a top-level InView on this property is currently hidden.
   * @param {Element} element - The element.
   * @param {string} property - The property key.
   * @returns {boolean}
   */
  #v2IsInViewHidden(element, property) {
    return (this.#inViewEntries.get(element) || []).some(
      (entry) =>
        entry.kind === "value" && entry.property === property && !entry.revealed
    );
  }

  /**
   * Finds the InView objects in a collection value (not inside other
   * InViews or Binds).
   * @param {*} value - The value.
   * @param {Array} [found] - Accumulator.
   * @returns {Array} The InView objects.
   */
  #v2FindInViews(value, found = []) {
    if (!value || typeof value !== "object" || this.#isBind(value)) return found;
    if (this.#isInView(value)) {
      found.push(value);
      return found;
    }
    Object.values(value).forEach((item) => this.#v2FindInViews(item, found));
    return found;
  }

  /**
   * Creates an InView entry for an element.
   * @param {string} kind - "value", "collection", or "child".
   * @param {string} property - The property key.
   * @param {Object} inView - The InView object.
   * @param {number} depth - The render depth.
   * @param {*} [template] - The collection template, for collection/child entries.
   * @returns {Object} The entry.
   */
  #v2InViewEntry(kind, property, inView, depth, template) {
    return {
      kind,
      property,
      inView,
      template,
      options: this.#v2InViewOptions(inView),
      revealed: false,
      registered: false,
      depth,
    };
  }

  /**
   * Starts watching an entry: reveals it right away without
   * IntersectionObserver; otherwise records it and observes the element.
   * Does nothing on the server, which renders the initial state only.
   * @param {Element} element - The element.
   * @param {Object} entry - The InView entry.
   * @returns {boolean} Whether the entry was revealed immediately.
   */
  #v2TrackInView(element, entry) {
    if (isServer) {
      this.#v2RecordInView(element, entry);
      return false;
    }

    if (typeof IntersectionObserver !== "function") {
      entry.revealed = true;
      this.#v2MarkRevealed(element, entry.inView, true);
      return true;
    }

    if (!this.#inViewEntries.has(element)) {
      this.#inViewEntries.set(element, []);
    }
    this.#inViewEntries.get(element).push(entry);
    this.#inViewElements.add(element);
    this.#v2InViewObserver(entry.options).observe(element);

    // observing an already-watched element fires no new callback, so an
    // entry added while the element is visible is revealed right away
    if (this.#inViewVisible.get(element)?.has(this.#v2InViewKey(entry.options))) {
      entry.revealed = true;
      this.#v2MarkRevealed(element, entry.inView, true);
      return true;
    }
    return false;
  }

  /**
   * Records an entry in the server registry, marking its element (and, for
   * a child, its anchor) with an id the browser can find.
   * @param {Element} element - The element.
   * @param {Object} entry - The InView entry.
   */
  #v2RecordInView(element, entry) {
    if (!element.dataset.inviewId) {
      element.dataset.inviewId = this.#generateUniqueId();
    }

    const record = {
      kind: entry.kind,
      property: entry.property,
      depth: entry.depth,
      inView: this.#v2SerializeTemplate(entry.inView),
      template: this.#v2SerializeTemplate(entry.template),
    };

    if (entry.kind === "child") {
      entry.anchorId = record.anchorId = this.#generateUniqueId();
      entry.record = record;
    }

    (this.#inViewRegistry[element.dataset.inviewId] ||= []).push(record);
  }

  /**
   * Option-set keys each element was last seen visible for.
   */
  #inViewVisible = new WeakMap();

  #v2InViewKey({ margin, threshold }) {
    return `${margin}|${threshold}`;
  }

  /**
   * Removes an element's InView entries matching a predicate, and stops
   * observing for option sets no remaining entry uses.
   * @param {Element} element - The element.
   * @param {Function} predicate - Selects the entries to remove.
   */
  #v2PruneInView(element, predicate) {
    const entries = this.#inViewEntries.get(element);
    if (!entries) return;

    const kept = entries.filter((entry) => !predicate(entry));
    this.#inViewEntries.set(element, kept);

    entries
      .filter((entry) => predicate(entry))
      .forEach((entry) => {
        const key = this.#v2InViewKey(entry.options);
        if (!kept.some((other) => this.#v2InViewKey(other.options) === key)) {
          this.#v2InViewObserver(entry.options).unobserve(element);
          this.#inViewVisible.get(element)?.delete(key);
        }
      });
  }

  /**
   * Registers a top-level InView value and shows its initial state (or its
   * value, when revealed immediately).
   * @param {Element} element - The element.
   * @param {string} property - The property or attribute key.
   * @param {Object} inView - The InView object.
   * @param {number} depth - The render depth.
   */
  #v2RegisterInView(element, property, inView, depth) {
    const entry = this.#v2InViewEntry("value", property, inView, depth);
    const revealedNow = this.#v2TrackInView(element, entry);
    this.#v2SetInView(element, entry, revealedNow);
  }

  /**
   * Registers an InView found inside a collection value ($classList items,
   * $style/$dataset values, and similar).
   * @param {Element} element - The element.
   * @param {string} property - The property key.
   * @param {Object} inView - The InView object.
   * @param {*} template - The whole collection value.
   * @param {number} depth - The render depth.
   */
  #v2RegisterCollectionInView(element, property, inView, template, depth) {
    // a re-render replaces the template; forget entries from the old one
    this.#v2PruneInView(
      element,
      (entry) =>
        entry.kind === "collection" &&
        entry.property === property &&
        entry.template !== template
    );

    const entry = this.#v2InViewEntry("collection", property, inView, depth, template);
    if (this.#v2TrackInView(element, entry)) {
      this.#v2RegisterInViewBinds(element, entry);
    }
  }

  /**
   * Registers the Binds inside a revealed InView so they update the whole
   * collection, once per entry.
   * @param {Element} element - The element.
   * @param {Object} entry - The InView entry.
   */
  #v2RegisterInViewBinds(element, entry) {
    if (entry.registered) return;
    entry.registered = true;
    this.#v2RegisterCollectionBinds(
      element,
      entry.property,
      entry.inView.value,
      entry.template,
      entry.depth
    );
  }

  /**
   * Shows or hides an InView entry.
   * @param {Element} element - The element.
   * @param {Object} entry - The InView entry.
   * @param {boolean} revealed - Whether to show the revealed value.
   */
  #v2SetInView(element, entry, revealed) {
    entry.revealed = revealed;
    this.#v2MarkRevealed(element, entry.inView, revealed);

    if (entry.kind === "child") {
      this.#v2SetInViewChild(element, entry, revealed);
      return;
    }

    if (entry.kind === "collection") {
      if (revealed) this.#v2RegisterInViewBinds(element, entry);
      this.#v2ClearProperty(element, entry.property, entry.template);
      this.#v2ApplyValue(
        element,
        entry.property,
        this.#v2EvaluateBindableCollection(entry.template, element),
        entry.depth
      );
      return;
    }

    const { property, inView, depth } = entry;

    if (!revealed) {
      this.#v2ClearProperty(element, property, inView.value);
    }

    const value = revealed ? inView.value : inView.options.initial;
    if (value === undefined) return;

    if (revealed && entry.registered) {
      // Binds inside were registered on the first reveal; only re-apply
      this.#v2ApplyValue(
        element,
        property,
        this.#isBind(value)
          ? this.#v2EvaluateBind(value)
          : this.#v2EvaluateCollectionTemplate(property, value, element, depth),
        depth
      );
      return;
    }

    if (revealed) entry.registered = true;
    this.#setElementAttribute_v2(element, property, value, depth);
  }

  /**
   * Renders an InView `$children` item: an anchor comment followed by the
   * item's current content. The parent element is the one watched.
   * @param {Object} info - `{ element, inView, template, depth }`.
   * @returns {DocumentFragment} The anchor and content.
   */
  #v2RenderInViewChild({ element, inView, template, depth }) {
    const anchor = document.createComment("materia-inview");
    const fragment = document.createDocumentFragment();
    fragment.appendChild(anchor);

    let entry = (this.#inViewEntries.get(element) || []).find(
      (existing) =>
        existing.kind === "child" &&
        this.#v2InViewIdentity(existing.inView) === this.#v2InViewIdentity(inView)
    );

    if (!entry) {
      // children were re-rendered; forget items whose anchors are gone
      this.#v2PruneInView(
        element,
        (existing) => existing.kind === "child" && !existing.anchor?.isConnected
      );
      entry = this.#v2InViewEntry("child", "$children", inView, depth, template);
      if (this.#v2TrackInView(element, entry)) {
        this.#v2RegisterChildBind(element, entry);
      }
    }

    entry.anchor = anchor;
    const content = this.#v2IsRevealed(element, inView)
      ? inView.value
      : inView.options.initial;
    entry.nodes = this.#v2RenderChildContent(content, depth);
    entry.nodes.forEach((node) => fragment.appendChild(node));

    if (entry.record) {
      // the server labels the anchor so the browser can find it
      anchor.data = `materia-inview:${entry.anchorId}`;
      entry.record.nodeCount = entry.nodes.length;
    }

    return fragment;
  }

  /**
   * Registers a Bind that is an InView `$children` item's value, once.
   * @param {Element} element - The parent element.
   * @param {Object} entry - The child entry.
   */
  #v2RegisterChildBind(element, entry) {
    if (entry.registered) return;
    entry.registered = true;
    if (this.#isBind(entry.inView.value)) {
      this.#v2RegisterBind(element, "$children", entry.inView.value, entry.depth, {
        collectionTemplate: entry.template,
      });
    }
  }

  /**
   * Renders an InView child's content into DOM nodes.
   * @param {*} content - Element(s), string(s), or a Bind.
   * @param {number} depth - The render depth.
   * @returns {Node[]} The rendered nodes.
   */
  #v2RenderChildContent(content, depth) {
    if (content === undefined) return [];
    const value = this.#isBind(content) ? this.#v2EvaluateBind(content) : content;

    return (Array.isArray(value) ? value : [value])
      .filter(Boolean)
      .map((item) => this.render(item, null, depth + 1))
      .filter((node) => node !== null);
  }

  /**
   * Swaps an InView child's content after its anchor.
   * @param {Element} element - The parent element.
   * @param {Object} entry - The child entry.
   * @param {boolean} revealed - Whether to show the revealed value.
   */
  #v2SetInViewChild(element, entry, revealed) {
    if (!entry.anchor?.isConnected) return;
    if (revealed) this.#v2RegisterChildBind(element, entry);

    this.#v2RemoveNodes(entry.nodes);
    entry.nodes = this.#v2RenderChildContent(
      revealed ? entry.inView.value : entry.inView.options.initial,
      entry.depth
    );
    entry.anchor.after(...entry.nodes);
  }

  /**
   * Removes nodes and the handlers and InView watches attached to them.
   * @param {Node[]} nodes - The nodes.
   */
  #v2RemoveNodes(nodes = []) {
    nodes.forEach((node) => {
      const handlerIds = this.#elementHandlerMap.get(node);
      if (handlerIds) {
        for (const handlerId of handlerIds) {
          for (const key in this.#handlers) {
            this.#handlers[key] = this.#handlers[key].filter(
              (bind) => bind.element !== handlerId
            );
          }
        }
        this.#elementHandlerMap.delete(node);
      }
      this.#v2ForgetInView(node);
      node.remove();
    });
  }

  /**
   * Stops watching InView elements inside (or equal to) a removed node.
   * @param {Node} root - The node being removed.
   */
  #v2ForgetInView(root) {
    if (this.#inViewElements.size === 0) return;

    for (const element of this.#inViewElements) {
      if (root === element || root.contains?.(element)) {
        for (const entry of this.#inViewEntries.get(element)) {
          this.#v2InViewObserver(entry.options).unobserve(element);
        }
        this.#inViewEntries.delete(element);
        this.#inViewElements.delete(element);
      }
    }
  }

  /**
   * Returns the shared observer for an option set, creating it on first use.
   * @param {{ margin: string, threshold: number }} options - Resolved options.
   * @returns {IntersectionObserver} The observer.
   */
  #v2InViewObserver({ margin, threshold }) {
    const key = `${margin}|${threshold}`;

    if (!this.#inViewObservers.has(key)) {
      const observer = new IntersectionObserver(
        (entries) =>
          entries.forEach((intersection) =>
            this.#v2HandleIntersection(key, intersection, observer)
          ),
        { rootMargin: margin, threshold }
      );
      this.#inViewObservers.set(key, observer);
    }

    return this.#inViewObservers.get(key);
  }

  /**
   * Reveals or hides an element's InView entries for one observer, and stops
   * watching the element once nothing is left to toggle.
   * @param {string} key - The observer's option-set key.
   * @param {IntersectionObserverEntry} intersection - The observer entry.
   * @param {IntersectionObserver} observer - The observer.
   */
  #v2HandleIntersection(key, intersection, observer) {
    const element = intersection.target;
    // an element is only observed after its entry list exists
    const entries = this.#inViewEntries.get(element).filter(
      (entry) => `${entry.options.margin}|${entry.options.threshold}` === key
    );
    const visible =
      intersection.isIntersecting &&
      intersection.intersectionRatio >= entries[0]?.options.threshold;

    if (!this.#inViewVisible.has(element)) {
      this.#inViewVisible.set(element, new Set());
    }
    visible
      ? this.#inViewVisible.get(element).add(key)
      : this.#inViewVisible.get(element).delete(key);

    entries.forEach((entry) => {
      if (visible && !entry.revealed) {
        this.#v2SetInView(element, entry, true);
      } else if (!visible && entry.revealed && !entry.options.once) {
        this.#v2SetInView(element, entry, false);
      }
    });

    if (entries.every((entry) => entry.revealed && entry.options.once)) {
      observer.unobserve(element);
      this.#inViewVisible.get(element).delete(key);
    }
  }

  /**
   * Removes a property's value from an element (used before re-applying an
   * InView's initial value).
   * @param {Element} element - The element.
   * @param {string} property - The property or attribute key.
   * @param {*} value - The value being removed (needed for `$dataset` keys).
   */
  #v2ClearProperty(element, property, value) {
    if (property === "$textContent" || property === "$innerHTML") {
      element[property.slice(1)] = "";
    } else if (property === "$children") {
      this.#clearChildren(element);
    } else if (property === "$classList") {
      element.removeAttribute("class");
    } else if (property === "$style") {
      element.removeAttribute("style");
    } else if (property === "$dataset") {
      Object.keys(value || {}).forEach((key) => delete element.dataset[key]);
    } else if (property.startsWith("$")) {
      element.removeAttribute(property.slice(1).toLowerCase());
    } else {
      element.removeAttribute(this.#attributeName_v2(property));
    }
  }

  #isHandle(value) {
    return !!value && value[HANDLE_MARKER] === true;
  }

  #isEventKey_v2(key) {
    if (!key.startsWith("__")) return false;

    const eventName = key.slice(2);
    return (
      this.#eventTypes.includes(eventName) || eventName.startsWith("keydown:")
    );
  }

  /**
   * Gets the namespace for the specified tag name.
   * @param {string} tagName - The tag name to get the namespace for.
   * @returns {string} The namespace for the specified tag name.
   */
  #getNamespace(tagName) {
    const namespaces = {
      svg: "http://www.w3.org/2000/svg",
      math: "http://www.w3.org/1998/Math/MathML",
      xlink: "http://www.w3.org/1999/xlink",
      xml: "http://www.w3.org/XML/1998/namespace",
      xmlns: "http://www.w3.org/2000/xmlns/",
      default: "http://www.w3.org/1999/xhtml",
    };

    // SVG elements that need the SVG namespace
    const svgElements = [
      "svg",
      "path",
      "circle",
      "rect",
      "line",
      "polygon",
      "polyline",
      "ellipse",
      "g",
      "defs",
      "use",
      "symbol",
      "marker",
      "clipPath",
      "mask",
      "pattern",
      "text",
      "tspan",
      "textPath",
      "image",
      "foreignObject",
      "lineargradient",
      "radialgradient",
      "stop",
      "animate",
      "animatetransform",
      "switch",
      "metadata",
    ];

    if (svgElements.includes(tagName.toLowerCase())) {
      return namespaces.svg;
    }

    return namespaces[tagName] || namespaces.default;
  }

  /**
   * Stringifies a function
   * @param {Function} func - The function to stringify
   * @returns {string} The stringified function
   */
  #stringifyFunction(func) {
    return func.toString();
  }

  /**
   * Checks if the specified string is a stringified function.
   * @param {string} str - The string to check.
   * @returns {boolean} True if the string is a stringified function, false otherwise.
   */
  #isStringifiedFunction(str) {
    if (typeof str !== "string") {
      return false;
    }
    const functionPattern =
      /^\s*(function\s*\(|\(\s*[^\)]*\)\s*=>|class\s+\w+)/;
    return functionPattern.test(str);
  }

  /**
   * Parses a stringified function into a function.
   * @param {string} str - The stringified function to parse.
   * @returns {Function} The parsed function.
   */
  #parseStringifiedFunction(str) {
    if (this.#isStringifiedFunction(str)) {
      return new Function(`return (${str})`)();
    }
    throw new Error("Invalid stringified function");
  }

  /**
   * Processes a function value in the template.
   * @param {Element} element - The element to process the function value for.
   * @param {string} key - The key of the function value.
   * @param {Function} value - The function value to process.
   * @param {number} depth - The depth of the rendering.
   * @returns {void}
   */
  #processFunctionValue(
    element,
    property,
    func,
    pipe,
    binding,
    triggers,
    depth
  ) {
    let handlerElementId,
      preservedFunc = func;

    let clientPipe = {};

    // loop through the keys of the pipe and set the value to the data attribute
    if (pipe) {
      for (const key in pipe) {
        const value = pipe[key];

        if (
          value &&
          value !== null &&
          typeof value === "object" &&
          value?.data &&
          value?.path
        ) {
          // assign the data to the clientPipe
          clientPipe[key] = value.data;
        } else {
          clientPipe[key] = value;
        }
      }
    }

    if (!isServer) {
      // Always use a handlerId for reference
      if (!element.dataset.handlerId) {
        handlerElementId = this.#generateUniqueId();
        element.setAttribute(DATA_HANDLER_ID, handlerElementId);
      } else {
        handlerElementId = element.dataset.handlerId;
      }
      pipe = clientPipe;
    } else {
      if (!element.dataset.handlerId) {
        handlerElementId = this.#generateUniqueId();
        element.setAttribute(DATA_HANDLER_ID, handlerElementId);
      } else {
        handlerElementId = element.dataset.handlerId;
      }
      func = func.toString();
      if (pipe) {
        for (const key in pipe) {
          const value = pipe[key];
          if (
            value &&
            typeof value === "object" &&
            value?.data &&
            value?.path
          ) {
            pipe[key] = value.path;
          } else {
            pipe[key] = value;
          }
        }
      }
    }

    // Handle array bindings by storing handlers under each individual binding
    const bindingsArray = Array.isArray(binding) ? binding : [binding];

    bindingsArray.forEach((singleBinding) => {
      if (!this.#handlers[singleBinding]) {
        this.#handlers[singleBinding] = [];
      }

      // Store the handler with bindings array for reconstruction
      this.#handlers[singleBinding].push({
        element: handlerElementId,
        func,
        property,
        pipe,
        bindings: bindingsArray, // Store all bindings this handler depends on
      });
    });

    // Track handlerId <-> element association for efficient cleanup
    if (element) {
      let handlerIds = this.#elementHandlerMap.get(element);
      if (!handlerIds) {
        handlerIds = new Set();
        this.#elementHandlerMap.set(element, handlerIds);
      }
      handlerIds.add(handlerElementId);
    }

    // Handle triggers for each binding
    if (triggers.length > 0) {
      bindingsArray.forEach((singleBinding) => {
        triggers.forEach((trigger) => {
          const triggerBinding = `${singleBinding}.${trigger}`;

          if (!this.#triggers[triggerBinding]) {
            this.#triggers[triggerBinding] = [];
          }

          // Get the handler we just added for this binding
          const handlerIndex = this.#handlers[singleBinding].length - 1;
          this.#triggers[triggerBinding].push({
            binding: singleBinding,
            handler: this.#handlers[singleBinding][handlerIndex],
          });
        });
      });
    }

    // Construct data object for the function call
    let data;
    if (Array.isArray(binding)) {
      data = [];
      binding.forEach((b, i) => {
        data[i] = this.get(b);
      });
    } else {
      data = this.get(binding);
    }

    const result = preservedFunc(data, elements, clientPipe);

    if (result !== null) {
      this.#setElementAttribute(element, property, result, depth);
    }
  }

  #v2ProcessBindableValue(element, property, value, depth) {
    if (this.#isBind(value)) {
      this.#v2RegisterBind(element, property, value, depth);
      return this.#v2ProcessInViews(
        element,
        property,
        this.#v2EvaluateBind(value),
        depth
      );
    }

    // Static `$children` render one by one, so each child registers its own
    // Binds on its own element. Only Binds that are direct items of the array
    // re-render this element's children.
    if (property === "$children" && Array.isArray(value)) {
      const directBinds = value.filter((item) => this.#isBind(item));

      directBinds.forEach((bindConfig) =>
        this.#v2RegisterBind(element, property, bindConfig, depth, {
          collectionTemplate: value,
        })
      );

      return directBinds.length > 0 || value.some((item) => this.#isInView(item))
        ? this.#v2EvaluateChildrenTemplate(value, element, depth)
        : value;
    }

    const inViews = this.#v2FindInViews(value);
    inViews.forEach((inView) =>
      this.#v2RegisterCollectionInView(element, property, inView, value, depth)
    );

    if (this.#v2ContainsBind(value)) {
      this.#v2RegisterCollectionBinds(element, property, value, value, depth);
    }

    return inViews.length > 0 || this.#v2ContainsBind(value)
      ? this.#v2EvaluateBindableCollection(value, element)
      : value;
  }

  #isBind(value) {
    return value && value[BIND_MARKER] === true;
  }

  /**
   * Handles InView values inside an evaluated value (e.g. a Bind handler's
   * result) without registering any Binds.
   * @param {Element} element - The element.
   * @param {string} property - The property key.
   * @param {*} value - The evaluated value.
   * @param {number} depth - The render depth.
   * @returns {*} The value with InViews resolved.
   */
  #v2ProcessInViews(element, property, value, depth) {
    if (property === "$children" && Array.isArray(value)) {
      return value.some((item) => this.#isInView(item))
        ? this.#v2EvaluateChildrenTemplate(value, element, depth)
        : value;
    }

    const inViews = this.#v2FindInViews(value);
    inViews.forEach((inView) =>
      this.#v2RegisterCollectionInView(element, property, inView, value, depth)
    );
    return inViews.length > 0
      ? this.#v2EvaluateBindableCollection(value, element)
      : value;
  }

  /**
   * Evaluates the direct Bind items of a `$children` array, leaving child
   * elements untouched so they register their own Binds when rendered.
   * @param {Array} template - The `$children` array.
   * @returns {Array} The children, with direct Bind results flattened in.
   */
  #v2EvaluateChildrenTemplate(template, element, depth = 0) {
    return template.flatMap((item) => {
      if (this.#isInView(item)) {
        return [
          {
            isV2Element: true,
            [INVIEW_PLACEHOLDER]: { element, inView: item, template, depth },
          },
        ];
      }

      if (!this.#isBind(item)) return [item];

      const result = this.#v2EvaluateBind(item);
      return Array.isArray(result) ? result : [result];
    });
  }

  /**
   * Re-evaluates a stored collection template for a binding update.
   * @param {string} property - The property the template belongs to.
   * @param {*} template - The stored template.
   * @returns {*} The evaluated value.
   */
  #v2EvaluateCollectionTemplate(property, template, element, depth) {
    return property === "$children"
      ? this.#v2EvaluateChildrenTemplate(template, element, depth)
      : this.#v2EvaluateBindableCollection(template, element);
  }

  /**
   * Serializes a v2 template for the page handed to the browser, keeping Bind
   * and Handle helpers revivable (JSON would drop their Symbol markers and
   * functions).
   * @param {*} value - The template value.
   * @returns {*} A JSON-safe template.
   */
  #v2SerializeTemplate(value) {
    // functions are only valid as `__` event handlers in v2 templates, so a
    // bare function is serialized as `Handle(fn)`
    if (typeof value === "function") return this.#v2SerializeTemplate(Handle(value));
    if (!value || typeof value !== "object") return value;

    if (this.#isBind(value)) {
      return {
        __materiaBind: true,
        binding: value.binding,
        imports: this.#v2SerializeImports(value.imports) ?? null,
        handler: this.#stringifyFunction(value.handler),
      };
    }

    if (this.#isHandle(value)) {
      return {
        __materiaHandle: true,
        imports: this.#v2SerializeImports(value.imports) ?? null,
        handler: this.#stringifyFunction(value.handler),
      };
    }

    if (this.#isInView(value)) {
      const { initial, ...options } = value.options;
      return {
        __materiaInView: true,
        id: this.#v2InViewServerId(value),
        value: this.#v2SerializeTemplate(value.value),
        options:
          initial === undefined
            ? options
            : { ...options, initial: this.#v2SerializeTemplate(initial) },
      };
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.#v2SerializeTemplate(item));
    }

    const processed = {};
    for (const key in value) {
      processed[key] = this.#v2SerializeTemplate(value[key]);
    }
    return processed;
  }

  /**
   * Revives a template serialized by `#v2SerializeTemplate`, loading any
   * imports its Binds use.
   * @param {*} value - The serialized template.
   * @returns {Promise<*>} The template with live Bind and Handle helpers.
   */
  async #v2ReviveTemplate(value) {
    if (!value || typeof value !== "object") return value;

    if (value.__materiaBind === true) {
      // build the Bind directly: Bind()'s argument handling would mistake a
      // single imported class or function for the handler
      return {
        [BIND_MARKER]: true,
        binding: value.binding,
        imports: (await this.#v2ResolveStoredImports(value.imports)) ?? null,
        handler: this.#parseStringifiedFunction(value.handler),
      };
    }

    if (value.__materiaHandle === true) {
      return Handle(value.imports, this.#parseStringifiedFunction(value.handler));
    }

    if (value.__materiaInView === true) {
      const { initial, ...options } = value.options;
      const inView = InView(
        await this.#v2ReviveTemplate(value.value),
        initial === undefined
          ? options
          : { ...options, initial: await this.#v2ReviveTemplate(initial) }
      );
      // the server id keeps copies of one InView (e.g. in a Bind's template
      // and in the registry) sharing revealed state
      inView.id = value.id;
      return inView;
    }

    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => this.#v2ReviveTemplate(item)));
    }

    const processed = {};
    for (const key in value) {
      processed[key] = await this.#v2ReviveTemplate(value[key]);
    }
    return processed;
  }

  #v2ContainsBind(value) {
    if (!value || typeof value !== "object") return false;
    if (this.#isBind(value)) return true;
    // Binds inside an InView register when it is revealed
    if (this.#isInView(value)) return false;

    return Object.values(value).some((item) => this.#v2ContainsBind(item));
  }

  #v2EvaluateBindableCollection(value, element) {
    if (this.#isBind(value)) {
      return this.#v2EvaluateBind(value);
    }

    if (this.#isInView(value)) {
      if (this.#v2IsRevealed(element, value)) {
        return this.#v2EvaluateBindableCollection(value.value, element);
      }
      return value.options.initial === undefined
        ? INVIEW_OMIT
        : this.#v2EvaluateBindableCollection(value.options.initial, element);
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => this.#v2EvaluateBindableCollection(item, element))
        .filter((item) => item !== INVIEW_OMIT);
    }

    if (value && typeof value === "object") {
      const processed = {};
      for (const key in value) {
        const item = this.#v2EvaluateBindableCollection(value[key], element);
        if (item !== INVIEW_OMIT) processed[key] = item;
      }
      return processed;
    }

    return value;
  }

  #v2RegisterCollectionBinds(element, property, value, collectionTemplate, depth) {
    // Binds inside an InView register when it is revealed
    if (this.#isInView(value)) return;

    if (this.#isBind(value)) {
      this.#v2RegisterBind(element, property, value, depth, {
        collectionTemplate,
      });
      return;
    }

    if (!value || typeof value !== "object") return;

    Object.values(value).forEach((item) => {
      this.#v2RegisterCollectionBinds(
        element,
        property,
        item,
        collectionTemplate,
        depth
      );
    });
  }

  #v2EvaluateBind(bindConfig) {
    const data = this.#v2GetBindingData(bindConfig.binding, bindConfig.binding);
    const imports = this.#v2ResolveRuntimeImports(bindConfig.imports);

    return bindConfig.handler({
      data,
      imports,
      elements: elements_v2,
      core: { Bind, Import, Handle, InView },
    });
  }

  #v2GetBindingData(binding, bindings) {
    const bindingsArray = Array.isArray(bindings) ? bindings : [binding];

    if (bindingsArray.length > 1) {
      return bindingsArray.map((singleBinding) => this.get(singleBinding));
    }

    return this.get(bindingsArray[0]);
  }

  #v2RegisterBind(element, property, bindConfig, depth, options = {}) {
    let handlerElementId;

    if (!element.dataset.handlerId) {
      handlerElementId = this.#generateUniqueId();
      element.setAttribute(DATA_HANDLER_ID, handlerElementId);
    } else {
      handlerElementId = element.dataset.handlerId;
    }

    const bindingsArray = Array.isArray(bindConfig.binding)
      ? bindConfig.binding
      : [bindConfig.binding];

    bindingsArray.forEach((singleBinding) => {
      if (!this.#handlers[singleBinding]) {
        this.#handlers[singleBinding] = [];
      }

      this.#handlers[singleBinding].push({
        v2: true,
        element: handlerElementId,
        func: isServer ? bindConfig.handler.toString() : bindConfig.handler,
        property,
        pipe: isServer
          ? this.#v2SerializeImports(bindConfig.imports)
          : bindConfig.imports,
        bindings: bindingsArray,
        depth,
        collectionTemplate:
          isServer && options.collectionTemplate !== undefined
            ? this.#v2SerializeTemplate(options.collectionTemplate)
            : options.collectionTemplate,
        templateSerialized: isServer && options.collectionTemplate !== undefined,
      });
    });

    let handlerIds = this.#elementHandlerMap.get(element);
    if (!handlerIds) {
      handlerIds = new Set();
      this.#elementHandlerMap.set(element, handlerIds);
    }
    handlerIds.add(handlerElementId);
  }

  #v2ResolveRuntimeImports(imports) {
    if (!imports) return imports;

    if (Array.isArray(imports)) {
      return imports.map((item) => this.#v2ResolveRuntimeImports(item));
    }

    if (imports && imports[IMPORT_MARKER] === true) {
      return imports.component;
    }

    if (typeof imports === "object") {
      const processed = {};
      for (const key in imports) {
        processed[key] = this.#v2ResolveRuntimeImports(imports[key]);
      }
      return processed;
    }

    return imports;
  }

  #v2SerializeImports(imports) {
    if (!imports) return imports;

    if (Array.isArray(imports)) {
      return imports.map((item) => this.#v2SerializeImports(item));
    }

    if (imports && imports[IMPORT_MARKER] === true) {
      return {
        path: imports.path,
        componentName:
          typeof imports.component === "function"
            ? imports.component.name
            : imports.component,
      };
    }

    if (typeof imports === "object") {
      const processed = {};
      for (const key in imports) {
        processed[key] = this.#v2SerializeImports(imports[key]);
      }
      return processed;
    }

    return imports;
  }

  async #v2ResolveStoredImports(imports) {
    if (!imports) return imports;

    if (Array.isArray(imports)) {
      return Promise.all(
        imports.map((item) => this.#v2ResolveStoredImports(item))
      );
    }

    if (imports && imports[IMPORT_MARKER] === true) {
      return imports.component;
    }

    if (imports && imports.path) {
      const module = await import(imports.path);
      return module[imports.componentName] || module.default;
    }

    if (typeof imports === "object") {
      const processed = {};
      for (const key in imports) {
        processed[key] = await this.#v2ResolveStoredImports(imports[key]);
      }
      return processed;
    }

    return imports;
  }

  /**
   * Escapes a string so it can be safely stringified for client side rendering
   * @param {string} str - The string to escape.
   */
  #stringifyObject(obj) {
    return JSON.stringify(obj)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r");
  }

  /**
   * Handles server-side rendering of the template.
   * @param {Element} element - The element to render.
   * @returns {string} The rendered HTML
   */
  #handleServerSideRendering(element) {
    if (element.tagName === HTML_TAG) {
      const script = document.createElement(SCRIPT_TAG);
      script.textContent = `
        const rootUrl = window.location.origin + "${DEFAULT_ROOT_URL}";
        const MateriaJS = (await import(rootUrl)).default;

        const data = JSON.parse("${this.#stringifyObject(this.#data)}");
          
        const handlers = JSON.parse("${this.#stringifyObject(this.#handlers)}");

        const triggers = JSON.parse("${this.#stringifyObject(this.#triggers)}");
          
        const delegate = JSON.parse("${this.#stringifyObject(this.#delegate)}");

        const inView = JSON.parse("${this.#stringifyObject(this.#inViewDefaults)}");

        const inViewEntries = JSON.parse("${this.#stringifyObject(this.#inViewRegistry)}");
          
        window.Materia = new MateriaJS({data, handlers, triggers, delegate, inView, inViewEntries});

        Materia.loadHandler();
      `;

      script.setAttribute("type", SCRIPT_TYPE_MODULE);

      const body = element.querySelector(BODY_TAG);
      const scripts = body.querySelectorAll(SCRIPT_TAG);
      if (scripts.length > 0) {
        body.insertBefore(script, scripts[0]);
      } else {
        body.appendChild(script);
      }

      // add the import map
      const head = element.querySelector(HEAD_TAG);
      if (head) {
        const importMap = document.createElement(SCRIPT_TAG);
        importMap.type = IMPORTMAP_TYPE;
        importMap.textContent = JSON.stringify(DEFAULT_IMPORT_MAP);
        head.appendChild(importMap);
      }
    }

    return `<!DOCTYPE html>${element.outerHTML}`;
  }

  /**
   * Clears the children of an element.
   * @param {Element} element - The element to clear the children of.
   * @returns {void}
   */
  #clearChildren(element) {
    // Use the WeakMap for efficient handler cleanup
    const children = element.childNodes;

    Array.from(children).forEach((child) => {
      // Stop watching InView elements being removed (no-op when none exist)
      this.#v2ForgetInView(child);

      // Remove handlers associated with this child
      const handlerIds = this.#elementHandlerMap.get(child);
      if (handlerIds) {
        for (const handlerId of handlerIds) {
          for (let key in this.#handlers) {
            this.#handlers[key] = this.#handlers[key].filter(
              (bind) => bind.element !== handlerId
            );
          }
        }
        // Remove the mapping for this child
        this.#elementHandlerMap.delete(child);
      }
      // Remove the child from the DOM
      element.removeChild(child);
    });
  }

  /**
   * Checks if the circuit breaker should trip for a given binding.
   * Tracks update frequency and trips if too many updates occur in a short time.
   * @param {string} binding - The binding to check
   * @returns {boolean} True if circuit breaker is tripped, false otherwise
   */
  #checkCircuitBreaker(binding) {
    // If already tripped for this binding, keep it tripped
    if (this.#circuitBreaker.tripped.has(binding)) {
      return true;
    }

    const now = Date.now();
    const updates = this.#circuitBreaker.updates.get(binding) || [];

    // Remove timestamps outside the time window
    const recentUpdates = updates.filter(
      (timestamp) => now - timestamp < this.#circuitBreaker.timeWindow
    );

    // Add current update
    recentUpdates.push(now);

    // Update the tracking
    this.#circuitBreaker.updates.set(binding, recentUpdates);

    // Check if we've exceeded the threshold
    if (recentUpdates.length > this.#circuitBreaker.maxUpdates) {
      this.#circuitBreaker.tripped.add(binding);

      // Auto-reset after a longer cooldown period (5 seconds)
      setTimeout(() => {
        this.#circuitBreaker.tripped.delete(binding);
        this.#circuitBreaker.updates.delete(binding);
        console.warn(
          `Circuit breaker reset for binding "${binding}". ` +
            `You can now update this binding again, but please fix the infinite loop.`
        );
      }, 5000);

      return true;
    }

    return false;
  }

  /**
   * Manually resets the circuit breaker for a specific binding or all bindings.
   * @param {string} [binding] - Optional specific binding to reset. If omitted, resets all.
   */
  resetCircuitBreaker(binding) {
    if (binding) {
      this.#circuitBreaker.tripped.delete(binding);
      this.#circuitBreaker.updates.delete(binding);
    } else {
      this.#circuitBreaker.tripped.clear();
      this.#circuitBreaker.updates.clear();
    }
  }

  destroy(bindingOrElement) {
    if (typeof bindingOrElement === "string") {
      const keys = bindingOrElement.split(/[\.\[\]]/).filter(Boolean),
        hook = keys[0];

      // Delete the data at the binding
      const deleteData = (target, index) => {
        if (index === keys.length - 1) {
          delete target[keys[index]];
        } else {
          deleteData(target[keys[index]], index + 1);
        }
      };

      if (this.#data[hook]) {
        deleteData(this.#data, 0);
      }

      // Remove any elements bound to that binding
      if (this.#handlers[bindingOrElement]) {
        this.#handlers[bindingOrElement].forEach((bind) => {
          // Remove element from DOM by handlerId
          if (bind.element) {
            const el = document.querySelector(
              `[${DATA_HANDLER_ID}="${bind.element}"]`
            );
            if (el && el.parentNode) {
              el.parentNode.removeChild(el);
            }
          }
        });
      }

      // Remove any handlers attached to that binding
      delete this.#handlers[bindingOrElement];
    } else if (bindingOrElement instanceof Element) {
      const element = bindingOrElement;

      // Stop watching InView elements being removed (no-op when none exist)
      this.#v2ForgetInView(element);

      const asyncDestroy = async () => {
        // Remove any handlers connected to this element
        const handlerIds = this.#elementHandlerMap.get(element);
        if (handlerIds) {
          for (const handlerId of handlerIds) {
            for (const binding in this.#handlers) {
              this.#handlers[binding] = this.#handlers[binding].filter(
                (handler) => handler.element !== handlerId
              );
            }
          }
          this.#elementHandlerMap.delete(element);
        }

        // Remove any delegates connected to this element
        for (const event in this.#delegate) {
          this.#delegate[event] = this.#delegate[event].filter((delegate) => {
            let delegateTarget = delegate.target;
            if (typeof delegateTarget === "string") {
              delegateTarget = document.querySelector(
                `[${DATA_DELEGATE_ID}="${delegateTarget}"]`
              );
            }
            if (
              delegateTarget === element ||
              element.contains(delegateTarget)
            ) {
              return false;
            }
            return true;
          });
        }

        // Remove the element from the DOM
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }

        // Disconnect IntersectionObserver if present for this element
        const observer = this.#intersectionObservers.get(element);
        if (observer) {
          observer.unobserve(element);
          observer.disconnect();
          this.#intersectionObservers.delete(element);
        }
      };

      // Call the async function
      asyncDestroy();
    }
  }

  #garbageCollect() {
    // review all the elements in the handlers and delegates
    // and remove any that are no longer in the DOM
    for (const binding in this.#handlers) {
      this.#handlers[binding] = this.#handlers[binding].filter((handler) => {
        let handlerElement = handler.element;
        if (typeof handlerElement === "string") {
          handlerElement = document.querySelector(
            `[${DATA_HANDLER_ID}="${handlerElement}"]`
          );
        }
        if (!handlerElement || !document.body.contains(handlerElement)) {
          // Clean up WeakMap entry if present
          if (handlerElement) {
            this.#elementHandlerMap.delete(handlerElement);
          }
          return false;
        }
        return true;
      });
    }

    for (const event in this.#delegate) {
      this.#delegate[event] = this.#delegate[event].filter((delegate) => {
        let delegateTarget = delegate.target;
        if (typeof delegateTarget === "string") {
          delegateTarget = document.querySelector(
            `[${DATA_DELEGATE_ID}="${delegateTarget}"]`
          );
        }
        if (!delegateTarget || !document.body.contains(delegateTarget)) {
          return false;
        }
        return true;
      });
    }
  }

  /**
   * Debounced garbage collection method.
   */
  #debouncedGarbageCollect = this.#debounce(() => {
    this.#garbageCollect();
  }, 500); // Increased debounce interval to 500ms

  /**
   * Debounce function to limit the rate at which a function can fire.
   * @param {Function} func - The function to debounce.
   * @param {number} wait - The number of milliseconds to wait before invoking the function.
   * @returns {Function} The debounced function.
   */
  #debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
}

// ===== Magic String Constants =====
const IMPORT_PREFIX = "import::";
const HANDLER_ID_PREFIX = "mtrid";
const DATA_HANDLER_ID = "data-handler-id";
const DATA_DELEGATE_ID = "data-delegate-id";
const DATA_VCLASS = "data-vclass";
const DATA_VCLASS_OBSERVED = "data-vclass-observed";
const DEFAULT_IMPORT_MAP = {
  imports: {
    materiajs: "/materia.js",
    "materiajs/": "/materiajs/",
    "@jeffcarbine/premmio/": "/node_modules/@jeffcarbine/premmio/",
  },
};
const SCRIPT_TYPE_MODULE = "module";
const HTML_TAG = "HTML";
const BODY_TAG = "body";
const HEAD_TAG = "head";
const SCRIPT_TAG = "script";
const IMPORTMAP_TYPE = "importmap";
const DEFAULT_ROOT_URL = "/materia.js";

export default MateriaJS;
