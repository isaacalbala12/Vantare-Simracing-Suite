import { generateKeyPairSync, sign } from 'node:crypto';

export const fixedNow = Date.parse('2026-09-23T12:00:00Z');
export const env = {
  DASHBOARD_HOSTNAME: 'private.vantare.example',
  ACCESS_ISSUER: 'https://vantare-test.cloudflareaccess.com',
  ACCESS_AUD: '7d56f89c726e4033b775ad5384ab78ac',
  OWNER_EMAIL: 'owner@example.invalid',
  SUPABASE_URL: 'https://demo.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-secret',
  POLAR_REPORTING_CURRENCY: 'EUR',
  POLAR_PRODUCTION_METRICS_TOKEN: 'test-polar-production-token',
  POLAR_SANDBOX_METRICS_TOKEN: 'test-polar-sandbox-token',
};

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function token(claims = {}, header = {}) {
  const encodedHeader = encode({ alg: 'RS256', typ: 'JWT', kid: 'test-key', ...header });
  const encodedPayload = encode({
    iss: env.ACCESS_ISSUER,
    aud: env.ACCESS_AUD,
    email: env.OWNER_EMAIL,
    sub: 'owner-id',
    iat: Math.floor(fixedNow / 1000) - 30,
    exp: Math.floor(fixedNow / 1000) + 3600,
    ...claims,
  });
  const input = `${encodedHeader}.${encodedPayload}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
}

export function certsResponse() {
  return Response.json({ keys: [jwk] });
}

export function request(path = '/', jwt = token(), hostname = env.DASHBOARD_HOSTNAME) {
  return new Request(`https://${hostname}${path}`, { headers: { 'Cf-Access-Jwt-Assertion': jwt } });
}
