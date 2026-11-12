import assert from "node:assert/strict";
import type { VisualScene } from "./scenes.ts";
export const analysisScenes: Record<string, VisualScene> = {};
for (const expanded of [false, true]) {
  analysisScenes[expanded ? "telemetria-vacia-expandida" : "telemetria-vacia"] =
    {
      mock: "proximamente-base",
      async prepare(page) {
        const target = new URL(page.url());
        target.searchParams.set("escena", "specimen");
        await page.goto(target.href);
        await page
          .getByRole("button", { name: "Telemetría · sin sesión", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Sin sesión analizada", exact: true })
          .waitFor();
        if (expanded) await page.keyboard.press("Control+b");
        await page.waitForFunction(
          (w) =>
            document.querySelector(".v-sidebar")?.getBoundingClientRect()
              .width === w,
          expanded ? 272 : 76,
        );
        assert.equal(
          await page
            .locator(".v-analysis-stats strong")
            .allTextContents()
            .then((v) => v.every((x) => x === "—")),
          true,
        );
        assert.equal(
          await page
            .getByRole("button", { name: "Tiempo", exact: true })
            .isDisabled(),
          true,
        );
        await page
          .getByText("Sin sesiones indexadas.", { exact: true })
          .waitFor();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollHeight <= innerHeight,
          ),
          "QA Shell must not create a document scrollbar",
        );
        await page.mouse.move(1000, 890);
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
      },
    };
}
