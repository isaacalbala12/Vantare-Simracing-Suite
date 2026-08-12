import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function screen(overrides: Record<string, unknown> = {}) {
  return {
    ID: "display-a",
    Name: "Main display",
    ScaleFactor: 1.25,
    X: 0,
    Y: 0,
    Size: { Width: 1536, Height: 864 },
    Bounds: { X: 0, Y: 0, Width: 1536, Height: 864 },
    PhysicalBounds: { X: 0, Y: 0, Width: 1920, Height: 1080 },
    WorkArea: { X: 0, Y: 0, Width: 1536, Height: 824 },
    PhysicalWorkArea: { X: 0, Y: 0, Width: 1920, Height: 1030 },
    IsPrimary: true,
    Rotation: 0,
    ...overrides,
  };
}

describe("listStudioMonitors", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@wailsio/runtime");
  });

  it("maps native screens in positional order using logical DIP bounds without DPI multiplication", async () => {
    const nativeScreens = [
      screen(),
      screen({
        ID: "display-b",
        Name: "Wide display",
        ScaleFactor: 1.5,
        Bounds: { X: 1536, Y: 0, Width: 3440, Height: 1440 },
        WorkArea: { X: 1536, Y: 0, Width: 3440, Height: 1392 },
        IsPrimary: false,
      }),
    ];
    const before = structuredClone(nativeScreens);
    const getAll = vi.fn(async () => nativeScreens);
    vi.doMock("@wailsio/runtime", () => ({ Screens: { GetAll: getAll } }));
    const { listStudioMonitors } = await import("./studio-monitor-client");

    await expect(listStudioMonitors()).resolves.toEqual([
      {
        index: 0,
        id: "display-a",
        name: "Main display",
        isPrimary: true,
        scaleFactor: 1.25,
        bounds: { width: 1536, height: 864 },
        workArea: { width: 1536, height: 824 },
      },
      {
        index: 1,
        id: "display-b",
        name: "Wide display",
        isPrimary: false,
        scaleFactor: 1.5,
        bounds: { width: 3440, height: 1440 },
        workArea: { width: 3440, height: 1392 },
      },
    ]);
    expect(getAll).toHaveBeenCalledOnce();
    expect(nativeScreens).toEqual(before);
  });

  it("uses the stable screen ID when the native display name is empty", async () => {
    vi.doMock("@wailsio/runtime", () => ({
      Screens: {
        GetAll: vi.fn(async () => [
          screen(),
          screen({ ID: "display-unnamed", Name: "", IsPrimary: false }),
        ]),
      },
    }));
    const { listStudioMonitors } = await import("./studio-monitor-client");

    const monitors = await listStudioMonitors();

    expect(monitors).toHaveLength(2);
    expect(monitors.map(({ index, id, name }) => ({ index, id, name }))).toEqual([
      { index: 0, id: "display-a", name: "Main display" },
      { index: 1, id: "display-unnamed", name: "display-unnamed" },
    ]);
  });

  it("fails explicitly when the runtime has no Screens capability", async () => {
    vi.doMock("@wailsio/runtime", () => ({ Screens: undefined }));
    const { listStudioMonitors } = await import("./studio-monitor-client");

    await expect(listStudioMonitors()).rejects.toThrow("Screens.GetAll");
  });

  it("propagates native enumeration failures to its caller", async () => {
    const nativeError = new Error("native display enumeration failed");
    vi.doMock("@wailsio/runtime", () => ({
      Screens: { GetAll: vi.fn(async () => Promise.reject(nativeError)) },
    }));
    const { listStudioMonitors } = await import("./studio-monitor-client");

    await expect(listStudioMonitors()).rejects.toBe(nativeError);
  });

  it("rejects malformed logical bounds instead of inventing a Hub viewport", async () => {
    vi.doMock("@wailsio/runtime", () => ({
      Screens: {
        GetAll: vi.fn(async () => [screen({ Bounds: { X: 0, Y: 0, Width: 1920.5, Height: 1080 } })]),
      },
    }));
    const { listStudioMonitors } = await import("./studio-monitor-client");

    await expect(listStudioMonitors()).rejects.toThrow("Bounds");
  });
});
