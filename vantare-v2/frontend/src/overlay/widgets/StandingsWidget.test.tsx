import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StandingsWidget, formatStandingsGap, formatStandingsGapForMode, formatStandingsPit } from "./StandingsWidget";

describe("StandingsWidget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function tick(ms: number) {
    act(() => { vi.advanceTimersByTime(ms); });
  }

  it("renders header and driver rows with mock data in edit mode", () => {
    render(
      <StandingsWidget editMode={true} updateHz={15} props={{ appearance: { accentColor: "#9b2226" } }} />,
    );
    tick(100);
    expect(screen.getByText("VANTARE")).toBeTruthy();
    expect(screen.getByText("ALPINE")).toBeTruthy();
  });

  it("applies custom border color from appearance to the panel border", () => {
    const { container } = render(
      <StandingsWidget editMode={true} updateHz={15} props={{ appearance: { borderColor: "#ff0000" } }} />,
    );
    const panel = container.querySelector("[data-testid='standings-panel']") as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.style.borderColor).toBe("#ff0000");
  });

  it("renders tire compound badges for soft tires", () => {
    render(
      <StandingsWidget editMode={true} updateHz={15} props={{ appearance: { tireSoftColor: "#E63946" } }} />,
    );
    tick(100);
    const badges = screen.getAllByText("S");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("shows pit indicator for cars in pits", () => {
    render(
      <StandingsWidget editMode={true} updateHz={15} />,
    );
    tick(100);
    expect(screen.getByText("PIT")).toBeTruthy();
  });

  it("formatStandingsGap renders leader, laps behind and time gaps", () => {
    expect(formatStandingsGap({ place: 1 })).toBe("Leader");
    expect(formatStandingsGap({ place: 5, lapsBehindLeader: 2 })).toBe("+2L");
    expect(formatStandingsGap({ place: 6, timeBehindLeader: 14.028 })).toBe("+14.028s");
  });

  it("formatStandingsPit renders garage and pit labels", () => {
    expect(formatStandingsPit({ inGarageStall: true })).toBe("GARAGE");
    expect(formatStandingsPit({ pitState: "EXITING" })).toBe("PIT");
    expect(formatStandingsPit({ pitting: true, inPits: false, inGarageStall: false, pitState: "NONE" })).toBe("PIT");
    expect(formatStandingsPit({ pitting: false, inPits: false, inGarageStall: false, pitState: "" })).toBe("");
  });

  it("formatStandingsGapForMode shows best lap in practice and qualifying", () => {
    expect(formatStandingsGapForMode("practice", { bestLapTime: 83.456 })).toBe("1:23.456");
    expect(formatStandingsGapForMode("qualifying", { bestLapTime: 90.123 })).toBe("1:30.123");
    expect(formatStandingsGapForMode("practice", { bestLapTime: 0 })).toBe("—");
  });

  it("formatStandingsGapForMode keeps race gaps unchanged", () => {
    expect(formatStandingsGapForMode("race", { place: 1 })).toBe("Leader");
    expect(formatStandingsGapForMode("race", { place: 5, lapsBehindLeader: 2 })).toBe("+2L");
    expect(formatStandingsGapForMode("race", { place: 6, timeBehindLeader: 14.028 })).toBe("+14.028s");
  });
});
