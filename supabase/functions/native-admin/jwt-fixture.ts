// Ephemeral synthetic RSA key; no provider token, secret or ID from a real account.
import {
  config,
  now,
  subject,
} from "../native-account-authorize/testdata/auth.ts";
export const adminClient = "admin-fixture-client";
const pair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
export const publicKey = {
  ...await crypto.subtle.exportKey("jwk", pair.publicKey),
  kid: "admin-fixture-key",
  use: "sig",
  alg: "RS256",
};
function encoded(value: Uint8Array) {
  return btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll(
    "/",
    "_",
  ).replace(/=+$/, "");
}
export async function signedJwt(
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
) {
  const json = (value: unknown) =>
    encoded(new TextEncoder().encode(JSON.stringify(value)));
  const input = `${
    json({ alg: "RS256", typ: "at+jwt", kid: publicKey.kid, ...header })
  }.${
    json({
      iss: config.issuer,
      sub: subject,
      client_id: adminClient,
      aud: adminClient,
      exp: now.getTime() / 1000 + 3600,
      iat: now.getTime() / 1000,
      scope: "openid profile",
      ...claims,
    })
  }`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    new TextEncoder().encode(input),
  );
  return `${input}.${encoded(new Uint8Array(signature))}`;
}
