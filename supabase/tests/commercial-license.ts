// Actual SQL/Data API loader + native issuer; only synthetic loopback fixtures.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  loadCredentialAccount,
  signCredential,
} from "../functions/_shared/license-credential.ts";
import { handleNativeLicenseRequest } from "../functions/native-license/index.ts";
const [url, account] = Deno.args;
if (new URL(url).hostname !== "127.0.0.1") throw new Error("loopback_only");
const encode = (v: unknown) =>
  btoa(JSON.stringify(v)).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/,
    "",
  );
const input = encode({ alg: "HS256", typ: "JWT" }) + "." +
  encode({
    role: "service_role",
    aud: "vantare-native-data",
    exp: Math.floor(Date.now() / 1000) + 300,
  });
const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(
    "commercial-fixture-signing-material-local-only-32-bytes",
  ),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);
const sig = new Uint8Array(
  await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input)),
);
const token = input + "." +
  btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_")
    .replace(/=+$/, "");
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
