import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

import {
  CONTROL_SCENES,
  analyzeRgbaCapture,
  captureIsolatedElement,
  comparePngCaptures,
  decodePng,
} from './crystal-parity-protocol.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const frontendRoot = path.join(repositoryRoot, 'frontend');
const manifestPath = path.join(frontendRoot, 'testdata', 'crystal-reference', 'manifest.json');
const referenceDirectory = path.dirname(manifestPath);
const auditDirectory = path.join(frontendRoot, '.tmp', 'crystal-reference-audit');
const sourcePath = path.join(repositoryRoot, 'docs', 'overlay-glassmorphism-pro.html');
const defaultUrl = pathToFileURL(sourcePath).href;
const windowsChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const update = process.argv.includes('--update');
const requestedIds = process.argv.find((argument) => argument.startsWith('--ids='))
  ?.slice(6).split(/[\s,]+/).filter(Boolean);

function fail(message) {
  throw new Error(`crystal-reference-capture: ${message}`);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function compactFontResolution(resolution) {
  const uniqueFaces = new Map();
  for (const face of resolution.faces) {
    uniqueFaces.set(`${face.family}|${face.weight}`, {
      family: face.family.replaceAll('"', ''),
      weight: face.weight,
      status: face.status,
    });
  }
  return {
    inter: resolution.inter,
    plusJakartaSans: resolution.plusJakartaSans,
    jetBrainsMono: resolution.jetBrainsMono,
    faces: [...uniqueFaces.values()].sort((left, right) => (
      left.family.localeCompare(right.family) || left.weight.localeCompare(right.weight)
    )),
  };
}

async function writeCapture(baseDirectory, entryId, sceneId, widget, sceneOnly) {
  const directory = path.join(baseDirectory, 'scenes', entryId);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, `${sceneId}.png`), widget),
    writeFile(path.join(directory, `${sceneId}-baseline.png`), sceneOnly),
  ]);
  if (sceneId === 'transparent') {
    await writeFile(path.join(baseDirectory, `${entryId}.png`), widget);
  }
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== 21) {
    fail('manifest must contain 21 entries');
  }
  const entries = requestedIds?.length
    ? manifest.entries.filter(({ id }) => requestedIds.includes(id))
    : manifest.entries;
  if (requestedIds?.length && entries.length !== requestedIds.length) fail('unknown design in --ids');

  const url = process.env.CRYSTAL_REFERENCE_URL || defaultUrl;
  const executablePath = process.env.CRYSTAL_PLAYWRIGHT_EXECUTABLE_PATH
    || (process.platform === 'win32' && existsSync(windowsChrome) ? windowsChrome : undefined);
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({
    viewport: { width: 2400, height: 1400 },
    deviceScaleFactor: 1,
  });
  const capturedEntries = [];
  let capturedFontResolution;

  try {
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent = `
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
          caret-color: transparent !important;
        }
        html { scroll-behavior: auto !important; }
      `;
      document.documentElement.append(style);
    });

    for (const entry of entries) {
      const response = await page.goto(url, { waitUntil: 'networkidle' });
      if (response && !response.ok()) fail(`source page failed: ${response.status()}`);
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
      const fontResolution = compactFontResolution(await page.evaluate(() => ({
        inter: document.fonts?.check('400 16px "Inter"') ?? false,
        plusJakartaSans: document.fonts?.check('700 16px "Plus Jakarta Sans"') ?? false,
        jetBrainsMono: document.fonts?.check('500 16px "JetBrains Mono"') ?? false,
        faces: document.fonts ? Array.from(document.fonts).map((face) => ({
          family: face.family,
          weight: face.weight,
          status: face.status,
        })) : [],
      })));
      capturedFontResolution ??= fontResolution;
      const scenes = {};
      let contentGeometry;

      for (const scene of CONTROL_SCENES) {
        const first = await captureIsolatedElement(page, {
          selector: entry.referenceSelector,
          scene,
        });
        const repeated = await captureIsolatedElement(page, {
          selector: entry.referenceSelector,
          scene,
        });
        const stability = await comparePngCaptures(page, {
          referenceWidget: first.widget,
          referenceScene: first.sceneOnly,
          actualWidget: repeated.widget,
          actualScene: repeated.sceneOnly,
          guard: first.geometry.guard,
          channelTolerance: 0,
        });
        if (
          !stability.dimensionsMatch
          || stability.maskIoU < 0.97
          || stability.alphaMeanDelta > 0.03
          || stability.compositeDeltaRatio > 0.03
          || stability.sceneDeltaRatio !== 0
        ) {
          const debugDirectory = path.join(auditDirectory, 'unstable', entry.id);
          await mkdir(debugDirectory, { recursive: true });
          await Promise.all([
            writeFile(path.join(debugDirectory, `${scene.id}-first.png`), first.widget),
            writeFile(path.join(debugDirectory, `${scene.id}-repeat.png`), repeated.widget),
            writeFile(path.join(debugDirectory, `${scene.id}-baseline.png`), first.sceneOnly),
          ]);
          fail(`${entry.id}/${scene.id} visible pixels are not stable: ${JSON.stringify(stability)}`);
        }
        const [widgetDecoded, sceneDecoded] = await Promise.all([
          decodePng(page, first.widget),
          decodePng(page, first.sceneOnly),
        ]);
        const analysis = analyzeRgbaCapture({
          widget: widgetDecoded.data,
          scene: sceneDecoded.data,
          width: widgetDecoded.width,
          height: widgetDecoded.height,
          guard: first.geometry.guard,
        });
        if (!analysis.guardClear) {
          fail(`${entry.id}/${scene.id} reaches the ${first.geometry.guard}px guard ring`);
        }
        const baseDirectory = update ? referenceDirectory : auditDirectory;
        await writeCapture(baseDirectory, entry.id, scene.id, first.widget, first.sceneOnly);
        contentGeometry = first.geometry;
        scenes[scene.id] = {
          widgetSha256: sha256(first.widget),
          baselineSha256: sha256(first.sceneOnly),
          alphaLt255Ratio: analysis.alphaLt255Ratio,
          alphaZeroRatio: analysis.alphaZeroRatio,
          meanAlpha: analysis.meanAlpha,
          guardChangedPixels: analysis.guardChangedPixels,
          stability: {
            maskIoU: stability.maskIoU,
            alphaMeanDelta: stability.alphaMeanDelta,
            compositeDeltaRatio: stability.compositeDeltaRatio,
            sceneDeltaRatio: stability.sceneDeltaRatio,
          },
        };
      }

      capturedEntries.push({
        ...entry,
        width: contentGeometry.contentWidth,
        height: contentGeometry.contentHeight,
        capture: {
          protocol: 2,
          margin: contentGeometry.margin,
          guard: contentGeometry.guard,
          sourceBbox: {
            x: contentGeometry.x,
            y: contentGeometry.y,
            width: contentGeometry.width,
            height: contentGeometry.height,
          },
          captureSize: {
            width: contentGeometry.captureWidth,
            height: contentGeometry.captureHeight,
          },
          scenes,
        },
      });
      process.stdout.write(
        `${entry.id}: ${contentGeometry.contentWidth}x${contentGeometry.contentHeight}`
        + ` alpha<255=${(scenes.transparent.alphaLt255Ratio * 100).toFixed(2)}%\n`,
      );
    }
  } finally {
    await page.close();
    await browser.close();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: update ? 'update' : 'audit',
    url,
    entries: capturedEntries,
  };
  await mkdir(auditDirectory, { recursive: true });
  await writeFile(path.join(auditDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

  if (update) {
    const byId = new Map(capturedEntries.map((entry) => [entry.id, entry]));
    const nextEntries = manifest.entries.map((entry) => {
      const next = byId.get(entry.id) ?? entry;
      if (!next.capture) return next;
      const { fontResolution: _discarded, ...capture } = next.capture;
      return { ...next, capture };
    });
    await writeFile(manifestPath, `${JSON.stringify({
      ...manifest,
      version: 2,
      fontContract: {
        resolution: 'authority-web-font-faces',
        requiredFamilies: ['Inter', 'Plus Jakarta Sans', 'JetBrains Mono'],
        captured: capturedFontResolution,
        runtimeRequirement: 'reference and renderer must expose the same local font faces before parity can pass',
      },
      captureProtocol: {
        margin: 128,
        guard: 8,
        dpr: 1,
        scenes: CONTROL_SCENES.map(({ id, ...definition }) => ({ id, ...definition })),
      },
      entries: nextEntries,
    }, null, 2)}\n`);
  }
  process.stdout.write(
    `crystal-reference-capture: ${capturedEntries.length} isolated designs ${update ? 'updated' : 'audited'}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
