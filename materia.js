// Import all the elements
import * as elements from "materiajs/elements";
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

export function Bind(callback) {
  callback();
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

  set(binding, value) {
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

    // Split the binding string into individual keys
    const keys = binding.split(/[\.\[\]]/).filter(Boolean);
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
          return;
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
            return;
          }
          target = target[key];
        }
      }
    }

    // Handle any updates to bindings
    this.#handleBindingUpdate(binding);
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
      this.set(binding, target);
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
      this.set(binding, target);
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
      target.splice(arrayIndex, 1);
      this.#handleBindingUpdate(binding);
    } else {
      console.warn(
        `Warning: No matching element found in ${binding} for removal.`
      );
    }
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
    if (this.#handlers[binding]) {
      for (const handler of this.#handlers[binding]) {
        this.#handle(binding, handler);
      }
    }
  }

  /**
   * The data object for the data bindings.
   */
  #data = {};

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
      element.removeAttribute(key);
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
      } else if (typeof pipe[key] === "object" && pipe[key] !== null) {
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
        if (handler.pipe) {
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
    let { element, func, property, pipe } = handler;

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

    value = func(this.get(binding), elements, pipe);

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
  #addEventDelegate(element, event, func, pipe, preventDefault) {
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
    if (event === "clickOutside") {
      event = "click";
      target = "document";
    }

    this.#registerEvent(event, target, pipe, func, preventDefault);
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
  #registerEvent(event, target, pipe, func, preventDefault) {
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
        if (typeof pipe[key] === "object" && pipe[key].path) {
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

    if (event === "load" && !isServer) {
      // then we need to run this function immediately
      // because we are rendering on the client side
      this.#stashedLoadEvent = eventData;
    } else {
      this.#delegate[event].push(eventData);
    }
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
        let { target, func, pipe, preventDefault } = eventObj;

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
        let match = this.#getMatchingTarget(event, target);

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

  #stashedLoadEvent = null;

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
    if (template.hasOwnProperty("if") && !template.if) {
      return null;
    }

    // If the template is a string, return a text node
    if (typeof template === "string") {
      return document.createTextNode(template);
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
    const preventDefaults = template.preventDefault
      ? Array.isArray(template.preventDefault)
        ? template.preventDefault
        : [template.preventDefault]
      : [];

    // Process each key/value pair in the template
    Object.keys(template).forEach((key) => {
      let value = template[key];

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
      // if we have a stashed load event, run it
      if (this.#stashedLoadEvent) {
        const { target, func, pipe } = this.#stashedLoadEvent;

        const maxWaitTime = 5000; // Maximum wait time in milliseconds
        const intervalTime = 10; // Interval time in milliseconds
        let elapsedTime = 0;
        let interval;

        try {
          interval = setInterval(() => {
            try {
              if (target.parentNode) {
                func(target, pipe, elements);
                clearInterval(interval);
              } else {
                elapsedTime += intervalTime;
                if (elapsedTime >= maxWaitTime) {
                  console.warn(
                    `Giving up after ${maxWaitTime}ms: target element not found in DOM.`
                  );
                  clearInterval(interval);
                }
              }
            } catch (err) {
              clearInterval(interval);
              throw err;
            }
          }, intervalTime);
        } finally {
          // Defensive: ensure interval is cleared if function exits unexpectedly
          setTimeout(() => clearInterval(interval), maxWaitTime + intervalTime);
        }
      }
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
    const functionPattern = /^\s*(function\s*\(|\(\s*[^\)]*\)\s*=>)/;
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

        if (value && typeof value === "object" && value?.data && value?.path) {
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

    if (!this.#handlers[binding]) {
      this.#handlers[binding] = [];
    }

    // Store only the handlerId, not the element reference
    this.#handlers[binding].push({
      element: handlerElementId,
      func,
      property,
      pipe,
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

    // get the index of the binding in the handler's array
    const index = this.#handlers[binding].length - 1;

    if (triggers.length > 0) {
      triggers.forEach((trigger) => {
        const triggerBinding = `${binding}.${trigger}`;

        if (!this.#triggers[triggerBinding]) {
          this.#triggers[triggerBinding] = [];
        }

        this.#triggers[triggerBinding].push({
          binding,
          handler: this.#handlers[binding][index],
        });
      });
    }

    const result = preservedFunc(this.get(binding), elements, clientPipe);

    if (result !== null) {
      this.#setElementAttribute(element, property, result, depth);
    }
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
          
        window.Materia = new MateriaJS({data, handlers, triggers, delegate});

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
