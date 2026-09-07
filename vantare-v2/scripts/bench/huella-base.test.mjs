import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBaseEvidence } from './huella-base.mjs';

const view = () => ({ route: 'home', visibility: 'visible', studio: false, widgets: 0, welcome: false, viewport: { width: 1264, height: 761, dpr: 1 } });
const evidence = () => ({ before: view(), after: view(), changes: [], levelEvents: 180,
  maxLevelGapMs: 1000, levelQuietMs: 20,
  levels: [{ mode: 'auto', level: 2, effects: 'full', rafCap: 60, sourceHz: 0 }] });

test('base requiere ruta, viewport y nivel estables con efectos completos', () => {
  assert.equal(validateBaseEvidence(evidence(), 'home').valid, true);
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
