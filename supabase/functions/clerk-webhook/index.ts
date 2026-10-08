import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  verifyStandardWebhook,
  WebhookVerificationError,
} from "../_shared/webhook-verify.ts";
import { readBoundedRawBody } from "../billing-webhook/index.ts";
import { computeWebhookPayloadHash } from "../billing-webhook/inbox.ts";

type Event = {
  type: "user.created" | "user.updated" | "user.deleted";
  subject: string;
  timestamp: string;
  verifiedEmail: string | null;
};

export function parseClerkUserEvent(value: unknown): Event | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (
    !["user.created", "user.updated", "user.deleted"].includes(
      String(event.type),
    )
  ) return null;
  if (
    !event.data || typeof event.data !== "object" || Array.isArray(event.data)
  ) return null;
  const data = event.data as Record<string, unknown>;
  if (
    typeof data.id !== "string" || !/^user_[a-zA-Z0-9_]{1,128}$/.test(data.id)
  ) return null;
  const timestamp = event.type === "user.deleted"
    ? event.timestamp
    : data.updated_at ?? data.created_at;
  if (
    typeof timestamp !== "number" || !Number.isSafeInteger(timestamp) ||
    timestamp <= 0
  ) return null;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  let verifiedEmail: string | null = null;
  if (Array.isArray(data.email_addresses)) {
    for (const address of data.email_addresses) {
      if (
        address?.id === data.primary_email_address_id &&
        address?.verification?.status === "verified" &&
        typeof address.email_address === "string" &&
        address.email_address.length <= 320
      ) {
        verifiedEmail = address.email_address;
      }
    }
  }
  return {
    type: event.type as Event["type"],
    subject: data.id,
    timestamp: date.toISOString(),
    verifiedEmail,
  };
}

export type ClerkWebhookDeps = {
  config?: { issuer: string; signingSecret: string };
  apply?: (args: Record<string, unknown>) => Promise<void>;
};

export async function handleClerkWebhook(
  req: Request,
  deps: ClerkWebhookDeps = {},
): Promise<Response> {
  if (req.method !== "POST") {
    return errorResponse("method_not_allowed", "POST required", 405);
  }
  const config = deps.config ?? {
    issuer: Deno.env.get("CLERK_ISSUER") ?? "",
    signingSecret: Deno.env.get("CLERK_WEBHOOK_SIGNING_SECRET") ?? "",
  };
  if (
    !/^https:\/\/[a-zA-Z0-9.-]+$/.test(config.issuer) ||
    !config.signingSecret.startsWith("whsec_")
  ) {
    return errorResponse(
      "identity_not_configured",
      "Identity not configured",
      503,
    );
  }
  const body = await readBoundedRawBody(req, 1024 * 1024);
  if (!body.ok) {
    return errorResponse(
      body.code,
      body.code,
      body.code === "body_too_large" ? 413 : 400,
    );
  }
  let key: Uint8Array<ArrayBuffer>;
  try {
    // Clerk/Svix decodes whsec_'s base64 suffix; Polar uses the full UTF-8
    // string. Never reuse Polar's key derivation for Clerk.
    key = Uint8Array.from(
      atob(config.signingSecret.slice(6)),
      (c) => c.charCodeAt(0),
    );
    if (key.length < 16) throw new Error("invalid_signing_key");
  } catch {
    return errorResponse(
      "identity_not_configured",
      "Identity not configured",
      503,
    );
  }
  const id = req.headers.get("svix-id") ?? "";
  try {
    await verifyStandardWebhook(body.rawBody, {
      id,
      timestamp: req.headers.get("svix-timestamp") ?? "",
      signature: req.headers.get("svix-signature") ?? "",
    }, key);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return errorResponse("invalid_signature", "Invalid signature", 401);
    }
    return errorResponse("identity_unavailable", "Identity unavailable", 503);
  }
  let value: unknown;
  try {
    value = JSON.parse(body.rawBody);
  } catch {
    return errorResponse("invalid_event", "Invalid event", 400);
  }
  const event = parseClerkUserEvent(value);
  if (!event) return errorResponse("invalid_event", "Invalid event", 400);
  const args = {
    p_event_id: id,
    p_payload_hash: await computeWebhookPayloadHash(body.rawBody),
    p_issuer: config.issuer,
    p_subject: event.subject,
    p_event_type: event.type,
    p_event_at: event.timestamp,
    p_verified_email: event.verifiedEmail,
  };
  try {
    if (deps.apply) await deps.apply(args);
    else {
      const { error } = await getSupabaseAdmin().rpc(
        "apply_clerk_user_event",
        args,
      );
      if (error) throw error;
    }
    return jsonResponse({ received: true });
  } catch {
    // Do not acknowledge until the transaction is durable. Svix retries;
    // SQL deduplicates IDs and tombstones permanently prevent resurrection.
    return errorResponse("identity_unavailable", "Retry delivery", 503);
  }
}

if (import.meta.main) Deno.serve((req) => handleClerkWebhook(req));
