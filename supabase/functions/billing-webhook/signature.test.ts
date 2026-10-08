import {
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Webhook } from "npm:standardwebhooks";
import { polarSigningKey } from "./signature.ts";
import {
  verifyStandardWebhook,
  WebhookConfigError,
  WebhookVerificationError,
} from "../_shared/webhook-verify.ts";

Deno.test("Polar standard signature matches official library, rejects legacy encoding and modified body", async () => {
  // Ephemeral test material avoids committing a value that resembles a
  // provider credential, while still checking its official signature format.
  const secret = "whsec_" +
    btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const date = new Date();
  const body = '{"type":"order.paid","data":{}}';
  const headers = {
    id: "fixture-event",
    timestamp: String(Math.floor(date.getTime() / 1000)),
    signature: new Webhook(secret).sign("fixture-event", date, body),
  };
  await verifyStandardWebhook(
    body,
    headers,
    polarSigningKey(secret, "standard"),
  );
  await assertRejects(
    () =>
      verifyStandardWebhook(body, headers, polarSigningKey(secret, "legacy")),
    WebhookVerificationError,
  );
  await assertRejects(
    () =>
      verifyStandardWebhook(
        body + " ",
        headers,
        polarSigningKey(secret, "standard"),
      ),
    WebhookVerificationError,
  );
  assertThrows(() => polarSigningKey(secret, "automatic"), WebhookConfigError);
  assertThrows(
    () => polarSigningKey("whsec_invalid", "standard"),
    WebhookConfigError,
  );
});
