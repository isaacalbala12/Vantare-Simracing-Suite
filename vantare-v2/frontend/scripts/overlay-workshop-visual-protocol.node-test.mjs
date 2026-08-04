import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applySurfaceSceneIntegrity,
  evaluateWorkshopVisualGates,
  resolveAuthorisedOverflow,
  resolveContractualRendererSelector,
  resolveReportProvenance,
} from './overlay-workshop-visual-protocol.mjs';

const passing = {
  provenanceValid: true,
  rootCount: 1,
  fontsReady: true,
  consoleErrors: 0,
  pageErrors: 0,
  rootOverflowXpx: 0,
  rootOverflowYpx: 0,
  allowOverflowXpx: 0,
  allowOverflowYpx: 0,
  alpha: { guardClear: true, alphaZeroRatio: 0.2, sceneContaminated: false },
  scene: 'transparent',
};

const sha = (character) => character.repeat(64);

test('uses a contractual renderer selector and preserves the documented Delta Bar root', () => {
  assert.equal(resolveContractualRendererSelector({ widget: 'delta', design: 'delta-crystal-bar' }), '.vc-delta-bar');
  assert.equal(resolveContractualRendererSelector({ widget: 'delta', design: 'delta-crystal-simple' }), '[data-widget-renderer="delta"]');
  assert.deepEqual(resolveAuthorisedOverflow({ widget: 'delta', design: 'delta-crystal-simple', surface: 'studio' }), { surface: 'studio', xMaxPx: 0, yMaxPx: 13, reason: 'Crystal Simple badge protrusion' });
  assert.equal(resolveContractualRendererSelector({ widget: 'standings', design: 'standings-crystal-main' }), '[data-widget-renderer="standings"]');
});

for (const [name, mutate] of [
  ['missing root', (value) => ({ ...value, rootCount: 0 })],
  ['multiple roots', (value) => ({ ...value, rootCount: 2 })],
  ['stage alpha contamination', (value) => ({ ...value, alpha: { ...value.alpha, sceneContaminated: true } })],
  ['bounds guard contamination', (value) => ({ ...value, alpha: { ...value.alpha, guardClear: false } })],
  ['horizontal overflow', (value) => ({ ...value, rootOverflowXpx: 1 })],
  ['vertical overflow', (value) => ({ ...value, rootOverflowYpx: 1 })],
  ['fonts not ready', (value) => ({ ...value, fontsReady: false })],
  ['console error', (value) => ({ ...value, consoleErrors: 1 })],
  ['page error', (value) => ({ ...value, pageErrors: 1 })],
]) {
  test(`fails closed for ${name}`, () => {
    const result = evaluateWorkshopVisualGates(mutate(passing));
    assert.equal(result.pass, false);
    assert.ok(result.errors.length > 0);
  });
}

test('does not treat stage overflow as root overflow', () => {
  assert.deepEqual(evaluateWorkshopVisualGates(passing), { pass: true, errors: [] });
});

test('fails closed when report provenance is absent', () => {
  assert.equal(evaluateWorkshopVisualGates({ ...passing, provenanceValid: false }).pass, false);
});

test('marks every scene of a surface contaminated when a root-only hash differs', () => {
  const scenarios = ['transparent', 'solid', 'grid', 'context'].map((scene) => ({
    surface: 'studio',
    scene,
    rootOnlyHash: sha('a'),
    alpha: { guardClear: true, sceneContaminated: false },
    gateInput: { ...passing, alpha: { guardClear: true, sceneContaminated: false } },
  }));
  applySurfaceSceneIntegrity(scenarios);
  assert.deepEqual(scenarios.map((scenario) => scenario.alpha.sceneContaminated), [false, false, false, false]);
  assert.ok(scenarios.every((scenario) => scenario.gates.pass));

  scenarios[2].rootOnlyHash = sha('b');
  applySurfaceSceneIntegrity(scenarios);
  assert.deepEqual(scenarios.map((scenario) => scenario.alpha.sceneContaminated), [true, true, true, true]);
  assert.ok(scenarios.every((scenario) => !scenario.gates.pass));
});

test('resolves a valid local commit SHA and rejects missing provenance', () => {
  const revision = 'a'.repeat(40);
  const provenance = resolveReportProvenance({
    environment: {},
    readGit: (argumentsList) => argumentsList[0] === 'rev-parse' ? revision : ' M frontend/script.mjs',
  });
  assert.deepEqual(provenance, { sha: revision, dirty: true });
  assert.throws(() => resolveReportProvenance({ environment: {}, readGit: () => '' }), /40-character commit SHA/);
});

test('allows only the exact documented Delta Simple vertical protrusion', () => {
  const allowance = resolveAuthorisedOverflow({ widget: 'delta', design: 'delta-crystal-simple', surface: 'studio' });
  const atLimit = evaluateWorkshopVisualGates({ ...passing, rootOverflowYpx: 13, allowOverflowYpx: allowance.yMaxPx });
  assert.equal(atLimit.pass, true);

  const aboveLimit = evaluateWorkshopVisualGates({ ...passing, rootOverflowYpx: 14, allowOverflowYpx: allowance.yMaxPx });
  assert.equal(aboveLimit.pass, false);

  const otherDesign = resolveAuthorisedOverflow({ widget: 'delta', design: 'delta-crystal-bar', surface: 'studio' });
  assert.equal(otherDesign.yMaxPx, 0);
  const otherDesignOverflow = evaluateWorkshopVisualGates({ ...passing, rootOverflowYpx: 1, allowOverflowYpx: otherDesign.yMaxPx });
  assert.equal(otherDesignOverflow.pass, false);
});
