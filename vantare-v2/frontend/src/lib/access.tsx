import { useMemo } from "react";
import { useLicense } from "./license";
import { buildAccessContext } from "./access-policy";
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
    const effectiveRoles: AccessRole[] = [...roles];
    if (devMode === "tester" || devMode === "power-tester") {
      // ACCESS-DEV-MODES-01: tester and power-tester are equivalent.
      // Both use the existing tester role. Differentiation is future work.
      if (!effectiveRoles.includes("tester")) {
        effectiveRoles.push("tester");
      }
    }

    if (!effectiveResult) {
      return {
        planLabel: "free",
        planStatus: "free",
        roles: effectiveRoles,
        isBlocked: false,
        isUnconfigured: false,
      };
    }
    return buildAccessContext({ license: effectiveResult, roles: effectiveRoles });
  }, [result, options?.roles]);
}
