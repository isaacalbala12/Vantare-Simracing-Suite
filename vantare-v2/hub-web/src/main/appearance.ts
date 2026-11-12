import { type BrowserWindow, nativeTheme } from "electron";
import tokens from "../../design/tokens.json";
import type { SettingsView, ThemeBoot } from "../contract/generated/contract";
import { t } from "../renderer/i18n/es";
import { effectiveZoom } from "../window-zoom";
import { presentSystemNotice } from "./system-notifications";
export function resolveTheme(theme: Pick<ThemeBoot, "palette" | "scheme">) {
  const scheme =
    theme.scheme === "system"
      ? nativeTheme.shouldUseDarkColors
        ? "dark"
        : "light"
      : theme.scheme;
  return tokens.themes[theme.palette][scheme];
}
export function paintWindow(
  window: BrowserWindow,
  theme: Pick<ThemeBoot, "palette" | "scheme">,
  zoom: number,
) {
  if (window.isDestroyed()) return;
  if (nativeTheme.themeSource !== theme.scheme)
    nativeTheme.themeSource = theme.scheme;
  const colors = resolveTheme(theme);
  window.setBackgroundColor(colors["bg-window"]);
  const [width, height] = window.getContentSize();
  const factor = effectiveZoom(zoom, width, height) / 100;
  if (Math.abs(window.webContents.getZoomFactor() - factor) > 0.00001)
    window.webContents.setZoomFactor(factor);
}
export function testNotification(
  view?: SettingsView,
  present = presentSystemNotice,
): boolean {
  if (!view?.general.toasts) return false;
  return present({
    title: t("shell.noticeTestTitle"),
    body: t("shell.noticeTestBody"),
    silent: true,
  });
}
