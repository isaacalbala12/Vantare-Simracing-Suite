import { createContext, useContext, type ReactNode } from "react";

/**
 * Piel del inspector: decide con que componentes se pintan los campos de las
 * secciones reales del Studio (`DesignSection`, `BehaviorSection`,
 * `LayoutSection`, `ActionsSection` y `InspectorControlField`).
 *
 * - `v3`: controles nativos historicos del Studio V3. Es el valor por defecto,
 *   asi que con el flag Orbit apagado nada cambia.
 * - `orbit`: componentes del kit `ui/orbit` (Field, Select, Input, Toggle, Seg,
 *   Note, Button ghost). Solo lo activa `StudioOrbitInspector`.
 *
 * La piel no toca la logica ni el estado: las secciones calculan los mismos
 * handlers y solo eligen el JSX con el que los exponen.
 */
export type InspectorSkin = "v3" | "orbit";

const InspectorSkinContext = createContext<InspectorSkin>("v3");

export function InspectorSkinProvider(props: {
  skin: InspectorSkin;
  children: ReactNode;
}): React.ReactElement {
  return (
    <InspectorSkinContext.Provider value={props.skin}>
      {props.children}
    </InspectorSkinContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useInspectorSkin(): InspectorSkin {
  return useContext(InspectorSkinContext);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useIsOrbitSkin(): boolean {
  return useContext(InspectorSkinContext) === "orbit";
}
