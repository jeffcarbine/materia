// Import all the elements
import * as elements from "materiajs/elements";

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
      const { data, handlers, delegate } = params;

      // Set the data and handlers
      this.#data = data;
      this.#handlers = handlers;
      this.#delegate = delegate;

      this.#enableEventDelegation();
      this.#observeViewportClassElements();
    }
  }

  /**
   * The handlers object for the template engine.
   */
  #handlers = {};

  /**
   * Gets the value from a binding string
   * @param {string} binding - The binding to get the value for.
   * @returns {*} The bindingValue of the specified binding.
   */
  get(binding) {
    // every value defaults to an empty string unless it is set
    let defaultType = "";

    const value = binding
      .split(/[\.\[\]]/)
      .filter(Boolean)
      .reduce((acc, part) => {
        if (acc === null || acc === undefined) {
          return defaultType;
        }

        const arrayMatch = part.match(/(\d+)/);
        if (arrayMatch) {
          const index = arrayMatch[0];
          if (!acc || acc[index] === undefined) {
            return defaultType;
          }
          return acc[index];
        }

        if (acc[part] === undefined) {
          return defaultType;
        }
        return acc[part];
      }, this.#data);

    return value;
  }

  /**
   * Sets the value for a binding.
   * @param {string} binding - The binding to set the value for.
   * @param {*} value - The value to set for the binding.
   */
  set(binding, value) {
    const keys = binding.split(/[\.\[\]]/).filter(Boolean);
    let target = this.#data;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const arrayMatch = key.match(/(\w+)\[(\d+)\]/);

      if (arrayMatch) {
        const [, arrayKey, arrayIndex] = arrayMatch;

        if (!target[arrayKey]) {
          target[arrayKey] = [];
        }

        if (!Array.isArray(target[arrayKey])) {
          console.error(`Error: ${arrayKey} is not an array.`);
          return;
        }

        if (i === keys.length - 1) {
          target[arrayKey][arrayIndex] = value;
        } else {
          if (!target[arrayKey][arrayIndex]) {
            target[arrayKey][arrayIndex] = {};
          }
          target = target[arrayKey][arrayIndex];
        }
      } else {
        if (i === keys.length - 1) {
          target[key] = value;
        } else {
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

    this.#handleBindingUpdate(binding);
  }

  /**
   * Updates multiple bindings based on an object structure
   * @param {string} binding - The root binding to update
   * @param {Object} data - The data object containing updates
   */
  update(binding, data) {
    const updateRecursive = (currentBinding, currentData) => {
      if (typeof currentData !== "object" || currentData === null) {
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

    if (!isServer) {
      checkHandlers(binding);
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
      delegate: this.#delegate,
    };
  }

  /**
   * Generates a unique ID.
   * @returns {string} The unique ID.
   */
  #generateUniqueId() {
    return "objk" + Math.random().toString(36).substr(2, 9);
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
    const nonAttributes = [
      "children",
      "prepend",
      "append",
      "child",
      "tagName",
      "textContent",
      "innerHTML",
      "if",
      "style",
      "binding",
    ];

    if (!nonAttributes.includes(key)) {
      this.#setAttribute(element, key, value);
    } else if (key === "style") {
      this.#setStyle(element, value);
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
      element.removeAttribute(key);
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
    element.innerHTML = "";
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
        if (pipe[key].path && !pipe[key].path.startsWith("import::")) {
          pipe[key].path = `import::${pipe[key].path}`;
        }
      }
    }
    return pipe;
  }

  async #plumb(pipe) {
    for (let key in pipe) {
      if (typeof pipe[key] === "string") {
        if (pipe[key].startsWith("import::")) {
          const path = pipe[key].replace("import::", "");

          // Check if the component is already imported
          if (this.importedComponents[path]) {
            pipe[key] = this.importedComponents[path];
          } else {
            try {
              // Dynamically import the component
              const module = await import(path);

              // Check for named export or default export
              const component = module[key] || module.default;

              if (component) {
                this.importedComponents[path] = component;
                pipe[key] = component;
              } else {
                console.error(`Component ${key} not found in ${path}`);
              }
            } catch (error) {
              console.error(`Error importing ${path}:`, error);
            }
          }
        } else if (this.#isStringifiedFunction(pipe[key])) {
          const func = this.#parseStringifiedFunction(pipe[key]);
          pipe[key] = func;
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
      pipe = await this.#plumb(pipe);
    }

    value = func(this.get(binding), elements, pipe);

    if (typeof element === "string") {
      const query = "[data-handler-id='" + element + "']";
      element = document.querySelector(query);
      handler.element = element;
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
  #eventTypes = [
    "click",
    "clickOutside",
    "dblclick",
    "mousedown",
    "mouseup",
    "mouseover",
    "mouseout",
    "mousemove",
    "mouseenter",
    "mouseleave",
    "keydown",
    "keypress",
    "keyup",
    "load",
    "unload",
    "abort",
    "error",
    "resize",
    "scroll",
    "select",
    "change",
    "submit",
    "reset",
    "focus",
    "focusin",
    "focusout",
    "blur",
    "touchstart",
    "touchmove",
    "touchend",
    "touchcancel",
    "gesturestart",
    "gesturechange",
    "gestureend",
    "message",
    "open",
    "close",
    "input",

    // mutations
    "childList",
    "subtree",
    "characterData",
  ];

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

      // Add a new event listener for that event
      document.addEventListener(event, this.#eventHandler.bind(this), false);
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

    this.#delegate[event].push(eventData);
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
    // empty eventObj so we can properly pass what
    // delegate event we are going to match this event to
    var eventArr;

    // if this is a keypress, check that it is the enter key
    if (event.type === "keypress") {
      let key = event.which || event.keyCode;
      // if it is the enter key...
      if (key === 13) {
        // .. then we treat it like a click
        eventArr = this.#delegate.click;
      }
    } else {
      // otherwise, just get the matching event object
      eventArr = this.#delegate[event.type];
    }

    for (const eventObj of eventArr) {
      let { target, func, pipe, preventDefault } = eventObj;

      // if the target is a string, then we need to get the element
      // and update the delegate
      if (typeof target === "string") {
        if (target === "document") {
          target = document;
        } else {
          target = document.querySelector("[data-delegate-id=" + target + "]");
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

          if (pipe) pipe = await this.#plumb(pipe);

          func(match, pipe, elements, event);
        }
      }
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
          pipe = await this.#plumb(pipe);
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
    for (var i = 0; i < mutationsList.length; i++) {
      let mutation = mutationsList[i];

      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        this.#executeCheck(mutation);
      } else if (mutation.type === "attributes") {
        this.#executeCheck(mutation);
      } else if (mutation.type === "characterData") {
        this.#executeCheck(mutation);
      }
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
          pipe = await this.#plumb(pipe);
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
        document.addEventListener(event, this.#eventHandler.bind(this), false);
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
   * Observes elements with the data-vclass attribute and adds the specified class when they enter the viewport.
   */
  #observeViewportClassElements() {
    // on page load, get all the elements that have a data-vclass property
    const vclassElements = document.querySelectorAll(
      "[data-vclass]:not([data-vclass-observed=true]"
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

    // Check if the template has an "if" property and if it's f alse or undefined, return null
    if (template.hasOwnProperty("if") && template.if == false) {
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

    // Pull out the pipe for this element to pass along
    const pipe = this.#encodePipe(template.pipe);

    // Pull out the preventDefault value if there is one
    const preventDefaults = template.preventDefault
      ? Array.isArray(template.preventDefault)
        ? template.preventDefault
        : [template.preventDefault]
      : [];

    // Process each key/value pair in the template
    Object.keys(template).forEach((key) => {
      let value = template[key];

      if (this.#eventTypes.includes(key) || key.startsWith("attributes:")) {
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

        let binding = template.binding;

        // If the value is a function and the key isn't an event, it's a binding
        if (typeof value === "function" && !this.#eventTypes.includes(key)) {
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
  #processFunctionValue(element, property, func, pipe, binding, depth) {
    let handlerElement,
      preservedFunc = func;

    let clientPipe = {};

    // loop through the keys of the pipe and set the value to the data attribute
    if (pipe) {
      for (const key in pipe) {
        const value = pipe[key];

        if (typeof value === "object" && value.data && value.path) {
          // assign the data to the clientPipe
          clientPipe[key] = value.data;
        } else {
          clientPipe[key] = value;
        }
      }
    }

    if (!isServer) {
      handlerElement = element;
      pipe = clientPipe;
    } else {
      // create a handlerId to serve in place of the element in the handlers object
      // in the event the element doesn't already have one
      if (!element.dataset.handlerId) {
        handlerElement = this.#generateUniqueId();

        // give the handlerId to the element
        element.setAttribute("data-handler-id", handlerElement);
      } else {
        handlerElement = element.dataset.handlerId;
      }

      // convert the func to a string so we can store it on the server
      func = func.toString();

      // loop through the keys of the pipe and set the value to the data attribute
      if (pipe) {
        for (const key in pipe) {
          const value = pipe[key];

          if (typeof value === "object" && value.data && value.path) {
            // assign the data to the clientPipe
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

    this.#handlers[binding].push({
      element: handlerElement,
      func,
      property,
      pipe,
    });

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
    if (element.tagName === "HTML") {
      const script = document.createElement("script");
      script.textContent = `
        const rootUrl = window.location.origin + "/materia.js";
        const MateriaJS = (await import(rootUrl)).default;

        const data = JSON.parse("${this.#stringifyObject(this.#data)}");
          
        const handlers = JSON.parse("${this.#stringifyObject(this.#handlers)}");
          
        const delegate = JSON.parse("${this.#stringifyObject(this.#delegate)}");
          
        window.Materia = new MateriaJS({data, handlers, delegate});

        Materia.loadHandler();
      `;

      script.setAttribute("type", "module");
      script.setAttribute("defer", true);

      const body = element.querySelector("body");
      const scripts = body.querySelectorAll("script");
      if (scripts.length > 0) {
        body.insertBefore(script, scripts[0]);
      } else {
        body.appendChild(script);
      }

      // add the import map
      const head = element.querySelector("head");
      if (head) {
        const importMap = document.createElement("script");
        importMap.type = "importmap";
        importMap.textContent = JSON.stringify({
          imports: {
            "materiajs/elements": "/materiajs/elements",
          },
        });
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
    // we need to check this.handlers for any reference to any of the children that are being removed
    // and remove their handlers
    // get all the children
    const children = element.childNodes,
      handlers = this.#handlers;

    // the handlers contain a reference to the element in their element property,
    // so we just need to match that element to the element that is being removed
    Array.from(children).forEach((child) => {
      for (let key in handlers) {
        handlers[key] = handlers[key].filter((bind) => bind.element !== child);
      }

      // then delete the child
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
          if (bind.element && bind.element.parentNode) {
            bind.element.parentNode.removeChild(bind.element);
          }
        });
      }

      // Remove any handlers attached to that binding
      delete this.#handlers[bindingOrElement];
    } else if (bindingOrElement instanceof Element) {
      const element = bindingOrElement;

      // Define an async function to handle the asynchronous operations
      const asyncDestroy = async () => {
        // Remove any handlers connected to this element
        for (const binding in this.#handlers) {
          this.#handlers[binding] = this.#handlers[binding].filter(
            (handler) => {
              let handlerElement = handler.element;
              if (typeof handlerElement === "string") {
                handlerElement = document.querySelector(
                  `[data-handler-id="${handlerElement}"]`
                );
              }
              if (
                handlerElement === element ||
                element.contains(handlerElement)
              ) {
                return false;
              }
              return true;
            }
          );
        }

        // Remove any delegates connected to this element
        for (const event in this.#delegate) {
          this.#delegate[event] = this.#delegate[event].filter((delegate) => {
            let delegateTarget = delegate.target;
            if (typeof delegateTarget === "string") {
              delegateTarget = document.querySelector(
                `[data-delegate-id="${delegateTarget}"]`
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
      };

      // Call the async function
      asyncDestroy();
    }
  }
}

export default MateriaJS;
