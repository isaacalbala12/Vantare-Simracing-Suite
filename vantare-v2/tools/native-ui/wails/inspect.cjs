const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require(path.resolve(__dirname, '../../../frontend/node_modules/playwright'));

async function main() {
  const port = Number(process.argv[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('pass a local CDP port');
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  try {
    const pages = browser.contexts().flatMap(context => context.pages());
    const page = pages.find(candidate => candidate.url().includes('?mode=editor'));
    if (!page) throw new Error('Wails editor page not found');
    await page.locator('.standings .standing-row').first().waitFor();
    assert.equal(await page.locator('.standings .standing-row').count(), 44);
    const title = page.locator('.editor input').first();
    await title.fill('GO REAL');
    assert.equal(await page.locator('.preview b').first().textContent(), 'GO REAL');
    const rowSlider = page.locator('.editor input[type=range]').first();
    await rowSlider.focus();
    await rowSlider.press('Home');
    assert.equal(await page.locator('.preview-row').count(), 4);
    const opacitySlider = page.locator('.editor input[type=range]').last();
    await opacitySlider.focus();
    await opacitySlider.press('End');
    assert.equal(await page.locator('.preview>div').getAttribute('style'), 'opacity: 1;');
    await page.locator('.editor select').selectOption('Ámbar');
    assert.equal(await page.locator('.preview b').first().getAttribute('style'), 'color: rgb(239, 185, 85);');
    await page.locator('.editor .toggle input').uncheck();
    assert.equal(await page.locator('.preview b').count(), 1);
    await page.screenshot({path: path.resolve(__dirname, '../evidence/wails-go-editor.png')});
    await page.locator('.editor button').click();
    assert.equal(await title.inputValue(), 'STANDINGS');
    assert.equal(await page.locator('.preview b').count(), 2);
    assert.equal(await page.locator('.preview-row').count(), 8);
    console.log('Wails editor: 44 Go rows and all local inspector controls OK');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
