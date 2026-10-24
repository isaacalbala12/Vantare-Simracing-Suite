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

export function readStandardWebhookHeaders(
  req: Request,
): StandardWebhookHeaders {
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

/** Standard Webhooks strings are Base64 key bytes, optionally prefixed whsec_.
 * Polar endpoints predating its signing cutoff require an explicit legacy mode.
 * Raw byte callers (including Clerk) already own their key derivation.
 */
export function decodeWebhookSigningSecret(
  secret: string,
  format = "standard",
): Uint8Array<ArrayBuffer> {
  const trimmed = secret.trim();
  if (format === "legacy_utf8") {
    if (!trimmed) throw new WebhookConfigError("Empty webhook signing key");
    return new TextEncoder().encode(trimmed);
  }
  if (format !== "standard") {
    throw new WebhookConfigError("Unsupported webhook secret format");
  }
  const encoded = trimmed.startsWith("whsec_") ? trimmed.slice(6) : trimmed;
  try {
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error();
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    if (!bytes.length) throw new Error();
    return bytes;
  } catch {
    // Never include a signing secret in configuration errors or logs.
    throw new WebhookConfigError("Invalid Base64 webhook signing key");
  }
}

function parseSignatureHeader(
  signatureHeader: string,
): Uint8Array<ArrayBuffer>[] {
  return signatureHeader.split(/\s+/).flatMap((part) => {
    // SHA-256 HMAC is exactly 32 bytes / 44 padded Base64 characters.
    const match = /^v1,([A-Za-z0-9+/]{43}=)$/.exec(part);
    return match
      ? [Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0))]
      : [];
  });
}

export async function verifyStandardWebhook(
  rawBody: string,
  headers: StandardWebhookHeaders,
  secret: string | Uint8Array<ArrayBuffer>,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<void> {
  const missing = validateWebhookHeaderPresence(headers);
  if (missing.length > 0) {
    throw new WebhookVerificationError(
      `Missing required webhook headers: ${missing.join(", ")}`,
    );
  }

  const timestamp = Number(headers.timestamp);
  if (!/^\d+$/.test(headers.timestamp) || !Number.isSafeInteger(timestamp)) {
    throw new WebhookVerificationError("Invalid webhook timestamp");
  }

  if (
    !Number.isFinite(toleranceSeconds) || toleranceSeconds < 0 ||
    !Number.isFinite(nowSeconds)
  ) {
    throw new WebhookConfigError(
      "Invalid webhook timestamp tolerance or clock",
    );
  }
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    throw new WebhookVerificationError("Webhook timestamp outside tolerance");
  }

  const keyBytes = typeof secret === "string"
    ? decodeWebhookSigningSecret(secret)
    : secret;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signedContent = new TextEncoder().encode(
    `${headers.id}.${headers.timestamp}.${rawBody}`,
  );
  // Native HMAC verification performs the MAC comparison in constant time.
  // Check every candidate; never interpret untrusted headers as a key format.
  let valid = false;
  for (const signature of parseSignatureHeader(headers.signature)) {
    const matches = await crypto.subtle.verify(
      "HMAC",
      cryptoKey,
      signature,
      signedContent,
    );
    valid = matches || valid;
  }

  if (!valid) {
    throw new WebhookVerificationError("Invalid webhook signature");
  }
}

/** Test helper — signs a webhook payload with Standard Webhooks v1 (HMAC). */
export async function signStandardWebhookForTest(
  rawBody: string,
  secret: string | Uint8Array<ArrayBuffer>,
  id: string,
  timestamp: string,
): Promise<string> {
  const keyBytes = typeof secret === "string"
    ? decodeWebhookSigningSecret(secret)
    : secret;
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
