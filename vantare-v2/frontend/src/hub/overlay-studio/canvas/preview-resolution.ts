import type { LayoutViewport } from "../../../overlay/core/layout-viewport";

export type LayoutViewportPreset = LayoutViewport & {
  id: string;
  label: string;
};

export const LAYOUT_VIEWPORT_PRESETS: readonly LayoutViewportPreset[] = [
  { id: "1280x720", label: "1280 × 720", width: 1280, height: 720 },
  { id: "1920x1080", label: "1920 × 1080", width: 1920, height: 1080 },
  { id: "2560x1440", label: "2560 × 1440", width: 2560, height: 1440 },
  { id: "3840x2160", label: "3840 × 2160", width: 3840, height: 2160 },
  { id: "2560x1080", label: "2560 × 1080", width: 2560, height: 1080 },
  { id: "3440x1440", label: "3440 × 1440", width: 3440, height: 1440 },
  { id: "5120x2160", label: "5120 × 2160", width: 5120, height: 2160 },
  { id: "3840x1080", label: "3840 × 1080", width: 3840, height: 1080 },
  { id: "5120x1440", label: "5120 × 1440", width: 5120, height: 1440 },
];

export function getLayoutViewportPreset(id: string): LayoutViewportPreset | undefined {
  return LAYOUT_VIEWPORT_PRESETS.find((preset) => preset.id === id);
}

export function findLayoutViewportPreset(
  layoutViewport: LayoutViewport,
): LayoutViewportPreset | undefined {
  return LAYOUT_VIEWPORT_PRESETS.find(
    (preset) =>
      preset.width === layoutViewport.width && preset.height === layoutViewport.height,
  );
}
