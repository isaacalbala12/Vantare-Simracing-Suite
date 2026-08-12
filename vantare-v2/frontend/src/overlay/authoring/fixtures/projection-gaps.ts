import type { WidgetType } from "../../core/profile-document";

/**
 * Fields a widget puts on screen that the live Overlay Projection does not
 * deliver. The mock supplies them, so the Workshop shows something a real
 * session never will.
 *
 * This is not a nice-to-have caveat: judging a design against data that will
 * not exist is how a layout ships with a gap in it. Kept honest by a test that
 * reads UNSUPPORTED_FIELDS from the projection adapter itself.
 */
export type ProjectionGap = {
  /** Path exactly as the adapter declares it. */
  field: string;
  /** What the user sees instead, once the field is missing. */
  consequence: string;
};

const CAR_NUMBER_GAP: ProjectionGap = {
  field: "scoring[].driverNumber",
  consequence: "los dorsales quedan vacíos: cada fila muestra solo la almohadilla",
};

export const WIDGET_PROJECTION_GAPS: Partial<Record<WidgetType, readonly ProjectionGap[]>> = {
  standings: [
    CAR_NUMBER_GAP,
    {
      field: "scoring[].tireCompound",
      consequence: "el disco de compuesto tras la parada no llega a aparecer",
    },
  ],
  relative: [CAR_NUMBER_GAP],
};

export function projectionGapsFor(widget: WidgetType): readonly ProjectionGap[] {
  return WIDGET_PROJECTION_GAPS[widget] ?? [];
}
