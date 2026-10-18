import { handleNativeAccountAuthorize, signDataToken } from "./index.ts";
import { verifyBridgeAccount } from "../testing-report-submit/index.ts";
import { NativeError } from "../_shared/native-auth.ts";
import {
  account,
  assert,
  authDeps,
  config,
  now,
  request,
  subject,
} from "./testdata/auth.ts";
import {
  encode,
  testPrivateJwk,
  testPublicJwk,
  testToken,
} from "./testdata/signing.ts";

const supabaseUrl = "https://fixture.supabase.co";
const verification = {
  publicJwk: testPublicJwk,
  url: supabaseUrl,
  issuer: config.issuer,
};
const valid = await signDataToken(account, now, now.getTime() / 1000 + 300, {
  privateJwk: testPrivateJwk,
  supabaseUrl,
}, { issuer: config.issuer, subject });
const claims = JSON.parse(
  atob(valid.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
);
const header = { alg: "ES256", typ: "JWT", kid: JSON.parse(testPublicJwk).kid };

for (
  const [name, changes] of Object.entries({
    issuer: { iss: supabaseUrl + "/auth/v1" },
    audience: { aud: "authenticated" },
    role: { role: "service_role" },
    uuid: { sub: subject },
    provider: { vantare_identity_provider: "supabase" },
    clerkIssuer: { clerk_issuer: "https://other.invalid" },
    subject: { clerk_subject: "user_invalid" },
    expired: { exp: claims.iat },
    future: { iat: claims.iat + 1 },
    excessive: { exp: claims.iat + 301 },
    fractional: { exp: claims.exp - 0.5 },
    missingTime: { iat: null },
  })
) {
  Deno.test(`ES256 report verifier rejects correctly signed invalid ${name}`, async () => {
    await denied(await testToken({ ...claims, ...changes }));
  });
}
for (
  const [name, changes] of Object.entries({
    missingKid: { kid: undefined },
    wrongKid: { kid: "unknown-key" },
    wrongAlgorithm: { alg: "HS256" },
    none: { alg: "none" },
    wrongType: { typ: "other" },
    embeddedKey: { jwk: JSON.parse(testPublicJwk) },
    remoteKey: { jku: "https://attacker.invalid" },
    critical: { crit: ["custom"] },
  })
) {
  Deno.test(`ES256 report verifier rejects ${name}`, async () => {
    await denied(await testToken(claims, { ...header, ...changes }));
  });
}
async function denied(token: string) {
  try {
    await verifyBridgeAccount(
      new Request("https://local.invalid", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      now,
      verification,
    );
  } catch (error) {
    assert(error instanceof NativeError && error.status === 401);
    return;
  }
  throw new Error("Invalid token accepted");
}

Deno.test("ES256 verifier rejects a real HMAC JWT even with a known kid", async () => {
  const input = `${encode({ ...header, alg: "HS256" })}.${encode(claims)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("synthetic-legacy-key-for-negative-test-only"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input)),
  );
  const encoded = btoa(String.fromCharCode(...signature)).replace(/\+/g, "-")
    .replace(/\//g, "_").replace(/=+$/, "");
  await denied(`${input}.${encoded}`);
});

Deno.test("ES256 verifier rejects another private key even with the configured kid", async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const signing = {
    privateJwk: JSON.stringify({
      ...await crypto.subtle.exportKey("jwk", pair.privateKey),
      alg: "ES256",
      kid: header.kid,
    }),
    supabaseUrl,
  };
  await denied(
    (await signDataToken(account, now, claims.exp, signing, {
      issuer: config.issuer,
      subject,
    })).token,
  );
});

for (
  const [name, privateJwk] of Object.entries({
    absent: "",
    malformed: '{"private-fixture":',
    legacy: "old-hs256-secret-at-least-32-bytes",
    symmetric: JSON.stringify({
      kty: "oct",
      alg: "HS256",
      kid: header.kid,
      k: "fixture",
    }),
    publicOnly: testPublicJwk,
    missingKid: JSON.stringify({
      ...JSON.parse(testPrivateJwk),
      kid: undefined,
    }),
    wrongAlgorithm: JSON.stringify({
      ...JSON.parse(testPrivateJwk),
      alg: "RS256",
    }),
    wrongCurve: JSON.stringify({ ...JSON.parse(testPrivateJwk), crv: "P-384" }),
  })
) {
  Deno.test(`ES256 authorization fails closed with ${name} key configuration`, async () => {
    const response = await handleNativeAccountAuthorize(
      request({ version: 1 }),
      {
        ...authDeps(),
        resolve: () => Promise.resolve(account),
        signing: { privateJwk, supabaseUrl },
      },
    );
    assert(response.status === 503);
    const body = await response.text();
    assert(
      !body.includes("data_access_token") &&
        (!privateJwk || !body.includes(privateJwk)),
    );
  });
}
Deno.test("ES256 verifier refuses private material in public configuration", async () => {
  try {
    await verifyBridgeAccount(
      new Request("https://local.invalid", {
        headers: { Authorization: `Bearer ${valid.token}` },
      }),
      now,
      { ...verification, publicJwk: testPrivateJwk },
    );
  } catch (error) {
    assert(error instanceof NativeError && error.status === 503);
    return;
  }
  throw new Error("Private verification configuration accepted");
});
