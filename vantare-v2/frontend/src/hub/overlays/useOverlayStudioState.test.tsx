import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { useOverlayStudioState } from "./useOverlayStudioState";
import type { ProfileConfig } from "../../lib/profile";

const listeners = new Map<string, (event: { data: unknown }) => void>();

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((name: string, callback: (event: { data: unknown }) => void) => {
      listeners.set(name, callback);
      return vi.fn();
    }),
    Emit: vi.fn(),
  },
}));

const profile: ProfileConfig = {
  id: "default-racing",
  name: "Default Racing",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [
    { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
    { id: "relative", type: "relative", enabled: false, updateHz: 15, position: { x: 40, y: 600, w: 320, h: 280 } },
  ],
};

describe("useOverlayStudioState", () => {
  beforeEach(() => {
    listeners.clear();
    vi.clearAllMocks();
  });

  it("requests profiles and active profile on mount", () => {
    renderHook(() => useOverlayStudioState());

    expect(Events.Emit).toHaveBeenCalledWith("hub:list");
    expect(Events.Emit).toHaveBeenCalledWith("profile:request");
  });

  it("refreshes profile list after creating a profile", () => {
    renderHook(() => useOverlayStudioState());
    vi.clearAllMocks();

    act(() => {
      listeners.get("hub:profile-created")?.({ data: { ok: true } });
    });

    expect(Events.Emit).toHaveBeenCalledWith("hub:list");
  });

  it("loads profile and selects the first widget", () => {
    const { result } = renderHook(() => useOverlayStudioState());

    act(() => {
      listeners.get("profile:loaded")?.({ data: { profile } });
    });

    expect(result.current.profile?.id).toBe("default-racing");
    expect(result.current.selectedWidget?.id).toBe("delta");
    expect(result.current.dirty).toBe(false);
  });

  it("marks dirty when a draft changes and emits layout:save on save", () => {
    const { result } = renderHook(() => useOverlayStudioState());

    act(() => {
      listeners.get("profile:loaded")?.({ data: { profile } });
    });

    act(() => {
      result.current.updateWidget({
        ...profile.widgets[0],
        name: "Delta Edited",
      });
    });

    expect(result.current.dirty).toBe(true);

    act(() => {
      result.current.saveProfile();
    });

    expect(Events.Emit).toHaveBeenCalledWith("layout:save", {
      widgets: [
        { ...profile.widgets[0], name: "Delta Edited" },
        profile.widgets[1],
      ],
    });
  });

  it("emits layout:save when saving a dirty profile via updateDraft", () => {
    const { result } = renderHook(() => useOverlayStudioState());

    act(() => {
      listeners.get("profile:loaded")?.({ data: { profile } });
    });

    act(() => {
      result.current.updateDraft({
        ...profile,
        widgets: [{ ...profile.widgets[0], position: { x: 10, y: 0, w: 400, h: 48 } }],
      });
    });

    expect(result.current.dirty).toBe(true);

    act(() => {
      result.current.saveProfile();
    });

    expect(Events.Emit).toHaveBeenCalledWith("layout:save", {
      widgets: [{ ...profile.widgets[0], position: { x: 10, y: 0, w: 400, h: 48 } }],
    });
  });

  it("supports undo and redo", () => {
    const { result } = renderHook(() => useOverlayStudioState());

    act(() => {
      listeners.get("profile:loaded")?.({ data: { profile } });
    });

    act(() => {
      result.current.updateWidget({
        ...profile.widgets[0],
        name: "Delta Edited",
      });
    });

    expect(result.current.selectedWidget?.name).toBe("Delta Edited");

    act(() => {
      result.current.undo();
    });

    expect(result.current.selectedWidget?.name).toBeUndefined();

    act(() => {
      result.current.redo();
    });

    expect(result.current.selectedWidget?.name).toBe("Delta Edited");
  });
});
