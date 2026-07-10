import type { InspectorSectionId } from "../../../overlay/core/widget-definition";

export type InspectorSectionAccent = "default" | "purple" | "blue" | "amber" | "cyan";

export const INSPECTOR_SECTION_DISPLAY_LABELS: Record<InspectorSectionId, string> = {
  design: "Diseño",
  appearance: "Apariencia",
  content: "Contenido",
  behavior: "Comportamiento",
  layout: "Layout",
  actions: "Acciones",
};

export const INSPECTOR_SECTION_ACCENTS: Record<InspectorSectionId, InspectorSectionAccent> = {
  design: "default",
  appearance: "purple",
  content: "blue",
  behavior: "amber",
  layout: "blue",
  actions: "cyan",
};

export function resolveInspectorSectionTitle(
  sectionId: InspectorSectionId,
  labelKey: string,
): string {
  if (labelKey === "overlay.studio.inspector.sections.unsupported") {
    return "No compatible";
  }
  return INSPECTOR_SECTION_DISPLAY_LABELS[sectionId];
}