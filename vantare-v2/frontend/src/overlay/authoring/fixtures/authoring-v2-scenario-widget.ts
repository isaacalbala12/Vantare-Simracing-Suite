import type { DesignSystemId, WidgetInstanceV3, WidgetType } from "../../core/profile-document";
import { widgetTypeRegistry } from "../../core/widget-registry";
import { applyWidgetDesign } from "../../core/widget-design";
import { getOfficialDesign } from "../../design-systems/official-designs";
import { parseRelativeContent, updateRelativeFilters } from "../../widget-types/relative/relative-content";
import { AUTHORING_V2_VARIANTS, type AuthoringV2Variant } from "./authoring-v2-scenario-fixture";

// Widget de autoría para el escenario V2 puro (C2b6b): solo forma, cero
// telemetría. Construye desde el registro productivo, aplica el diseño
// oficial y sus dimensiones, y preserva los ajustes de forma de Parity.
export function buildAuthoringV2ScenarioWidget(input: {
  widget: WidgetType;
  system: DesignSystemId;
  variant: AuthoringV2Variant;
  design?: { designId: string; width: number; height: number };
}): WidgetInstanceV3 {
  if (!AUTHORING_V2_VARIANTS.includes(input.variant)) {
    throw new Error(
      `authoring-v2-scenario-widget: variante no soportada ${JSON.stringify(input.variant)}`,
    );
  }
  const definition = widgetTypeRegistry.get(input.widget);
  let widget = definition.createDefault(`${input.widget}-harness`);
  widget.visual = { ...widget.visual, systemId: input.system };

  if (input.design) {
    const design = getOfficialDesign(input.design.designId);
    if (!design) {
      throw new Error(`official Crystal design not registered: ${input.design.designId}`);
    }
    widget = applyWidgetDesign(widget, design, "1970-01-01T00:00:00.000Z");
  }
  if (input.widget === "broadcast-tower") {
    widget.content = { ...widget.content as Record<string, unknown>, rowCount: 10 };
  }
  if (input.widget === "multiclass-relative") {
    widget.content = { ...widget.content as Record<string, unknown>, rowCount: 4 };
  }
  if (input.widget === "standings" && input.variant === "standings-multiclass") {
    const content = widget.content as Record<string, unknown>;
    const columns = Array.isArray(content.columns)
      ? (content.columns as Record<string, unknown>[]).map((column) =>
          column.metricId === "bestLap" ? { ...column, enabled: true } : column,
        )
      : content.columns;
    widget.content = { ...content, classScope: "all-classes", columns };
  }
  if (
    input.widget === "standings" &&
    (input.variant === "standings-minimal" || input.variant === "standings-all-columns")
  ) {
    const content = widget.content as Record<string, unknown>;
    const columns = Array.isArray(content.columns)
      ? (content.columns as Record<string, unknown>[]).map((column) => ({
          ...column,
          enabled:
            input.variant === "standings-all-columns" ||
            column.metricId === "position" ||
            column.metricId === "driverName",
        }))
      : content.columns;
    widget.content = { ...content, columns };
  }
  widget.layout = { ...widget.layout, x: 120, y: 96, zIndex: 1 };
  if (input.design) {
    widget.layout = { ...widget.layout, w: input.design.width, h: input.design.height };
  }

  if (input.widget === "relative" && input.variant === "relative-fill") {
    const content = parseRelativeContent(widget.content);
    widget.content = updateRelativeFilters(content, { rowHeightMode: "fill" });
    widget.layout = { ...widget.layout, h: Math.max(widget.layout.h, 320) };
  }

  return widget;
}
