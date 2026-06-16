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
    const leader = { id: 1, lapsBehindLeader: 0, timeBehindLeader: 0 };
    expect(formatStandingsGap({ id: 1 }, leader)).toBe("Leader");
    expect(formatStandingsGap({ id: 2, lapsBehindLeader: 2 }, leader)).toBe("+2L");
    expect(formatStandingsGap({ id: 3, timeBehindLeader: 14.028 }, leader)).toBe("+14.028s");
  });

  it("formatStandingsPit renders garage and pit labels", () => {
    expect(formatStandingsPit({ inGarageStall: true })).toBe("GARAGE");
    expect(formatStandingsPit({ pitState: "EXITING" })).toBe("PIT");
    expect(formatStandingsPit({ pitting: true, inPits: false, inGarageStall: false, pitState: "NONE" })).toBe("PIT");
    expect(formatStandingsPit({ pitting: false, inPits: false, inGarageStall: false, pitState: "" })).toBe("");
  });

  it("formatStandingsGapForMode shows best lap in practice and qual", () => {
    const leader = { id: 1 };
    expect(formatStandingsGapForMode("practice", { bestLapTime: 83.456 }, leader)).toBe("1:23.456");
    expect(formatStandingsGapForMode("qual", { bestLapTime: 90.123 }, leader)).toBe("1:30.123");
    expect(formatStandingsGapForMode("practice", { bestLapTime: 0 }, leader)).toBe("—");
  });

  it("formatStandingsGapForMode keeps race gaps unchanged", () => {
    const leader = { id: 1, lapsBehindLeader: 0, timeBehindLeader: 0 };
    expect(formatStandingsGapForMode("race", { id: 1 }, leader)).toBe("Leader");
    expect(formatStandingsGapForMode("race", { id: 2, lapsBehindLeader: 2 }, leader)).toBe("+2L");
    expect(formatStandingsGapForMode("race", { id: 3, timeBehindLeader: 14.028 }, leader)).toBe("+14.028s");
  });
  it("does not replace gap text with PIT label", () => {
    const leader = { id: 1, bestLapTime: 90.0 };
    const v = { id: 2, place: 5, inPits: true, bestLapTime: 95.5 };
    expect(formatStandingsGapForMode("practice", v, leader)).toBe("1:35.500");
  });

  it("formatStandingsPit still detects pit state", () => {
    expect(formatStandingsPit({ inPits: true })).toBe("PIT");
    expect(formatStandingsPit({ inPits: false })).toBe("");
  });
});
