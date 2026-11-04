import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { handleClerkWebhook } from "./index.ts";

const signingKey = "clerk-test-signing-key-32-bytes!!!";
const config = {
  issuer: "https://clerk.sandbox.invalid",
  signingSecret: "whsec_" + btoa(signingKey),
};
async function signedRequest(payload: unknown) {
  const body = JSON.stringify(payload);
  const id = "msg_default_cleanup";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${id}.${timestamp}.${body}`),
  );
  return new Request("https://function.invalid", {
    method: "POST",
    body,
    headers: {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": "v1," +
        btoa(String.fromCharCode(...new Uint8Array(signature))),
    },
  });
}

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
        await signedRequest({
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
