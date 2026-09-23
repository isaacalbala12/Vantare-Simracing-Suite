import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyAccess } from '../src/access.js';
import { handleRequest } from '../src/index.js';
import { certsResponse, env, fixedNow, request, token } from './helpers.js';

test('Cloudflare Access validates signature, issuer, audience, time and exact owner', async () => {
  const fetcher = async () => certsResponse();
  assert.equal(await verifyAccess(request(), env, fetcher, fixedNow), true);
  for (const claims of [
    { iss: 'https://other.cloudflareaccess.com' },
    { aud: 'wrong-audience' },
    { email: 'somebody@example.invalid' },
    { exp: Math.floor(fixedNow / 1000) - 1 },
    { nbf: Math.floor(fixedNow / 1000) + 120 },
  ]) {
    assert.equal(await verifyAccess(request('/', token(claims)), env, fetcher, fixedNow), false);
  }
  const forged = token().slice(0, -2) + 'aa';
  assert.equal(await verifyAccess(request('/', forged), env, fetcher, fixedNow), false);
  assert.equal(
    await verifyAccess(request('/', token({}, { alg: 'none' })), env, fetcher, fixedNow),
    false,
  );
});

test('host check and Access protect assets as well as API', async () => {
  let assetsRead = 0;
  let jwksRead = 0;
  const fakeEnv = {
    ...env,
    ASSETS: {
      fetch: async () => {
        assetsRead++;
        return new Response('private page', { headers: { 'Content-Type': 'text/html' } });
      },
    },
  };
  const fetcher = async () => {
    jwksRead++;
    return certsResponse();
  };
  const direct = await handleRequest(
    request('/', token(), 'vantare-intelligence-private.workers.dev'),
    fakeEnv,
    { fetcher, now: fixedNow },
  );
  assert.equal(direct.status, 404);
  const missing = await handleRequest(new Request('https://private.vantare.example/'), fakeEnv, {
    fetcher,
    now: fixedNow,
  });
  assert.equal(missing.status, 403);
  const wrong = await handleRequest(
    request('/', token({ email: 'other@example.invalid' })),
    fakeEnv,
    { fetcher, now: fixedNow },
  );
  assert.equal(wrong.status, 403);
  assert.equal(assetsRead, 0);
  assert.equal(jwksRead, 0);
  const good = await handleRequest(request('/'), fakeEnv, { fetcher, now: fixedNow });
  assert.equal(good.status, 200);
  assert.equal(await good.text(), 'private page');
  assert.equal(good.headers.get('Cache-Control'), 'private, no-store');
  assert.match(good.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal(assetsRead, 1);
  assert.equal(jwksRead, 1);
});

test('write endpoints require same-origin JSON after Access', async () => {
  let upstream = 0;
  const fetcher = async () => {
    upstream++;
    return certsResponse();
  };
  const post = (origin, contentType = 'application/json') =>
    new Request('https://private.vantare.example/api/weekly', {
      method: 'POST',
      headers: { 'Cf-Access-Jwt-Assertion': token(), Origin: origin, 'Content-Type': contentType },
      body: JSON.stringify({ week_start: '2026-09-21' }),
    });
  assert.equal(
    (await handleRequest(post('https://evil.example'), env, { fetcher, now: fixedNow })).status,
    403,
  );
  assert.equal(
    (
      await handleRequest(post('https://private.vantare.example', 'text/plain'), env, {
        fetcher,
        now: fixedNow,
      })
    ).status,
    400,
  );
  assert.equal(upstream, 2);
});
