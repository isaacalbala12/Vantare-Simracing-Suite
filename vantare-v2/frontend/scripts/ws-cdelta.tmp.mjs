import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
for (const [name, q] of [
  ["bar", "widget=delta&system=vantare-crystal&variant=default&design=delta-crystal-bar&state=ready&surface=obs&background=context"],
  ["simple", "widget=delta&system=vantare-crystal&variant=default&design=delta-crystal-simple&state=ready&surface=obs&background=context"],
]) {
  await page.goto(`http://localhost:5173/workshop?${q}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const root = await page.locator(".overlay-workshop-widget-root").boundingBox();
  await page.screenshot({ path: `/tmp/delta-crystal-${name}.png`, clip: { x: root.x - 16, y: root.y - 16, width: root.width + 32, height: root.height + 32 } });
}
await browser.close();
