/**
 * Piel del inspector del Studio.
 *
 * El contexto vive en `overlay/core/inspector-skin` para que tambien lo puedan
 * leer los inspectores de contenido propios de cada tipo de widget, que son de
 * `overlay/`. Aqui se mantiene la superficie publica historica: todo el Studio
 * importa de este modulo.
 */
/* eslint-disable react-refresh/only-export-components */
export {
  InspectorSkinProvider,
  useInspectorSkin,
  useIsOrbitSkin,
  type InspectorSkin,
} from "../../../overlay/core/inspector-skin";
