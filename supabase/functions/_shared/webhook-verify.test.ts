import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Webhook } from "npm:standardwebhooks";
import {
  signStandardWebhookForTest,
  verifyStandardWebhook,
} from "./webhook-verify.ts";

const SECRET = "whsec_dGVzdC13ZWJob29rLXNlY3JldC1rZXkhIQ==";

/** Polar SDK wraps the full secret string as UTF-8 before Standard Webhooks. */
function polarStandardWebhook(secret: string): Webhook {
  const base64Secret = btoa(
    String.fromCharCode(...new TextEncoder().encode(secret)),
  );
  return new Webhook(base64Secret);
}

Deno.test("webhook-verify: compatible with Polar Standard Webhooks key derivation", async () => {
  const rawBody = JSON.stringify({
    type: "order.paid",
    data: { product_id: "test", external_customer_id: "user-1" },
  });
  const id = "6423a201-0185-4046-a66c-bb6d3c8cfe04";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await signStandardWebhookForTest(
    rawBody,
    SECRET,
    id,
    timestamp,
  );

  const headers = {
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": signature,
  };

  await verifyStandardWebhook(rawBody, {
    id,
    timestamp,
    signature,
  }, SECRET);

  const parsed = polarStandardWebhook(SECRET).verify(rawBody, headers) as {
    type: string;
  };
  assertEquals(parsed.type, "order.paid");
});