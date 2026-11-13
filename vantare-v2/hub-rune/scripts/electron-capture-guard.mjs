// QA-only entry: never attach this guard to the product executable.
import { app, dialog } from "electron";
// Installed before the product entry creates a BrowserWindow or handles ready-to-show.
// Accessory allows a hidden webContents to render; prohibited disallows windows entirely.
app.setActivationPolicy("accessory");
app.focus = () => {};
app.on("browser-window-created", (_event, window) => {
  const focusable = window.setFocusable.bind(window);
  window.setFocusable = () => focusable(false);
  window.setFocusable(false);
  window.webContents.setBackgroundThrottling(false);
  for (const method of [
    "show",
    "showInactive",
    "focus",
    "restore",
    "minimize",
    "moveTop",
  ]) {
    window[method] = () => {};
  }
  window.hide();
});
// Startup errors must be logged, never become a native modal dialog on Isaac's desktop.
dialog.showErrorBox = (title, message) => console.error(title, message);

if (
  process.platform !== "darwin" ||
  process.env.VANTARE_HUB_HOST !== "mock" ||
  !process.argv.some((arg) => arg.endsWith("/out-qa/main/capture-index.js"))
) {
  console.error(
    "Background reference capture requires macOS, scene host and the owned QA entry",
  );
  app.exit(1);
}
