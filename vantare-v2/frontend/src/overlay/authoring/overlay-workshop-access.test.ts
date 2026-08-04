import { describe, expect, it } from "vitest";
import { canUseOverlayWorkshop } from "./overlay-workshop-access";
import type { LicenseResult } from "../../lib/license-types";

function license(overrides: Partial<LicenseResult> = {}): LicenseResult {
  return {
    state: "active",
    entitlements: [],
    userId: "00000000-0000-0000-0000-000000000001",
    email: "not-an-authority@example.test",
    deviceOK: true,
    ...overrides,
  };
}

describe("canUseOverlayWorkshop", () => {
  it("is automatic only in local development", () => {
    expect(canUseOverlayWorkshop(null, true)).toBe(true);
    expect(canUseOverlayWorkshop(null, false)).toBe(false);
  });

  it.each([
    ["free", license({ state: "authenticated-no-entitlement" })],
    ["Pro", license({ capabilities: ["vantare.plan.pro"] })],
    ["Pro Plus", license({ capabilities: ["vantare.channel.nightly"] })],
    ["Launch Edition", license({ capabilities: ["vantare.edition.launch_v1"] })],
    ["unsigned owner capability", license({ capabilities: ["vantare.operational.owner"] })],
    ["tester", license({ operationalRoles: ["tester"] })],
    ["nightly tester", license({ operationalRoles: ["nightly_tester"] })],
    ["expired owner", license({ state: "expired", operationalRoles: ["owner"] })],
    ["revoked owner", license({ operationalRoles: [] })],
  ])("denies %s in prerelease builds", (_name, candidate) => {
    expect(canUseOverlayWorkshop(candidate, false)).toBe(false);
  });

  it("accepts only an active or grace operational owner", () => {
    // An owner can have no commercial entitlement at all. The role has already
    // been derived by the native signed-credential verifier, so do not couple
    // this internal tool to Polar plan state.
    expect(canUseOverlayWorkshop(license({ operationalRoles: ["owner"] }), false)).toBe(true);
    expect(canUseOverlayWorkshop(license({ state: "grace", operationalRoles: ["owner"] }), false)).toBe(true);
  });
});
