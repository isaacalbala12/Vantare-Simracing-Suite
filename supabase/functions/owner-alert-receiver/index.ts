import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

const TYPES = new Set([
  "checkout_refund_failed",
  "checkout_verification_pending",
  "web_erasure_failed",
  "web_erasure_worker_stale",
  "checkout_review",
]);
type Alert = {
  environment: "production" | "sandbox";
  type: string;
  id: string;
  code: string;
};
type Claim = { state: "sent" } | { state: "busy" } | {
  state: "claimed";
  email_key: string;
  code: string;
};
export type AlertStore = {
  claim(alert: Alert, lease: string): Promise<Claim>;
  finish(alert: Alert, lease: string, sent: boolean): Promise<boolean>;
};
type Deps = {
  env?: (name: string) => string | undefined;
  now?: () => number;
  fetch?: typeof fetch;
  store?: AlertStore;
};
function createStore(): AlertStore {
  const admin = getSupabaseAdmin();
  const params = (a: Alert, lease: string) => ({
    p_environment: a.environment,
    p_type: a.type,
    p_id: a.id,
    p_lease: lease,
  });
  return {
    async claim(a, lease) {
      const { data, error } = await admin.rpc("billing_owner_alert_claim", {
        ...params(a, lease),
        p_code: a.code,
      });
      if (error || !data || !["sent", "busy", "claimed"].includes(data.state)) {
        throw new Error("owner_alert_store_unavailable");
      }
      return data as Claim;
    },
    async finish(a, lease, sent) {
      const { data, error } = await admin.rpc("billing_owner_alert_finish", {
        ...params(a, lease),
        p_sent: sent,
      });
      if (error) throw new Error("owner_alert_store_unavailable");
      return data === true;
    },
  };
}

// Bound the raw body before verifying its HMAC; never reserialize signed JSON.
async function bodyBytes(request: Request): Promise<Uint8Array | null> {
  if (Number(request.headers.get("content-length")) > 2048) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 2048) {
        await reader.cancel();
        return null;
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

export async function handleOwnerAlert(
  request: Request,
  deps: Deps = {},
): Promise<Response> {
  const reply = (status: number) =>
    Response.json({ ok: status === 200 }, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  if (request.method !== "POST") return reply(405);
  const env = deps.env ?? Deno.env.get;
  const secret = env("BILLING_OWNER_ALERT_SECRET") ?? "";
  if (secret.length < 32) return reply(503);
  const timestamp = request.headers.get("X-Vantare-Timestamp") ?? "";
  const signature = request.headers.get("X-Vantare-Signature") ?? "";
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs((deps.now ?? Date.now)() / 1000 - Number(timestamp)) > 300 ||
    !/^sha256=[a-f0-9]{64}$/.test(signature)
  ) return reply(401);
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
  ) {
    return reply(415);
  }
  try {
    const bytes = await bodyBytes(request);
    if (!bytes) return reply(413);
    const prefix = new TextEncoder().encode(timestamp + ".");
    const signed = new Uint8Array(prefix.length + bytes.length);
    signed.set(prefix);
    signed.set(bytes, prefix.length);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const mac = Uint8Array.from(
      signature.slice(7).match(/../g)!,
      (b) => parseInt(b, 16),
    );
    if (!await crypto.subtle.verify("HMAC", key, mac, signed)) {
      return reply(401);
    }
    let a: Alert;
    try {
      a = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      return reply(400);
    }
    if (
      !a || typeof a !== "object" ||
      Object.keys(a).sort().join(",") !== "code,environment,id,type" ||
      !["production", "sandbox"].includes(a.environment) ||
      !TYPES.has(a.type) ||
      typeof a.id !== "string" || !/^[a-f0-9]{64}$/.test(a.id) ||
      request.headers.get("X-Vantare-Alert-Id") !== a.id ||
      typeof a.code !== "string" || !/^[a-z0-9_]{1,64}$/.test(a.code)
    ) return reply(400);
    const store = deps.store ?? createStore();
    const lease = crypto.randomUUID();
    const claim = await store.claim(a, lease); // Commits before any external side effect or ACK.
    if (claim.state === "sent") return reply(200);
    if (claim.state === "busy") return reply(503);
    let accepted = false;
    try {
      const apiKey = env("BREVO_API_KEY");
      const to = env("BILLING_OWNER_ALERT_EMAIL");
      const sender = env("BREVO_MARKETING_SENDER");
      if (
        !apiKey || !to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) ||
        !sender || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)
      ) throw new Error("owner_alert_mail_not_configured");
      const response = await (deps.fetch ?? fetch)(
        "https://api.brevo.com/v3/smtp/email",
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(2500),
          headers: {
            "api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            sender: { email: sender, name: "Vantare" },
            to: [{ email: to }],
            subject: `[Vantare ${a.environment}] ${a.type}`,
            textContent:
              `Aviso operativo de Vantare\nTipo: ${a.type}\nEntorno: ${a.environment}\nCódigo: ${claim.code}\nReferencia: ${a.id}\nRevisar billing antes de actuar. No responder con datos de compradores.`,
            headers: { idempotencyKey: claim.email_key },
          }),
        },
      );
      // Brevo confirms a previously accepted idempotencyKey with this error.
      if (response.status === 201) {
        const result = await response.json();
        accepted = typeof result.messageId === "string" &&
          result.messageId.length > 0;
      } else if (response.status === 400) {
        const result = await response.json();
        accepted = result.code === "duplicate_parameter";
      } else {
        await response.body?.cancel();
      }
    } catch {
      accepted = false;
    }
    const saved = await store.finish(a, lease, accepted);
    return reply(accepted && saved ? 200 : 503);
  } catch {
    return reply(503); // Sender retains its outbox; never log request/provider bodies.
  }
}
if (import.meta.main) Deno.serve((request) => handleOwnerAlert(request));
