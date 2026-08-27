import type { RaceSeries, Recurrence } from "../../calendar/calendar-types";

export type SchedulePreviewSeries = {
  id: string;
  name: string;
  tier: string;
  eventKind?: string;
  format?: string;
  licenseLabel: string;
  track: string;
  classes: string[];
  raceMin: number;
  eventDurationMin: number;
  cadence: string;
  recurrence: Recurrence;
  setup: string;
  startOffsetMinute?: number;
  splits: number;
  assists: string;
  tyreWarmers: boolean;
  tyres: number;
  timeScale?: number;
  veLimit?: number;
  safetyRating?: string;
  fairShare?: boolean;
  forbiddenBadges?: string[];
  inGameStartTime?: string;
  noteCount: number;
};

export type SchedulePreview = {
  validFrom: string;
  validUntil: string;
  seriesCount: number;
  sourceNotesCount: number;
  series: SchedulePreviewSeries[];
};

export type ScheduleCandidate = {
  messageId: string;
  sourceHash: string;
  guildId: string;
  channelId: string;
  authorId?: string;
  webhookId?: string;
  sourceText: string;
  receivedAt: string;
};

export type ScheduleDiff = {
  added: string[];
  removed: string[];
  changed: string[];
};

export function scheduleDiff(
  preview: SchedulePreview | null,
  current: RaceSeries[] | undefined,
): ScheduleDiff {
  if (!preview) return { added: [], removed: [], changed: [] };
  const currentById = new Map((current ?? []).map((series) => [series.id, series]));
  const previewById = new Map(preview.series.map((series) => [series.id, series]));
  const added: string[] = [];
  const changed: string[] = [];

  for (const series of preview.series) {
    const previous = currentById.get(series.id);
    if (!previous) {
      added.push(series.name);
      continue;
    }
    const currentClasses = (previous.classes ?? []).map((classInfo) =>
      classInfo.qualifier ? `${classInfo.name} (${classInfo.qualifier})` : classInfo.name,
    );
    if (
      previous.name !== series.name ||
      previous.tier !== series.tier ||
      (previous.eventKind ?? "") !== (series.eventKind ?? "") ||
      (previous.format ?? "") !== (series.format ?? "") ||
      previous.licenseLabel !== series.licenseLabel ||
      previous.track !== series.track ||
      (previous.raceDurationMin ?? previous.durationMin) !== series.raceMin ||
      (previous.eventDurationMin ?? (previous.raceDurationMin ?? previous.durationMin) + 11) !==
        series.eventDurationMin ||
      previous.setup !== series.setup ||
      (previous.startOffsetMinute ?? 0) !== (series.startOffsetMinute ?? 0) ||
      previous.splits !== series.splits ||
      previous.assists !== series.assists ||
      previous.tyreWarmers !== series.tyreWarmers ||
      previous.tyres !== series.tyres ||
      (previous.timeScale ?? 0) !== (series.timeScale ?? 0) ||
      (previous.veLimit ?? 0) !== (series.veLimit ?? 0) ||
      (previous.safetyRating ?? "") !== (series.safetyRating ?? "") ||
      (previous.fairShare ?? false) !== (series.fairShare ?? false) ||
      JSON.stringify(previous.forbiddenBadges ?? []) !== JSON.stringify(series.forbiddenBadges ?? []) ||
      (previous.inGameStartTime ?? "") !== (series.inGameStartTime ?? "") ||
      (previous.notes?.length ?? 0) !== series.noteCount ||
      JSON.stringify(currentClasses) !== JSON.stringify(series.classes) ||
      JSON.stringify(previous.recurrence) !== JSON.stringify(series.recurrence)
    ) {
      changed.push(series.name);
    }
  }

  const removed: string[] = [];
  for (const series of current ?? []) {
    if (!previewById.has(series.id)) removed.push(series.name);
  }
  return { added, removed, changed };
}
