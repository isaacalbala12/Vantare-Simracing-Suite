import type { WidgetConfig } from "./profile";

export const WIDGET_TYPES = [
  "delta",
  "relative",
  "standings",
  "telemetry",
  "telemetry-vertical",
  "pedals",
  "engineer-notifications",
  "broadcast-tower",
  "multiclass-relative",
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

export const DEFAULT_WIDGET_SIZES: Record<WidgetType, { w: number; h: number; updateHz: number }> = {
  delta: { w: 400, h: 48, updateHz: 30 },
  relative: { w: 320, h: 280, updateHz: 15 },
  standings: { w: 340, h: 420, updateHz: 15 },
  telemetry: { w: 420, h: 120, updateHz: 30 },
  "telemetry-vertical": { w: 140, h: 360, updateHz: 30 },
  pedals: { w: 90, h: 100, updateHz: 30 },
  "engineer-notifications": { w: 300, h: 80, updateHz: 15 },
  "broadcast-tower": { w: 780, h: 50, updateHz: 15 },
  "multiclass-relative": { w: 520, h: 150, updateHz: 15 },
};

/**
 * Crea un widget con valores por defecto óptimos según su tipo,
 * garantizando un ID único dentro del conjunto de widgets existentes.
 */
export function createDefaultWidget(type: string, existingWidgets: WidgetConfig[] = []): WidgetConfig {
  const defaults = DEFAULT_WIDGET_SIZES[type as WidgetType] ?? { w: 200, h: 100, updateHz: 30 };

  let id = type;
  let counter = 1;
  while (existingWidgets.some((w) => w.id === id)) {
    counter++;
    id = `${type}-${counter}`;
  }

  return {
    id,
    type,
    enabled: true,
    updateHz: defaults.updateHz,
    position: {
      x: 40,
      y: 40,
      w: defaults.w,
      h: defaults.h,
    },
  };
}
