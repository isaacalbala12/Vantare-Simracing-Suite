export const TRACK_MAP_ENDURANCE_TEMPLATE_IDS = ["track-map-outline"] as const;

export type TrackMapEnduranceTemplateId = (typeof TRACK_MAP_ENDURANCE_TEMPLATE_IDS)[number];
export type TrackMapEnduranceTemplateDiagnostic = "unknown-template";

export type TrackMapEnduranceSettings = {
  templateId: TrackMapEnduranceTemplateId;
  showTrackLabel: boolean;
  templateDiagnostic?: TrackMapEnduranceTemplateDiagnostic;
};

function isTemplateId(value: unknown): value is TrackMapEnduranceTemplateId {
  return (
    typeof value === "string" &&
    (TRACK_MAP_ENDURANCE_TEMPLATE_IDS as readonly string[]).includes(value)
  );
}

export function parseTrackMapEnduranceSettings(input: unknown): TrackMapEnduranceSettings {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const showTrackLabel = source.showTrackLabel !== false;
  if (source.templateId === undefined) {
    return { templateId: "track-map-outline", showTrackLabel };
  }
  if (isTemplateId(source.templateId)) {
    return { templateId: source.templateId, showTrackLabel };
  }
  return { templateId: "track-map-outline", showTrackLabel, templateDiagnostic: "unknown-template" };
}

export const TRACK_MAP_ENDURANCE_DEFAULT_SETTINGS = {
  templateId: "track-map-outline" as TrackMapEnduranceTemplateId,
  showTrackLabel: true,
};

export function normalizeTrackMapEnduranceSettings(input: unknown): Record<string, unknown> {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const parsed = parseTrackMapEnduranceSettings(source);
  return {
    ...TRACK_MAP_ENDURANCE_DEFAULT_SETTINGS,
    ...source,
    templateId: parsed.templateId,
    showTrackLabel: parsed.showTrackLabel,
  };
}
