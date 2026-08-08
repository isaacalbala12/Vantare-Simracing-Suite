export type StudioPreviewResolutionId =
  | "auto"
  | "1280x720"
  | "1920x1080"
  | "2560x1440"
  | "3840x2160"
  | "2560x1080"
  | "3440x1440"
  | "5120x2160"
  | "3840x1080"
  | "5120x1440";

export type StudioPreviewResolutionOption = {
  id: Exclude<StudioPreviewResolutionId, "auto">;
  label: string;
  width: number;
  height: number;
};

export const STUDIO_PREVIEW_RESOLUTION_OPTIONS: readonly StudioPreviewResolutionOption[] = [
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

export type PreviewSize = { width: number; height: number };

export function resolveStudioPreviewSize(
  resolution: StudioPreviewResolutionId | undefined,
  detectedSize: PreviewSize,
): PreviewSize {
  if (!resolution || resolution === "auto") {
    return detectedSize;
  }

  const option = STUDIO_PREVIEW_RESOLUTION_OPTIONS.find((candidate) => candidate.id === resolution);
  return option ? { width: option.width, height: option.height } : detectedSize;
}
