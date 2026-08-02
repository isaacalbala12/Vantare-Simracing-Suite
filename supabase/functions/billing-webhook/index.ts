import { handleCorsPreflight } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  getWebhookSecret,
  readStandardWebhookHeaders,
  type StandardWebhookHeaders,
  validateWebhookHeaderPresence,
  verifyStandardWebhook,
  WEBHOOK_HEADER_ID,
  WEBHOOK_HEADER_SIGNATURE,
  WEBHOOK_HEADER_TIMESTAMP,
  WebhookVerificationError,
} from "../_shared/webhook-verify.ts";
import { parsePolarWebhookEvent, processPolarWebhookEvent } from "./process.ts";
import {
  computeWebhookPayloadHash,
  sanitizeWebhookErrorCode,
} from "./inbox.ts";
import {
  type BillingSeverity,
  type BillingSignalCode,
  type BillingSignalSink,
  consoleBillingSignalSink,
  emitBillingSignal,
} from "./observability.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export {
  WEBHOOK_HEADER_ID,
  WEBHOOK_HEADER_SIGNATURE,
  WEBHOOK_HEADER_TIMESTAMP,
};

// Polar webhooks are small JSON documents. This cap bounds unauthenticated
// allocation while preserving the exact UTF-8 body used for signature checks.
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

export type RawBodyResult =
  | { ok: true; rawBody: string }
  | { ok: false; code: "body_too_large" | "invalid_encoding" };

export async function readBoundedRawBody(
  req: Request,
  maxBytes = MAX_WEBHOOK_BODY_BYTES,
): Promise<RawBodyResult> {
  const declaredHeader = req.headers.get("content-length");
  const declared = declaredHeader === null ? null : Number(declaredHeader);
  if (declared !== null && Number.isFinite(declared) && declared > maxBytes) {
    try {
      await req.body?.cancel("body_too_large");
    } catch {
      // The stable 413 is more important than an already-failed cancellation.
    }
    return { ok: false, code: "body_too_large" };
  }

  const reader = req.body?.getReader();
  if (!reader) return { ok: true, rawBody: "" };

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel("body_too_large");
        } catch {
          // Keep the externally observable response deterministic.
        }
        return { ok: false, code: "body_too_large" };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      ok: true,
      rawBody: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return { ok: false, code: "invalid_encoding" };
  }
}

export type WebhookDeps = {
  readRawBody?: (req: Request, maxBytes: number) => Promise<RawBodyResult>;
  getSecret?: () => string | null;
  verifyWebhook?: (
    rawBody: string,
    headers: StandardWebhookHeaders,
    secret: string,
  ) => Promise<void>;
  getSupabase?: () => SupabaseClient;
  processEvent?: typeof processPolarWebhookEvent;
  now?: () => Date;
  signalSink?: BillingSignalSink;
};

function setRetryAfterFromTimestamp(
  response: Response,
  timestamp: string,
  now: Date,
): Response {
  const retryAt = Date.parse(timestamp);
  if (Number.isFinite(retryAt)) {
    const seconds = Math.max(1, Math.ceil((retryAt - now.getTime()) / 1000));
    response.headers.set("Retry-After", String(seconds));
  }
  return response;
}

export function getWebhookHeaders(req: Request): {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
} {
  const headers = readStandardWebhookHeaders(req);
  return {
    id: headers.id || null,
    timestamp: headers.timestamp || null,
    signature: headers.signature || null,
  };
}

export function validateWebhookHeaders(req: Request): Response | null {
  const headers = readStandardWebhookHeaders(req);
  const missing = validateWebhookHeaderPresence(headers);
  if (missing.length > 0) {
    return errorResponse(
      "missing_webhook_headers",
      `Missing required webhook headers: ${missing.join(", ")}`,
      400,
    );
  }
  return null;
}

export async function handleWebhookRequest(
  req: Request,
  deps: WebhookDeps = {},
): Promise<Response> {
  const signalSink = deps.signalSink ?? consoleBillingSignalSink;
  const observe = (
    code: BillingSignalCode,
    severity: BillingSeverity,
    fields: {
      providerEventId?: string | null;
      eventType?: string | null;
      reasonCode?: string | null;
    } = {},
  ) =>
    emitBillingSignal(signalSink, {
      code,
      severity,
      environment: Deno.env.get("POLAR_ENVIRONMENT"),
      ...fields,
    });
  const cors = handleCorsPreflight(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("method_not_allowed", "Only POST is supported", 405);
  }

  const getSecret = deps.getSecret ?? getWebhookSecret;
  const secret = getSecret();
  if (!secret) {
    await observe("endpoint_disabled", "critical");
    return errorResponse(
      "webhook_not_configured",
      "POLAR_WEBHOOK_SECRET is not configured",
      503,
    );
  }

  const headerError = validateWebhookHeaders(req);
  if (headerError) return headerError;

  const readRawBody = deps.readRawBody ?? readBoundedRawBody;
  const bodyResult = await readRawBody(req, MAX_WEBHOOK_BODY_BYTES);
  if (!bodyResult.ok) {
    if (bodyResult.code === "body_too_large") {
      return errorResponse(
        "webhook_body_too_large",
        "Webhook body exceeds the 1 MiB limit",
        413,
      );
    }
    return errorResponse(
      "invalid_webhook_encoding",
      "Webhook body must be valid UTF-8",
      400,
    );
  }
  const rawBody = bodyResult.rawBody;
  if (!rawBody) {
    return errorResponse("empty_body", "Webhook body is required", 400);
  }

  const headers = readStandardWebhookHeaders(req);
  const verifyWebhook = deps.verifyWebhook ?? verifyStandardWebhook;

  try {
    await verifyWebhook(rawBody, headers, secret);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      await observe("signature_invalid", "warning", {
        providerEventId: headers.id,
      });
      return errorResponse("invalid_webhook_signature", error.message, 403);
    }
    throw error;
  }

  const event = parsePolarWebhookEvent(rawBody);
  if (!event) {
    return errorResponse(
      "invalid_webhook_payload",
      "Webhook body must be valid JSON with a type field",
      400,
    );
  }

  const getSupabase = deps.getSupabase ?? getSupabaseAdmin;
  const processEvent = deps.processEvent ?? processPolarWebhookEvent;

  let supabase: SupabaseClient;
  try {
    supabase = getSupabase();
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Supabase unavailable";
    return errorResponse("supabase_not_configured", message, 503);
  }

  try {
    const result = await processEvent(event, headers.id, {
      supabase,
      payloadHash: await computeWebhookPayloadHash(rawBody),
    });
    if (result.status === "duplicate") {
      await observe("webhook_duplicate", "info", {
        providerEventId: headers.id,
        eventType: event.type,
      });
    }
    if (result.status === "quarantined") {
      await observe("webhook_quarantined", "critical", {
        providerEventId: headers.id,
        eventType: event.type,
        reasonCode: result.reason,
      });
    }
    if (result.status === "deferred" && result.reason === "retry_scheduled") {
      await observe("webhook_retry_scheduled", "warning", {
        providerEventId: headers.id,
        eventType: event.type,
      });
      return setRetryAfterFromTimestamp(
        errorResponse(
          "webhook_retry_scheduled",
          "The verified event is stored but no local scheduler is configured",
          503,
          {
            event_type: event.type,
            next_attempt_at: result.nextAttemptAt,
          },
        ),
        result.nextAttemptAt,
        deps.now?.() ?? new Date(),
      );
    }
    if (result.status === "deferred" && result.reason === "processing") {
      await observe("webhook_processing_busy", "warning", {
        providerEventId: headers.id,
        eventType: event.type,
      });
      return setRetryAfterFromTimestamp(
        errorResponse(
          "webhook_processing_busy",
          "The verified event is being processed and must remain retryable",
          503,
          {
            event_type: event.type,
            lease_expires_at: result.leaseExpiresAt,
          },
        ),
        result.leaseExpiresAt,
        deps.now?.() ?? new Date(),
      );
    }
    return jsonResponse(
      {
        ok: true,
        event_id: headers.id,
        event_type: event.type,
        ...result,
      },
      202,
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Webhook processing failed";
    if (message.includes("POLAR_PRODUCT_MAP")) {
      await observe("mapping_invalid", "critical", {
        providerEventId: headers.id,
        eventType: event.type,
        reasonCode: "mapping_not_configured",
      });
      return errorResponse("mapping_not_configured", message, 503);
    }
    await observe("webhook_processing_failed", "critical", {
      providerEventId: headers.id,
      eventType: event.type,
      reasonCode: sanitizeWebhookErrorCode(error),
    });
    return errorResponse(
      "webhook_processing_failed",
      "The verified event is stored and will be retried safely",
      500,
      {
        event_type: event.type,
      },
    );
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleWebhookRequest(req));
}
