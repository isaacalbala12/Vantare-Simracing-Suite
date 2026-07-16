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
  ['pedals-telemetry', 'pedals-telemetry-crystal', 4],
  ['pedals-telemetry-compact', 'pedals-telemetry-compact-crystal', 4],
  ['pedals', 'pedals-crystal', 4],
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
  assert.equal(manifest.version, 1);
  assert.equal(manifest.entries.length, expectedEntries.length);
  assert.deepEqual(
    manifest.entries.map(({ id, designId, htmlSection }) => [id, designId, htmlSection]),
    expectedEntries,
  );

  const ids = new Set();
  const selectors = new Set();
  for (const entry of manifest.entries) {
    assert.ok(entry.referenceSelector);
    assert.ok(!entry.referenceSelector.startsWith('.v2-'));
    assert.ok(!ids.has(entry.id));
    assert.ok(!selectors.has(entry.referenceSelector));
    assert.ok(entry.widgetType);
    assert.ok(entry.designId);
    assert.ok(Number.isInteger(entry.width) && entry.width > 0);
    assert.ok(Number.isInteger(entry.height) && entry.height > 0);
    ids.add(entry.id);
    selectors.add(entry.referenceSelector);
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

if (process.env.VITEST) {
  const { describe, it } = await import('vitest');
  describe('Crystal canonical reference manifest', () => {
    it('freezes the 21-entry inventory', canonicalInventoryTest);
    it('excludes the final V2 block', sourceBoundaryTest);
  });
} else {
  const { test } = await import('node:test');
  test('the canonical reference extractor freezes the 21-entry inventory', canonicalInventoryTest);
  test('the source boundary excludes the final V2 block', sourceBoundaryTest);
}
