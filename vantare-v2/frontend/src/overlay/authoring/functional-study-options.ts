export const FUNCTIONAL_STUDY_MODULES = [
  { id: "gap", label: "Diferencia" },
  { id: "bestLap", label: "Mejor vuelta" },
  { id: "lastLap", label: "Última vuelta" },
  { id: "pit", label: "Estado en boxes" },
] as const;

/** Direcciones v2 en evaluación (ISA-1120): piel de estudio que se aplica con
 * `data-study-style` sobre la estructura de un diseño oficial existente. Solo
 * viven en el Workshop; ninguna es un diseño oficial ni se persiste. */
export const FUNCTIONAL_STUDY_STYLES = [
  { id: "v2-tower", label: "Torre", designId: "standings-functional-compact" },
  { id: "v2-podium", label: "Podio", designId: "standings-functional-broadcast" },
  { id: "v2-focus", label: "Foco", designId: "standings-functional-compact" },
] as const;

export type FunctionalStudyStyleId = (typeof FUNCTIONAL_STUDY_STYLES)[number]["id"];

export const FUNCTIONAL_STUDY_STYLE_IDS = new Set<string>(
  FUNCTIONAL_STUDY_STYLES.map((style) => style.id),
);
