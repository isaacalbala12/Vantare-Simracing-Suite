export type CanvasBackgroundDefinition = {
  id: string;
  labelKey: string;
  kind: "css";
  className: string;
};

export const CANVAS_BACKGROUNDS = [
  { id: "grid", labelKey: "studio.v3.canvas.background.grid", kind: "css", className: "osv3-bg-grid" },
  {
    id: "gradient",
    labelKey: "studio.v3.canvas.background.gradient",
    kind: "css",
    className: "osv3-bg-gradient",
  },
  {
    id: "solid-black",
    labelKey: "studio.v3.canvas.background.black",
    kind: "css",
    className: "osv3-bg-black",
  },
] as const satisfies readonly CanvasBackgroundDefinition[];

export type CanvasBackgroundId = (typeof CANVAS_BACKGROUNDS)[number]["id"];

const BACKGROUND_BY_ID = new Map(CANVAS_BACKGROUNDS.map((entry) => [entry.id, entry]));

export function resolveCanvasBackground(backgroundId: string): CanvasBackgroundDefinition {
  return BACKGROUND_BY_ID.get(backgroundId as CanvasBackgroundId) ?? CANVAS_BACKGROUNDS[0];
}

export const SAFE_AREA_INSET_RATIO = 0.05;

export function safeAreaInsets(canvasWidth: number, canvasHeight: number): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  return {
    top: Math.round(canvasHeight * SAFE_AREA_INSET_RATIO),
    right: Math.round(canvasWidth * SAFE_AREA_INSET_RATIO),
    bottom: Math.round(canvasHeight * SAFE_AREA_INSET_RATIO),
    left: Math.round(canvasWidth * SAFE_AREA_INSET_RATIO),
  };
}