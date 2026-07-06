import { describe, expect, it } from "vitest";
import {
  resolveAccessDevModeInput,
  resolveLicenseForDevMode,
  DEV_MODES,
} from "./access-dev-modes";
import {
  buildAccessContext,
  canUseFeature,
  getFeatureGate,
} from "./access-policy";

describe("access-dev-modes", () => {
  describe("DEV_MODES", () => {
    it("contains all expected modes", () => {
      expect(DEV_MODES).toEqual([
        "real",
        "free",
        "paid",
        "tester",
        "power-tester",
        "blocked",
      ]);
    });
  });

  describe("resolveAccessDevModeInput", () => {
    it("returns 'real' when no override is present", () => {
      expect(resolveAccessDevModeInput({})).toBe("real");
    });

    it("uses query param before env var", () => {
      expect(
        resolveAccessDevModeInput({
          search: "?access=tester",
          envMode: "free",
          prod: false,
        }),
      ).toBe("tester");
    });

    it("uses env var when query param is missing", () => {
      expect(resolveAccessDevModeInput({ envMode: "paid" })).toBe("paid");
    });

    it("ignores invalid query and env values", () => {
      expect(
        resolveAccessDevModeInput({
          search: "?access=admin",
          envMode: "root",
        }),
      ).toBe("real");
    });

    it("returns 'real' in production even with query param", () => {
      expect(
        resolveAccessDevModeInput({
          search: "?access=tester",
          envMode: "paid",
          prod: true,
        }),
      ).toBe("real");
    });
  });

  describe("resolveLicenseForDevMode", () => {
    it("returns null for 'real' mode", () => {
      expect(resolveLicenseForDevMode("real")).toBeNull();
    });

    it("returns free license for 'free' mode", () => {
      const license = resolveLicenseForDevMode("free");
      expect(license).not.toBeNull();
      expect(license!.state).toBe("authenticated-no-entitlement");
      expect(license!.entitlements).toEqual([]);
      expect(license!.deviceOK).toBe(true);
    });

    it("returns active paid license for 'paid' mode", () => {
      const license = resolveLicenseForDevMode("paid");
      expect(license!.state).toBe("active");
      expect(license!.entitlements).toContain("overlays");
      expect(license!.entitlements).toContain("engineer");
      expect(license!.deviceOK).toBe(true);
    });

    it("returns authenticated license for 'tester' mode", () => {
      const license = resolveLicenseForDevMode("tester");
      expect(license!.state).toBe("authenticated-no-entitlement");
      expect(license!.entitlements).toEqual([]);
      expect(license!.deviceOK).toBe(true);
    });

    it("returns authenticated license for 'power-tester' mode", () => {
      const license = resolveLicenseForDevMode("power-tester");
      expect(license!.state).toBe("authenticated-no-entitlement");
      expect(license!.entitlements).toEqual([]);
      expect(license!.deviceOK).toBe(true);
    });

    it("returns expired license for 'blocked' mode", () => {
      const license = resolveLicenseForDevMode("blocked");
      expect(license!.state).toBe("expired");
      expect(license!.entitlements).toEqual([]);
      expect(license!.deviceOK).toBe(false);
      expect(license!.error).toBeDefined();
    });
  });

  describe("roundtrip: mode → license → access context", () => {
    it("free mode produces free AccessContext", () => {
      const license = resolveLicenseForDevMode("free")!;
      const ctx = buildAccessContext({ license });
      expect(ctx.planLabel).toBe("free");
      expect(ctx.planStatus).toBe("free");
      expect(ctx.isBlocked).toBe(false);
    });

    it("paid mode produces suite AccessContext", () => {
      const license = resolveLicenseForDevMode("paid")!;
      const ctx = buildAccessContext({ license });
      expect(ctx.planLabel).toBe("suite");
      expect(ctx.planStatus).toBe("active");
    });

    it("blocked mode produces blocked AccessContext", () => {
      const license = resolveLicenseForDevMode("blocked")!;
      const ctx = buildAccessContext({ license });
      expect(ctx.isBlocked).toBe(true);
    });
    it("tester mode produces free AccessContext with no entitlements", () => {
      const license = resolveLicenseForDevMode("tester")!;
      const ctx = buildAccessContext({ license });
      expect(ctx.planLabel).toBe("free");
      expect(ctx.planStatus).toBe("free");
      expect(ctx.isBlocked).toBe(false);
    });

    it("power-tester mode produces free AccessContext with no entitlements", () => {
      const license = resolveLicenseForDevMode("power-tester")!;
      const ctx = buildAccessContext({ license });
      expect(ctx.planLabel).toBe("free");
      expect(ctx.planStatus).toBe("free");
      expect(ctx.isBlocked).toBe(false);
    });
  });

  describe("integration: dev modes through policy", () => {
    it("free mode: advanced blocked, dashboard allowed", () => {
      const license = resolveLicenseForDevMode("free")!;
      const ctx = buildAccessContext({ license, roles: [] });
      expect(canUseFeature(ctx, "overlays.advanced")).toBe(false);
      expect(canUseFeature(ctx, "hub.dashboard")).toBe(true);
    });

    it("paid mode: advanced allowed, engineer allowed", () => {
      const license = resolveLicenseForDevMode("paid")!;
      const ctx = buildAccessContext({ license, roles: [] });
      expect(canUseFeature(ctx, "overlays.advanced")).toBe(true);
      expect(canUseFeature(ctx, "engineer.ai")).toBe(true);
    });

    it("tester mode: all features allowed via roles", () => {
      const license = resolveLicenseForDevMode("tester")!;
      const ctx = buildAccessContext({ license, roles: ["tester"] });
      expect(canUseFeature(ctx, "overlays.advanced")).toBe(true);
      expect(canUseFeature(ctx, "engineer.ai")).toBe(true);
      expect(canUseFeature(ctx, "telemetry.live")).toBe(true);
    });

    it("power-tester mode: all features allowed (same tester role)", () => {
      const license = resolveLicenseForDevMode("power-tester")!;
      const ctx = buildAccessContext({ license, roles: ["tester"] });
      expect(canUseFeature(ctx, "overlays.advanced")).toBe(true);
      expect(canUseFeature(ctx, "engineer.ai")).toBe(true);
      expect(canUseFeature(ctx, "telemetry.live")).toBe(true);
    });

    it("blocked mode: all premium features blocked", () => {
      const license = resolveLicenseForDevMode("blocked")!;
      const ctx = buildAccessContext({ license });
      expect(ctx.isBlocked).toBe(true);
      expect(canUseFeature(ctx, "overlays.advanced")).toBe(false);
      expect(canUseFeature(ctx, "engineer.ai")).toBe(false);
    });

    it("tester and power-tester produce identical feature gates", () => {
      const testerLicense = resolveLicenseForDevMode("tester")!;
      const ptLicense = resolveLicenseForDevMode("power-tester")!;
      const testerCtx = buildAccessContext({
        license: testerLicense,
        roles: ["tester"],
      });
      const ptCtx = buildAccessContext({
        license: ptLicense,
        roles: ["tester"],
      });

      const features = [
        "overlays.advanced",
        "engineer.ai",
        "telemetry.live",
        "calendar.followReminders",
        "roadmap.feedback",
      ] as const;

      for (const feature of features) {
        expect(getFeatureGate(testerCtx, feature)).toEqual(
          getFeatureGate(ptCtx, feature),
        );
      }
    });
  });
});
