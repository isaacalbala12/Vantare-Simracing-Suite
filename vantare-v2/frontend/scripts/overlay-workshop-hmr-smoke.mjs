import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
export const frontendRoot = path.resolve(scriptDirectory, '..');
export const repositoryRoot = path.resolve(frontendRoot, '..', '..');

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function assertExactlyOne(source, anchor, replacement) {
  const count = source.split(anchor).length - 1;
  if (count !== 1) throw new Error(`expected exactly one anchor, found ${count}`);
  return source.replace(anchor, replacement);
}

export function readGitStatus(paths) {
  return execFileSync('git', ['status', '--porcelain', '--', ...paths], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function assertGitClean(paths, readStatus = readGitStatus) {
  const output = readStatus(paths);
  if (output) throw new Error(`HMR smoke requires a clean worktree under ${paths.join(', ')}:\n${output}`);
}

// Ancla literal: depende de la indentación exacta y de que ambas líneas sigan
// siendo adyacentes en DeltaOriginal.tsx. Si reformateas o reordenas ese JSX,
// actualiza esta constante; el smoke falla en seco con "found 0", nunca en silencio.
const TSX_ANCHOR = '      data-tone={model.tone}\r\n      className="vo-delta"';
const TSX_MARKER = '      data-overlay-workshop-hmr-tsx="active"\r\n';
const CSS_MARKER = '\r\n[data-widget-system="vantare-original"].vo-delta[data-overlay-workshop-hmr-tsx="active"] {\r\n  --overlay-workshop-hmr-css: 17px;\r\n}\r\n';
const chromeExecutable = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export function buildTsxMutation(bytes) {
  const source = bytes.toString('utf8');
  const anchor = source.includes(TSX_ANCHOR) ? TSX_ANCHOR : TSX_ANCHOR.replaceAll('\r\n', '\n');
  const newline = source.includes(TSX_ANCHOR) ? '\r\n' : '\n';
  const marker = TSX_MARKER.replaceAll('\r\n', newline);
  const replacement = anchor.replace('      className', `${marker}      className`);

  return {
    mutated: Buffer.from(assertExactlyOne(source, anchor, replacement)),
    removeOwnMarker: (observed) => Buffer.from(
      assertExactlyOne(observed.toString('utf8'), marker, ''),
    ),
  };
}

export function buildCssMutation(bytes) {
  const source = bytes.toString('utf8');
  if (source.includes('--overlay-workshop-hmr-css')) {
    throw new Error('temporary HMR CSS marker already exists');
  }
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const marker = CSS_MARKER.replaceAll('\r\n', newline);

  return {
    mutated: Buffer.from(`${source}${marker}`),
    removeOwnMarker: (observed) => Buffer.from(
      assertExactlyOne(observed.toString('utf8'), marker, ''),
    ),
  };
}

function progress(phase) {
  process.stdout.write(`[overlay-workshop-hmr] ${phase}\n`);
}

export function formatError(error) {
  if (!(error instanceof Error)) return String(error);
  const nested = error instanceof AggregateError
    ? error.errors.map(formatError).join('\n')
    : '';
  return [error.stack ?? error.message, nested].filter(Boolean).join('\n');
}

export async function closeWithTimeout(label, close, timeoutMs = 5000) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(close),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function listenWorkshopServer(server) {
  try {
    await server.listen();
  } catch (listenError) {
    try {
      await closeWithTimeout('Vite cleanup after failed listen', () => server.close());
    } catch (closeError) {
      throw new AggregateError([listenError, closeError], 'Vite listen and cleanup failed');
    }
    throw listenError;
  }
}

async function startWorkshopServer() {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: frontendRoot,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 5183, strictPort: false },
  });
  await listenWorkshopServer(server);
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 5183;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

function installSignalCancellation(controller) {
  let requestedExitCode = 0;
  const onSigint = () => {
    requestedExitCode = 130;
    if (!controller.signal.aborted) controller.abort(new Error('SIGINT requested'));
  };
  const onSigterm = () => {
    requestedExitCode = 143;
    if (!controller.signal.aborted) controller.abort(new Error('SIGTERM requested'));
  };
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  return {
    exitCode: () => requestedExitCode,
    dispose: () => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
    },
  };
}

function workshopUrl(baseUrl) {
  const query = new URLSearchParams({
    widget: 'delta', system: 'vantare-original', design: 'delta-original-base', state: 'ready',
    surface: 'studio', variant: 'default', session: 'race', location: 'track',
    background: 'transparent', scale: '1', preset: '1080p',
  });
  return `${baseUrl}/workshop?${query}`;
}

async function waitForComputedProperty(page, expected) {
  await page.waitForFunction((value) => {
    const root = document.querySelector('[data-widget-renderer="delta"]');
    return root && getComputedStyle(root).getPropertyValue('--overlay-workshop-hmr-css').trim() === value;
  }, expected);
}

async function assertNoReload(page, sentinel, navigationCount, phase) {
  const current = await page.evaluate(() => window.__vantareWorkshopHmrSentinel);
  if (current !== sentinel) throw new Error(`${phase}: page sentinel changed; HMR became a reload`);
  if (navigationCount() !== 0) throw new Error(`${phase}: main frame navigated during HMR`);
}

async function assertEndpointClosed(baseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(baseUrl, { signal: controller.signal });
    throw new Error(`Vite endpoint still responds after cleanup: ${response.status}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Vite endpoint still responds')) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Vite endpoint did not close before timeout');
    }
  } finally {
    clearTimeout(timer);
  }
}

async function writeRecoveryEvidence(directory, { original, observed, cleaned }) {
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, 'original.bin'), original),
    writeFile(path.join(directory, 'observed.bin'), observed),
    writeFile(path.join(directory, 'cleaned.bin'), cleaned),
    writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify({
      originalSha256: sha256(original),
      observedSha256: sha256(observed),
      cleanedSha256: sha256(cleaned),
    }, null, 2)}\n`),
  ]);
}

export async function mutateFileTemporarily({
  file,
  buildMutation,
  verify,
  recoveryDirectory,
  signal,
}) {
  const original = await readFile(file);
  const mutation = buildMutation(original);
  let verificationError;
  let cleanupError;
  try {
    if (signal?.aborted) throw signal.reason ?? new Error('operation aborted');
    await writeFile(file, mutation.mutated);
    await verify();
    if (signal?.aborted) throw signal.reason ?? new Error('operation aborted');
  } catch (error) {
    verificationError = error;
  } finally {
    const observed = await readFile(file);
    if (observed.equals(mutation.mutated)) {
      await writeFile(file, original);
    } else {
      let cleaned = observed;
      let markerRemovalError;
      try {
        cleaned = mutation.removeOwnMarker(observed);
      } catch (error) {
        markerRemovalError = error;
      }
      if (!cleaned.equals(observed)) await writeFile(file, cleaned);
      if (recoveryDirectory) {
        await writeRecoveryEvidence(recoveryDirectory, { original, observed, cleaned });
      }
      cleanupError = markerRemovalError
        ? new AggregateError(
            [markerRemovalError],
            'concurrent drift detected; own marker could not be isolated and observed bytes were preserved',
          )
        : new Error('concurrent drift detected; external bytes preserved and recovery evidence written');
    }
  }
  if (cleanupError && verificationError) {
    throw new AggregateError([verificationError, cleanupError], 'verification and cleanup both failed');
  }
  if (cleanupError) throw cleanupError;
  if (verificationError) throw verificationError;
  const restored = await readFile(file);
  if (!restored.equals(original)) throw new Error('restoration was not byte-for-byte');
}

async function main() {
  const relativeTsx = 'vantare-v2/frontend/src/overlay/design-systems/vantare-original/delta/DeltaOriginal.tsx';
  const relativeCss = 'vantare-v2/frontend/src/overlay/design-systems/vantare-original/tokens.css';
  const tsxFile = path.join(repositoryRoot, relativeTsx);
  const cssFile = path.join(repositoryRoot, relativeCss);
  const recoveryRoot = path.join(frontendRoot, '.tmp', 'overlay-workshop-hmr-smoke');
  assertGitClean(['vantare-v2']);

  const originalTsx = await readFile(tsxFile);
  const originalCss = await readFile(cssFile);
  let server;
  let baseUrl;
  let browser;
  let operationError;
  const cleanupErrors = [];
  const consoleErrors = [];
  const pageErrors = [];
  const cancellationController = new AbortController();
  const signalCancellation = installSignalCancellation(cancellationController);
  try {
    const started = await startWorkshopServer();
    server = started.server;
    baseUrl = started.baseUrl;
    if (cancellationController.signal.aborted) throw cancellationController.signal.reason;
    const executablePath = process.platform === 'win32' && existsSync(chromeExecutable)
      ? chromeExecutable
      : undefined;
    try {
      browser = await chromium.launch({ headless: true, executablePath, timeout: 15_000 });
    } catch (error) {
      throw new Error(
        `No usable Chromium was found. Install Playwright Chromium or Google Chrome at ${chromeExecutable}. ${error instanceof Error ? error.message : error}`,
      );
    }
    if (cancellationController.signal.aborted) throw cancellationController.signal.reason;
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    let navigationCount = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigationCount += 1;
    });
    await page.goto(workshopUrl(baseUrl), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-widget-renderer="delta"]').waitFor();
    navigationCount = 0;
    const sentinel = `hmr-${Date.now()}-${Math.random()}`;
    await page.evaluate((value) => { window.__vantareWorkshopHmrSentinel = value; }, sentinel);
    await page.waitForFunction(() => !document.querySelector('[data-overlay-workshop-hmr-tsx="active"]'));
    await waitForComputedProperty(page, '');

    await mutateFileTemporarily({
      file: tsxFile,
      buildMutation: buildTsxMutation,
      recoveryDirectory: path.join(recoveryRoot, 'tsx'),
      signal: cancellationController.signal,
      verify: async () => {
        await page.locator('[data-widget-renderer="delta"][data-overlay-workshop-hmr-tsx="active"]').waitFor();
        await waitForComputedProperty(page, '');
        await assertNoReload(page, sentinel, () => navigationCount, 'tsx apply');
        progress('tsx transition observed without navigation');
        await mutateFileTemporarily({
          file: cssFile,
          buildMutation: buildCssMutation,
          recoveryDirectory: path.join(recoveryRoot, 'css'),
          signal: cancellationController.signal,
          verify: async () => {
            await waitForComputedProperty(page, '17px');
            await assertNoReload(page, sentinel, () => navigationCount, 'css apply');
            progress('css transition observed without navigation');
          },
        });
        await waitForComputedProperty(page, '');
        await assertNoReload(page, sentinel, () => navigationCount, 'css restore');
        progress('css restoration observed without navigation');
      },
    });
    await page.waitForFunction(() => !document.querySelector('[data-overlay-workshop-hmr-tsx="active"]'));
    await assertNoReload(page, sentinel, () => navigationCount, 'tsx restore');
    progress('tsx restoration observed without navigation');

    if (!(await readFile(tsxFile)).equals(originalTsx)) throw new Error('TSX restoration mismatch');
    if (!(await readFile(cssFile)).equals(originalCss)) throw new Error('CSS restoration mismatch');
    assertGitClean(['vantare-v2']);
    if (consoleErrors.length || pageErrors.length) {
      throw new Error(`browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);
    }
  } catch (error) {
    operationError = error;
  } finally {
    const cleanupResults = await Promise.allSettled([
      browser ? closeWithTimeout('browser close', () => browser.close()) : Promise.resolve(),
      server ? closeWithTimeout('Vite close', () => server.close()) : Promise.resolve(),
    ]);
    for (const result of cleanupResults) {
      if (result.status === 'rejected') cleanupErrors.push(result.reason);
    }
    const requestedExitCode = signalCancellation.exitCode();
    signalCancellation.dispose();
    if (requestedExitCode) {
      process.exitCode = requestedExitCode;
      operationError ??= new Error(`signal cancellation completed with exit code ${requestedExitCode}`);
    }
  }
  if (browser?.isConnected()) cleanupErrors.push(new Error('browser remains connected'));
  if (baseUrl) await assertEndpointClosed(baseUrl).catch((error) => cleanupErrors.push(error));
  if (operationError || cleanupErrors.length) {
    throw new AggregateError(
      [operationError, ...cleanupErrors].filter(Boolean),
      'overlay-workshop-hmr-smoke failed',
    );
  }
  process.stdout.write('overlay-workshop-hmr-smoke: PASS (tsx + css + byte restoration + resource cleanup)\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    process.stderr.write(`${formatError(error)}\n`);
    if (!process.exitCode) process.exitCode = 1;
  });
}
