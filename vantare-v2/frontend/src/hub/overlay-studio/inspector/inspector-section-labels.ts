import type { InspectorSectionId } from "../../../overlay/core/widget-definition";

export type InspectorSectionAccent = "default" | "purple" | "blue" | "amber" | "cyan";

export const INSPECTOR_SECTION_DISPLAY_LABELS: Record<InspectorSectionId, string> = {
  design: "studio.v3.inspector.sections.design",
  appearance: "studio.v3.inspector.sections.appearance",
  content: "studio.v3.inspector.sections.content",
  behavior: "studio.v3.inspector.sections.behavior",
  layout: "studio.v3.inspector.sections.layout",
  actions: "studio.v3.inspector.sections.actions",
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
    return "studio.v3.inspector.sections.unsupported";
  }
  return INSPECTOR_SECTION_DISPLAY_LABELS[sectionId];
}
