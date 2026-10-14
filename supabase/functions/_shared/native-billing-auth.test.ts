import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireNativeBillingAuth } from "./native-billing-auth.ts";
const subject = "user_" + "a".repeat(27);
const account = "00000000-0000-4000-8000-000000000073";
function fixture(banned = false, client = "native-client") {
  let resolved = 0;
  return {
    get resolved() {
      return resolved;
    },
    deps: {
      config: {
        secretKey: "test-only",
        clientId: "native-client",
        issuer: "https://clerk.test.invalid",
      },
      now: () => new Date("2026-10-08T12:00:00Z"),
      fetch: (input: string | URL | Request) =>
        Promise.resolve(
          new Response(JSON.stringify(
            String(input).endsWith("/verify")
              ? {
                object: "clerk_idp_oauth_access_token",
                client_id: client,
                subject,
                scopes: ["openid", "profile"],
                revoked: false,
                expired: false,
                expiration: 2000000000,
              }
              : {
                id: subject,
                banned,
                locked: false,
                primary_email_address_id: null,
                email_addresses: [],
                first_name: null,
                last_name: null,
                created_at: 0,
                last_sign_in_at: null,
              },
          )),
        ),
      resolve: (issuer: string, sub: string) => {
        assertEquals(issuer, "https://clerk.test.invalid");
        assertEquals(sub, subject);
        resolved++;
        return Promise.resolve(account);
      },
    },
  };
}
const request = () =>
  new Request("https://native.invalid", {
    headers: { Authorization: "Bearer test-native-oauth" },
  });
Deno.test("native OAuth resolves the same internal UUID without creating a web session", async () => {
  const test = fixture();
  const result = await requireNativeBillingAuth(request(), test.deps);
  assertEquals(result, {
    ok: true,
    token: "test-native-oauth",
    userId: account,
    email: null,
  });
  assertEquals(test.resolved, 1);
});
Deno.test("native billing rejects wrong OAuth client and banned user before UUID bootstrap", async () => {
  for (const test of [fixture(false, "other-client"), fixture(true)]) {
    const result = await requireNativeBillingAuth(request(), test.deps);
    assertEquals(result.ok, false);
    assertEquals(test.resolved, 0);
    if (!result.ok) assertEquals(result.response.status, 403);
  }
});
Deno.test("native billing authority outage never falls back to cached identity", async () => {
  const test = fixture();
  test.deps.fetch = () => Promise.reject(new Error("outage"));
  const result = await requireNativeBillingAuth(request(), test.deps);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.response.status, 503);
});
