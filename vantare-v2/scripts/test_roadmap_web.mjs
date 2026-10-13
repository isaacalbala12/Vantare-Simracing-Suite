// Offline DOM and clock: actual polling callbacks, no network or credentials.
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const source = await readFile(new URL('./roadmap-web.js', import.meta.url), 'utf8');
const { mountRoadmap } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
class Element {
  textContent = '';
  children = [];
  isConnected = true;
  style = {};
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.textContent = ''; this.children = nodes; }
  setAttribute(name, value) { this[name] = value; }
}
const timers = new Map();
let serial = 0;
globalThis.setInterval = (callback, milliseconds) => {
  assert.equal(milliseconds, 300000);
  timers.set(++serial, callback);
  return serial;
};
globalThis.clearInterval = id => timers.delete(id);
globalThis.document = { hidden: false, createElement: () => new Element() };
const config = { supabaseUrl: 'https://public.example.test', anonKey: 'public-fixture' };
const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const item = (section, n = 1) => ({ id: uuid(n), section, title: { es: '<script>Rework - Literal</script>', en: '', pt: '', it: '' },
  body: { es: 'Estado: Por hacer', en: '', pt: '', it: '' }, area: 'Hub', version: null, dueDate: null });
const publication = items => [{ id: uuid(100), published_at: '2026-10-13T00:00:00Z', document: { schemaVersion: 2, items } }];
const response = body => ({ ok: true, text: async () => JSON.stringify(body) });
const tick = async () => { for (const callback of [...timers.values()]) await callback(); };
const titles = root => root.children[0].children.map(lane => lane.children[0].textContent);
const cards = root => root.children[0].children.flatMap(lane => lane.children.slice(1).filter(node => node.children.length));

test('canonical Plane document matches the native app columns and names', async () => {
  const canonical = JSON.parse(await readFile(new URL('../native/hub/reference/fixtures/roadmap-plane-v2-test.json', import.meta.url), 'utf8'));
  globalThis.fetch = async () => response([canonical]);
  const element = new Element();
  const dispose = await mountRoadmap(element, config);
  assert.deepEqual(titles(element), ['Planeado', 'En marcha', 'Hecho']);
  assert.deepEqual(cards(element).map(card => card.children[0].textContent), ['Rework - Roadmap', 'Feature - Pedals', 'Bugfix - Texto literal']);
  dispose();
});

test('three columns preserve exact text, legacy later, done and public RPC', async () => {
  const element = new Element();
  globalThis.fetch = async (url, request) => {
    assert.equal(String(url), 'https://public.example.test/rest/v1/rpc/visual_roadmap_current_v2');
    assert.equal(request.method, 'POST');
    assert.equal(request.body, '{}');
    assert.equal(request.credentials, 'omit');
    assert.equal(request.redirect, 'error');
    assert.equal(request.headers.apikey, 'public-fixture');
    return response(publication(['next', 'later', 'now', 'done'].map((section, i) => item(section, i + 1))));
  };
  const dispose = await mountRoadmap(element, config);
  assert.deepEqual(titles(element), ['Planeado', 'En marcha', 'Hecho']);
  assert.equal(cards(element).length, 4);
  assert.equal(cards(element)[0].children[0].textContent, '<script>Rework - Literal</script>');
  dispose();
  assert.equal(timers.size, 0);
});

test('refresh changes content, then offline and invalid responses preserve last good publication', async () => {
  const element = new Element();
  globalThis.fetch = async () => response(publication([item('next')]));
  const dispose = await mountRoadmap(element, config);
  globalThis.fetch = async () => response(publication([item('done')]));
  await tick();
  assert.equal(element.children[0].children[2].children[1].children[0].textContent, '<script>Rework - Literal</script>');
  const board = element.children[0];
  globalThis.fetch = async () => { throw new Error('Offline'); };
  await tick();
  assert.equal(element.children[0], board);
  assert.match(element.children[1].textContent, /última publicación/i);
  globalThis.fetch = async () => response(publication([item('unknown')]));
  await tick();
  assert.equal(element.children[0], board);
  dispose();
});

test('no overlap; hidden/disconnected pages and disposed mount do not poll', async () => {
  const element = new Element();
  let requests = 0;
  globalThis.fetch = async () => { requests++; return response(publication([item('next')])); };
  const dispose = await mountRoadmap(element, config);
  document.hidden = true;
  await tick();
  assert.equal(requests, 1);
  document.hidden = false;
  let resolve;
  globalThis.fetch = () => { requests++; return new Promise(done => { resolve = done; }); };
  const pending = tick();
  await tick();
  assert.equal(requests, 2);
  resolve(response(publication([item('now')])));
  await pending;
  element.isConnected = false;
  await tick();
  assert.equal(timers.size, 0);
  dispose();
});

test('remount cancels an old request; late old reply cannot replace new content', async () => {
  const element = new Element();
  let resolve;
  globalThis.fetch = () => new Promise(done => { resolve = done; });
  const pending = mountRoadmap(element, config);
  globalThis.fetch = async () => response(publication([item('done')]));
  const dispose = await mountRoadmap(element, config);
  resolve(response(publication([item('next')])));
  (await pending)();
  assert.equal(cards(element).length, 1);
  assert.equal(element.children[0].children[2].children[1].children.length, 2);
  dispose();
  assert.equal(timers.size, 0);
});

test('invalid documents, limits and configuration fail closed without partial DOM', async () => {
  for (const body of [[], publication([item('unknown')]), publication([item('next'), item('next')]),
    [{ document: { schemaVersion: 3, items: [] } }],
    publication(Array.from({ length: 41 }, (_, i) => item('next', i + 1))),
    publication([item('next', 1), { ...item('done', 2), title: { es: 'x'.repeat(121) } }])]) {
    const element = new Element();
    globalThis.fetch = async () => response(body);
    const dispose = await mountRoadmap(element, config);
    assert.match(element.textContent, /Roadmap no disponible/);
    assert.equal(element.children.length, 0);
    dispose();
  }
  for (const url of ['http://insecure.test', 'https://user:pass@example.test', 'https://example.test/?key=x']) {
    globalThis.fetch = () => { throw new Error('Must not request'); };
    const element = new Element();
    (await mountRoadmap(element, { ...config, supabaseUrl: url }))();
    assert.match(element.textContent, /Roadmap no disponible/);
  }
  assert.equal(timers.size, 0);
});
