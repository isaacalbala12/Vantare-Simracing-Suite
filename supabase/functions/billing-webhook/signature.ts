import {
  type StandardWebhookHeaders,
  verifyStandardWebhook,
  WebhookConfigError,
} from "../_shared/webhook-verify.ts";

export function polarSigningKey(
  secret: string,
  scheme: string,
): string | Uint8Array<ArrayBuffer> {
  if (scheme === "legacy") return secret;
  if (scheme !== "standard" || !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)) {
    throw new WebhookConfigError("Invalid Polar signature configuration");
  }
  try {
    const bytes = Uint8Array.from(
      atob(secret.slice(6)),
      (character) => character.charCodeAt(0),
    );
    if (bytes.length < 16) throw new Error("short_key");
    return bytes;
  } catch {
    throw new WebhookConfigError("Invalid Polar signature configuration");
  }
}

export async function verifyPolarWebhook(
  body: string,
  headers: StandardWebhookHeaders,
  secret: string,
): Promise<void> {
  // New endpoints use Standard Webhooks. Historical endpoints require an
  // explicit legacy setting; never try both encodings for one endpoint.
  await verifyStandardWebhook(
    body,
    headers,
    polarSigningKey(
      secret,
      Deno.env.get("POLAR_WEBHOOK_SIGNATURE_SCHEME") ?? "standard",
    ),
  );
}
