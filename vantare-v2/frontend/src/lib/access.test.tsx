import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

const {
  onListeners,
  eventsOn,
  eventsOff,
  eventsEmit,
  mockGetSession,
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
    mockGetSession: vi.fn(),
  };
});

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: eventsOn,
    Off: eventsOff,
    Emit: eventsEmit,
  },
}));

vi.mock("./supabase-auth", () => ({
  getSession: mockGetSession,
}));

import { LicenseProvider } from "./license";
import { useAccess } from "./access";
import type { LicenseResult } from "./license-types";

function emitChanged(result: LicenseResult | null) {
  const cb = onListeners.get("license:changed");
  if (cb) cb({ data: result });
}

describe("useAccess", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    onListeners.clear();
    eventsOn.mockClear();
    eventsEmit.mockClear();
    eventsOff.mockClear();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue(null);
    cleanup();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("derives free access context from a free license", async () => {
    const { result } = renderHook(() => useAccess(), {
      wrapper: LicenseProvider,
    });

    act(() => {
      emitChanged({
        state: "authenticated-no-entitlement",
        entitlements: [],
        userId: "user-1",
        email: "driver@example.test",
        deviceOK: true,
      });
    });

    expect(result.current.planLabel).toBe("free");
    expect(result.current.planStatus).toBe("free");
    expect(result.current.isBlocked).toBe(false);
    expect(result.current.isUnconfigured).toBe(false);
    expect(result.current.roles).toEqual([]);
  });

  it("derives suite access context from a bundle license", async () => {
    const { result } = renderHook(() => useAccess(), {
      wrapper: LicenseProvider,
    });

    act(() => {
      emitChanged({
        state: "active",
        entitlements: ["bundle"],
        userId: "user-1",
        email: "driver@example.test",
        deviceOK: true,
      });
    });

    expect(result.current.planLabel).toBe("suite");
    expect(result.current.planStatus).toBe("active");
  });

  it("derives blocked access context from an expired license", async () => {
    const { result } = renderHook(() => useAccess(), {
      wrapper: LicenseProvider,
    });

    act(() => {
      emitChanged({
        state: "expired",
        entitlements: ["bundle"],
        userId: "user-1",
        email: "driver@example.test",
        deviceOK: true,
      });
    });

    expect(result.current.isBlocked).toBe(true);
    expect(result.current.planStatus).toBe("blocked");
  });

  it("derives unconfigured access context", async () => {
    const { result } = renderHook(() => useAccess(), {
      wrapper: LicenseProvider,
    });

    act(() => {
      emitChanged({
        state: "unconfigured",
        entitlements: [],
        userId: "user-1",
        email: "driver@example.test",
        deviceOK: true,
      });
    });

    expect(result.current.isUnconfigured).toBe(true);
    expect(result.current.planStatus).toBe("unconfigured");
  });

  it("accepts roles parameter", async () => {
    const { result } = renderHook(() => useAccess({ roles: ["tester"] }), {
      wrapper: LicenseProvider,
    });

    act(() => {
      emitChanged({
        state: "authenticated-no-entitlement",
        entitlements: [],
        userId: "user-1",
        email: "driver@example.test",
        deviceOK: true,
      });
    });

    expect(result.current.roles).toEqual(["tester"]);
  });

  it("throws when used outside LicenseProvider", () => {
    expect(() => renderHook(() => useAccess())).toThrow(
      "useLicense must be used inside LicenseProvider",
    );
  });
});
