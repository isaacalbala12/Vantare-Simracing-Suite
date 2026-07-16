import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const frontendRoot = path.basename(process.cwd()) === 'frontend' ? process.cwd() : path.join(process.cwd(), 'frontend');
const scriptPath = path.join(frontendRoot, 'scripts', 'extract-crystal-reference.mjs');
const manifestPath = path.join(frontendRoot, 'testdata', 'crystal-reference', 'manifest.json');
const sourcePath = path.join(frontendRoot, '..', 'docs', 'overlay-glassmorphism-pro.html');

const expectedEntries = [
  ['relative', 'relative-crystal-vertical', 1],
  ['standings', 'standings-crystal-vertical', 1],
  ['broadcast', 'broadcast-tower-crystal', 2],
  ['fuel', 'fuel-strategy-crystal-unified', 3],
  ['pedals-telemetry', 'pedals-telemetry-crystal', 4, '.hud-capsule-v1'],
  ['pedals-telemetry-compact', 'pedals-telemetry-compact-crystal', 4, '.cockpit-v2-low'],
  ['pedals', 'pedals-crystal', 4, '.cockpit-v3-solo'],
  ['flags', 'racing-flags-crystal', 5],
  ['delta-bar', 'delta-crystal-bar', 6],
  ['delta-trace', 'delta-trace-crystal', 7],
  ['schedule', 'race-schedule-crystal', 8],
  ['head-to-head', 'head-to-head-crystal', 9],
  ['input-blade', 'input-crystal-blade', 10],
  ['input-capsule', 'input-crystal-capsule', 10],
  ['input-dense', 'input-crystal-dense', 10],
  ['multiclass', 'multiclass-relative-crystal', 11],
  ['weather', 'track-weather-crystal', 12],
  ['damage-visual', 'car-damage-visual-crystal', 13],
  ['damage-numbers', 'car-damage-numbers-crystal', 14],
  ['delta-simple', 'delta-crystal-simple', 15],
  ['delta-advanced', 'delta-advanced-crystal', 16],
];

const canonicalInventoryTest = async () => {
  const result = spawnSync(process.execPath, [scriptPath, '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), 'crystal-reference: 21 canonical crops OK');

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.version, 2);
  assert.deepEqual(manifest.captureProtocol.scenes.map(({ id }) => id), ['transparent', 'solid', 'grid']);
  assert.equal(manifest.entries.length, expectedEntries.length);
  assert.deepEqual(
    manifest.entries.map(({ id, designId, htmlSection }) => [id, designId, htmlSection]),
    expectedEntries.map(([id, designId, htmlSection]) => [id, designId, htmlSection]),
  );

  const ids = new Set();
  const selectors = new Set();
  for (const [index, entry] of manifest.entries.entries()) {
    assert.ok(entry.referenceSelector);
    assert.ok(!entry.referenceSelector.startsWith('.v2-'));
    assert.ok(!ids.has(entry.id));
    assert.ok(!selectors.has(entry.referenceSelector));
    assert.ok(entry.widgetType);
    assert.ok(entry.designId);
    assert.ok(Number.isInteger(entry.width) && entry.width > 0);
    assert.ok(Number.isInteger(entry.height) && entry.height > 0);
    assert.equal(entry.capture.protocol, 2);
    assert.ok(entry.capture.scenes.transparent.alphaLt255Ratio > 0);
    assert.equal(entry.capture.scenes.transparent.meanAlpha < 255, true);
    assert.equal(entry.capture.scenes.transparent.guardChangedPixels, 0);
    assert.equal(entry.capture.scenes.solid.guardChangedPixels, 0);
    assert.equal(entry.capture.scenes.grid.guardChangedPixels, 0);
    const expectedSelector = expectedEntries[index][3];
    if (expectedSelector) assert.equal(entry.referenceSelector, expectedSelector);
    ids.add(entry.id);
    selectors.add(entry.referenceSelector);
  }
};

const pedalsIsolationTest = async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const source = await readFile(sourcePath, 'utf8');
  const pedals = manifest.entries.filter(({ htmlSection }) => htmlSection === 4);
  assert.deepEqual(
    pedals.map(({ referenceSelector }) => referenceSelector),
    ['.hud-capsule-v1', '.cockpit-v2-low', '.cockpit-v3-solo'],
  );
  for (const entry of pedals) {
    const selectorIndex = source.indexOf(entry.referenceSelector.slice(1));
    assert.ok(selectorIndex > 0);
    const nearbySource = source.slice(selectorIndex, selectorIndex + 2500);
    assert.equal(nearbySource.includes('telemetry-col'), false);
    assert.equal(nearbySource.includes('version-tag'), false);
  }
};

const sourceBoundaryTest = async () => {
  const source = await readFile(sourcePath, 'utf8');
  const marker = 'V2. WIDGETS REESTILIZADOS (GLASSMORPHISM PRO)';
  const markerIndex = source.indexOf(marker);
  assert.ok(markerIndex > 0);
  const canonicalSource = source.slice(0, markerIndex);
  assert.equal(canonicalSource.includes('class="v2-section"'), false);
  assert.equal(canonicalSource.includes('V2-'), false);
  assert.equal(source.slice(markerIndex).includes('V2-'), true);
};

const rendererRootIsolationTest = async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const deltaBar = manifest.entries.find(({ id }) => id === 'delta-bar');
  assert.equal(deltaBar.actualSelector, '.vc-delta-bar');
  assert.notEqual(deltaBar.actualSelector, '[data-overlay-parity-widget-frame]');
};

if (process.env.VITEST) {
  const { describe, it } = await import('vitest');
  describe('Crystal canonical reference manifest', () => {
    it('freezes the 21-entry inventory', canonicalInventoryTest);
    it('excludes the final V2 block', sourceBoundaryTest);
    it('targets only the three Pedals widget roots', pedalsIsolationTest);
    it('targets the Delta Bar visual root instead of the harness frame', rendererRootIsolationTest);
  });
} else {
  const { test } = await import('node:test');
  test('the canonical reference extractor freezes the 21-entry inventory', canonicalInventoryTest);
  test('the source boundary excludes the final V2 block', sourceBoundaryTest);
  test('the Pedals references exclude showcase labels and descriptions', pedalsIsolationTest);
  test('the Delta Bar capture uses its visual root', rendererRootIsolationTest);
}
