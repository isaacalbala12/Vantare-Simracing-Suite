import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { settle, stillPage } from './lib/orbit-still.mjs';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.resolve(frontend, '../docs/strategy-planner/evidence/isa-1277-visual');
const pass = process.env.RECORDED_VISUAL_PASS ?? 'pass-01';
const output = path.join(evidence, pass);
const port = Number.parseInt(process.env.RECORDED_VISUAL_PORT ?? '5208', 10);
const baseUrl = `http://127.0.0.1:${port}/recorded-strategy-harness.html`;
const clock = new Date('2026-09-15T12:05:00Z');
fs.mkdirSync(output, { recursive: true });

function portOwners() {
  if (process.platform !== 'win32') return [];
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) -join ','`,
  ], { encoding: 'utf8', windowsHide: true });
  return result.stdout.trim().split(',').map((value) => value.trim()).filter(Boolean);
}

const owners = portOwners();
if (owners.length) throw new Error(`port ${port} already owned by ${owners.join(', ')}`);
const server = spawn(process.execPath, [path.join(frontend, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: frontend, env: { ...process.env, VITE_RUNTIME_MOCK: 'mock' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32',
});
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });
function stopServer() {
  if (!server.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else { try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already stopped */ } }
}
async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const request = http.get(baseUrl, (response) => { response.resume(); resolve(response.statusCode === 200); });
      request.on('error', () => resolve(false)); request.setTimeout(800, () => { request.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`recorded Strategy harness did not start\n${serverOutput}`);
}

async function pageFor(browser, width, height, locale = 'es', calculation = '', catalog = '') {
  const page = await stillPage(browser, { viewport: { width, height }, deviceScaleFactor: 1, timezoneId: 'Europe/Madrid' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(clock);
  const query = new URLSearchParams({ locale });
  if (calculation) query.set('calculation', calculation);
  if (catalog) query.set('catalog', catalog);
  await page.goto(`${baseUrl}?${query}`, { waitUntil: 'networkidle' });
  await page.getByTestId('orbit-strategy').waitFor();
  await settle(page);
  return { page, errors };
}

async function openSaved(page) {
  const open = page.locator('[data-testid="strategy-entry-saved"] section button').first();
  await open.waitFor(); await open.click();
  const dialog = page.getByRole('alertdialog');
  await dialog.waitFor();
  await dialog.getByRole('button').last().click();
  await page.locator('#recorded-tab-race').waitFor();
  await settle(page);
}

async function screenshot(page, name, fullPage = false) {
  await settle(page);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage });
}

async function resetScroll(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll('*').forEach((element) => {
      if (element instanceof HTMLElement) {
        element.scrollTop = 0;
        element.scrollLeft = 0;
      }
    });
  });
}

async function widthContract(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.orbit-shell');
    const nodes = root ? [...root.querySelectorAll('*')] : [];
    const overflow = nodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      let parent = node.parentElement;
      let intentionallyClipped = false;
      while (parent && parent !== root) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden' || overflowX === 'clip') { intentionallyClipped = true; break; }
        parent = parent.parentElement;
      }
      return !intentionallyClipped && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.right > innerWidth + 1 && rect.left < innerWidth;
    }).slice(0, 8).map((node) => ({ tag: node.tagName, className: node.className, right: Math.round(node.getBoundingClientRect().right) }));
    return { innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow };
  });
}

async function openAnalysis(page) {
  await page.locator('#recorded-tab-data').click();
  await page.locator('#recorded-panel-data button').filter({ hasText: /fuentes/i }).click();
  const sources = page.getByTestId('strategy-recorded-source-screen');
  await sources.locator('button').filter({ hasText: /Buscar|Search|Procurar|Cerca/i }).first().click();
  await sources.locator('.orbit-strategy__session-row button:enabled').filter({ hasText: /Abrir|Open|Apri/i }).first().click();
  await sources.locator('button').filter({ hasText: /Inspeccionar|Inspect|Ispeziona/i }).click();
  await page.locator('#recorded-panel-data select').first().waitFor();
  await settle(page);
}

async function captureMain(browser) {
  const { page, errors } = await pageFor(browser, 1672, 941);
  await screenshot(page, '01-entry');
  await openSaved(page);
  await screenshot(page, '06-editor-race');
  await page.locator('.strategy-recorded-editor-bar > button').click();
  await screenshot(page, '02-preparation-summary');
  await page.locator('.strategy-preparation__inspector nav button').filter({ hasText: /Reglas/i }).click();
  await screenshot(page, '03-preparation-rules');
  await page.locator('.strategy-preparation__inspector nav button').filter({ hasText: /Pilotos/i }).click();
  await screenshot(page, '04-preparation-drivers');
  await page.locator('.strategy-preparation__car button').click();
  await screenshot(page, '05-preparation-combination');
  await page.close();

  const combinationSources = await pageFor(browser, 1672, 941, 'es', '', 'empty');
  await combinationSources.page.getByRole('button', { name: /Abrir telemetría/i }).click();
  const combinationSourceScreen = combinationSources.page.getByTestId('strategy-recorded-source-screen');
  await combinationSourceScreen.waitFor();
  await screenshot(combinationSources.page, '02b-combination-sources');
  const combinationSourceWidth = await widthContract(combinationSources.page);
  if (combinationSourceWidth.scrollWidth > combinationSourceWidth.innerWidth || combinationSourceWidth.overflow.length) {
    throw new Error(`combination source screen width contract failed\n${JSON.stringify(combinationSourceWidth, null, 2)}`);
  }
  await combinationSources.page.close();

  const dataRun = await pageFor(browser, 1672, 941);
  await openSaved(dataRun.page);
  await dataRun.page.locator('#recorded-tab-data').click();
  await screenshot(dataRun.page, '07-data-empty');
  await dataRun.page.locator('#recorded-panel-data button').filter({ hasText: /fuentes/i }).click();
  const drawer = dataRun.page.getByTestId('strategy-recorded-source-screen');
  await drawer.locator('button').filter({ hasText: /Buscar/i }).first().click();
  await screenshot(dataRun.page, '08-data-sources');
  await drawer.locator('.orbit-strategy__session-row button:enabled').filter({ hasText: /Abrir/i }).first().click();
  await drawer.locator('button').filter({ hasText: /Inspeccionar/i }).click();
  await dataRun.page.locator('#recorded-panel-data button').filter({ hasText: /Consultar vueltas/i }).click();
  await dataRun.page.locator('#recorded-panel-data button').filter({ hasText: /Vuelta 21/i }).waitFor();
  await screenshot(dataRun.page, '09-data-laps');
  await dataRun.page.locator('#recorded-panel-data button').filter({ hasText: /avanzado/i }).click();
  const channel = dataRun.page.locator('#recorded-panel-data select').filter({ has: dataRun.page.locator('option[value="fuel"]') });
  if (await channel.count()) await channel.selectOption('fuel');
  await dataRun.page.locator('.strategy-recorded-data__table').waitFor();
  await screenshot(dataRun.page, '10-data-advanced');
  await dataRun.page.locator('#recorded-tab-revisions').click();
  await screenshot(dataRun.page, '11-revisions');
  await dataRun.page.close();

  const planRun = await pageFor(browser, 1672, 941);
  await openSaved(planRun.page);
  await planRun.page.locator('#recorded-tab-plan').click();
  await screenshot(planRun.page, '12-plan-idle');
  await planRun.page.locator('#recorded-panel-plan footer button').filter({ hasText: /Calcular/i }).click();
  await planRun.page.locator('[data-optimality]').waitFor();
  await screenshot(planRun.page, '13-plan-calculated');
  await planRun.page.locator('.strategy-recorded-plan__editors button').first().click();
  await planRun.page.locator('.strategy-recorded-stint-editor').waitFor();
  await screenshot(planRun.page, '14-stint-editor');
  await planRun.page.locator('.strategy-recorded-plan__editor-head button').click();
  await planRun.page.locator('.strategy-recorded-plan__editors button').nth(1).click();
  await planRun.page.locator('.strategy-recorded-pit-editor').waitFor();
  await planRun.page.locator('.strategy-recorded-pit-editor').evaluate((element) => {
    for (let current = element; current; current = current.parentElement) current.scrollLeft = 0;
    window.scrollTo(0, 0);
  });
  await screenshot(planRun.page, '15-pit-editor');
  await planRun.page.evaluate(() => history.replaceState(null, '', `${location.pathname}?locale=es&calculation=error`));
  await planRun.page.getByLabel(/Fuel añadido 1/i).fill('200');
  await planRun.page.getByRole('button', { name: /Recalcular parada/i }).click();
  await planRun.page.locator('#recorded-panel-plan [role="alert"]').waitFor();
  const recovery = planRun.page.locator('.strategy-recorded-plan__editor-head button');
  await recovery.waitFor();
  await screenshot(planRun.page, '15b-pit-error-recovery');
  await recovery.click();
  await planRun.page.getByRole('button', { name: /Reintentar/i }).waitFor();
  await screenshot(planRun.page, '15c-plan-error-retry');
  await planRun.page.close();

  for (const [mode, name] of [['slow', '16-plan-loading'], ['partial', '17-plan-partial'], ['error', '18-plan-error']]) {
    const run = await pageFor(browser, 1672, 941, 'es', mode);
    await openSaved(run.page); await run.page.locator('#recorded-tab-plan').click();
    await run.page.locator('#recorded-panel-plan footer button').filter({ hasText: /Calcular/i }).click();
    if (mode === 'slow') await run.page.waitForTimeout(180);
    else if (mode === 'partial') await run.page.locator('.strategy-recorded-plan__partial').waitFor();
    else await run.page.locator('#recorded-panel-plan [role="alert"]').waitFor();
    await screenshot(run.page, name); await run.page.close();
  }
  return errors;
}

async function captureMatrix(browser) {
  const report = [];
  for (const locale of ['es', 'en', 'pt', 'it']) {
    for (const width of [320, 768, 1024, 1672]) {
      const run = await pageFor(browser, width, 941, locale);
      const start = await widthContract(run.page);
      await screenshot(run.page, `matrix-${locale}-${width}-start`);
      await openSaved(run.page);
      await run.page.locator('#recorded-tab-plan').click();
      const plan = await widthContract(run.page);
      await screenshot(run.page, `matrix-${locale}-${width}-plan`);
      const journeys = {};
      if (width <= 768) {
        await run.page.locator('#recorded-tab-data').click();
        await run.page.locator('#recorded-panel-data button').filter({ hasText: /fuentes|sources|fontes|fonti/i }).click();
        const drawer = run.page.getByTestId('strategy-recorded-source-screen');
        await drawer.locator('button').filter({ hasText: /Buscar|Find|Procurar|Cerca/i }).first().click();
        journeys.sources = await widthContract(run.page);
        await screenshot(run.page, `matrix-${locale}-${width}-sources`);
        await drawer.locator('.orbit-strategy__session-row button:enabled').filter({ hasText: /Abrir|Open|Apri/i }).first().click();
        await drawer.locator('button').filter({ hasText: /Inspeccionar|Inspecionar|Inspect|Ispeziona/i }).click();
        await run.page.locator('#recorded-panel-data button').filter({ hasText: /Consultar vueltas|Inspect laps|Consultar voltas|Consulta giri/i }).click();
        await run.page.locator('.strategy-recorded-laps__table').waitFor();
        await resetScroll(run.page);
        journeys.laps = await widthContract(run.page);
        await screenshot(run.page, `matrix-${locale}-${width}-laps`);
        await run.page.locator('#recorded-tab-plan').click();
        await run.page.locator('#recorded-panel-plan footer button').last().click();
        await run.page.locator('[data-optimality]').waitFor();
        await resetScroll(run.page);
        journeys.calculated = await widthContract(run.page);
        await screenshot(run.page, `matrix-${locale}-${width}-calculated`);
        await run.page.locator('.strategy-recorded-plan__editors button').first().click();
        if (locale === 'es' && width === 320) {
          await run.page.locator('.strategy-recorded-plan__inspector > header').scrollIntoViewIfNeeded();
          await screenshot(run.page, 'matrix-es-320-stint-context');
        }
        await run.page.locator('.strategy-recorded-stint-editor').scrollIntoViewIfNeeded();
        journeys.stint = await widthContract(run.page);
        await screenshot(run.page, `matrix-${locale}-${width}-stint`);
        await run.page.locator('.strategy-recorded-plan__editor-head button').click();
        await run.page.locator('.strategy-recorded-plan__editors button').nth(1).click();
        if (locale === 'es' && width === 320) {
          await run.page.locator('.strategy-recorded-plan__inspector > header').scrollIntoViewIfNeeded();
          await screenshot(run.page, 'matrix-es-320-pit-context');
        }
        await run.page.locator('.strategy-recorded-pit-editor').scrollIntoViewIfNeeded();
        journeys.pit = await widthContract(run.page);
        await screenshot(run.page, `matrix-${locale}-${width}-pit`);
      }
      const focused = await run.page.keyboard.press('Tab').then(() => run.page.evaluate(() => ({ tag: document.activeElement?.tagName, visible: document.activeElement ? getComputedStyle(document.activeElement).outlineStyle !== 'none' || getComputedStyle(document.activeElement).boxShadow !== 'none' : false })));
      if (locale === 'es' && [320, 768, 1672].includes(width)) await screenshot(run.page, `matrix-${locale}-${width}-focus`);
      report.push({ locale, width, start, plan, journeys, focused, errors: run.errors });
      await run.page.close();
    }
  }
  fs.writeFileSync(path.join(output, 'responsive.json'), `${JSON.stringify(report, null, 2)}\n`);
  const failures = report.filter((item) => [item.start, item.plan, ...Object.values(item.journeys)].some(check => check.scrollWidth > check.innerWidth || check.overflow.length) || item.errors.length);
  if (failures.length) throw new Error(`responsive contract failed\n${JSON.stringify(failures, null, 2)}`);
}

async function captureInlineSessions(browser) {
  const run = await pageFor(browser, 1208, 941);
  await run.page.getByRole('button', { name: /Abrir telemetría/i }).click();
  const sourceScreen = run.page.getByTestId('strategy-recorded-source-screen');
  await sourceScreen.locator('button').filter({ hasText: /Buscar sesiones/i }).click();
  const contract = await widthContract(run.page);
  await screenshot(run.page, '05b-sesiones-1208');
  if (contract.scrollWidth > contract.innerWidth || contract.overflow.length || run.errors.length) {
    throw new Error(`inline sessions width contract failed\n${JSON.stringify({ contract, errors: run.errors }, null, 2)}`);
  }
  await run.page.close();
}

async function verifyTwoSessions(browser) {
  const run = await pageFor(browser, 1280, 800);
  try {
    await openSaved(run.page);
    await run.page.locator('#recorded-tab-data').click();
    await run.page.locator('#recorded-panel-data button').filter({ hasText: /fuentes/i }).click();
    const sources = run.page.getByTestId('strategy-recorded-source-screen');
    await sources.getByRole('button', { name: /Buscar sesiones/i }).click();
    await sources.locator('.orbit-strategy__session-row button:enabled').filter({ hasText: /Abrir/i }).first().click();
    await sources.locator('.orbit-strategy__session-row button:enabled').filter({ hasText: /Abrir/i }).first().click();
    await sources.getByText('2/4').waitFor();
    await sources.getByRole('button', { name: /Inspeccionar/i }).last().click();
    await run.page.locator('#recorded-panel-data button').filter({ hasText: /Consultar vueltas/i }).click();
    await run.page.getByRole('button', { name: /Vuelta 25/i }).waitFor();
    if (await run.page.getByRole('alert').count()) throw new Error('second session laps failed');
    if (run.errors.length) throw new Error(`second session page errors: ${run.errors.join(', ')}`);
  } finally {
    await run.page.close();
  }
}

async function verifyPracticeAsNewRace(browser) {
  const run = await pageFor(browser, 1280, 800);
  try {
    await run.page.getByRole('button', { name: 'Abrir telemetría' }).click();
    const sessions = run.page.getByRole('list', { name: 'Archivos de telemetría' });
    await sessions.getByRole('button', { name: 'Usar sesión' }).last().click();
    await run.page.getByRole('button', { name: 'Abrir mesa de carrera ↗' }).click();
    try {
      await run.page.locator('#recorded-tab-race').waitFor({ timeout: 5000 });
    } catch (error) {
      const alerts = await run.page.getByRole('alert').allTextContents();
      const text = (await run.page.locator('body').innerText()).slice(-2000);
      throw new Error(`Practice editor did not open: ${JSON.stringify({ alerts, text, errors: run.errors })}`, { cause: error });
    }
    await run.page.getByText('Borrador guardado').waitFor();
    if (await run.page.getByRole('alert').count()) throw new Error('Practice as new race showed an error');
    if (run.errors.length) throw new Error(`Practice as new race page errors: ${run.errors.join(', ')}`);
  } finally {
    await run.page.close();
  }
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  if (process.env.RECORDED_VISUAL_VERIFY_ONLY === '1') {
    await verifyPracticeAsNewRace(browser);
    console.log('recorded Strategy Practice flow: PASS');
  } else {
    await captureMain(browser);
    await captureInlineSessions(browser);
    await verifyTwoSessions(browser);
    await verifyPracticeAsNewRace(browser);
    await captureMatrix(browser);
    const count = fs.readdirSync(output).filter((name) => name.endsWith('.png')).length;
    fs.writeFileSync(path.join(output, 'README.md'), `# T18 · ${pass}\n\n${count} capturas del frontend productivo en la shell Orbit, incluidos los estados principales, la lista de sesiones a 1208 px y variantes responsive ES/EN/PT/IT. El banco es determinista; no es prueba Wails, LMU ni DuckDB real.\n`);
    console.log(`recorded Strategy visual evidence: ${output}`);
  }
} finally {
  if (browser) await browser.close();
  stopServer();
}
