import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Page } from "playwright-core";
import { onboardingScenes } from "./onboarding.ts";
import type { VisualScene } from "./scenes.ts";

async function audit(page: Page, context: "settings" | "onboarding") {
  const selector =
    context === "settings" ? ".v-appearance-groups" : ".v-ob-look";
  const previews = page.locator(`${selector} .v-palette-preview-colors`);
  await previews.first().waitFor();
  const samples = await previews.evaluateAll((nodes) =>
    nodes.map((node) => ({
      palette: node.getAttribute("data-palette"),
      scheme: node.getAttribute("data-scheme"),
      accent: getComputedStyle(node).getPropertyValue("--accent").trim(),
    })),
  );
  assert.equal(samples.length, context === "settings" ? 18 : 9);
  const { themes } = JSON.parse(
    await readFile(
      new URL("../../design/tokens.json", import.meta.url),
      "utf8",
    ),
  ) as {
    themes: Record<string, Record<string, Record<string, string>>>;
  };
  const nativeBrand = new Set(["rose", "grove", "ocean", "ember", "iris"]);
  for (const sample of samples) {
    assert.ok(sample.palette && sample.scheme);
    const colors = themes[sample.palette]?.[sample.scheme];
    assert.ok(colors);
    const expected =
      sample.scheme === "dark" && nativeBrand.has(sample.palette)
        ? colors["accent-fill"]
        : colors.accent;
    assert.equal(
      sample.accent.toLowerCase(),
      expected.toLowerCase(),
      `${context}/${sample.palette}/${sample.scheme}`,
    );
  }
  console.log(JSON.stringify({ palettePreview: context, samples }));
}

export const palettePreviewScenes: Record<string, VisualScene> = {
  "ajustes-apariencia": {
    mock: "ajustes-con-diseno",
    async prepare(page) {
      await page.getByRole("tab", { name: "Apariencia", exact: true }).click();
      await page.getByRole("tabpanel").waitFor();
      await audit(page, "settings");
    },
  },
  "onboarding-5": {
    ...onboardingScenes["onboarding-5"],
    async prepare(page) {
      await onboardingScenes["onboarding-5"].prepare(page);
      await audit(page, "onboarding");
    },
  },
};
