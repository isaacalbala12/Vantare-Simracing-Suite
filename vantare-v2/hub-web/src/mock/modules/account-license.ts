import type { AccountView } from "../../contract/generated/account";
import type { CoreStatus } from "../../contract/generated/contract";

/**
 * Simulated rights policy behind the account mock. It mirrors the states the
 * real host distinguishes in native/ipc/src/control.rs (`AccessState`) and
 * native/hub-host/src/account/navigation.rs (`Access::from_policy`): only
 * Active/Grace permit access, NoCredential is "unverified" and every other
 * state is "blocked". Nothing here contacts a service.
 */
export type PolicyState =
  | "none"
  | "active"
  | "unavailable"
  | "expired"
  | "recovery"
  | "clockBehind"
  | "revoked"
  | "updateRequired";
export interface Grant {
  tester: boolean;
  calendar: boolean;
  founders: boolean;
}
export interface Policy {
  state: PolicyState;
  /** What a successful renewal grants (the real source is the signed credential). */
  grant: Grant;
  /** False simulates a renewal that cannot reach a verified credential. */
  renews: boolean;
}

// AccessState::message (ipc/src/control.rs:141) and policy_message (services/src/outcome.rs:21).
const blockedText: Record<
  Exclude<PolicyState, "none" | "active">,
  { text: string; transient: boolean }
> = {
  unavailable: {
    text: "No se pudo verificar la política de acceso",
    transient: true,
  },
  expired: {
    text: "La credencial ha caducado; comprueba el acceso.",
    transient: true,
  },
  recovery: {
    text: "Necesitas conexión para recuperar el acceso; comprueba el acceso o inicia sesión.",
    transient: true,
  },
  clockBehind: {
    text: "El reloj está detrás de la frontera de seguridad guardada. Comprueba la fecha del equipo; puede ser necesario esperar antes de recuperar el acceso. La frontera guardada está fuera del rango de fechas.",
    transient: false,
  },
  revoked: { text: "Acceso bloqueado", transient: false },
  updateRequired: {
    text: "Actualiza la app para verificar la nueva licencia.",
    transient: false,
  },
};
export const accountMessages = {
  renewed: "Derechos verificados y guardados por el núcleo", // services/src/app.rs:158
  unverified: "No se pudo verificar la política de acceso", // AccessState::Unavailable
  deviceFreed: "Dispositivo liberado; solicite una credencial nueva", // app.rs:229
  deviceLimit: "límite de dispositivos", // services/src/error.rs:62
  loggedOut: "Sesión cerrada en este dispositivo", // app.rs:827
  purchaseExpired:
    "No se han confirmado los derechos. Usa Comprobar acceso para reintentarlo.", // account/mod.rs:343
} as const;

const blockedScenes: Record<string, PolicyState> = {
  "cuenta-bloqueada-no-disponible": "unavailable",
  "cuenta-bloqueada-caducada": "expired",
  "cuenta-bloqueada-recuperar": "recovery",
  "cuenta-bloqueada-reloj": "clockBehind",
  "cuenta-bloqueada-revocada": "revoked",
  "cuenta-bloqueada-actualizar": "updateRequired",
};
const noGrant: Grant = { tester: false, calendar: false, founders: false };
const tester: Grant = { tester: true, calendar: true, founders: false };
const pro: Grant = { tester: false, calendar: false, founders: false };
/** Account scenes that must run against a non-demo Hub so every action is live. */
export const liveAccountScenes = [
  "cuenta-tester",
  "cuenta-sin-verificar",
  "cuenta-transicion",
  "cuenta-compra-completada",
  "cuenta-compra-expira",
  "acceso-navegador-completa",
  "acceso-correo-verificado",
  ...Object.keys(blockedScenes),
];

export function initialPolicy(
  scene: string,
  view: AccountView,
  core: CoreStatus,
): Policy {
  const calendar = view.modules.some(
    (m) => m.id === "calendar" && m.status === "included",
  );
  const base: Grant = {
    tester: core.access.tester,
    calendar: calendar || core.access.calendar,
    founders: view.plan.kind === "founders",
  };
  const blocked = blockedScenes[scene];
  if (blocked) return { state: blocked, grant: pro, renews: true };
  switch (scene) {
    case "cuenta-tester":
      return { state: "active", grant: tester, renews: true };
    case "cuenta-sin-verificar":
      return { state: "none", grant: noGrant, renews: false };
    case "cuenta-transicion":
      return { state: "none", grant: tester, renews: true };
    case "cuenta-compra-completada":
    case "cuenta-compra-expira":
    case "acceso-navegador-completa":
    case "acceso-correo-verificado":
      return { state: "none", grant: pro, renews: true };
  }
  return {
    state: view.verified ? "active" : view.blocked ? "unavailable" : "none",
    grant: base,
    renews: true,
  };
}
export const permits = (policy: Policy) => policy.state === "active";

/** AccountView fields the host derives from the policy (account/mod.rs:104-146). */
export function applyPolicy(view: AccountView, policy: Policy): AccountView {
  const verified = permits(policy);
  const denied =
    policy.state === "none" || policy.state === "active"
      ? null
      : blockedText[policy.state];
  const modules = view.modules.map((module) => ({
    ...module,
    status:
      module.id === "strategy" || module.id === "engineer"
        ? "soon"
        : verified && (module.id !== "calendar" || policy.grant.calendar)
          ? "included"
          : "unverified",
  })) as AccountView["modules"];
  return {
    ...view,
    verified,
    blocked: denied !== null,
    plan: verified
      ? { kind: policy.grant.founders ? "founders" : "verified" }
      : denied
        ? { kind: "denied", text: denied.text }
        : { kind: "unverified" },
    modules,
  };
}
export function coreAccess(
  core: CoreStatus,
  policy: Policy,
): CoreStatus["access"] {
  const verified = permits(policy);
  const blocked = policy.state !== "none" && !verified;
  return verified
    ? {
        ...core.access,
        verified: true,
        blocked: false,
        tester: policy.grant.tester,
        calendar: policy.grant.calendar,
      }
    : {
        verified: false,
        blocked,
        tester: false,
        calendar: false,
        engineer: false,
        strategy: false,
        analysis: false,
      };
}
/** License renewal ("Comprobar acceso" = Operation::Check, account/mod.rs:196). */
export function renew(policy: Policy): { policy: Policy; notice: string } {
  const held = policy.state;
  const denied =
    held === "none" || held === "active" ? null : blockedText[held];
  if (denied && !denied.transient) return { policy, notice: denied.text };
  return policy.renews
    ? {
        policy: { ...policy, state: "active" },
        notice: accountMessages.renewed,
      }
    : { policy, notice: accountMessages.unverified };
}
