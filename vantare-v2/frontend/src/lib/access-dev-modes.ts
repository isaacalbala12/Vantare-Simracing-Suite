import type { LicenseResult } from "./license-types";

// ── Types ──────────────────────────────────────────────────────────────

export type AccessDevMode =
  | "real"
  | "free"
  | "paid"
  | "tester"
  | "power-tester"
  | "blocked";

export const DEV_MODES = [
  "real",
  "free",
  "paid",
  "tester",
  "power-tester",
  "blocked",
] as const;

// ── Mapping mode → LicenseResult ───────────────────────────────────────

function licenseForMode(mode: AccessDevMode): LicenseResult {
  switch (mode) {
    case "real":
      // "real" is handled by the caller — should never reach here
      // in practice, but return anonymous as safe fallback.
      return {
        state: "anonymous",
        entitlements: [],
        userId: "",
        email: "",
        deviceOK: false,
      };

    case "free":
      return {
        state: "authenticated-no-entitlement",
        entitlements: [],
        userId: "dev-free",
        email: "dev-free@test.local",
        deviceOK: true,
      };

    case "paid":
      return {
        state: "active",
        entitlements: ["overlays", "engineer"],
        userId: "dev-paid",
        email: "dev-paid@test.local",
        deviceOK: true,
      };

    case "tester":
      return {
        state: "authenticated-no-entitlement",
        entitlements: [],
        userId: "dev-tester",
        email: "dev-tester@test.local",
        deviceOK: true,
      };

    case "power-tester":
      return {
        state: "authenticated-no-entitlement",
        entitlements: [],
        userId: "dev-power-tester",
        email: "dev-power-tester@test.local",
        deviceOK: true,
      };

    case "blocked":
      return {
        state: "expired",
        entitlements: [],
        userId: "dev-blocked",
        email: "dev-blocked@test.local",
        deviceOK: false,
        error: "Simulated blocked license for dev mode",
      };
  }
}

// ── Resolution ─────────────────────────────────────────────────────────

/**
 * Detect the dev mode from environment variable or URL query parameter.
 * Returns "real" when no override is present.
 *
 * Priority: ?access= query param > VITE_ACCESS_MODE env > "real"
 *
 * In production (import.meta.env.PROD === true), always returns "real".
 */
export function resolveAccessDevModeInput(options: {
  search?: string;
  envMode?: string;
  prod?: boolean;
}): AccessDevMode {
  const { search = "", envMode, prod = false } = options;

  // In production, never allow overrides.
  if (prod) {
    return "real";
  }

  // Check URL query param first (for harness and manual testing).
  const params = new URLSearchParams(search);
  const fromQuery = params.get("access");
  if (fromQuery && isValidDevMode(fromQuery)) {
    return fromQuery;
  }

  // Check Vite env var (for persistent dev defaults).
  if (envMode && isValidDevMode(envMode)) {
    return envMode;
  }

  return "real";
}

/**
 * Runtime wrapper around the pure resolver.
 */
export function resolveAccessDevMode(): AccessDevMode {
  return resolveAccessDevModeInput({
    search: typeof window !== "undefined" ? window.location.search : "",
    envMode: import.meta.env.VITE_ACCESS_MODE as string | undefined,
    prod: import.meta.env.PROD,
  });
}

/**
 * Map a dev mode to the corresponding LicenseResult.
 * Returns null for "real" mode (signals: use real license).
 */
export function resolveLicenseForDevMode(
  mode: AccessDevMode,
): LicenseResult | null {
  if (mode === "real") return null;
  return licenseForMode(mode);
}

// ── Helpers ────────────────────────────────────────────────────────────

function isValidDevMode(value: string): value is AccessDevMode {
  return (DEV_MODES as readonly string[]).includes(value);
}
