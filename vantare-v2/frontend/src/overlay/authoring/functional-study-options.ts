export const FUNCTIONAL_STUDY_MODULES = [
  { id: "gap", label: "Diferencia" },
  { id: "bestLap", label: "Mejor vuelta" },
  { id: "lastLap", label: "Última vuelta" },
  { id: "pit", label: "Estado en boxes" },
] as const;

export const FUNCTIONAL_STUDY_MODULE_IDS = new Set<string>(
  FUNCTIONAL_STUDY_MODULES.map((item) => item.id),
);

/** Selección por defecto cuando la URL no declara módulos. */
export const FUNCTIONAL_STUDY_DEFAULT_MODULES: readonly string[] = ["gap", "bestLap"];

/** Dirección v2 elegida por Isaac (ISA-1120): piel de estudio que se aplica
 * con `data-study-style` sobre la estructura de un diseño oficial existente.
 * Solo vive en el Workshop; no es un diseño oficial ni se persiste. */
export const FUNCTIONAL_STUDY_STYLES = [
  { id: "v2-focus", label: "Foco", designId: "standings-functional-compact" },
] as const;

export type FunctionalStudyStyleId = (typeof FUNCTIONAL_STUDY_STYLES)[number]["id"];

export const FUNCTIONAL_STUDY_STYLE_IDS = new Set<string>(
  FUNCTIONAL_STUDY_STYLES.map((style) => style.id),
);

/** Huecos de datos del pie: vocabulario compartido de standings y relative.
 * Sin tope — la selección final la acota el usuario en Overlay Studio.
 * Cada id resuelve desde el VM; lo ausente se pinta "—". */
export const FUNCTIONAL_STUDY_SLOTS = [
  { id: "time", label: "Tiempo" },
  { id: "lap", label: "Vuelta" },
  { id: "position", label: "Posición" },
  { id: "gap", label: "Diferencia" },
  { id: "bestLap", label: "Mejor vuelta" },
  { id: "lastLap", label: "Última vuelta" },
  { id: "track", label: "Pista" },
  { id: "ambient", label: "Aire" },
  { id: "wind", label: "Viento" },
] as const;

export const FUNCTIONAL_STUDY_SLOT_IDS = new Set<string>(
  FUNCTIONAL_STUDY_SLOTS.map((slot) => slot.id),
);
