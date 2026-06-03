import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetAll = vi.fn();
const mockShow = vi.fn();
const mockHide = vi.fn();
const mockSetPosition = vi.fn();
const mockSetSize = vi.fn();

const mockOverlayManager = {
  getAll: mockGetAll,
  show: mockShow,
  hide: mockHide,
  setPosition: mockSetPosition,
  setSize: mockSetSize,
};

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  app: {
    getVersion: vi.fn().mockReturnValue("1.0.0"),
  },
  BrowserWindow: vi.fn(),
  shell: {
    openExternal: vi.fn(),
  },
}));

vi.mock("@vantare/auth", () => ({
  AuthService: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getSession: vi.fn(),
    getLicenseStatus: vi.fn(),
  },
}));

vi.mock("electron-store", () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}));

vi.mock("@vantare/sim-core", () => ({
  MockSimFactory: {
    getAvailableSims: vi.fn().mockReturnValue([]),
  },
}));

import { ipcMain } from "electron";
import { registerIpcHandlers, setSimManager, setOverlayManager } from "../handlers";

describe("overlay IPC handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    setSimManager(null);
    setOverlayManager(null);
  });

  it("registers overlays:get-windows handler", async () => {
    registerIpcHandlers();
    const handler = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "overlays:get-windows"
    );
    expect(handler).toBeDefined();
    const result = await handler![1]();
    expect(result).toEqual([]);
  });

  it("overlays:get-windows returns overlayManager.getAll() when ref is set", async () => {
    registerIpcHandlers();
    setOverlayManager(mockOverlayManager as unknown as InstanceType<typeof import("../../windows/overlay-manager").OverlayManager>);
    const handler = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "overlays:get-windows"
    );
    expect(handler).toBeDefined();
    mockGetAll.mockReturnValue([{ id: "standings", name: "Standings", visible: true, x: 0, y: 0, width: 400, height: 600 }]);
    const result = await handler![1]();
    expect(mockGetAll).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: "standings", name: "Standings", visible: true, x: 0, y: 0, width: 400, height: 600 }]);
  });

  it("overlays:get-windows returns empty array when ref is null", async () => {
    registerIpcHandlers();
    const handler = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "overlays:get-windows"
    );
    expect(handler).toBeDefined();
    const result = await handler![1]();
    expect(mockGetAll).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("registers overlays:show handler", async () => {
    registerIpcHandlers();
    const handler = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "overlays:show"
    );
    expect(handler).toBeDefined();
  });

  it("overlays:show calls overlayManager.show with id", async () => {
    registerIpcHandlers();
    setOverlayManager(mockOverlayManager as unknown as InstanceType<typeof import("../../windows/overlay-manager").OverlayManager>);
    const handler = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "overlays:show"
    );
    expect(handler).toBeDefined();
    await handler![1](null, "standings");
    expect(mockShow).toHaveBeenCalledTimes(1);
    expect(mockShow).toHaveBeenCalledWith("standings");
  });

  it("overlays:show does nothing when ref is null", async () => {
    registerIpcHandlers();
    const handler = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "overlays:show"
    );
    expect(handler).toBeDefined();
    await handler![1](null, "standings");
    expect(mockShow).not.toHaveBeenCalled();
  });

  it("registers overlays:hide handler", async () => {
    registerIpcHandlers();
    const handler = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "overlays:hide"
    );
    expect(handler).toBeDefined();
  });

  it("overlays:hide calls overlayManager.hide with id", async () => {
    registerIpcHandlers();
    setOverlayManager(mockOverlayManager as unknown as InstanceType<typeof import("../../windows/overlay-manager").OverlayManager>);
    const handler = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "overlays:hide"
    );
    expect(handler).toBeDefined();
    await handler![1](null, "delta");
    expect(mockHide).toHaveBeenCalledTimes(1);
    expect(mockHide).toHaveBeenCalledWith("delta");
  });

  it("overlays:hide does nothing when ref is null", async () => {
    registerIpcHandlers();
    const handler = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "overlays:hide"
    );
    expect(handler).toBeDefined();
    await handler![1](null, "delta");
    expect(mockHide).not.toHaveBeenCalled();
  });

  it("registers overlays:set-position handler", async () => {
    registerIpcHandlers();
    const handler = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "overlays:set-position"
    );
    expect(handler).toBeDefined();
  });

  it("overlays:set-position calls overlayManager.setPosition with id, x, y", async () => {
    registerIpcHandlers();
    setOverlayManager(mockOverlayManager as unknown as InstanceType<typeof import("../../windows/overlay-manager").OverlayManager>);
    const handler = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "overlays:set-position"
    );
    expect(handler).toBeDefined();
    await handler![1](null, "relative", 100, 200);
    expect(mockSetPosition).toHaveBeenCalledTimes(1);
    expect(mockSetPosition).toHaveBeenCalledWith("relative", 100, 200);
  });

  it("overlays:set-position does nothing when ref is null", async () => {
    registerIpcHandlers();
    const handler = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "overlays:set-position"
    );
    expect(handler).toBeDefined();
    await handler![1](null, "relative", 100, 200);
    expect(mockSetPosition).not.toHaveBeenCalled();
  });

  it("registers overlays:set-size handler", async () => {
    registerIpcHandlers();
    const handler = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "overlays:set-size"
    );
    expect(handler).toBeDefined();
  });

  it("overlays:set-size calls overlayManager.setSize with id, w, h", async () => {
    registerIpcHandlers();
    setOverlayManager(mockOverlayManager as unknown as InstanceType<typeof import("../../windows/overlay-manager").OverlayManager>);
    const handler = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "overlays:set-size"
    );
    expect(handler).toBeDefined();
    await handler![1](null, "delta", 300, 100);
    expect(mockSetSize).toHaveBeenCalledTimes(1);
    expect(mockSetSize).toHaveBeenCalledWith("delta", 300, 100);
  });

  it("overlays:set-size does nothing when ref is null", async () => {
    registerIpcHandlers();
    const handler = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "overlays:set-size"
    );
    expect(handler).toBeDefined();
    await handler![1](null, "delta", 300, 100);
    expect(mockSetSize).not.toHaveBeenCalled();
  });
});
