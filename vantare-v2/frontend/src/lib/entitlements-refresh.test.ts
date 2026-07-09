import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  entitlementsIncludeBundle,
  isFreshLicenseEvent,
  isPremiumUnlocked,
  parseLastValidatedMs,
  refreshCurrentUserEntitlements,
  resetActiveDevice,
} from "./entitlements-refresh";
import type { LicenseResult } from "./license-types";

const { getSessionMock, onListeners, eventsEmit, eventsOn } = vi.hoisted(() => {
  const onListeners = new Map<string, (event: unknown) => void>();
  return {
    getSessionMock: vi.fn(),
    onListeners,
    eventsEmit: vi.fn(),
    eventsOn: vi.fn((name: string, cb: (event: unknown) => void) => {
      onListeners.set(name, cb);
      return () => onListeners.delete(name);
    }),
  };
});

vi.mock("./supabase-auth", () => ({
  getSession: getSessionMock,
}));

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: eventsOn,
    Emit: eventsEmit,
  },
}));

function emitChanged(result: LicenseResult | null) {
  onListeners.get("license:changed")?.({ data: result });
}

function emitError(message: string) {
  onListeners.get("license:error")?.({ data: { message } });
}

function freshLicense(
  partial: Partial<LicenseResult> = {},
): LicenseResult {
  return {
    state: "active",
    entitlements: ["bundle"],
    userId: "u",
    email: "u@example.com",
    deviceOK: true,
    lastValidated: new Date().toISOString(),
    ...partial,
  };
}

describe("entitlements-refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    onListeners.clear();
    getSessionMock.mockReset();
    eventsEmit.mockReset();
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      onListeners.set(name, cb);
      return () => onListeners.delete(name);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("entitlementsIncludeBundle detects bundle", () => {
    expect(entitlementsIncludeBundle(["overlays"])).toBe(false);
    expect(entitlementsIncludeBundle(["bundle"])).toBe(true);
  });

  it("isPremiumUnlocked requires bundle and active/grace state", () => {
    const activeBundle = freshLicense();
    expect(isPremiumUnlocked(activeBundle)).toBe(true);

    expect(isPremiumUnlocked({ ...activeBundle, state: "expired" })).toBe(false);
    expect(isPremiumUnlocked({ ...activeBundle, entitlements: [] })).toBe(false);
    expect(isPremiumUnlocked({ ...activeBundle, state: "device-limit" })).toBe(
      false,
    );
  });

  it("parseLastValidatedMs handles ISO strings and rejects Wails object payloads", () => {
    const iso = new Date().toISOString();
    expect(parseLastValidatedMs(iso)).toBe(new Date(iso).getTime());
    expect(parseLastValidatedMs({})).toBeNull();
    expect(parseLastValidatedMs("")).toBeNull();
  });

  it("isFreshLicenseEvent rejects anonymous, stale, and timestamp-less events", () => {
    const now = Date.now();
    const opts = { requireAuthenticated: true, requireTimestamp: true };
    expect(
      isFreshLicenseEvent(
        {
          state: "anonymous",
          entitlements: [],
          userId: "",
          email: "",
          deviceOK: false,
        },
        now,
        opts,
      ),
    ).toBe(false);
    expect(
      isFreshLicenseEvent(
        freshLicense({
          lastValidated: new Date(now - 60_000).toISOString(),
        }),
        now,
        opts,
      ),
    ).toBe(false);
    expect(
      isFreshLicenseEvent(
        {
          state: "active",
          entitlements: ["bundle"],
          userId: "u",
          email: "u@example.com",
          deviceOK: true,
        },
        now,
        opts,
      ),
    ).toBe(false);
    expect(isFreshLicenseEvent(freshLicense(), now, opts)).toBe(true);
    expect(
      isFreshLicenseEvent(
        freshLicense({ lastValidated: {} as unknown as string }),
        now,
        { requireAuthenticated: true, requireTimestamp: false },
      ),
    ).toBe(true);
  });

  it("refreshCurrentUserEntitlements requires session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    await expect(refreshCurrentUserEntitlements()).resolves.toEqual({
      ok: false,
      reason: "login_required",
    });
  });

  it("refreshCurrentUserEntitlements emits validate with session token", async () => {
    getSessionMock.mockResolvedValueOnce({ access_token: "tok-1" });
    const promise = refreshCurrentUserEntitlements({ timeoutMs: 5000 });
    await Promise.resolve();
    expect(eventsEmit).toHaveBeenCalledWith("license:validate", {
      sessionToken: "tok-1",
    });
    emitChanged(freshLicense());
    await expect(promise).resolves.toEqual({
      ok: true,
      license: expect.objectContaining({ state: "active", entitlements: ["bundle"] }),
      hasBundle: true,
      unlocked: true,
    });
  });

  it("refreshCurrentUserEntitlements ignores stale license:changed events", async () => {
    getSessionMock.mockResolvedValueOnce({ access_token: "tok-1" });
    const promise = refreshCurrentUserEntitlements({ timeoutMs: 5000 });
    await Promise.resolve();
    emitChanged({
      state: "authenticated-no-entitlement",
      entitlements: [],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
      lastValidated: new Date(Date.now() - 60_000).toISOString(),
    });
    emitChanged(freshLicense());
    await expect(promise).resolves.toEqual({
      ok: true,
      license: expect.objectContaining({ state: "active", entitlements: ["bundle"] }),
      hasBundle: true,
      unlocked: true,
    });
  });

  it("refreshCurrentUserEntitlements returns pending when bundle missing", async () => {
    getSessionMock.mockResolvedValueOnce({ access_token: "tok-1" });
    const promise = refreshCurrentUserEntitlements();
    await Promise.resolve();
    emitChanged(
      freshLicense({
        state: "authenticated-no-entitlement",
        entitlements: [],
      }),
    );
    await expect(promise).resolves.toEqual({
      ok: true,
      license: expect.objectContaining({ entitlements: [] }),
      hasBundle: false,
      unlocked: false,
    });
  });

  it("refreshCurrentUserEntitlements times out without license:changed", async () => {
    getSessionMock.mockResolvedValueOnce({ access_token: "tok-1" });
    const promise = refreshCurrentUserEntitlements({ timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1001);
    await expect(promise).resolves.toEqual({ ok: false, reason: "timeout" });
  });

  it("resetActiveDevice requires session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    await expect(resetActiveDevice()).resolves.toEqual({
      ok: false,
      reason: "login_required",
    });
  });

  it("resetActiveDevice emits reset-device and resolves on fresh license:changed", async () => {
    getSessionMock.mockResolvedValueOnce({ access_token: "tok-1" });
    const promise = resetActiveDevice({ timeoutMs: 5000 });
    await Promise.resolve();
    expect(eventsEmit).toHaveBeenCalledWith("license:reset-device", {
      sessionToken: "tok-1",
    });
    emitChanged(freshLicense());
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("resetActiveDevice maps rate_limit errors", async () => {
    getSessionMock.mockResolvedValueOnce({ access_token: "tok-1" });
    const promise = resetActiveDevice({ timeoutMs: 5000 });
    await Promise.resolve();
    emitError("rate_limit: solo 1 reset cada 24h");
    await expect(promise).resolves.toEqual({
      ok: false,
      reason: "rate_limit",
    });
  });
});