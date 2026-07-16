import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

import {
  CONTROL_SCENES,
  captureIsolatedElement,
  compareRgbaLayers,
  createComparisonMask,
  decodePng,
  isolateWidgetStyles,
} from './crystal-parity-protocol.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceUrl = pathToFileURL(path.resolve(scriptDirectory, '..', '..', 'docs', 'overlay-glassmorphism-pro.html')).href;
const chromeExecutable = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function pixel(red, green, blue, alpha) {
  return [red, green, blue, alpha];
}

function rgba(...pixels) {
  return Uint8ClampedArray.from(pixels.flat());
}

test('defines transparent, solid and contrasting control scenes', () => {
  assert.deepEqual(CONTROL_SCENES.map(({ id }) => id), ['transparent', 'solid', 'grid']);
  assert.equal(CONTROL_SCENES.find(({ id }) => id === 'solid').backgroundColor, '#060608');
});

test('excludes unchanged exterior scene pixels from the comparison denominator', () => {
  const scene = rgba(pixel(6, 6, 8, 255), pixel(6, 6, 8, 255), pixel(6, 6, 8, 255));
  const reference = rgba(pixel(6, 6, 8, 255), pixel(120, 130, 140, 128), pixel(6, 6, 8, 255));
  const actual = rgba(pixel(6, 6, 8, 255), pixel(120, 130, 140, 128), pixel(6, 6, 8, 255));
  assert.deepEqual([...createComparisonMask(reference, actual, scene, scene)], [0, 1, 0]);
});

test('ignores hidden RGB differences when both pixels are fully transparent', () => {
  const transparentBlack = rgba(pixel(0, 0, 0, 0));
  const transparentWhite = rgba(pixel(255, 255, 255, 0));
  assert.deepEqual(
    [...createComparisonMask(transparentBlack, transparentWhite, transparentBlack, transparentWhite)],
    [0],
  );
});

test('detects a real opacity change independently from composite appearance', () => {
  const scene = rgba(pixel(6, 6, 8, 255));
  const reference = rgba(pixel(12, 12, 16, 128));
  const altered = rgba(pixel(18, 18, 24, 85));
  const result = compareRgbaLayers({
    reference,
    actual: altered,
    referenceScene: scene,
    actualScene: scene,
  });
  assert.equal(result.maskPixels, 1);
  assert.ok(result.alphaMeanDelta > 0.15);
  assert.equal(result.alphaPass, false);
});

test('isolates a widget without inheriting the authority page background', () => {
  const css = isolateWidgetStyles('.glass-card', { x: 128, y: 128 });
  assert.match(css, /html,\s*html body/);
  assert.match(css, /background:\s*transparent\s*!important/);
  assert.match(css, /body \*\s*\{/);
  assert.match(css, /\.glass-card/);
  assert.match(css, /data-crystal-parity-hidden/);
});

test('captures transparent widget pixels and ignores changes to the authority page background', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromeExecutable });
  const page = await browser.newPage({ viewport: { width: 2200, height: 1200 }, deviceScaleFactor: 1 });
  try {
    await page.goto(sourceUrl, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts?.ready);
    const first = await captureIsolatedElement(page, {
      selector: '.w15-delta-simple',
      scene: CONTROL_SCENES[0],
    });
    await page.reload({ waitUntil: 'load' });
    await page.evaluate(() => document.fonts?.ready);
    await page.addStyleTag({
      content: 'html body { background: repeating-linear-gradient(45deg, #fff 0 12px, #0ff 12px 24px) !important; }',
    });
    const second = await captureIsolatedElement(page, {
      selector: '.w15-delta-simple',
      scene: CONTROL_SCENES[0],
    });
    assert.equal(
      createHash('sha256').update(first.widget).digest('hex'),
      createHash('sha256').update(second.widget).digest('hex'),
    );
    const decoded = await decodePng(page, first.widget);
    let translucentPixels = 0;
    for (let index = 3; index < decoded.data.length; index += 4) {
      if (decoded.data[index] < 255) translucentPixels += 1;
    }
    assert.ok(translucentPixels > decoded.width * decoded.height * 0.5);
  } finally {
    await browser.close();
  }
});

test('Pedals roots do not contain showcase labels or descriptions', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromeExecutable });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  try {
    await page.goto(sourceUrl, { waitUntil: 'load' });
    for (const selector of ['.hud-capsule-v1', '.cockpit-v2-low', '.cockpit-v3-solo']) {
      const root = page.locator(selector);
      assert.equal(await root.locator('.version-tag').count(), 0);
      assert.doesNotMatch(await root.innerText(), /Cápsula|Cockpit|Focus/i);
    }
  } finally {
    await browser.close();
  }
});
