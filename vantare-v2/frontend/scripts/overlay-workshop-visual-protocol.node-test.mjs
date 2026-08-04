import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  evaluateWorkshopVisualGates,
  resolveAuthorisedOverflow,
  resolveContractualRendererSelector,
} from './overlay-workshop-visual-protocol.mjs';

const passing = {
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
