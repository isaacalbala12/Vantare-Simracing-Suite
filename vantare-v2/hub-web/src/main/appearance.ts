import { type BrowserWindow, Notification, nativeTheme } from "electron";
import tokens from "../../design/tokens.json";
import type { SettingsView, ThemeBoot } from "../contract/generated/contract";
import { t } from "../renderer/i18n/es";
export function resolveTheme(theme: ThemeBoot) {
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
  theme: ThemeBoot,
  zoom: number,
) {
  if (window.isDestroyed()) return;
  if (nativeTheme.themeSource !== theme.scheme)
    nativeTheme.themeSource = theme.scheme;
  const colors = resolveTheme(theme);
  window.setBackgroundColor(colors["bg-window"]);
  window.setTitleBarOverlay({
    color: colors["bg-sidebar"],
    symbolColor: colors["text-1"],
    height: 52,
  });
  window.webContents.setZoomFactor(zoom / 100);
}
export function settingsTheme(view: SettingsView): ThemeBoot {
  const colors =
    tokens.themes[view.appearance.palette][
      view.appearance.scheme === "dark" ? "dark" : "light"
    ];
  return {
    palette: view.appearance.palette,
    scheme: view.appearance.scheme,
    window: colors["bg-window"],
    sidebar: colors["bg-sidebar"],
    text1: colors["text-1"],
  };
}
export function testNotification(view?: SettingsView): boolean {
  if (
    process.platform !== "win32" ||
    !view?.general.toasts ||
    !Notification.isSupported()
  )
    return false;
  try {
    new Notification({
      title: t("shell.noticeTestTitle"),
      body: t("shell.noticeTestBody"),
      silent: true,
    }).show();
    return true;
  } catch {
    return false;
  }
}
