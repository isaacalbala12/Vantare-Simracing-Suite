import {
  type Calendar,
  type VehicleClass,
  isEventActive,
} from "../../calendar/calendar-types";

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
  // Everything below answers "what is this race?" without opening a detail
  // panel: the eligible classes and the rules that change how it is driven.
  classes?: VehicleClass[];
  splits?: number;
  assists?: string;
  tyres?: number;
  tyreWarmers?: boolean;
  licenseLabel?: string;
  safetyRating?: string;
  timeScale?: number;
  veLimit?: number;
  notes?: string[];
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
        classes: series.classes,
        splits: series.splits,
        assists: series.assists,
        tyres: series.tyres,
        tyreWarmers: series.tyreWarmers,
        licenseLabel: series.licenseLabel,
        safetyRating: series.safetyRating,
        timeScale: series.timeScale,
        veLimit: series.veLimit,
        notes: series.notes,
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

/**
 * Milliseconds until an item starts. Negative once it has started, null when
 * the item has no known next start.
 */
export function msUntilStart(item: UpcomingRaceItem, now: Date): number | null {
  if (!item.nextStart) return null;
  const startMs = new Date(item.nextStart).getTime();
  if (Number.isNaN(startMs)) return null;
  return startMs - now.getTime();
}

/**
 * Renders a countdown the way a driver reads it while deciding whether to
 * register: seconds matter under a minute, hours stop mattering past a day.
 * Returns null when there is nothing to count down to.
 */
export function formatCountdown(ms: number | null): string | null {
  if (ms === null) return null;
  if (ms <= 0) return "ya";

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

/** Urgency drives the visual weight of a row. */
export type CountdownUrgency = "live" | "imminent" | "soon" | "later" | "unknown";

/**
 * Classifies how pressing a start is. "imminent" is inside the window where
 * you would drop what you are doing and join; "soon" is worth planning for.
 */
export function countdownUrgency(item: UpcomingRaceItem, now: Date): CountdownUrgency {
  if (item.isActive) return "live";
  const ms = msUntilStart(item, now);
  if (ms === null) return "unknown";
  if (ms <= 5 * 60_000) return "imminent";
  if (ms <= 30 * 60_000) return "soon";
  return "later";
}

/** A tier and the items starting under it, in start order. */
export type UpcomingTierGroup = {
  tier: string;
  items: UpcomingRaceItem[];
};

/**
 * Groups upcoming items by tier, keeping both the groups and the items inside
 * them ordered by whatever starts soonest. Items with no known start sink to
 * the bottom rather than disappearing, so a series that failed to expand is
 * visible instead of silently missing.
 */
export function groupUpcomingByTier(items: UpcomingRaceItem[]): UpcomingTierGroup[] {
  const byTier = new Map<string, UpcomingRaceItem[]>();
  for (const item of items) {
    const list = byTier.get(item.tier);
    if (list) list.push(item);
    else byTier.set(item.tier, [item]);
  }

  const startMs = (item: UpcomingRaceItem): number =>
    item.nextStart ? new Date(item.nextStart).getTime() : Infinity;

  const groups: UpcomingTierGroup[] = [];
  for (const [tier, tierItems] of byTier) {
    const sorted = [...tierItems].sort((a, b) => startMs(a) - startMs(b));
    groups.push({ tier, items: sorted });
  }
  groups.sort((a, b) => startMs(a.items[0]) - startMs(b.items[0]));
  return groups;
}
