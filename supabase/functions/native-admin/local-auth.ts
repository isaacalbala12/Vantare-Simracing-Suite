import {
  type NativeAuthDeps,
  nativeConfig,
  NativeError,
} from "../_shared/native-auth.ts";

const unauthorized = () => new NativeError(401, "unauthorized");
const unavailable = () => new NativeError(503, "bridge_unavailable");
type ObjectValue = Record<string, unknown>;
function object(value: unknown): value is ObjectValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function bytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw unauthorized();
  try {
    const decoded = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
    const canonical = btoa(decoded).replaceAll("+", "-").replaceAll("/", "_")
      .replace(/=+$/, "");
    if (canonical !== value) throw unauthorized();
    return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  } catch {
    throw unauthorized();
  }
}
function part(value: string): ObjectValue {
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes(value)),
    );
    if (!object(parsed)) throw unauthorized();
    return parsed;
  } catch {
    throw unauthorized();
  }
}
async function readKeys(response: Response): Promise<Map<string, CryptoKey>> {
  if (
    !response.ok || Number(response.headers.get("content-length")) > 65_536 ||
    !response.body
  ) {
    await response.body?.cancel();
    throw unavailable();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65_536) {
        await reader.cancel();
        throw unavailable();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const content = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    content.set(chunk, offset);
    offset += chunk.length;
  }
  const jwks: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(content),
  );
  if (!object(jwks) || !Array.isArray(jwks.keys) || jwks.keys.length > 20) {
    throw unavailable();
  }
  const keys = new Map<string, CryptoKey>();
  for (const value of jwks.keys) {
    if (
      !object(value) || value.kty !== "RSA" ||
      (value.use !== undefined && value.use !== "sig") ||
      (value.alg !== undefined && value.alg !== "RS256")
    ) continue;
    if (
      typeof value.kid !== "string" ||
      !/^[A-Za-z0-9._-]{1,128}$/.test(value.kid) || keys.has(value.kid)
    ) {
      throw unavailable();
    }
    keys.set(
      value.kid,
      await crypto.subtle.importKey(
        "jwk",
        value as JsonWebKey,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      ),
    );
  }
  if (!keys.size) throw unavailable();
  return keys;
}

// One bounded cache owned by the serving handler. Unknown kids never trigger
// refreshes; concurrent loads coalesce and failures back off, even under abuse.
export function createLocalOAuthVerifier() {
  let cache:
    | { issuer: string; until: number; keys: Map<string, CryptoKey> }
    | undefined;
  let pending:
    | { issuer: string; work: Promise<Map<string, CryptoKey>> }
    | undefined;
  let failure: { issuer: string; until: number } | undefined;
  async function keys(deps: NativeAuthDeps, issuer: string, now: number) {
    if (cache?.issuer === issuer && cache.until > now) return cache.keys;
    if (failure?.issuer === issuer && failure.until > now) throw unavailable();
    if (!pending || pending.issuer !== issuer) {
      const work = (async () => {
        try {
          const response = await (deps.fetch ?? fetch)(
            `${issuer}/.well-known/jwks.json`,
            {
              headers: { Accept: "application/json" },
              redirect: "error",
              signal: AbortSignal.timeout(4000),
            },
          );
          const loaded = await readKeys(response);
          cache = { issuer, until: now + 300_000, keys: loaded };
          failure = undefined;
          return loaded;
        } catch {
          failure = { issuer, until: now + 15_000 };
          throw unavailable();
        }
      })();
      pending = { issuer, work };
    }
    const current = pending;
    try {
      return await current.work;
    } finally {
      if (pending === current) pending = undefined;
    }
  }
  return async (token: string, deps: NativeAuthDeps): Promise<void> => {
    if (token.length > 16_384) throw unauthorized();
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0].length > 2048) throw unauthorized();
    const header = part(parts[0]);
    const claims = part(parts[1]);
    const config = nativeConfig(deps);
    const now = (deps.now ?? (() => new Date()))().getTime();
    const audience = typeof claims.aud === "string" ? [claims.aud] : claims.aud;
    const validAudience = Array.isArray(audience) && audience.length > 0 &&
      audience.every((value) => typeof value === "string") &&
      audience.includes(config.clientId);
    const validParty = claims.azp === config.clientId;
    if (
      header.alg !== "RS256" ||
      !["at+jwt", "application/at+jwt"].includes(String(header.typ)) ||
      typeof header.kid !== "string" ||
      !/^[A-Za-z0-9._-]{1,128}$/.test(header.kid) ||
      header.crit !== undefined || header.b64 !== undefined ||
      claims.iss !== config.issuer || claims.client_id !== config.clientId ||
      (!validAudience && !validParty) ||
      (claims.azp !== undefined && !validParty) ||
      (claims.aud !== undefined && !validAudience) ||
      typeof claims.sub !== "string" ||
      !/^user_[A-Za-z0-9_]{27}$/.test(claims.sub) ||
      !Number.isSafeInteger(claims.exp) || Number(claims.exp) <= now / 1000 ||
      (claims.nbf !== undefined &&
        (!Number.isSafeInteger(claims.nbf) || Number(claims.nbf) > now / 1000))
    ) {
      throw unauthorized();
    }
    const signature = bytes(parts[2]);
    if (signature.length > 1024) throw unauthorized();
    const key = (await keys(deps, config.issuer, now)).get(header.kid);
    if (
      !key ||
      !await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        signature,
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      )
    ) throw unauthorized();
  };
}
