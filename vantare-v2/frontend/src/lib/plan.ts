import type { Entitlement, LicenseState } from "./license-types";

// PlanLabel mirrors internal/license.PlanLabel.
export type PlanLabel =
  | "free"
  | "paid_overlays"
  | "paid_engineer"
  | "suite"
  | "unknown";

// PlanStatus mirrors internal/license.PlanStatus.
export type PlanStatus =
  | "active"
  | "grace"
  | "blocked"
  | "free"
  | "anonymous"
  | "unconfigured";

export type PlanSummary = {
  label: PlanLabel;
  status: PlanStatus;
};

// The canonical labels shown in the AccountSettings card and the PaywallScreen
// banner. Kept in Spanish to match the rest of the beta UI.
export const PLAN_LABELS: Record<PlanLabel, string> = {
  free: "Free",
  paid_overlays: "Overlays",
  paid_engineer: "Engineer",
  suite: "Suite",
  unknown: "Sin clasificar",
};

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  active: "Activo",
  grace: "Periodo de gracia",
  blocked: "Bloqueado",
  free: "Sin suscripción",
  anonymous: "Sin sesión",
  unconfigured: "Configuración incompleta",
};

function normaliseEntitlements(entitlements: Entitlement[] | null | undefined): Entitlement[] {
  return Array.isArray(entitlements) ? entitlements : [];
}

export function classifyPlan(entitlements: Entitlement[] | null | undefined): PlanLabel {
  const has = new Set<Entitlement>();
  for (const e of normaliseEntitlements(entitlements)) {
    if (!e) continue;
    has.add(e);
  }
  if (has.size === 0) return "free";

  if (
    has.has("bundle") ||
    has.has("beta_access") ||
    has.has("founder") ||
    has.has("pro_founder") ||
    has.has("visionary_backer") ||
    (has.has("overlays") && has.has("engineer"))
  ) {
    return "suite";
  }
  if (has.has("overlays") || has.has("supporter")) return "paid_overlays";
  if (has.has("engineer")) return "paid_engineer";
  if (has.has("ac_lua_pack")) return "free";

  return "unknown";
}

export function classifyStatus(state: LicenseState | null): PlanStatus {
  switch (state) {
    case "active":
      return "active";
    case "grace":
      return "grace";
    case "expired":
    case "device-limit":
      return "blocked";
    case "authenticated-no-entitlement":
      return "free";
    case "anonymous":
      return "anonymous";
    case "unconfigured":
      return "unconfigured";
    default:
      return "free";
  }
}

export function buildSummary(
  state: LicenseState | null,
  entitlements: Entitlement[] | null | undefined,
): PlanSummary {
  const status = classifyStatus(state);
  const label = classifyPlan(entitlements);

  if (status === "blocked" || status === "anonymous") {
    return { label, status };
  }
  // Unconfigured is a configuration error, not a block: keep the label so
  // the UI can show an actionable message without a false paywall.
  if (status === "unconfigured") {
    return { label, status };
  }
  if (status === "active" || status === "grace") {
    if (label === "unknown") return { label: "free", status };
    return { label, status };
  }
  return { label: "free", status };
}

export function sortedEntitlements(entitlements: Entitlement[] | null | undefined): Entitlement[] {
  return [...normaliseEntitlements(entitlements)].sort();
}
