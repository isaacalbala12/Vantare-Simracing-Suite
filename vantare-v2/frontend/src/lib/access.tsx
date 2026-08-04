import { useMemo } from "react";
import { useLicense } from "./license";
import { buildAccessContext, operationalRolesFromLicense } from "./access-policy";
import type { AccessContext, AccessRole } from "./access-policy";
import { resolveAccessDevMode, resolveLicenseForDevMode } from "./access-dev-modes";

export function useAccess(options?: { roles?: AccessRole[] }): AccessContext {
  const { result } = useLicense();

  return useMemo(() => {
    const roles = options?.roles ?? [];
    const devMode = resolveAccessDevMode();

    // In dev/test mode, synthesize a license from the mode override.
    const licenseOverride = resolveLicenseForDevMode(devMode);
    const effectiveResult = licenseOverride ?? result;

    // Resolve roles based on dev mode.
    const effectiveRoles: AccessRole[] = Array.from(
      new Set<AccessRole>([
        ...roles,
        ...operationalRolesFromLicense(effectiveResult),
      ]),
    );
    if (devMode === "tester" && !effectiveRoles.includes("tester")) {
      effectiveRoles.push("tester");
    }
    if (
      devMode === "power-tester" &&
      !effectiveRoles.includes("nightly_tester")
    ) {
      effectiveRoles.push("nightly_tester");
    }

    if (!effectiveResult) {
      return {
        planLabel: "free",
        planStatus: "free",
        roles: effectiveRoles,
        capabilities: [],
        isBlocked: false,
        isUnconfigured: false,
      };
    }
    return buildAccessContext({ license: effectiveResult, roles: effectiveRoles });
  }, [result, options?.roles]);
}
