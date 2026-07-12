/**
 * Visual parity check: StandingsWidget vs HTML reference.
 * 
 * Usage: node frontend/scripts/visual-parity-check.mjs
 * 
 * Compares screenshots of the HTML reference and the rendered widget.
 */

import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_REF = resolve(__dirname, 'references/standings-crystal.html');
const SCREENSHOTS_DIR = resolve(__dirname, '../test-results/visual-parity');

async function captureReference() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 700 } });
  await page.goto(`file://${HTML_REF}`);
  await page.waitForTimeout(1000);
  
  const card = await page.$('.glass-card');
  if (card) {
    await card.screenshot({ path: resolve(SCREENSHOTS_DIR, 'reference.png') });
    console.log('✅ Reference screenshot captured');
  } else {
    console.log('❌ Could not find .glass-card in reference');
  }
  
  await browser.close();
}

async function captureWidget() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 700 } });
  
  // Navigate to the dev server widget preview
  try {
    await page.goto('http://localhost:5173/?widget=standings&design=vantare-crystal', { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    const panel = await page.$('[data-standings-template="glassmorphism"]');
    if (panel) {
      await panel.screenshot({ path: resolve(SCREENSHOTS_DIR, 'widget.png') });
      console.log('✅ Widget screenshot captured');
    } else {
      console.log('❌ Could not find glassmorphism widget panel');
    }
  } catch (e) {
    console.log('❌ Dev server not running or widget not found:', e.message);
  }
  
  await browser.close();
}

async function main() {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  
  console.log('=== Visual Parity Check ===\n');
  console.log('1. Capturing HTML reference...');
  await captureReference();
  
  console.log('2. Capturing widget render...');
  await captureWidget();
  
  console.log('\n3. Screenshots saved to:');
  console.log(`   ${SCREENSHOTS_DIR}/reference.png`);
  console.log(`   ${SCREENSHOTS_DIR}/widget.png`);
  console.log('\nCompare them manually or with a pixel comparison tool.');
  console.log('Run: npx playwright test --reporter=list (for automated comparison)');
}

main().catch(console.error);
