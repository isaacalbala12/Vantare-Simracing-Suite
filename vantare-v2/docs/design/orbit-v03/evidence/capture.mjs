// Captura de evidencia del prototipo Command Orbit v0.3.
// Uso: node docs/design/orbit-v03/evidence/capture.mjs  (desde la raíz del repo; usa el Playwright de frontend/)
import { chromium } from "../../../../frontend/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = path.resolve(here, "../../../../vantare-exploration-v03-orbit.html");
const url = "file:///" + html.replace(/\\/g, "/");
const SHOTS = [
  ["inicio", "?view=inicio"],
  ["studio", "?view=studio"],
  ["launcher", "?view=launcher"],
  ["carreras-proximas", "?view=carreras"],
  ["carreras-timeline", "?view=carreras", async p => p.click('[data-calview="timeline"]')],
  ["carreras-mes", "?view=carreras", async p => p.click('[data-calview="month"]')],
  ["estrategia-resumen", "?view=estrategia"],
  ["estrategia-editor-neumaticos", "?view=estrategia", async p => { await p.click('[data-edit="0"]'); await p.click('[data-rpanel="tyres"]'); }],
  ["estrategia-estrategias", "?view=estrategia", async p => p.click('[data-etab="strategies"]')],
  ["estrategia-disponibilidad", "?view=estrategia", async p => p.click('[data-etab="availability"]')],
  ["ingeniero", "?view=ingeniero"],
  ["telemetria", "?view=telemetria"],
  ["roadmap", "?view=roadmap"],
  ["ajustes-cuenta", "?view=ajustes&settings=account"],
  ["ajustes-atajos", "?view=ajustes&settings=hotkeys"],
  ["ajustes-actualizaciones", "?view=ajustes&settings=updates"],
  ["paleta", "?view=inicio", async p => p.keyboard.press("Control+K")],
  ["inicio-900", "?view=inicio", null, { width: 1920, height: 900 }],
];

const browser = await chromium.launch();
for (const [name, query, action, viewport] of SHOTS) {
  const page = await browser.newPage({ viewport: viewport || { width: 1920, height: 1080 }, reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto(url + query + "&sidebar=expanded");
  await page.waitForTimeout(400);
  if (action) { await action(page); await page.waitForTimeout(300); }
  const out = path.join(here, `${name}.png`);
  await page.screenshot({ path: out });
  console.log("✓", path.basename(out));
  await page.close();
}
await browser.close();
fs.writeFileSync(path.join(here, "README.md"), `# Evidencia visual · Command Orbit v0.3\n\nCapturas generadas con \`capture.mjs\` desde el HTML del prototipo (1920×1080 salvo \`inicio-900\`).\n\n${SHOTS.map(([n]) => `- ![${n}](${n}.png)`).join("\n")}\n`);
