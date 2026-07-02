import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DeltaWidget, formatDelta, formatLapTime } from "./DeltaWidget";


describe("DeltaWidget", () => {
  afterEach(() => {
    cleanup();
  });

  it("applies glassmorphism style from variant themeId", () => {
    const { container } = render(
      <DeltaWidget
        editMode
        telemetryMode="mock"
        props={{
          variant: { themeId: "glassmorphism-pro" },
        }}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.backdropFilter).toBe("blur(24px)");
    expect(root.style.borderRadius).toBe("16px");
  });

  it("renders delta value and target info in edit mode", () => {
    render(
      <DeltaWidget editMode={true} updateHz={30} />,
    );
    expect(screen.getByText(/Target/)).toBeTruthy();
    expect(screen.getByText(/Lap/)).toBeTruthy();
  });

  it("formats positive and negative backend delta values", () => {
    expect(formatDelta(1.234)).toBe("+1.234s");
    expect(formatDelta(-0.456)).toBe("-0.456s");
    expect(formatDelta(0)).toBe("—");
  });

  describe("formatLapTime", () => {
    it("returns dash for invalid, negative, zero or infinite inputs", () => {
      expect(formatLapTime(undefined)).toBe("—");
      expect(formatLapTime(0)).toBe("—");
      expect(formatLapTime(-15.4)).toBe("—");
      expect(formatLapTime(NaN)).toBe("—");
      expect(formatLapTime(Infinity)).toBe("—");
    });

    it("formats standard lap times correctly", () => {
      expect(formatLapTime(84.350)).toBe("1:24.350");
      expect(formatLapTime(90.876)).toBe("1:30.876");
      expect(formatLapTime(65.045)).toBe("1:05.045");
      expect(formatLapTime(125.123)).toBe("2:05.123");
    });

    it("handles rounding edge cases correctly", () => {
      // 59.9999 seconds should round to 60.000, which carries over to 1 minute
      expect(formatLapTime(59.9999)).toBe("1:00.000");
      // 119.9999 seconds should round to 120.000, which carries over to 2 minutes
      expect(formatLapTime(119.9999)).toBe("2:00.000");
      // 65.0454 seconds should round down to 65.045
      expect(formatLapTime(65.0454)).toBe("1:05.045");
    });

    it("pads seconds with leading zero when less than 10", () => {
      expect(formatLapTime(5.045)).toBe("0:05.045");
      expect(formatLapTime(60.005)).toBe("1:00.005");
    });
  });
});
