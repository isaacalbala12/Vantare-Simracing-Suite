export type Section =
  | "dashboard"
  | "profiles"
  | "launcher"
  | "calendar"
  | "engineer"
  | "telemetry"
  | "setup"
  | "roadmap";

export type NavIcon =
  | "home"
  | "overlays"
  | "bolt"
  | "calendar"
  | "engineer"
  | "telemetry"
  | "settings"
  | "roadmap";

export type NavItem = {
  id: Section;
  label: string;
  icon: NavIcon;
};

export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { id: "dashboard", label: "Hub", icon: "home" },
  { id: "profiles", label: "Overlays Studio", icon: "overlays" },
  { id: "launcher", label: "Launcher", icon: "bolt" },
  { id: "calendar", label: "Carreras", icon: "calendar" },
  { id: "engineer", label: "Ingeniero", icon: "engineer" },
  { id: "telemetry", label: "Telemetría", icon: "telemetry" },
  { id: "roadmap", label: "Roadmap", icon: "roadmap" },
  { id: "setup", label: "Ajustes", icon: "settings" },
] as const;

const SECTION_IDS = new Set<string>(NAV_ITEMS.map((item) => item.id));

export function isSection(value: string): value is Section {
  return SECTION_IDS.has(value);
}
