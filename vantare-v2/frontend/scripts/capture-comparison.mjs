import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 420, height: 700 } });

// Capture reference
await page.goto(`file:///${process.cwd()}/scripts/references/standings-crystal.html`);
await page.waitForTimeout(1000);
const refCard = await page.$('.glass-card');
if (refCard) {
  await refCard.screenshot({ path: 'frontend/test-results/visual-parity/d2-reference.png' });
  console.log('✅ Reference captured');
}

// Capture current app
await page.goto('http://localhost:5173/');
await page.waitForTimeout(3000);

// Click Overlays Studio
const overlaysBtn = await page.$('text=Overlays Studio');
if (overlaysBtn) {
  await overlaysBtn.click();
  await page.waitForTimeout(2000);
  
  // Click Widgets
  const widgetsBtn = await page.$('text=Widgets');
  if (widgetsBtn) {
    await widgetsBtn.click();
    await page.waitForTimeout(2000);
  }
}

await page.screenshot({ path: 'frontend/test-results/visual-parity/d2-current.png', fullPage: false });
console.log('✅ Current app captured');

await browser.close();
console.log('✅ Done. Compare:');
console.log('   frontend/test-results/visual-parity/d2-reference.png');
console.log('   frontend/test-results/visual-parity/d2-current.png');
