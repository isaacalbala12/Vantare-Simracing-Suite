import type { AccountView } from "../generated/account";
import {
  accountLimits,
  accountMethods,
  accountOptions,
} from "../generated/account";
import { exact, integer, oneOf, record } from "../validation-common";

export { accountMethods as methods };

const hasControls = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159);
  });
const text = (v: unknown, max: number = accountLimits.text): v is string =>
  typeof v === "string" &&
  Array.from(v).length <= max &&
  !hasControls(v) &&
  !v.includes("://");
const nullableText = (v: unknown) => v === null || text(v);
const bytes = (v: unknown, max: number): v is string =>
  typeof v === "string" &&
  new TextEncoder().encode(v).length <= max &&
  !v.includes("\0");
const bool = (v: unknown) => typeof v === "boolean";
function emailIntent(v: unknown): boolean {
  if (!record(v)) return false;
  switch (v.action) {
    case "open":
      return (
        exact(v, ["action", "mode"]) && oneOf(v.mode, accountOptions.modes)
      );
    case "begin":
      return (
        exact(v, ["action", "mode", "email", "password"]) &&
        oneOf(v.mode, accountOptions.modes) &&
        bytes(v.email, accountLimits.email) &&
        v.email.trim().length > 0 &&
        v.email.includes("@") &&
        !hasControls(v.email) &&
        !v.email.includes(" ") &&
        bytes(v.password, accountLimits.password) &&
        (["signInPassword", "signUpPassword"].includes(v.mode)
          ? v.password.length > 0
          : v.password.length === 0)
      );
    case "verify":
      return (
        exact(v, ["action", "code"]) &&
        typeof v.code === "string" &&
        v.code.length === accountLimits.code &&
        /^[0-9]+$/.test(v.code)
      );
    case "reset":
      return (
        exact(v, ["action", "password", "signOutOthers"]) &&
        bytes(v.password, accountLimits.password) &&
        v.password.length > 0 &&
        bool(v.signOutOthers)
      );
    case "resend":
    case "finish":
    case "cancel":
      return exact(v, ["action"]);
    default:
      return false;
  }
}
export function isAccount(v: unknown): v is AccountView {
  if (
    !record(v) ||
    !exact(v, [
      "configured",
      "gate",
      "session",
      "working",
      "name",
      "photo",
      "plan",
      "verified",
      "blocked",
      "modules",
      "email",
      "copyLink",
      "error",
      "notice",
      "sessionNotice",
      "canReturnAfterLogout",
      "deviceLimit",
      "purchase",
      "portal",
      "channel",
    ])
  )
    return false;
  if (
    ![
      v.configured,
      v.working,
      v.verified,
      v.blocked,
      v.sessionNotice,
      v.canReturnAfterLogout,
      v.deviceLimit,
      v.portal,
    ].every(bool) ||
    !oneOf(v.gate, accountOptions.gates) ||
    !oneOf(v.session, accountOptions.sessions) ||
    !text(v.name, accountLimits.name) ||
    !nullableText(v.error) ||
    !nullableText(v.notice) ||
    !text(v.channel)
  )
    return false;
  if (
    v.photo !== null &&
    (typeof v.photo !== "string" ||
      !v.photo.startsWith("data:image/jpeg;base64,/9j/") ||
      v.photo.length >
        "data:image/jpeg;base64,".length + accountLimits.photoBase64 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(
        v.photo.slice("data:image/jpeg;base64,".length),
      ))
  )
    return false;
  if (
    !record(v.plan) ||
    !(v.plan.kind === "denied"
      ? exact(v.plan, ["kind", "text"]) && text(v.plan.text)
      : exact(v.plan, ["kind"]) &&
        oneOf(v.plan.kind, ["verified", "unverified", "founders"]))
  )
    return false;
  if (
    !Array.isArray(v.modules) ||
    v.modules.length !== accountOptions.modules.length ||
    !v.modules.every(
      (m, i) =>
        record(m) &&
        exact(m, ["id", "status"]) &&
        m.id === accountOptions.modules[i] &&
        oneOf(m.status, accountOptions.statuses),
    )
  )
    return false;
  if (
    v.email !== null &&
    (!record(v.email) ||
      !exact(v.email, [
        "mode",
        "stage",
        "restarted",
        "retryAfterSeconds",
        "message",
      ]) ||
      !oneOf(v.email.mode, accountOptions.modes) ||
      !oneOf(v.email.stage, accountOptions.stages) ||
      !bool(v.email.restarted) ||
      !integer(v.email.retryAfterSeconds) ||
      v.email.retryAfterSeconds > accountLimits.retryAfterSeconds ||
      !text(v.email.message))
  )
    return false;
  return (
    record(v.copyLink) &&
    exact(v.copyLink, ["available", "copied"]) &&
    bool(v.copyLink.available) &&
    bool(v.copyLink.copied) &&
    record(v.purchase) &&
    exact(v.purchase, ["waiting", "message"]) &&
    bool(v.purchase.waiting) &&
    nullableText(v.purchase.message)
  );
}
export function isRequest(v: Record<string, unknown>): boolean {
  if (!oneOf(v.method, accountMethods)) return false;
  switch (v.method) {
    case "account.email":
      return exact(v, ["method", "action"]) && emailIntent(v.action);
    case "account.portal":
      return exact(v, ["method", "page"]) && v.page === "profile";
    case "account.purchase":
      return (
        exact(v, ["method", "product"]) &&
        oneOf(v.product, accountOptions.products)
      );
    default:
      return exact(v, ["method"]);
  }
}
export function isReply(v: Record<string, unknown>): boolean {
  return (
    oneOf(v.method, accountMethods) &&
    exact(v, ["method", "value"]) &&
    isAccount(v.value)
  );
}
export function isError(v: Record<string, unknown>): boolean {
  return v.kind === "accountInvalid" && exact(v, ["kind"]);
}
export function isEvent(v: Record<string, unknown>): boolean {
  return (
    v.topic === "account" && exact(v, ["topic", "value"]) && isAccount(v.value)
  );
}
