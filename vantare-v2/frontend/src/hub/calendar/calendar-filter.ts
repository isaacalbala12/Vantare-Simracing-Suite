// Pure helpers for applying the visual tier filter to calendar views.
import type { CalendarFilter } from "./CalendarToolbar";
import type { DailyPatternSummary } from "../../calendar/calendar-view-math";

type FilterableItem = {
  type?: "weekly" | "special" | "interval";
  tier?: string;
};

export function matchesTierFilter(item: FilterableItem, filter: CalendarFilter): boolean {
  if (filter === "all") return true;
  if (filter === "special") return item.type === "special";
  if (filter === "weekly") return item.type === "weekly" || item.tier === "weekly";
  return item.tier === filter;
}

export function filterIntervalSummaries(
  summaries: DailyPatternSummary[],
  filter: CalendarFilter,
): DailyPatternSummary[] {
  if (filter === "all") return summaries;
  if (filter === "weekly" || filter === "special") return [];
  return summaries.filter((s) => s.tier === filter);
}
