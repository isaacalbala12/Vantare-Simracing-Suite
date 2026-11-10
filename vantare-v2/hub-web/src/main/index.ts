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
import { HOST_PROTOCOL_VERSION } from "../contract/generated/contract";
import { bounded, isUiMessage } from "../contract/validation";
import { createHost } from "./host";
import { assetPath, CSP, developmentUrl, isAppDocument } from "./security";

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
      const host = createHost();
      const hello = await host.hello;
      const compatible = hello.version === HOST_PROTOCOL_VERSION;
      if (compatible)
        host.send({ kind: "hello", version: HOST_PROTOCOL_VERSION });
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
        ? developmentUrl(process.env.ELECTRON_RENDERER_URL)
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
      let disconnect: (() => void) | undefined;
      const removeHostFailure = host.listen((message) => {
        if (
          message.kind === "failure" &&
          message.id === 0 &&
          message.error.kind === "coreUnavailable"
        )
          window?.destroy();
      });
      contents.once("destroyed", () => {
        disconnect?.();
        removeHostFailure();
        host.close();
      });
      window.on("close", (event) => {
        if (!compatible) return;
        event.preventDefault();
        host.send({
          kind: "request",
          id: 0,
          request: { method: "window.close" },
        });
      });
      ipcMain.on("vantare:connect", (event) => {
        if (
          event.sender !== contents ||
          event.senderFrame !== contents.mainFrame ||
          !allowed(event.senderFrame.url)
        )
          return;
        disconnect?.();
        const { port1, port2 } = new MessageChannelMain();
        const unsubscribe = host.listen((message) =>
          port1.postMessage(message),
        );
        disconnect = () => {
          unsubscribe();
          port1.close();
        };
        port1.on("message", ({ data }: { data: unknown }) => {
          if (!compatible || !isUiMessage(data) || !bounded(data)) return;
          if (data.kind === "closeAnswer" && data.allow)
            host.send(data, () => window?.destroy());
          else host.send(data);
        });
        port1.start();
        event.senderFrame.postMessage("vantare:port", null, [port2]);
        port1.postMessage(hello);
      });
      window.once("ready-to-show", () => {
        window?.show();
        if (compatible) host.send({ kind: "ready" });
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
