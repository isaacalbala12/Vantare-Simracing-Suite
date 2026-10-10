// Offline consumer contract; no browser, credentials or live publication.
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const source = await readFile(new URL('./roadmap-web.js', import.meta.url), 'utf8');
const { mountRoadmap } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
class Element {
  textContent = '';
  children = [];
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.textContent = ''; this.children = nodes; }
}
globalThis.document = { createDocumentFragment: () => new Element(), createElement: () => new Element() };
const config = { supabaseUrl: 'https://public.example.test', anonKey: 'public-fixture' };
test('shared Supabase RPC uses public config, no cookies, and literal text', async () => {
  const element = new Element();
  globalThis.fetch = async (url, request) => {
    assert.equal(String(url), 'https://public.example.test/rest/v1/rpc/visual_roadmap_current_v2');
    assert.equal(request.method, 'POST');
    assert.equal(request.body, '{}');
    assert.equal(request.credentials, 'omit');
    assert.equal(request.redirect, 'error');
    assert.equal(request.headers.apikey, 'public-fixture');
    return { ok: true, text: async () => JSON.stringify([{ document: { schemaVersion: 2, items: [{ section: 'next', title: { es: '<script>literal</script>' }, body: { es: 'Test' }, version: '1.2.3', dueDate: '2026-10-31' }] } }]) };
  };
  await mountRoadmap(element, config);
  const article = element.children[0].children[0];
  assert.equal(article.children[0].textContent, '<script>literal</script>');
  assert.equal(article.children[1].textContent, 'Test · 1.2.3 · 2026-10-31');
});
test('empty, missing, oversized and future publications keep honest states', async () => {
  for (const [body, expected] of [
    [JSON.stringify([{ document: { schemaVersion: 2, items: [] } }]), 'Sin hitos publicados'],
    ['[]', 'Roadmap no disponible. Vuelve a intentarlo.'],
    [JSON.stringify([{ document: { schemaVersion: 3, items: [] } }]), 'Roadmap no disponible. Vuelve a intentarlo.'],
    ['a'.repeat(56 * 1024 + 1), 'Roadmap no disponible. Vuelve a intentarlo.'],
  ]) {
    globalThis.fetch = async () => ({ ok: true, text: async () => body });
    const element = new Element();
    await mountRoadmap(element, config);
    assert.equal(element.textContent, expected);
  }
});
test('invalid public configuration fails before sending a request', async () => {
  globalThis.fetch = () => { throw new Error('Must not request'); };
  const element = new Element();
  await mountRoadmap(element, { ...config, supabaseUrl: 'http://insecure.example.test' });
  assert.equal(element.textContent, 'Roadmap no disponible. Vuelve a intentarlo.');
});
