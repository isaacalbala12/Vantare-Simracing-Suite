import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const sourcePath = path.join(repositoryRoot, 'docs', 'overlay-glassmorphism-pro.html');
const manifestPath = path.join(repositoryRoot, 'frontend', 'testdata', 'crystal-reference', 'manifest.json');
const v2Marker = 'V2. WIDGETS REESTILIZADOS (GLASSMORPHISM PRO)';

const canonicalEntries = [
  { id: 'relative', widgetType: 'relative', designId: 'relative-crystal-vertical', referenceSelector: '.widgets-row > .glass-card:nth-child(1)', width: 357, height: 288, htmlSection: 1 },
  { id: 'standings', widgetType: 'standings', designId: 'standings-crystal-vertical', referenceSelector: '.widgets-row > .glass-card:nth-child(2)', width: 360, height: 650, htmlSection: 1 },
  { id: 'broadcast', widgetType: 'broadcast-tower', designId: 'broadcast-tower-crystal', referenceSelector: '.broadcast-ticker', width: 1872, height: 71, htmlSection: 2 },
  { id: 'fuel', widgetType: 'fuel-strategy', designId: 'fuel-strategy-crystal-unified', referenceSelector: '.unified-fuel-card', width: 680, height: 204, htmlSection: 3 },
  { id: 'pedals-telemetry', widgetType: 'pedals-telemetry', designId: 'pedals-telemetry-crystal', referenceSelector: '.telemetry-showcase > .telemetry-col:nth-child(1)', width: 323, height: 152, htmlSection: 4 },
  { id: 'pedals-telemetry-compact', widgetType: 'pedals-telemetry-compact', designId: 'pedals-telemetry-compact-crystal', referenceSelector: '.telemetry-showcase > .telemetry-col:nth-child(2)', width: 280, height: 172, htmlSection: 4 },
  { id: 'pedals', widgetType: 'pedals', designId: 'pedals-crystal', referenceSelector: '.telemetry-showcase > .telemetry-col:nth-child(3)', width: 240, height: 261, htmlSection: 4 },
  { id: 'flags', widgetType: 'racing-flags', designId: 'racing-flags-crystal', referenceSelector: '.flag-card:nth-child(1)', width: 280, height: 92, htmlSection: 5 },
  { id: 'delta-bar', widgetType: 'delta', designId: 'delta-crystal-bar', referenceSelector: '.delta-bar-wrapper:nth-child(1)', width: 440, height: 92, htmlSection: 6 },
  { id: 'delta-trace', widgetType: 'delta-trace', designId: 'delta-trace-crystal', referenceSelector: '.dt-container', width: 1000, height: 144, htmlSection: 7 },
  { id: 'schedule', widgetType: 'race-schedule', designId: 'race-schedule-crystal', referenceSelector: '.rs-container', width: 780, height: 583, htmlSection: 8 },
  { id: 'head-to-head', widgetType: 'head-to-head', designId: 'head-to-head-crystal', referenceSelector: '.h2h-container', width: 780, height: 150, htmlSection: 9 },
  { id: 'input-blade', widgetType: 'input-telemetry', designId: 'input-crystal-blade', referenceSelector: '.in10a-container', width: 780, height: 96, htmlSection: 10 },
  { id: 'input-capsule', widgetType: 'input-telemetry', designId: 'input-crystal-capsule', referenceSelector: '.in10b-container', width: 780, height: 100, htmlSection: 10 },
  { id: 'input-dense', widgetType: 'input-telemetry', designId: 'input-crystal-dense', referenceSelector: '.in10c-container', width: 780, height: 68, htmlSection: 10 },
  { id: 'multiclass', widgetType: 'multiclass-relative', designId: 'multiclass-relative-crystal', referenceSelector: '.mc-container', width: 780, height: 210, htmlSection: 11 },
  { id: 'weather', widgetType: 'track-weather', designId: 'track-weather-crystal', referenceSelector: '.tw-container', width: 240, height: 420, htmlSection: 12 },
  { id: 'damage-visual', widgetType: 'car-damage-visual', designId: 'car-damage-visual-crystal', referenceSelector: '.w13-car-visual', width: 150, height: 190, htmlSection: 13 },
  { id: 'damage-numbers', widgetType: 'car-damage-numbers', designId: 'car-damage-numbers-crystal', referenceSelector: '.w14-damage-nums', width: 140, height: 148, htmlSection: 14 },
  { id: 'delta-simple', widgetType: 'delta', designId: 'delta-crystal-simple', referenceSelector: '.w15-delta-simple', width: 420, height: 69, htmlSection: 15 },
  { id: 'delta-advanced', widgetType: 'delta-advanced', designId: 'delta-advanced-crystal', referenceSelector: '.w16-delta-adv', width: 480, height: 42, htmlSection: 16 },
];

const sectionMarkers = [
  '01. TABLAS VERTICALES',
  '02. STANDINGS HORIZONTAL',
  '03. FUEL CALCULATOR',
  '04. PEDALS TELEMETRY',
  '05. RACING FLAGS',
  '06. DELTA BAR',
  '07. DELTA TRACE',
  '08. RACE SCHEDULE',
  '09. HEAD 2 HEAD',
  '10A. SLEEK HORIZONTAL BLADE',
  '10B. SYMMETRICAL AERO CAPSULE',
  '10C. ULTRA-DENSE STRIP',
  '11. MULTICLASS RELATIVE GAP HUD',
  '12. TRACK WEATHER',
  '13. CAR DAMAGE VISUAL',
  '14. CAR DAMAGE NUMBERS',
  '15. DELTA SIMPLE',
  '16. DELTA ADVANCED',
];

function fail(message) {
  throw new Error(`crystal-reference: ${message}`);
}

function validateSource(source) {
  const markerIndex = source.indexOf(v2Marker);
  if (markerIndex < 0) fail(`missing final V2 marker: ${v2Marker}`);

  const canonicalSource = source.slice(0, markerIndex);
  if (canonicalSource.includes('class="v2-section"')) fail('canonical source includes a .v2-section block');
  if (canonicalSource.includes('V2-')) fail('canonical source includes a final V2 widget');

  for (const marker of sectionMarkers) {
    if (!canonicalSource.includes(marker)) fail(`missing canonical HTML section: ${marker}`);
  }
}

function validateManifest(manifest) {
  if (manifest.version !== 1) fail(`unsupported manifest version: ${manifest.version}`);
  if (!Array.isArray(manifest.entries)) fail('manifest.entries must be an array');
  if (manifest.entries.length !== canonicalEntries.length) fail(`expected ${canonicalEntries.length} entries, got ${manifest.entries.length}`);

  const ids = new Set();
  const selectors = new Set();
  for (const [index, expected] of canonicalEntries.entries()) {
    const actual = manifest.entries[index];
    for (const field of ['id', 'widgetType', 'designId', 'referenceSelector', 'width', 'height', 'htmlSection']) {
      if (actual[field] !== expected[field]) fail(`entry ${index + 1} has unexpected ${field}`);
    }
    if (actual.referenceSelector.startsWith('.v2-')) fail(`entry ${actual.id} selects a .v2-* class`);
    if (ids.has(actual.id)) fail(`duplicate id: ${actual.id}`);
    if (selectors.has(actual.referenceSelector)) fail(`duplicate selector: ${actual.referenceSelector}`);
    if (!Number.isInteger(actual.width) || actual.width <= 0) fail(`invalid width for ${actual.id}`);
    if (!Number.isInteger(actual.height) || actual.height <= 0) fail(`invalid height for ${actual.id}`);
    if (!Number.isInteger(actual.htmlSection) || actual.htmlSection < 1 || actual.htmlSection > 16) fail(`invalid HTML section for ${actual.id}`);
    ids.add(actual.id);
    selectors.add(actual.referenceSelector);
  }
}

async function main() {
  const source = await readFile(sourcePath, 'utf8');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  validateSource(source);
  validateManifest(manifest);
  process.stdout.write(`crystal-reference: ${manifest.entries.length} canonical crops OK\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

