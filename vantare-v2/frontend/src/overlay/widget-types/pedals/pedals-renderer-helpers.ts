import type { CSSProperties } from "react";

export const PEDALS_DEFAULT_APPEARANCE = {
  transparentBackground: true,
  pedalThrottleColor: "#2ecc71",
  pedalBrakeColor: "#e74c3c",
  pedalClutchColor: "#3498db",
} as const;

function readColor(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

export function buildPedalsAppearanceStyle(
  settings: Readonly<Record<string, unknown>>,
): CSSProperties {
  return {
    "--vo-pedal-throttle": readColor(
      settings.pedalThrottleColor,
      PEDALS_DEFAULT_APPEARANCE.pedalThrottleColor,
    ),
    "--vo-pedal-brake": readColor(settings.pedalBrakeColor, PEDALS_DEFAULT_APPEARANCE.pedalBrakeColor),
    "--vo-pedal-clutch": readColor(settings.pedalClutchColor, PEDALS_DEFAULT_APPEARANCE.pedalClutchColor),
    "--vc-pedal-throttle": readColor(
      settings.pedalThrottleColor,
      PEDALS_DEFAULT_APPEARANCE.pedalThrottleColor,
    ),
    "--vc-pedal-brake": readColor(settings.pedalBrakeColor, PEDALS_DEFAULT_APPEARANCE.pedalBrakeColor),
    "--vc-pedal-clutch": readColor(settings.pedalClutchColor, PEDALS_DEFAULT_APPEARANCE.pedalClutchColor),
  } as CSSProperties;
}

export function resolvePedalColor(
  pedal: "throttle" | "brake" | "clutch",
  settings: Readonly<Record<string, unknown>>,
): string {
  switch (pedal) {
    case "throttle":
      return readColor(settings.pedalThrottleColor, PEDALS_DEFAULT_APPEARANCE.pedalThrottleColor);
    case "brake":
      return readColor(settings.pedalBrakeColor, PEDALS_DEFAULT_APPEARANCE.pedalBrakeColor);
    case "clutch":
      return readColor(settings.pedalClutchColor, PEDALS_DEFAULT_APPEARANCE.pedalClutchColor);
  }
}