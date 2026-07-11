/**
 * Canonical preview envelope sizes per widget type for visual harnesses.
 *
 * All official designs of the same widget type must use the same preview
 * bounding size so parity screenshots stay comparable when switching designs.
 */

export type WidgetPreviewContractSize = {
  width: number;
  height: number;
  mode: "contract";
};

const WIDGET_PREVIEW_SIZES: Record<string, WidgetPreviewContractSize> = {
  standings: { width: 420, height: 620, mode: "contract" },
  relative: { width: 420, height: 260, mode: "contract" },
  delta: { width: 420, height: 140, mode: "contract" },
  pedals: { width: 420, height: 120, mode: "contract" },
};

const FALLBACK_SIZE: WidgetPreviewContractSize = { width: 320, height: 180, mode: "contract" };

export function getWidgetPreviewContractSize(widgetType: string): WidgetPreviewContractSize {
  return WIDGET_PREVIEW_SIZES[widgetType] ?? FALLBACK_SIZE;
}