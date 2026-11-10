import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  type IpcMainEvent,
  ipcMain,
  Menu,
  MessageChannelMain,
  nativeTheme,
  net,
  protocol,
  screen,
  session,
  shell,
} from "electron";
import type { SettingsView } from "../contract/generated/contract";
import {
  HOST_PROTOCOL_VERSION,
  privacyPolicyUrl,
} from "../contract/generated/contract";
import { bounded } from "../contract/validation";
import { es } from "../renderer/i18n/es";
import { paintWindow, resolveTheme, testNotification } from "./appearance";
import { createHost } from "./host";
import {
  assetPath,
  CSP,
  developmentUrl,
  fitWindow,
  hasDebuggerArguments,
  isRendererMessage,
  navigationAllowed,
  QA_DRIVER,
  requireDataDirectory,
  webPreferences,
} from "./security";
import { bindWindowControls } from "./window-controls";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
async function start() {
  if (app.isPackaged && !QA_DRIVER && hasDebuggerArguments(process.argv)) {
    app.commandLine.removeSwitch("remote-debugging-port");
    app.commandLine.removeSwitch("remote-debugging-pipe");
    console.error(
      "Hub initialization rejected: debugging disabled in distribution",
    );
    app.exit(1);
    return;
  }
  const dataDir = requireDataDirectory(process.env.VANTARE_HUB_DATA_DIR);
  app.setPath("userData", join(dataDir, "hub-ui"));
  app.setPath("sessionData", join(dataDir, "hub-ui"));
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  let window: BrowserWindow | undefined;
  app.on("second-instance", () => {
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.on("window-all-closed", () => app.quit());
  await app.whenReady();
  const host = createHost();
  const hello = await host.hello;
  const compatible = hello.version === HOST_PROTOCOL_VERSION;
  if (compatible) host.send({ kind: "hello", version: HOST_PROTOCOL_VERSION });
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
  nativeTheme.themeSource = hello.theme.scheme;
  const colors = resolveTheme(hello.theme);
  window = new BrowserWindow({
    ...fitWindow(hello.window, screen.getPrimaryDisplay().workAreaSize),
    show: false,
    backgroundColor: colors["bg-window"],
    title: "Vantare · Hub",
    titleBarStyle: "hidden",
    frame: false,
    webPreferences: webPreferences(
      join(import.meta.dirname, "../preload/index.cjs"),
      !app.isPackaged,
    ),
  });
  const currentWindow = window;
  const contents = currentWindow.webContents;
  let settings: SettingsView | undefined;
  const repaint = () => {
    if (window)
      paintWindow(
        window,
        settings ? settings.appearance : hello.theme,
        settings?.zoom ?? hello.window.zoom,
      );
  };
  repaint();
  nativeTheme.on("updated", repaint);
  const devUrl = !app.isPackaged
    ? developmentUrl(process.env.ELECTRON_RENDERER_URL)
    : undefined;
  const allowed = (value: string) => navigationAllowed(value, devUrl);
  const denyNavigation = (event: Electron.Event, url: string) => {
    if (!allowed(url)) {
      event.preventDefault();
      if (QA_DRIVER) console.error("HUB_QA_NAVIGATION_BLOCKED");
    }
  };
  contents.on("will-navigate", denyNavigation);
  contents.on("will-redirect", denyNavigation);
  contents.on("render-process-gone", (_event, details) => {
    console.error("Hub renderer stopped:", details.reason, details.exitCode);
    app.exit(1);
  });
  contents.on("did-fail-load", (_event, code, description, _url, mainFrame) => {
    if (!mainFrame || code === -3) return;
    console.error("Hub document failed:", code, description);
    app.exit(1);
  });
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  let disconnect: (() => void) | undefined;
  const removeHostFailure = host.listen((message) => {
    if (
      message.kind === "response" &&
      (message.result.method === "settings.get" ||
        message.result.method === "settings.update" ||
        message.result.method === "settings.retry" ||
        message.result.method === "settings.discard")
    ) {
      settings = message.result.value;
      repaint();
    }
    if (message.kind === "failure" && message.error.kind === "conflict") {
      settings = message.error.current;
      repaint();
    }
    if (
      message.kind === "failure" &&
      message.id === 0 &&
      message.error.kind === "coreUnavailable"
    )
      window?.destroy();
  });
  contents.once("destroyed", () => {
    nativeTheme.removeListener("updated", repaint);
    disconnect?.();
    ipcMain.removeListener("vantare:connect", connectRenderer);
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
  const connectRenderer = (event: IpcMainEvent) => {
    const frame = event.senderFrame;
    if (
      contents.isDestroyed() ||
      !frame ||
      frame.isDestroyed() ||
      frame.detached ||
      event.sender !== contents ||
      frame !== contents.mainFrame ||
      !allowed(frame.url)
    )
      return;
    disconnect?.();
    const { port1, port2 } = new MessageChannelMain();
    let portAlive = true;
    const copies = new Set<number>();
    const unsubscribe = host.listen((message) => {
      if (
        message.kind === "response" &&
        message.result.method === "diagnostics.copy" &&
        copies.delete(message.id)
      ) {
        try {
          clipboard.writeText(message.result.text);
        } catch {
          port1.postMessage({
            kind: "failure",
            id: message.id,
            error: { kind: "io" },
          });
          return;
        }
      }
      if (message.kind === "failure") copies.delete(message.id);
      port1.postMessage(message);
    });
    const controls = bindWindowControls(currentWindow, (message) => {
      if (!portAlive) return;
      try {
        port1.postMessage(message);
      } catch {
        dispose();
      }
    });
    function dispose() {
      if (!portAlive) return;
      portAlive = false;
      controls.dispose();
      unsubscribe();
      port1.close();
      copies.clear();
    }
    disconnect = dispose;
    port1.once("close", dispose);
    port1.on("message", ({ data }: { data: unknown }) => {
      if (!compatible || !isRendererMessage(data) || !bounded(data)) return;
      if (controls.dispatch(data)) return;
      if (data.kind === "request" && data.request.method === "privacy.policy") {
        void shell
          .openExternal(privacyPolicyUrl)
          .then(
            () => true,
            () => false,
          )
          .then((accepted) => {
            if (portAlive)
              port1.postMessage({
                kind: "response",
                id: data.id,
                result: { method: "privacy.policy", accepted },
              });
          });
        return;
      }
      if (
        data.kind === "request" &&
        data.request.method === "notifications.test"
      ) {
        port1.postMessage({
          kind: "response",
          id: data.id,
          result: {
            method: "notifications.test",
            accepted: testNotification(settings),
          },
        });
        return;
      }
      if (data.kind === "request" && data.request.method === "diagnostics.copy")
        copies.add(data.id);
      if (QA_DRIVER && data.kind === "closeAnswer" && !data.allow)
        console.error("HUB_QA_CLOSE_BLOCKED");
      if (data.kind === "closeAnswer" && data.allow)
        host.send(data, () => window?.destroy());
      else host.send(data);
    });
    port1.start();
    try {
      frame.postMessage("vantare:port", null, [port2]);
      port1.postMessage(hello);
    } catch {
      disconnect?.();
    }
  };
  ipcMain.on("vantare:connect", connectRenderer);
  contents.on(
    "did-frame-navigate",
    (_event, _url, _code, _status, mainFrame) => {
      if (mainFrame) {
        disconnect?.();
        disconnect = undefined;
      }
    },
  );
  window.once("ready-to-show", () => {
    window?.show();
    if (compatible) host.send({ kind: "ready" });
    if (hello.window.minimized) window?.minimize();
  });
  if (devUrl) await window.loadURL(devUrl);
  else await window.loadURL("app://hub/");
}
void start().catch((error: unknown) => {
  console.error(
    "Hub initialization failed:",
    error instanceof Error ? error.message : "Unknown initialization failure",
  );
  dialog.showErrorBox(es.startupErrorTitle, es.startupError);
  app.exit(1);
});
