import type { AccessView } from "../../contract/generated/contract";
import type { IconName } from "../assets/icons/Icon";
import { t } from "../i18n/es";
import type { Section } from "./UiState";

const entries: readonly {
  id: Section;
  icon: IconName;
  label: Parameters<typeof t>[0];
}[] = [
  { id: "home", icon: "v-home", label: "shell.home" },
  { id: "launcher", icon: "v-launch", label: "shell.launcher" },
  { id: "studio", icon: "v-studio", label: "shell.studio" },
  { id: "roadmap", icon: "v-roadmap", label: "shell.roadmap" },
  { id: "testing", icon: "v-testing", label: "shell.testing" },
  { id: "analysis", icon: "i-telemetria", label: "analysis.title" },
  { id: "calendar", icon: "v-calendar", label: "shell.calendar" },
  { id: "strategy", icon: "v-strategy", label: "shell.strategy" },
  { id: "engineer", icon: "v-engineer", label: "shell.engineer" },
  { id: "settings", icon: "v-sliders", label: "settings.title" },
];
// «Funciones en pruebas» (Ajustes › Privacidad): testers on any channel who
// switched the preference on, and only with the signed right of that module.
// This only decides what the Hub shows; it grants nothing.
function betaOpen(
  access: AccessView,
  right: "analysis" | "strategy",
  analisisBeta?: boolean,
) {
  return analisisBeta === true && access.tester && access[right];
}
export function visible(
  section: Section,
  access: AccessView,
  analisisBeta?: boolean,
) {
  if (section === "analysis") return betaOpen(access, "analysis", analisisBeta);
  if (section === "testing") return access.verified && !access.blocked;
  if (section === "calendar")
    return access.verified && !access.blocked && access.tester;
  return true;
}
// Strategy opens under the same rule as Analysis; otherwise «Próximamente».
export function strategyOpen(access: AccessView, analisisBeta?: boolean) {
  return betaOpen(access, "strategy", analisisBeta);
}
export function lock(
  section: Section,
  access: AccessView,
  analisisBeta?: boolean,
): string | undefined {
  if (
    section === "analysis" ||
    section === "settings" ||
    section === "home" ||
    section === "account"
  )
    return undefined;
  if (section === "strategy" && strategyOpen(access, analisisBeta))
    return undefined;
  if (section === "strategy" || section === "engineer") return t("shell.soon");
  if (access.blocked) return t("shell.blocked");
  if (!access.verified) return t("shell.locked");
  if (section === "calendar" && !access.calendar) return t("shell.soon");
  return undefined;
}
export function navigation(access: AccessView, analisisBeta?: boolean) {
  return entries
    .filter((entry) => visible(entry.id, access, analisisBeta))
    .map((entry) => ({
      ...entry,
      label: t(
        entry.id === "testing" && !access.tester
          ? "shell.reports"
          : entry.label,
      ),
      locked: lock(entry.id, access, analisisBeta),
    }));
}
export { isSection } from "./sections";
