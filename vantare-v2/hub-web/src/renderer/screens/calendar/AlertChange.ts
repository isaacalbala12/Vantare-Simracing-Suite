import type {
  CalendarAlerts,
  CalendarBand,
  CalendarChannels,
} from "../../../contract/generated/calendar";

type BandPatch = Partial<Pick<CalendarBand, "from" | "to" | "days" | "mode">>;
export type CalendarAlertChange =
  | { kind: "lead"; value: number }
  | { kind: "channel"; channel: keyof CalendarChannels; value: boolean }
  | { kind: "band"; id: string; enabled: boolean; patch: BandPatch }
  | { kind: "slot"; id: string; at: number; enabled: boolean }
  | { kind: "autoLaunchOff" }
  | { kind: "clear" };
// Frozen calendar/ui/avisos.rs:243-250: initial local evening window, not a bound.
export function defaultBand(seriesId: string): CalendarBand {
  return { seriesId, from: 1200, to: 1380, days: "all", mode: "each" };
}
export function bandChange(
  current: CalendarAlerts,
  id: string,
  value: CalendarBand | undefined,
): CalendarAlertChange {
  if (!value) return { kind: "band", id, enabled: false, patch: {} };
  const before =
    current.bands.find((band) => band.seriesId === id) ?? defaultBand(id);
  return {
    kind: "band",
    id,
    enabled: true,
    patch: {
      ...(before.from !== value.from ? { from: value.from } : {}),
      ...(before.to !== value.to ? { to: value.to } : {}),
      ...(before.days !== value.days ? { days: value.days } : {}),
      ...(before.mode !== value.mode ? { mode: value.mode } : {}),
    },
  };
}
export function applyAlertChange(
  current: CalendarAlerts,
  change: CalendarAlertChange,
): CalendarAlerts {
  const next = structuredClone(current);
  switch (change.kind) {
    case "lead":
      next.leadMin = change.value;
      break;
    case "channel":
      next.channels[change.channel] = change.value;
      break;
    case "autoLaunchOff":
      next.autoLaunch = false;
      break;
    case "clear":
      next.bands = [];
      next.slots = [];
      break;
    case "band": {
      if (!change.enabled) {
        next.bands = next.bands.filter((band) => band.seriesId !== change.id);
        break;
      }
      const index = next.bands.findIndex((band) => band.seriesId === change.id);
      const before =
        next.bands.find((band) => band.seriesId === change.id) ??
        defaultBand(change.id);
      const band = { ...before, ...change.patch, seriesId: change.id };
      if (index < 0) next.bands.push(band);
      else next.bands[index] = band;
      break;
    }
    case "slot": {
      const present = next.slots.some(
        (slot) => slot.seriesId === change.id && slot.at === change.at,
      );
      if (change.enabled && !present)
        next.slots.push({ seriesId: change.id, at: change.at });
      else if (!change.enabled)
        next.slots = next.slots.filter(
          (slot) => slot.seriesId !== change.id || slot.at !== change.at,
        );
      break;
    }
  }
  return next;
}
