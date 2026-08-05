export const TESTING_CENTER_LINEAR_WEBHOOK_MAX_BODY_BYTES = 256 * 1024;
export const TESTING_CENTER_LINEAR_WEBHOOK_TOLERANCE_MS = 60_000;

export type LinearWebhookHeaders = {
  deliveryId: string;
  eventName: string;
  signature: string;
  timestamp: string;
};

export type VerifiedLinearWebhook = {
  deliveryId: string;
  webhookId: string;
  organizationId: string;
  externalIssueId: string;
  eventName: "Issue";
  action: "create" | "update" | "remove";
  webhookTimestampMs: number;
  eventCreatedAt: string;
  linearStateId: string | null;
  payloadDigest: string;
};

export type LinearWebhookErrorCode =
  | "linear_webhook_body_invalid"
  | "linear_webhook_headers_invalid"
  | "linear_webhook_signature_invalid"
  | "linear_webhook_timestamp_invalid"
  | "linear_webhook_payload_invalid"
  | "linear_webhook_event_unsupported";

export class LinearWebhookError extends Error {
  constructor(readonly code: LinearWebhookErrorCode) {
    super(code);
    this.name = "LinearWebhookError";
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function fromHex(value: string): Uint8Array {
  return Uint8Array.from(
    value.match(/../g) ?? [],
    (part) => Number.parseInt(part, 16),
  );
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function hmacSha256(rawBody: Uint8Array, secret: string) {
  const key = await importHmacKey(secret);
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, copyBuffer(rawBody)),
  );
}

async function sha256Hex(rawBody: Uint8Array): Promise<string> {
  return toHex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", copyBuffer(rawBody)),
    ),
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

function parseStateId(
  data: Record<string, unknown>,
): string | null | undefined {
  const direct = data.stateId;
  const nested = record(data.state)?.id;
  if (direct === undefined && nested === undefined) return undefined;
  const directId = direct === undefined ? null : requiredUuid(direct);
  const nestedId = nested === undefined ? null : requiredUuid(nested);
  if (
    (direct !== undefined && directId === null) ||
    (nested !== undefined && nestedId === null) ||
    (directId !== null && nestedId !== null && directId !== nestedId)
  ) {
    throw new LinearWebhookError("linear_webhook_payload_invalid");
  }
  return directId ?? nestedId;
}

export async function verifyTestingCenterLinearWebhook(
  rawBody: Uint8Array,
  headers: LinearWebhookHeaders,
  secret: string,
  now = new Date(),
): Promise<VerifiedLinearWebhook> {
  if (
    rawBody.byteLength === 0 ||
    rawBody.byteLength > TESTING_CENTER_LINEAR_WEBHOOK_MAX_BODY_BYTES
  ) {
    throw new LinearWebhookError("linear_webhook_body_invalid");
  }
  if (
    !UUID_V4_PATTERN.test(headers.deliveryId) ||
    headers.eventName !== "Issue"
  ) {
    throw new LinearWebhookError("linear_webhook_headers_invalid");
  }
  if (
    !/^[0-9a-f]{64}$/i.test(headers.signature) ||
    secret.length < 32 || secret.length > 4096
  ) {
    throw new LinearWebhookError("linear_webhook_signature_invalid");
  }
  if (!/^\d{13}$/.test(headers.timestamp)) {
    throw new LinearWebhookError("linear_webhook_timestamp_invalid");
  }
  const headerTimestamp = Number(headers.timestamp);
  if (
    !Number.isSafeInteger(headerTimestamp) ||
    Math.abs(now.getTime() - headerTimestamp) >
      TESTING_CENTER_LINEAR_WEBHOOK_TOLERANCE_MS
  ) {
    throw new LinearWebhookError("linear_webhook_timestamp_invalid");
  }

  const expected = await hmacSha256(rawBody, secret);
  if (!constantTimeEqual(expected, fromHex(headers.signature))) {
    throw new LinearWebhookError("linear_webhook_signature_invalid");
  }

  let payloadValue: unknown;
  try {
    payloadValue = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
    );
  } catch {
    throw new LinearWebhookError("linear_webhook_payload_invalid");
  }
  const payload = record(payloadValue);
  const data = record(payload?.data);
  const action = payload?.action;
  if (
    payload?.type !== "Issue" ||
    !["create", "update", "remove"].includes(action as string)
  ) {
    throw new LinearWebhookError("linear_webhook_event_unsupported");
  }
  const webhookId = requiredUuid(payload?.webhookId);
  const organizationId = requiredUuid(payload?.organizationId);
  const externalIssueId = requiredUuid(data?.id);
  const webhookTimestamp = payload?.webhookTimestamp;
  const eventCreatedAt = payload?.createdAt;
  const parsedEventCreatedAt = typeof eventCreatedAt === "string"
    ? Date.parse(eventCreatedAt)
    : Number.NaN;
  if (
    webhookId === null || organizationId === null ||
    externalIssueId === null || data === null ||
    !Number.isSafeInteger(webhookTimestamp) ||
    webhookTimestamp !== headerTimestamp ||
    !Number.isFinite(parsedEventCreatedAt)
  ) {
    throw new LinearWebhookError("linear_webhook_payload_invalid");
  }
  const linearStateId = parseStateId(data);
  if (action === "create" && linearStateId === undefined) {
    throw new LinearWebhookError("linear_webhook_payload_invalid");
  }

  return {
    deliveryId: headers.deliveryId,
    webhookId,
    organizationId,
    externalIssueId,
    eventName: "Issue",
    action: action as VerifiedLinearWebhook["action"],
    webhookTimestampMs: webhookTimestamp as number,
    eventCreatedAt: new Date(parsedEventCreatedAt).toISOString(),
    linearStateId: linearStateId ?? null,
    payloadDigest: await sha256Hex(rawBody),
  };
}

export async function signTestingCenterLinearWebhookForTest(
  rawBody: Uint8Array,
  secret: string,
): Promise<string> {
  return toHex(await hmacSha256(rawBody, secret));
}
