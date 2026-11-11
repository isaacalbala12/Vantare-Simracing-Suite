import demoIdentity from "../../../fixtures/demo-identity.json";
import type { AccountView } from "../../contract/generated/account";
import { accountMethods } from "../../contract/generated/account";
import corpus from "../../contract/generated/corpus/account.json";
import { isAccount } from "../../contract/modules/account";
import { oneOf, record } from "../../contract/validation-common";
import type { MockContext, MockHandler } from "../context";
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
  if (
    context.sceneName === "cuenta-base" ||
    context.sceneName === "cuenta-sesion"
  ) {
    current = {
      ...current,
      name: demoIdentity.name,
      session: "signedIn",
      gate: "none",
      verified: true,
      blocked: false,
      plan: { kind: "verified" },
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
  let waiting: number | undefined;
  const fail = (
    id: number,
    kind: "busy" | "accountInvalid" | "coreUnavailable" | "denied",
  ) => ({ kind: "failure" as const, id, error: { kind } });
  return (value) => {
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
        current = {
          ...current,
          gate: "waitingBrowser",
          session: "pending",
          email: null,
          copyLink: { available: true, copied: false },
        };
        break;
      case "account.cancel":
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
        current = {
          ...current,
          gate: "choose",
          session: "signedOut",
          name: "",
          photo: null,
          verified: false,
          email: null,
        };
        break;
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
          current = { ...current, email: { ...email, stage: "authorizing" } };
        } else if (action.action !== "resend" || email.stage !== "code") {
          return fail(id, "accountInvalid");
        }
        break;
      }
      case "account.purchase":
        if (current.session !== "signedIn") return fail(id, "denied");
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
        current = {
          ...current,
          purchase: {
            waiting: false,
            message: "Espera detenida. Puedes comprobar el acceso manualmente.",
          },
        };
        break;
    }
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
