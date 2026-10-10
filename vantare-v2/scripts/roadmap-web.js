// Public-site integration: call mountRoadmap(element). Uses textContent only.
export async function mountRoadmap(element, { supabaseUrl, anonKey, language = 'es' }) {
  element.textContent = language === 'es' ? 'Cargando roadmap…' : 'Loading roadmap…';
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !anonKey) throw new Error('Unconfigured');
    const response = await fetch(new URL('/rest/v1/rpc/visual_roadmap_current', url), {
      method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('Unavailable');
    const raw = await response.text();
    if (new TextEncoder().encode(raw).length > 56 * 1024) throw new Error('Too large');
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error("No publication");
    const publication = rows[0];
    if (publication.document.schemaVersion !== 2 || !Array.isArray(publication.document.items) || publication.document.items.length > 40) throw new Error('Invalid');
    const fragment = document.createDocumentFragment();
    for (const item of publication.document.items) {
      if (!['now', 'next', 'later', 'done'].includes(item.section) || typeof item.title?.es !== 'string') throw new Error('Invalid');
      const article = document.createElement('article');
      const title = document.createElement('h3');
      title.textContent = item.title[language] || item.title.es;
      const note = document.createElement('p');
      note.textContent = `${item.body?.[language] || item.body?.es || ''} · ${item.version || '—'} · ${item.dueDate || '—'}`;
      article.append(title, note);
      fragment.append(article);
    }
    element.replaceChildren(fragment);
    if (!publication.document.items.length) element.textContent = language === 'es' ? 'Sin hitos publicados' : 'No published milestones';
  } catch {
    element.textContent = language === 'es' ? 'Roadmap no disponible. Vuelve a intentarlo.' : 'Roadmap unavailable. Try again.';
  }
}
