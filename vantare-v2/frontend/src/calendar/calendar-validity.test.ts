import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_CALENDAR, type RaceSeries } from "./calendar-types";
import { normaliseCalendar } from "./calendar-store";
import { buildRaceStarts } from "../hub/orbit/race-starts";
import { nextStarts } from "../hub/orbit/next-starts";
import { buildSeriesEntries, dayAnchor, dayRows, monthDays, timelineRows, upcomingRows, weekRows } from "../hub/races-orbit/races-orbit-model";

const seed = JSON.parse(readFileSync("../internal/calendar/seed/lmu-weekly-schedule.json", "utf8")) as {
  validFrom: string; validUntil: string; updated: string; series: RaceSeries[];
};
const document = {
  ...EMPTY_CALENDAR,
  series: seed.series,
  schedule: { validFrom: seed.validFrom, validUntil: seed.validUntil, updated: seed.updated, source: "bundled" as const },
};
const end = new Date(seed.validUntil);

describe("vigencia del documento oficial en todos sus consumidores", () => {
  it("conserva metadatos al normalizar el documento del backend", () => {
    expect(normaliseCalendar(document)).toHaveProperty("schedule", document.schedule);
  });

  it("no calcula salidas cuando el documento no tiene vigencia verificable", () => {
    const legacy = { ...EMPTY_CALENDAR, series: seed.series };
    expect(buildRaceStarts(legacy, new Date(seed.validFrom))).toEqual([]);
    expect(buildSeriesEntries(legacy)).toEqual([]);
  });

  it("Inicio y Próximas no extienden un horario caducado", () => {
    expect(buildRaceStarts(document, end)).toEqual([]);
    expect(upcomingRows(buildSeriesEntries(document), end, 24)).toEqual([]);
  });

  it("descarta previews del backend fuera de vigencia", () => {
    const withPreview = { ...document, seriesPreviews: [{ seriesId: seed.series[0].id, scheduleLabel: "", nextStarts: [end.toISOString()] }] };
    expect(buildRaceStarts(withPreview, end)).toEqual([]);
  });

  it("Día, Semana, Mes y Timeline no extienden las recurrencias", () => {
    const entries = buildSeriesEntries(document);
    expect(dayRows(entries, end, end).flatMap((hour) => hour.events)).toEqual([]);
    // Expiry can be inside a local day; that day's earlier starts remain valid.
    expect(weekRows(entries, dayAnchor(end, 0), end).flatMap((row) => row.cells.flatMap((cell) => cell.slots)).every((at) => at < end)).toBe(true);
    expect(weekRows(entries, dayAnchor(end, 1), end).flatMap((row) => row.cells).every((cell) => cell.total === 0)).toBe(true);
    expect(timelineRows(entries, end).flatMap((row) => row.starts)).toEqual([]);
    const after = new Date(end.getFullYear(), end.getMonth() + 1, 1);
    expect(monthDays(entries, after, after).every((day) => day.daily === 0 && day.weekly.length === 0)).toBe(true);
  });

  it("acota el motor del detalle al periodo publicado sin borrar salidas válidas", () => {
    const start = new Date(seed.validFrom);
    const entries = buildSeriesEntries(document);
    expect(entries.length).toBe(seed.series.length);
    for (const entry of entries) {
      const fromBefore = nextStarts(entry.engine, new Date(start.getTime() - 86_400_000), 4);
      expect(fromBefore.length).toBeGreaterThan(0);
      expect(fromBefore.every((at) => at >= start && at < end)).toBe(true);
      expect(nextStarts(entry.engine, end, 4)).toEqual([]);
      expect(nextStarts(entry.engine, new Date(end.getTime() - 1), 4)).toEqual([]);
    }
    const interval = entries.find((entry) => entry.engine.every)!;
    expect(nextStarts(interval.engine, start, 1)[0].getTime()).toBe(start.getTime());
  });

  it.each(["", "invalid", seed.validFrom])("rechaza un fin de vigencia inválido: %s", (validUntil) => {
    const invalid = { ...document, schedule: { ...document.schedule, validUntil } };
    expect(buildSeriesEntries(invalid).length).toBe(0);
    expect(buildRaceStarts(invalid, new Date(seed.validFrom)).length).toBe(0);
  });

  it("Mes cuenta solo los slots de un día parcialmente vigente", () => {
    const start = new Date(seed.validFrom);
    const partial = { ...document, series: seed.series.filter((series) => series.recurrence.kind === "weekly-slots").slice(0, 1),
      schedule: { ...document.schedule, validFrom: new Date(start.getTime() + 6 * 3_600_000).toISOString(), validUntil: new Date(start.getTime() + 12 * 3_600_000).toISOString() } };
    const entries = buildSeriesEntries(partial);
    expect(entries.length).toBe(1);
    const day = dayAnchor(new Date(partial.schedule.validFrom), 0);
    const dayCount = dayRows(entries, day, start).flatMap((hour) => hour.events).length;
    expect(dayCount).toBeGreaterThan(0);
    const month = monthDays(entries, new Date(day.getFullYear(), day.getMonth(), 1), start);
    expect(month.find((cell) => cell.day.getTime() === day.getTime())?.weekly[0].slots).toBe(dayCount);
  });
});
