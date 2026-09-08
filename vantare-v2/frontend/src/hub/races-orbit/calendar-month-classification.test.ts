import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_CALENDAR, type Calendar, type RaceEvent, type RaceSeries } from "../../calendar/calendar-types";
import { buildSeriesEntries, filterByTier, monthDays } from "./races-orbit-model";

const seed = JSON.parse(readFileSync("../internal/calendar/seed/lmu-weekly-schedule.json", "utf8")) as {
  validFrom: string; validUntil: string; updated: string; series: RaceSeries[];
};
const entries = buildSeriesEntries({ ...EMPTY_CALENDAR, series: seed.series,
  schedule: { validFrom: seed.validFrom, validUntil: seed.validUntil, updated: seed.updated, source: "bundled" },
});
// Literal occurrence captured from the Go backend in ISA-1027 (real bundled seed).
const occurrence: RaceEvent = {
  id: "beginner-lmgt3-fixed-20260825T000000Z", title: "LMGT3 Fixed", sim: "lmu",
  track: "Fuji (WEC)", series: "LMGT3 Fixed", startTime: "2026-08-25T00:00:00Z",
  durationMin: 20, source: "vantare-bundled-lmu", sessionLabel: "", registrationUrl: "", notes: "",
};
const first = new Date(2026, 7, 1);
const now = new Date("2026-08-25T00:00:00Z");

describe("clasificación de eventos del mes", () => {
  const auditPath = process.env.CALENDAR_REAL_AUDIT_PATH;
  it.runIf(auditPath)("contrasta las 4596 ocurrencias del Go audit real (opt-in)", () => {
    const calendar = JSON.parse(readFileSync(auditPath!, "utf8")) as Calendar;
    expect(calendar.events).toHaveLength(4596);
    calendar.schedule = { validFrom: seed.validFrom, validUntil: seed.validUntil, updated: seed.updated, source: "bundled" };
    const all = buildSeriesEntries(calendar);
    const before = JSON.stringify(calendar.events);
    for (const visible of [all, filterByTier(all, "advanced")]) {
      expect(monthDays(visible, first, now, calendar.events, calendar.series).flatMap((day) => day.specials)).toEqual([]);
    }
    expect(JSON.stringify(calendar.events)).toBe(before);
  });
  it("no presenta una ocurrencia normal como especial", () => {
    const days = monthDays(entries, first, now, [occurrence]);
    expect(days.flatMap((day) => day.specials)).toEqual([]);
  });

  it("filtrar otra categoría no convierte las series ocultas en especiales", () => {
    const days = monthDays(filterByTier(entries, "advanced"), first, now, [occurrence], seed.series);
    expect(days.flatMap((day) => day.specials)).toEqual([]);
  });

  it.each([
    { source: "import", id: occurrence.id },
    { source: occurrence.source, id: "special-event-20260825" },
    { source: occurrence.source, id: "beginner-lmgt3-fixed-20260825T010000Z" },
    { source: occurrence.source, id: "unknown-series-20260825T000000Z" },
  ])("conserva un especial con identidad propia %s", (patch) => {
    const special = { ...occurrence, ...patch };
    const days = monthDays(entries, first, now, [special]);
    expect(days.flatMap((day) => day.specials)).toEqual([{ id: special.id, title: special.title }]);
  });

  it("no modifica los eventos compartidos ni depende del título", () => {
    const events = [{ ...occurrence, title: "Título actualizado", series: "Otra etiqueta" }];
    const before = JSON.stringify(events);
    expect(monthDays(entries, first, now, events).flatMap((day) => day.specials)).toEqual([]);
    expect(JSON.stringify(events)).toBe(before);
  });
});
