import assert from "node:assert/strict";
import type { Page } from "playwright-core";
export async function checkAnalysisDensity(page: Page) {
  const table = page.locator(".v-an-table").first();
  if (!(await table.count())) return;
  const containerWidth = await page
    .locator(".v-an-tablewrap")
    .first()
    .evaluate((el) => el.clientWidth);
  const secondary = table.locator("thead .v-an-secondary");
  for (const cell of await secondary.all())
    assert.equal(await cell.isVisible(), containerWidth >= 760);
  const cars = page.locator(".v-an-open");
  for (const car of await cars.all())
    assert.equal(
      await car.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      true,
      "Do not truncate unidentified track or car",
    );
  assert.equal(
    await table.evaluate(
      (el) => el.scrollWidth <= (el.parentElement?.clientWidth ?? 0) + 1,
    ),
    true,
    "The table must fit its content container",
  );
}
