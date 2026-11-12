import { type BrowserWindow, nativeTheme } from "electron";
import { presentSystemNotice } from "./system-notifications";
import tokens from "../../design/tokens.json";
import type { SettingsView, ThemeBoot } from "../contract/generated/contract";
import { t } from "../renderer/i18n/es";
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
  window.webContents.setZoomFactor(zoom / 100);
}
export function testNotification(view?: SettingsView): boolean {
  if (!view?.general.toasts) return false;
  return presentSystemNotice({ title: t("shell.noticeTestTitle"), body: t("shell.noticeTestBody"), silent: true });
}
