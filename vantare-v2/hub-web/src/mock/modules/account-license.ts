import type {
  AccountView,
  LicenseStatus,
} from "../../contract/generated/account";
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
/** The signed date and the status the host derives from it (B2, account/mod.rs). */
export interface Term {
  status: LicenseStatus;
  untilMs: number | null;
}
export interface Policy {
  state: PolicyState;
  /** What a successful renewal grants (the real source is the signed credential). */
  grant: Grant;
  /** Fixed by the scene: the mock stands in for the host and its clock. */
  term: Term;
  /** False simulates a renewal that cannot reach a verified credential. */
  renews: boolean;
  /** Another device holds the license: renewals answer with `Reply::DeviceLimit` (409 device_limit). */
  limit?: boolean;
}

// AccessState::message (ipc/src/control.rs:141) and policy_message (services/src/outcome.rs:21).
// Transient/permanent split is INFERRED (not a host rule): the host only reports
// the state; whether a renewal recovers it depends on the server and the clock.
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
  deviceLimit: "límite de dispositivos", // services/src/error.rs:62 (renovación, 409 device_limit)
  resetFailed: "No se pudo completar el acceso. Inténtalo de nuevo.", // account/mod.rs failed(): rate_limit del reinicio
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
// Fixed scene clock (26-11-2026 10:00, Madrid) so captures and tests repeat.
export const SCENE_NOW_MS = Date.UTC(2026, 10, 26, 9, 0);
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const term = (status: LicenseStatus, ms: number | null): Term => ({
  status,
  untilMs: ms === null ? null : SCENE_NOW_MS + ms,
});
// Server terms: tester 14 d, nightly_tester 72 h (license-credential.ts).
const testerTerm = term("active", 14 * DAY_MS);
const noTerm = term("active", null);
const noGrant: Grant = { tester: false, calendar: false, founders: false };
const tester: Grant = { tester: true, calendar: true, founders: false };
const pro: Grant = { tester: false, calendar: false, founders: false };
/** Account scenes that must run against a non-demo Hub so every action is live. */
export const liveAccountScenes = [
  "cuenta-tester",
  "cuenta-tester-caduca",
  "cuenta-tester-gracia",
  "cuenta-tester-nightly",
  "cuenta-pro-fecha",
  "cuenta-sin-verificar",
  "cuenta-transicion",
  "cuenta-compra-completada",
  "cuenta-compra-expira",
  "cuenta-limite-dispositivos",
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
    tester: view.license?.tester ?? core.access.tester,
    calendar: calendar || core.access.calendar,
    founders: view.plan.kind === "founders",
  };
  const blocked = blockedScenes[scene];
  if (blocked)
    return { state: blocked, grant: pro, term: noTerm, renews: true };
  switch (scene) {
    case "cuenta-tester":
      return { state: "active", grant: tester, term: testerTerm, renews: true };
    case "cuenta-tester-caduca":
      // Under 24 h left and the renewal could not run (no connection).
      return {
        state: "active",
        grant: tester,
        term: term("expiring", 20 * HOUR_MS),
        renews: true,
      };
    case "cuenta-tester-gracia":
      // Past the signed date during a race: grace_until_ms.
      return {
        state: "active",
        grant: tester,
        term: term("grace", 40 * 60_000),
        renews: true,
      };
    case "cuenta-tester-nightly":
      return {
        state: "active",
        grant: tester,
        term: term("active", 72 * HOUR_MS),
        renews: true,
      };
    case "cuenta-pro-fecha":
      return {
        state: "active",
        grant: pro,
        term: term("active", 30 * DAY_MS),
        renews: true,
      };
    case "cuenta-sin-verificar":
      return { state: "none", grant: noGrant, term: noTerm, renews: false };
    case "cuenta-transicion":
      return { state: "none", grant: tester, term: testerTerm, renews: true };
    case "cuenta-limite-dispositivos":
      return {
        state: "none",
        grant: pro,
        term: noTerm,
        renews: true,
        limit: true,
      };
    case "cuenta-compra-completada":
    case "cuenta-compra-expira":
    case "acceso-navegador-completa":
    case "acceso-correo-verificado":
      return { state: "none", grant: pro, term: noTerm, renews: true };
  }
  return {
    state: view.verified ? "active" : view.blocked ? "unavailable" : "none",
    grant: base,
    term: base.tester ? testerTerm : noTerm,
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
    // Like the host: null whenever access is not verified.
    license: verified ? { tester: policy.grant.tester, ...policy.term } : null,
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
        // The real host grants these from the signed tester rights.
        ...(policy.grant.tester
          ? { engineer: true, strategy: true, analysis: true }
          : {}),
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
  if (policy.limit) return { policy, notice: accountMessages.deviceLimit };
  const denied =
    held === "none" || held === "active" ? null : blockedText[held];
  if (denied && !denied.transient) return { policy, notice: denied.text };
  return policy.renews
    ? {
        // A renewal signs a new date: the warning or the grace goes away.
        policy: {
          ...policy,
          state: "active",
          term: policy.grant.tester
            ? testerTerm
            : { ...policy.term, status: "active" },
        },
        notice: accountMessages.renewed,
      }
    : { policy, notice: accountMessages.unverified };
}
