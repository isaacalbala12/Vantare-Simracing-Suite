/**
 * Preview-only size contract for Widget Studio.
 *
 * All official designs of the same widget type must use the same
 * preview bounding size. This ensures visual parity when switching
 * between designs in Widget Studio.
 *
 * This module is PREVIEW-ONLY. It does not affect runtime OBS rendering.
 * It does NOT read or mutate widget.position / x / y / w / h.
 */

export type WidgetPreviewContractSize = {
  width: number;
  height: number;
  mode: "contract";
};

/**
 * Canonical preview envelope sizes per widget type.
 *
 * - standings: sized for 20 rows (24px each) + header/footer
 * - relative: sized for 5 rows (fill mode) + header/class bar
 * - delta: proportional, must not dominate table widgets
 * - pedals: proportional, must not dominate table widgets
 */
const WIDGET_PREVIEW_SIZES: Record<string, WidgetPreviewContractSize> = {
  standings: { width: 420, height: 620, mode: "contract" },
  relative: { width: 420, height: 260, mode: "contract" },
  delta: { width: 420, height: 140, mode: "contract" },
  pedals: { width: 420, height: 120, mode: "contract" },
};

const FALLBACK_SIZE: WidgetPreviewContractSize = { width: 320, height: 180, mode: "contract" };

/**
 * Returns the canonical preview size for a widget type.
 * Used by WidgetStudio preview/harness only.
 */
export function getWidgetPreviewContractSize(widgetType: string): WidgetPreviewContractSize {
  return WIDGET_PREVIEW_SIZES[widgetType] ?? FALLBACK_SIZE;
}
