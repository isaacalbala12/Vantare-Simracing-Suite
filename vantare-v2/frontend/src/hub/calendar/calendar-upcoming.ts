import { type Calendar, isEventActive } from "../../calendar/calendar-types";

export type UpcomingRaceItem = {
  id: string;
  kind: "series" | "event";
  tier: string;
  name: string;
  track: string;
  vehicleClass: string;
  setup: string;
  durationMin: number;
  nextStart: string | null;
  isActive: boolean;
};

export function buildUpcomingRaceItems(calendar: Calendar, now: Date): UpcomingRaceItem[] {
  const items: UpcomingRaceItem[] = [];

  if (calendar.series && calendar.seriesPreviews) {
    for (const series of calendar.series) {
      const preview = calendar.seriesPreviews.find((p) => p.seriesId === series.id);
      let nextStart: string | null = null;
      let isActive = false;

      if (preview && preview.nextStarts && preview.nextStarts.length > 0) {
        const durationMs = (series.durationMin || 0) * 60_000;
        let activeStart: string | null = null;
        let futureStart: string | null = null;
        let futureStartMs = Infinity;

        for (const startStr of preview.nextStarts) {
          const startMs = new Date(startStr).getTime();
          if (Number.isNaN(startMs)) continue;
          const endMs = startMs + durationMs;

          if (now.getTime() >= startMs && now.getTime() < endMs) {
            activeStart = startStr;
          } else if (startMs > now.getTime()) {
            if (startMs < futureStartMs) {
              futureStartMs = startMs;
              futureStart = startStr;
            }
          }
        }

        if (activeStart) {
          nextStart = activeStart;
          isActive = true;
        } else if (futureStart) {
          nextStart = futureStart;
          isActive = false;
        }
      }

      const item: UpcomingRaceItem = {
        id: series.id,
        kind: "series",
        tier: series.tier,
        name: series.name,
        track: series.track,
        vehicleClass: series.vehicleClass,
        setup: series.setup,
        durationMin: series.durationMin,
        nextStart,
        isActive,
      };
      items.push(item);
    }
  }

  if (calendar.events) {
    for (const event of calendar.events) {
      const startMs = new Date(event.startTime).getTime();
      if (Number.isNaN(startMs)) continue;

      const active = isEventActive(event, now);

      if (active || startMs > now.getTime()) {
        items.push({
          id: event.id,
          kind: "event",
          tier: "event",
          name: event.title,
          track: event.track,
          vehicleClass: "",
          setup: "",
          durationMin: event.durationMin,
          nextStart: event.startTime,
          isActive: active,
        });
      }
    }
  }

  items.sort((a, b) => {
    const timeA = a.nextStart ? new Date(a.nextStart).getTime() : Infinity;
    const timeB = b.nextStart ? new Date(b.nextStart).getTime() : Infinity;
    return timeA - timeB;
  });

  return items;
}
