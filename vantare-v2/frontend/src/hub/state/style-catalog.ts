import type { WidgetAppearance } from "../../lib/profile";

export type StyleEntry = {
  id: string;
  name: string;
  defaults: WidgetAppearance;
};

const CATALOG: Record<string, StyleEntry[]> = {
  telemetry: [
    {
      id: "vantare-racing",
      name: "Vantare Racing",
      defaults: {
        accentColor: "#9b2226",
        textColor: "#FFFFFF",
        backgroundColor: "#1a0104",
        borderColor: "#9b2226",
        rpmGreen: "#2ecc71",
        rpmYellow: "#f1c40f",
        rpmRed: "#e74c3c",
        rpmBlue: "#3498db",
        pedalThrottleColor: "#2ecc71",
        pedalBrakeColor: "#e74c3c",
      },
    },
  ],
  "telemetry-vertical": [
    {
      id: "vantare-racing",
      name: "Vantare Racing",
      defaults: {
        accentColor: "#9b2226",
        textColor: "#FFFFFF",
        backgroundColor: "#1a0104",
        borderColor: "#9b2226",
        rpmGreen: "#2ecc71",
        rpmYellow: "#f1c40f",
        rpmRed: "#e74c3c",
        rpmBlue: "#3498db",
        pedalThrottleColor: "#2ecc71",
        pedalBrakeColor: "#e74c3c",
        pedalClutchColor: "#3498db",
      },
    },
  ],
  standings: [
    {
      id: "vantare-racing",
      name: "Vantare Racing",
      defaults: {
        accentColor: "#9b2226",
        textColor: "#FFFFFF",
        backgroundColor: "#3a050a",
        borderColor: "#9b2226",
        posLeaderColor: "#f1c40f",
        pitColor: "#f1c40f",
        tireSoftColor: "#E63946",
        tireMediumColor: "#f1c40f",
        tireHardColor: "#ffffff",
      },
    },
  ],
  relative: [
    {
      id: "vantare-racing",
      name: "Vantare Racing",
      defaults: {
        accentColor: "#E63946",
        textColor: "#FFFFFF",
        backgroundColor: "#3a050a",
        borderColor: "#9b2226",
        gapAheadColor: "#f87171",
        gapBehindColor: "#4ade80",
        classHypercarColor: "#c1121f",
        classLmp2Color: "#0055A4",
        classLmp3Color: "#f59e0b",
        classGt3Color: "#2ecc71",
        classUnknownColor: "#6b7280",
      },
    },
  ],
  delta: [
    {
      id: "vantare-racing",
      name: "Vantare Racing",
      defaults: {
        positiveColor: "#e74c3c",
        negativeColor: "#2ecc71",
        textColor: "#FFFFFF",
        backgroundColor: "#000000",
      },
    },
  ],
  pedals: [
    {
      id: "vantare-racing",
      name: "Vantare Racing",
      defaults: {
        accentColor: "#9b2226",
        textColor: "#FFFFFF",
        backgroundColor: "transparent",
        pedalThrottleColor: "#34d399",
        pedalBrakeColor: "#e63946",
        pedalClutchColor: "#3aa6c8",
      },
    },
  ],
};

const FALLBACK: WidgetAppearance = {
  accentColor: "#9b2226",
  textColor: "#FFFFFF",
  backgroundColor: "#000000",
};

export function getStylesForType(widgetType: string): StyleEntry[] {
  return CATALOG[widgetType] ?? [];
}

export function getDefaultAppearance(widgetType: string, styleId: string): WidgetAppearance {
  const styles = CATALOG[widgetType] ?? [];
  const entry = styles.find((s) => s.id === styleId);
  return entry?.defaults ?? FALLBACK;
}
