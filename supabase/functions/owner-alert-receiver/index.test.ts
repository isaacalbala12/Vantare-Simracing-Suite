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
    claim(a) {
      if (state === "sent") return Promise.resolve({ state: "sent" });
      if (state === "sending") return Promise.resolve({ state: "busy" });
      state = "sending";
      return Promise.resolve({
        state: "claimed",
        email_key: "17250000-0000-4000-8000-000000000001",
        code: a.code,
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
        : { code: "invalid_parameter" },
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
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const send = f.deps.fetch;
  f.deps.fetch = async (input, init) => {
    entered.resolve();
    await release.promise;
    return send(input, init);
  };
  const first = handleOwnerAlert(await signed(), f.deps);
  try {
    await entered.promise; // The durable lease exists; provider ACK is still pending.
    equal((await handleOwnerAlert(await signed(), f.deps)).status, 503);
  } finally {
    release.resolve();
  }
  equal((await first).status, 200);
  equal(f.sends, 1);
});
Deno.test("Brevo failure remains pending; retry succeeds", async () => {
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

Deno.test("finish returning false never ACKs an accepted email", async () => {
  const f = fixture();
  const results: boolean[] = [];
  f.deps.store.finish = (_a, _lease, sent) => {
    results.push(sent);
    return Promise.resolve(false);
  };
  equal((await handleOwnerAlert(await signed(), f.deps)).status, 503);
  equal(results, [true]);
  equal(f.sends, 1);
});

Deno.test("lost Brevo ACK retries the same email key and commits duplicate_parameter as sent", async () => {
  const f = fixture();
  const keys: string[] = [];
  let emails = 0;
  const finish = f.deps.store.finish;
  f.deps.store.finish = (a, lease, sent) => {
    equal(sent, keys.length === 2);
    return finish(a, lease, sent);
  };
  f.deps.fetch = (_input, init) => {
    keys.push(
      JSON.parse(String((init as RequestInit)?.body)).headers.idempotencyKey,
    );
    if (keys.length === 1) {
      emails++;
      throw new Error("provider accepted but response lost");
    }
    equal(keys[1], keys[0]);
    return Promise.resolve(
      Response.json({ code: "duplicate_parameter" }, { status: 400 }),
    );
  };
  equal((await handleOwnerAlert(await signed(), f.deps)).status, 503);
  equal((await handleOwnerAlert(await signed(), f.deps)).status, 200);
  equal((await handleOwnerAlert(await signed(), f.deps)).status, 200);
  equal([emails, keys.length, f.finishes], [1, 2, 2]);
});

Deno.test("duplicate_parameter still needs a durable finish; other provider errors remain pending", async () => {
  const f = fixture();
  f.deps.fetch = () =>
    Promise.resolve(
      Response.json({ code: "duplicate_parameter" }, { status: 400 }),
    );
  f.deps.store.finish = (_a, _lease, sent) => {
    equal(sent, true);
    return Promise.resolve(false);
  };
  equal((await handleOwnerAlert(await signed(), f.deps)).status, 503);
  for (const status of [401, 429, 500]) {
    const g = fixture();
    g.deps.fetch = () =>
      Promise.resolve(
        Response.json({ code: "duplicate_parameter" }, { status }),
      );
    equal((await handleOwnerAlert(await signed(), g.deps)).status, 503);
  }
});

Deno.test("codes starting with a digit or underscore reach the email", async () => {
  for (const code of ["429_refund_unavailable", "_refund_unavailable"]) {
    const f = fixture();
    const send = f.deps.fetch;
    f.deps.fetch = (input, init) => {
      const message = JSON.parse(String((init as RequestInit)?.body));
      equal(message.textContent.includes(`Código: ${code}\n`), true);
      return send(input, init);
    };
    equal(
      (await handleOwnerAlert(await signed({ ...alert, code }), f.deps)).status,
      200,
    );
    equal(f.sends, 1);
  }
});

Deno.test("transport errors and malformed successful provider responses remain retryable", async () => {
  const f = fixture();
  f.deps.fetch = () => {
    throw new Error("network timeout");
  };
  equal((await handleOwnerAlert(await signed(), f.deps)).status, 503);
  f.deps.fetch = () => Promise.resolve(Response.json({}, { status: 201 }));
  equal((await handleOwnerAlert(await signed(), f.deps)).status, 503);
  equal(f.finishes, 2);
});

Deno.test("raw body tampering and invalid method/media type are rejected", async () => {
  const f = fixture();
  const request = await signed();
  const changed = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ ...alert, code: "changed_after_signature" }),
  });
  equal((await handleOwnerAlert(changed, f.deps)).status, 401);
  equal((await handleOwnerAlert(new Request(request.url), f.deps)).status, 405);
  const media = await signed();
  media.headers.set("Content-Type", "text/plain");
  equal((await handleOwnerAlert(media, f.deps)).status, 415);
  equal(f.sends, 0);
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
        attempt_count: 1,
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

Deno.test("same order sends new incidents for changed code or refund attempt, but dedupes each replay", async () => {
  const f = fixture();
  const rows = new Map<
    string,
    { emailKey: string; code: string; sent: boolean }
  >();
  const emails: { code: string; key: string }[] = [];
  f.deps.store = {
    claim(a) {
      let row = rows.get(a.id);
      if (!row) {
        row = { emailKey: crypto.randomUUID(), code: a.code, sent: false };
        rows.set(a.id, row);
      }
      return Promise.resolve(
        row.sent ? { state: "sent" } : {
          state: "claimed",
          email_key: row.emailKey,
          code: row.code,
        },
      );
    },
    finish(a, _lease, sent) {
      rows.get(a.id)!.sent = sent;
      return Promise.resolve(true);
    },
  };
  f.deps.fetch = (_input, init) => {
    const message = JSON.parse(String((init as RequestInit)?.body));
    emails.push({
      code: message.textContent,
      key: message.headers.idempotencyKey,
    });
    return Promise.resolve(
      Response.json({ messageId: "fixture-message" }, { status: 201 }),
    );
  };
  const incident = {
    order_id: "17250000-0000-4000-8000-000000000001",
    kind: alert.type,
    code: alert.code,
    attempt_count: 1,
  };
  const deliveries: boolean[] = [];
  const store = {
    alerts: () => Promise.resolve([incident]),
    finishAlert: (_environment: unknown, _id: unknown, delivered: boolean) => {
      deliveries.push(delivered);
      return Promise.resolve();
    },
  } as unknown as CompensationStore;
  const deliver = () =>
    deliverCheckoutOwnerAlerts(
      "production",
      store,
      { url: "https://receiver.invalid", secret },
      (input, init) => handleOwnerAlert(new Request(input, init), f.deps),
      () => new Date(now),
    );
  await deliver();
  await deliver();
  equal(emails.length, 1);
  incident.code = "429_refund_unavailable";
  await deliver();
  await deliver();
  equal(emails.length, 2);
  equal(emails[1].code.includes("Código: 429_refund_unavailable\n"), true);
  incident.attempt_count++;
  await deliver();
  await deliver();
  equal(emails.length, 3);
  equal(new Set(emails.map((e) => e.key)).size, 3);
  equal(deliveries, Array(6).fill(true));
});
