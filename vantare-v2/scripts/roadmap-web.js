// Public-site integration. await mountRoadmap(root, config) returns cleanup.
const mounts = new WeakMap();
const lanes = [['next', 'Planeado'], ['now', 'En marcha'], ['done', 'Hecho']];
const encoder = new TextEncoder();
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const text = (value, limit) => typeof value === 'string' && Array.from(value).length <= limit && !value.includes('\0');
function validate(raw) {
  if (encoder.encode(raw).length > 56 * 1024) throw new Error('Too large');
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('No publication');
  const publication = rows[0];
  const doc = publication.document;
  if (!uuid(publication.id) || !text(publication.published_at, 40) || !Number.isFinite(Date.parse(publication.published_at)) ||
      ![1, 2].includes(doc?.schemaVersion) || !Array.isArray(doc.items) || doc.items.length > 40 ||
      encoder.encode(JSON.stringify(doc)).length > 40000) throw new Error('Invalid');
  const ids = new Set();
  for (const item of doc.items) {
    if (!uuid(item.id) || ids.has(item.id) || !['next', 'now', 'later', 'done'].includes(item.section) ||
        !text(item.title?.es, 120) || !item.title.es.trim() ||
        !['es', 'en', 'pt', 'it'].every(lang => text(item.title?.[lang], 120) && text(item.body?.[lang], 600)) ||
        (doc.schemaVersion === 2 && (!text(item.area, 60) || !item.area.trim())) ||
        (item.version != null && (!text(item.version, 60) || !/^[a-zA-Z0-9.-]+$/.test(item.version))) ||
        (item.dueDate != null && (!/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate) || !Number.isFinite(Date.parse(item.dueDate)) ||
          new Date(item.dueDate).toISOString().slice(0, 10) !== item.dueDate))) throw new Error('Invalid item');
    ids.add(item.id);
  }
  return doc;
}
function board(doc, language) {
  const root = document.createElement('div');
  root.className = 'vantare-roadmap';
  root.style.display = 'flex';
  root.style.flexWrap = 'wrap';
  root.style.gap = '1rem';
  for (const [section, label] of lanes) {
    const lane = document.createElement('section');
    lane.setAttribute('aria-label', label);
    lane.style.flex = '1 1 16rem';
    lane.style.minWidth = '0';
    const heading = document.createElement('h2');
    heading.textContent = label;
    lane.append(heading);
    const items = doc.items.filter(item => item.section === section || (section === 'next' && item.section === 'later'));
    for (const item of items) {
      const card = document.createElement('article');
      const title = document.createElement('h3');
      title.textContent = item.title[language] || item.title.es;
      const note = document.createElement('p');
      note.textContent = item.body[language] || item.body.es;
      card.append(title, note);
      lane.append(card);
    }
    if (!items.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Sin hitos publicados';
      lane.append(empty);
    }
    root.append(lane);
  }
  return root;
}
export async function mountRoadmap(element, { supabaseUrl, anonKey, language = 'es' }) {
  mounts.get(element)?.();
  let disposed = false, busy = false, hasPublication = false, timer;
  const controller = new AbortController();
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const dispose = () => {
    disposed = true;
    clearInterval(timer);
    controller.abort();
    globalThis.removeEventListener?.('pagehide', dispose);
    if (mounts.get(element) === dispose) mounts.delete(element);
  };
  mounts.set(element, dispose);
  globalThis.addEventListener?.('pagehide', dispose, { once: true });
  element.textContent = 'Cargando roadmap…';
  let url;
  try {
    url = new URL(supabaseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !anonKey) throw new Error('Unconfigured');
  } catch {
    element.textContent = 'Roadmap no disponible. Vuelve a intentarlo.';
    dispose();
    return dispose;
  }
  const refresh = async () => {
    if (disposed || busy || document.hidden) return;
    if (!element.isConnected) { dispose(); return; }
    busy = true;
    try {
      const response = await fetch(new URL('/rest/v1/rpc/visual_roadmap_current_v2', url), {
        method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        credentials: 'omit', redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)])
      });
      if (!response.ok) throw new Error('Unavailable');
      const doc = validate(await response.text());
      if (disposed) return;
      status.textContent = 'Publicación actualizada';
      element.replaceChildren(board(doc, language), status);
      hasPublication = true;
    } catch {
      if (disposed) return;
      if (hasPublication) status.textContent = 'Sin conexión. Conservamos la última publicación; reintentamos automáticamente.';
      else element.textContent = 'Roadmap no disponible. Vuelve a intentarlo.';
    } finally { busy = false; }
  };
  await refresh();
  if (!disposed) timer = setInterval(refresh, 300000);
  return dispose;
}
