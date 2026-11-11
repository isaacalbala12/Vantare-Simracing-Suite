import type {
  CalendarHistoryView,
  CalendarView,
} from "../contract/generated/calendar";
import type { HostToUi } from "../contract/generated/contract";
import corpus from "../contract/generated/corpus/calendar.json";

// Public QA data: the same October publication and offsets as the frozen GPUI bank.
export function calendarReference(): CalendarView {
  const sample = (corpus.host as unknown as HostToUi[]).find(
    (message) =>
      message.kind === "response" &&
      message.result.method === "calendar.refresh",
  );
  if (
    sample?.kind !== "response" ||
    sample.result.method !== "calendar.refresh"
  )
    throw new Error("Calendar reference sample missing");
  const value = structuredClone(sample.result.value);
  if (!value.official)
    throw new Error("Calendar reference publication missing");
  const offsets: Record<string, number> = {
    "beginner-lmp3-fixed": 5,
    "beginner-logitech-mclaren-g-challenge-q1": 10,
    "intermediate-lmgt3-sprint": 10,
    "intermediate-elms-sprint": 15,
    "advanced-one-stint-sprint": 5,
    "advanced-elms-super-60": 25,
    "advanced-wec-xperience": 15,
  };
  for (const series of value.official.series)
    series.startOffsetMinute = offsets[series.id] ?? series.startOffsetMinute;
  value.previous = structuredClone(value.official);
  value.previous.validFrom = "2026-09-29T00:00:00Z";
  value.previous.validUntil = "2026-10-06T00:00:00Z";
  value.previous.series = value.previous.series.filter(
    (series) => series.id !== "weekly-10-hours-of-road-atlanta",
  );
  const weekly = value.previous.series.find(
    (series) => series.id === "weekly-wec-weekly",
  );
  if (weekly) weekly.track = "Spa-Francorchamps (WEC)";
  value.following = [
    "beginner-lmgt3-fixed",
    "weekly-wec-weekly",
    "weekly-10-hours-of-road-atlanta",
  ];
  value.checked = value.updated = Date.parse("2026-10-08T06:02:00Z") / 1000;
  value.utc = false;
  return value;
}

// Frozen calendar/capture.rs:159-170; public scenes only, never production data.
export function calendarHistoryReference(): CalendarHistoryView {
  return {
    invalidCache: false,
    weeks: [
      {
        from: Date.parse("2026-09-22T00:00:00Z") / 1000,
        until: Date.parse("2026-09-29T00:00:00Z") / 1000,
        seenAt: Date.parse("2026-09-22T08:00:00Z") / 1000,
        tracks: [
          {
            seriesId: "beginner-lmgt3-fixed",
            name: "LMGT3 Fixed",
            track: "Imola",
          },
        ],
      },
      {
        from: Date.parse("2026-09-29T00:00:00Z") / 1000,
        until: Date.parse("2026-10-06T00:00:00Z") / 1000,
        seenAt: Date.parse("2026-09-29T08:00:00Z") / 1000,
        tracks: [
          {
            seriesId: "beginner-lmgt3-fixed",
            name: "LMGT3 Fixed",
            track: "Spa-Francorchamps",
          },
          {
            seriesId: "weekly-wec-weekly",
            name: "WEC Weekly",
            track: "Spa-Francorchamps",
          },
        ],
      },
    ],
  };
}
