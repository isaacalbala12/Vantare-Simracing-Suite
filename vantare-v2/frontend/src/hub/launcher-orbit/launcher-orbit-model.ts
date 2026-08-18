import type { ChainStepStatus } from "../../ui/orbit";
import type {
  LauncherActiveChain,
  LauncherApp,
  LaunchProfile,
  LaunchPolicy,
} from "../launcher/launcher-contract";

/** Estado del catálogo por aplicación (`briefing 05 · Aplicaciones`). */
export type AppCatalogState = "catalog" | "detected" | "installed";

export type LauncherOrbitApp = {
  id: string;
  name: string;
  abbreviation: string;
  g1: string;
  g2: string;
  /** `Simulador · Steam` ya resuelto por el llamante. */
  categoryKey: string;
  methodKey: string;
  state: AppCatalogState;
  isFavorite: boolean;
};

export type LauncherOrbitStep = {
  appId: string;
  abbreviation: string;
  name: string;
  g1: string;
  g2: string;
  /** Espera declarada del paso, en segundos. */
  delay: number;
  status: ChainStepStatus;
};

/**
 * Iniciales de un perfil para su monograma: dos palabras dan sus iniciales
 * ("Creador de Contenido" da CD), una sola da sus tres primeras letras.
 */
export function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return "··";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

/** Degradado de reserva para un paso cuyo `appId` ya no está en el catálogo. */
const UNKNOWN_GRADIENT = { g1: "#4a4750", g2: "#26242b" } as const;

/**
 * Estado de una aplicación del catálogo.
 *
 * `availability` es la autoridad: `installed` gana a `found`, y sin detección
 * ejecutada todas las aplicaciones se presentan como catálogo. El campo
 * heredado `detected` solo se mira si la instantánea no trae `availability`.
 */
export function appCatalogState(app: LauncherApp): AppCatalogState {
  const availability = app.availability;
  if (availability?.installed) return "installed";
  if (availability?.found) return "detected";
  if (!availability && app.detected) return "detected";
  return "catalog";
}

export function toOrbitApp(app: LauncherApp): LauncherOrbitApp {
  return {
    id: app.id,
    name: app.displayName,
    abbreviation: app.abbreviation,
    g1: app.gradientFrom,
    g2: app.gradientTo,
    categoryKey: `launcher.category.${app.category}`,
    methodKey: `launcher.method.${app.launchMethod === "steam-uri" ? "steam" : "executable"}`,
    state: appCatalogState(app),
    isFavorite: app.isFavorite === true,
  };
}

export function detectedCount(apps: LauncherApp[]): number {
  return apps.filter((app) => appCatalogState(app) !== "catalog").length;
}

/**
 * Perfil destacado: el favorito si lo hay; si no, el primero de los del
 * usuario y, sin ellos, el primero de los de Vantare. No hay «predeterminado»
 * en el contrato real: el favorito es lo más cercano y así se rotula.
 */
export function orderProfiles(
  userProfiles: LaunchProfile[],
  vantareProfiles: LaunchProfile[],
): LaunchProfile[] {
  const all = [...userProfiles, ...vantareProfiles];
  return [...all].sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    return 0;
  });
}

/** Estado por paso desde la cadena activa real de la instantánea. */
export function stepStatus(
  chain: LauncherActiveChain | undefined,
  appId: string,
  index: number,
): ChainStepStatus {
  const step = chain?.steps?.[index];
  if (!step || step.appId !== appId) {
    const byId = chain?.steps?.find((entry) => entry.appId === appId);
    if (!byId) return "pending";
    return normalizeStepStatus(byId.status);
  }
  return normalizeStepStatus(step.status);
}

function normalizeStepStatus(status: string): ChainStepStatus {
  if (status === "ready" || status === "done") return "ready";
  if (status === "launching") return "launching";
  if (status === "failed") return "failed";
  return "pending";
}

export function chainSteps(
  profile: LaunchProfile,
  apps: LauncherApp[],
  chain?: LauncherActiveChain,
): LauncherOrbitStep[] {
  return profile.steps.map((step, index) => {
    const app = apps.find((entry) => entry.id === step.appId);
    return {
      appId: step.appId,
      abbreviation: app?.abbreviation ?? step.appId.slice(0, 3).toUpperCase(),
      name: app?.displayName ?? step.appId,
      g1: app?.gradientFrom ?? UNKNOWN_GRADIENT.g1,
      g2: app?.gradientTo ?? UNKNOWN_GRADIENT.g2,
      delay: step.delay,
      status: stepStatus(chain, step.appId, index),
    };
  });
}

export type PolicyChip = { key: string; params?: Record<string, string | number> };

/**
 * Políticas visibles del perfil (`briefing 05`): ya abierta, fallo y salida.
 * `ask` no se pinta: no es una decisión tomada, es una pregunta pendiente.
 */
export function policyChips(policy: LaunchPolicy | undefined): PolicyChip[] {
  if (!policy) return [];
  const chips: PolicyChip[] = [];
  if (policy.alreadyRunning === "reuse") chips.push({ key: "launcher.profile.policy.reuse" });
  if (policy.alreadyRunning === "restart") chips.push({ key: "launcher.profile.policy.restart" });
  if (policy.failure === "continue") {
    chips.push({ key: "launcher.profile.policy.retry", params: { n: policy.maxRetries } });
  }
  if (policy.failure === "stop") chips.push({ key: "launcher.profile.policy.stop" });
  if (policy.exit === "leave") chips.push({ key: "launcher.profile.policy.leave" });
  if (policy.exit === "close-started") {
    chips.push({ key: "launcher.profile.policy.closeStarted" });
  }
  return chips;
}

/** `ctrl+alt+l` → `["Ctrl", "Alt", "L"]`. Sin hotkey no hay teclas que pintar. */
export function hotkeyKeys(hotkey: string | undefined): string[] {
  if (!hotkey) return [];
  return hotkey
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)));
}

/** Última ejecución registrada entre todos los perfiles. */
export function lastLaunchedAt(profiles: LaunchProfile[]): Date | null {
  let latest: number | null = null;
  for (const profile of profiles) {
    if (!profile.lastLaunchedAt) continue;
    const time = new Date(profile.lastLaunchedAt).getTime();
    if (Number.isNaN(time)) continue;
    if (latest === null || time > latest) latest = time;
  }
  return latest === null ? null : new Date(latest);
}
