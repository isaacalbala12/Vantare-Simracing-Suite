// Exporta los módulos reales con el Playwright ya instalado en frontend.
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const [server, output] = process.argv.slice(2);
if (!server || !output) {
  throw new Error('Uso: node native/ui/export-workshop-scenes.mjs http://127.0.0.1:5197 exported-scenes.json');
}
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage();
  await page.goto(`${server}/workshop`);
  const result = await page.evaluate(async () => {
    const fixtures = await import('/src/overlay/authoring/fixtures/authoring-v2-workshop-frame.ts');
    const animations = await import('/src/overlay/authoring/fixtures/animation-scenes.ts');
    const widgets = [
      'standings', 'relative', 'delta', 'pedals', 'broadcast-tower',
      'fuel-strategy', 'pedals-telemetry', 'racing-flags', 'fastest-lap',
      'delta-trace', 'head-to-head', 'input-telemetry', 'multiclass-relative',
      'track-weather', 'car-damage-visual', 'car-damage-numbers', 'track-map', 'radar',
    ];
    return widgets.flatMap(widget => {
      const base = {
        widget, system: 'vantare-functional', variant: 'default',
        state: 'ready', session: 'race', location: 'track',
        ...(widget === 'standings' ? { standingRows: 30 } : {}),
      };
      const stationary = {
        id: `${widget}-default`, widget, label: 'Sin animación', frameMs: 1200,
        frames: [{ caption: 'Diseño estático', runtime: fixtures.buildWorkshopFrameV2(base) }],
      };
      const scenes = animations.listAnimationScenes(widget, 'vantare-functional', 'race')
        .map(scene => ({
          ...scene,
          frames: scene.frames.map((frame, index) => ({
            caption: frame.caption,
            runtime: fixtures.buildWorkshopFrameV2({
              ...base, sceneId: scene.id, sceneFrame: index, sceneState: frame,
            }),
          })),
        }));
      return [stationary, ...scenes];
    });
  });
  fs.writeFileSync(output, JSON.stringify(result));
  console.log('exported', result.length);
} finally {
  await browser.close();
}
