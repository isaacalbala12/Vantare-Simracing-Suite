import { describe, expect, it } from "vitest";
import { dayKeyInZone, isSameDayInZone } from "./calendar-shared";

describe("isSameDayInZone", () => {
  it("answers in the given zone, not the browser's", () => {
    // 23:30 UTC is still the 4th in London and already the 5th in Madrid.
    const race = new Date("2026-08-04T23:30:00Z");
    const reference = new Date("2026-08-04T12:00:00Z");

    expect(isSameDayInZone(race, reference, "UTC")).toBe(true);
    expect(isSameDayInZone(race, reference, "Europe/Madrid")).toBe(false);
  });

  it("treats two instants in the same zone-day as equal however far apart", () => {
    expect(
      isSameDayInZone(
        new Date("2026-08-04T00:05:00Z"),
        new Date("2026-08-04T23:55:00Z"),
        "UTC",
      ),
    ).toBe(true);
  });
});

describe("dayKeyInZone", () => {
  it("produces a comparable key that shifts with the zone", () => {
    const instant = new Date("2026-08-04T23:30:00Z");
    expect(dayKeyInZone(instant, "UTC")).not.toBe(dayKeyInZone(instant, "Europe/Madrid"));
  });
});
