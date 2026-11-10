import {
  contrastRange,
  densities,
  glassOpacityRange,
  interfaceFonts,
  monoFonts,
  palettes,
  type SettingsPatch,
  type SettingsView,
  schemes,
  settingsFields,
  zoomLevels,
} from "./generated/contract";
import { exact, integer, oneOf, record } from "./validation-common";

const zoomValues: readonly number[] = zoomLevels;
export function isZoom(value: unknown): value is number {
  return integer(value) && zoomValues.includes(value);
}
function range(value: unknown, min: number, max: number) {
  return integer(value) && value >= min && value <= max;
}
export function isSettings(value: unknown): value is SettingsView {
  if (
    !record(value) ||
    !exact(value, [
      "version",
      "general",
      "appearance",
      "zoom",
      "revision",
      "protected",
      "canRetry",
      "warning",
      "startup",
    ])
  )
    return false;
  const { general, appearance, startup } = value;
  return (
    typeof value.version === "string" &&
    value.version.length <= 128 &&
    record(general) &&
    exact(general, [
      "onboarding_completed",
      "density",
      "minimized",
      "updates",
      "launcher",
      "toasts",
    ]) &&
    oneOf(general.density, densities) &&
    [
      general.onboarding_completed,
      general.minimized,
      general.updates,
      general.launcher,
      general.toasts,
    ].every((item) => typeof item === "boolean") &&
    record(appearance) &&
    exact(appearance, [
      "palette",
      "scheme",
      "contrast",
      "glassOpacity",
      "interfaceFont",
      "monoFont",
      "reducedMotion",
    ]) &&
    oneOf(appearance.palette, palettes) &&
    oneOf(appearance.scheme, schemes) &&
    range(appearance.contrast, ...contrastRange) &&
    range(appearance.glassOpacity, ...glassOpacityRange) &&
    oneOf(appearance.interfaceFont, interfaceFonts) &&
    oneOf(appearance.monoFont, monoFonts) &&
    typeof appearance.reducedMotion === "boolean" &&
    typeof value.revision === "string" &&
    /^[0-9a-f]{64}$/.test(value.revision) &&
    integer(value.zoom) &&
    isZoom(value.zoom) &&
    [value.protected, value.canRetry, value.warning].every(
      (item) => typeof item === "boolean",
    ) &&
    record(startup) &&
    exact(startup, ["supported", "enabled"]) &&
    typeof startup.supported === "boolean" &&
    typeof startup.enabled === "boolean"
  );
}
function exhaustive(_value: never): false {
  return false;
}
export function isSettingsPatch(value: unknown): value is SettingsPatch {
  if (!record(value) || !exact(value, ["field", "value"])) return false;
  const field = value.field;
  if (!oneOf(field, settingsFields)) return false;
  switch (field) {
    case "density":
      return oneOf(value.value, densities);
    case "palette":
      return oneOf(value.value, palettes);
    case "scheme":
      return oneOf(value.value, schemes);
    case "interfaceFont":
      return oneOf(value.value, interfaceFonts);
    case "monoFont":
      return oneOf(value.value, monoFonts);
    case "contrast":
      return range(value.value, ...contrastRange);
    case "glassOpacity":
      return range(value.value, ...glassOpacityRange);
    case "zoom":
      return integer(value.value) && isZoom(value.value);
    case "minimized":
    case "updates":
    case "launcher":
    case "toasts":
    case "reducedMotion":
    case "startup":
      return typeof value.value === "boolean";
    default:
      return exhaustive(field);
  }
}
