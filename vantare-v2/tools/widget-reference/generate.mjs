// Un comando, sin instalar dependencias ni modificar frontend/.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  if (!['--modules', '--output'].includes(args[i])) throw new Error(`Opción desconocida: ${args[i]}`);
}
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Falta valor para ${name}`);
  return path.resolve(args[index + 1]);
}
const modules = option('--modules', path.join(repo, 'frontend/node_modules'));
const output = option('--output', path.join(repo, 'native/ui/reference'));
const require = createRequire(path.join(modules, '../package.json'));
const ts = require('typescript');
const config = ts.readConfigFile(path.join(repo, 'frontend/tsconfig.app.json'), ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
Object.assign(config.config.compilerOptions, {
  incremental: false, types: [], typeRoots: [path.join(modules, '@types')],
  paths: {
    react: [path.join(modules, '@types/react/index.d.ts')], 'react/*': [path.join(modules, '@types/react/*')],
    'react-dom': [path.join(modules, '@types/react-dom/index.d.ts')], 'react-dom/*': [path.join(modules, '@types/react-dom/*')],
    '*': [path.join(modules, '*')],
  },
});
delete config.config.compilerOptions.tsBuildInfoFile;
config.config.include = [path.join(here, 'scene.tsx'), path.join(modules, 'vite/client.d.ts')];
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.join(repo, 'frontend'));
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, parsed.options))];
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: f => f, getCurrentDirectory: () => repo, getNewLine: () => '\n' }));
console.log('scene.tsx: typecheck OK');
const { createServer } = await import(pathToFileURL(require.resolve('vite')));
const { chromium } = require('playwright');
const { default: tailwindcss } = await import(pathToFileURL(require.resolve('@tailwindcss/vite')));
const packages = JSON.parse(await fs.readFile(path.join(repo, 'frontend/package.json'), 'utf8')).dependencies;
const alias = [...Object.keys(packages), 'tailwindcss'].map(name => ({ find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=/|$)`), replacement: path.join(modules, name).replaceAll('\\', '/') }));
const server = await createServer({
  configFile: false, root: here, publicDir: path.join(repo, 'frontend/public'),
  cacheDir: path.join(here, '.vite'), resolve: { alias },
  plugins: [tailwindcss()],
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null, fs: { allow: [repo, modules] } },
});
await fs.mkdir(path.join(here, '.runs'), { recursive: true });
const run = await fs.mkdtemp(path.join(here, '.runs/run-'));
let browser;
try {
  await server.listen();
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  async function newPage() {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1, locale: 'es-ES', timezoneId: 'UTC', colorScheme: 'dark' });
    await page.addInitScript(() => {
      const NativeDate = Date;
      const now = NativeDate.parse('2026-07-14T12:00:00.000Z');
      // Frescura, Calendar y memoización usan una foto fija; los timers siguen
      // corriendo para que el producto alcance su estado final normalmente.
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
      };
      localStorage.setItem('vantare.locale', 'es');
    });
    return page;
  }
  const probe = await newPage();
  await probe.goto(url);
  await probe.waitForFunction(() => window.reference);
  const catalog = await probe.evaluate(() => window.reference.catalog);
  await probe.close();
  const report = { schema: 1, sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), browser: browser.version(), dpi: 100, dpr: 1, locale: 'es', timezone: 'UTC', clock: '2026-07-14T12:00:00.000Z', scene: 'Workshop default / race / track / ready', widgets: [] };
  async function generate(directory) {
    await fs.mkdir(directory, { recursive: true });
    const results = [];
    for (const entry of catalog) {
      if (entry.blocked) { results.push(entry); continue; }
      const page = await newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(`${url}?widget=${entry.type}`);
        await page.addStyleTag({ content: 'html,body,#root { margin:0; padding:0; background:transparent!important; overflow:hidden; } body { font-family:Inter,Arial,sans-serif; } #reference-widget { position:absolute; left:0; top:0; }' });
        await page.locator('[data-widget-renderer]').waitFor({ timeout: 15000 });
        await page.waitForFunction(() => window.reference?.widget);
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].map(image => image.decode()));
        });
        await page.waitForTimeout(1600);
        const size = await page.evaluate(() => {
          const { w, h } = window.reference.widget.layout;
          // Algunos renderers crecen por su SVG/footer aunque el layout tenga
          // una altura menor. Capturar su caja completa sin cambiar el layout.
          const bounds = document.querySelector('[data-widget-renderer]').getBoundingClientRect();
          const rail = document.querySelector('.vf-pit-rail');
          return { width: Math.ceil(Math.max(w + (rail ? 34 : 0), bounds.right)), height: Math.ceil(Math.max(h, bounds.bottom)) };
        });
        await page.setViewportSize(size);
        await page.evaluate(async () => {
          for (const animation of document.getAnimations()) {
            if (animation.effect.getComputedTiming().iterations === Infinity) {
              animation.pause(); animation.currentTime = 0;
            } else { animation.finish(); }
          }
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        const geometry = await page.evaluate(() => {
          const root = document.querySelector('#reference-widget');
          const rect = el => {
            const r = el.getBoundingClientRect();
            return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
          };
          const keys = ['display', 'position', 'boxSizing', 'overflow', 'fontFamily', 'fontSize', 'fontWeight', 'fontVariantNumeric', 'letterSpacing', 'lineHeight', 'color', 'backgroundColor', 'backgroundImage', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft', 'borderRadius', 'boxShadow', 'padding', 'margin', 'gap', 'textAlign', 'textTransform', 'opacity', 'backdropFilter', 'transform', 'translate', 'transition'];
          const style = css => Object.fromEntries(keys.map(key => [key, css[key]]));
          const pseudo = (el, name) => {
            const css = getComputedStyle(el, name);
            return css.content === 'none' ? undefined : { content: css.content, width: css.width, height: css.height, top: css.top, right: css.right, bottom: css.bottom, left: css.left, style: style(css) };
          };
          return { ...window.reference, catalog: undefined, viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
            elements: [root, ...root.querySelectorAll('*')].map((el, index) => ({ index, tag: el.tagName.toLowerCase(), attrs: Object.fromEntries([...el.attributes].map(a => [a.name, a.value])), text: el.children.length ? undefined : (el.textContent || '').trim(), rect: rect(el), style: style(getComputedStyle(el)), pseudoBefore: pseudo(el, '::before'), pseudoAfter: pseudo(el, '::after') })),
            animations: document.getAnimations().map(a => ({ state: a.playState, currentTime: a.currentTime, iterations: String(a.effect.getComputedTiming().iterations) })),
          };
        });
        if (errors.length || geometry.diagnostics.length) throw new Error(JSON.stringify({ errors, diagnostics: geometry.diagnostics }));
        await page.screenshot({ path: path.join(directory, `${entry.type}.png`), omitBackground: true });
        await fs.writeFile(path.join(directory, `${entry.type}.geometry.json`), JSON.stringify(geometry, null, 2) + '\n');
        results.push({ ...entry, ...size, status: geometry.elements.find(el => el.attrs['data-widget-renderer'])?.attrs['data-status'], text: geometry.elements.filter(el => el.text).map(el => el.text).join(' | ') });
        console.log(`${path.basename(directory)} ${entry.type} ${size.width}x${size.height}`);
      } catch (error) {
        results.push({ ...entry, blocked: error.message });
        console.error(`${entry.type}: ${error.message}`);
      } finally { await page.context().close(); }
    }
    return results;
  }
  const first = await generate(path.join(run, 'first'));
  const second = await generate(path.join(run, 'second'));
  await fs.mkdir(output, { recursive: true });
  for (let i = 0; i < first.length; i++) {
    const item = first[i];
    if (item.blocked !== second[i].blocked) throw new Error(`Montaje no determinista: ${item.type}`);
    if (!item.blocked) {
      const name = item.type;
      const diff = JSON.parse(execFileSync('python', [path.join(here, 'diff.py'), path.join(run, 'second', `${name}.png`), path.join(run, 'first', `${name}.png`), '--threshold', '0', '--max-percent', '0', '--json'], { encoding: 'utf8' }));
      const geometryEqual = (await fs.readFile(path.join(run, 'first', `${name}.geometry.json`))).equals(await fs.readFile(path.join(run, 'second', `${name}.geometry.json`)));
      if (!geometryEqual) throw new Error(`Geometría no determinista: ${name}`);
      Object.assign(item, { determinism: diff, geometryEqual });
      for (const extension of ['png', 'geometry.json']) await fs.copyFile(path.join(run, 'second', `${name}.${extension}`), path.join(output, `${name}.${extension}`));
    }
    report.widgets.push(item);
  }
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.widgets.filter(w => !w.blocked).length}/${catalog.length} referencias; 0 píxeles distintos (umbral 0); geometría idéntica. Bloqueos en manifest.json.`);
  if (report.widgets.some(w => w.blocked && !catalog.find(c => c.type === w.type).blocked)) process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
