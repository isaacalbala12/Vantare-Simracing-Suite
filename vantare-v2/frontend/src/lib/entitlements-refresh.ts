import { Events } from "@wailsio/runtime";
import { getSession } from "./supabase-auth";
import type { Entitlement, LicenseResult } from "./license-types";
import { licenseDebug, licenseDebugWarn } from "./license-debug";

export type EntitlementRefreshReason =
  | "login_required"
  | "timeout"
  | "validation_error";

export type EntitlementRefreshResult =
  | {
      ok: true;
      license: LicenseResult;
      hasBundle: boolean;
      unlocked: boolean;
    }
  | { ok: false; reason: EntitlementRefreshReason };

export type DeviceResetReason = "login_required" | "rate_limit" | "error";

export type DeviceResetResult =
  | { ok: true }
  | { ok: false; reason: DeviceResetReason };

const DEFAULT_TIMEOUT_MS = 15_000;
const STALE_EVENT_SKEW_MS = 250;

/** Parse lastValidated from ISO strings; Wails may pass Go time.Time as {}. */
export function parseLastValidatedMs(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) || ms <= 0 ? null : ms;
  }
  return null;
}

export function entitlementsIncludeBundle(
  entitlements: Entitlement[] | null | undefined,
): boolean {
  return Array.isArray(entitlements) && entitlements.includes("bundle");
}

export function isPremiumUnlocked(license: LicenseResult): boolean {
  if (!entitlementsIncludeBundle(license.entitlements)) {
    return false;
  }
  if (license.state === "device-limit") {
    return false;
  }
  return license.state === "active" || license.state === "grace";
}

export function isFreshLicenseEvent(
  data: LicenseResult | null | undefined,
  requestedAfterMs: number,
  options?: {
    requireAuthenticated?: boolean;
    requireTimestamp?: boolean;
  },
): boolean {
  if (!data) {
    return false;
  }
  if (options?.requireAuthenticated && data.state === "anonymous") {
    return false;
  }
  const validatedMs = parseLastValidatedMs(data.lastValidated);
  if (validatedMs === null) {
    return !options?.requireTimestamp;
  }
  return validatedMs >= requestedAfterMs - STALE_EVENT_SKEW_MS;
}

function isRateLimitMessage(message: string): boolean {
  return /rate_limit|solo 1 reset cada 24h/i.test(message);
}

export async function refreshCurrentUserEntitlements(options?: {
  timeoutMs?: number;
}): Promise<EntitlementRefreshResult> {
  const session = await getSession();
  if (!session?.access_token) {
    licenseDebugWarn("refresh", "sin sesión Supabase (getSession vacío)");
    return { ok: false, reason: "login_required" };
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requestedAfterMs = Date.now();
  licenseDebug("refresh", "inicio", {
    tokenLen: session.access_token.length,
    timeoutMs,
  });

  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: EntitlementRefreshResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubChanged?.();
      unsubError?.();
      if (value.ok) {
        licenseDebug("refresh", "ok", {
          state: value.license.state,
          email: value.license.email,
          entitlements: value.license.entitlements,
          hasBundle: value.hasBundle,
          unlocked: value.unlocked,
        });
      } else {
        licenseDebugWarn("refresh", "falló", { reason: value.reason });
      }
      resolve(value);
    };

    const unsubChanged = Events.On("license:changed", (event: unknown) => {
      const data = (event as { data?: LicenseResult | null })?.data ?? null;
      const fresh = data
        ? isFreshLicenseEvent(data, requestedAfterMs, {
            requireAuthenticated: true,
            requireTimestamp: false,
          })
        : false;
      licenseDebug("refresh", "license:changed recibido", {
        state: data?.state ?? "null",
        email: data?.email ?? "",
        entitlements: data?.entitlements ?? [],
        fresh,
        lastValidated: data?.lastValidated ?? null,
      });
      if (!data || !fresh) {
        return;
      }
      finish({
        ok: true,
        license: data,
        hasBundle: entitlementsIncludeBundle(data.entitlements),
        unlocked: isPremiumUnlocked(data),
      });
    });

    const unsubError = Events.On("license:error", (event: unknown) => {
      const message =
        (event as { data?: { message?: string } })?.data?.message ?? "";
      licenseDebugWarn("refresh", "license:error", { message });
      finish({ ok: false, reason: "validation_error" });
    });

    const timer = setTimeout(() => {
      licenseDebugWarn("refresh", "timeout esperando license:changed");
      finish({ ok: false, reason: "timeout" });
    }, timeoutMs);

    licenseDebug("refresh", "emit license:validate");
    Events.Emit("license:validate", { sessionToken: session.access_token });
  });
}

export async function resetActiveDevice(options?: {
  timeoutMs?: number;
}): Promise<DeviceResetResult> {
  const session = await getSession();
  if (!session?.access_token) {
    licenseDebugWarn("reset-device", "sin sesión Supabase (getSession vacío)");
    return { ok: false, reason: "login_required" };
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requestedAfterMs = Date.now();
  licenseDebug("reset-device", "inicio", {
    tokenLen: session.access_token.length,
    timeoutMs,
  });

  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: DeviceResetResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubChanged?.();
      unsubError?.();
      if (value.ok) {
        licenseDebug("reset-device", "ok");
      } else {
        licenseDebugWarn("reset-device", "falló", { reason: value.reason });
      }
      resolve(value);
    };

    const unsubChanged = Events.On("license:changed", (event: unknown) => {
      const data = (event as { data?: LicenseResult | null })?.data ?? null;
      const fresh = data
        ? isFreshLicenseEvent(data, requestedAfterMs, {
            requireAuthenticated: true,
            requireTimestamp: false,
          })
        : false;
      licenseDebug("reset-device", "license:changed recibido", {
        state: data?.state ?? "null",
        email: data?.email ?? "",
        fresh,
      });
      if (!data || !fresh) {
        return;
      }
      finish({ ok: true });
    });

    const unsubError = Events.On("license:error", (event: unknown) => {
      const message =
        (event as { data?: { message?: string } })?.data?.message ?? "";
      licenseDebugWarn("reset-device", "license:error", { message });
      if (isRateLimitMessage(message)) {
        finish({ ok: false, reason: "rate_limit" });
        return;
      }
      finish({ ok: false, reason: "error" });
    });

    const timer = setTimeout(() => {
      licenseDebugWarn(
        "reset-device",
        "timeout esperando license:changed tras reset",
      );
      finish({ ok: false, reason: "error" });
    }, timeoutMs);

    licenseDebug("reset-device", "emit license:reset-device");
    Events.Emit("license:reset-device", {
      sessionToken: session.access_token,
    });
  });
}