import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { VantareV3StandingsHeader } from "./vantare-v3-standings-header";
import type { WidgetAppearance } from "../../../lib/profile";

const baseAppearance: Required<WidgetAppearance> = {
  accentColor: "#9b2226",
  backgroundColor: "#000000",
  textColor: "#ffffff",
  borderColor: "#9b2226",
  opacity: 1,
  positiveColor: "#e74c3c",
  negativeColor: "#2ecc71",
  rpmGreen: "#2ecc71",
  rpmYellow: "#f1c40f",
  rpmRed: "#e74c3c",
  rpmBlue: "#3498db",
  pedalThrottleColor: "#2ecc71",
  pedalBrakeColor: "#e74c3c",
  pedalClutchColor: "#3498db",
  posLeaderColor: "#f1c40f",
  pitColor: "#f1c40f",
  tireSoftColor: "#E63946",
  tireMediumColor: "#f1c40f",
  tireHardColor: "#ffffff",
  gapAheadColor: "#f87171",
  gapBehindColor: "#4ade80",
  classHypercarColor: "#c1121f",
  classHypercarFg: "#f87171",
  classLmp2Color: "#0055A4",
  classLmp2Fg: "#60a5fa",
  classLmp3Color: "#f59e0b",
  classLmp3Fg: "#22d3ee",
  classGt3Color: "#2ecc71",
  classGt3Fg: "#fbbf24",
  classGt4Color: "rgba(244,114,182,0.25)",
  classGt4Fg: "#f472b6",
  classUnknownColor: "#6b7280",
  classUnknownFg: "#6b7280",
};

describe("VantareV3StandingsHeader", () => {
  afterEach(() => cleanup());

  it("renders with default text when no time provided", () => {
    const { getByTestId } = render(
      <VantareV3StandingsHeader data={{}} appearance={baseAppearance} />,
    );
    expect(getByTestId("vantare-v3-standings-header").textContent).toBe("Vantare v3");
  });

  it("renders the provided time", () => {
    const { getByTestId } = render(
      <VantareV3StandingsHeader data={{ time: "01:23:45" }} appearance={baseAppearance} />,
    );
    expect(getByTestId("vantare-v3-standings-header").textContent).toBe("01:23:45");
  });

  it("uses appearance colors for chrome", () => {
    const { getByTestId } = render(
      <VantareV3StandingsHeader data={{}} appearance={baseAppearance} />,
    );
    const el = getByTestId("vantare-v3-standings-header") as HTMLElement;
    expect(el.style.color).toBe("#ffffff");
    expect(el.style.borderBottom).toContain("#9b2226");
  });
});
