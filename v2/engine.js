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

export default async (app, appProps) => {
  app.engine("html.js", (filePath, data, callback) => {
    if (viewCache.has(filePath)) {
      const cachedView = viewCache.get(filePath);
      renderView(cachedView, data, appProps, callback);
    } else {
      import(filePath)
        .then(async (view) => {
          viewCache.set(filePath, view);

          renderView(view, data, appProps, callback);
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
  app.get("/materiajs/attributes", (req, res) => {
    res.sendFile(path.join(__dirname, "attributes.js"));
  });
};

const renderView = async (view, _data, appProps = {}, callback) => {
  const Materia = new MateriaJS();

  const viewProps = view.data || view.props || {};

  const props = { ...viewProps, ...appProps };

  if (_data.user) {
    // we need to pass any user data to the viewProps
    props.user = _data.user;
  }

  // and add all of the viewProps to the _data under the materia key
  _data.materia = {};

  if (props) {
    if (typeof props === "object") {
      for (const key in props) {
        const propsData =
          typeof props[key] === "function"
            ? await props[key](_data)
            : props[key];

        await handledata(Materia, key, propsData);

        // and then set the data on the _data.materia object as well
        _data.materia[key] = propsData;
      }
    } else {
      console.error(
        `Error in data: Expected an object, but got ${typeof config}.`
      );
    }
  }

  const html = Materia.render(view.default(_data));

  callback(null, html);
};
