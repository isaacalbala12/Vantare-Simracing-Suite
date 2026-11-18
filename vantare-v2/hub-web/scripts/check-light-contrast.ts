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

async function checkControlBorders(page: Page, base: string) {
  const cases = [
    {
      scene: "launcher-base",
      buttons: [
        [/Nuevo perfil$/, "rgb(122, 112, 115)", "rgba(255, 255, 255, 0.1)"],
        [/^Aplicaciones$/, "rgb(122, 112, 115)", "rgba(255, 255, 255, 0.1)"],
        [/^Editar perfil$/, "rgb(96, 86, 88)", "rgba(255, 255, 255, 0.1)"],
        [
          /^Reintentar fallidos$/,
          "rgb(96, 86, 88)",
          "rgba(255, 255, 255, 0.1)",
        ],
        [
          /^Repetir los mismos pasos$/,
          "rgb(96, 86, 88)",
          "rgba(255, 255, 255, 0.1)",
        ],
      ],
    },
    {
      scene: "studio-estado-protegido-error",
      buttons: [
        [/^Volver a cargar$/, "rgb(122, 112, 115)", "rgba(255, 255, 255, 0.1)"],
      ],
    },
    {
      scene: "ajustes-aplicacion",
      buttons: [
        [/^Enviar prueba$/, "rgb(122, 112, 115)", "rgba(255, 255, 255, 0.15)"],
        [/^Copiar informe$/, "rgb(122, 112, 115)", "rgba(255, 255, 255, 0.15)"],
      ],
    },
  ] as const;

  for (const { scene, buttons } of cases) {
    const adapter = visualScenes[scene];
    for (const scheme of ["light", "dark"] as const) {
      await page.goto(`${base}?escena=visual-${scheme}:${adapter.mock}`);
      await adapter.prepare(page);
      for (const [name, light, dark] of buttons) {
        const button = page
          .getByRole("button", { name })
          .and(page.locator(".v-button--neutral"));
        const actual = await button.evaluate(
          (node) => getComputedStyle(node).borderTopColor,
        );
        assert.equal(
          actual,
          scheme === "light" ? light : dark,
          `${scene}/${scheme}/${name}`,
        );
      }
    }
  }
}

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
    await checkControlBorders(page, base);
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
