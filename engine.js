import path from "path";
import { fileURLToPath } from "url";

// Get the directory name of the current module file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Modules
import MateriaJS from "materiajs";

/**
 * Handles a function value in the data.
 * @param {MateriaJS} Materia - The Materia instance.
 * @param {string} key - The key of the data entry.
 * @param {Function} func - The function to handle.
 * @returns {Promise<void>}
 */
const handleFunction = async (Materia, key, func) => {
  const data = await func();

  Materia.set(key, data);
};

/**
 * Handles the data by iterating over its entries and calling the appropriate handler function.
 * @param {MateriaJS} Materia - The Materia instance.
 * @param {Object} data - The data object to handle.
 * @returns {Promise<void>}
 */
const handledata = async (Materia, key, data) => {
  const value = data;

  if (typeof value === "function") {
    await handleFunction(Materia, key, value);
  } else {
    Materia.set(key, value);
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

          // if (typeof view.config === "function") {
          //   // Register routes only once per view
          //   const config = view.config(data);

          //   if (config && typeof config === "object") {
          //     for (const key in config) {
          //       const { route } = config[key];

          //       if (route) {
          //         if (typeof route === "function") {
          //           if (!registeredRoutes.has(key)) {
          //             route(app);
          //             registeredRoutes.add(key);
          //           } else {
          //             console.error(`Route for ${key} already registered.`);
          //           }
          //         } else {
          //           console.error(
          //             `Error in routes: Expected function for key "${key}", but got ${typeof route}.`
          //           );
          //         }
          //       }
          //     }
          //   } else {
          //     console.error(
          //       `Error in config: Expected an object, but got ${typeof config}.`
          //     );
          //   }
          // }

          renderView(view, data, callback);
        })
        .catch((err) => {
          console.error(err);
          callback(err);
        });
    }
  });

  app.set("view engine", "html.js");

  // make the full materiajs file importable client-side via /materia.js
  app.get("/materia.js", (req, res) => {
    res.sendFile(path.join(__dirname, "materia.js"));
  });
  app.get("/materiajs/elements", (req, res) => {
    res.sendFile(path.join(__dirname, "elements.html.js"));
  });
};

const renderView = async (view, _data, callback) => {
  const Materia = new MateriaJS();

  const config = view.data;

  if (config && typeof config === "object") {
    for (const key in config) {
      const data =
        typeof config[key] === "function"
          ? await config[key](_data)
          : config[key];

      await handledata(Materia, key, data);

      // if (endpoint) {
      //   if (typeof endpoint === "string") {
      //     Materia.setEndpoint(key, endpoint);
      //   } else {
      //     console.error(
      //       `Error in endpoints: Expected string for key "${key}", but got ${typeof endpoint}.`
      //     );
      //   }
      // }
    }
  } else {
    console.error(
      `Error in data: Expected an object, but got ${typeof config}.`
    );
  }

  const html = Materia.render(view.default(_data));

  callback(null, html);
};
