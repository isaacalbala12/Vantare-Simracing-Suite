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
    {
      id: "vantare-crystal",
      name: "Vantare Crystal",
      defaults: {
        accentColor: "#e63946",
        textColor: "#ffffff",
        backgroundColor: "#121216",
        borderColor: "rgba(255,255,255,0.09)",
        pedalThrottleColor: "#22c55e",
        pedalBrakeColor: "#ff2a3b",
        pedalClutchColor: "#f59e0b",
        rpmGreen: "#22c55e",
        rpmYellow: "#f59e0b",
        rpmRed: "#ff2a3b",
        rpmBlue: "#3498db",
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
    {
      id: "vantare-crystal",
      name: "Vantare Crystal",
      defaults: {
        accentColor: "#e63946",
        textColor: "#ffffff",
        backgroundColor: "#121216",
        borderColor: "rgba(255,255,255,0.09)",
        pedalThrottleColor: "#22c55e",
        pedalBrakeColor: "#ff2a3b",
        pedalClutchColor: "#f59e0b",
        rpmGreen: "#22c55e",
        rpmYellow: "#f59e0b",
        rpmRed: "#ff2a3b",
        rpmBlue: "#3498db",
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
    {
      id: "vantare-crystal",
      name: "Vantare Crystal",
      defaults: {
        accentColor: "#e63946",
        textColor: "#ffffff",
        backgroundColor: "#121216",
        borderColor: "rgba(255,255,255,0.09)",
        posLeaderColor: "#f1c40f",
        pitColor: "#f59e0b",
        tireSoftColor: "#ff4d4d",
        tireMediumColor: "#facc15",
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
    {
      id: "vantare-crystal",
      name: "Vantare Crystal",
      defaults: {
        accentColor: "#e63946",
        textColor: "#ffffff",
        backgroundColor: "#121216",
        borderColor: "rgba(255,255,255,0.09)",
        gapAheadColor: "#ff4d4d",
        gapBehindColor: "#34d399",
        classHypercarColor: "#ff2a3b",
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
    {
      id: "vantare-crystal",
      name: "Vantare Crystal",
      defaults: {
        accentColor: "#e63946",
        textColor: "#ffffff",
        backgroundColor: "#121216",
        borderColor: "rgba(255,255,255,0.09)",
        positiveColor: "#ff2a3b",
        negativeColor: "#22c55e",
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
    {
      id: "vantare-crystal",
      name: "Vantare Crystal",
      defaults: {
        accentColor: "#e63946",
        textColor: "#ffffff",
        backgroundColor: "transparent",
        borderColor: "rgba(255,255,255,0.09)",
        pedalThrottleColor: "#22c55e",
        pedalBrakeColor: "#ff2a3b",
        pedalClutchColor: "#f59e0b",
        rpmGreen: "#22c55e",
        rpmYellow: "#f59e0b",
        rpmRed: "#ff2a3b",
        rpmBlue: "#3498db",
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
