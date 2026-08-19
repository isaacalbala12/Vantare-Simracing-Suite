import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  entitlementsSuiteGranting,
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

/**
 * `await Promise.resolve()` solo vacia un tick de microtareas: si la sesion
 * simulada resuelve en mas de uno, el listener `license:changed` todavia no
 * esta registrado cuando el test lo emite. Este helper vacia la cola entera de
 * forma determinista, sin esperas reales.
 */
async function flushPending(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
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

  it("entitlementsSuiteGranting detects suite-granting entitlements", () => {
    // Suite-granting standalone entitlements
    expect(entitlementsSuiteGranting(["bundle"])).toBe(true);
    expect(entitlementsSuiteGranting(["beta_access"])).toBe(true);
    expect(entitlementsSuiteGranting(["founder"])).toBe(true);
    expect(entitlementsSuiteGranting(["pro_founder"])).toBe(true);
    expect(entitlementsSuiteGranting(["visionary_backer"])).toBe(true);
    // Non-suite entitlements
    expect(entitlementsSuiteGranting(["overlays"])).toBe(false);
    expect(entitlementsSuiteGranting(["engineer"])).toBe(false);
    expect(entitlementsSuiteGranting(["supporter"])).toBe(false);
    // Suite from combination
    expect(entitlementsSuiteGranting(["overlays", "engineer"])).toBe(true);
    // Edge cases
    expect(entitlementsSuiteGranting([])).toBe(false);
    expect(entitlementsSuiteGranting(null)).toBe(false);
    expect(entitlementsSuiteGranting(undefined)).toBe(false);
  });

  it("isPremiumUnlocked requires suite entitlement and active/grace state", () => {
    const activeSuite = freshLicense();
    expect(isPremiumUnlocked(activeSuite)).toBe(true);

    // Suite entitlements work
    expect(
      isPremiumUnlocked({ ...activeSuite, entitlements: ["beta_access"] }),
    ).toBe(true);
    expect(
      isPremiumUnlocked({ ...activeSuite, entitlements: ["founder"] }),
    ).toBe(true);
    expect(
      isPremiumUnlocked({ ...activeSuite, entitlements: ["pro_founder"] }),
    ).toBe(true);
    expect(
      isPremiumUnlocked({
        ...activeSuite,
        entitlements: ["visionary_backer"],
      }),
    ).toBe(true);
    expect(
      isPremiumUnlocked({
        ...activeSuite,
        entitlements: ["overlays", "engineer"],
      }),
    ).toBe(true);

    // Blocked states
    expect(isPremiumUnlocked({ ...activeSuite, state: "expired" })).toBe(false);
    expect(isPremiumUnlocked({ ...activeSuite, entitlements: [] })).toBe(false);
    expect(isPremiumUnlocked({ ...activeSuite, state: "device-limit" })).toBe(
      false,
    );
    // Grace state is allowed
    expect(isPremiumUnlocked({ ...activeSuite, state: "grace" })).toBe(true);
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
    await flushPending();
    expect(eventsEmit).toHaveBeenCalledWith("license:validate", {
      sessionToken: "tok-1",
    });
    emitChanged(freshLicense());
    await expect(promise).resolves.toEqual({
      ok: true,
      license: expect.objectContaining({ state: "active", entitlements: ["bundle"] }),
      hasSuite: true,
      unlocked: true,
    });
  });

  it("refreshCurrentUserEntitlements ignores stale license:changed events", async () => {
    getSessionMock.mockResolvedValueOnce({ access_token: "tok-1" });
    const promise = refreshCurrentUserEntitlements({ timeoutMs: 5000 });
    await flushPending();
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
      hasSuite: true,
      unlocked: true,
    });
  });

  it("refreshCurrentUserEntitlements returns pending when suite entitlement missing", async () => {
    getSessionMock.mockResolvedValueOnce({ access_token: "tok-1" });
    const promise = refreshCurrentUserEntitlements();
    await flushPending();
    emitChanged(
      freshLicense({
        state: "authenticated-no-entitlement",
        entitlements: [],
      }),
    );
    await expect(promise).resolves.toEqual({
      ok: true,
      license: expect.objectContaining({ entitlements: [] }),
      hasSuite: false,
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
    await flushPending();
    expect(eventsEmit).toHaveBeenCalledWith("license:reset-device", {
      sessionToken: "tok-1",
    });
    emitChanged(freshLicense());
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("resetActiveDevice maps rate_limit errors", async () => {
    getSessionMock.mockResolvedValueOnce({ access_token: "tok-1" });
    const promise = resetActiveDevice({ timeoutMs: 5000 });
    await flushPending();
    emitError("rate_limit: solo 1 reset cada 24h");
    await expect(promise).resolves.toEqual({
      ok: false,
      reason: "rate_limit",
    });
  });
});

// Regression tests: verify each suite-granting entitlement individually unlocks premium
// These tests ensure the bug "user with beta_access shown paywall" doesn't resurface
describe("suite-granting entitlements regression tests", () => {
  it("beta_access alone unlocks premium", () => {
    expect(
      isPremiumUnlocked({
        state: "active",
        entitlements: ["beta_access"],
        userId: "u",
        email: "u@example.com",
        deviceOK: true,
      }),
    ).toBe(true);
  });

  it("founder alone unlocks premium", () => {
    expect(
      isPremiumUnlocked({
        state: "active",
        entitlements: ["founder"],
        userId: "u",
        email: "u@example.com",
        deviceOK: true,
      }),
    ).toBe(true);
  });

  it("pro_founder alone unlocks premium", () => {
    expect(
      isPremiumUnlocked({
        state: "active",
        entitlements: ["pro_founder"],
        userId: "u",
        email: "u@example.com",
        deviceOK: true,
      }),
    ).toBe(true);
  });

  it("visionary_backer alone unlocks premium", () => {
    expect(
      isPremiumUnlocked({
        state: "active",
        entitlements: ["visionary_backer"],
        userId: "u",
        email: "u@example.com",
        deviceOK: true,
      }),
    ).toBe(true);
  });

  it("overlays + engineer together unlock premium", () => {
    expect(
      isPremiumUnlocked({
        state: "active",
        entitlements: ["overlays", "engineer"],
        userId: "u",
        email: "u@example.com",
        deviceOK: true,
      }),
    ).toBe(true);
  });

  it("unrelated entitlement alone does not unlock", () => {
    expect(
      isPremiumUnlocked({
        state: "active",
        entitlements: ["ac_lua_pack"],
        userId: "u",
        email: "u@example.com",
        deviceOK: true,
      }),
    ).toBe(false);
  });

  it("device-limit blocks even with valid suite entitlement", () => {
    expect(
      isPremiumUnlocked({
        state: "device-limit",
        entitlements: ["beta_access"],
        userId: "u",
        email: "u@example.com",
        deviceOK: false,
      }),
    ).toBe(false);
  });

  it("grace state still unlocks with suite entitlement", () => {
    expect(
      isPremiumUnlocked({
        state: "grace",
        entitlements: ["founder"],
        userId: "u",
        email: "u@example.com",
        deviceOK: true,
      }),
    ).toBe(true);
  });

  it("overlays alone does not unlock", () => {
    expect(
      isPremiumUnlocked({
        state: "active",
        entitlements: ["overlays"],
        userId: "u",
        email: "u@example.com",
        deviceOK: true,
      }),
    ).toBe(false);
  });

  it("engineer alone does not unlock", () => {
    expect(
      isPremiumUnlocked({
        state: "active",
        entitlements: ["engineer"],
        userId: "u",
        email: "u@example.com",
        deviceOK: true,
      }),
    ).toBe(false);
  });
});