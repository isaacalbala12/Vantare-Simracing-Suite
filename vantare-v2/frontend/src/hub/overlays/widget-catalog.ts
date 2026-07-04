import type { AccessContext } from "../../lib/access-policy";

// ── Types ───────────────────────────────────────────────────────────────

export type AccessTier = "free" | "pro" | "tester" | "experimental";
export type DataStatus = "ok" | "partial" | "pending";
export type EditModel = "slots" | "columns" | "mixed";

export type WidgetCatalogEntry = {
  type: string;
  name: string;
  access: AccessTier;
  dataStatus: DataStatus;
  editModel: EditModel;
  runtimeReady: boolean;
  description: string;
};

// ── Catalog ──────────────────────────────────────────────────────────────

const WIDGET_CATALOG: WidgetCatalogEntry[] = [
  {
    type: "standings",
    name: "Standings",
    access: "free",
    dataStatus: "ok",
    editModel: "columns",
    runtimeReady: true,
    description: "Live race standings with position changes",
  },
  {
    type: "delta",
    name: "Delta",
    access: "free",
    dataStatus: "ok",
    editModel: "slots",
    runtimeReady: true,
    description: "Time delta to session best",
  },
  {
    type: "pedals",
    name: "Pedals",
    access: "free",
    dataStatus: "ok",
    editModel: "slots",
    runtimeReady: true,
    description: "Throttle and brake pedal visualization",
  },
  {
    type: "relative",
    name: "Relative",
    access: "pro",
    dataStatus: "ok",
    editModel: "columns",
    runtimeReady: true,
    description: "Time gaps relative to the driver",
  },
  {
    type: "broadcast-tower",
    name: "Broadcast Tower",
    access: "pro",
    dataStatus: "partial",
    editModel: "slots",
    runtimeReady: false,
    description: "Race control broadcast tower",
  },
  {
    type: "multiclass-relative",
    name: "Multiclass Relative",
    access: "pro",
    dataStatus: "partial",
    editModel: "mixed",
    runtimeReady: false,
    description: "Multi-class relative gaps",
  },
  {
    type: "race-schedule",
    name: "Race Schedule",
    access: "pro",
    dataStatus: "partial",
    editModel: "slots",
    runtimeReady: false,
    description: "Race weekend schedule",
  },
  {
    type: "telemetry-blade",
    name: "Telemetry Blade",
    access: "pro",
    dataStatus: "ok",
    editModel: "slots",
    runtimeReady: false,
    description: "Real-time telemetry blade",
  },
  {
    type: "fuel-calculator",
    name: "Fuel Calculator",
    access: "tester",
    dataStatus: "partial",
    editModel: "slots",
    runtimeReady: false,
    description: "Fuel usage calculator",
  },
  {
    type: "track-weather",
    name: "Track Weather",
    access: "tester",
    dataStatus: "pending",
    editModel: "slots",
    runtimeReady: false,
    description: "Track weather conditions",
  },
  {
    type: "car-damage",
    name: "Car Damage Visual",
    access: "tester",
    dataStatus: "pending",
    editModel: "slots",
    runtimeReady: false,
    description: "Car damage visualization",
  },
  {
    type: "head-2-head",
    name: "Head 2 Head",
    access: "tester",
    dataStatus: "pending",
    editModel: "slots",
    runtimeReady: false,
    description: "Head to head comparison",
  },
  {
    type: "delta-trace",
    name: "Delta Trace",
    access: "experimental",
    dataStatus: "pending",
    editModel: "mixed",
    runtimeReady: false,
    description: "Delta trace visualization",
  },
  {
    type: "racing-flags",
    name: "Racing Flags",
    access: "tester",
    dataStatus: "partial",
    editModel: "slots",
    runtimeReady: false,
    description: "Racing flags indicator",
  },
];

const CATALOG_BY_TYPE = new Map(
  WIDGET_CATALOG.map((entry) => [entry.type, entry]),
);

// ── Access helpers ───────────────────────────────────────────────────────

function tierIncludes(
  entryAccess: AccessTier,
  access: AccessContext,
): boolean {
  if (access.isBlocked || access.isUnconfigured) return false;
  if (access.roles.includes("tester")) return true;

  switch (access.planLabel) {
    case "suite":
    case "paid_engineer":
    case "paid_overlays":
      return entryAccess === "free" || entryAccess === "pro";
    case "free":
      return entryAccess === "free";
    default:
      return false;
  }
}

// ── Public API ───────────────────────────────────────────────────────────

export function getWidgetCatalogEntry(
  type: string,
): WidgetCatalogEntry | undefined {
  return CATALOG_BY_TYPE.get(type);
}

export function canPreviewWidget(
  _type: string, // eslint-disable-line @typescript-eslint/no-unused-vars
  _access: AccessContext, // eslint-disable-line @typescript-eslint/no-unused-vars
): boolean {
  return true;
}

export function canApplyWidget(
  type: string,
  access: AccessContext,
): boolean {
  const entry = CATALOG_BY_TYPE.get(type);
  if (!entry) return false;
  return tierIncludes(entry.access, access);
}

export function isRuntimeReadyWidget(type: string): boolean {
  const entry = CATALOG_BY_TYPE.get(type);
  return entry?.runtimeReady ?? false;
}

export function getAllWidgetCatalogEntries(): WidgetCatalogEntry[] {
  return [...WIDGET_CATALOG];
}
