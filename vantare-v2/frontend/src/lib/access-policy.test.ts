import { describe, expect, it } from "vitest";
import {
  buildAccessContext,
  canUseFeature,
  getFeatureGate,
  canSeeSection,
} from "./access-policy";
import type { LicenseResult } from "./license-types";

const baseLicense = (overrides: Partial<LicenseResult> = {}): LicenseResult => ({
  state: "authenticated-no-entitlement",
  entitlements: [],
  userId: "user-1",
  email: "driver@example.test",
  deviceOK: true,
  ...overrides,
});

describe("access-policy", () => {
  describe("free user", () => {
    it("handles null entitlements from Wails payloads", () => {
      const access = buildAccessContext({
        license: baseLicense({ entitlements: null as never }),
      });
      expect(access.planLabel).toBe("free");
      expect(canSeeSection(access, "dashboard")).toBe(true);
    });

    it("keeps calendar visual available", () => {
      const access = buildAccessContext({ license: baseLicense() });
      expect(canUseFeature(access, "calendar.visual")).toBe(true);
      expect(getFeatureGate(access, "calendar.visual")).toMatchObject({
        allowed: true,
      });
    });

    it("blocks calendar reminders with upgrade reason", () => {
      const access = buildAccessContext({ license: baseLicense() });
      expect(canUseFeature(access, "calendar.followReminders")).toBe(false);
      expect(getFeatureGate(access, "calendar.followReminders")).toMatchObject({
        allowed: false,
        reason: "upgrade",
      });
    });

    it("grants base features: hub.dashboard, launcher.basic, overlays.basic, roadmap.public, settings.account", () => {
      const access = buildAccessContext({ license: baseLicense() });
      expect(canUseFeature(access, "hub.dashboard")).toBe(true);
      expect(canUseFeature(access, "launcher.basic")).toBe(true);
      expect(canUseFeature(access, "overlays.basic")).toBe(true);
      expect(canUseFeature(access, "roadmap.public")).toBe(true);
      expect(canUseFeature(access, "settings.account")).toBe(true);
    });

    it("blocks premium features: overlays.advanced, engineer.ai, telemetry.live, roadmap.feedback", () => {
      const access = buildAccessContext({ license: baseLicense() });
      expect(canUseFeature(access, "overlays.advanced")).toBe(false);
      expect(canUseFeature(access, "engineer.ai")).toBe(false);
      expect(canUseFeature(access, "telemetry.live")).toBe(false);
      expect(canUseFeature(access, "roadmap.feedback")).toBe(false);
    });
  });

  describe("paid overlays", () => {
    const access = buildAccessContext({
      license: baseLicense({ state: "active", entitlements: ["overlays"] }),
    });

    it("grants overlays.advanced, telemetry.live, calendar.followReminders, roadmap.feedback", () => {
      expect(canUseFeature(access, "overlays.advanced")).toBe(true);
      expect(canUseFeature(access, "telemetry.live")).toBe(true);
      expect(canUseFeature(access, "calendar.followReminders")).toBe(true);
      expect(canUseFeature(access, "roadmap.feedback")).toBe(true);
    });

    it("does not grant engineer.ai", () => {
      expect(canUseFeature(access, "engineer.ai")).toBe(false);
    });
  });

  describe("paid engineer", () => {
    const access = buildAccessContext({
      license: baseLicense({ state: "active", entitlements: ["engineer"] }),
    });

    it("grants engineer.ai, telemetry.live, calendar.followReminders, roadmap.feedback", () => {
      expect(canUseFeature(access, "engineer.ai")).toBe(true);
      expect(canUseFeature(access, "telemetry.live")).toBe(true);
      expect(canUseFeature(access, "calendar.followReminders")).toBe(true);
      expect(canUseFeature(access, "roadmap.feedback")).toBe(true);
    });

    it("does not grant overlays.basic or overlays.advanced", () => {
      expect(canUseFeature(access, "overlays.basic")).toBe(false);
      expect(canUseFeature(access, "overlays.advanced")).toBe(false);
    });
  });

  describe("suite", () => {
    const access = buildAccessContext({
      license: baseLicense({ state: "active", entitlements: ["bundle"] }),
    });

    it("grants all premium features", () => {
      expect(canUseFeature(access, "overlays.advanced")).toBe(true);
      expect(canUseFeature(access, "engineer.ai")).toBe(true);
      expect(canUseFeature(access, "telemetry.live")).toBe(true);
      expect(canUseFeature(access, "calendar.followReminders")).toBe(true);
      expect(canUseFeature(access, "roadmap.feedback")).toBe(true);
    });
  });

  describe("tester role", () => {
    it("grants all premium features to tester free users", () => {
      const access = buildAccessContext({
        license: baseLicense(),
        roles: ["tester"],
      });
      expect(canUseFeature(access, "overlays.advanced")).toBe(true);
      expect(canUseFeature(access, "engineer.ai")).toBe(true);
      expect(canUseFeature(access, "telemetry.live")).toBe(true);
      expect(canUseFeature(access, "calendar.followReminders")).toBe(true);
      expect(canUseFeature(access, "roadmap.feedback")).toBe(true);
    });

    it("allows tester to use premium features without paid entitlements", () => {
      const access = buildAccessContext({
        license: baseLicense(),
        roles: ["tester"],
      });
      expect(canUseFeature(access, "engineer.ai")).toBe(true);
      expect(canUseFeature(access, "calendar.followReminders")).toBe(true);
    });
  });

  describe("blocked / expired", () => {
    it("does not grant premium features to expired suite users", () => {
      const access = buildAccessContext({
        license: baseLicense({ state: "expired", entitlements: ["bundle"] }),
      });
      expect(canUseFeature(access, "engineer.ai")).toBe(false);
      expect(getFeatureGate(access, "engineer.ai").reason).toBe(
        "blocked-license",
      );
    });

    it("does not grant premium to device-limit users", () => {
      const access = buildAccessContext({
        license: baseLicense({
          state: "device-limit",
          entitlements: ["bundle"],
        }),
      });
      expect(canUseFeature(access, "engineer.ai")).toBe(false);
    });
  });

  describe("unconfigured", () => {
    it("allows base features", () => {
      const access = buildAccessContext({
        license: baseLicense({ state: "unconfigured" }),
      });
      expect(canUseFeature(access, "hub.dashboard")).toBe(true);
      expect(canUseFeature(access, "calendar.visual")).toBe(true);
    });

    it("does not grant premium without tester role", () => {
      const access = buildAccessContext({
        license: baseLicense({ state: "unconfigured" }),
      });
      expect(canUseFeature(access, "engineer.ai")).toBe(false);
      expect(getFeatureGate(access, "engineer.ai").reason).toBe(
        "unconfigured",
      );
    });

    it("grants premium to unconfigured tester users", () => {
      const access = buildAccessContext({
        license: baseLicense({ state: "unconfigured" }),
        roles: ["tester"],
      });
      expect(canUseFeature(access, "engineer.ai")).toBe(true);
    });
  });

  describe("canSeeSection", () => {
    it("allows free users to see base sections", () => {
      const access = buildAccessContext({ license: baseLicense() });
      expect(canSeeSection(access, "dashboard")).toBe(true);
      expect(canSeeSection(access, "overlays")).toBe(true);
      expect(canSeeSection(access, "launcher")).toBe(true);
      expect(canSeeSection(access, "calendar")).toBe(true);
      expect(canSeeSection(access, "roadmap")).toBe(true);
      expect(canSeeSection(access, "settings")).toBe(true);
    });

    it("blocks engineer and telemetry sections for free users", () => {
      const access = buildAccessContext({ license: baseLicense() });
      expect(canSeeSection(access, "engineer")).toBe(false);
      expect(canSeeSection(access, "telemetry")).toBe(false);
    });

    it("allows tester free users to see all sections", () => {
      const access = buildAccessContext({
        license: baseLicense(),
        roles: ["tester"],
      });
      expect(canSeeSection(access, "engineer")).toBe(true);
      expect(canSeeSection(access, "telemetry")).toBe(true);
    });
  });
});

describe("feature matrix (table-driven)", () => {
  // Each row: [planLabel, planStatus, entitlements, feature, expected]
  const matrix: Array<{
    name: string;
    state: LicenseResult["state"];
    entitlements: LicenseResult["entitlements"];
    roles?: string[];
    feature: string;
    want: boolean;
  }> = [
    // Free
    { name: "free hub.dashboard", state: "authenticated-no-entitlement", entitlements: [], feature: "hub.dashboard", want: true },
    { name: "free launcher.basic", state: "authenticated-no-entitlement", entitlements: [], feature: "launcher.basic", want: true },
    { name: "free calendar.visual", state: "authenticated-no-entitlement", entitlements: [], feature: "calendar.visual", want: true },
    { name: "free overlays.basic", state: "authenticated-no-entitlement", entitlements: [], feature: "overlays.basic", want: true },
    { name: "free roadmap.public", state: "authenticated-no-entitlement", entitlements: [], feature: "roadmap.public", want: true },
    { name: "free settings.account", state: "authenticated-no-entitlement", entitlements: [], feature: "settings.account", want: true },
    { name: "free NOT overlays.advanced", state: "authenticated-no-entitlement", entitlements: [], feature: "overlays.advanced", want: false },
    { name: "free NOT engineer.ai", state: "authenticated-no-entitlement", entitlements: [], feature: "engineer.ai", want: false },
    { name: "free NOT telemetry.live", state: "authenticated-no-entitlement", entitlements: [], feature: "telemetry.live", want: false },
    { name: "free NOT calendar.followReminders", state: "authenticated-no-entitlement", entitlements: [], feature: "calendar.followReminders", want: false },
    { name: "free NOT roadmap.feedback", state: "authenticated-no-entitlement", entitlements: [], feature: "roadmap.feedback", want: false },

    // Paid overlays
    { name: "overlays overlays.advanced", state: "active", entitlements: ["overlays"], feature: "overlays.advanced", want: true },
    { name: "overlays telemetry.live", state: "active", entitlements: ["overlays"], feature: "telemetry.live", want: true },
    { name: "overlays calendar.followReminders", state: "active", entitlements: ["overlays"], feature: "calendar.followReminders", want: true },
    { name: "overlays roadmap.feedback", state: "active", entitlements: ["overlays"], feature: "roadmap.feedback", want: true },
    { name: "overlays NOT engineer.ai", state: "active", entitlements: ["overlays"], feature: "engineer.ai", want: false },

    // Paid engineer
    { name: "engineer engineer.ai", state: "active", entitlements: ["engineer"], feature: "engineer.ai", want: true },
    { name: "engineer telemetry.live", state: "active", entitlements: ["engineer"], feature: "telemetry.live", want: true },
    { name: "engineer calendar.followReminders", state: "active", entitlements: ["engineer"], feature: "calendar.followReminders", want: true },
    { name: "engineer roadmap.feedback", state: "active", entitlements: ["engineer"], feature: "roadmap.feedback", want: true },
    { name: "engineer NOT overlays.advanced", state: "active", entitlements: ["engineer"], feature: "overlays.advanced", want: false },
    { name: "engineer NOT overlays.basic", state: "active", entitlements: ["engineer"], feature: "overlays.basic", want: false },

    // Suite
    { name: "suite overlays.advanced", state: "active", entitlements: ["bundle"], feature: "overlays.advanced", want: true },
    { name: "suite engineer.ai", state: "active", entitlements: ["bundle"], feature: "engineer.ai", want: true },
    { name: "suite telemetry.live", state: "active", entitlements: ["bundle"], feature: "telemetry.live", want: true },
    { name: "suite calendar.followReminders", state: "active", entitlements: ["bundle"], feature: "calendar.followReminders", want: true },
    { name: "suite roadmap.feedback", state: "active", entitlements: ["bundle"], feature: "roadmap.feedback", want: true },

    // Tester (free plan)
    { name: "tester overlays.advanced", state: "authenticated-no-entitlement", entitlements: [], roles: ["tester"], feature: "overlays.advanced", want: true },
    { name: "tester engineer.ai", state: "authenticated-no-entitlement", entitlements: [], roles: ["tester"], feature: "engineer.ai", want: true },
    { name: "tester telemetry.live", state: "authenticated-no-entitlement", entitlements: [], roles: ["tester"], feature: "telemetry.live", want: true },
    { name: "tester calendar.followReminders", state: "authenticated-no-entitlement", entitlements: [], roles: ["tester"], feature: "calendar.followReminders", want: true },
    { name: "tester roadmap.feedback", state: "authenticated-no-entitlement", entitlements: [], roles: ["tester"], feature: "roadmap.feedback", want: true },

    // Blocked/expired (even with suite entitlements)
    { name: "expired NOT engineer.ai", state: "expired", entitlements: ["bundle"], feature: "engineer.ai", want: false },
    { name: "device-limit NOT engineer.ai", state: "device-limit", entitlements: ["bundle"], feature: "engineer.ai", want: false },

    // Unconfigured
    { name: "unconfigured hub.dashboard", state: "unconfigured", entitlements: [], feature: "hub.dashboard", want: true },
    { name: "unconfigured NOT engineer.ai", state: "unconfigured", entitlements: [], feature: "engineer.ai", want: false },
    { name: "unconfigured+tester engineer.ai", state: "unconfigured", entitlements: [], roles: ["tester"], feature: "engineer.ai", want: true },
  ];

  for (const tc of matrix) {
    it(tc.name, () => {
      const access = buildAccessContext({
        license: baseLicense({
          state: tc.state,
          entitlements: tc.entitlements,
        }),
        roles: (tc.roles ?? []) as never,
      });
      expect(canUseFeature(access, tc.feature as never)).toBe(tc.want);
    });
  }
});
