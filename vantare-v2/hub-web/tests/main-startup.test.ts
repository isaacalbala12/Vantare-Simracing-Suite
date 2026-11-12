import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/ajustes-base.json";
import { HOST_PROTOCOL_VERSION } from "../src/contract/generated/contract";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.doUnmock("electron");
  vi.doUnmock("../src/main/host");
});

async function boot(minimized: boolean, secondBeforeReady = false) {
  vi.resetModules();
  vi.stubEnv("VANTARE_HUB_DATA_DIR", join(tmpdir(), "vantare-startup-double"));
  vi.stubEnv("ELECTRON_RENDERER_URL", undefined);
  const calls: string[] = [],
    windows: FakeWindow[] = [];
  class FakeWindow extends EventEmitter {
    dead = false;
    focusable = true;
    active = false;
    minimized = false;
    size = [1440, 900];
    zoomFactor = 1;
    webContents = Object.assign(new EventEmitter(), {
      setZoomFactor: vi.fn((factor: number) => {
        this.zoomFactor = factor;
      }),
      getZoomFactor: () => this.zoomFactor,
      setWindowOpenHandler: vi.fn(),
      isDestroyed: () => false,
    });
    constructor(options: Record<string, unknown>) {
      super();
      calls.push(options.show === false ? "create:hidden" : "create:visible");
      windows.push(this);
    }
    isDestroyed() {
      return this.dead;
    }
    isMaximized() {
      return false;
    }
    isMinimized() {
      return this.minimized;
    }
    getContentSize() {
      return this.size;
    }
    setBackgroundColor = vi.fn();
    loadURL = vi.fn(async () => {
      calls.push("load");
    });
    setFocusable(value: boolean) {
      calls.push(`focusable:${value}`);
      this.focusable = value;
    }
    minimize() {
      calls.push("minimize");
      this.minimized = true;
      if (this.focusable) this.active = true;
    }
    show() {
      calls.push("show");
      this.active = this.focusable;
    }
    restore() {
      calls.push("restore");
      this.minimized = false;
    }
    focus() {
      calls.push("focus");
      this.active = this.focusable;
    }
    destroy() {
      this.dead = true;
    }
  }
  const exit = vi.fn(),
    failure = vi.fn();
  const app = Object.assign(new EventEmitter(), {
    isPackaged: false,
    setPath: vi.fn(),
    requestSingleInstanceLock: () => true,
    whenReady: async () => {
      if (secondBeforeReady) app.emit("second-instance");
    },
    quit: vi.fn(),
    exit,
  });
  const send = vi.fn((message: { kind: string }) => {
    if (message.kind === "ready") calls.push("ready");
  });
  vi.doMock("electron", () => ({
    app,
    BrowserWindow: FakeWindow,
    clipboard: {},
    dialog: { showErrorBox: failure },
    ipcMain: new EventEmitter(),
    Menu: { setApplicationMenu: vi.fn() },
    MessageChannelMain: class {},
    nativeTheme: Object.assign(new EventEmitter(), {
      themeSource: "dark",
      shouldUseDarkColors: true,
    }),
    net: {},
    protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
    screen: {
      getPrimaryDisplay: () => ({
        workAreaSize: { width: 1920, height: 1080 },
      }),
    },
    session: {
      defaultSession: {
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
      },
    },
    shell: {},
    Notification: {},
  }));
  vi.doMock("../src/main/host", () => ({
    createHost: () => ({
      hello: Promise.resolve({
        ...fixture,
        version: HOST_PROTOCOL_VERSION,
        window: { ...fixture.window, minimized },
      }),
      send,
      listen: () => () => {},
      close: vi.fn(),
    }),
  }));
  await import("../src/main/index");
  await vi.waitFor(() => expect(windows[0]?.loadURL).toHaveBeenCalled(), {
    timeout: 5000,
  });
  expect(exit).not.toHaveBeenCalled();
  expect(failure).not.toHaveBeenCalled();
  return { window: windows[0], calls, send, app };
}

it.each([false, true])(
  "reveals the actual main startup path with minimized=%s in the correct order",
  async (minimized) => {
    const { window, calls } = await boot(minimized);
    expect(calls).toEqual(["create:hidden", "load"]);
    window.emit("ready-to-show");
    expect(calls).toEqual(
      minimized
        ? [
            "create:hidden",
            "load",
            "focusable:false",
            "minimize",
            "focusable:true",
            "ready",
          ]
        : ["create:hidden", "load", "show", "ready"],
    );
    expect(window.active).toBe(!minimized);
    expect(window.minimized).toBe(minimized);
    expect(window.focusable).toBe(true);
    window.webContents.emit("destroyed");
  },
  15000,
);
it("does not show or acknowledge a window destroyed before its first paint", async () => {
  const { window, calls } = await boot(true);
  window.destroy();
  window.emit("ready-to-show");
  expect(calls).toEqual(["create:hidden", "load"]);
  window.webContents.emit("destroyed");
}, 15000);
it("recalculates only zoom on resize and removes the resize listener when contents are destroyed", async () => {
  const { window } = await boot(false);
  window.setBackgroundColor.mockClear();
  window.webContents.setZoomFactor.mockClear();
  window.size = [800, 600];
  window.emit("resize");
  window.emit("resize");
  window.size = [1920, 1080];
  window.emit("resize");
  expect(window.webContents.setZoomFactor.mock.calls).toEqual([[0.9], [1]]);
  expect(window.setBackgroundColor).not.toHaveBeenCalled();
  window.webContents.emit("destroyed");
  expect(window.listenerCount("resize")).toBe(0);
}, 15000);

it.each([false, true])(
  "remembers a second instance before first paint and shows once (minimized=%s)",
  async (minimized) => {
    const { window, calls, app } = await boot(minimized);
    app.emit("second-instance");
    expect(calls).toEqual(["create:hidden", "load"]);
    expect(window.active).toBe(false);
    window.emit("ready-to-show");
    expect(calls).toEqual(["create:hidden", "load", "show", "ready"]);
    expect(window.active).toBe(true);
    expect(window.minimized).toBe(false);
    window.webContents.emit("destroyed");
  },
  15000,
);
it("restores and focuses on a second instance after minimized startup", async () => {
  const { window, calls, app } = await boot(true);
  window.emit("ready-to-show");
  calls.length = 0;
  app.emit("second-instance");
  expect(calls).toEqual(["restore", "focus"]);
  expect(window.minimized).toBe(false);
  window.destroy();
  calls.length = 0;
  app.emit("second-instance");
  expect(calls).toEqual([]);
  window.webContents.emit("destroyed");
}, 15000);

it("remembers activation even before BrowserWindow exists", async () => {
  const { window, calls } = await boot(true, true);
  expect(calls).toEqual(["create:hidden", "load"]);
  window.emit("ready-to-show");
  expect(calls).toEqual(["create:hidden", "load", "show", "ready"]);
  expect(window.active).toBe(true);
  window.webContents.emit("destroyed");
}, 15000);
