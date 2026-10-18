// Ephemeral TEST keys only; no private fixture is persisted in the repository.
const pair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const kid = crypto.randomUUID();
export const testPrivateJwk = JSON.stringify({
  ...await crypto.subtle.exportKey("jwk", pair.privateKey),
  alg: "ES256",
  kid,
});
export const testPublicJwk = JSON.stringify({
  ...await crypto.subtle.exportKey("jwk", pair.publicKey),
  alg: "ES256",
  kid,
});

export function encode(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Adversarial fixtures sign arbitrary claims/headers, unlike the production API.
export async function testToken(
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "ES256", kid, typ: "JWT" },
  privateJwk?: string,
): Promise<string> {
  const key = privateJwk
    ? await crypto.subtle.importKey(
      "jwk",
      JSON.parse(privateJwk),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    )
    : pair.privateKey;
  const input = `${encode(header)}.${encode(claims)}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(input),
    ),
  );
  const encoded = btoa(String.fromCharCode(...signature)).replace(/\+/g, "-")
    .replace(/\//g, "_").replace(/=+$/, "");
  return `${input}.${encoded}`;
}
