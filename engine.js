// Modules
import objekt from "./objekt.js";

/**
 * Handles an array value in the appData.
 * @param {string} key - The key of the appData entry.
 * @param {Array} value - The array value to handle.
 */
const handleArray = (key, value) => {
  objekt.setData(key, value[0], value[1]);
};

/**
 * Handles a string value in the appData.
 * @param {string} key - The key of the appData entry.
 * @param {string} value - The string value to handle.
 */
const handleString = (key, value) => {
  objekt.endpoints[key] = value;
};

/**
 * Handles a function value in the appData.
 * @param {string} key - The key of the appData entry.
 * @param {Function} func - The function to handle.
 * @returns {Promise<void>}
 */
const handleFunction = async (key, func) => {
  const data = await func();
  if (Array.isArray(data)) {
    objekt.setData(key, data[0], data[1]);
  } else {
    objekt.setData(key, data);
  }
};

/**
 * Handles an object value in the appData.
 * @param {string} key - The key of the appData entry.
 * @param {Object} value - The object value to handle.
 */
const handleObject = (key, value) => {
  objekt.setData(key, value);
};

/**
 * Handles the appData by iterating over its entries and calling the appropriate handler function.
 * @param {Object} appData - The appData object to handle.
 * @returns {Promise<void>}
 */
const handleAppData = async (appData) => {
  for (const key in appData) {
    if (appData.hasOwnProperty(key)) {
      const value = appData[key];
      if (Array.isArray(value)) {
        handleArray(key, value);
      } else if (typeof value === "string") {
        handleString(key, value);
      } else if (typeof value === "function") {
        await handleFunction(key, value);
      } else if (typeof value === "object") {
        handleObject(key, value);
      } else {
        console.error(`${key} must be a string, function, or object.`);
      }
    }
  }
};

const viewCache = new Map();
const registeredRoutes = new Set();

export default async (app) => {
  app.engine("html.js", (filePath, data, callback) => {
    if (viewCache.has(filePath)) {
      const cachedView = viewCache.get(filePath);
      renderView(cachedView, data, callback);
    } else {
      import(filePath)
        .then(async (view) => {
          viewCache.set(filePath, view);

          if (typeof view.config === "function") {
            // Register routes only once per view
            const config = view.config(data);

            if (config && typeof config === "object") {
              for (const key in config) {
                const { route } = config[key];

                if (route) {
                  if (typeof route === "function") {
                    if (!registeredRoutes.has(key)) {
                      route(app);
                      registeredRoutes.add(key);
                    } else {
                      console.error(`Route for ${key} already registered.`);
                    }
                  } else {
                    console.error(
                      `Error in routes: Expected function for key "${key}", but got ${typeof route}.`
                    );
                  }
                }
              }
            } else {
              console.error(
                `Error in config: Expected an object, but got ${typeof config}.`
              );
            }
          }

          renderView(view, data, callback);
        })
        .catch((err) => {
          console.error(err);
          callback(err);
        });
    }
  });

  app.set("view engine", "html.js");
};

const renderView = async (view, data, callback) => {
  objekt.init();

  if (typeof view.config === "function") {
    const config = view.config(data);
    if (config && typeof config === "object") {
      for (const key in config) {
        const { appData, endpoint } = config[key];
        await handleAppData({ [key]: appData });

        if (endpoint) {
          if (typeof endpoint === "string") {
            objekt.endpoints[key] = endpoint;
          } else {
            console.error(
              `Error in endpoints: Expected string for key "${key}", but got ${typeof endpoint}.`
            );
          }
        }
      }
    } else {
      console.error(
        `Error in appData: Expected an object, but got ${typeof config}.`
      );
    }
  }

  const html = objekt.render(view.default(data));

  callback(null, html);
};
