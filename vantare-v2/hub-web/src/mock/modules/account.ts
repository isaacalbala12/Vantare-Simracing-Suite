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
    session: context.core.access.verified ? "signedIn" : "signedOut",
    verified: context.core.access.verified,
    blocked: context.core.access.blocked,
  };
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
