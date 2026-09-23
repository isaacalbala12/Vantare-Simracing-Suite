import { accessConfigReady, verifyAccess } from './access.js';
import { buildSnapshot, saveWeeklyEntry, setFeedbackStatus } from './sources.js';

const securityHeaders = {
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function readSmallJson(request) {
  const length = Number(request.headers.get('Content-Length'));
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return null;
  if (Number.isFinite(length) && length > 4096) return null;
  const body = await request.text();
  if (body.length > 4096) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export async function handleRequest(request, env, deps = {}) {
  const url = new URL(request.url);
  if (!accessConfigReady(env)) return reply({ error: 'configuration_unavailable' }, 503);
  if (url.hostname !== env.DASHBOARD_HOSTNAME) return reply({ error: 'not_found' }, 404);
  if (!(await verifyAccess(request, env, deps.fetcher ?? fetch, deps.now ?? Date.now()))) {
    return reply({ error: 'access_denied' }, 403);
  }

  if (url.pathname === '/api/snapshot' && request.method === 'GET') {
    const environment = url.searchParams.get('environment') ?? 'production';
    if (environment !== 'production' && environment !== 'sandbox')
      return reply({ error: 'invalid_environment' }, 400);
    return reply(
      await buildSnapshot(env, environment, deps.fetcher ?? fetch, deps.now ?? Date.now()),
    );
  }

  if (
    (url.pathname === '/api/weekly' || url.pathname === '/api/feedback/status') &&
    request.method === 'POST'
  ) {
    if (request.headers.get('Origin') !== url.origin) return reply({ error: 'origin_denied' }, 403);
    const body = await readSmallJson(request);
    if (!body) return reply({ error: 'invalid_body' }, 400);
    const result =
      url.pathname === '/api/weekly'
        ? await saveWeeklyEntry(env, body, deps.fetcher ?? fetch, deps.now ?? Date.now())
        : await setFeedbackStatus(env, body, deps.fetcher ?? fetch, deps.now ?? Date.now());
    return reply(result.body, result.status);
  }

  if (url.pathname.startsWith('/api/')) return reply({ error: 'not_found' }, 404);
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return reply({ error: 'method_not_allowed' }, 405);
  if (!env.ASSETS?.fetch) return reply({ error: 'assets_unavailable' }, 503);
  const asset = await env.ASSETS.fetch(request);
  const headers = new Headers(asset.headers);
  for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
