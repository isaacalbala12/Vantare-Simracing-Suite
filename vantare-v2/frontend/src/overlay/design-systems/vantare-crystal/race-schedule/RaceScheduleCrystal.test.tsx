import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RaceScheduleViewModel } from "../../../widget-types/race-schedule/race-schedule-view-model";
import { RaceScheduleCrystal } from "./RaceScheduleCrystal";

afterEach(() => cleanup());

const events: RaceScheduleViewModel["events"] = Array.from({ length: 4 }, (_, index) => ({
  id: `event-${index}`,
  title: `Event ${index}`,
  track: `Track ${index}`,
  startAt: `2026-07-${14 + index}T18:00:00.000Z`,
  durationMinutes: 30 + index * 10,
  classes: index < 2 ? ["GT3"] : index === 2 ? ["HYPERCAR", "LMGT3"] : ["HYPERCAR", "LMP2", "LMGT3"],
  status: index === 3 ? "team registration" : "upcoming",
  license: index === 3 ? "SPECIAL EVENT" : "A",
}));

describe("RaceScheduleCrystal", () => {
  it("keeps the canonical controls and six honest metadata slots per event", () => {
    const model: RaceScheduleViewModel = { type: "race-schedule", status: "ready", events, timeZone: "UTC" };
    const { container } = render(<RaceScheduleCrystal model={model} settings={{}} renderMode="harness" />);
    expect(container.querySelectorAll(".vc-race-schedule > nav b")).toHaveLength(4);
    expect(Array.from(container.querySelectorAll(".vc-race-events article footer")).every((footer) => footer.children.length === 6)).toBe(true);
    expect(container.textContent).not.toContain(events[0].startAt);
    expect(container.textContent).toContain("—");
  });
});
