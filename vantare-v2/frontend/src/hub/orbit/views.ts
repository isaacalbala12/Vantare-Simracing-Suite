import type { AccessContext, SectionId } from "../../lib/access-policy";
import { canSeeSection } from "../../lib/access-policy";
import { PLAN_LABELS } from "../../lib/plan";
import type { IconName } from "../../ui/orbit/Icon";
import type { Section } from "../navigation";

/** Ids de vista de Orbit (`12-contratos-componentes.md`). */
export type ViewId =
  | "inicio"
  | "studio"
  | "launcher"
  | "carreras"
  | "estrategia"
  | "ingeniero"
  | "telemetria"
  | "roadmap"
  | "ajustes"
  | "testing";

export type SimStatus = "connected" | "searching" | "disconnected";
export type UpdateState = "none" | "available" | "downloading" | "ready";
export type SaveState = "saved" | "dirty";
export type OverlayState = "stopped" | "running";

/** Traducción entre los ids de Orbit y las `Section` reales del hub. */
const VIEW_TO_SECTION: Record<ViewId, Section> = {
  inicio: "dashboard",
  studio: "profiles",
  launcher: "launcher",
  carreras: "calendar",
  estrategia: "strategy",
  ingeniero: "engineer",
  telemetria: "telemetry",
  roadmap: "roadmap",
  ajustes: "setup",
  testing: "testing-center",
};

const SECTION_TO_VIEW = Object.fromEntries(
  Object.entries(VIEW_TO_SECTION).map(([view, section]) => [section, view as ViewId]),
) as Record<Section, ViewId>;

export const viewToSection = (view: ViewId): Section => VIEW_TO_SECTION[view];
export const sectionToView = (section: Section): ViewId => SECTION_TO_VIEW[section] ?? "inicio";

export function isViewId(value: string): value is ViewId {
  return value in VIEW_TO_SECTION;
}

/** Gate de acceso real del hub por vista. `testing` depende del canal, no del plan. */
const VIEW_TO_ACCESS_SECTION: Record<Exclude<ViewId, "testing">, SectionId> = {
  inicio: "dashboard",
  studio: "overlays",
  launcher: "launcher",
  carreras: "calendar",
  estrategia: "strategy",
  ingeniero: "engineer",
  telemetria: "telemetry",
  roadmap: "roadmap",
  ajustes: "settings",
};

/** Plan mínimo que desbloquea cada vista (`13-modelo-y-algoritmos.md § 13.1`). */
export const REQUIRED_PLAN: Partial<Record<ViewId, string>> = {
  studio: PLAN_LABELS.paid_overlays,
  estrategia: PLAN_LABELS.paid_overlays,
  telemetria: PLAN_LABELS.paid_overlays,
  ingeniero: PLAN_LABELS.paid_engineer,
};

export function canSeeView(access: AccessContext, view: ViewId): boolean {
  if (view === "testing") return true; // el canal decide si el botón existe
  return canSeeSection(access, VIEW_TO_ACCESS_SECTION[view]);
}

export function planLabelOf(access: AccessContext): string {
  return PLAN_LABELS[access.planLabel];
}

/** Orden fijo del rail (`03-shell-y-layout.md § 3.2`). */
export const RAIL_ORDER: { id: ViewId; icon: IconName }[] = [
  // Inicio lleva la marca de Vantare, no una casita (briefing rail).
  { id: "inicio", icon: "i-vantare" },
  { id: "studio", icon: "i-studio" },
  { id: "launcher", icon: "i-launcher" },
  { id: "carreras", icon: "i-carreras" },
  { id: "estrategia", icon: "i-estrategia" },
  { id: "ingeniero", icon: "i-ingeniero" },
  { id: "telemetria", icon: "i-telemetria" },
  { id: "roadmap", icon: "i-roadmap" },
  { id: "testing", icon: "i-flask" },
];

/** Vistas sin panel contextual propio (`03-shell-y-layout.md § 3.3`). */
export const VIEWS_WITHOUT_CONTEXT: ViewId[] = ["inicio", "ingeniero", "testing"];

/** Secciones de Ajustes (`06-pantallas.md § Ajustes`, briefing 11). */
export const SETTINGS_SECTIONS = [
  "account",
  "application",
  "updates",
  "hotkeys",
  "diagnostics",
  "schedule",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function isSettingsSection(value: string | null | undefined): value is SettingsSection {
  return Boolean(value) && (SETTINGS_SECTIONS as readonly string[]).includes(value as string);
}
