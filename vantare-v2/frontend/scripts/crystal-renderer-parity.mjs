import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import {
  CONTROL_SCENES,
  captureIsolatedElement,
  comparePngCaptures,
} from './crystal-parity-protocol.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDirectory, '..');
const canonicalReferenceDirectory = path.join(frontendRoot, 'testdata', 'crystal-reference');
const auditReferenceDirectory = path.join(frontendRoot, '.tmp', 'crystal-reference-audit');
const outputDirectory = path.join(frontendRoot, '.tmp', 'crystal-parity');
const reportOnly = process.argv.includes('--report-only');
const useAuditReferences = process.argv.includes('--reference-audit');
const requestedIds = process.argv.find((argument) => argument.startsWith('--ids='))
  ?.slice(6).split(/[\s,]+/).filter(Boolean);
const maxCompositeDeltaRatio = 0.03;
const maxAlphaDeltaRatio = 0.03;
const minMaskIoU = 0.97;
const geometryTolerancePx = 2;
const windowsChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function startServer() {
  const { createServer } = await import('vite');
  const server = await createServer({
    configFile: path.join(frontendRoot, 'vite.overlay-studio-harness.config.ts'),
    server: { host: '127.0.0.1', port: 5177, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 5177;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

function scenePath(baseDirectory, entryId, sceneId, baseline = false) {
  return path.join(
    baseDirectory,
    'scenes',
    entryId,
    `${sceneId}${baseline ? '-baseline' : ''}.png`,
  );
}

async function loadReferenceContract() {
  if (useAuditReferences) {
    const report = JSON.parse(await readFile(path.join(auditReferenceDirectory, 'report.json'), 'utf8'));
    return { entries: report.entries, directory: auditReferenceDirectory, protocol: 2 };
  }
  const manifest = JSON.parse(await readFile(path.join(canonicalReferenceDirectory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 2) {
    throw new Error('canonical references still use protocol v1; use --reference-audit for the proof cut');
  }
  return {
    entries: manifest.entries,
    directory: canonicalReferenceDirectory,
    protocol: manifest.version,
    fontContract: manifest.fontContract,
  };
}

async function captureRenderer(page, baseUrl, entry, surface, scene) {
  const query = new URLSearchParams({
    widget: entry.widgetType,
    system: 'vantare-crystal',
    design: entry.designId,
    state: 'ready',
    surface,
  });
  await page.goto(`${baseUrl}/overlay-studio-harness.html?${query}`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    if (!document.fonts) return;
    const queries = [
      ...[400, 500, 600, 700, 800].map((weight) => `${weight} 16px "Inter"`),
      ...[700, 800].map((weight) => `${weight} 16px "Plus Jakarta Sans"`),
      ...[500, 600, 700, 800].map((weight) => `${weight} 16px "JetBrains Mono"`),
    ];
    await Promise.all(queries.map((query) => document.fonts.load(query, 'Vantare 0123456789')));
    await document.fonts.ready;
  });
  const frame = page.locator('[data-overlay-parity-widget-frame]');
  await frame.locator(`[data-widget-renderer="${entry.widgetType}"]`).waitFor();
  await frame.evaluate((element, expected) => {
    element.style.width = `${expected.width}px`;
    element.style.height = `${expected.height}px`;
  }, { width: entry.width, height: entry.height });
  const rendererGeometry = await frame.locator('[data-widget-renderer]').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
    };
  });
  const fontResolution = await page.evaluate(() => ({
    inter: document.fonts?.check('400 16px "Inter"') ?? false,
    plusJakartaSans: document.fonts?.check('700 16px "Plus Jakarta Sans"') ?? false,
    jetBrainsMono: document.fonts?.check('500 16px "JetBrains Mono"') ?? false,
    faces: document.fonts ? Array.from(document.fonts).map((face) => ({
      family: face.family,
      weight: face.weight,
      status: face.status,
    })) : [],
  }));
  const captured = await captureIsolatedElement(page, {
    selector: '[data-overlay-parity-widget-frame]',
    scene,
  });
  return { ...captured, fontResolution, rendererGeometry };
}

async function main() {
  const referenceContract = await loadReferenceContract();
  const entries = requestedIds?.length
    ? referenceContract.entries.filter(({ id }) => requestedIds.includes(id))
    : referenceContract.entries;
  if (requestedIds?.length && entries.length !== requestedIds.length) {
    throw new Error('unknown or unavailable Crystal design in --ids');
  }
  await mkdir(outputDirectory, { recursive: true });
  const { server, baseUrl } = await startServer();
  const executablePath = process.env.CRYSTAL_PLAYWRIGHT_EXECUTABLE_PATH
    || (process.platform === 'win32' && existsSync(windowsChrome) ? windowsChrome : undefined);
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 2400, height: 1400 }, deviceScaleFactor: 1 });
  const results = [];

  try {
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
      document.documentElement.append(style);
    });

    for (const entry of entries) {
      const sceneResults = {};
      let geometry;
      let fontResolution;
      let stabilityPass = true;
      for (const scene of CONTROL_SCENES) {
        const actual = await captureRenderer(page, baseUrl, entry, 'harness', scene);
        const repeated = await captureRenderer(page, baseUrl, entry, 'harness', scene);
        const [referenceWidget, referenceScene] = await Promise.all([
          readFile(scenePath(referenceContract.directory, entry.id, scene.id)),
          readFile(scenePath(referenceContract.directory, entry.id, scene.id, true)),
        ]);
        geometry = actual.geometry;
        fontResolution = actual.fontResolution;
        const stability = await comparePngCaptures(page, {
          referenceWidget: actual.widget,
          referenceScene: actual.sceneOnly,
          actualWidget: repeated.widget,
          actualScene: repeated.sceneOnly,
          guard: actual.geometry.guard,
          channelTolerance: 0,
        });
        const stable = stability.dimensionsMatch
          && stability.maskIoU >= minMaskIoU
          && stability.alphaMeanDelta <= maxAlphaDeltaRatio
          && stability.compositeDeltaRatio <= maxCompositeDeltaRatio
          && stability.sceneDeltaRatio === 0;
        stabilityPass &&= stable;
        const comparison = await comparePngCaptures(page, {
          referenceWidget,
          referenceScene,
          actualWidget: actual.widget,
          actualScene: actual.sceneOnly,
          guard: actual.geometry.guard,
        });
        const sceneDirectory = path.join(outputDirectory, entry.id);
        await mkdir(sceneDirectory, { recursive: true });
        await Promise.all([
          writeFile(path.join(sceneDirectory, `${scene.id}-actual.png`), actual.widget),
          writeFile(path.join(sceneDirectory, `${scene.id}-actual-baseline.png`), actual.sceneOnly),
        ]);
        sceneResults[scene.id] = {
          stable,
          stability,
          ...comparison,
        };
      }

      const surfaceResults = {};
      const harnessTransparent = await captureRenderer(page, baseUrl, entry, 'harness', CONTROL_SCENES[0]);
      for (const surface of ['studio', 'desktop', 'obs']) {
        const surfaceCapture = await captureRenderer(page, baseUrl, entry, surface, CONTROL_SCENES[0]);
        surfaceResults[surface] = await comparePngCaptures(page, {
          referenceWidget: harnessTransparent.widget,
          referenceScene: harnessTransparent.sceneOnly,
          actualWidget: surfaceCapture.widget,
          actualScene: surfaceCapture.sceneOnly,
          guard: harnessTransparent.geometry.guard,
          channelTolerance: 0,
        });
      }

      const geometryPass = Math.abs(geometry.contentWidth - entry.width) <= geometryTolerancePx
        && Math.abs(geometry.contentHeight - entry.height) <= geometryTolerancePx
        && geometry.scrollWidth <= geometry.clientWidth + 1
        && geometry.scrollHeight <= geometry.clientHeight + 1
        && Math.abs(harnessTransparent.rendererGeometry.width - entry.width) <= geometryTolerancePx
        && Math.abs(harnessTransparent.rendererGeometry.height - entry.height) <= geometryTolerancePx
        && harnessTransparent.rendererGeometry.scrollWidth <= harnessTransparent.rendererGeometry.clientWidth + 1
        && harnessTransparent.rendererGeometry.scrollHeight <= harnessTransparent.rendererGeometry.clientHeight + 1;
      const transparent = sceneResults.transparent;
      const alphaPass = transparent.dimensionsMatch
        && transparent.maskIoU >= minMaskIoU
        && transparent.alphaMeanDelta <= maxAlphaDeltaRatio
        && transparent.alphaMismatchRatio <= maxAlphaDeltaRatio;
      const compositePass = ['solid', 'grid'].every((sceneId) => (
        sceneResults[sceneId].dimensionsMatch
        && sceneResults[sceneId].sceneDeltaRatio === 0
        && sceneResults[sceneId].compositeDeltaRatio <= maxCompositeDeltaRatio
      ));
      const guardPass = Object.values(sceneResults).every((sceneResult) => (
        sceneResult.referenceGuardPixels === 0 && sceneResult.actualGuardPixels === 0
      ));
      const requiredFontFaces = referenceContract.fontContract?.captured?.faces
        ?.filter(({ status }) => status === 'loaded')
        .map(({ family, weight }) => `${family}|${weight}`) ?? [];
      const actualFontFaces = new Set(
        fontResolution.faces
          .filter(({ status }) => status === 'loaded')
          .map(({ family, weight }) => `${family.replaceAll('"', '')}|${weight}`),
      );
      const fontPass = requiredFontFaces.every((face) => actualFontFaces.has(face));
      const surfacesPass = Object.values(surfaceResults).every((surfaceResult) => (
        surfaceResult.dimensionsMatch
        && surfaceResult.maskIoU === 1
        && surfaceResult.alphaMeanDelta === 0
        && surfaceResult.compositeDeltaRatio === 0
        && surfaceResult.sceneDeltaRatio === 0
      ));
      const result = {
        id: entry.id,
        widgetType: entry.widgetType,
        designId: entry.designId,
        geometry,
        rendererGeometry: harnessTransparent.rendererGeometry,
        expectedGeometry: { width: entry.width, height: entry.height },
        geometryPass,
        fontResolution,
        alphaPass,
        compositePass,
        guardPass,
        fontPass,
        stabilityPass,
        surfacesPass,
        scenes: sceneResults,
        surfaces: surfaceResults,
      };
      results.push(result);
      process.stdout.write(
        `${geometryPass && alphaPass && compositePass && guardPass && fontPass && stabilityPass && surfacesPass ? 'PASS' : 'FAIL'}`
        + ` ${entry.id}: geometry=${geometryPass ? 'ok' : 'fail'}`
        + ` maskIoU=${(transparent.maskIoU * 100).toFixed(2)}%`
        + ` alpha=${(transparent.alphaMeanDelta * 100).toFixed(2)}%`
        + ` solid=${(sceneResults.solid.compositeDeltaRatio * 100).toFixed(2)}%`
        + ` grid=${(sceneResults.grid.compositeDeltaRatio * 100).toFixed(2)}%\n`,
      );
    }
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }

  const gateNames = ['geometryPass', 'alphaPass', 'compositePass', 'guardPass', 'fontPass', 'stabilityPass', 'surfacesPass'];
  const summary = Object.fromEntries(gateNames.map((gate) => [
    gate,
    results.filter((result) => result[gate]).length,
  ]));
  const report = {
    generatedAt: new Date().toISOString(),
    referenceProtocol: referenceContract.protocol,
    thresholds: {
      geometryTolerancePx,
      minMaskIoU,
      maxAlphaDeltaRatio,
      maxCompositeDeltaRatio,
      maxChannelDelta: 24,
    },
    total: results.length,
    summary,
    results,
  };
  await writeFile(path.join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ total: results.length, ...summary })}\n`);
  process.stdout.write(`report: ${path.join(outputDirectory, 'report.json')}\n`);
  if (!reportOnly && results.some((result) => gateNames.some((gate) => !result[gate]))) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
