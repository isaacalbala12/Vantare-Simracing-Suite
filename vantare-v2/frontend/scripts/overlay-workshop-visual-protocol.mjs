import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import {
  CONTROL_SCENES,
  analyzeRgbaCapture,
  captureIsolatedElement,
  decodePng,
} from './crystal-parity-protocol.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDirectory, '..');
const outputDirectory = path.join(frontendRoot, '.tmp', 'overlay-workshop-visual-protocol');
const chromeExecutable = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const STEP_TIMEOUT_MS = 8000;

function progress(message) {
  process.stdout.write(`[overlay-workshop-visual] ${message}\n`);
}

async function withTimeout(label, operation, timeoutMs = STEP_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export const WORKSHOP_SCENES = Object.freeze([
  ...CONTROL_SCENES,
  Object.freeze({
    id: 'context',
    backgroundColor: '#08090d',
    backgroundImage: 'radial-gradient(circle at 18% 20%, #353b52, transparent 40%), linear-gradient(135deg, #08090d, #202635)',
  }),
]);

export function resolveContractualRendererSelector({ widget, design }) {
  // Delta Bar renders its visual material below the generic renderer envelope.
  // This is a documented Crystal contract, not a bounding-box discovery rule.
  if (widget === 'delta' && design === 'delta-crystal-bar') return '.vc-delta-bar';
  return `[data-widget-renderer="${widget}"]`;
}

export function resolveAuthorisedOverflow({ widget, design, surface }) {
  // The simple Crystal delta badge intentionally protrudes from its compact
  // renderer envelope. It is a named design contract, never a generic waiver.
  const allowedSurfaces = new Set(['studio', 'desktop', 'obs', 'harness']);
  return widget === 'delta' && design === 'delta-crystal-simple' && allowedSurfaces.has(surface)
    ? { surface, xMaxPx: 0, yMaxPx: 13, reason: 'Crystal Simple badge protrusion' }
    : { surface: 'none', xMaxPx: 0, yMaxPx: 0, reason: 'no authorised renderer overflow' };
}

export function evaluateWorkshopVisualGates(input) {
  const errors = [];
  if (!input.provenanceValid) errors.push('report provenance is not a commit SHA');
  if (input.rootCount !== 1) errors.push(`renderer root must match exactly one element (matched ${input.rootCount})`);
  if (!input.fontsReady) errors.push('required fonts are not ready');
  if (input.consoleErrors > 0) errors.push(`${input.consoleErrors} console error(s)`);
  if (input.pageErrors > 0) errors.push(`${input.pageErrors} page error(s)`);
  if (input.rootOverflowXpx > input.allowOverflowXpx) errors.push('root horizontal overflow is not authorised');
  if (input.rootOverflowYpx > input.allowOverflowYpx) errors.push('root vertical overflow is not authorised');
  if (!input.alpha.guardClear) errors.push('root reaches the capture guard ring');
  if (input.alpha.sceneContaminated) errors.push('root alpha/background is contaminated by the stage');
  return { pass: errors.length === 0, errors };
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function resolveReportProvenance({
  environment = process.env,
  readGit = (argumentsList) => execFileSync('git', argumentsList, { cwd: frontendRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(),
} = {}) {
  const sha = (environment.GITHUB_SHA || readGit(['rev-parse', 'HEAD'])).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('report provenance must resolve to a 40-character commit SHA');
  return { sha: sha.toLowerCase(), dirty: readGit(['status', '--porcelain']).length > 0 };
}

export function applySurfaceSceneIntegrity(scenarios) {
  for (const surface of new Set(scenarios.map((scenario) => scenario.surface))) {
    const group = scenarios.filter((scenario) => scenario.surface === surface);
    const hashes = group.map((scenario) => scenario.rootOnlyHash);
    const sceneContaminated = hashes.length !== WORKSHOP_SCENES.length
      || hashes.some((hash) => !/^[0-9a-f]{64}$/i.test(hash ?? ''))
      || new Set(hashes).size !== 1;
    for (const scenario of group) {
      scenario.alpha.sceneContaminated = sceneContaminated;
      scenario.gateInput.alpha.sceneContaminated = sceneContaminated;
      scenario.gates = evaluateWorkshopVisualGates(scenario.gateInput);
    }
  }
  return scenarios;
}

function parseArguments(argumentsList) {
  const result = {
    widget: 'delta',
    system: 'vantare-crystal',
    design: 'delta-crystal-simple',
    surface: 'all',
    viewport: { width: 1920, height: 1080 },
  };
  for (const argument of argumentsList) {
    const [name, value] = argument.split('=', 2);
    if (name === '--widget' && value) result.widget = value;
    if (name === '--system' && value) result.system = value;
    if (name === '--design' && value) result.design = value;
    if (name === '--surface' && value) result.surface = value;
    if (name === '--viewport' && /^\d+x\d+$/.test(value ?? '')) {
      const [width, height] = value.split('x').map(Number);
      result.viewport = { width, height };
    }
  }
  return result;
}

async function startWorkshopServer() {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: frontendRoot,
    server: { host: '127.0.0.1', port: 5182, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 5182;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function waitForFonts(page) {
  return withTimeout('font readiness', () => page.evaluate(async () => {
    if (!document.fonts) return false;
    const queries = [
      '400 16px "Inter"',
      '700 16px "Plus Jakarta Sans"',
      '500 16px "JetBrains Mono"',
    ];
    await Promise.race([
      Promise.all(queries.map((query) => document.fonts.load(query, 'Vantare 0123456789'))).then(() => document.fonts.ready),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    return queries.every((query) => document.fonts.check(query));
  }), 5000);
}

async function captureTransparentRoot(locator, page) {
  const transparencyStyle = await page.addStyleTag({
    content: `
      html, body, [data-overlay-workshop-visual-ancestor] {
        background: transparent !important;
        background-image: none !important;
      }
    `,
  });
  try {
    return await locator.screenshot({ animations: 'disabled', omitBackground: true });
  } finally {
    await transparencyStyle.evaluate((element) => element.remove());
  }
}

async function captureScene(page, options, scene, errors) {
  const query = new URLSearchParams({
    widget: options.widget,
    system: options.system,
    design: options.design,
    state: 'ready',
    surface: options.surface,
    variant: 'default',
    session: 'race',
    location: 'track',
    background: scene.id,
    scale: '1',
    preset: '1080p',
  });
  await withTimeout(`${options.surface}/${scene.id} navigation`, () => page.goto(
    `${options.baseUrl}/workshop?${query}`, { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT_MS },
  ));
  const selector = resolveContractualRendererSelector(options);
  await page.locator(selector).waitFor({ state: 'attached', timeout: STEP_TIMEOUT_MS }).catch(() => undefined);
  const rootCount = await page.locator(selector).count();
  const fontsReady = await waitForFonts(page);
  if (rootCount !== 1) {
    return {
      scene: scene.id,
      selector,
      rootCount,
      fontsReady,
      alpha: { guardClear: false, alphaZeroRatio: 0, sceneContaminated: false },
      rootOverflowXpx: 0,
      rootOverflowYpx: 0,
      gates: evaluateWorkshopVisualGates({
        rootCount, fontsReady, consoleErrors: errors.console.length, pageErrors: errors.page.length,
        rootOverflowXpx: 0, rootOverflowYpx: 0, allowOverflowXpx: 0, allowOverflowYpx: 0,
        alpha: { guardClear: false, alphaZeroRatio: 0, sceneContaminated: false }, scene: scene.id,
      }),
    };
  }
  const root = page.locator(selector);
  const rootMetrics = await root.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      overflowX: element.scrollWidth > element.clientWidth,
      overflowY: element.scrollHeight > element.clientHeight,
      overflowXpx: Math.max(0, element.scrollWidth - element.clientWidth),
      overflowYpx: Math.max(0, element.scrollHeight - element.clientHeight),
    };
  });
  const ancestorVisibility = await root.evaluate((element) => {
    let count = 0;
    for (let current = element.parentElement; current && current !== document.body; current = current.parentElement) {
      current.setAttribute('data-overlay-workshop-visual-ancestor', '');
      count += 1;
    }
    return count;
  });
  const ancestorStyle = await page.addStyleTag({
    content: '[data-overlay-workshop-visual-ancestor] { visibility: visible !important; }',
  });
  let captured;
  let rootOnly;
  const captureStartedAt = Date.now();
  try {
    rootOnly = await withTimeout(`${options.surface}/${scene.id} root-only screenshot`, () => captureTransparentRoot(root, page));
    captured = await withTimeout(`${options.surface}/${scene.id} alpha screenshot`, () => captureIsolatedElement(page, { selector, scene }));
  } finally {
    await ancestorStyle.evaluate((element) => element.remove());
    await root.evaluate((element) => {
      for (let current = element.parentElement; current && current !== document.body; current = current.parentElement) {
        current.removeAttribute('data-overlay-workshop-visual-ancestor');
      }
    });
  }
  progress(`${options.surface}/${scene.id} sceneOnly+widget screenshots ${Date.now() - captureStartedAt}ms`);
  const decodeStartedAt = Date.now();
  const widgetPromise = decodePng(page, captured.widget).then((value) => {
    progress(`${options.surface}/${scene.id} decode widget ${Date.now() - decodeStartedAt}ms`);
    return value;
  });
  const scenePromise = decodePng(page, captured.sceneOnly).then((value) => {
    progress(`${options.surface}/${scene.id} decode scene ${Date.now() - decodeStartedAt}ms`);
    return value;
  });
  const [widget, stage] = await Promise.all([widgetPromise, scenePromise]);
  const analysisStartedAt = Date.now();
  const alpha = analyzeRgbaCapture({
    widget: widget.data,
    scene: stage.data,
    width: widget.width,
    height: widget.height,
    guard: captured.geometry.guard,
  });
  progress(`${options.surface}/${scene.id} alpha analysis ${Date.now() - analysisStartedAt}ms`);
  const authorisedOverflow = resolveAuthorisedOverflow(options);
  const alphaWithIntegrity = { ...alpha, sceneContaminated: false };
  const gateInput = {
    provenanceValid: options.provenanceValid,
    rootCount,
    fontsReady,
    consoleErrors: errors.console.length,
    pageErrors: errors.page.length,
    rootOverflowXpx: rootMetrics.overflowXpx,
    rootOverflowYpx: rootMetrics.overflowYpx,
    allowOverflowXpx: authorisedOverflow.xMaxPx,
    allowOverflowYpx: authorisedOverflow.yMaxPx,
    alpha: alphaWithIntegrity,
    scene: scene.id,
  };
  return {
    scene: scene.id, selector, rootCount, fontsReady, rootMetrics, authorisedOverflow, ancestorVisibility,
    alpha: alphaWithIntegrity, gateInput, gates: evaluateWorkshopVisualGates(gateInput),
    rootOnlyHash: sha256(rootOnly), capture: { ...captured, rootOnly },
  };
}

async function main() {
  const options = { ...parseArguments(process.argv.slice(2)), baseUrl: '' };
  const provenance = resolveReportProvenance();
  options.provenanceValid = true;
  await mkdir(outputDirectory, { recursive: true });
  let server;
  let browser;
  try {
    progress('starting Vite');
    const startedServer = await withTimeout('Vite startup', startWorkshopServer, 15000);
    server = startedServer.server;
    options.baseUrl = startedServer.baseUrl;
    const executablePath = process.platform === 'win32' && existsSync(chromeExecutable) ? chromeExecutable : undefined;
    progress('launching Chromium');
    browser = await withTimeout('Chromium launch', () => chromium.launch({ headless: true, executablePath }), 15000);
    const page = await browser.newPage({ viewport: options.viewport, deviceScaleFactor: 1 });
    const errors = { console: [], page: [] };
    page.on('console', (message) => { if (message.type() === 'error') errors.console.push(message.text()); });
    page.on('pageerror', (error) => errors.page.push(error.message));
    const surfaces = options.surface === 'all' ? ['studio', 'desktop', 'obs', 'harness'] : [options.surface];
    const scenarios = [];
    const checkpointPath = path.join(outputDirectory, 'report.json');
    const writeCheckpoint = async () => writeFile(checkpointPath, `${JSON.stringify({
      protocol: 'overlay-workshop-visual-v1', generatedAt: new Date().toISOString(), inProgress: true,
      design: options.design, widgetType: options.widget, system: options.system, surface: options.surface,
      viewport: options.viewport, sha: provenance.sha, dirty: provenance.dirty, scenarios, artifacts: outputDirectory,
    }, null, 2)}\n`);
    for (const surface of surfaces) {
      const surfaceOptions = { ...options, surface };
      for (const scene of WORKSHOP_SCENES) {
        errors.console.length = 0;
        errors.page.length = 0;
        progress(`capturing ${surface}/${scene.id}`);
        let result;
        try {
          result = await captureScene(page, surfaceOptions, scene, errors);
        } catch (error) {
          result = {
            scene: scene.id,
            selector: resolveContractualRendererSelector(surfaceOptions),
            rootCount: 0,
            fontsReady: false,
            alpha: { guardClear: false, alphaZeroRatio: 0, sceneContaminated: true },
            gateInput: { provenanceValid: options.provenanceValid, rootCount: 0, fontsReady: false, consoleErrors: errors.console.length, pageErrors: errors.page.length, rootOverflowXpx: 0, rootOverflowYpx: 0, allowOverflowXpx: 0, allowOverflowYpx: 0, alpha: { guardClear: false, alphaZeroRatio: 0, sceneContaminated: true } },
            gates: { pass: false, errors: [error instanceof Error ? error.message : String(error)] },
          };
        }
        const artifactDirectory = path.join(outputDirectory, `${options.widget}-${options.system}-${options.design}`, surface, scene.id);
        await mkdir(artifactDirectory, { recursive: true });
        if (result.capture) {
          await Promise.all([
            writeFile(path.join(artifactDirectory, 'root.png'), result.capture.rootOnly),
            writeFile(path.join(artifactDirectory, 'scene.png'), result.capture.sceneOnly),
          ]);
        }
        scenarios.push({
          ...result,
          surface,
          capture: result.capture ? { geometry: result.capture.geometry, artifactDirectory } : undefined,
          consoleErrors: errors.console,
          pageErrors: errors.page,
        });
        await writeCheckpoint();
      }
    }
    applySurfaceSceneIntegrity(scenarios);
    const report = {
      protocol: 'overlay-workshop-visual-v1',
      generatedAt: new Date().toISOString(),
      sha: provenance.sha,
      dirty: provenance.dirty,
      design: options.design,
      widgetType: options.widget,
      system: options.system,
      surface: options.surface,
      viewport: options.viewport,
      scenarios,
      pass: scenarios.every((scenario) => scenario.gates.pass),
      artifacts: outputDirectory,
    };
    const reportPath = path.join(outputDirectory, 'report.json');
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`overlay-workshop-visual: ${report.pass ? 'PASS' : 'FAIL'} ${reportPath}\n`);
    if (!report.pass) process.exitCode = 1;
  } finally {
    await browser?.close();
    await server?.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
