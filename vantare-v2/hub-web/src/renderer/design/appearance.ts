import tokens from "../../../design/tokens.json";
import type {
  AppearanceSettings,
  SettingsView,
} from "../../contract/generated/contract";

const sans = {
  inter: 'Inter, "Segoe UI Variable", "Segoe UI", sans-serif',
  segoe: '"Segoe UI Variable", "Segoe UI", sans-serif',
  arial: "Arial, sans-serif",
};
const mono = {
  cascadia: '"Space Mono", monospace',
  consolas: 'Consolas, "Space Mono", monospace',
  courier: '"Courier New", monospace',
};
function mix(from: string, to: string, strength: number): string {
  const channel = (value: string, index: number) =>
    Number.parseInt(value.slice(index, index + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map((index) =>
        Math.round(
          channel(from, index) +
            (channel(to, index) - channel(from, index)) * strength,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function alpha(color: string, factor: number): string {
  return (
    color.slice(0, 7) +
    Math.min(255, Math.round(Number.parseInt(color.slice(7, 9), 16) * factor))
      .toString(16)
      .padStart(2, "0")
  );
}
export function applyAppearance(
  appearance: AppearanceSettings,
  density: SettingsView["general"]["density"],
  zoom: number,
) {
  const root = document.documentElement;
  const scheme =
    appearance.scheme === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : appearance.scheme;
  root.style.setProperty(
    "--density",
    String({ compact: 0.875, balanced: 1, comfortable: 1.125 }[density]),
  );
  root.dataset.palette = appearance.palette;
  root.dataset.scheme = scheme;
  root.dataset.density = density;
  root.dataset.motion = appearance.reducedMotion ? "reduced" : "full";
  root.style.setProperty("--contrast", String(appearance.contrast / 100));
  root.style.setProperty("--glass", String(appearance.glassOpacity / 100));
  root.style.setProperty("--font-sans", sans[appearance.interfaceFont]);
  root.style.setProperty("--font-mono", mono[appearance.monoFont]);
  const colors = tokens.themes[appearance.palette][scheme];
  const strength = Math.abs(appearance.contrast - 100) / 100;
  const target =
    appearance.contrast > 100 ? colors["text-1"] : colors["bg-base"];
  for (const name of ["text-2", "text-3", "text-caption"] as const)
    root.style.setProperty(`--${name}`, mix(colors[name], target, strength));
  for (const name of ["line-1", "line-2", "line-3"] as const)
    root.style.setProperty(
      `--${name}`,
      alpha(colors[name], appearance.contrast / 100),
    );
  root.style.setProperty(
    "--surface-panel",
    alpha(colors["surface-panel"], appearance.glassOpacity / 80),
  );
  if (!window.vantare) root.style.zoom = String(zoom / 100);
}
export function applySettings(view: SettingsView) {
  applyAppearance(view.appearance, view.general.density, view.zoom);
}
