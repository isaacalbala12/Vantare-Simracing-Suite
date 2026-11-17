import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright-core";
import { visualScenes } from "./visual-diff/scenes.ts";

export const contrastScenes = [
  "studio-canvas-monitor-missing",
  "studio-canvas-monitor-unreadable",
  "studio-canvas-readonly",
  "studio-base",
  "launcher-base",
  "ajustes-aplicacion",
] as const;

export async function checkLightContrast(
  parent: Page,
  base: string,
  evidence: string,
) {
  const page = await parent.context().newPage();
  const results = [];
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    page.setDefaultTimeout(20000);
    for (const scene of contrastScenes) {
      const adapter = visualScenes[scene];
      await page.goto(`${base}?escena=visual-light:${adapter.mock}`);
      await adapter.prepare(page);
      await page.evaluate(() => document.fonts.ready);
      const report = await new AxeBuilder({ page })
        .withRules(["color-contrast"])
        .analyze();
      results.push({
        scene,
        violations: report.violations,
        incomplete: report.incomplete,
      });
    }
  } finally {
    await page.close();
    await writeFile(
      resolve(evidence, "axe-light-contrast.json"),
      JSON.stringify(results, null, 2),
    );
  }
  assert.deepEqual(
    results.flatMap(({ scene, violations }) =>
      violations.map(({ id, nodes }) => ({
        scene,
        id,
        targets: nodes.map(({ target }) => target),
      })),
    ),
    [],
    "Light theme color-contrast violations",
  );
}
