// QA-only viewer for the local design prototype. No preload or product IPC.
const { app, BrowserWindow } = require("electron");
const [html, profile, width, height] = process.argv.slice(2);
app.setPath("userData", profile);
app.commandLine.appendSwitch("remote-debugging-port", "0");
app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
app.commandLine.appendSwitch("force-device-scale-factor", "1");
let referenceWindow;
app.whenReady().then(async () => {
  referenceWindow = new BrowserWindow({
    width: Number(width),
    height: Number(height),
    useContentSize: true,
    frame: false,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  referenceWindow.webContents.session.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*"] },
    (_details, callback) => callback({ cancel: true }),
  );
  await referenceWindow.loadFile(html);
});
app.on("window-all-closed", () => app.quit());
