// Import all the elements
import * as e from "./elements.html.js";

// Standard Library Imports
let document, fs;

const isServer = typeof window === "undefined";

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
 * The main html.js object.
 */
export default {
  /**
   * The handlers object for the template engine.
   */
  handlers: {},

  /**
   * Gets the value from a binding string
   * @param {string} binding - The binding to get the value for.
   * @returns {*} The bindingValue of the specified binding.
   */
  get: function (binding) {
    const value = binding.split(".").reduce((acc, part) => {
      const arrayMatch = part.match(/(\w+)\[(\d+)\]/);
      if (arrayMatch) {
        const [, key, index] = arrayMatch;
        return acc[key][index];
      }
      return acc[part];
    }, this.data);

    return value;
  },

  // Function to compare and update data
  _compareAndUpdate(target, value, path = "", changes = []) {
    // Create a copy of the target
    const updatedTarget = Array.isArray(target) ? [...target] : { ...target };

    // Check if the objects are identical
    if (JSON.stringify(target) === JSON.stringify(value)) {
      return { updatedTarget, changes };
    }

    for (const key in value) {
      if (value.hasOwnProperty(key)) {
        const newPath = path ? `${path}.${key}` : key;

        if (Array.isArray(value[key])) {
          if (!Array.isArray(updatedTarget[key])) {
            updatedTarget[key] = [];
          }
          if (
            JSON.stringify(updatedTarget[key]) !== JSON.stringify(value[key])
          ) {
            updatedTarget[key] = value[key];
            changes.push(newPath); // Log the changed path
          }
        } else if (value[key] && typeof value[key] === "object") {
          if (!updatedTarget[key] || typeof updatedTarget[key] !== "object") {
            updatedTarget[key] = {};
          }

          const result = this._compareAndUpdate(
            updatedTarget[key],
            value[key],
            newPath,
            changes
          );
          updatedTarget[key] = result.updatedTarget;
        } else {
          if (updatedTarget[key] !== value[key]) {
            updatedTarget[key] = value[key];
            changes.push(newPath); // Log the changed path
          }
        }
      }
    }

    return { updatedTarget, changes };
  },

  // Function to create a proxy for arrays
  _createArrayProxy(array, path, changes) {
    return new Proxy(array, {
      set(target, prop, value) {
        const result = Reflect.set(target, prop, value);
        changes.push(`${path}[${prop}]`);
        return result;
      },
      deleteProperty(target, prop) {
        const result = Reflect.deleteProperty(target, prop);
        changes.push(`${path}[${prop}]`);
        return result;
      },
    });
  },

  // splits a binidng into hook and tether
  _splitBinding(binding) {
    const parts = binding.split(".");
    const hook = parts.shift();
    const tether = parts.join(".");
    return { hook, tether };
  },

  /**
   * Creates a Proxy for the data object to handle get and set operations of bindings.
   *
   * In the proxy, there are two keywords that together make up a binding: hooks and tethers.
   *
   * The hook is the key that "grabs" onto the data proxy. The tether is the "rope" path to the data that an element is bound to.
   *
   * So a hook would be something like "messages" and a tether would be something like "[0].title".
   *
   * A binding would be both together: "messages[0].title".
   *
   * In the event that you want the entire object, the binding can just consist of the hook.
   *
   * The value that is returned from a binding is called a "binding value" or bindingValue.
   *
   * @returns {Proxy} The Proxy object for the data.
   */
  _createDataProxy() {
    const self = this; // Capture the `this` context

    return new Proxy(
      {},
      {
        /**
         * Handles getting a value from the Proxy.
         *
         * @param {Object} target - The target object.
         * @param {string} binding - The binding for the value to get.
         * @returns {*} The value of the specified binding, or null if it does not exist.
         */
        get(target, binding, receiver) {
          if (binding === "update") {
            return (value) => {
              const changes = self._compareAndUpdate(target, value);
              return changes;
            };
          }

          // Split the binding into an array of keys, accounting for both dot and bracket notation
          const keys = binding.split(/[\.\[\]]/).filter(Boolean);
          let current = target;

          // Traverse the target object to get the value
          for (let i = 0; i < keys.length; i++) {
            if (current[keys[i]] === undefined) {
              return null; // Return null if any part of the path does not exist
            }
            current = current[keys[i]]; // Move to the next level in the object hierarchy
          }

          if (Array.isArray(current)) {
            return self._createArrayProxy(current, binding, []);
          }

          return current; // Return the final value
        },

        /**
         * Handles setting a value in the Proxy.
         *
         * @param {Object} target - The target object.
         * @param {string} binding - The binding to set the value for.
         * @param {*} value - The value to set.
         * @param {Proxy} receiver - The Proxy object.
         * @returns {boolean} True if the value was set successfully, false otherwise.
         */
        async set(target, hook, value, receiver) {
          // Perform the comparison and update
          const { updatedTarget, changes } = self._compareAndUpdate(
            target[hook],
            value
          );

          const results = Reflect.set(target, hook, updatedTarget, receiver);

          // Return true to indicate the operation was successful
          return results;
        },
      }
    );
  },

  set(binding, value) {
    const keys = binding.split(/[\.\[\]]/).filter(Boolean),
      hook = keys[0];

    if (!this.data[hook]) {
      this.data[hook] = value;
    } else {
      const check = (target, index) => {
        if (index === keys.length - 1) {
          target[keys[index]] = value;
        } else {
          check(target[keys[index]], index + 1);
        }
      };

      check(this.data, 0);
    }

    this._handleBindingUpdate(binding);
  },

  push(binding, value) {
    const keys = binding.split(/[\.\[\]]/).filter(Boolean),
      hook = keys[0];

    if (!this.data[hook]) {
      console.error(`Error: ${hook} is not defined.`);
      return;
    }

    let isPushed = false;

    const check = (target, index) => {
      if (index === keys.length - 1) {
        if (Array.isArray(target[keys[index]])) {
          target[keys[index]].push(value);
          isPushed = true;
        } else {
          console.error(`Error: ${binding} is not an array.`);
        }
      } else {
        check(target[keys[index]], index + 1);
      }
    };

    check(this.data, 0);

    if (isPushed) {
      this._handleBindingUpdate(binding);
    }
  },

  _handleBindingUpdate(binding) {
    const checkHandlers = (binding) => {
      if (this.handlers[binding]) {
        this.handlers[binding].forEach((handler) => {
          this._handle(binding, handler);

          if (!this._fromServer) {
            const { hook } = this._splitBinding(binding);
            const endpoint = this.endpoints[hook];
            if (endpoint) {
              this._syncWithServer(binding);
            }
          }
        });
      } else {
        const parentBinding = binding.replace(/(\.[^\.]*|\[\d+\])$/, "");
        if (parentBinding !== binding) {
          checkHandlers(parentBinding);
        }
      }
    };

    if (!isServer) {
      checkHandlers(binding);
    }
  },

  // Store timeouts for each binding
  syncTimeouts: {},

  /**
   * Synchronizes the data with the server for the given hook.
   * @param {string} binding - The binding to synchronize.
   * @param {Object} options - Optional parameters for the request.
   * @param {string} [options.method="POST"] - The HTTP method to use for the request.
   * @param {boolean} [options.sendData=true] - Whether to send data to the server.
   * @param {boolean} [options.receiveData=true] - Whether to receive data from the server.
   */
  _syncWithServer(binding, options = {}) {
    const { method = "POST", sendData = true, receiveData = true } = options;
    const { hook } = this._splitBinding(binding);
    const endpoint = this.endpoints[hook];

    if (!this.data[hook]) {
      this.data[hook] = {}; // Initialize the data for the hook if it doesn't exist
    }

    // Clear any existing timeout for this binding
    if (this.syncTimeouts[binding]) {
      clearTimeout(this.syncTimeouts[binding]);
    }

    // Set a new timeout for this binding
    this.syncTimeouts[binding] = setTimeout(() => {
      const dataToSend = sendData ? JSON.stringify(this.get(binding)) : null;

      fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: dataToSend,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              `Failed to synchronize data: ${response.statusText}`
            );
          }
          return receiveData ? response.json() : null;
        })
        .then((data) => {
          if (receiveData) {
            if (JSON.stringify(data) !== JSON.stringify(this.get(binding))) {
              this._fromServer = true;
              this.set(binding, data);
              this._fromServer = false;
            }
          }
        })
        .catch((error) => {
          console.error(error);
        });

      // Clear the timeout after the request is sent
      delete this.syncTimeouts[binding];
    }, 300); // Adjust the debounce delay as needed (300ms in this example)
  },

  /**
   * The data object for the data bindings.
   */
  data: null,

  /**
   * Initializes the template engine.
   * @returns {void}
   */
  init() {
    this.data = this._createDataProxy();
  },

  /**
   * Stores the endpoints for updating the data.
   */
  endpoints: {},

  /**
   * Sets both the data and the endpoint for the binding.
   * @param {string} bindingId - The ID of the binding.
   * @param {Object} data - The data for the binding.
   * @param {string} endpoint - The POST endpoint for the binding.
   */
  setData(bindingId, data, endpoint) {
    this.set(bindingId, data);

    if (endpoint) {
      this.endpoints[bindingId] = endpoint;
    }
  },

  /**
   * Generates a unique ID.
   * @returns {string} The unique ID.
   */
  _generateUniqueId() {
    return "_" + Math.random().toString(36).substr(2, 9);
  },

  /**
   * Converts a camelCase string to a hyphenated string.
   * @param {string} str - The camelCase string to convert.
   * @returns {string} The hyphenated string.
   */
  _camelToHyphen(str) {
    return str.replace(/[A-Z]/g, (match) => "-" + match.toLowerCase());
  },

  /**
   * Sets an attribute on an element.
   * @param {Element} element - The element to set the attribute on.
   * @param {string} key - The key of the attribute.
   * @param {string} value - The value of the attribute.
   * @param {string} bindingId - The ID of the binding.
   * @param {number} depth - The depth of the rendering.
   * @returns {void}
   */
  _setElementAttribute(element, key, value, depth = 0) {
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
    ];

    if (!nonAttributes.includes(key)) {
      this._setAttribute(element, key, value);
    } else if (key === "style") {
      this._setStyle(element, value);
    } else if (key === "innerHTML") {
      this._setInnerHTML(element, value);
    } else if (key === "prepend") {
      this._prependChild(element, value, depth);
    } else if (key === "children" || key === "child") {
      this._setChildren(element, key, value, depth);
    } else if (key === "textContent") {
      this._setTextContent(element, value);
    } else if (key === "append") {
      this._appendChild(element, value, depth);
    }
  },

  /**
   * Sets an attribute on an element.
   * @param {Element} element - The element to set the attribute on.
   * @param {string} key - The key of the attribute.
   * @param {string} value - The value of the attribute.
   * @returns {void}
   */
  _setAttribute(element, key, value) {
    element.removeAttribute(key);
    const hasUpperCase = /[A-Z]/.test(key);
    if (hasUpperCase) {
      element._setAttributeNS(null, key, value);
    } else {
      element._setAttribute(key, value);
    }
  },

  /**
   * Sets the style of an element.
   * @param {Element} element - The element to set the style on.
   * @param {string|Object} value - The style to set.
   * @returns {void}
   */
  _setStyle(element, value) {
    let style = "";
    if (typeof value === "string") {
      style = value;
    } else if (typeof value === "object") {
      for (let key in value) {
        const property = key.includes("-") ? key : this._camelToHyphen(key);
        style += `${property}:${value[key]};`;
      }
    }
    element._setAttribute("style", style);
  },

  /**
   * Sets the innerHTML of an element.
   * @param {Element} element - The element to set the inner HTML on.
   * @param {string} value - The inner HTML to set.
   * @returns {void}
   */
  _setInnerHTML(element, value) {
    element.innerHTML = "";
    element.innerHTML = value;
  },

  /**
   * Prepends a child to an element.
   * @param {Element} element - The element to prepend the child to.
   * @param {string|Object} value - The value to prepend.
   * @param {number} depth - The depth of the rendering.
   * @returns {void}
   */
  _prependChild(element, value, depth) {
    if (typeof value !== "object") {
      element.prepend(document.createTextNode(value));
    } else {
      const childElement = this.render(value, null, depth + 1);
      if (childElement !== null) {
        element.prepend(childElement);
      }
    }
  },

  /**
   * Sets the children of an element.
   * @param {Element} element - The element to set the children on.
   * @param {string} key - The key of the children.
   * @param {Array} value - The value of the children.
   * @param {number} depth - The depth of the rendering.
   */
  _setChildren(element, key, value, depth, parentBinding) {
    let children = key === "children" ? value : [value];

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
      this._clearChildren(element);
      if (value === null) return;
    }

    children.forEach((child) => {
      const childElement = this.render(child, null, depth + 1, parentBinding);
      if (childElement !== null) {
        element.appendChild(childElement);
      }
    });
  },

  /**
   * Sets the text content of an element.
   * @param {Element} element - The element to set the text content on.
   * @param {string} value - The value of the text content.
   * @returns {void}
   */
  _setTextContent(element, value) {
    element.textContent = "";
    element.appendChild(document.createTextNode(value));
  },

  /**
   * Appends a child
   * @param {Element} element - The element to append the child to.
   * @param {string|Object} value - The value to append.
   * @param {number} depth - The depth of the rendering.
   * @returns {void}
   */
  _appendChild(element, value, depth) {
    if (typeof value !== "object") {
      element.appendChild(document.createTextNode(value));
    } else {
      const childElement = this.render(value, null, depth + 1);
      if (childElement !== null) {
        element.appendChild(childElement);
      }
    }
  },

  importedComponents: {},

  async _handle(binding, handler) {
    let { element, func, property, pipe } = handler;

    let value;

    // for server-side binding, the func will be a string so we
    // will need to parse it
    if (typeof func === "string") {
      func = new Function("data", `return ${func}`)(this.data);
      handler.func = func;
    }

    // check to see if any of the pipe values are strings that need to be imported
    if (pipe) {
      for (let key in pipe) {
        if (typeof pipe[key] === "string") {
          const path = pipe[key];

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
                pipe[key] = component;
                this.importedComponents[path] = component;
              } else {
                console.error(`Component ${key} not found in ${path}`);
              }
            } catch (error) {
              console.error(`Error importing ${path}:`, error);
            }
          }
        }
      }
    }

    value = func(this.get(binding), e, pipe);

    this._setElementAttribute(element, property, value);
  },

  delegate: {},

  _eventTypes: [
    "click",
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
  ],

  /**
   * Adds an event delegate for an element
   * @param {Element} element - The element to add the event delegate to
   * @param {string} event - The event to add the delegate for
   * @param {Function} func - The function to run when the event is triggered
   */
  _addEventDelegate(element, event, func) {
    // if this is the server, store the event delegate data on the element itself
    if (isServer) {
      if (!element.dataset.eventDelegates) {
        element.dataset.eventDelegates = JSON.stringify([]);
      }

      let eventDelegates = JSON.parse(element.dataset.eventDelegates);

      eventDelegates.push({ event, func: func.toString() });

      element.dataset.eventDelegates = JSON.stringify(eventDelegates);
    } else {
      // first, we need to check what kind of event is being registered
      // -- if it is a load or resize function that are being set to the
      // window, then they need to be handled differently and just get
      // pushed to their corresponding arrays
      if (event.indexOf("load") > -1 && element === window) {
        onloadFunctions.push(func);
      } else if (event.indexOf("resize") > -1 && element === window) {
        onresizeFunctions.push(func);
      } else if (event.indexOf("scroll") > -1 && element === window) {
        scrollFunctions.push(func);
      } else {
        this._registerEvent(event, element, func, true);
      }
    }
  },

  _registerEvent(event, target, func, preventDefault) {
    // check to see if the object already has an instance of the event (which, if it does, it means we have already
    // registered an Event Listener for it)
    if (this.delegate[event] === undefined) {
      // if it doesn't, then set that delegate event to an empty array
      this.delegate[event] = [];
    }

    const eventData = {
      target,
      func,
      preventDefault,
    };

    if (func.name !== undefined) {
      eventData.name = func.name;
    }

    this.delegate[event].push(eventData);
  },

  _isDescendant(parent, child) {
    let node = child;
    while (node !== null) {
      if (node === parent) {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  },

  _eventMatches(event, element) {
    return this._isDescendant(element, event.target);
  },

  _eventHandler(event) {
    // empty eventObj so we can properly pass what
    // delegate event we are going to match this event to
    var eventArr;

    // if this is a keypress, check that it is the enter key
    if (event.type === "keypress") {
      let key = event.which || event.keyCode;
      // if it is the enter key...
      if (key === 13) {
        // .. then we treat it like a click
        eventArr = this.delegate.click;
      }
    } else {
      // otherwise, just get the matching event object
      eventArr = this.delegate[event.type];
    }

    eventArr.forEach((eventObj) => {
      const { target, func, preventDefault } = eventObj;

      // check whether the element or it's direct parent match
      // the key
      let match = this._eventMatches(event, target);

      // set the disabled bool
      let disabled = false;

      // if the _eventMatches returned a node
      if (match !== false) {
        // stop events if the element is disabled
        if (match.disabled === true) {
          disabled = true;
        }

        // prevent clicks by default unless preventDefault is false
        if (event.type === "click") {
          if (preventDefault !== false) {
            event.preventDefault();
          }
          // and for everything else, prevent default if preventDefault is true
        } else if (preventDefault) {
          event.preventDefault();
        }

        // run the function and pass the target
        if (!disabled) {
          func(target, event);
        }
      }
    });
  },

  _mutationConfig: {
    attributes: true,
    attributeFilter: [
      "class",
      "id",
      "value",
      "data-icon",
      "data-active",
      "data-state",
      "data-page",
      "checked",
      "open",
      "style",
    ],
    childList: true,
    subtree: true,
    characterData: true,
  },

  // check to see if an event is a mutation or not
  _isValidMutation(event) {
    if (event === "childList" || event.includes("attributes")) {
      return true;
    } else {
      return false;
    }
  },

  // Callback function to execute when mutations are observed
  _mutationCallback(mutationsList) {
    function runCallback() {
      for (var i = 0; i < mutationsList.length; i++) {
        let mutation = mutationsList[i];

        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          _executeCheck(mutation);
        } else if (mutation.type === "attributes") {
          _executeCheck(mutation);
        } else if (mutation.type === "characterData") {
          _executeCheck(mutation);
        }
      }
    }

    runCallback();
  },

  _observingMutations: false,

  _observer: null,

  _observeMutations() {
    // Select the node that will be observed for mutations
    const targetNode = document.querySelector("body");

    // Start observing the target node for configured mutations
    _observer.observe(targetNode, this._mutationConfig);
  },

  _executeCheck(mutation) {
    let mutationTarget = mutation.target;

    let type = mutation.type;
    let attributeName = type === "attributes" ? mutation.attributeName : false;

    let funcs = attributeName
      ? delegate[type + ":" + attributeName]
      : delegate[type];

    if (funcs !== undefined) {
      funcs.forEach((funcObj) => {
        const func = funcObj.func,
          target = funcObj.target,
          nodes =
            mutationTarget.nodeType === 1
              ? mutationTarget.querySelectorAll(target)
              : [];

        var isMutation = false;
        var existsInMutation = false;

        // check to see if the element itself is the
        // mutation or if the element exists as a child
        // of the mutation
        if (mutationTarget.nodeType === 1 && mutationTarget.matches(target)) {
          isMutation = true;
        }

        if (!isMutation) {
          existsInMutation = nodes.length > 0 ? true : false;
        }

        if (isMutation) {
          func(mutationTarget, mutation);
        } else if (existsInMutation) {
          nodes.forEach(function (node) {
            func(node, mutation);
          });
        }
      });
    }
  },

  _enableEventDelegation() {
    for (var event in this.delegate) {
      // if it is a mutation, then we don't need to register an event with the document
      // because mutations are handled below by our mutationObserver
      if (!this._isValidMutation(event)) {
        // then add a new event listener for that event
        document.addEventListener(event, this._eventHandler.bind(this), false);
      } else if (!this._observingMutations) {
        // then we need to start observing mutations
        this._observeMutations();

        // set the _observingMutations bool to true
        this._observingMutations = true;
      }
    }
  },

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

    // Check if the template has an "if" property and if it's false or undefined, return null
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
      this._getNamespace(tagName),
      tagName
    );

    // Pull out the pipe for this element to pass along
    const pipe = template.pipe;

    // Process each key/value pair in the template
    Object.keys(template).forEach((key) => {
      let value = template[key];

      if (this._eventTypes.includes(key)) {
        this._addEventDelegate(element, key, value);
      } else {
        if (this._isStringifiedFunction(value)) {
          value = this._parseStringifiedFunction(value);
        }

        // bandle binding stuff
        let binding = template.binding;

        // if (typeof value === "function" && !binding) {
        //   // if binding is undefined, then assume the first parameter in the function is the binding

        //   // get the function parameters
        //   const funcString = value.toString();
        //   const params = funcString.substring(
        //     funcString.indexOf("(") + 1,
        //     funcString.indexOf(")")
        //   );

        //   // get the first parameter
        //   binding = params.split(",")[0].trim();
        // }

        if (typeof value === "function") {
          // if the binding is undefined, we need to alert the user and continue the render
          if (!binding) {
            console.error(
              `No binding found for function value: ${value.toString()}`
            );
          } else {
            this._processFunctionValue(
              element,
              key,
              value,
              pipe,
              binding,
              depth
            );
          }
        } else if (value !== null) {
          this._setElementAttribute(element, key, value, depth);
        }
      }
    });

    // Handle server-side rendering
    if (isServer && depth === 0) {
      return this._handleServerSideRendering(element);
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
  },

  /**
   * Gets the namespace for the specified tag name.
   * @param {string} tagName - The tag name to get the namespace for.
   * @returns {string} The namespace for the specified tag name.
   */
  _getNamespace(tagName) {
    const namespaces = {
      svg: "http://www.w3.org/2000/svg",
      math: "http://www.w3.org/1998/Math/MathML",
      xlink: "http://www.w3.org/1999/xlink",
      xml: "http://www.w3.org/XML/1998/namespace",
      xmlns: "http://www.w3.org/2000/xmlns/",
      default: "http://www.w3.org/1999/xhtml",
    };
    return namespaces[tagName] || namespaces.default;
  },

  /**
   * Checks if the specified string is a stringified function.
   * @param {string} str - The string to check.
   * @returns {boolean} True if the string is a stringified function, false otherwise.
   */
  _isStringifiedFunction(str) {
    if (typeof str !== "string") {
      return false;
    }
    const functionPattern = /^\s*(function\s*\(|\(\s*[^\)]*\)\s*=>)/;
    return functionPattern.test(str);
  },

  /**
   * Parses a stringified function into a function.
   * @param {string} str - The stringified function to parse.
   * @returns {Function} The parsed function.
   */
  _parseStringifiedFunction(str) {
    if (this._isStringifiedFunction(str)) {
      return new Function(`return (${str})`)();
    }
    throw new Error("Invalid stringified function");
  },

  /**
   * Processes a function value in the template.
   * @param {Element} element - The element to process the function value for.
   * @param {string} key - The key of the function value.
   * @param {Function} value - The function value to process.
   * @param {number} depth - The depth of the rendering.
   * @returns {void}
   */
  _processFunctionValue(element, property, func, pipe, binding, depth) {
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
        handlerElement = this._generateUniqueId();

        // give the handlerId to the element
        element._setAttribute("data-handler-id", handlerElement);
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

    if (!this.handlers[binding]) {
      this.handlers[binding] = [];
    }

    this.handlers[binding].push({
      element: handlerElement,
      func,
      property,
      pipe,
    });

    const result = preservedFunc(this.get(binding), e, clientPipe);

    if (result !== null) {
      this._setElementAttribute(element, property, result, depth);
    }
  },

  /**
   * Handles server-side rendering of the template.
   * @param {Element} element - The element to render.
   * @returns {string} The rendered HTML
   */
  _handleServerSideRendering(element) {
    if (element.tagName === "HTML") {
      const script = document.createElement("script");
      script.textContent = `
        const Objekt = (await import("${
          process.env.NODE_ENV === "production" ? process.env.CDN_BASE_URL : ""
        }/dist/premmio/objekt/objekt.js")).default;
        
        Objekt.init();
        window.Objekt = Objekt;

        Objekt.mutationObserver = new MutationObserver(Objekt._mutationCallback);

        const parsedData = JSON.parse("${JSON.stringify(this.data)
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r")}");
          
        const parsedEndpoints = JSON.parse("${JSON.stringify(this.endpoints)
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r")}");
          
        Objekt.handlers = JSON.parse("${JSON.stringify(this.handlers)
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r")}");
        
        // Main function to initialize the app
        async function initializeObjekt() {        
          Objekt.endpoints = parsedEndpoints;

          Object.keys(Objekt.endpoints).forEach(hook => {
            if (!parsedData[hook]) {
              Objekt._syncWithServer(hook, {sendData: false});
            }
          });

          Objekt.initializingData = true;
          Object.keys(parsedData).forEach(key => {
            Objekt.data[key] = parsedData[key];
          });
          Objekt.initializingData = false;

          // check to see if we have any endpoints with no corresponding data
          // and retrieve the data
  
          const elements = document.querySelectorAll("[data-binding]");

          // update handlers to their elements
          for(const binding in Objekt.handlers) {
            const handlers = Objekt.handlers[binding];

            handlers.forEach((handler) => {
              const elementId = handler.element;

              
              if(typeof elementId === "string") {
                handler.element = document.querySelector("[data-handler-id=" + elementId + "]");
              }
            });
          }

          // elements.forEach((element) => {
          //   const binding = element.getAttribute("data-binding");

          //   if (!Objekt.handlers[binding]) {
          //     Objekt.handlers[binding] = [];
          //   }
          //   const hyphenToCamelCase = (str) => str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
          //   Array.from(element.attributes).forEach((attr) => {
          //     if (attr.name.startsWith("data-bind-to-")) {
          //       let property = attr.name.slice("data-bind-to-".length);
          //       if (!property.startsWith("data-")) {
          //         property = hyphenToCamelCase(property);
          //       }
          //       try {
          //         const func = new Function("return " + attr.value)();
          //         if (typeof func === "function") {
          //           Objekt.handlers[binding].push({ element, property, func });
          //         }
          //       } catch (e) {
          //         // Ignore attributes that are not functions
          //       }
          //     }
          //   });
          // });

          const delegateElements = document.querySelectorAll("[data-event-delegates]");

          delegateElements.forEach((element) => {
            const eventDelegates = JSON.parse(element.dataset.eventDelegates);
            eventDelegates.forEach(({ event, func }) => {
              // turn the func from a string back into an anonymous function
              const restoredFunc = new Function('Objekt', \`return \${func}\`)(Objekt);
              Objekt._addEventDelegate(element, event, restoredFunc);
            });
          });

          Objekt._enableEventDelegation();
        }
        
        // Call the main initialization function
        initializeObjekt();
      `;

      script._setAttribute("type", "module");
      script._setAttribute("defer", true);

      const body = element.querySelector("body");
      const scripts = body.querySelectorAll("script");
      if (scripts.length > 0) {
        body.insertBefore(script, scripts[0]);
      } else {
        body.appendChild(script);
      }
    }

    return `<!DOCTYPE html>${element.outerHTML}`;
  },

  /**
   * Clears the children of an element.
   * @param {Element} element - The element to clear the children of.
   * @returns {void}
   */
  _clearChildren(element) {
    // we need to check this.handlers for any reference to any of the children that are being removed
    // and remove their handlers
    // get all the children
    const children = element.childNodes,
      handlers = this.handlers;

    // the handlers contain a reference to the element in their element property,
    // so we just need to match that element to the element that is being removed
    Array.from(children).forEach((child) => {
      for (let key in handlers) {
        handlers[key] = handlers[key].filter((bind) => bind.element !== child);
      }

      // then delete the child
      element.removeChild(child);
    });
  },

  destroy(binding) {
    const keys = binding.split(/[\.\[\]]/).filter(Boolean),
      hook = keys[0];

    // Delete the data at the binding
    const deleteData = (target, index) => {
      if (index === keys.length - 1) {
        delete target[keys[index]];
      } else {
        deleteData(target[keys[index]], index + 1);
      }
    };

    if (this.data[hook]) {
      deleteData(this.data, 0);
    }

    // Remove any elements bound to that binding
    if (this.handlers[binding]) {
      this.handlers[binding].forEach((bind) => {
        if (bind.element && bind.element.parentNode) {
          bind.element.parentNode.removeChild(bind.element);
        }
      });
    }

    // Remove any handlers attached to that binding
    delete this.handlers[binding];
  },
};
