const SOURCE_STATUS = {
  measured: 'measured',
  unavailable: 'unavailable',
  notMeasured: 'not_measured',
};
const INTEGER_FIELDS = [
  'youtube_followers',
  'instagram_followers',
  'marketing_minutes',
  'qualified_visits',
  'first_sessions_confirmed',
];
const FEEDBACK_STATUSES = new Set(['new', 'reviewed', 'action_created', 'closed']);

function metric(value, source, observedAt, detail = '') {
  return { status: SOURCE_STATUS.measured, value, source, observedAt, detail };
}

function absent(status, source, detail) {
  return { status, value: null, source, observedAt: null, detail };
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function supabaseConfig(env) {
  try {
    const url = new URL(env.SUPABASE_URL);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.pathname !== '/')
      return null;
    if (typeof env.SUPABASE_SERVICE_ROLE_KEY !== 'string' || !env.SUPABASE_SERVICE_ROLE_KEY)
      return null;
    return { base: url.origin, token: env.SUPABASE_SERVICE_ROLE_KEY };
  } catch {
    return null;
  }
}

async function supabaseRequest(env, path, fetcher, options = {}) {
  const config = supabaseConfig(env);
  if (!config) throw new Error('supabase_unconfigured');
  const response = await fetcher(`${config.base}/rest/v1/${path}`, {
    method: options.method ?? 'GET',
    headers: {
      apikey: config.token,
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error('supabase_unavailable');
  return response;
}

async function readAccounts(env, fetcher) {
  const source = 'Supabase · identidad y dispositivos';
  try {
    const response = await supabaseRequest(env, 'rpc/intelligence_dashboard_snapshot', fetcher, {
      method: 'POST',
      body: {},
    });
    const data = await response.json();
    const keys = [
      'accounts_total',
      'accounts_new_30d',
      'accounts_signed_in_30d',
      'devices_total',
      'devices_seen_30d',
      'billing_legacy_subscriptions',
      'billing_production_subscriptions',
      'billing_sandbox_subscriptions',
    ];
    if (
      !data ||
      keys.some((key) => !nonnegativeInteger(data[key])) ||
      Number.isNaN(Date.parse(data.observed_at))
    )
      throw new Error('invalid_snapshot');
    return {
      status: SOURCE_STATUS.measured,
      observedAt: data.observed_at,
      accountsTotal: metric(
        data.accounts_total,
        source,
        data.observed_at,
        'Cuentas registradas; no equivale a uso de la app.',
      ),
      accountsNew30d: metric(
        data.accounts_new_30d,
        source,
        data.observed_at,
        'Altas de cuenta en los últimos 30 días.',
      ),
      signedIn30d: metric(
        data.accounts_signed_in_30d,
        source,
        data.observed_at,
        'Inicio de sesión, no sesión de simulación.',
      ),
      devicesSeen30d: metric(
        data.devices_seen_30d,
        source,
        data.observed_at,
        'Dispositivo visto; no demuestra un overlay activo.',
      ),
      billingLegacy: data.billing_legacy_subscriptions,
      billingProduction: data.billing_production_subscriptions,
      billingSandbox: data.billing_sandbox_subscriptions,
      latestBillingUpdate:
        typeof data.latest_billing_update === 'string' ? data.latest_billing_update : null,
    };
  } catch {
    return {
      status: SOURCE_STATUS.unavailable,
      observedAt: null,
      accountsTotal: absent(SOURCE_STATUS.unavailable, source, 'No se pudo verificar la fuente.'),
      accountsNew30d: absent(SOURCE_STATUS.unavailable, source, 'No se pudo verificar la fuente.'),
      signedIn30d: absent(SOURCE_STATUS.unavailable, source, 'No se pudo verificar la fuente.'),
      devicesSeen30d: absent(SOURCE_STATUS.unavailable, source, 'No se pudo verificar la fuente.'),
      billingLegacy: null,
      billingProduction: null,
      billingSandbox: null,
      latestBillingUpdate: null,
    };
  }
}

function validWeeklyRow(row) {
  return (
    row &&
    typeof row.week_start === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.week_start) &&
    INTEGER_FIELDS.every((field) => row[field] === null || nonnegativeInteger(row[field])) &&
    (row.source_note === null || typeof row.source_note === 'string') &&
    typeof row.updated_at === 'string' &&
    !Number.isNaN(Date.parse(row.updated_at))
  );
}

async function readGrowth(env, fetcher) {
  const source = 'Registro semanal manual';
  try {
    const response = await supabaseRequest(
      env,
      'intelligence_weekly_growth?select=week_start,youtube_followers,instagram_followers,marketing_minutes,qualified_visits,first_sessions_confirmed,source_note,updated_at&order=week_start.desc&limit=52',
      fetcher,
    );
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.some((row) => !validWeeklyRow(row)))
      throw new Error('invalid_growth');
    const ordered = rows.sort((a, b) => a.week_start.localeCompare(b.week_start));
    const hasSessions = ordered.some((row) => row.first_sessions_confirmed !== null);
    const hasVisits = ordered.some((row) => row.qualified_visits !== null);
    const observedAt = ordered.at(-1)?.updated_at ?? null;
    return {
      status: ordered.length ? SOURCE_STATUS.measured : SOURCE_STATUS.notMeasured,
      observedAt,
      entries: ordered,
      firstSessions: hasSessions
        ? metric(
            ordered.reduce((sum, row) => sum + (row.first_sessions_confirmed ?? 0), 0),
            source,
            observedAt,
            'Confirmaciones manuales de primera sesión; cobertura de 52 semanas como máximo.',
          )
        : absent(SOURCE_STATUS.notMeasured, source, 'Aún no hay confirmaciones semanales.'),
      qualifiedVisits: hasVisits
        ? metric(
            ordered.reduce((sum, row) => sum + (row.qualified_visits ?? 0), 0),
            source,
            observedAt,
            'Visitas introducidas manualmente; cobertura de 52 semanas como máximo.',
          )
        : absent(SOURCE_STATUS.notMeasured, source, 'Aún no hay visitas registradas.'),
    };
  } catch {
    return {
      status: SOURCE_STATUS.unavailable,
      observedAt: null,
      entries: [],
      firstSessions: absent(SOURCE_STATUS.unavailable, source, 'No se pudo verificar la fuente.'),
      qualifiedVisits: absent(SOURCE_STATUS.unavailable, source, 'No se pudo verificar la fuente.'),
    };
  }
}

function polarAbsent(environment, detail) {
  const source = `Polar · ${environment}`;
  const unavailable = absent(SOURCE_STATUS.unavailable, source, detail);
  return {
    status: SOURCE_STATUS.unavailable,
    currency: null,
    mrrCents: unavailable,
    activeSubscriptions: unavailable,
    netRevenue30dCents: unavailable,
    oneTimeNet30dCents: unavailable,
  };
}

export async function readPolar(env, environment, fetcher = fetch, now = Date.now()) {
  const token =
    environment === 'production'
      ? env.POLAR_PRODUCTION_METRICS_TOKEN
      : env.POLAR_SANDBOX_METRICS_TOKEN;
  const currency = env.POLAR_REPORTING_CURRENCY;
  if (
    typeof token !== 'string' ||
    !token ||
    typeof currency !== 'string' ||
    !/^[A-Z]{3}$/.test(currency)
  ) {
    return polarAbsent(environment, 'Token de métricas o moneda de Polar sin configurar.');
  }
  const base =
    environment === 'production' ? 'https://api.polar.sh/v1' : 'https://sandbox-api.polar.sh/v1';
  const end = new Date(now);
  const start = new Date(now - 29 * 86400000);
  const params = new URLSearchParams({
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    interval: 'day',
    timezone: 'UTC',
  });
  try {
    const response = await fetcher(`${base}/metrics/?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error('polar_unavailable');
    const data = await response.json();
    if (!Array.isArray(data?.periods) || data.periods.length === 0 || !data.totals)
      throw new Error('polar_shape');
    const latest = [...data.periods]
      .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
      .at(-1);
    if (
      Number.isNaN(Date.parse(latest?.timestamp)) ||
      !nonnegativeInteger(latest?.monthly_recurring_revenue) ||
      !nonnegativeInteger(latest?.active_subscriptions)
    )
      throw new Error('polar_current_shape');
    const source = `Polar API · ${environment}`;
    const cash = Number.isSafeInteger(data.totals.net_revenue)
      ? metric(
          data.totals.net_revenue,
          source,
          end.toISOString(),
          'Cobros netos que Polar atribuye a la ventana de 30 días; céntimos.',
        )
      : absent(SOURCE_STATUS.unavailable, source, 'Polar no devolvió cobros netos verificables.');
    const oneTime = Number.isSafeInteger(data.totals.one_time_products_net_revenue)
      ? metric(
          data.totals.one_time_products_net_revenue,
          source,
          end.toISOString(),
          'Compras únicas netas de 30 días; fuera del MRR.',
        )
      : absent(
          SOURCE_STATUS.unavailable,
          source,
          'Polar no devolvió compras únicas netas verificables.',
        );
    return {
      status: SOURCE_STATUS.measured,
      currency,
      mrrCents: metric(
        latest.monthly_recurring_revenue,
        source,
        latest.timestamp,
        'MRR comunicado por Polar; no procede de precios nominales ni de suscripciones legacy.',
      ),
      activeSubscriptions: metric(
        latest.active_subscriptions,
        source,
        latest.timestamp,
        'Suscripciones activas comunicadas por Polar.',
      ),
      netRevenue30dCents: cash,
      oneTimeNet30dCents: oneTime,
    };
  } catch {
    return polarAbsent(environment, 'No se pudo leer una respuesta válida de Polar.');
  }
}

async function readFeedback(env, fetcher, now) {
  const source = 'Opiniones explícitas · Supabase';
  const cutoff = new Date(now).toISOString();
  try {
    const path = `product_feedback?select=id,category,message,app_version,channel,reply_opt_in,triage_status,created_at,expires_at&expires_at=gt.${encodeURIComponent(cutoff)}&order=created_at.desc&limit=25`;
    const response = await supabaseRequest(env, path, fetcher, { prefer: 'count=exact' });
    const rows = await response.json();
    if (
      !Array.isArray(rows) ||
      rows.some(
        (row) =>
          typeof row.id !== 'string' ||
          typeof row.message !== 'string' ||
          row.message.length > 2000 ||
          !FEEDBACK_STATUSES.has(row.triage_status),
      )
    )
      throw new Error('feedback_shape');
    const totalMatch = response.headers.get('Content-Range')?.match(/\/(\d+)$/);
    const total = totalMatch ? Number(totalMatch[1]) : null;
    let newCount = null;
    try {
      const countResponse = await supabaseRequest(
        env,
        `product_feedback?select=id&triage_status=eq.new&expires_at=gt.${encodeURIComponent(cutoff)}`,
        fetcher,
        { method: 'HEAD', prefer: 'count=exact' },
      );
      const newMatch = countResponse.headers.get('Content-Range')?.match(/\/(\d+)$/);
      newCount = newMatch ? Number(newMatch[1]) : null;
    } catch {
      // Keep the readable inbox available when only the count request fails.
    }
    return {
      status: SOURCE_STATUS.measured,
      source,
      observedAt: new Date(now).toISOString(),
      total: nonnegativeInteger(total) ? total : null,
      newCount: nonnegativeInteger(newCount) ? newCount : null,
      entries: rows.map((row) => ({
        id: row.id,
        category: row.category,
        message: row.message,
        appVersion: row.app_version,
        channel: row.channel,
        replyOptIn: row.reply_opt_in,
        status: row.triage_status,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      })),
    };
  } catch {
    return {
      status: SOURCE_STATUS.unavailable,
      source,
      observedAt: null,
      total: null,
      newCount: null,
      entries: [],
    };
  }
}

export async function buildSnapshot(env, environment, fetcher = fetch, now = Date.now()) {
  const [accounts, growth, polar, feedback] = await Promise.all([
    readAccounts(env, fetcher),
    readGrowth(env, fetcher),
    readPolar(env, environment, fetcher, now),
    readFeedback(env, fetcher, now),
  ]);
  return {
    generatedAt: new Date(now).toISOString(),
    environment,
    accounts,
    growth,
    polar,
    feedback,
    returnD7to13: absent(
      SOURCE_STATUS.notMeasured,
      'Uso consentido o confirmación de cohorte',
      'Todavía no existe una fuente de sesiones repetidas verificadas.',
    ),
    goals: {
      firstMonthSessions: 10,
      day90Sessions: 45,
      day90QualifiedVisits: 300,
      matureReturnTargetPct: 35,
      weeklyMarketingMinutes: 360,
    },
  };
}

export function validateWeeklyEntry(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const date = input.week_start;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date ||
    parsed.getUTCDay() !== 1
  )
    return null;
  if (parsed.getTime() > now + 86400000 || parsed.getTime() < now - 366 * 86400000)
    return null;
  const row = { week_start: date };
  for (const field of INTEGER_FIELDS) {
    const value = input[field] ?? null;
    if (
      value !== null &&
      (!nonnegativeInteger(value) || value > (field === 'marketing_minutes' ? 10080 : 10000000))
    )
      return null;
    row[field] = value;
  }
  if (INTEGER_FIELDS.every((field) => row[field] === null)) return null;
  if (
    input.source_note !== undefined &&
    input.source_note !== null &&
    typeof input.source_note !== 'string'
  )
    return null;
  const note = input.source_note?.trim() ?? null;
  if (note && note.length > 300) return null;
  row.source_note = note || null;
  row.updated_at = new Date(now).toISOString();
  return row;
}

export async function saveWeeklyEntry(env, input, fetcher = fetch, now = Date.now()) {
  const row = validateWeeklyEntry(input, now);
  if (!row) return { status: 400, body: { error: 'invalid_weekly_entry' } };
  try {
    await supabaseRequest(env, 'intelligence_weekly_growth?on_conflict=week_start', fetcher, {
      method: 'POST',
      body: row,
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
    return { status: 200, body: { saved: true, weekStart: row.week_start } };
  } catch {
    return { status: 503, body: { error: 'source_unavailable' } };
  }
}

export async function setFeedbackStatus(env, input, fetcher = fetch, now = Date.now()) {
  if (
    !input ||
    typeof input !== 'object' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id) ||
    !FEEDBACK_STATUSES.has(input.status)
  ) {
    return { status: 400, body: { error: 'invalid_feedback_update' } };
  }
  try {
    const cutoff = encodeURIComponent(new Date(now).toISOString());
    const response = await supabaseRequest(
      env,
      `product_feedback?id=eq.${input.id}&expires_at=gt.${cutoff}&select=id,triage_status`,
      fetcher,
      {
        method: 'PATCH',
        body: { triage_status: input.status },
        prefer: 'return=representation',
      },
    );
    const rows = await response.json();
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      rows[0].id !== input.id ||
      rows[0].triage_status !== input.status
    ) {
      return { status: 404, body: { error: 'feedback_not_found' } };
    }
    return { status: 200, body: { saved: true } };
  } catch {
    return { status: 503, body: { error: 'source_unavailable' } };
  }
}
