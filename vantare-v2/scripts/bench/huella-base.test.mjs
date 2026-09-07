import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { baseWatchInPage, validateBaseEvidence } from './huella-base.mjs';
const { Window } = createRequire(new URL('../../frontend/package.json', import.meta.url))('happy-dom');

const view = () => ({ route: 'home', visibility: 'visible', studio: false, widgets: 0, welcome: false, viewport: { width: 1264, height: 761, dpr: 1 } });
const evidence = () => ({ before: view(), after: view(), changes: [], levelEvents: 180,
  sources: [{kind: 'lmu', state: 'live', available: true}], sourceEvents: 180, maxSourceGapMs: 1000, sourceQuietMs: 50,
  maxLevelGapMs: 1000, levelQuietMs: 20,
  levels: [{ mode: 'auto', level: 2, effects: 'full', rafCap: 60, sourceHz: 0 }] });

test('base requiere ruta, viewport y nivel estables con efectos completos', () => {
  assert.equal(validateBaseEvidence(evidence(), 'home').valid, true);
});

test('con juego admite sourceHz variable sin confundirlo con cambios de Auto', () => {
  const value = evidence();
  value.levels = [58, 60, 59].map(sourceHz => ({ ...value.levels[0], sourceHz }));
  assert.equal(validateBaseEvidence(value, 'home', true).valid, true);
  assert.equal(validateBaseEvidence(value, 'home').valid, false, 'no mezclar con escenario sin juego');
  value.levels[1].level = 3;
  assert.equal(validateBaseEvidence(value, 'home', true).valid, false);
});

test('con juego tampoco acepta fuente ausente, negativa o no finita', () => {
  for (const sourceHz of [undefined, -1, NaN, Infinity]) {
    const value = evidence(); value.levels[0].sourceHz = sourceHz;
    assert.equal(validateBaseEvidence(value, 'home', true).valid, false);
  }
});

// DOM/event-bus fixtures exercise the observer, never stand in for Wails evidence.
async function withObserver(route, action, sourceOnStart = true) {
  const window = new Window({ url: 'http://wails.localhost/#/hub' });
  const names = ['window', 'document', 'MutationObserver', 'innerWidth', 'innerHeight', 'devicePixelRatio'];
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const values = [window, window.document, window.MutationObserver, 1264, 761, 1];
  names.forEach((name, index) => Object.defineProperty(globalThis, name, { configurable: true, value: values[index] }));
  window.document.body.innerHTML = `<main data-testid="${route === 'home' ? 'orbit-home' : `orbit-races-${route}`}"></main><button id="month" aria-pressed="true"></button><button id="timeline" aria-pressed="false"></button>`;
  const listeners = new Map();
  const emit = (name, data) => listeners.get(name)?.({ data });
  const bus = { On(name, listener) {
    listeners.set(name, listener);
    if (name === 'performance:level') queueMicrotask(() => emit(name, { ...evidence().levels[0], host: {} }));
    if (name === 'ops:metrics' && sourceOnStart) queueMicrotask(() => emit(name, { source: evidence().sources[0] }));
    return () => listeners.delete(name);
  } };
  try {
    await baseWatchInPage('start', bus);
    await action(window, emit);
    await window.happyDOM.whenAsyncComplete();
    const result = await baseWatchInPage('stop', bus);
    assert.equal(listeners.size, 0, 'all Wails listeners must be released');
    assert.equal(window.__vantareBaseWatch, undefined);
    return result;
  } finally {
    window.__vantareBaseWatch?.cleanup();
    await window.happyDOM.close();
    names.forEach((name, index) => previous[index] ? Object.defineProperty(globalThis, name, previous[index]) : delete globalThis[name]);
  }
}

test('el observador real detecta Mes -> Timeline -> Mes con rail constante', async () => {
  const result = await withObserver('month', async window => {
    for (const selected of ['timeline', 'month']) {
      window.document.getElementById('month').setAttribute('aria-pressed', String(selected === 'month'));
      window.document.getElementById('timeline').setAttribute('aria-pressed', String(selected === 'timeline'));
      await window.happyDOM.whenAsyncComplete();
    }
  });
  assert.equal(result.before.route, result.after.route);
  assert.ok(result.changes.some(change => change.kind === 'route'));
  assert.equal(validateBaseEvidence(result, 'month').valid, false);
});

test('el observador real detecta un HUD que abre y cierra entre extremos', async () => {
  const result = await withObserver('home', async (_window, emit) => {
    emit('overlay:status', { running: true });
    emit('overlay:status', { running: false });
  });
  assert.equal(result.before.widgets, 0);
  assert.equal(result.after.widgets, 0);
  assert.ok(result.changes.some(change => change.kind === 'overlay-status'));
  assert.equal(validateBaseEvidence(result, 'home').valid, false);
});

test('el observador conserva una base quieta y se desmonta', async () => {
  const result = await withObserver('home', async () => {});
  assert.equal(validateBaseEvidence(result, 'home').valid, true);
  assert.equal(validateBaseEvidence(result, 'home', true).valid, true);
});

test('fuente cambiante o ausente invalida con juego aunque sourceHz siga positivo', async () => {
  const result = await withObserver('home', async (_window, emit) => {
    emit('ops:metrics', {source: {kind: 'lmu', state: 'stale', available: true}});
  });
  assert.equal(validateBaseEvidence(result, 'home', true).valid, false);
  const value = evidence(); value.sourceQuietMs = 4000;
  assert.equal(validateBaseEvidence(value, 'home', true).valid, false);
  delete value.sources;
  assert.equal(validateBaseEvidence(value, 'home', true).valid, false);
});

test('la primera fuente tardía cuenta todo el intervalo sin observación', async () => {
  const realNow = Date.now;
  let offset = 0;
  Date.now = () => realNow() + offset;
  try {
    const result = await withObserver('home', async (_window, emit) => {
      offset = 10000;
      emit('ops:metrics', {source: evidence().sources[0]});
    }, false);
    assert.ok(result.maxSourceGapMs >= 10000);
    assert.equal(validateBaseEvidence(result, 'home', true).valid, false);
  } finally { Date.now = realNow; }
});

test('una interacción invalida sin guardar su contenido', async () => {
  const result = await withObserver('home', async window => {
    window.document.body.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.deepEqual(Object.keys(result.changes[0]).sort(), ['at', 'kind']);
  assert.equal(result.changes[0].kind, 'interaction');
  assert.equal(validateBaseEvidence(result, 'home').valid, false);
});

test('volver al estado inicial no oculta cambios durante la captura', () => {
  for (const kind of ['route', 'visibility', 'resize']) {
    const value = evidence(); value.changes.push({ kind });
    assert.equal(validateBaseEvidence(value, 'home').valid, false, kind);
  }
  const value = evidence();
  value.levels.push({ ...value.levels[0], level: 3 }, value.levels[0]);
  assert.equal(validateBaseEvidence(value, 'home').valid, false);
});

test('no certifica muestras sin eventos ni estados incompletos o excluidos', () => {
  for (const change of [
    value => { value.levelEvents = 0; },
    value => { value.maxLevelGapMs = 4000; },
    value => { value.levelQuietMs = 4000; },
    value => { delete value.levelQuietMs; },
    value => { value.levels = []; },
    value => { value.levels[0].level = null; },
    value => { value.levels[0].effects = 'reduced'; },
    value => { value.levels[0].mode = 'manual'; },
    value => { value.after.route = 'month'; },
    value => { value.after.visibility = 'hidden'; },
    value => { value.after.studio = true; },
    value => { value.after.widgets = 1; },
    value => { value.before.welcome = true; },
    value => { value.after.viewport.width = 1000; },
    value => { delete value.before.viewport; },
  ]) {
    const value = evidence(); change(value);
    assert.equal(validateBaseEvidence(value, 'home').valid, false);
  }
});
