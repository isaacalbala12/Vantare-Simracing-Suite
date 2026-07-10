export type SubNavSectionId =
  | "diseno"
  | "apariencia"
  | "columnas"
  | "slots"
  | "colores"
  | "visibilidad"
  | "general";

export type AccentColor = "" | "blue" | "purple" | "amber" | "cyan";

export type SubNavSection = {
  id: SubNavSectionId;
  title: string;
  label: string;
  accent: AccentColor;
};

const COLUMN_TYPES = new Set(["relative", "standings"]);

const ALL_SECTIONS: Record<SubNavSectionId, SubNavSection> = {
  diseno: { id: "diseno", title: "Diseño", label: "Diseño", accent: "" },
  apariencia: { id: "apariencia", title: "Apariencia", label: "Apariencia", accent: "purple" },
  columnas: { id: "columnas", title: "Columnas", label: "Columnas", accent: "blue" },
  slots: { id: "slots", title: "Slots", label: "Slots", accent: "blue" },
  colores: { id: "colores", title: "Colores", label: "Colores", accent: "amber" },
  visibilidad: { id: "visibilidad", title: "Visibilidad", label: "Visibilidad", accent: "amber" },
  general: { id: "general", title: "General", label: "General", accent: "cyan" },
};

export function getSectionsForWidget(widgetType: string): SubNavSection[] {
  const hasColumns = COLUMN_TYPES.has(widgetType);
  const isPedals = widgetType === "pedals";

  // Determine the middle section: column types show Columnas,
  // pedals shows Colores (replacing Slots), others show Slots
  let middle: SubNavSectionId | null;
  if (hasColumns) {
    middle = "columnas";
  } else if (isPedals) {
    middle = "colores";
  } else {
    middle = "slots";
  }

  const sections: (SubNavSectionId | null)[] = [
    "diseno",
    "apariencia",
    middle,
    "visibilidad",
    "general",
  ];

  return sections
    .filter((id): id is SubNavSectionId => id !== null)
    .map((id) => ALL_SECTIONS[id]);
}
