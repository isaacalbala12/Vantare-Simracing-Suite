import type { DesignSystemId, WidgetInstanceV3, WidgetType } from "../../core/profile-document";
import { widgetTypeRegistry } from "../../core/widget-registry";
import { applyWidgetDesign } from "../../core/widget-design";
import { getOfficialDesign } from "../../design-systems/official-designs";
import { parseRelativeContent, updateRelativeFilters } from "../../widget-types/relative/relative-content";
import { resolveStandingsMinimumSize } from "../../widget-types/standings/standings-frame-layout";
import { EFFICIENCY_SYSTEM_ID } from "../../core/design-system-names";
import { resolveEfficiencyMulticlassHeight } from "../../design-systems/vantare-efficiency/multiclass-layout";
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

  // Explicit Functional authoring preset. Runtime profiles keep their own
  // configured columns; this only chooses which existing V2 fields to preview.
  if (input.widget === "standings" && input.system === EFFICIENCY_SYSTEM_ID && input.variant === "default") {
    const content = widget.content as Record<string, unknown>;
    const metrics = new Set(["position", "driverName", "gap", "lastLap", "pit"]);
    const columns = (content.columns as Record<string, unknown>[]).map((column) => ({ ...column, enabled: metrics.has(String(column.metricId)) }));
    widget.content = { ...content, columns, rowCount: 10 };
  }

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
    // La caja se adapta al contenido como en el relative: filas fijas y el
    // marco crece con ellas (en Eficiencia, ~27px por fila + padding).
    if (input.system === EFFICIENCY_SYSTEM_ID) {
      widget.layout = { ...widget.layout, h: resolveEfficiencyMulticlassHeight(4) };
    }
  }
  if (input.widget === "standings") {
    const content = widget.content as Record<string, unknown>;
    // La clasificación no pertenece al estudio visual. En Eficiencia las
    // tres pieles comparten la parrilla global; solo la elección explícita de
    // Multiclass activa las bandas y posiciones por clase.
    const functional = input.system === EFFICIENCY_SYSTEM_ID;
    const multiclass = input.variant === "standings-multiclass";
    const columns = input.variant === "standings-multiclass" && Array.isArray(content.columns)
      ? (content.columns as Record<string, unknown>[]).map((column) =>
          column.metricId === "bestLap" ? { ...column, enabled: true } : column,
        )
      : content.columns;
    widget.content = {
      ...content,
      classScope: functional || multiclass ? "all-classes" : "player-class",
      ...(functional ? { classificationMode: multiclass ? "multiclass" : "normal" } : {}),
      columns,
    };
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

  // En Eficiencia la fila del Standings es fija (30px): la caja del estudio se
  // encaja al tamaño intrínseco — ni filas estiradas ni hueco muerto, y las
  // columnas no se reparten el sobrante de un marco más ancho que el contenido.
  if (input.widget === "standings" && input.system === EFFICIENCY_SYSTEM_ID && !input.design) {
    const minimum = resolveStandingsMinimumSize(widget);
    widget.layout = {
      ...widget.layout,
      w: minimum?.width ?? widget.layout.w,
      h: minimum?.height ?? widget.layout.h,
    };
  }

  if (input.widget === "relative" && input.variant === "relative-fill") {
    const content = parseRelativeContent(widget.content);
    widget.content = updateRelativeFilters(content, { rowHeightMode: "fill" });
    widget.layout = { ...widget.layout, h: Math.max(widget.layout.h, 320) };
  }

  return widget;
}
