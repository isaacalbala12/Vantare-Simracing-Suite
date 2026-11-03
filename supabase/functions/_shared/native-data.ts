import { nativeDataKey } from "./native-data-key.ts";
import { nativeBearer, NativeError } from "./native-auth.ts";
import { isUuid } from "./request.ts";

// Data JWTs are minted by native-account-authorize, not Supabase Auth sessions.
// Verify signature and the closed bridge claims before resolving identity.
export async function verifyBridgeAccount(
  request: Request,
  now: Date,
  config: { publicJwk: string; url: string; issuer: string },
): Promise<{ account: string; subject: string }> {
  const token = nativeBearer(request);
  if (
    !config.url || !config.issuer
  ) throw new NativeError(503, "bridge_unavailable");
  const { key, kid } = await nativeDataKey(config.publicJwk, false);
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error();
    const decode = (value: string) =>
      Uint8Array.from(
        atob(value.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    if (
      header.alg !== "ES256" || header.typ !== "JWT" || header.kid !== kid ||
      header.jwk !== undefined || header.jku !== undefined ||
      header.crit !== undefined
    ) throw new Error();
    if (
      !await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        decode(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      )
    ) throw new Error();
    const c = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const t = Math.floor(now.getTime() / 1000);
    if (
      c.iss !== `${config.url}/native-data/v1` ||
      c.aud !== "vantare-native-data" ||
      c.role !== "authenticated" || !isUuid(c.sub) ||
      !Number.isInteger(c.iat) || !Number.isInteger(c.exp) || c.iat > t ||
      c.exp <= t || c.exp <= c.iat || c.exp - c.iat > 300 ||
      c.vantare_identity_provider !== "clerk" ||
      c.clerk_issuer !== config.issuer ||
      !/^user_[A-Za-z0-9_]{27}$/.test(c.clerk_subject)
    ) throw new Error();
    return { account: c.sub, subject: c.clerk_subject };
  } catch {
    throw new NativeError(401, "unauthorized");
  }
}
