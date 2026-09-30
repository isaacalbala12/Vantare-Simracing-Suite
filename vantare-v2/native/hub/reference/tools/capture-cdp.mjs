// Usa Playwright ya instalado; no instala nada ni cambia el producto.
// El manifiesto describe navegación visible, nunca inyección de datos/licencias.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const [cdp, modulesRoot, manifestPath, outputDirectory] = process.argv.slice(2);
if (!outputDirectory) throw new Error('Uso: node capture-cdp.mjs CDP NODE_MODULES MANIFEST.json OUTPUT_DIR');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const output = path.resolve(outputDirectory);
const relative = path.relative(repo, output);
if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('Evidencia dentro del repo');
const states = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
if (!Array.isArray(states) || states.some(s => !/^[a-z0-9-]+$/.test(s.name))) throw new Error('Nombres de captura inválidos');
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(path.resolve(modulesRoot), 'playwright'));
const browser = await chromium.connectOverCDP(cdp);
const results = [];
try {
    const pages = browser.contexts().flatMap(context => context.pages());
    if (pages.length !== 1) throw new Error('Se requiere un único target WebView2 inequívoco');
    const page = pages[0];
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(60000);
    await fs.mkdir(output, { recursive: true });
    for (const state of states) {
        try {
            if (state.url) await page.goto(state.url, { waitUntil: 'domcontentloaded' });
            if (state.ready) await page.locator(state.ready).waitFor();
            for (const action of state.actions ?? []) {
                if (action.click) await page.locator(action.click).click();
                else if (action.fill) await page.locator(action.fill[0]).fill(action.fill[1]);
                else if (action.press) await page.keyboard.press(action.press);
                else if (action.scroll) await page.locator(action.scroll).evaluate(el => { el.scrollTop = el.scrollHeight; });
                else throw new Error('Acción desconocida');
            }
            if (state.visible) await page.locator(state.visible).waitFor();
            await page.evaluate(() => document.fonts.ready);
            // Dejar acabar entrada de paneles/popovers antes de recoger el frame.
            await page.waitForTimeout(600);
            const geometry = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
            if (geometry.width !== 1440 || geometry.height !== 900 || geometry.dpr !== 1) throw new Error(`Geometría inválida: ${JSON.stringify(geometry)}`);
            const png = await page.screenshot({ path: path.join(output, `${state.name}.png`) });
            const text = await page.locator('body').innerText();
            await fs.writeFile(path.join(output, `${state.name}.txt`), text);
            results.push({ name: state.name, url: page.url(), ...geometry, sha256: createHash('sha256').update(png).digest('hex'), status: 'captured' });
        } catch (error) {
            results.push({ name: state.name, status: 'blocked', error: error.message });
        }
        await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(results, null, 2));
    }
} finally {
    await browser.close(); // Desconecta CDP; el cierre del proceso pertenece al operador.
}
console.log(`${results.filter(r => r.status === 'captured').length}/${states.length} capturas; véase manifest.json`);
if (results.some(r => r.status === 'blocked')) process.exitCode = 1;
