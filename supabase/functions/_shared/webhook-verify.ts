export const WEBHOOK_HEADER_ID = "webhook-id";
export const WEBHOOK_HEADER_TIMESTAMP = "webhook-timestamp";
export const WEBHOOK_HEADER_SIGNATURE = "webhook-signature";

export type StandardWebhookHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

export class WebhookConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookConfigError";
  }
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

const DEFAULT_TOLERANCE_SECONDS = 300;

export function getWebhookSecret(): string | null {
  const secret = Deno.env.get("POLAR_WEBHOOK_SECRET");
  return secret?.trim() ? secret.trim() : null;
}

export function readStandardWebhookHeaders(req: Request): StandardWebhookHeaders {
  return {
    id: req.headers.get(WEBHOOK_HEADER_ID) ?? "",
    timestamp: req.headers.get(WEBHOOK_HEADER_TIMESTAMP) ?? "",
    signature: req.headers.get(WEBHOOK_HEADER_SIGNATURE) ?? "",
  };
}

export function validateWebhookHeaderPresence(
  headers: StandardWebhookHeaders,
): string[] {
  const missing: string[] = [];
  if (!headers.id) missing.push(WEBHOOK_HEADER_ID);
  if (!headers.timestamp) missing.push(WEBHOOK_HEADER_TIMESTAMP);
  if (!headers.signature) missing.push(WEBHOOK_HEADER_SIGNATURE);
  return missing;
}

/**
 * Polar passes the full secret string to Standard Webhooks by UTF-8 encoding
 * the entire value (including the `whsec_` prefix), not by base64-decoding
 * the suffix. See @polar-sh/sdk `validateEvent`.
 */
function decodeSigningSecret(secret: string): Uint8Array<ArrayBuffer> {
  const trimmed = secret.trim();
  const encoded = new TextEncoder().encode(trimmed);
  const buffer = new ArrayBuffer(encoded.length);
  const bytes = new Uint8Array(buffer);
  bytes.set(encoded);
  return bytes;
}

function parseSignatureHeader(signatureHeader: string): string[] {
  return signatureHeader
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [version, value] = part.split(",", 2);
      if (version !== "v1" || !value) return "";
      return value;
    })
    .filter(Boolean);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyStandardWebhook(
  rawBody: string,
  headers: StandardWebhookHeaders,
  secret: string,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): Promise<void> {
  const missing = validateWebhookHeaderPresence(headers);
  if (missing.length > 0) {
    throw new WebhookVerificationError(
      `Missing required webhook headers: ${missing.join(", ")}`,
    );
  }

  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp)) {
    throw new WebhookVerificationError("Invalid webhook timestamp");
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    throw new WebhookVerificationError("Webhook timestamp outside tolerance");
  }

  const keyBytes = decodeSigningSecret(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(signedContent),
  );
  const expected = btoa(
    String.fromCharCode(...new Uint8Array(signatureBuffer)),
  );

  const provided = parseSignatureHeader(headers.signature);
  const valid = provided.some((candidate) =>
    constantTimeEqual(candidate, expected)
  );

  if (!valid) {
    throw new WebhookVerificationError("Invalid webhook signature");
  }
}

/** Test helper — signs a webhook payload with Standard Webhooks v1 (HMAC). */
export async function signStandardWebhookForTest(
  rawBody: string,
  secret: string,
  id: string,
  timestamp: string,
): Promise<string> {
  const keyBytes = decodeSigningSecret(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(signedContent),
  );
  const encoded = btoa(
    String.fromCharCode(...new Uint8Array(signatureBuffer)),
  );
  return `v1,${encoded}`;
}