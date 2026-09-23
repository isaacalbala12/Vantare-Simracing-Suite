const MAX_TOKEN_LENGTH = 8192;
const MAX_PART_LENGTH = 6144;

function decodePart(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part) || part.length > MAX_PART_LENGTH) throw new Error('jwt_shape');
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(
    atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')),
    (char) => char.charCodeAt(0),
  );
  return bytes;
}

function decodeJson(part) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodePart(part)));
}

export function accessConfigReady(env) {
  return (
    typeof env.DASHBOARD_HOSTNAME === 'string' &&
    /^[a-z0-9.-]+$/.test(env.DASHBOARD_HOSTNAME) &&
    typeof env.ACCESS_ISSUER === 'string' &&
    /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER) &&
    typeof env.ACCESS_AUD === 'string' &&
    env.ACCESS_AUD.length > 10 &&
    typeof env.OWNER_EMAIL === 'string' &&
    /^[^\s@]+@[^\s@]+$/.test(env.OWNER_EMAIL)
  );
}

export async function verifyAccess(request, env, fetcher = fetch, now = Date.now()) {
  if (!accessConfigReady(env)) return false;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > MAX_TOKEN_LENGTH) return false;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = decodeJson(encodedHeader);
    const payload = decodeJson(encodedPayload);
    const seconds = Math.floor(now / 1000);
    if (
      !header ||
      header.alg !== 'RS256' ||
      typeof header.kid !== 'string' ||
      header.kid.length > 128
    )
      return false;
    if (!payload || payload.iss !== env.ACCESS_ISSUER) return false;
    if (
      !(
        payload.aud === env.ACCESS_AUD ||
        (Array.isArray(payload.aud) && payload.aud.includes(env.ACCESS_AUD))
      )
    )
      return false;
    if (!Number.isInteger(payload.exp) || payload.exp <= seconds) return false;
    if (payload.nbf !== undefined && (!Number.isInteger(payload.nbf) || payload.nbf > seconds + 30))
      return false;
    if (payload.iat !== undefined && (!Number.isInteger(payload.iat) || payload.iat > seconds + 30))
      return false;
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return false;
    if (
      typeof payload.email !== 'string' ||
      payload.email.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()
    )
      return false;

    const response = await fetcher(`${env.ACCESS_ISSUER}/cdn-cgi/access/certs`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const jwks = await response.json();
    const jwk =
      Array.isArray(jwks?.keys) && jwks.keys.length <= 20
        ? jwks.keys.find(
            (key) =>
              key?.kid === header.kid &&
              key.kty === 'RSA' &&
              (key.use === undefined || key.use === 'sig') &&
              (key.alg === undefined || key.alg === 'RS256'),
          )
        : null;
    if (!jwk) return false;
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      decodePart(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
  } catch {
    return false;
  }
}
