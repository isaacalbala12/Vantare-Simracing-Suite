import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createCredentialStore, handleLicenseCredentialRequest } from "./index.ts";

const account = "00000000-0000-4000-8000-000000000073";
const subject = `user_${"u".repeat(27)}`;
const config = {
  issuer: "https://clerk.example.invalid", clientId: "fixture", secretKey: "fixture",
};
const user = {
  id: subject, banned: false, locked: false, email_addresses: [],
  primary_email_address_id: null, first_name: null, last_name: null,
  created_at: 1, last_sign_in_at: null,
};
const fingerprint = "a".repeat(64);
function bearer(data: boolean, overrides: Record<string, unknown> = {}) {
  const claims = data ? {
    iss: "https://project.supabase.invalid/native-data/v1", sub: account,
    clerk_issuer: config.issuer, clerk_subject: subject,
    vantare_identity_provider: "clerk", aud: "vantare-native-data",
  } : { iss: config.issuer, sub: subject, sid: "sess_fixture" };
  // The signature is deliberately synthetic: the authenticated RPC is doubled.
  // Production only decodes after PostgREST/RLS verified the complete bearer.
  return `e30.${btoa(JSON.stringify({ ...claims, ...overrides })).replaceAll("=", "")}.fixture`;
}

for (const data of [false, true]) {
  for (const scenario of ["active", "admin-blocked", "banned", "locked", "deleted", "identity-conflict", "invalid-bearer", "mismatched-account", "mismatched-claim", "clerk-outage", "clerk-missing", "clerk-rate-limited"]) {
    Deno.test(`legacy ${data ? "data" : "session"} bearer: ${scenario} checked before grants/signing`, async () => {
      const calls: string[] = [];
      const token = bearer(data);
      const userClient = createClient("https://local.invalid", "fixture", {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: (input) => {
          const path = new URL(String(input)).pathname;
          if (path === "/rest/v1/rpc/claim_active_device") {
            calls.push("claim");
            return Promise.resolve(Response.json(scenario === "mismatched-claim"
              ? "00000000-0000-4000-8000-000000000074" : account));
          }
          assertEquals(path, "/rest/v1/profiles");
          calls.push("authenticate");
          return Promise.resolve(scenario === "invalid-bearer"
            ? Response.json({ code: "PGRST301" }, { status: 401 })
            : scenario === "deleted" ? Response.json(null) : Response.json({ id: account }));
        } },
      });
      const admin = createClient("https://local.invalid", "fixture", {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: (input, init) => {
          const url = new URL(String(input));
          if (url.pathname.endsWith("/rpc/native_resolve_account")) {
            calls.push("resolve");
            assertEquals(JSON.parse(String((init as RequestInit)?.body)), { issuer: config.issuer, subject });
            return Promise.resolve(scenario === "identity-conflict"
              ? Response.json({ message: "account_conflict", code: "P0001" }, { status: 400 })
              : scenario === "admin-blocked"
              ? Response.json({ message: "native_account_blocked", code: "42501" }, { status: 403 })
              : Response.json(scenario === "mismatched-account" ? "00000000-0000-4000-8000-000000000074" : account));
          }
          calls.push("load");
          const table = url.pathname.split("/").pop();
          return Promise.resolve(Response.json(table === "devices"
            ? { fingerprint_hash: fingerprint }
            : table === "billing_effective_access_grants" ? [{
              capability: "vantare.plan.pro", valid_until: "2027-01-01T00:00:00Z",
              provider: "polar", environment: "sandbox", source_type: "subscription",
            }] : []));
        } },
      });
      const response = await handleLicenseCredentialRequest(new Request("https://local.invalid", {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ deviceFingerprint: fingerprint }),
      }), {
        environment: "sandbox", now: () => new Date("2026-10-30T00:00:00Z"),
        store: createCredentialStore({ userClient, admin, config, fetch: (input) => {
          calls.push("clerk");
          assertEquals(String(input), `https://api.clerk.com/v1/users/${subject}`);
          return Promise.resolve(scenario === "clerk-rate-limited" ? new Response(null, { status: 429 })
            : scenario === "clerk-outage" ? new Response(null, { status: 503 })
            : scenario === "clerk-missing" ? new Response(null, { status: 404 })
            : Response.json({ ...user, banned: scenario === "banned", locked: scenario === "locked" }));
        } }),
        sign: (claims) => {
          calls.push("sign");
          assertEquals(claims.capabilities.map((g) => g.key), ["vantare.plan.pro"]);
          return Promise.resolve({ version: 1, algorithm: "Ed25519", key_id: "fixture", claims, signature: "fixture" });
        },
      });
      const expected = scenario === "active" ? 200
        : ["invalid-bearer", "deleted", "mismatched-account", "mismatched-claim", "clerk-missing"].includes(scenario) ? 401
        : scenario === "identity-conflict" ? 409
        : scenario === "clerk-rate-limited" ? 429
        : scenario === "clerk-outage" ? 503 : 403;
      assertEquals(response.status, expected);
      if (scenario === "active") {
        assertEquals(calls, ["authenticate", "resolve", "clerk", "claim", "load", "load", "load", "load", "sign"]);
      } else {
        assertEquals(calls.includes("load"), false);
        assertEquals(calls.includes("sign"), false);
        assertEquals(calls.includes("claim"), scenario === "mismatched-claim");
        if (scenario === "mismatched-claim") assertEquals(calls, ["authenticate", "resolve", "clerk", "claim"]);
        if (["invalid-bearer", "deleted"].includes(scenario)) assertEquals(calls, ["authenticate"]);
        if (["admin-blocked", "mismatched-account"].includes(scenario)) assertEquals(calls, ["authenticate", "resolve"]);
        const result = await response.json();
        assertEquals("credential" in result, false);
      }
    });
  }
}

for (const claims of [{ iss: "https://foreign.invalid" }, { sub: account }, { clerk_subject: "user_bad" }]) {
  Deno.test(`legacy rejects incompatible identity after RPC: ${JSON.stringify(claims)}`, async () => {
    const userClient = createClient("https://local.invalid", "fixture", {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: () => Promise.resolve(Response.json({ id: account })) },
    });
    const store = createCredentialStore({ userClient, config, resolve: () => {
      throw new Error("incompatible identity must not resolve");
    } });
    const response = await handleLicenseCredentialRequest(new Request("https://local.invalid", {
      method: "POST", headers: { Authorization: `Bearer ${bearer("clerk_subject" in claims, claims)}` },
      body: JSON.stringify({ deviceFingerprint: fingerprint }),
    }), { store, environment: "sandbox", sign: () => { throw new Error("must not sign"); } });
    assertEquals(response.status, 401);
  });
}
