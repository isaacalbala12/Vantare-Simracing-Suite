import { type AlertStore, handleOwnerAlert } from "./index.ts";
import {
  type CompensationStore,
  deliverCheckoutOwnerAlerts,
} from "../billing-reconcile/checkout-compensation.ts";

function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  }
}
const now = 1792598400000;
const secret = "fixture-owner-alert-secret-32-characters";
const alert = {
  type: "checkout_refund_failed",
  environment: "production",
  id: "a".repeat(64),
  code: "polar_refund_unavailable",
};
const env = (name: string) => ({
  BILLING_OWNER_ALERT_SECRET: secret,
  BILLING_OWNER_ALERT_EMAIL: "owner@example.invalid",
  BREVO_API_KEY: "fixture-brevo-key",
  BREVO_MARKETING_SENDER: "sender@example.invalid",
}[name]);
async function signed(
  value: unknown = alert,
  timestamp = String(now / 1000),
): Promise<Request> {
  const body = JSON.stringify(value);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(timestamp + "." + body),
    ),
  );
  return new Request("https://receiver.invalid", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Vantare-Timestamp": timestamp,
      "X-Vantare-Alert-Id": (value as typeof alert)?.id ?? "",
      "X-Vantare-Signature": "sha256=" +
        Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join(""),
    },
    body,
  });
}
function fixture() {
  let state = "pending";
  let sends = 0;
  let finishes = 0;
  let providerStatus = 201;
  let finishFails = false;
  const store: AlertStore = {
    claim() {
      if (state === "sent") return Promise.resolve({ state: "sent" });
      if (state === "sending") return Promise.resolve({ state: "busy" });
      state = "sending";
      return Promise.resolve({
        state: "claimed",
        email_key: "17250000-0000-4000-8000-000000000001",
        code: alert.code,
      });
    },
    finish(_alert, _lease, sent) {
      finishes++;
      if (finishFails) throw new Error("database unavailable");
      state = sent ? "sent" : "pending";
      return Promise.resolve(true);
    },
  };
  const fetchFn: typeof fetch = async (url, init) => {
    equal(state, "sending"); // A durable claim must precede the email side effect.
    equal(url, "https://api.brevo.com/v3/smtp/email");
    equal((init as RequestInit)?.redirect, "error");
    const message = JSON.parse(String((init as RequestInit)?.body));
    equal(message.to, [{ email: "owner@example.invalid" }]);
    equal(
      message.headers.idempotencyKey,
      "17250000-0000-4000-8000-000000000001",
    );
    equal(message.sender.email, "sender@example.invalid");
    sends++;
    return Response.json(
      providerStatus === 201
        ? { messageId: "fixture-message" }
        : { code: "duplicate_parameter" },
      { status: providerStatus },
    );
  };
  return {
    deps: { env, now: () => now, store, fetch: fetchFn },
    get sends() {
      return sends;
    },
    get finishes() {
      return finishes;
    },
    failProvider(status: number) {
      providerStatus = status;
    },
    failFinish() {
      finishFails = true;
    },
  };
}

Deno.test("signed alert is persisted and emailed once; lost HTTP ACK is safe", async () => {
  const f = fixture();
  equal((await handleOwnerAlert(await signed(), f.deps)).status, 200);
  equal((await handleOwnerAlert(await signed(), f.deps)).status, 200);
  equal([f.sends, f.finishes], [1, 1]);
});
Deno.test("concurrent duplicate has one sender and no premature ACK", async () => {
  const f = fixture();
  const requests = await Promise.all([signed(), signed()]);
  const statuses = await Promise.all(
    requests.map(async (r) => (await handleOwnerAlert(r, f.deps)).status),
  );
  equal(statuses.sort(), [200, 503]);
  equal(f.sends, 1);
});
Deno.test("Brevo failure remains pending; retry succeeds; duplicate errors are not ACKed", async () => {
  const f = fixture();
  for (const status of [400, 401, 429, 500]) {
    f.failProvider(status);
    equal((await handleOwnerAlert(await signed(), f.deps)).status, 503);
  }
  f.failProvider(201);
  equal((await handleOwnerAlert(await signed(), f.deps)).status, 200);
  equal(f.sends, 5);
});
Deno.test("storage failure never produces successful ACK", async () => {
  const f = fixture();
  f.deps.store.claim = () => {
    throw new Error("database unavailable");
  };
  equal((await handleOwnerAlert(await signed(), f.deps)).status, 503);
  equal(f.sends, 0);
  const g = fixture();
  g.failFinish();
  equal((await handleOwnerAlert(await signed(), g.deps)).status, 503);
});
Deno.test("invalid signature, stale/future timestamp and mismatched ID never reach storage/email", async () => {
  const f = fixture();
  for (const delta of [-301, 301]) {
    equal(
      (await handleOwnerAlert(
        await signed(alert, String(now / 1000 + delta)),
        f.deps,
      )).status,
      401,
    );
  }
  const tampered = await signed();
  tampered.headers.set("X-Vantare-Signature", "sha256=" + "0".repeat(64));
  equal((await handleOwnerAlert(tampered, f.deps)).status, 401);
  const other = await signed();
  other.headers.set("X-Vantare-Alert-Id", "b".repeat(64));
  equal((await handleOwnerAlert(other, f.deps)).status, 400);
  equal(f.sends, 0);
});
Deno.test("closed payload rejects PII, unknown type, invalid code and oversized bodies", async () => {
  const f = fixture();
  for (
    const value of [
      null,
      [],
      { ...alert, email: "buyer@example.invalid" },
      { ...alert, type: "unknown" },
      { ...alert, code: "buyer@example.invalid" },
      { ...alert, environment: "unknown" },
    ]
  ) {
    equal((await handleOwnerAlert(await signed(value), f.deps)).status, 400);
  }
  equal(
    (await handleOwnerAlert(
      await signed({ ...alert, code: "x".repeat(3000) }),
      f.deps,
    )).status,
    413,
  );
  equal(f.sends, 0);
});
Deno.test("missing email configuration retains durable alert without marketing flag dependency", async () => {
  const f = fixture();
  f.deps.env = (name) =>
    name === "BILLING_OWNER_ALERT_EMAIL" ? undefined : env(name);
  equal((await handleOwnerAlert(await signed(), f.deps)).status, 503);
  equal([f.sends, f.finishes], [0, 1]);
});
Deno.test("real reconcile signer interoperates with receiver and only marks durable mail ACK", async () => {
  const f = fixture();
  const deliveries: boolean[] = [];
  const store = {
    alerts: () =>
      Promise.resolve([{
        order_id: "17250000-0000-4000-8000-000000000001",
        kind: alert.type,
        code: alert.code,
      }]),
    finishAlert: (_environment: unknown, _id: unknown, delivered: boolean) => {
      deliveries.push(delivered);
      return Promise.resolve();
    },
  } as unknown as CompensationStore;
  await deliverCheckoutOwnerAlerts(
    "production",
    store,
    { url: "https://receiver.invalid", secret },
    (input, init) => handleOwnerAlert(new Request(input, init), f.deps),
    () => new Date(now),
  );
  equal(deliveries, [true]);
  equal(f.sends, 1);
});
