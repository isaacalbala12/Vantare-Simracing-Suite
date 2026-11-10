import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  MessageChannelMain,
  net,
  protocol,
  session,
} from "electron";
import { hello, mockReply } from "./mock-host";
import { assetPath, CSP, isAppDocument } from "./security";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
const dataDir = process.env.VANTARE_HUB_DATA_DIR;
if (!dataDir || !requireAbsolute(dataDir))
  throw new Error("VANTARE_HUB_DATA_DIR must be absolute");
app.setPath("userData", join(dataDir, "hub-ui"));
app.setPath("sessionData", join(dataDir, "hub-ui"));
function requireAbsolute(path: string) {
  return resolve(path) === path || /^[A-Za-z]:[\\/]/.test(path);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let window: BrowserWindow | undefined;
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.on("window-all-closed", () => app.quit());
  void app
    .whenReady()
    .then(async () => {
      if (process.env.VANTARE_HUB_HOST !== "mock")
        throw new Error("Only the explicit mock host is available in step 1");
      const renderer = resolve(import.meta.dirname, "../renderer");
      protocol.handle("app", async (request) => {
        const relative = assetPath(request.url);
        if (!relative) return new Response(null, { status: 403 });
        const file = resolve(renderer, relative);
        if (!file.startsWith(renderer + sep))
          return new Response(null, { status: 403 });
        try {
          const response = await net.fetch(pathToFileURL(file).href);
          const headers = new Headers(response.headers);
          headers.set("Content-Security-Policy", CSP);
          return new Response(response.body, {
            status: response.status,
            headers,
          });
        } catch {
          return new Response(null, { status: 404 });
        }
      });
      session.defaultSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      Menu.setApplicationMenu(null);
      window = new BrowserWindow({
        ...hello.window,
        minWidth: 1280,
        minHeight: 720,
        show: false,
        backgroundColor: hello.theme.window,
        title: "Vantare · Hub",
        titleBarStyle: "hidden",
        titleBarOverlay: {
          color: hello.theme.sidebar,
          symbolColor: hello.theme.text1,
          height: 52,
        },
        webPreferences: {
          preload: join(import.meta.dirname, "../preload/index.cjs"),
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          webviewTag: false,
          webSecurity: true,
          spellcheck: false,
          v8CacheOptions: "bypassHeatCheck",
          backgroundThrottling: true,
          devTools: !app.isPackaged,
        },
      });
      const contents = window.webContents;
      const devUrl = !app.isPackaged
        ? process.env.ELECTRON_RENDERER_URL
        : undefined;
      const allowed = (value: string) =>
        isAppDocument(value) ||
        (devUrl !== undefined &&
          new URL(value).origin === new URL(devUrl).origin);
      contents.on("will-navigate", (event, url) => {
        if (!allowed(url)) event.preventDefault();
      });
      contents.on("will-redirect", (event, url) => {
        if (!allowed(url)) event.preventDefault();
      });
      contents.setWindowOpenHandler(() => ({ action: "deny" }));
      ipcMain.on("vantare:connect", (event) => {
        if (
          event.sender !== contents ||
          event.senderFrame !== contents.mainFrame ||
          !allowed(event.senderFrame.url)
        )
          return;
        const { port1, port2 } = new MessageChannelMain();
        port1.on("message", ({ data }) => {
          const response = mockReply(data);
          if (response) port1.postMessage(response);
        });
        port1.start();
        contents.once("destroyed", () => port1.close());
        event.senderFrame.postMessage("vantare:port", null, [port2]);
      });
      window.once("ready-to-show", () => {
        window?.show();
        if (hello.window.minimized) window?.minimize();
      });
      if (devUrl) await window.loadURL(devUrl);
      else await window.loadURL("app://hub/");
    })
    .catch(() => {
      console.error("Hub initialization failed");
      app.exit(1);
    });
}
