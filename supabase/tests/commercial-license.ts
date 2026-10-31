// Actual SQL/Data API loader + native issuer; only synthetic loopback fixtures.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  loadCredentialAccount,
  signCredential,
  createCredentialStore,
  handleLicenseCredentialRequest,
} from "../functions/_shared/license-credential.ts";
import { handleNativeLicenseRequest } from "../functions/native-license/index.ts";
const [url, account, mode = "active"] = Deno.args;
if (new URL(url).hostname !== "127.0.0.1") throw new Error("loopback_only");
// Synthetic service bearer from the same ephemeral ES256 key as the harness.
const { serviceToken: token, dataToken } = JSON.parse(await new Response(Deno.stdin.readable).text());
if (!token || token.length > 16384) throw new Error("fixture_token_required");
const admin = createClient(url, "fixture-only", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { Authorization: "Bearer " + token },
    // Standalone loopback PostgREST has no managed /rest/v1 gateway prefix.
    fetch: (input, init) =>
      fetch(String(input).replace("/rest/v1/", "/"), init),
  },
});
const fingerprint = "b".repeat(64);
let legacyClaims = 0;
const legacyUserClient = createClient(url, "fixture-only", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { Authorization: "Bearer " + dataToken },
    fetch: (input, init) => {
      if (new URL(String(input)).pathname.endsWith("/rpc/claim_active_device")) {
        legacyClaims++;
      }
      return fetch(String(input).replace("/rest/v1/", "/"), init);
    },
  },
});
let legacySigns = 0, clerkReads = 0;
const legacy = await handleLicenseCredentialRequest(new Request("http://localhost", {
  method: "POST", headers: { Authorization: "Bearer " + dataToken },
  body: JSON.stringify({ deviceFingerprint: fingerprint }),
}), {
  environment: "sandbox",
  store: createCredentialStore({
    userClient: legacyUserClient, admin,
    config: { issuer: "https://fixture.clerk.invalid", clientId: "fixture-client", secretKey: "fixture-only" },
    fetch: () => {
      clerkReads++;
      return Promise.resolve(Response.json({
        id: "user_aaaaaaaaaaaaaaaaaaaaaaaaaaa", banned: false, locked: false,
        email_addresses: [], primary_email_address_id: null, first_name: null,
        last_name: null, created_at: 1, last_sign_in_at: null,
      }));
    },
  }),
  sign: (claims) => {
    legacySigns++;
    return Promise.resolve({ version: 1, algorithm: "Ed25519", key_id: "fixture", claims, signature: "fixture" });
  },
});
if (legacy.status !== 410 || legacySigns !== 0 || clerkReads !== 0 || legacyClaims !== 0) {
  throw new Error("retired_legacy_endpoint_performed_io");
}
console.log("legacy real signed data bearer: 410, zero Clerk/claim/sign PASS");
if (mode === "blocked") Deno.exit(0);
const loaded = await loadCredentialAccount(
  admin,
  account,
  fingerprint,
  "sandbox",
);
if (loaded.grants.some((g) => g.capability === "vantare.plan.pro")) {
  throw new Error("blocked_source_reached_issuer");
}
const keys = await crypto.subtle.generateKey("Ed25519", true, [
  "sign",
  "verify",
]) as CryptoKeyPair;
const subject = "user_aaaaaaaaaaaaaaaaaaaaaaaaaaa";
const now = new Date();
const response = await handleNativeLicenseRequest(
  new Request("http://localhost", {
    method: "POST",
    headers: {
      Authorization: "Bearer fixture-oauth",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ version: 1, deviceFingerprint: fingerprint }),
  }),
  {
    environment: "sandbox",
    now: () => now,
    config: {
      issuer: "https://fixture.clerk.invalid",
      secretKey: "fixture-only",
      clientId: "fixture-client",
    },
    fetch: (input) =>
      Promise.resolve(
        String(input).endsWith("/verify")
          ? Response.json({
            object: "clerk_idp_oauth_access_token",
            client_id: "fixture-client",
            subject,
            scopes: ["openid", "profile"],
            revoked: false,
            expired: false,
            expiration: now.getTime() / 1000 + 600,
          })
          : Response.json({
            id: subject,
            banned: false,
            locked: false,
            email_addresses: [],
            primary_email_address_id: null,
            first_name: null,
            last_name: null,
            created_at: 1,
            last_sign_in_at: null,
          }),
      ),
    load: () => Promise.resolve(loaded),
    sign: (claims) =>
      signCredential(claims, "fixture-commercial-ed25519", keys.privateKey),
  },
);
if (response.status !== 200) throw new Error("native_emission_failed");
const credential = (await response.json()).credential;
const { signature, ...payload } = credential;
const bytes = Uint8Array.from(
  atob(signature.replace(/-/g, "+").replace(/_/g, "/")),
  (c) => c.charCodeAt(0),
);
if (
  !await crypto.subtle.verify(
    "Ed25519",
    keys.publicKey,
    bytes,
    new TextEncoder().encode(JSON.stringify(payload)),
  )
) throw new Error("invalid_ed25519");
const capabilities = credential.claims.capabilities.map((g: { key: string }) =>
  g.key
);
if (
  capabilities.includes("vantare.plan.pro") ||
  !capabilities.includes("vantare.edition.launch_v1")
) throw new Error("source_isolation_failed");
console.log(
  "native Ed25519 issuance from real SQL: refunded Pro excluded, independent Launch retained PASS",
);
