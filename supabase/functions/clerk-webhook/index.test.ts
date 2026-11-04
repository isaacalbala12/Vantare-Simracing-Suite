import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Webhook } from "npm:standardwebhooks@1.0.0";
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
    cleanup: async () => {},
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
      cleanup: async () => {},
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
    cleanup: async () => {},
    apply: () => Promise.reject(new Error("db unavailable")),
  });
  assertEquals(response.status, 503);
});

Deno.test("Clerk deletion cleanup must finish before ACK; duplicate delivery retries bytes", async () => {
  const deleted = {
    type: "user.deleted",
    timestamp: 1700000000000,
    data: { id: "user_test", deleted: true },
  };
  let applies = 0;
  let cleanups = 0;
  const deps = {
    config,
    apply: () => {
      applies++;
      return Promise.resolve();
    },
    cleanup: () => {
      cleanups++;
      if (cleanups === 1) throw new Error("storage unavailable");
      return Promise.resolve();
    },
  };
  assertEquals(
    (await handleClerkWebhook(signedRequest(deleted), deps)).status,
    503,
  );
  assertEquals(
    (await handleClerkWebhook(signedRequest(deleted), deps)).status,
    200,
  );
  assertEquals(applies, 2);
  assertEquals(cleanups, 2);
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

Deno.test("Clerk default cleaner drains fake RPC queues before ACK and retries on RPC failure", async () => {
  const originalGet = Deno.env.get;
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  try {
    // Substitute lookup itself: never read or save any real environment values.
    Deno.env.get = (name) => {
      if (name === "SUPABASE_URL") return "https://storage.fixture.invalid";
      if (name === "SUPABASE_SERVICE_ROLE_KEY") return "synthetic-service-key";
      throw new Error("unexpected environment lookup: " + name);
    };
    for (const fail of [false, true]) {
      calls.length = 0;
      let pending = true;
      globalThis.fetch = async (input, init) => {
        const req = new Request(input, init);
        const url = new URL(req.url);
        assertEquals(url.origin, "https://storage.fixture.invalid");
        const name = url.pathname.split("/").at(-1)!;
        calls.push(name);
        const args = await req.json();
        if (name === "evidence") {
          assertEquals(req.method, "DELETE");
          assertEquals(args, { prefixes: ["completed"] });
          return Response.json([]);
        }
        assertEquals(args.p_issuer, config.issuer);
        assertEquals(args.p_subject, "user_test");
        if (name === "clerk_deletion_uploads") {
          return fail
            ? Response.json({ message: "queue unavailable" }, { status: 503 })
            : Response.json([]);
        }
        if (name === "clerk_deletion_objects") {
          return Response.json(
            pending ? [{ bucket_id: "evidence", name: "completed" }] : [],
          );
        }
        if (name === "clerk_deletion_completed") {
          assertEquals(args.p_names, ["completed"]);
          pending = false;
        } else {
          assertEquals(name, "apply_clerk_user_event");
        }
        return Response.json(true);
      };
      // Neither apply nor cleanup is injected: use both production defaults.
      const response = await handleClerkWebhook(
        signedRequest({
          type: "user.deleted",
          timestamp: 1700000000000,
          data: { id: "user_test", deleted: true },
        }),
        { config },
      );
      assertEquals(response.status, fail ? 503 : 200);
      assertEquals(calls, [
        "apply_clerk_user_event",
        "clerk_deletion_uploads",
        "clerk_deletion_objects",
        "evidence",
        "clerk_deletion_completed",
        "clerk_deletion_objects",
      ]);
      assertEquals(pending, false);
    }
  } finally {
    Deno.env.get = originalGet;
    globalThis.fetch = originalFetch;
  }
});
