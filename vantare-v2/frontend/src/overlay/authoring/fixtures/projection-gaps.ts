import type { WidgetType } from "../../core/profile-document";

/**
 * Fields a widget puts on screen that the canonical OverlayFrame V2 does not
 * currently supply to its product ViewModel. Workshop keeps the absence
 * visible instead of inventing a value.
 *
 * This is not a nice-to-have caveat: judging a design against data that will
 * not exist is how a layout ships with a gap in it. Product-path tests freeze
 * both this declaration and the placeholders emitted by the V2 ViewModels.
 */
export type ProjectionGap = {
  /** Path in the widget's V2 presentation model. */
  field: string;
  /** What the user sees instead, once the field is missing. */
  consequence: string;
};

const CAR_NUMBER_GAP: ProjectionGap = {
  field: "rows[].driverNumber",
  consequence: "los dorsales quedan vacíos: cada fila muestra solo la almohadilla",
};

export const WIDGET_PROJECTION_GAPS: Partial<Record<WidgetType, readonly ProjectionGap[]>> = {
  standings: [
    CAR_NUMBER_GAP,
    {
      field: "rows[].tireCompound",
      consequence: "el disco de compuesto tras la parada no llega a aparecer",
    },
  ],
  relative: [CAR_NUMBER_GAP],
  delta: [
    {
      field: "bestLapText",
      consequence: "la referencia de mejor vuelta no cambia en el widget Delta",
    },
  ],
};

export function projectionGapsFor(widget: WidgetType): readonly ProjectionGap[] {
  return WIDGET_PROJECTION_GAPS[widget] ?? [];
}
