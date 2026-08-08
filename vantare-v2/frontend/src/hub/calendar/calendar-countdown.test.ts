import { describe, expect, it } from "vitest";
import {
  countdownUrgency,
  formatCountdown,
  groupUpcomingByTier,
  msUntilStart,
  type UpcomingRaceItem,
} from "./calendar-upcoming";

function item(overrides: Partial<UpcomingRaceItem> = {}): UpcomingRaceItem {
  return {
    id: "series-1",
    kind: "series",
    tier: "beginner",
    name: "LMGT3 Fixed",
    track: "Bahrain (Outer)",
    vehicleClass: "LMGT3 Class",
    setup: "fixed",
    durationMin: 20,
    nextStart: "2026-08-04T12:15:00Z",
    isActive: false,
    ...overrides,
  };
}

const now = new Date("2026-08-04T12:00:00Z");

describe("msUntilStart", () => {
  it("measures the gap to the next start", () => {
    expect(msUntilStart(item(), now)).toBe(15 * 60_000);
  });

  it("goes negative once the start is behind us", () => {
    expect(msUntilStart(item({ nextStart: "2026-08-04T11:50:00Z" }), now)).toBe(-10 * 60_000);
  });

  it("returns null when there is no start to count down to", () => {
    expect(msUntilStart(item({ nextStart: null }), now)).toBeNull();
    expect(msUntilStart(item({ nextStart: "not a date" }), now)).toBeNull();
  });
});

describe("formatCountdown", () => {
  it("counts seconds under a minute, where they are what matters", () => {
    expect(formatCountdown(45_000)).toBe("45s");
  });

  it("pads seconds under an hour so the row does not jitter", () => {
    expect(formatCountdown(4 * 60_000 + 5_000)).toBe("4m 05s");
  });

  it("drops seconds past an hour", () => {
    expect(formatCountdown(2 * 3_600_000 + 7 * 60_000)).toBe("2h 07m");
  });

  it("drops minutes past a day", () => {
    expect(formatCountdown(2 * 86_400_000 + 3 * 3_600_000)).toBe("2d 3h");
    expect(formatCountdown(2 * 86_400_000)).toBe("2d");
  });

  it("says 'ya' once the start has passed", () => {
    expect(formatCountdown(0)).toBe("ya");
    expect(formatCountdown(-1000)).toBe("ya");
  });

  it("returns null when there is nothing to count", () => {
    expect(formatCountdown(null)).toBeNull();
  });
});

describe("countdownUrgency", () => {
  it("marks a running race as live regardless of its start", () => {
    expect(countdownUrgency(item({ isActive: true }), now)).toBe("live");
  });

  it("treats the last five minutes as imminent", () => {
    expect(countdownUrgency(item({ nextStart: "2026-08-04T12:04:00Z" }), now)).toBe("imminent");
  });

  it("treats the next half hour as soon", () => {
    expect(countdownUrgency(item({ nextStart: "2026-08-04T12:20:00Z" }), now)).toBe("soon");
  });

  it("treats anything further out as later", () => {
    expect(countdownUrgency(item({ nextStart: "2026-08-04T14:00:00Z" }), now)).toBe("later");
  });

  it("reports unknown when there is no start", () => {
    expect(countdownUrgency(item({ nextStart: null }), now)).toBe("unknown");
  });
});

describe("groupUpcomingByTier", () => {
  it("orders tiers by whichever starts soonest, not alphabetically", () => {
    const groups = groupUpcomingByTier([
      item({ id: "a", tier: "advanced", nextStart: "2026-08-04T12:05:00Z" }),
      item({ id: "b", tier: "beginner", nextStart: "2026-08-04T12:30:00Z" }),
      item({ id: "w", tier: "weekly", nextStart: "2026-08-04T12:10:00Z" }),
    ]);
    expect(groups.map((g) => g.tier)).toEqual(["advanced", "weekly", "beginner"]);
  });

  it("orders items inside a tier by start time", () => {
    const groups = groupUpcomingByTier([
      item({ id: "late", nextStart: "2026-08-04T13:00:00Z" }),
      item({ id: "early", nextStart: "2026-08-04T12:05:00Z" }),
    ]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["early", "late"]);
  });

  it("keeps items with no start visible at the bottom instead of dropping them", () => {
    const groups = groupUpcomingByTier([
      item({ id: "unknown", nextStart: null }),
      item({ id: "known", nextStart: "2026-08-04T12:05:00Z" }),
    ]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["known", "unknown"]);
  });
});
