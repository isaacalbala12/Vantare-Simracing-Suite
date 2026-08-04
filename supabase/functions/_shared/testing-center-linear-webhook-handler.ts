import {
  LinearWebhookError,
  TESTING_CENTER_LINEAR_WEBHOOK_MAX_BODY_BYTES,
  type VerifiedLinearWebhook,
  verifyTestingCenterLinearWebhook,
} from "./testing-center-linear-webhook.ts";

export interface TestingCenterLinearWebhookStore {
  reconcile(event: VerifiedLinearWebhook): Promise<{
    deliveryStatus: string;
    currentObservedState: string;
  }>;
}

export type TestingCenterLinearWebhookDeps = {
  secret: string;
  store: TestingCenterLinearWebhookStore;
  now?: Date;
};

function json(
  code: string,
  status: number,
  extra: Record<string, unknown> = {},
) {
  return Response.json({ code, ...extra }, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function readRawBody(request: Request): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > TESTING_CENTER_LINEAR_WEBHOOK_MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function handleTestingCenterLinearWebhookRequest(
  request: Request,
  deps: TestingCenterLinearWebhookDeps,
): Promise<Response> {
  if (request.method !== "POST") return json("method_not_allowed", 405);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > TESTING_CENTER_LINEAR_WEBHOOK_MAX_BODY_BYTES
  ) return json("linear_webhook_body_invalid", 413);
  const rawBody = await readRawBody(request);
  if (rawBody === null) return json("linear_webhook_body_invalid", 413);
  let event: VerifiedLinearWebhook;
  try {
    event = await verifyTestingCenterLinearWebhook(
      rawBody,
      {
        deliveryId: request.headers.get("linear-delivery") ?? "",
        eventName: request.headers.get("linear-event") ?? "",
        signature: request.headers.get("linear-signature") ?? "",
        timestamp: request.headers.get("linear-timestamp") ?? "",
      },
      deps.secret,
      deps.now,
    );
  } catch (error) {
    const code = error instanceof LinearWebhookError
      ? error.code
      : "linear_webhook_payload_invalid";
    const unauthorized = code === "linear_webhook_signature_invalid" ||
      code === "linear_webhook_timestamp_invalid";
    return json(code, unauthorized ? 401 : 400);
  }
  try {
    const result = await deps.store.reconcile(event);
    return json("ok", 200, result);
  } catch {
    return json("linear_webhook_reconciliation_unavailable", 503);
  }
}
