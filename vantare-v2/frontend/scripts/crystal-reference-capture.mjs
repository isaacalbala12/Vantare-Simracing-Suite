import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const manifestPath = path.join(repositoryRoot, 'frontend', 'testdata', 'crystal-reference', 'manifest.json');
const outputDirectory = path.join(repositoryRoot, 'frontend', 'testdata', 'crystal-reference');
const defaultUrl = 'http://127.0.0.1:4173/docs/overlay-glassmorphism-pro.html';

function fail(message) {
  throw new Error(`crystal-reference-capture: ${message}`);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function readPngDimensions(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) {
    fail('capture did not produce a PNG');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== 21) fail('manifest must contain 21 entries');

  const url = process.env.CRYSTAL_REFERENCE_URL || defaultUrl;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => requestFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || 'unknown failure'}`));

  try {
    await page.addInitScript(() => {
      const installStableStyles = () => {
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
      };
      if (document.documentElement) installStableStyles();
      else document.addEventListener('DOMContentLoaded', installStableStyles, { once: true });
    });

    const response = await page.goto(url, { waitUntil: 'networkidle' });
    if (!response || !response.ok()) fail(`source page failed: ${response?.status() || 'no response'}`);
    await page.evaluate(async () => {
      if (document.fonts) await document.fonts.ready;
    });

    if (consoleErrors.length > 0) fail(`console errors: ${consoleErrors.join(' | ')}`);
    if (pageErrors.length > 0) fail(`page errors: ${pageErrors.join(' | ')}`);
    if (requestFailures.length > 0) fail(`request failures: ${requestFailures.join(' | ')}`);

    const previousEntries = manifest.entries.map((entry) => entry.capture);
    const capturedEntries = [];
    for (const entry of manifest.entries) {
      const locator = page.locator(entry.referenceSelector);
      const count = await locator.count();
      if (count !== 1) fail(`${entry.id} selector matched ${count} elements`);
      const metrics = await locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const left = Math.floor(rect.left);
        const top = Math.floor(rect.top);
        const right = Math.ceil(rect.right);
        const bottom = Math.ceil(rect.bottom);
        return {
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
          clientWidth: element.clientWidth,
          clientHeight: element.clientHeight,
          scrollWidth: element.scrollWidth,
          scrollHeight: element.scrollHeight,
        };
      });
      if (metrics.width !== entry.width || metrics.height !== entry.height) {
        fail(`${entry.id} size changed: expected ${entry.width}x${entry.height}, got ${metrics.width}x${metrics.height}`);
      }
      if (metrics.scrollWidth > metrics.clientWidth + 1 || metrics.scrollHeight > metrics.clientHeight + 1) {
        fail(`${entry.id} has overflowing content: ${metrics.scrollWidth}x${metrics.scrollHeight} inside ${metrics.clientWidth}x${metrics.clientHeight}`);
      }

      const imagePath = path.join(outputDirectory, `${entry.id}.png`);
      await locator.screenshot({ path: imagePath, animations: 'disabled', omitBackground: true });
      const image = await readFile(imagePath);
      const dimensions = readPngDimensions(image);
      if (dimensions.width !== entry.width || dimensions.height !== entry.height) {
        fail(`${entry.id} PNG size changed: expected ${entry.width}x${entry.height}, got ${dimensions.width}x${dimensions.height}`);
      }
      const capture = {
        sha256: sha256(image),
        bbox: {
          x: metrics.x,
          y: metrics.y,
          width: metrics.width,
          height: metrics.height,
        },
      };
      const previous = previousEntries[capturedEntries.length];
      if (previous?.sha256 && (previous.sha256 !== capture.sha256 || JSON.stringify(previous.bbox) !== JSON.stringify(capture.bbox))) {
        fail(`${entry.id} is not deterministic; previous ${previous.sha256}, current ${capture.sha256}`);
      }
      capturedEntries.push({ ...entry, capture });
    }

    await writeFile(manifestPath, `${JSON.stringify({ ...manifest, entries: capturedEntries }, null, 2)}\n`, 'utf8');
    process.stdout.write(`crystal-reference-capture: ${capturedEntries.length} PNGs captured at ${url}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
