import { afterEach, describe, expect, it } from "vitest";
import {
  formatCountdown,
  formatStartTime,
  nextStarts,
  upcoming,
  type Series,
} from "./next-starts";

const interval = (every: number, offset: number): Series => ({
  id: `every-${every}-${offset}`,
  name: `Serie ${every}/${offset}`,
  tier: "beginner",
  license: "Bronze SR",
  track: "Sebring",
  cls: "LMGT3",
  setup: "Fixed",
  raceMin: 20,
  sessions: "P 3 · Q 8 · R 20",
  every,
  offset,
});

const weekly: Series = {
  id: "weekly",
  name: "WEC Weekly",
  tier: "weekly",
  license: "SR S2",
  track: "Portimao",
  cls: "Hypercar",
  setup: "Open",
  raceMin: 100,
  sessions: "P 10 · Q 15 · R 100",
  weeklyUTC: ["02:00", "23:00"],
  days: [0, 1, 2, 3, 4, 5, 6],
};

const hhmm = (date: Date) =>
  `${date.getUTCDate()} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;

describe("nextStarts", () => {
  it("(a) every 15 / offset 15 desde 10:07:30Z", () => {
    const out = nextStarts(interval(15, 15), new Date("2026-03-02T10:07:30Z"), 4);
    expect(out.map(hhmm)).toEqual(["2 10:15", "2 10:30", "2 10:45", "2 11:00"]);
  });

  it("(b) every 20 / offset 45 desde 10:50Z salta a 11:05", () => {
    const out = nextStarts(interval(20, 45), new Date("2026-03-02T10:50:00Z"), 1);
    expect(hhmm(out[0])).toBe("2 11:05");
  });

  it("(c) semanal L–D desde domingo 23:30Z entrega el lunes a las 02:00", () => {
    // 2026-03-01 es domingo.
    const out = nextStarts(weekly, new Date("2026-03-01T23:30:00Z"), 1);
    expect(hhmm(out[0])).toBe("2 02:00");
  });

  it("(d) un `from` exactamente en una salida la incluye", () => {
    const out = nextStarts(interval(15, 15), new Date("2026-03-02T10:15:00Z"), 1);
    expect(hhmm(out[0])).toBe("2 10:15");
  });

  it("no devuelve nada si se piden cero salidas", () => {
    expect(nextStarts(interval(15, 15), new Date(), 0)).toEqual([]);
  });
});

describe("upcoming", () => {
  it("ordena por hora y desempata por nombre", () => {
    const from = new Date("2026-03-02T10:00:00Z");
    const a = { ...interval(15, 15), id: "b", name: "Bravo" };
    const b = { ...interval(15, 15), id: "a", name: "Alfa" };
    const out = upcoming([a, b], from, 3);
    expect(out.map((row) => `${row.series.name} ${hhmm(row.at)}`)).toEqual([
      "Alfa 2 10:00",
      "Bravo 2 10:00",
      "Alfa 2 10:15",
    ]);
  });

  it("respeta el límite", () => {
    expect(upcoming([interval(15, 15)], new Date(), 1)).toHaveLength(1);
  });
});

describe("formatCountdown", () => {
  it("usa mm:ss por debajo de una hora", () => {
    expect(formatCountdown(9 * 60_000 + 5_000)).toBe("09:05");
  });

  it("usa Nh Mm a partir de una hora", () => {
    expect(formatCountdown(2 * 3_600_000 + 7 * 60_000)).toBe("2h 07m");
  });

  it("nunca baja de cero", () => {
    expect(formatCountdown(-5000)).toBe("00:00");
  });
});

describe("zona horaria", () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  /** Cambiar `TZ` en Node reetiqueta la hora local sin mover el instante UTC. */
  function startIn(timeZone: string): { local: string; utc: string } {
    process.env.TZ = timeZone;
    const at = nextStarts(interval(15, 15), new Date("2026-03-02T10:07:30Z"), 1)[0];
    return { local: formatStartTime(at), utc: at.toISOString() };
  }

  it("mueve las horas mostradas pero no las UTC", () => {
    const madrid = startIn("Europe/Madrid");
    const tokyo = startIn("Asia/Tokyo");
    expect(madrid.utc).toBe("2026-03-02T10:15:00.000Z");
    expect(tokyo.utc).toBe(madrid.utc);
    expect(madrid.local).toBe("11:15");
    expect(tokyo.local).toBe("19:15");
    expect(tokyo.local).not.toBe(madrid.local);
  });
});
