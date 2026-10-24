import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Webhook } from "npm:standardwebhooks@1.0.0";
import {
  decodeWebhookSigningSecret,
  signStandardWebhookForTest,
  verifyStandardWebhook,
  WebhookConfigError,
  WebhookVerificationError,
} from "./webhook-verify.ts";

// Public upstream vector: standard-webhooks/standard-webhooks,
// libraries/javascript/src/webhook.test.ts, "sign function works".
// This is the published upstream test key, constructed at runtime so secret
// scanners do not confuse the public fixture with a deployed signing secret.
const PUBLIC_KEY_BASE64 = "MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const SECRET = ["whsec", PUBLIC_KEY_BASE64].join("_");
const ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
const BODY = '{"test": 2432232314}';
const NOW = 1614265330;
const SIGNATURE = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";
const HEADERS = { id: ID, timestamp: String(NOW), signature: SIGNATURE };

Deno.test("webhook-verify: upstream fixed Standard Webhooks vector, prefix optional", async () => {
  for (const secret of [SECRET, SECRET.slice(6)]) {
    await verifyStandardWebhook(BODY, HEADERS, secret, 300, NOW);
    assertEquals(
      await signStandardWebhookForTest(BODY, secret, ID, String(NOW)),
      SIGNATURE,
    );
  }
});

Deno.test("webhook-verify: independently signed current Polar Standard delivery", async () => {
  const body =
    '{"type":"order.paid","data":{"id":"public-fixture","note":"€"}}';
  const signature = new Webhook(SECRET).sign(ID, new Date(NOW * 1000), body);
  await verifyStandardWebhook(
    body,
    { ...HEADERS, signature },
    SECRET,
    300,
    NOW,
  );
});

Deno.test("webhook-verify: legacy requires explicit trusted configuration; no fallback", async () => {
  // Equivalent to Polar JS validateEvent / pre-cutoff Polar backend.
  const signature = new Webhook(btoa(SECRET)).sign(
    ID,
    new Date(NOW * 1000),
    BODY,
  );
  const headers = { ...HEADERS, signature };
  await assertRejects(
    () => verifyStandardWebhook(BODY, headers, SECRET, 300, NOW),
    WebhookVerificationError,
  );
  const legacy = decodeWebhookSigningSecret(SECRET, "legacy_utf8");
  await verifyStandardWebhook(BODY, headers, legacy, 300, NOW);
  await assertRejects(
    () => verifyStandardWebhook(BODY, HEADERS, legacy, 300, NOW),
    WebhookVerificationError,
  );
});

Deno.test("webhook-verify: multiple versioned signatures, including unknown versions", async () => {
  const bad = "v1," + btoa("x".repeat(32));
  for (
    const signature of [`${bad} v2,unknown ${SIGNATURE}`, `${SIGNATURE} ${bad}`]
  ) {
    await verifyStandardWebhook(
      BODY,
      { ...HEADERS, signature },
      SECRET,
      300,
      NOW,
    );
  }
});

Deno.test("webhook-verify: rejects modified body, id, timestamp and malformed signatures", async () => {
  await assertRejects(
    () => verifyStandardWebhook(BODY + " ", HEADERS, SECRET, 300, NOW),
    WebhookVerificationError,
  );
  for (
    const headers of [
      { ...HEADERS, id: ID + "x" },
      { ...HEADERS, timestamp: String(NOW + 1) },
      ...[
        "",
        "v2," + SIGNATURE.slice(3),
        "v1,",
        "v1,invalid",
        SIGNATURE + ",extra",
        SIGNATURE.slice(0, -1),
      ].map((signature) => ({ ...HEADERS, signature })),
      ...["", "NaN", "Infinity", "1e9", "1614265330.0", " 1614265330"].map(
        (timestamp) => ({ ...HEADERS, timestamp }),
      ),
    ]
  ) {
    await assertRejects(
      () => verifyStandardWebhook(BODY, headers, SECRET, 300, NOW),
      WebhookVerificationError,
    );
  }
});

Deno.test("webhook-verify: exact timestamp tolerance, both past and future", async () => {
  for (const offset of [-301, -300, 300, 301]) {
    const timestamp = String(NOW + offset);
    const signature = new Webhook(SECRET).sign(
      ID,
      new Date(Number(timestamp) * 1000),
      BODY,
    );
    const verify = () =>
      verifyStandardWebhook(
        BODY,
        { id: ID, timestamp, signature },
        SECRET,
        300,
        NOW,
      );
    if (Math.abs(offset) > 300) {
      await assertRejects(verify, WebhookVerificationError);
    } else await verify();
  }
});

Deno.test("webhook-verify: invalid secret or unknown operator format fails closed without echoing it", () => {
  for (const secret of ["", "whsec_", "whsec_!sensitive-invalid!"]) {
    const error = assertThrows(
      () => decodeWebhookSigningSecret(secret),
      WebhookConfigError,
    );
    assertEquals(error.message.includes("sensitive-invalid"), false);
  }
  assertThrows(
    () => decodeWebhookSigningSecret(SECRET, "auto"),
    WebhookConfigError,
  );
});
