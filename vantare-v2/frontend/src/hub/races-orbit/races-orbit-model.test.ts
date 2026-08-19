import { describe, expect, it } from "vitest";
import type { Calendar, RaceSeries } from "../../calendar/calendar-types";
import { mockCalendar } from "../calendar-visual-mock-data";
import {
  buildSeriesEntries,
  clampZoom,
  dayAnchor,
  dayRows,
  fitZoom,
  groupByHour,
  filterByTier,
  monthAnchor,
  monthDays,
  tierCounts,
  pxPerHourOf,
  readTimelinePrefs,
  tickEveryMinFor,
  timelineRows,
  timelineStart,
  upcomingRows,
  weekAnchor,
  weekRows,
  WEEK_SLOTS,
  writeTimelinePrefs,
  ZOOM_MAX,
  ZOOM_MIN,
} from "./races-orbit-model";

function series(patch: Partial<RaceSeries> & { id: string }): RaceSeries {
  return {
    name: patch.id,
    tier: "beginner",
    licenseLabel: "Bronze SR",
    track: "Sebring",
    vehicleClass: "LMGT3",
    setup: "Fixed",
    durationMin: 20,
    splits: 20,
    assists: "",
    tyreWarmers: true,
    tyres: 8,
    recurrence: { kind: "interval", intervalMinutes: 15 },
    ...patch,
  } as RaceSeries;
}

function calendarOf(list: RaceSeries[], followed: string[] = []): Calendar {
  return {
    version: 1,
    timezone: "UTC",
    reminderMinutes: [30, 15, 10, 5, 2],
    events: [],
    series: list,
    followedSeriesIds: followed,
    seriesPreviews: [],
    updated: "",
  };
}

const NOW = new Date("2026-07-07T18:07:30Z");

describe("buildSeriesEntries", () => {
  it("traduce las series reales y marca las seguidas", () => {
    const entries = buildSeriesEntries(
      calendarOf(
        [
          series({ id: "a", startOffsetMinute: 15 }),
          series({
            id: "w",
            tier: "weekly",
            recurrence: { kind: "weekly", days: ["mon", "sun"], timesUTC: ["02:00", "23:00"] },
          }),
        ],
        ["w"],
      ),
    );
    expect(entries.map((entry) => entry.id)).toEqual(["a", "w"]);
    expect(entries[0].engine.every).toBe(15);
    expect(entries[0].followed).toBe(false);
    expect(entries[1].engine.weeklyUTC).toEqual(["02:00", "23:00"]);
    expect(entries[1].followed).toBe(true);
  });

  it("descarta las series sin cadencia calculable", () => {
    const entries = buildSeriesEntries(
      calendarOf([series({ id: "x", recurrence: { kind: "none" } })]),
    );
    expect(entries).toEqual([]);
  });

  it("sin calendario no inventa nada", () => {
    expect(buildSeriesEntries(null)).toEqual([]);
  });

  it("rotula las sesiones publicadas", () => {
    const entries = buildSeriesEntries(
      calendarOf([
        series({
          id: "s",
          sessions: [
            { name: "practice", durationMin: 3, estimated: true },
            { name: "qualifying", durationMin: 8, estimated: true },
            { name: "race", durationMin: 20, estimated: false },
          ],
        }),
      ]),
    );
    expect(entries[0].sessions).toBe("P 3 · Q 8 · R 20");
  });

  it("rotula el warmup y respeta las marcadas estimadas", () => {
    const entries = buildSeriesEntries(
      calendarOf([
        series({
          id: "s",
          sessions: [
            { name: "practice", durationMin: 3, estimated: true },
            { name: "warmup", durationMin: 5, estimated: true },
            { name: "race", durationMin: 40, estimated: false },
          ],
        }),
      ]),
    );
    expect(entries[0].sessions).toBe("P 3 · W 5 · R 40");
  });

  it("sin sesiones publicadas deja la etiqueta vacía para que el detalle pinte «—»", () => {
    const entries = buildSeriesEntries(calendarOf([series({ id: "s" })]));
    expect(entries[0].sessions).toBe("");
  });

  // El calendario simulado alimenta el harness visual: si pierde las sesiones
  // reales el detalle vuelve a capturar «—» aunque el modelo esté bien.
  it("el calendario simulado trae las sesiones reales del fixture LMU", () => {
    const entries = buildSeriesEntries(mockCalendar);
    const lmgt3 = entries.find((entry) => entry.id === "beginner-lmgt3-fixed");
    expect(lmgt3?.sessions).toBe("P 3 · Q 8 · R 20");
    const weekly = entries.find((entry) => entry.id === "weekly-wec-weekly");
    expect(weekly?.sessions).toBe("P 3 · Q 8 · R 100");
  });
});

describe("filtro de categoría", () => {
  const entries = buildSeriesEntries(
    calendarOf([
      series({ id: "b1" }),
      series({ id: "s1", tier: "intermediate" }),
      series({ id: "g1", tier: "advanced" }),
    ]),
  );

  it("cuenta por categoría", () => {
    expect(tierCounts(entries)).toMatchObject({
      all: 3,
      beginner: 1,
      intermediate: 1,
      advanced: 1,
      weekly: 0,
    });
  });

  it("recorta las series visibles", () => {
    expect(filterByTier(entries, "advanced").map((entry) => entry.id)).toEqual(["g1"]);
    expect(filterByTier(entries, "all")).toHaveLength(3);
  });
});

describe("vistas", () => {
  const entries = buildSeriesEntries(
    calendarOf([
      series({ id: "a", name: "Alfa", startOffsetMinute: 0 }),
      series({
        id: "w",
        name: "Weekly",
        tier: "weekly",
        recurrence: { kind: "weekly", days: ["tue"], timesUTC: ["02:00", "23:00"] },
      }),
    ]),
  );

  it("Próximas ordena por hora y respeta el límite", () => {
    const rows = upcomingRows(entries, NOW, 3);
    expect(rows).toHaveLength(3);
    expect(rows[0].at.getTime()).toBeLessThanOrEqual(rows[1].at.getTime());
  });

  it("Día devuelve 24 filas y marca la hora en curso", () => {
    const base = new Date(NOW);
    base.setHours(0, 0, 0, 0);
    const hours = dayRows(entries, base, NOW);
    expect(hours).toHaveLength(24);
    expect(hours.filter((hour) => hour.now)).toHaveLength(1);
    expect(hours[NOW.getHours()].now).toBe(true);
    // Cada 15 min ⇒ cuatro salidas de la serie de intervalo por hora.
    expect(hours[0].events.filter((event) => event.entry.id === "a")).toHaveLength(4);
  });

  it("Semana entrega siete celdas por serie desde el lunes", () => {
    const monday = weekAnchor(NOW, 0);
    expect(monday.getDay()).toBe(1);
    const rows = weekRows(entries, monday, NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0].cells).toHaveLength(7);
    expect(rows.every((row) => row.cells.filter((cell) => cell.today).length <= 1)).toBe(true);
  });

  it("Semana enseña horas concretas, no la cadencia", () => {
    const monday = weekAnchor(NOW, 0);
    const rows = weekRows(entries, monday, NOW);
    const today = rows[0].cells.find((cell) => cell.today)!;

    // Cada 15 min ⇒ 96 salidas al día: seis chips visibles y el resto en "+n".
    expect(today.total).toBe(96);
    expect(today.slots).toHaveLength(WEEK_SLOTS);
    expect(today.more).toBeGreaterThan(0);
    // En el día de hoy la primera hora visible ya es futura.
    expect(today.slots[0].getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    expect(today.slots.map((slot) => slot.getTime())).toEqual(
      [...today.slots].sort((a, b) => a.getTime() - b.getTime()).map((slot) => slot.getTime()),
    );

    // Un día futuro arranca en la primera salida del día, no en "ahora".
    const future = rows[0].cells[6];
    expect(future.slots[0].getDate()).toBe(future.day.getDate());
  });

  it("Semana marca los días ya cerrados", () => {
    const rows = weekRows(entries, weekAnchor(NOW, 0), NOW);
    const past = rows[0].cells.filter((cell) => cell.past);
    expect(past.every((cell) => cell.day.getTime() < dayAnchor(NOW, 0).getTime())).toBe(true);
  });

  it("Mes entrega 7×6 celdas con hoy marcado una sola vez", () => {
    const days = monthDays(entries, monthAnchor(NOW, 0), NOW);
    expect(days).toHaveLength(42);
    expect(days.filter((day) => day.today)).toHaveLength(1);
    expect(days.find((day) => !day.other)?.daily).toBe(1);
  });

  it("Mes pinta los eventos con fecha del fixture", () => {
    const calendar = calendarOf([series({ id: "a" })]);
    calendar.events = [
      {
        id: "ev",
        title: "ELMS 4 Hours",
        sim: "lmu",
        track: "Imola",
        series: "special",
        sessionLabel: "Race",
        startTime: "2026-07-10T03:00:00Z",
        durationMin: 240,
        registrationUrl: "",
        source: "",
        notes: "",
      },
    ];
    const days = monthDays(
      buildSeriesEntries(calendar),
      monthAnchor(NOW, 0),
      NOW,
      calendar.events,
    );
    expect(days.flatMap((day) => day.specials).map((special) => special.title)).toEqual([
      "ELMS 4 Hours",
    ]);
  });

  it("Timeline arranca en la hora en punto y acota el ancho del bloque", () => {
    const start = timelineStart(NOW);
    expect(start.getMinutes()).toBe(0);
    const rows = timelineRows(entries, start);
    // min(raceMin 20, every 15 − 3) = 12.
    expect(rows[0].blockMin).toBe(12);
    expect(rows[0].starts).toHaveLength(96);
    expect(rows[0].starts.every((at) => at >= start)).toBe(true);
    expect(
      rows[0].starts.every((at) => at.getTime() < start.getTime() + 24 * 3_600_000),
    ).toBe(true);
  });
});

describe("Próximas agrupadas por hora", () => {
  const entries = buildSeriesEntries(
    calendarOf([
      series({ id: "a", name: "Alfa", startOffsetMinute: 0 }),
      series({ id: "b", name: "Bravo", startOffsetMinute: 0 }),
    ]),
  );

  it("junta las salidas de la misma hora en un grupo", () => {
    const groups = groupByHour(upcomingRows(entries, NOW, 8));
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.reduce((total, group) => total + group.rows.length, 0)).toBe(
      upcomingRows(entries, NOW, 8).length,
    );
    for (const group of groups) {
      expect(group.hour.getMinutes()).toBe(0);
      expect(group.rows.every((row) => row.at.getHours() === group.hour.getHours())).toBe(true);
    }
    // Las cabeceras no se repiten: cada hora aparece una sola vez.
    const hours = groups.map((group) => group.hour.getTime());
    expect(new Set(hours).size).toBe(hours.length);
  });

  it("una lista vacía no produce grupos", () => {
    expect(groupByHour([])).toEqual([]);
  });
});

describe("Timeline · rango y zoom", () => {
  const entries = buildSeriesEntries(calendarOf([series({ id: "a", startOffsetMinute: 0 })]));

  it("el rango recorta las salidas del eje", () => {
    const start = timelineStart(NOW);
    expect(timelineRows(entries, start, 6)[0].starts).toHaveLength(24);
    expect(timelineRows(entries, start, 12)[0].starts).toHaveLength(48);
    expect(timelineRows(entries, start)[0].starts).toHaveLength(96);
  });

  it("el zoom vive entre 1× y 4×", () => {
    expect(clampZoom(0.2)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(Number.NaN)).toBe(ZOOM_MIN);
    expect(fitZoom(24)).toBe(1);
    expect(fitZoom(12)).toBe(2);
    expect(fitZoom(6)).toBe(4);
  });

  it("a zoom mínimo caben 24 h en el ancho del eje", () => {
    expect(pxPerHourOf(1200, 1) * 24).toBe(1200);
    expect(pxPerHourOf(1200, 4) * 6).toBe(1200);
  });

  it("las etiquetas del eje se adaptan al zoom", () => {
    expect(tickEveryMinFor(50)).toBe(60);
    expect(tickEveryMinFor(120)).toBe(30);
    expect(tickEveryMinFor(240)).toBe(15);
  });

  it("el rango y el zoom persisten y los valores raros vuelven al defecto", () => {
    const store = new Map<string, string>();
    const fake = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    } as unknown as Storage;

    expect(readTimelinePrefs(fake)).toEqual({ range: 24, zoom: 1 });
    writeTimelinePrefs({ range: 12, zoom: 2 }, fake);
    expect(readTimelinePrefs(fake)).toEqual({ range: 12, zoom: 2 });

    store.set("vantare.orbit.races.timeline", JSON.stringify({ range: 99, zoom: 400 }));
    expect(readTimelinePrefs(fake)).toEqual({ range: 24, zoom: ZOOM_MAX });
    store.set("vantare.orbit.races.timeline", "no-json");
    expect(readTimelinePrefs(fake)).toEqual({ range: 24, zoom: 1 });
  });
});
