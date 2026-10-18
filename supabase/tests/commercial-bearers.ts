// Only synthetic loopback JWTs; stdout is consumed in memory by the local runner.
const { handleNativeAccountAuthorize }:
  typeof import("../functions/native-account-authorize/index.ts") =
    await import(
      Deno.args[1] ?? "../functions/native-account-authorize/index.ts"
    );
import {
  testPrivateJwk,
  testPublicJwk,
  testToken,
} from "../functions/native-account-authorize/testdata/signing.ts";
const secret = "commercial-fixture-signing-material-local-only-32-bytes";
const issuer = "https://fixture.clerk.invalid";
const subject = "user_aaaaaaaaaaaaaaaaaaaaaaaaaaa";
const account = Deno.args[0];
const now = new Date();
const response = await handleNativeAccountAuthorize(
  new Request("http://localhost", {
    method: "POST",
    headers: {
      Authorization: "Bearer opaque-fixture-oauth",
      "Content-Type": "application/json",
    },
    body: '{"version":1}',
  }),
  {
    config: { issuer, secretKey: "fixture-only", clientId: "fixture-client" },
    now: () => now,
    resolve: () => Promise.resolve(account),
    signing: Object.assign({
      privateJwk: testPrivateJwk,
      supabaseUrl: "http://127.0.0.1:54321",
    }, { secret }),
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
  },
);
if (response.status !== 200) throw new Error("fixture_authorization_failed");
const valid = (await response.json()).data_access_token;
const parts = valid.split(".");
const original = JSON.parse(
  atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
);
function base64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(
    /\//g,
    "_",
  ).replace(/=+$/, "");
}
async function altered(changes: Record<string, unknown>) {
  if (
    JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/"))).alg ===
      "ES256"
  ) {
    return await testToken({ ...original, ...changes });
  }
  const encoded = base64(
    new TextEncoder().encode(JSON.stringify({ ...original, ...changes })),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${parts[0]}.${encoded}`),
  );
  return `${parts[0]}.${encoded}.${base64(new Uint8Array(sig))}`;
}
const jwks = { keys: [JSON.parse(testPublicJwk)] };
// Historical --baseline/--before-b01 controls still use a public local HS fixture.
const legacyMode =
  JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/"))).alg ===
    "HS256";
const tokens = {
  valid,
  forged: parts[0] + "." +
    base64(
      new TextEncoder().encode(
        JSON.stringify({
          ...original,
          sub: "00000000-0000-4000-8000-000000000099",
        }),
      ),
    ) + "." + parts[2],
  other: await altered({ sub: "00000000-0000-4000-8000-000000000099" }),
  wrongIssuer: await altered({ iss: "https://wrong.invalid/native-data/v1" }),
  wrongAudience: await altered({ aud: "authenticated" }),
  legacy: await altered({
    iss: "http://127.0.0.1:54321/auth/v1",
    aud: "authenticated",
    vantare_identity_provider: null,
    clerk_issuer: null,
    clerk_subject: null,
  }),
  excessive: await altered({ exp: original.iat + 301 }),
  expired: await altered({ iat: original.iat - 301, exp: original.iat - 1 }),
  future: await altered({ iat: original.iat + 120, exp: original.iat + 300 }),
};
if (!legacyMode) {
  const wrongPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const wrongPrivateJwk = JSON.stringify({
    ...await crypto.subtle.exportKey("jwk", wrongPair.privateKey),
    alg: "ES256",
    kid: JSON.parse(testPublicJwk).kid,
  });
  Object.assign(tokens, {
    wrongKey: await testToken(original, undefined, wrongPrivateJwk),
    wrongClerk: await altered({
      clerk_subject: "user_bbbbbbbbbbbbbbbbbbbbbbbbbbb",
    }),
    unknownKid: await testToken(original, {
      alg: "ES256",
      typ: "JWT",
      kid: "unknown",
    }),
    wrongAlgorithm: await testToken(original, {
      alg: "HS256",
      typ: "JWT",
      kid: JSON.parse(testPublicJwk).kid,
    }),
    none: base64(
      new TextEncoder().encode(JSON.stringify({ alg: "none", typ: "JWT" })),
    ) + "." + parts[1] + ".",
  });
}
console.log(
  JSON.stringify({
    jwks,
    tokens,
    serviceToken: await testToken({
      role: "service_role",
      aud: "vantare-native-data",
      exp: Math.floor(now.getTime() / 1000) + 300,
    }),
  }),
);
