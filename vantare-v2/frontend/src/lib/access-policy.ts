import type { LicenseResult } from "./license-types";
import { buildSummary, classifyStatus } from "./plan";
import type { PlanLabel, PlanStatus } from "./plan";

// ── Types ──────────────────────────────────────────────────────────────

export type FeatureId =
  | "hub.dashboard"
  | "overlays.basic"
  | "overlays.advanced"
  | "calendar.visual"
  | "calendar.followReminders"
  | "engineer.ai"
  | "telemetry.live"
  | "launcher.basic"
  | "roadmap.public"
  | "roadmap.feedback"
  | "settings.account";

export type SectionId =
  | "dashboard"
  | "overlays"
  | "launcher"
  | "calendar"
  | "engineer"
  | "telemetry"
  | "roadmap"
  | "settings";

export type AccessRole = "tester" | "staff" | "dev";

export type FeatureGate = {
  allowed: boolean;
  reason?: "upgrade" | "blocked-license" | "unconfigured" | "beta";
};

export type AccessContext = {
  /** The plan label derived from entitlements. */
  planLabel: PlanLabel;
  /** The plan status derived from license state. */
  planStatus: PlanStatus;
  /** Non-commercial roles that override plan restrictions. */
  roles: AccessRole[];
  /** Whether the license is in a blocked state (expired, device-limit). */
  isBlocked: boolean;
  /** Whether the license is unconfigured (no Supabase client). */
  isUnconfigured: boolean;
};

// ── Policy matrix ──────────────────────────────────────────────────────

type PlanPolicy = {
  free: boolean;
  paid_overlays: boolean;
  paid_engineer: boolean;
  suite: boolean;
  unknown: boolean;
};

const FEATURE_POLICY: Record<FeatureId, PlanPolicy> = {
  "hub.dashboard": {
    free: true,
    paid_overlays: true,
    paid_engineer: true,
    suite: true,
    unknown: false,
  },
  "launcher.basic": {
    free: true,
    paid_overlays: true,
    paid_engineer: true,
    suite: true,
    unknown: false,
  },
  "calendar.visual": {
    free: true,
    paid_overlays: true,
    paid_engineer: true,
    suite: true,
    unknown: false,
  },
  "calendar.followReminders": {
    free: false,
    paid_overlays: true,
    paid_engineer: true,
    suite: true,
    unknown: false,
  },
  "overlays.basic": {
    free: true,
    paid_overlays: true,
    paid_engineer: false,
    suite: true,
    unknown: false,
  },
  "overlays.advanced": {
    free: false,
    paid_overlays: true,
    paid_engineer: false,
    suite: true,
    unknown: false,
  },
  "engineer.ai": {
    free: false,
    paid_overlays: false,
    paid_engineer: true,
    suite: true,
    unknown: false,
  },
  "telemetry.live": {
    free: false,
    paid_overlays: true,
    paid_engineer: true,
    suite: true,
    unknown: false,
  },
  "roadmap.public": {
    free: true,
    paid_overlays: true,
    paid_engineer: true,
    suite: true,
    unknown: false,
  },
  "roadmap.feedback": {
    free: false,
    paid_overlays: true,
    paid_engineer: true,
    suite: true,
    unknown: false,
  },
  "settings.account": {
    free: true,
    paid_overlays: true,
    paid_engineer: true,
    suite: true,
    unknown: false,
  },
};

// Map sections to their primary feature gate.
const SECTION_FEATURE: Record<SectionId, FeatureId> = {
  dashboard: "hub.dashboard",
  overlays: "overlays.basic",
  launcher: "launcher.basic",
  calendar: "calendar.visual",
  engineer: "engineer.ai",
  telemetry: "telemetry.live",
  roadmap: "roadmap.public",
  settings: "settings.account",
};


// ── Public API ────────────────────────────────────────────────────────

export function buildAccessContext(options: {
  license: LicenseResult;
  roles?: AccessRole[];
}): AccessContext {
  const { license, roles = [] } = options;
  const summary = buildSummary(license.state, license.entitlements);
  const status = classifyStatus(license.state);
  const isBlocked = status === "blocked";
  const isUnconfigured = status === "unconfigured";

  return {
    planLabel: summary.label,
    planStatus: status,
    roles,
    isBlocked,
    isUnconfigured,
  };
}

export function canUseFeature(
  access: AccessContext,
  feature: FeatureId,
): boolean {
  return getFeatureGate(access, feature).allowed;
}

export function getFeatureGate(
  access: AccessContext,
  feature: FeatureId,
): FeatureGate {
  // Tester role overrides plan restrictions for all features.
  if (access.roles.includes("tester")) {
    return { allowed: true };
  }

  // Staff/dev roles unlock everything.
  if (access.roles.includes("staff") || access.roles.includes("dev")) {
    return { allowed: true };
  }


  // Blocked license (expired, device-limit) — no premium even with entitlements.
  if (access.isBlocked) {
    return { allowed: false, reason: "blocked-license" };
  }

  // Unconfigured — base features ok, no premium unless tester (already handled above).
  if (access.isUnconfigured) {
    const policy = FEATURE_POLICY[feature];
    if (policy.free) {
      return { allowed: true };
    }
    return { allowed: false, reason: "unconfigured" };
  }

  // Normal plan-based check.
  const policy = FEATURE_POLICY[feature];
  const allowed = policy[access.planLabel] ?? false;

  if (allowed) {
    return { allowed: true };
  }

  // Determine the reason: if the plan is free but the feature requires a paid plan.
  if (access.planLabel === "free" || access.planLabel === "unknown") {
    return { allowed: false, reason: "upgrade" };
  }

  // The plan doesn't include this feature (e.g. paid_overlays trying engineer.ai).
  return { allowed: false, reason: "upgrade" };
}

export function canSeeSection(
  access: AccessContext,
  section: SectionId,
): boolean {
  const feature = SECTION_FEATURE[section];
  return canUseFeature(access, feature);
}
