import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnConfig } from "../../lib/profile";
import { createDefaultStandingsColumns } from "./standings-catalog";
import { getStandingsIntrinsicWidth } from "./standings-format";
import { StandingsWidget, formatStandingsGap, formatStandingsGapForMode, formatStandingsPit } from "./StandingsWidget";

function variantColumns(overrides: Partial<ColumnConfig>[]): ColumnConfig[] {
  const defaults = createDefaultStandingsColumns();
  return defaults.map((column, index) => ({ ...column, ...overrides[index] }));
}

function standingsVariant(columns: ColumnConfig[]) {
  return { id: "variant-standings-default", templateId: "standings-vantare-default", columns };
}

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

  it("renders only enabled columns from props.variant", () => {
    const columns = variantColumns([
      { enabled: true },   // position
      { enabled: true },   // driverNumber
      { enabled: true },   // driverName
      { enabled: false },  // gap
      { enabled: false },  // vehicleClass
      { enabled: false },  // currentLap
      { enabled: false },  // interval
      { enabled: false },  // bestLap
      { enabled: false },  // lastLap
    ]);
    render(
      <StandingsWidget editMode={true} updateHz={15} props={{ variant: standingsVariant(columns) }} />,
    );
    tick(100);
    const panel = screen.getByTestId("standings-panel");
    expect(panel.textContent).toContain("ALPINE");
    expect(panel.textContent).toContain("36");
    expect(panel.textContent).not.toContain("1:29.823");
  });

  it("falls back to default columns when variant is missing", () => {
    render(<StandingsWidget editMode={true} updateHz={15} />);
    tick(100);
    const panel = screen.getByTestId("standings-panel");
    expect(panel.textContent).toContain("ALPINE");
    expect(panel.textContent).toContain("36");
  });

  it("respects column width from the variant", () => {
    const columns = variantColumns([
      { enabled: true, width: 40 },   // position
      { enabled: true, width: 60 },   // driverNumber
      { enabled: true, width: 200 },  // driverName
      { enabled: false },             // gap
      { enabled: false },             // vehicleClass
      { enabled: false },             // currentLap
      { enabled: false },             // interval
      { enabled: false },             // bestLap
      { enabled: false },             // lastLap
    ]);
    const { container } = render(
      <StandingsWidget editMode={true} updateHz={15} props={{ variant: standingsVariant(columns) }} />,
    );
    tick(100);
    const row = container.querySelector("[data-testid='standings-panel'] [data-standings-row]") as HTMLElement | null;
    expect(row).toBeTruthy();
    const nameCell = row?.querySelector("[data-standings-col='driverName']") as HTMLElement | null;
    expect(nameCell).toBeTruthy();
    expect(nameCell?.style.width).toBe("200px");
  });

  it("truncates driver name when format mode is truncate", () => {
    const columns = variantColumns([
      { enabled: true },                                             // position
      { enabled: true },                                             // driverNumber
      { enabled: true, format: { mode: "truncate", maxChars: 4 } },  // driverName
      { enabled: false },                                            // gap
      { enabled: false },                                            // vehicleClass
      { enabled: false },                                            // currentLap
      { enabled: false },                                            // interval
      { enabled: false },                                            // bestLap
      { enabled: false },                                            // lastLap
    ]);
    render(
      <StandingsWidget editMode={true} updateHz={15} props={{ variant: standingsVariant(columns) }} />,
    );
    tick(100);
    const panel = screen.getByTestId("standings-panel");
    expect(panel.textContent).toContain("ALP…");
    expect(panel.textContent).not.toContain("ALPINE");
  });

  it("renders bestLap column with full lap time when enabled", () => {
    const defaults = createDefaultStandingsColumns();
    const columns = defaults.map((c) =>
      c.id === "bestLap" ? { ...c, enabled: true } : { ...c, enabled: c.id === "position" || c.id === "driverNumber" },
    );
    render(
      <StandingsWidget editMode={true} updateHz={15} props={{ variant: standingsVariant(columns) }} />,
    );
    tick(100);
    const panel = screen.getByTestId("standings-panel");
    expect(panel.textContent).toContain("1:29.823");
  });

  it("skips unknown column ids without crashing", () => {
    const columns: ColumnConfig[] = [
      { id: "position", metricId: "position", enabled: true, width: 28 },
      { id: "ghost", metricId: "ghost", enabled: true, width: 50 },
      { id: "driverName", metricId: "driverName", enabled: true, width: 132 },
    ];
    render(
      <StandingsWidget editMode={true} updateHz={15} props={{ variant: standingsVariant(columns) }} />,
    );
    tick(100);
    const panel = screen.getByTestId("standings-panel");
    expect(panel.textContent).toContain("ALPINE");
    expect(panel.textContent).not.toContain("ghost");
  });

  it("applies glassmorphism style from variant themeId", () => {
    render(
      <StandingsWidget
        editMode
        telemetryMode="mock"
        props={{
          variant: { themeId: "glassmorphism-pro" },
          __previewFillHost: false,
        }}
      />,
    );
    tick(100);
    const panel = screen.getByTestId("standings-panel");
    expect((panel as HTMLElement).style.backdropFilter).toBe("blur(24px)");
    expect((panel as HTMLElement).style.borderRadius).toBe("16px");
  });

  it("does not depend on or mutate widget position", () => {
    const columns = variantColumns([
      { enabled: true },   // position
      { enabled: true },   // driverNumber
      { enabled: true },   // driverName
      { enabled: true },   // gap
      { enabled: false },  // vehicleClass
      { enabled: false },  // currentLap
      { enabled: false },  // interval
      { enabled: true },   // bestLap
      { enabled: false },  // lastLap
    ]);
    const { container } = render(
      <StandingsWidget editMode={true} updateHz={15} props={{ variant: standingsVariant(columns) }} />,
    );
    tick(100);
    const panel = container.querySelector("[data-testid='standings-panel']") as HTMLElement;
    expect(panel.style.left).toBe("");
    expect(panel.style.top).toBe("");
    expect(panel.style.width).toBe("");
  });

  it("uses race mock scenario when provided", () => {
    render(<StandingsWidget editMode={true} updateHz={15} mockSessionScenario="race" />);
    tick(100);

    const panel = screen.getByTestId("standings-panel");
    expect(panel.textContent).toContain("Leader");
    expect(panel.textContent).toContain("+1.430s");
  });

  it("uses practice mock scenario when provided", () => {
    render(<StandingsWidget editMode={true} updateHz={15} mockSessionScenario="practice" />);
    tick(100);

    const panel = screen.getByTestId("standings-panel");
    expect(panel.textContent).toContain("1:29.823");
  });

  it("uses qualifying mock scenario when provided", () => {
    render(<StandingsWidget editMode={true} updateHz={15} mockSessionScenario="qual" />);
    tick(100);

    const panel = screen.getByTestId("standings-panel");
    expect(panel.textContent).toContain("1:29.823");
  });

  it("wraps intrinsic width when preview fill host is disabled", () => {
    const columns = createDefaultStandingsColumns();
    const intrinsicWidth = getStandingsIntrinsicWidth(columns);
    render(
      <StandingsWidget
        editMode={true}
        updateHz={15}
        props={{ __previewFillHost: false, variant: standingsVariant(columns) }}
      />,
    );
    tick(100);

    const panel = screen.getByTestId("standings-panel");
    expect(panel.className).not.toContain("w-full");
    expect(panel.style.width).toBe(`${intrinsicWidth}px`);
  });

  it("fills the host by default without preview fill host context", () => {
    render(
      <StandingsWidget
        editMode={true}
        updateHz={15}
        props={{ variant: standingsVariant(createDefaultStandingsColumns()) }}
      />,
    );
    tick(100);

    const panel = screen.getByTestId("standings-panel");
    expect(panel.className).toContain("w-full");
    expect(panel.style.width).toBe("");
  });
});
