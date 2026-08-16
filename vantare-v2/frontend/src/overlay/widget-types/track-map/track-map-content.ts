export type TrackMapContent = {
  showTrackLabel: boolean;
};

const DEFAULTS: TrackMapContent = { showTrackLabel: true };

export function createDefaultTrackMapContent(): TrackMapContent {
  return { ...DEFAULTS };
}

export function parseTrackMapContent(input: unknown): TrackMapContent {
  if (input == null) {
    return createDefaultTrackMapContent();
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("track-map content must be an object");
  }
  const source = input as Record<string, unknown>;
  return {
    showTrackLabel:
      typeof source.showTrackLabel === "boolean"
        ? source.showTrackLabel
        : DEFAULTS.showTrackLabel,
  };
}
