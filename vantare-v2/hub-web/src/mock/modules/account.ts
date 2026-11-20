import demoIdentity from "../../../fixtures/demo-identity.json";
import type { AccountView } from "../../contract/generated/account";
import {
  accountLimits,
  accountMethods,
} from "../../contract/generated/account";
import corpus from "../../contract/generated/corpus/account.json";
import { isAccount } from "../../contract/modules/account";
import { oneOf, record } from "../../contract/validation-common";
import type { MockContext, MockHandler } from "../context";
import {
  accountMessages,
  applyPolicy,
  coreAccess,
  initialPolicy,
  liveAccountScenes,
  type Policy,
  renew,
} from "./account-license";
import { accountScene } from "./account-scenes";

const DAY_MS = 86_400_000; // reset cooldown: "una vez cada 24 h" (AccountRail device help)
const BROWSER_MS = 5000; // reserve_browser (account/mod.rs:366)
const RESOLVE_MS = 1500; // simulated time for scenes that finish a flow
export function create(context: MockContext): MockHandler {
  const sample = corpus.host.find((v) => v.kind === "response");
  if (
    !sample ||
    !("result" in sample) ||
    !record(sample.result) ||
    !isAccount(sample.result.value)
  )
    throw new Error("Invalid Rust account corpus");
  let current: AccountView = structuredClone(sample.result.value);
  const gateScene =
    context.sceneName.startsWith("acceso-") ||
    context.sceneName.startsWith("email-");
  current = {
    ...current,
    gate: gateScene ? "choose" : "none",
    session:
      !gateScene && context.core.access.verified ? "signedIn" : "signedOut",
    verified: !gateScene && context.core.access.verified,
    blocked: context.core.access.blocked,
  };
  // The frozen onboarding bank shows a guest; core QA access stays independent.
  if (context.sceneName.startsWith("onboarding-")) {
    current = {
      ...current,
      gate: "none",
      session: "signedOut",
      verified: false,
      plan: { kind: "unverified" },
    };
  }
  if (context.sceneName === "onboarding-cuenta-cargando")
    current = { ...current, session: "pending", gate: "checking" };
  if (
    context.sceneName === "onboarding-cuenta-sesion" ||
    context.sceneName.startsWith("onboarding-correo-")
  )
    current = {
      ...current,
      session: "signedIn",
      verified: true,
      name: demoIdentity.name,
      plan: { kind: "verified" },
    };
  // First-run exit checks must still meet Access's existing modal boundary.
  if (
    [
      "onboarding-7",
      "onboarding-error-privacidad",
      "onboarding-privacidad-protegida",
    ].includes(context.sceneName)
  ) {
    current.gate = "choose";
  }
  if (
    context.sceneName === "cuenta-base" ||
    context.sceneName === "cuenta-cambio-sesion" ||
    context.sceneName === "cuenta-sesion" ||
    context.sceneName === "cuenta-founders"
  ) {
    current = {
      ...current,
      name: demoIdentity.name,
      session: "signedIn",
      gate: "none",
      verified: true,
      blocked: false,
      plan:
        context.sceneName === "cuenta-founders"
          ? { kind: "founders" }
          : { kind: "verified" },
      channel: "development",
      modules: current.modules.map((module) => ({
        ...module,
        status:
          module.id === "strategy" || module.id === "engineer"
            ? "soon"
            : "included",
      })) as AccountView["modules"],
    };
  }
  current = accountScene(context.sceneName, current);
  // These mail fixtures represent an authenticated account, independent of
  // the startup core snapshot used while mock modules are being constructed.
  if (context.sceneName.startsWith("privacidad-mail"))
    current = { ...current, session: "signedIn", gate: "none", blocked: false };
  if (context.sceneName.startsWith("email-")) {
    const scene = context.sceneName;
    current = {
      ...current,
      gate: "email",
      email: {
        mode:
          scene === "email-crear-contrasena" ? "signUpPassword" : "signInCode",
        stage:
          scene === "email-codigo"
            ? "code"
            : scene === "email-consentimiento"
              ? "consent"
              : scene === "email-autorizando"
                ? "authorizing"
                : "form",
        restarted: scene === "email-reiniciado",
        retryAfterSeconds: 0,
        message:
          scene === "email-reiniciado"
            ? "El código ha caducado o el acceso se reinició. Pide otro código para continuar."
            : scene === "email-crear-contrasena"
              ? "Esta contraseña apareció en una filtración. Elige una contraseña diferente."
              : scene === "email-ocupado"
                ? "Operación en curso"
                : scene === "email-autorizando"
                  ? "Esperando la confirmación de Clerk. Puedes volver para cancelar."
                  : "Ejemplo visual local. Sin conexión con Clerk.",
      },
    };
  }
  let policy: Policy = initialPolicy(context.sceneName, current, context.core);
  if (
    context.sceneName.startsWith("cuenta-") &&
    liveAccountScenes.includes(context.sceneName)
  ) {
    current = applyPolicy(
      {
        ...current,
        name: demoIdentity.name,
        session: "signedIn",
        gate: "none",
        channel: "development",
        error: null,
        email: null,
      },
      policy,
    );
    context.core.access = coreAccess(context.core, policy);
  }
  const completes = context.sceneName === "cuenta-compra-completada";
  const quick = completes || context.sceneName === "cuenta-compra-expira";
  let timers: Array<ReturnType<typeof setTimeout>> = [];
  let lastReset: number | undefined;
  let lastPortal: number | undefined;
  const publish = () =>
    context.emit?.({
      kind: "event",
      event: { topic: "account", value: structuredClone(current) },
    });
  // The host derives plan/modules/access from one policy (account/mod.rs:104).
  const setPolicy = (next: Policy) => {
    policy = next;
    current = applyPolicy(current, policy);
    context.core.access = coreAccess(context.core, policy);
    context.emit?.({
      kind: "event",
      event: { topic: "core", value: structuredClone(context.core) },
    });
  };
  const stopTimers = () => {
    for (const timer of timers) clearTimeout(timer);
    timers = [];
  };
  const later = (ms: number, run: () => void) =>
    timers.push(setTimeout(run, ms));
  // After sign-in the host renews the license on its own (reducer next_command).
  const signIn = (name: string) => {
    const renewed = renew(policy);
    setPolicy(renewed.policy);
    current = {
      ...current,
      gate: "none",
      session: "signedIn",
      email: null,
      name,
      error: null,
      notice: renewed.notice,
      copyLink: { available: false, copied: false },
    };
  };
  let waiting: number | undefined;
  const fail = (
    id: number,
    kind: "busy" | "accountInvalid" | "coreUnavailable" | "denied",
  ) => ({ kind: "failure" as const, id, error: { kind } });
  let initializedTestingSession = false;
  return (value) => {
    // Testing fixtures finish configuring the shared core after handlers are created.
    if (
      !initializedTestingSession &&
      context.sceneName.startsWith("testing-")
    ) {
      initializedTestingSession = true;
      current = {
        ...current,
        session: context.core.access.verified ? "signedIn" : "signedOut",
        verified: context.core.access.verified,
        blocked: context.core.access.blocked,
      };
      policy = initialPolicy(context.sceneName, current, context.core);
    }
    if (value.kind === "subscribe" && value.topic === "account") {
      return {
        kind: "event",
        event: { topic: "account", value: structuredClone(current) },
      };
    }
    if (value.kind !== "request") return undefined;
    const { id, request } = value;
    const method = request.method;
    if (!oneOf(method, accountMethods)) return undefined;
    if (
      request.method === "account.get" &&
      context.sceneName === "onboarding-cuenta-error"
    )
      return fail(id, "coreUnavailable");
    if (
      request.method !== "account.get" &&
      context.sceneName === "acceso-ocupado"
    )
      return fail(id, "busy");
    if (
      request.method !== "account.get" &&
      context.sceneName === "acceso-sin-servicios"
    )
      return fail(id, "coreUnavailable");
    const cancel =
      request.method === "account.cancel" ||
      (request.method === "account.email" &&
        request.action.action === "cancel");
    if (cancel && waiting !== undefined) {
      context.emit?.(fail(waiting, "denied"));
      waiting = undefined;
      current = { ...current, working: false };
    }
    if (
      context.sceneName === "email-espera" &&
      request.method === "account.email" &&
      request.action.action === "begin"
    ) {
      waiting = id;
      current = { ...current, working: true };
      context.emit?.({
        kind: "event",
        event: { topic: "account", value: structuredClone(current) },
      });
      return null;
    }
    switch (request.method) {
      case "account.begin":
        stopTimers();
        if (context.sceneName === "acceso-navegador-completa")
          later(RESOLVE_MS, () => {
            signIn(demoIdentity.name);
            publish();
          });
        current = {
          ...current,
          gate: "waitingBrowser",
          session: "pending",
          email: null,
          copyLink: { available: true, copied: false },
        };
        break;
      case "account.cancel":
        stopTimers();
        current = {
          ...current,
          gate: "choose",
          session: "signedOut",
          email: null,
          copyLink: { available: false, copied: false },
        };
        break;
      case "account.copyLink":
        if (!current.copyLink.available) return fail(id, "denied");
        current = { ...current, copyLink: { available: true, copied: true } };
        break;
      case "account.retry":
        current = {
          ...current,
          error: null,
          gate: current.gate === "logoutFailed" ? "none" : "choose",
        };
        break;
      case "account.choose":
        current = { ...current, gate: "choose" };
        break;
      case "account.back":
        if (
          (current.session !== "signedIn" &&
            current.session !== "needsSignIn") ||
          (current.gate !== "choose" &&
            !(current.gate === "logoutFailed" && current.canReturnAfterLogout))
        )
          return fail(id, "denied");
        current = { ...current, gate: "none", email: null };
        break;
      case "account.logout":
        // SignedOut maps to Access::default() (navigation.rs:21); the host
        // clears profile and purchase wait on logout (account/mod.rs:296).
        stopTimers();
        setPolicy({ ...policy, state: "none" });
        current = {
          ...current,
          gate: "choose",
          session: "signedOut",
          name: "",
          photo: null,
          email: null,
          error: null,
          sessionNotice: false,
          deviceLimit: false,
          purchase: { waiting: false, message: null },
          notice: accountMessages.loggedOut,
        };
        break;
      case "account.check": {
        // Operation::Check only runs with a session (dispatch.rs:121).
        if (current.session !== "signedIn") break;
        const renewed = renew(policy);
        setPolicy(renewed.policy);
        current = {
          ...current,
          notice: renewed.notice,
          deviceLimit:
            renewed.policy.state === "active" ? false : current.deviceLimit,
        };
        break;
      }
      case "account.photoRefresh":
        if (current.session !== "signedIn") return fail(id, "denied");
        current = { ...current, name: current.name || demoIdentity.name };
        break;
      case "account.portal": {
        if (current.session !== "signedIn") return fail(id, "denied");
        const at = Date.now();
        if (lastPortal !== undefined && at - lastPortal < BROWSER_MS)
          return fail(id, "busy");
        lastPortal = at;
        break;
      }
      case "account.deviceReset": {
        if (current.session !== "signedIn") return fail(id, "denied");
        const at = Date.now();
        if (lastReset !== undefined && at - lastReset < DAY_MS) {
          current = {
            ...current,
            deviceLimit: true,
            notice: accountMessages.deviceLimit,
          };
          break;
        }
        lastReset = at;
        // revoke_local leaves NoCredential until the next renewal (app.rs:215).
        setPolicy({ ...policy, state: "none" });
        current = {
          ...current,
          deviceLimit: false,
          notice: accountMessages.deviceFreed,
        };
        break;
      }
      case "account.email": {
        const action = request.action;
        if (action.action === "open") {
          current = {
            ...current,
            gate: "email",
            email: {
              mode: action.mode,
              stage: "form",
              restarted: false,
              retryAfterSeconds: 0,
              message: "",
            },
          };
          break;
        }
        if (action.action === "cancel") {
          current = { ...current, gate: "choose", email: null };
          break;
        }
        if (!current.email) return fail(id, "accountInvalid");
        const email = current.email;
        if (
          action.action === "begin" &&
          email.stage === "form" &&
          action.mode === email.mode
        ) {
          current = {
            ...current,
            email: {
              ...email,
              stage: action.mode.endsWith("Password") ? "consent" : "code",
            },
          };
        } else if (action.action === "verify" && email.stage === "code") {
          current = {
            ...current,
            email: {
              ...email,
              stage: email.mode === "recovery" ? "newPassword" : "consent",
            },
          };
        } else if (action.action === "reset" && email.stage === "newPassword") {
          current = { ...current, email: { ...email, stage: "consent" } };
        } else if (action.action === "finish" && email.stage === "consent") {
          if (context.sceneName === "acceso-correo-verificado") {
            signIn("Piloto QA");
            break;
          }
          current =
            context.sceneName === "acceso-correo-completo"
              ? {
                  ...current,
                  gate: "none",
                  session: "signedIn",
                  email: null,
                  name: "Piloto QA",
                  error: null,
                }
              : { ...current, email: { ...email, stage: "authorizing" } };
        } else if (action.action !== "resend" || email.stage !== "code") {
          return fail(id, "accountInvalid");
        }
        break;
      }
      case "account.purchase":
        if (current.session !== "signedIn") return fail(id, "denied");
        if (current.purchase.waiting) return fail(id, "busy");
        stopTimers();
        // The host waits up to purchaseWaitSeconds, then reports the expiry
        // (observe_policy, account/mod.rs:343). Scenes shorten the wait.
        later(
          quick ? RESOLVE_MS : accountLimits.purchaseWaitSeconds * 1000,
          () => {
            if (completes)
              setPolicy({
                ...policy,
                state: "active",
                grant: {
                  ...policy.grant,
                  founders: request.product === "founders",
                },
              });
            current = {
              ...current,
              purchase: {
                waiting: false,
                message: completes
                  ? accountMessages.renewed
                  : accountMessages.purchaseExpired,
              },
            };
            publish();
          },
        );
        current = {
          ...current,
          purchase: {
            waiting: true,
            message:
              "Compra abierta. Los derechos se comprobarán automáticamente.",
          },
        };
        break;
      case "account.purchaseStop":
        stopTimers();
        current = {
          ...current,
          purchase: {
            waiting: false,
            message: "Espera detenida. Puedes comprobar el acceso manualmente.",
          },
        };
        break;
    }
    // The real host publishes changed AccountView snapshots (tick.rs:29).
    // A read-only get must not fabricate a new account publication.
    if (request.method !== "account.get")
      context.emit?.({
        kind: "event",
        event: { topic: "account", value: structuredClone(current) },
      });
    return {
      kind: "response",
      id,
      result: { method, value: structuredClone(current) },
    };
  };
}
