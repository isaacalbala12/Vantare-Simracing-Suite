// QA-only entry: never attach this guard to the product executable.
const { app } = require("electron");
if (process.platform !== "darwin" || process.env.VANTARE_HUB_HOST !== "mock") {
  throw new Error("Background reference capture requires macOS and the scene host");
}
const entry = process.argv[2];
if (!entry || !entry.endsWith("/out-qa/main/index.js")) {
  throw new Error("Only the owned QA build is accepted");
}
// Installed before the product entry creates a BrowserWindow or handles ready-to-show.
app.setActivationPolicy("prohibited");
app.focus = () => {};
app.on("browser-window-created", (_event, window) => {
  const focusable = window.setFocusable.bind(window);
  window.setFocusable = () => focusable(false);
  window.setFocusable(false);
  window.webContents.setBackgroundThrottling(false);
  for (const method of ["show", "showInactive", "focus", "restore", "moveTop"]) {
    window[method] = () => {};
  }
  window.hide();
});
require(entry);
