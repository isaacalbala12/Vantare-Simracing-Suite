import { NativeError } from "./native-auth.ts";

// Only operator-configured EC keys. Never follow a JWT's jku/jwk or trust the
// project's entire JWKS: other project signing keys are not bridge signers.
export async function nativeDataKey(encoded: string, privateKey: boolean) {
  try {
    const jwk = JSON.parse(encoded);
    if (
      !jwk || jwk.kty !== "EC" || jwk.crv !== "P-256" ||
      jwk.alg !== "ES256" || typeof jwk.kid !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(jwk.kid) ||
      !/^[A-Za-z0-9_-]{43}$/.test(jwk.x) ||
      !/^[A-Za-z0-9_-]{43}$/.test(jwk.y) ||
      (privateKey ? !/^[A-Za-z0-9_-]{43}$/.test(jwk.d) : "d" in jwk) ||
      (jwk.use !== undefined && jwk.use !== "sig") ||
      (jwk.key_ops !== undefined &&
        (!Array.isArray(jwk.key_ops) || jwk.key_ops.length !== 1 ||
          jwk.key_ops[0] !== (privateKey ? "sign" : "verify")))
    ) throw new Error();
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      [privateKey ? "sign" : "verify"],
    );
    return { key, kid: jwk.kid as string };
  } catch {
    // JSON/WebCrypto errors can include key material; never forward or log them.
    throw new NativeError(503, "bridge_unavailable");
  }
}
