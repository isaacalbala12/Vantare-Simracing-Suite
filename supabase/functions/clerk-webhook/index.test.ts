import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Webhook } from "npm:standardwebhooks";
import { handleClerkWebhook, parseClerkUserEvent } from "./index.ts";

const secret = "whsec_" + btoa("clerk-test-signing-key-32-bytes!!!");
const config = {
  issuer: "https://clerk.sandbox.invalid",
  signingSecret: secret,
};
function signedRequest(payload: unknown, modify = false, old = false) {
  const body = JSON.stringify(payload);
  const id = "msg_test";
  const time = new Date(Date.now() - (old ? 600_000 : 0));
  const signature = new Webhook(secret).sign(id, time, body);
  return new Request("https://function.invalid", {
    method: "POST",
    body: modify ? body + " " : body,
    headers: {
      "svix-id": id,
      "svix-timestamp": String(Math.floor(time.getTime() / 1000)),
      "svix-signature": signature,
    },
  });
}
const created = {
  type: "user.created",
  timestamp: 1_700_000_000_000,
  data: {
    id: "user_test",
    created_at: 1_700_000_000_000,
    primary_email_address_id: "email_primary",
    email_addresses: [{
      id: "email_primary",
      email_address: "verified@example.invalid",
      verification: { status: "verified" },
    }],
  },
};

Deno.test("Clerk signature interoperates with Standard Webhooks and stores only verified identity", async () => {
  let args: Record<string, unknown> | undefined;
  const response = await handleClerkWebhook(signedRequest(created), {
    config,
    apply: (value) => {
      args = value;
      return Promise.resolve();
    },
  });
  assertEquals(response.status, 200);
  assertEquals(args?.p_subject, "user_test");
  assertEquals(args?.p_verified_email, "verified@example.invalid");
  assertEquals(args?.p_issuer, config.issuer);
});

Deno.test("Clerk rejects tampering and stale delivery before database effects", async () => {
  for (
    const req of [
      signedRequest(created, true),
      signedRequest(created, false, true),
    ]
  ) {
    const response = await handleClerkWebhook(req, {
      config,
      apply: () => {
        throw new Error("must not apply");
      },
    });
    assertEquals(response.status, 401);
  }
});

Deno.test("Clerk database outage requests automatic Svix retry", async () => {
  const response = await handleClerkWebhook(signedRequest(created), {
    config,
    apply: () => Promise.reject(new Error("db unavailable")),
  });
  assertEquals(response.status, 503);
});

Deno.test("Clerk parser uses deletion event time and never syncs unverified email", () => {
  assertEquals(
    parseClerkUserEvent({
      type: "user.deleted",
      timestamp: 1_700_000_000_000,
      data: { id: "user_test", deleted: true },
    })?.timestamp,
    "2023-11-14T22:13:20.000Z",
  );
  assertEquals(
    parseClerkUserEvent({
      ...created,
      data: {
        ...created.data,
        email_addresses: [
          {
            id: "email_primary",
            email_address: "unverified@example.invalid",
            verification: { status: "unverified" },
          },
        ],
      },
    })?.verifiedEmail,
    null,
  );
  assertEquals(
    parseClerkUserEvent({ type: "user.deleted", data: { id: "user_test" } }),
    null,
  );
});
