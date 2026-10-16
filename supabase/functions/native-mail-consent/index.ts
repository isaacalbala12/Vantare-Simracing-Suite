import {
  clerkGet,
  clerkUser,
  type NativeAuthDeps,
  nativeBearer,
  NativeError,
  resolveNativeAccount,
  verifyNativeOAuth,
} from "../_shared/native-auth.ts";
import { type MailRpc, mailRpc } from "../_shared/mail-erasure.ts";
import { readJsonObject } from "../_shared/request.ts";
import { locales } from "../native-admin/mail.ts";
export type ConsentDeps = NativeAuthDeps & {
  resolve?: typeof resolveNativeAccount;
  rpc?: MailRpc;
};
export async function handleNativeMailConsent(
  request: Request,
  deps: ConsentDeps = {},
): Promise<Response> {
  const reply = (status: number, value: Record<string, unknown>) =>
    Response.json({ version: 1, ...value }, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  try {
    if (request.method !== "POST") {
      throw new NativeError(405, "method_not_allowed");
    }
    const token = nativeBearer(request);
    if (
      request.headers.get("Content-Type")?.split(";")[0].trim()
        .toLowerCase() !== "application/json"
    ) throw new NativeError(400, "invalid_request");
    const parsed = await readJsonObject(request, 1024);
    if (!parsed.ok) {
      throw new NativeError(
        parsed.code === "body_too_large" ? 413 : 400,
        "invalid_request",
      );
    }
    const body = parsed.value;
    const fields = body.action === "get"
      ? ["version", "action"]
      : ["version", "action", "consent", "locale", "source"];
    if (
      body.version !== 1 || !["get", "set"].includes(String(body.action)) ||
      Object.keys(body).some((k) => !fields.includes(k)) ||
      (body.action === "set" &&
        (typeof body.consent !== "boolean" ||
          !locales.includes(body.locale as typeof locales[number]) ||
          !["onboarding", "settings"].includes(String(body.source))))
    ) throw new NativeError(400, "invalid_request");
    const identity = await verifyNativeOAuth(token, deps);
    const raw = await clerkGet(
      `users/${encodeURIComponent(identity.subject)}`,
      deps,
    );
    const user = clerkUser(raw);
    if (user.id !== identity.subject) {
      throw new NativeError(503, "bridge_unavailable");
    }
    if (user.banned || user.locked) throw new NativeError(403, "forbidden");
    const entries = (raw as {
      email_addresses: Array<
        {
          id: string;
          email_address: string;
          verification?: { status?: string };
        }
      >;
    }).email_addresses;
    const primary = entries.find((e) => e.id === user.primary_email_address_id);
    if (!primary || primary.verification?.status !== "verified") {
      throw new NativeError(403, "verified_email_required");
    }
    const email = primary.email_address.trim().toLowerCase();
    if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new NativeError(503, "bridge_unavailable");
    }
    const account = await (deps.resolve ?? resolveNativeAccount)(
      identity.issuer,
      identity.subject,
    );
    const result = await (deps.rpc ?? mailRpc)("mail_consent_execute", {
      p_account: account,
      p_email: email,
      p_action: body.action,
      ...(body.action === "set"
        ? {
          p_consent: body.consent,
          p_locale: body.locale,
          p_source: body.source,
        }
        : {}),
    }) as Record<string, unknown>;
    if (result.rate_limited === true) {
      throw new NativeError(429, "rate_limited");
    }
    if (
      typeof result.consent !== "boolean" ||
      !Number.isSafeInteger(result.revision) ||
      (result.locale !== null &&
        !locales.includes(result.locale as typeof locales[number]))
    ) throw new NativeError(503, "bridge_unavailable");
    return reply(200, {
      ok: true,
      consent: result.consent,
      locale: result.locale,
      revision: result.revision,
    });
  } catch (error) {
    let failure = error instanceof NativeError
      ? error
      : new NativeError(503, "bridge_unavailable");
    if (error && typeof error === "object" && "message" in error) {
      if (error.message === "mail_erasure_pending") {
        failure = new NativeError(409, "mail_erasure_pending");
      }
      if (error.message === "account_deleted") {
        failure = new NativeError(401, "unauthorized");
      }
      if (error.message === "mail_consent_forbidden") {
        failure = new NativeError(403, "forbidden");
      }
    }
    return reply(failure.status, { ok: false, error: failure.code });
  }
}
if (import.meta.main) Deno.serve((request) => handleNativeMailConsent(request));
