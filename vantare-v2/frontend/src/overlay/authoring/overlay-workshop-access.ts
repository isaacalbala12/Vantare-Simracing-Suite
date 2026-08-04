import type { LicenseResult } from "../../lib/license-types";

const ACTIVE_LICENSE_STATES = new Set<LicenseResult["state"]>(["active", "grace"]);

/**
 * Workshop is not a commercial feature. A prerelease build may expose it only
 * to the independently signed operational owner role. The role arrives in the
 * LicenseResult after native credential verification; this function never
 * consults email, local storage, URL state, or an entitlement override.
 */
export function canUseOverlayWorkshop(
  license: LicenseResult | null | undefined,
  isDevelopment: boolean,
): boolean {
  if (isDevelopment) return true;
  return Boolean(
    license &&
      ACTIVE_LICENSE_STATES.has(license.state) &&
      license.operationalRoles?.includes("owner"),
  );
}
