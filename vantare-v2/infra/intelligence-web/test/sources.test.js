import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSnapshot,
  readPolar,
  saveWeeklyEntry,
  setFeedbackStatus,
  validateWeeklyEntry,
} from '../src/sources.js';
import { env, fixedNow } from './helpers.js';

test('source failures stay unavailable while valid zero stays measured', async () => {
  const fetcher = async (url) => {
    if (url.includes('rpc/intelligence_dashboard_snapshot'))
      return Response.json({
        observed_at: '2026-09-23T12:00:00Z',
        accounts_total: 8,
        accounts_new_30d: 0,
        accounts_signed_in_30d: 1,
        devices_total: 4,
        devices_seen_30d: 2,
        billing_legacy_subscriptions: 3,
        billing_production_subscriptions: 0,
        billing_sandbox_subscriptions: 0,
        latest_billing_update: '2026-07-09T12:00:00Z',
      });
    if (url.includes('intelligence_weekly_growth')) return Response.json([]);
    return new Response('unavailable', { status: 503 });
  };
  const result = await buildSnapshot(env, 'production', fetcher, fixedNow);
  assert.equal(result.accounts.accountsTotal.value, 8);
  assert.equal(result.accounts.accountsNew30d.value, 0);
  assert.equal(result.growth.firstSessions.status, 'not_measured');
  assert.equal(result.polar.mrrCents.status, 'unavailable');
  assert.equal(result.feedback.status, 'unavailable');
  assert.equal(result.returnD7to13.status, 'not_measured');
  assert.equal(result.accounts.billingLegacy, 3);
});

test('feedback inbox remains visible if its separate new-count request fails', async () => {
  const fetcher = async (url, options) => {
    if (url.includes('rpc/intelligence_dashboard_snapshot')) return new Response('down', { status: 503 });
    if (url.includes('intelligence_weekly_growth')) return Response.json([]);
    if (url.includes('product_feedback') && options.method === 'HEAD')
      return new Response(null, { status: 503 });
    if (url.includes('product_feedback'))
      return Response.json(
        [
          {
            id: '3455a98c-0fb9-4a0d-8020-4df44c92c88b',
            category: 'idea',
            message: 'Una mejora concreta para el overlay',
            app_version: '1.2.3',
            channel: 'stable',
            reply_opt_in: false,
            triage_status: 'new',
            created_at: '2026-09-23T00:00:00Z',
            expires_at: '2027-03-22T00:00:00Z',
          },
        ],
        { headers: { 'Content-Range': '0-0/1' } },
      );
    return new Response('down', { status: 503 });
  };
  const result = await buildSnapshot(env, 'production', fetcher, fixedNow);
  assert.equal(result.feedback.status, 'measured');
  assert.equal(result.feedback.total, 1);
  assert.equal(result.feedback.newCount, null);
  assert.equal(result.feedback.entries.length, 1);
});

test('Polar production and sandbox remain separate and only API metrics set MRR', async () => {
  const urls = [];
  const fetcher = async (url) => {
    urls.push(url);
    return Response.json({
      periods: [
        {
          timestamp: '2026-09-23T00:00:00Z',
          monthly_recurring_revenue: 0,
          active_subscriptions: 0,
        },
      ],
      totals: { net_revenue: 0, one_time_products_net_revenue: 0 },
    });
  };
  const production = await readPolar(env, 'production', fetcher, fixedNow);
  const sandbox = await readPolar(env, 'sandbox', fetcher, fixedNow);
  assert.equal(production.mrrCents.status, 'measured');
  assert.equal(production.mrrCents.value, 0);
  assert.equal(production.netRevenue30dCents.value, 0);
  assert.equal(sandbox.mrrCents.value, 0);
  assert.match(urls[0], /^https:\/\/api\.polar\.sh\/v1\/metrics\/\?/);
  assert.match(urls[1], /^https:\/\/sandbox-api\.polar\.sh\/v1\/metrics\/\?/);
});

test('weekly entry validates Monday, bounds and real missing values', async () => {
  const valid = {
    week_start: '2026-09-21',
    youtube_followers: 2360,
    instagram_followers: null,
    marketing_minutes: 360,
    qualified_visits: 0,
    first_sessions_confirmed: null,
    source_note: '  Revisión semanal ',
  };
  assert.equal(validateWeeklyEntry(valid, fixedNow).source_note, 'Revisión semanal');
  assert.equal(validateWeeklyEntry({ ...valid, week_start: '2026-09-22' }, fixedNow), null);
  assert.equal(
    validateWeeklyEntry({ ...valid, week_start: '2026-09-28' }, fixedNow),
    null,
  );
  assert.equal(validateWeeklyEntry({ ...valid, youtube_followers: -1 }, fixedNow), null);
  assert.equal(validateWeeklyEntry({ week_start: '2026-09-21' }, fixedNow), null);
  let sent;
  const fetcher = async (url, options) => {
    sent = { url, options };
    return new Response(null, { status: 201 });
  };
  const saved = await saveWeeklyEntry(env, valid, fetcher, fixedNow);
  assert.equal(saved.status, 200);
  assert.equal(JSON.parse(sent.options.body).first_sessions_confirmed, null);
  assert.match(sent.url, /intelligence_weekly_growth/);
});

test('feedback triage changes only a current row with a verified id', async () => {
  const id = '3455a98c-0fb9-4a0d-8020-4df44c92c88b';
  let request;
  const fetcher = async (url, options) => {
    request = { url, options };
    return Response.json([{ id, triage_status: 'reviewed' }]);
  };
  assert.equal(
    (await setFeedbackStatus(env, { id: 'bad', status: 'reviewed' }, fetcher, fixedNow)).status,
    400,
  );
  const changed = await setFeedbackStatus(env, { id, status: 'reviewed' }, fetcher, fixedNow);
  assert.equal(changed.status, 200);
  assert.equal(request.options.method, 'PATCH');
  assert.deepEqual(JSON.parse(request.options.body), { triage_status: 'reviewed' });
  assert.match(request.url, /expires_at=gt\./);
});
