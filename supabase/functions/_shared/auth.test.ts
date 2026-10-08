import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireUserAuth } from "./auth.ts";

const config = {
  supabaseUrl: "https://sandbox.invalid",
  publishableKey: "public-test-key",
};
const uuid = "00000000-0000-4000-8000-000000000001";
const request = () =>
  new Request("https://function.invalid", {
    headers: { Authorization: "Bearer clerk-session-test" },
  });

Deno.test("Clerk TPA returns internal UUID and forwards no caller identity", async () => {
  const result = await requireUserAuth(request(), {
    config,
    fetch: async (url, init) => {
      assertEquals(
        url,
        "https://sandbox.invalid/rest/v1/rpc/clerk_bootstrap_account",
      );
      const options = init as RequestInit;
      assertEquals(options.body, "{}");
      assertEquals(
        new Headers(options.headers).get("Authorization"),
        "Bearer clerk-session-test",
      );
      return new Response(JSON.stringify(uuid));
    },
  });
  assertEquals(result, {
    ok: true,
    token: "clerk-session-test",
    userId: uuid,
    email: null,
  });
});

for (const status of [400, 401, 403, 429, 500, 503]) {
  Deno.test(`Clerk TPA rejects authority response ${status}`, async () => {
    const result = await requireUserAuth(request(), {
      config,
      fetch: () => Promise.resolve(new Response("{}", { status })),
    });
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.response.status, status < 429 ? 401 : 503);
    }
  });
}

Deno.test("Clerk auth rejects user sub as UUID and network failure", async () => {
  for (
    const impl of [
      () => Promise.resolve(new Response(JSON.stringify("user_not_a_uuid"))),
      () => Promise.reject(new Error("offline")),
    ]
  ) {
    const result = await requireUserAuth(request(), { config, fetch: impl });
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.response.status, 503);
  }
});

Deno.test("missing or malformed bearer does not contact the authority", async () => {
  for (
    const authorization of [
      "",
      "Bearer ",
      "Bearer a b",
      "Bearer " + "a".repeat(16385),
    ]
  ) {
    const result = await requireUserAuth(
      new Request("https://function.invalid", {
        headers: { authorization },
      }),
      {
        config,
        fetch: () => {
          throw new Error("must not fetch");
        },
      },
    );
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.response.status, 401);
  }
});
