import { testPrivateJwk } from "./testdata/signing.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { signDataToken } from "./index.ts";
Deno.test("B01 dedicated issuer and audience never masquerade as Supabase Auth", async () => {
  const now = new Date();
  const { token } = await signDataToken(
    "00000000-0000-4000-8000-000000000001",
    now,
    now.getTime() / 1000 + 600,
    { privateJwk: testPrivateJwk, supabaseUrl: "http://127.0.0.1:54321" },
    {
      issuer: "https://fixture.clerk.invalid",
      subject: "user_aaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  );
  const claims = JSON.parse(
    atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
  );
  assertEquals(claims.iss, "http://127.0.0.1:54321/native-data/v1");
  assertEquals(claims.aud, "vantare-native-data");
});
