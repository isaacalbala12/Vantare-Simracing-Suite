import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";

const {
  onListeners,
  eventsOn,
  eventsOff,
  eventsEmit,
} = vi.hoisted(() => {
  const onListeners = new Map<string, (event: unknown) => void>();
  return {
    onListeners,
    eventsOn: vi.fn((name: string, cb: (event: unknown) => void) => {
      onListeners.set(name, cb);
      return () => onListeners.delete(name);
    }),
    eventsOff: vi.fn(),
    eventsEmit: vi.fn(),
  };
});

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: eventsOn,
    Off: eventsOff,
    Emit: eventsEmit,
  },
}));

import { LicenseProvider, useLicense } from "./license";
import type { LicenseResult } from "./license-types";

function emitChanged(result: LicenseResult | null) {
  const cb = onListeners.get("license:changed");
  if (cb) cb({ data: result });
}

function emitValidate() {
  const cb = onListeners.get("license:validate");
  if (cb) cb({ data: {} });
}

describe("license module", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    onListeners.clear();
    eventsOn.mockClear();
    eventsEmit.mockClear();
    eventsOff.mockClear();
    cleanup();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("LicenseProvider", () => {
    it("registers license:changed listener and emits license:validate on mount", async () => {
      renderHook(() => useLicense(), { wrapper: LicenseProvider });
      expect(eventsOn).toHaveBeenCalledWith(
        "license:changed",
        expect.any(Function),
      );
      await vi.waitFor(() => {
        expect(eventsEmit).toHaveBeenCalledWith("license:validate", {});
      });
    });

    it("exposes loading state until license:changed is received", () => {
      const { result } = renderHook(() => useLicense(), {
        wrapper: LicenseProvider,
      });
      expect(result.current.loading).toBe(true);
      expect(result.current.result).toBeNull();
    });

    it("updates state when license:changed fires", () => {
      const { result } = renderHook(() => useLicense(), {
        wrapper: LicenseProvider,
      });
      const next: LicenseResult = {
        state: "active",
        entitlements: ["overlays"],
        userId: "u1",
        email: "u@example.com",
        deviceOK: true,
      };
      act(() => emitChanged(next));
      expect(result.current.loading).toBe(false);
      expect(result.current.result).toEqual(next);
    });

    it("updates loading state to false when license:error is received", () => {
      const { result } = renderHook(() => useLicense(), {
        wrapper: LicenseProvider,
      });
      expect(result.current.loading).toBe(true);
      const cb = onListeners.get("license:error");
      expect(cb).toBeDefined();
      act(() => {
        if (cb) cb({ message: "failed" });
      });
      expect(result.current.loading).toBe(false);
    });

    it("refresh() re-emits license:validate", () => {
      const { result } = renderHook(() => useLicense(), {
        wrapper: LicenseProvider,
      });
      eventsEmit.mockClear();
      act(() => result.current.refresh());
      expect(eventsEmit).toHaveBeenCalledWith("license:validate", {});
    });

    it("ignores stale anonymous license:changed while authenticated", () => {
      const { result } = renderHook(() => useLicense(), {
        wrapper: LicenseProvider,
      });
      act(() =>
        emitChanged({
          state: "active",
          entitlements: ["bundle"],
          userId: "u1",
          email: "u@example.com",
          deviceOK: true,
        }),
      );
      act(() =>
        emitChanged({
          state: "anonymous",
          entitlements: [],
          userId: "",
          email: "",
          deviceOK: false,
        }),
      );
      expect(result.current.result?.state).toBe("active");
    });

    it("clearLicense() forces anonymous state even after authentication", () => {
      const { result } = renderHook(() => useLicense(), {
        wrapper: LicenseProvider,
      });
      act(() =>
        emitChanged({
          state: "active",
          entitlements: ["bundle"],
          userId: "u1",
          email: "u@example.com",
          deviceOK: true,
        }),
      );
      act(() => result.current.clearLicense());
      expect(result.current.loading).toBe(false);
      expect(result.current.result?.state).toBe("anonymous");
      expect(result.current.result?.entitlements).toEqual([]);
    });

    it("throws when useLicense is used outside the provider", () => {
      const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => renderHook(() => useLicense())).toThrow(
        /useLicense must be used inside LicenseProvider/,
      );
      consoleErr.mockRestore();
    });

    it("renders children inside provider", () => {
      render(
        <LicenseProvider>
          <div data-testid="child">child</div>
        </LicenseProvider>,
      );
      expect(screen.getByTestId("child").textContent).toBe("child");
    });

    it("unsubscribes from license:changed on unmount", () => {
      const { unmount } = renderHook(() => useLicense(), {
        wrapper: LicenseProvider,
      });
      const unsub = onListeners.get("license:changed");
      expect(unsub).toBeDefined();
      unmount();
      expect(onListeners.has("license:changed")).toBe(false);
    });

    it("ignores license:validate changes for unrelated events", async () => {
      renderHook(() => useLicense(), { wrapper: LicenseProvider });
      // Wait for the 500ms setTimeout in LicenseProvider to fire and emit license:validate
      await vi.waitFor(() => {
        expect(eventsEmit).toHaveBeenCalled();
      });
      act(() => emitValidate());
      // No assertion on state, just ensure no crash
    });

    it("resolves loading when timeout fires (no backend response)", () => {
      const { result } = renderHook(() => useLicense(), {
        wrapper: LicenseProvider,
      });
      expect(result.current.loading).toBe(true);
      act(() => {
        vi.advanceTimersByTime(8000);
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.result).toBeNull();
    });

    it("retries license:validate when timeout fires", () => {
      renderHook(() => useLicense(), { wrapper: LicenseProvider });
      eventsEmit.mockClear();
      act(() => {
        vi.advanceTimersByTime(8000);
      });
      // refresh() emits license:validate {} as retry
      expect(eventsEmit).toHaveBeenCalledWith("license:validate", {});
    });

    it("timeout cancelled when license:changed arrives early", () => {
      const { result } = renderHook(() => useLicense(), {
        wrapper: LicenseProvider,
      });
      act(() =>
        emitChanged({
          state: "active",
          entitlements: ["overlays"],
          userId: "u1",
          email: "u@example.com",
          deviceOK: true,
        }),
      );
      expect(result.current.loading).toBe(false);
      // Advance past the timeout — should not change state
      act(() => {
        vi.advanceTimersByTime(8000);
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.result?.state).toBe("active");
    });
  });

  describe("LicenseProvider standalone mode", () => {
    it("emits license:validate without session token in standalone mode", async () => {
      renderHook(() => useLicense(), { wrapper: LicenseProvider });
      // Standalone mode skips the Supabase session lookup entirely; the
      // provider emits an empty payload (no sessionToken) after its timer.
      await vi.waitFor(() => {
        expect(eventsEmit).toHaveBeenCalledWith("license:validate", {});
      });
    });

    it("emits license:validate with an empty payload in standalone mode", async () => {
      renderHook(() => useLicense(), { wrapper: LicenseProvider });
      await vi.waitFor(() => {
        expect(eventsEmit).toHaveBeenCalledWith("license:validate", {});
      });
    });
  });

  describe("useLicense consumer pattern", () => {
    it("works with multiple consumers sharing context", () => {
      function Probe({ id }: { id: string }) {
        const { result } = useLicense();
        const [, setTick] = useState(0);
        // Use result state to trigger re-render path.
        return (
          <button onClick={() => setTick((t) => t + 1)} data-testid={id}>
            {result?.email ?? "anon"}
          </button>
        );
      }
      render(
        <LicenseProvider>
          <Probe id="a" />
          <Probe id="b" />
        </LicenseProvider>,
      );
      act(() =>
        emitChanged({
          state: "active",
          entitlements: [],
          userId: "u",
          email: "shared@example.com",
          deviceOK: true,
        }),
      );
      expect(screen.getByTestId("a").textContent).toBe("shared@example.com");
      expect(screen.getByTestId("b").textContent).toBe("shared@example.com");
    });
  });
});