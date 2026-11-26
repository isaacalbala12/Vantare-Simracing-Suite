import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/ajustes-base.json";
import { HOST_PROTOCOL_VERSION } from "../src/contract/generated/contract";
import { launcherReviewChannel } from "../src/contract/launcher-review-bridge";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.doUnmock("electron");
  vi.doUnmock("../src/main/host");
  vi.doUnmock("../src/main/launcher-review");
});

interface Startup {
  /** Protocol version the host announces in its hello. */
  version?: number;
  /** The host bootstrap fails before any hello. */
  helloFails?: boolean;
  /** Another Hub already holds the single-instance lock. */
  lockTaken?: boolean;
}
async function prepare(
  minimized: boolean,
  secondBeforeReady: boolean,
  testReviewGate: boolean,
  startup: Startup,
) {
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
      mainFrame: {
        isDestroyed: () => false,
        detached: false,
        url: "app://hub/",
        postMessage: vi.fn(),
      },
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
    requestSingleInstanceLock: () => !startup.lockTaken,
    whenReady: async () => {
      if (secondBeforeReady) app.emit("second-instance");
    },
    quit: vi.fn(),
    exit,
  });
  const send = vi.fn((message: { kind: string }) => {
    if (message.kind === "ready") calls.push("ready");
  });
  const ipc = Object.assign(new EventEmitter(), {
    handle:
      vi.fn<
        (
          channel: string,
          handler: (event: unknown, ...args: unknown[]) => unknown,
        ) => void
      >(),
    removeHandler: vi.fn(),
  });
  const openReview = vi.fn(async (_ticket: string) => "submitted");
  if (testReviewGate)
    vi.doMock("../src/main/launcher-review", () => ({
      launcherReview: () => ({
        open: openReview,
        receive: vi.fn(),
        invalidate: vi.fn(),
      }),
    }));
  vi.doMock("electron", () => ({
    app,
    BrowserWindow: FakeWindow,
    clipboard: {},
    dialog: { showErrorBox: failure },
    ipcMain: ipc,
    Menu: { setApplicationMenu: vi.fn() },
    MessageChannelMain: class {
      port1 = Object.assign(new EventEmitter(), {
        start: vi.fn(),
        close: vi.fn(),
        postMessage: vi.fn(),
      });
      port2 = {};
    },
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
  const hosts = vi.fn();
  vi.doMock("../src/main/host", () => ({
    createHost: () => {
      hosts();
      return {
        hello: startup.helloFails
          ? Promise.reject(new Error("Host bootstrap timeout"))
          : Promise.resolve({
              ...fixture,
              version: startup.version ?? HOST_PROTOCOL_VERSION,
              window: { ...fixture.window, minimized },
            }),
        send,
        listen: () => () => {},
        close: vi.fn(),
      };
    },
  }));
  await import("../src/main/index");
  return { windows, calls, send, app, ipc, openReview, hosts, exit, failure };
}
async function boot(
  minimized: boolean,
  secondBeforeReady = false,
  testReviewGate = false,
  startup: Startup = {},
) {
  const started = await prepare(
    minimized,
    secondBeforeReady,
    testReviewGate,
    startup,
  );
  const { windows, ipc, exit, failure } = started;
  await vi.waitFor(() => expect(windows[0]?.loadURL).toHaveBeenCalled(), {
    timeout: 5000,
  });
  expect(exit).not.toHaveBeenCalled();
  expect(failure).not.toHaveBeenCalled();
  const window = windows[0];
  // The renderer reaches the host through the trusted main frame; React only
  // asks for it once the whole tree has committed (HostProvider effect).
  const connect = (senderFrame: unknown = window.webContents.mainFrame) =>
    ipc.emit("vantare:connect", { sender: window.webContents, senderFrame });
  // The real content (Shell or a gate that asks the user) has committed.
  const mount = (senderFrame: unknown = window.webContents.mainFrame) =>
    ipc.emit("vantare:mounted", { sender: window.webContents, senderFrame });
  const usable = () => {
    connect();
    mount();
  };
  const navigate = () =>
    window.webContents.emit(
      "did-frame-navigate",
      {},
      "app://hub/",
      200,
      "OK",
      true,
    );
  return { ...started, window, connect, mount, usable, navigate };
}
/** A start that must stop before any window: lost lock or no host hello. */
async function refused(startup: Startup) {
  const started = await prepare(false, false, false, startup);
  const { app, exit } = started;
  await vi.waitFor(
    () =>
      startup.lockTaken
        ? expect(app.quit).toHaveBeenCalledOnce()
        : expect(exit).toHaveBeenCalledExactlyOnceWith(1),
    { timeout: 5000 },
  );
  return started;
}

it.each([false, true])(
  "reveals the actual main startup path with minimized=%s in the correct order",
  async (minimized) => {
    const { window, calls, usable } = await boot(minimized);
    expect(calls).toEqual(["create:hidden", "load"]);
    usable();
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
    const { window, calls, app, usable } = await boot(minimized);
    app.emit("second-instance");
    usable();
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
  const { window, calls, usable } = await boot(true, true);
  usable();
  expect(calls).toEqual(["create:hidden", "load"]);
  window.emit("ready-to-show");
  expect(calls).toEqual(["create:hidden", "load", "show", "ready"]);
  expect(window.active).toBe(true);
  window.webContents.emit("destroyed");
}, 15000);

it("only opens the native review for the connected main frame and one ticket", async () => {
  const { window, ipc, openReview } = await boot(false, false, true);
  const sender = window.webContents;
  const event = { sender, senderFrame: sender.mainFrame };
  const handler = ipc.handle.mock.calls.find(
    ([name]) => name === launcherReviewChannel,
  )?.[1];
  if (!handler) throw new Error("Missing review IPC handler");
  const ticket = "c".repeat(32);
  try {
    expect(await handler(event, ticket)).toBe("unavailable");
    expect(openReview).not.toHaveBeenCalled();
    ipc.emit("vantare:connect", event);
    expect(
      await handler({ sender, senderFrame: { ...sender.mainFrame } }, ticket),
    ).toBe("unavailable");
    expect(await handler(event, ticket, "extra")).toBe("unavailable");
    expect(await handler({ ...event, sender: {} }, ticket)).toBe("unavailable");
    sender.mainFrame.url = "https://example.invalid/";
    expect(await handler(event, ticket)).toBe("unavailable");
    sender.mainFrame.url = "app://hub/";
    sender.mainFrame.detached = true;
    expect(await handler(event, ticket)).toBe("unavailable");
    sender.mainFrame.detached = false;
    expect(openReview).not.toHaveBeenCalled();
    expect(await handler(event, ticket)).toBe("submitted");
    expect(openReview).toHaveBeenCalledExactlyOnceWith(ticket);
  } finally {
    sender.emit("destroyed");
  }
}, 15000);

// VANTA-138 P6 (#2785): `ready` lets the launcher confirm an updated generation
// and drop the previous one. A first paint alone is not a usable Hub, nor are
// the providers that connect to the host: the real content must have mounted.
const readies = (calls: string[]) => calls.filter((call) => call === "ready");
it.each([false, true])(
  "never confirms a painted window whose renderer did not connect (minimized=%s)",
  async (minimized) => {
    const { window, calls } = await boot(minimized);
    window.emit("ready-to-show");
    expect(calls).toContain(minimized ? "minimize" : "show");
    expect(readies(calls)).toEqual([]);
    window.webContents.emit("destroyed");
  },
  15000,
);
it("never confirms providers that connected while the content failed to mount", async () => {
  const { window, calls, connect } = await boot(false);
  window.emit("ready-to-show");
  connect();
  expect(readies(calls)).toEqual([]);
  window.webContents.emit("destroyed");
}, 15000);
it.each([false, true])(
  "confirms once when the content mounts after the first paint (minimized=%s)",
  async (minimized) => {
    const { window, calls, connect, mount, navigate } = await boot(minimized);
    window.emit("ready-to-show");
    connect();
    mount();
    expect(calls.at(-1)).toBe("ready");
    expect(window.minimized).toBe(minimized);
    // A reload starts another page in the same window: no second confirmation.
    navigate();
    connect();
    mount();
    expect(readies(calls)).toEqual(["ready"]);
    window.webContents.emit("destroyed");
  },
  15000,
);
it("confirms at the first paint when the content mounted before it", async () => {
  const { window, calls, usable } = await boot(true);
  usable();
  expect(readies(calls)).toEqual([]);
  window.emit("ready-to-show");
  expect(calls.at(-1)).toBe("ready");
  expect(readies(calls)).toEqual(["ready"]);
  window.webContents.emit("destroyed");
}, 15000);
it("a navigation forgets the previous page's connection and content", async () => {
  const { window, calls, connect, mount, navigate } = await boot(false);
  window.emit("ready-to-show");
  connect();
  navigate();
  mount();
  expect(readies(calls)).toEqual([]);
  navigate();
  mount();
  connect();
  expect(readies(calls)).toEqual(["ready"]);
  window.webContents.emit("destroyed");
}, 15000);
it("does not count signals that are untrusted or whose port was lost", async () => {
  const { window, calls, connect, mount, navigate } = await boot(false);
  const frame = window.webContents.mainFrame;
  connect({ ...frame });
  frame.postMessage.mockImplementationOnce(() => {
    throw new Error("frame gone");
  });
  connect();
  mount();
  window.emit("ready-to-show");
  expect(readies(calls)).toEqual([]);
  navigate();
  connect();
  mount({ ...frame });
  expect(readies(calls)).toEqual([]);
  window.webContents.emit("destroyed");
}, 15000);
it("never acknowledges an incompatible host, even painted and mounted", async () => {
  const { window, calls, send, usable } = await boot(false, false, false, {
    version: HOST_PROTOCOL_VERSION + 1,
  });
  window.emit("ready-to-show");
  usable();
  // The user sees the incompatibility screen; the launcher reverts.
  expect(calls).toContain("show");
  expect(readies(calls)).toEqual([]);
  expect(send.mock.calls.map(([message]) => message.kind)).not.toContain(
    "hello",
  );
  window.webContents.emit("destroyed");
}, 15000);
it("a host bootstrap failure explains it and exits without a window", async () => {
  const { windows, send, failure } = await refused({ helloFails: true });
  expect(failure).toHaveBeenCalledOnce();
  expect(windows).toEqual([]);
  expect(send).not.toHaveBeenCalled();
}, 15000);
it("a second Hub without the single-instance lock quits before the host", async () => {
  const { windows, hosts, exit } = await refused({ lockTaken: true });
  expect(hosts).not.toHaveBeenCalled();
  expect(windows).toEqual([]);
  expect(exit).not.toHaveBeenCalled();
}, 15000);
