import { handleCorsPreflight } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  getWebhookSecret,
  readStandardWebhookHeaders,
  type StandardWebhookHeaders,
  validateWebhookHeaderPresence,
  verifyStandardWebhook,
  WebhookVerificationError,
  WEBHOOK_HEADER_ID,
  WEBHOOK_HEADER_SIGNATURE,
  WEBHOOK_HEADER_TIMESTAMP,
} from "../_shared/webhook-verify.ts";
import {
  parsePolarWebhookEvent,
  processPolarWebhookEvent,
} from "./process.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export {
  WEBHOOK_HEADER_ID,
  WEBHOOK_HEADER_SIGNATURE,
  WEBHOOK_HEADER_TIMESTAMP,
};

export type WebhookDeps = {
  readRawBody?: (req: Request) => Promise<string>;
  getSecret?: () => string | null;
  verifyWebhook?: (
    rawBody: string,
    headers: StandardWebhookHeaders,
    secret: string,
  ) => Promise<void>;
  getSupabase?: () => SupabaseClient;
  processEvent?: typeof processPolarWebhookEvent;
};

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
  const cors = handleCorsPreflight(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("method_not_allowed", "Only POST is supported", 405);
  }

  const getSecret = deps.getSecret ?? getWebhookSecret;
  const secret = getSecret();
  if (!secret) {
    return errorResponse(
      "webhook_not_configured",
      "POLAR_WEBHOOK_SECRET is not configured",
      503,
    );
  }

  const headerError = validateWebhookHeaders(req);
  if (headerError) return headerError;

  const readRawBody = deps.readRawBody ?? ((r) => r.text());
  const rawBody = await readRawBody(req);
  if (!rawBody) {
    return errorResponse("empty_body", "Webhook body is required", 400);
  }

  const headers = readStandardWebhookHeaders(req);
  const verifyWebhook = deps.verifyWebhook ?? verifyStandardWebhook;

  try {
    await verifyWebhook(rawBody, headers, secret);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
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
    const message = error instanceof Error ? error.message : "Supabase unavailable";
    return errorResponse("supabase_not_configured", message, 503);
  }

  try {
    const result = await processEvent(event, headers.id, { supabase });
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
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    if (message.includes("POLAR_PRODUCT_MAP")) {
      return errorResponse("mapping_not_configured", message, 503);
    }
    console.error("billing-webhook processing error", {
      event_id: headers.id,
      event_type: event.type,
      message,
    });
    return errorResponse("webhook_processing_failed", message, 500, {
      event_type: event.type,
    });
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleWebhookRequest(req));
}