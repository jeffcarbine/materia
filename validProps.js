// TODO(v3): Keep this bridge while v2 consumers adopt `materiajs/validProps`;
// decide later whether this module or `attributes.js` is the canonical home.
export {
  validAttributes,
  validAttributes as validHTMLAttributes,
  validEvents,
  validMutations,
  validMateriaProps,
  validV2MateriaProps,
  stringDOMProperties,
  booleanDOMProperties,
  numberDOMProperties,
  objectDOMProperties,
  arrayDOMProperties,
  validDOMProperties,
} from "materiajs/attributes";
