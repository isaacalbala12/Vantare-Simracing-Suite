import {
  densities,
  interfaceFonts,
  monoFonts,
  palettes,
  type SettingsPatch,
  type SettingsView,
  schemes,
  settingsFields,
} from "./generated/contract";
import { exact, integer, oneOf, record } from "./validation-common";

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
    range(appearance.contrast, 80, 120) &&
    range(appearance.glassOpacity, 50, 100) &&
    oneOf(appearance.interfaceFont, interfaceFonts) &&
    oneOf(appearance.monoFont, monoFonts) &&
    typeof appearance.reducedMotion === "boolean" &&
    typeof value.revision === "string" &&
    /^[0-9a-f]{64}$/.test(value.revision) &&
    integer(value.zoom) &&
    [90, 100, 110, 125].includes(value.zoom) &&
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
      return range(value.value, 80, 120);
    case "glassOpacity":
      return range(value.value, 50, 100);
    case "zoom":
      return integer(value.value) && [90, 100, 110, 125].includes(value.value);
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
