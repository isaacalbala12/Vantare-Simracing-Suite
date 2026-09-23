const labels = {
  overview: 'Resumen',
  product: 'Producto',
  business: 'Negocio',
  feedback: 'Opiniones',
  growth: 'Crecimiento',
  market: 'Mercado',
};
const feedbackStatusLabels = {
  new: 'Nueva',
  reviewed: 'Revisada',
  action_created: 'Acción creada',
  closed: 'Cerrada',
};
const feedbackCategoryLabels = { problem: 'Problema', idea: 'Idea', experience: 'Experiencia' };
const numberFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
let snapshot = null;
let requestSequence = 0;

function node(id) {
  return document.getElementById(id);
}
function put(id, value) {
  node(id).textContent = value;
}
function count(value) {
  return numberFormat.format(value);
}
function date(value) {
  if (!value || Number.isNaN(Date.parse(value))) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
function money(cents, currency) {
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${count(cents / 100)} ${currency ?? ''}`;
  }
}
function showMetric(value, id, stateId, formatter = count) {
  if (value?.status === 'measured' && value.value !== null) {
    put(id, formatter(value.value));
    put(stateId, `${value.source} · ${date(value.observedAt)}`);
    node(id).title = value.detail ?? '';
  } else {
    put(id, '—');
    put(stateId, value?.status === 'not_measured' ? 'Sin medir todavía' : 'Fuente no disponible');
    node(id).title = value?.detail ?? '';
  }
}

function sourceRow(name, status, stamp) {
  const row = document.createElement('div');
  const label = document.createElement('span');
  label.textContent = name;
  const state = document.createElement('strong');
  state.className =
    status === 'measured'
      ? 'is-measured'
      : status === 'not_measured'
        ? 'is-not-measured'
        : 'is-unavailable';
  state.textContent =
    status === 'measured'
      ? `Disponible · ${date(stamp)}`
      : status === 'not_measured'
        ? 'Aún sin medir'
        : 'No disponible';
  row.append(label, state);
  return row;
}

function renderOverview(data) {
  put('generated-at', date(data.generatedAt));
  put('environment-stamp', data.environment === 'production' ? 'Producción' : 'Pruebas');
  showMetric(
    data.returnD7to13,
    'overview-return',
    'overview-return-state',
    (value) => `${value} %`,
  );
  showMetric(data.polar.mrrCents, 'overview-mrr', 'overview-mrr-state', (value) =>
    money(value, data.polar.currency),
  );
  showMetric(data.growth.firstSessions, 'overview-sessions', 'overview-sessions-state');
  if (data.feedback.status === 'measured' && data.feedback.newCount !== null) {
    put('overview-feedback', count(data.feedback.newCount));
    put('overview-feedback-state', `Opiniones explícitas · ${date(data.feedback.observedAt)}`);
  } else {
    put('overview-feedback', '—');
    put(
      'overview-feedback-state',
      data.feedback.status === 'measured' ? 'Recuento pendiente' : 'Fuente no disponible',
    );
  }
  const list = node('source-list');
  list.replaceChildren(
    sourceRow(
      'Cuentas y señales operativas · Supabase',
      data.accounts.status,
      data.accounts.observedAt,
    ),
    sourceRow(
      `Negocio · Polar ${data.environment === 'production' ? 'producción' : 'pruebas'}`,
      data.polar.status,
      data.polar.mrrCents?.observedAt,
    ),
    sourceRow('Opiniones voluntarias', data.feedback.status, data.feedback.observedAt),
    sourceRow('Registro semanal manual', data.growth.status, data.growth.observedAt),
    sourceRow('Retorno de pilotos D7–13', data.returnD7to13.status, null),
  );
}

function renderProduct(data) {
  showMetric(data.accounts.accountsTotal, 'product-accounts', 'product-accounts-state');
  showMetric(data.accounts.accountsNew30d, 'product-new', 'product-new-state');
  showMetric(data.accounts.signedIn30d, 'product-signins', 'product-signins-state');
  showMetric(data.accounts.devicesSeen30d, 'product-devices', 'product-devices-state');
  put(
    'funnel-visits',
    data.growth.qualifiedVisits.status === 'measured'
      ? count(data.growth.qualifiedVisits.value)
      : 'Sin medir',
  );
  put(
    'funnel-sessions',
    data.growth.firstSessions.status === 'measured'
      ? count(data.growth.firstSessions.value)
      : 'Sin medir',
  );
  put(
    'funnel-return',
    data.returnD7to13.status === 'measured' ? `${data.returnD7to13.value} %` : 'Sin medir',
  );
}

function renderBusiness(data) {
  const currency = data.polar.currency;
  showMetric(data.polar.mrrCents, 'business-mrr', 'business-mrr-state', (value) =>
    money(value, currency),
  );
  showMetric(data.polar.activeSubscriptions, 'business-subs', 'business-subs-state');
  showMetric(data.polar.netRevenue30dCents, 'business-net', 'business-net-state', (value) =>
    money(value, currency),
  );
  showMetric(data.polar.oneTimeNet30dCents, 'business-onetime', 'business-onetime-state', (value) =>
    money(value, currency),
  );
  put(
    'business-legacy',
    data.accounts.billingLegacy === null ? '—' : count(data.accounts.billingLegacy),
  );
  put(
    'business-projection-production',
    data.accounts.billingProduction === null ? '—' : count(data.accounts.billingProduction),
  );
  put(
    'business-projection-sandbox',
    data.accounts.billingSandbox === null ? '—' : count(data.accounts.billingSandbox),
  );
  put('business-projection-date', date(data.accounts.latestBillingUpdate));
}

function element(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

async function updateFeedbackStatus(id, status) {
  const response = await fetch('/api/feedback/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }),
  });
  if (!response.ok) throw new Error('No se pudo actualizar la opinión.');
  await loadSnapshot();
}

function renderFeedback(data) {
  const { feedback } = data;
  put(
    'feedback-count',
    feedback.status === 'measured' && feedback.total !== null ? count(feedback.total) : '—',
  );
  const list = node('feedback-list');
  list.replaceChildren();
  const filter = node('feedback-filter').value;
  if (feedback.status !== 'measured') {
    put(
      'feedback-empty',
      'La bandeja aún no está disponible. Se activará al integrar la recogida de opiniones en la app.',
    );
    node('feedback-empty').hidden = false;
    return;
  }
  const entries = feedback.entries.filter((entry) => filter === 'all' || entry.status === filter);
  node('feedback-empty').hidden = entries.length > 0;
  put(
    'feedback-empty',
    feedback.entries.length === 0
      ? 'Aún no hay opiniones enviadas.'
      : 'No hay opiniones recientes con este estado.',
  );
  for (const entry of entries) {
    const card = element('article', 'feedback-item');
    const head = element('div', 'feedback-item__head');
    head.append(
      element('strong', '', feedbackCategoryLabels[entry.category] ?? 'Opinión'),
      element('span', '', date(entry.createdAt)),
    );
    const message = element('p', '', entry.message);
    const foot = element('div', 'feedback-item__foot');
    const meta = element(
      'span',
      'feedback-item__meta',
      `Versión ${entry.appVersion ?? 'desconocida'} · ${entry.channel ?? 'canal desconocido'} · ${entry.replyOptIn ? 'permite respuesta' : 'sin permiso de respuesta'}`,
    );
    const label = element('label', '', 'Estado');
    const select = element('select');
    select.setAttribute('aria-label', `Estado de opinión ${entry.id}`);
    for (const [value, text] of Object.entries(feedbackStatusLabels)) {
      const option = element('option', '', text);
      option.value = value;
      select.append(option);
    }
    select.value = entry.status;
    select.addEventListener('change', async () => {
      select.disabled = true;
      try {
        await updateFeedbackStatus(entry.id, select.value);
      } catch {
        select.value = entry.status;
        alert('No se pudo guardar el estado. Inténtalo de nuevo.');
      } finally {
        select.disabled = false;
      }
    });
    label.append(select);
    foot.append(meta, label);
    card.append(head, message, foot);
    list.append(card);
  }
}

function cell(row, value) {
  row.append(element('td', '', value));
}
function renderGrowth(data) {
  const tbody = node('weekly-rows');
  tbody.replaceChildren();
  if (data.growth.status !== 'measured' || data.growth.entries.length === 0) {
    const tr = element('tr');
    const td = element(
      'td',
      '',
      data.growth.status === 'unavailable'
        ? 'Fuente no disponible.'
        : 'Aún no hay semanas registradas.',
    );
    td.colSpan = 6;
    tr.append(td);
    tbody.append(tr);
    return;
  }
  for (const entry of [...data.growth.entries].reverse().slice(0, 14)) {
    const tr = element('tr');
    cell(tr, entry.week_start);
    cell(tr, entry.youtube_followers === null ? '—' : count(entry.youtube_followers));
    cell(tr, entry.instagram_followers === null ? '—' : count(entry.instagram_followers));
    cell(tr, entry.marketing_minutes === null ? '—' : `${count(entry.marketing_minutes)} min`);
    cell(tr, entry.qualified_visits === null ? '—' : count(entry.qualified_visits));
    cell(tr, entry.first_sessions_confirmed === null ? '—' : count(entry.first_sessions_confirmed));
    tbody.append(tr);
  }
}

function render(data) {
  snapshot = data;
  renderOverview(data);
  renderProduct(data);
  renderBusiness(data);
  renderFeedback(data);
  renderGrowth(data);
}

async function loadSnapshot() {
  const sequence = ++requestSequence;
  put('load-state', 'Consultando fuentes verificadas…');
  const environment = node('environment').value;
  try {
    const response = await fetch(`/api/snapshot?environment=${environment}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo abrir la consola privada.');
    const data = await response.json();
    if (sequence !== requestSequence) return;
    render(data);
    put(
      'load-state',
      `Lectura del ${date(data.generatedAt)} · ${environment === 'production' ? 'producción' : 'pruebas'}.`,
    );
  } catch {
    if (sequence === requestSequence)
      put('load-state', 'No se pudo verificar el acceso o las fuentes. Vuelve a actualizar.');
  }
}

function selectView(view) {
  if (!labels[view]) view = 'overview';
  for (const [key] of Object.entries(labels)) {
    const section = node(`view-${key}`);
    section.hidden = key !== view;
    section.classList.toggle('is-visible', key === view);
  }
  for (const button of document.querySelectorAll('[data-view]')) {
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    if (active) {
      button.setAttribute('aria-current', 'page');
      button.scrollIntoView({ block: 'nearest', inline: 'center' });
    } else button.removeAttribute('aria-current');
  }
  put('page-title', labels[view]);
  history.replaceState(null, '', `#${view}`);
}

function mondayLocal() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  today.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function renderScenario() {
  const form = node('scenario-form');
  const data = new FormData(form);
  const visits = Number(data.get('visits'));
  const activation = Number(data.get('activation')) / 100;
  const returning = Number(data.get('return')) / 100;
  const payment = Number(data.get('payment')) / 100;
  if (
    ![visits, activation, returning, payment].every(Number.isFinite) ||
    visits < 0 ||
    [activation, returning, payment].some((value) => value < 0 || value > 1)
  )
    return;
  const sessions = visits * activation;
  const subscribers = sessions * returning * payment * 0.75;
  put('scenario-sessions', count(Math.round(sessions)));
  put(
    'scenario-subs',
    new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(subscribers),
  );
  put('scenario-mrr', money(Math.round(subscribers * 649), 'EUR'));
}

async function saveWeek(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type=submit]');
  const data = new FormData(form);
  const body = { week_start: data.get('week_start'), source_note: data.get('source_note') };
  for (const field of [
    'youtube_followers',
    'instagram_followers',
    'marketing_minutes',
    'qualified_visits',
    'first_sessions_confirmed',
  ]) {
    const raw = data.get(field);
    body[field] = raw === '' ? null : Number(raw);
  }
  button.disabled = true;
  put('weekly-message', 'Guardando…');
  try {
    const response = await fetch('/api/weekly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('save_failed');
    put('weekly-message', 'Semana guardada. Los datos son manuales y quedan fechados.');
    await loadSnapshot();
  } catch {
    put('weekly-message', 'No se pudo guardar. Revisa la semana y vuelve a intentarlo.');
  } finally {
    button.disabled = false;
  }
}

for (const button of document.querySelectorAll('[data-view]'))
  button.addEventListener('click', () => selectView(button.dataset.view));
node('refresh').addEventListener('click', loadSnapshot);
node('environment').addEventListener('change', loadSnapshot);
node('feedback-filter').addEventListener('change', () => {
  if (snapshot) renderFeedback(snapshot);
});
node('weekly-form').addEventListener('submit', saveWeek);
node('weekly-form').elements.week_start.value = mondayLocal();
node('scenario-form').addEventListener('input', renderScenario);
selectView(location.hash.slice(1));
renderScenario();
loadSnapshot();
