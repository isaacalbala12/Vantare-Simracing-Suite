import type { WidgetAppearance } from "../../lib/profile";
import { getWidgetAppearance } from "../../lib/profile";
import { getDefaultAppearance } from "../../hub/state/style-catalog";

function getWidgetStyleForRender(props?: Record<string, unknown>): string {
  const explicit = props?.style;
  if (typeof explicit === "string" && explicit.trim() !== "") {
    return explicit;
  }

  const variant = props?.variant;
  if (variant && typeof variant === "object") {
    const themeId = (variant as { themeId?: unknown }).themeId;
    if (typeof themeId === "string" && themeId.trim() !== "") {
      return themeId;
    }
  }

  return "vantare-racing";
}

export function resolveWidgetAppearance(
  type: string,
  props?: Record<string, unknown>,
): { style: string; appearance: Required<WidgetAppearance> } {
  const style = getWidgetStyleForRender(props);
  const defaults = getDefaultAppearance(type, style);
  const overrides = getWidgetAppearance(props);

  return {
    style,
    appearance: {
      accentColor: overrides.accentColor ?? defaults.accentColor ?? "#9b2226",
      backgroundColor: overrides.backgroundColor ?? defaults.backgroundColor ?? "#000000",
      textColor: overrides.textColor ?? defaults.textColor ?? "#FFFFFF",
      borderColor: overrides.borderColor ?? defaults.borderColor ?? "#9b2226",
      opacity: overrides.opacity ?? defaults.opacity ?? 1,
      positiveColor: overrides.positiveColor ?? defaults.positiveColor ?? "#e74c3c",
      negativeColor: overrides.negativeColor ?? defaults.negativeColor ?? "#2ecc71",
      rpmGreen: overrides.rpmGreen ?? defaults.rpmGreen ?? "#2ecc71",
      rpmYellow: overrides.rpmYellow ?? defaults.rpmYellow ?? "#f1c40f",
      rpmRed: overrides.rpmRed ?? defaults.rpmRed ?? "#e74c3c",
      rpmBlue: overrides.rpmBlue ?? defaults.rpmBlue ?? "#3498db",
      pedalThrottleColor: overrides.pedalThrottleColor ?? defaults.pedalThrottleColor ?? "#2ecc71",
      pedalBrakeColor: overrides.pedalBrakeColor ?? defaults.pedalBrakeColor ?? "#e74c3c",
      pedalClutchColor: overrides.pedalClutchColor ?? defaults.pedalClutchColor ?? "#3498db",
      posLeaderColor: overrides.posLeaderColor ?? defaults.posLeaderColor ?? "#f1c40f",
      pitColor: overrides.pitColor ?? defaults.pitColor ?? "#f1c40f",
      tireSoftColor: overrides.tireSoftColor ?? defaults.tireSoftColor ?? "#E63946",
      tireMediumColor: overrides.tireMediumColor ?? defaults.tireMediumColor ?? "#f1c40f",
      tireHardColor: overrides.tireHardColor ?? defaults.tireHardColor ?? "#ffffff",
      gapAheadColor: overrides.gapAheadColor ?? defaults.gapAheadColor ?? "#f87171",
      gapBehindColor: overrides.gapBehindColor ?? defaults.gapBehindColor ?? "#4ade80",
      classHypercarColor: overrides.classHypercarColor ?? defaults.classHypercarColor ?? "#c1121f",
      classHypercarFg: overrides.classHypercarFg ?? defaults.classHypercarFg ?? "#f87171",
      classLmp2Color: overrides.classLmp2Color ?? defaults.classLmp2Color ?? "#0055A4",
      classLmp2Fg: overrides.classLmp2Fg ?? defaults.classLmp2Fg ?? "#60a5fa",
      classLmp3Color: overrides.classLmp3Color ?? defaults.classLmp3Color ?? "#f59e0b",
      classLmp3Fg: overrides.classLmp3Fg ?? defaults.classLmp3Fg ?? "#22d3ee",
      classGt3Color: overrides.classGt3Color ?? defaults.classGt3Color ?? "#2ecc71",
      classGt3Fg: overrides.classGt3Fg ?? defaults.classGt3Fg ?? "#fbbf24",
      classGt4Color: overrides.classGt4Color ?? defaults.classGt4Color ?? "rgba(244,114,182,0.25)",
      classGt4Fg: overrides.classGt4Fg ?? defaults.classGt4Fg ?? "#f472b6",
      classUnknownColor: overrides.classUnknownColor ?? defaults.classUnknownColor ?? "#6b7280",
      classUnknownFg: overrides.classUnknownFg ?? defaults.classUnknownFg ?? "#6b7280",
    },
  };
}
