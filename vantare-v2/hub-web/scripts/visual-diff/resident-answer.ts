import assert from "node:assert/strict";
import { residentOrderReceiptTimeoutMs } from "../../src/contract/generated/launcher_resident.ts";
import { residentText as text } from "../../src/renderer/i18n/launcher-resident.ts";
import type { VisualScene } from "./scenes.ts";
export const residentAnswerScenes: Record<string, VisualScene> = {};
for (const state of [
  "question",
  "accepted",
  "rejected",
  "finished",
  "unknown",
  "trust",
] as const) {
  residentAnswerScenes[`launcher-resident-${state}`] = {
    mock: `launcher-answer-${state}`,
    async prepare(page) {
      if (state === "unknown") await page.clock.install();
      await page.getByRole("button", { name: "Launcher", exact: true }).click();
      await page
        .getByRole("heading", { name: text.title, exact: true })
        .waitFor();
      const toggle = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await toggle.getAttribute("aria-expanded")) === "true")
        await toggle.click();
      if (state !== "question" && state !== "trust") {
        await page
          .getByRole("button", { name: "Reutilizar", exact: true })
          .click();
        if (state === "unknown") {
          await page
            .getByText(text.answerState.queued, { exact: true })
            .waitFor();
          await page.clock.runFor(residentOrderReceiptTimeoutMs);
        }
        await page
          .getByText(text.answerState[state], { exact: true })
          .waitFor();
      }
      const controls = page.locator(".v-window-controls button");
      assert.equal(await controls.count(), 3);
      for (const control of await controls.all()) {
        await control.focus();
        assert.ok(
          await control.evaluate(
            (node) =>
              node === document.activeElement && !node.closest("[inert]"),
          ),
        );
        const box = await control.boundingBox();
        assert.ok(box);
        assert.ok(
          await control.evaluate(
            (node, point) =>
              node.contains(document.elementFromPoint(point.x, point.y)),
            { x: box.x + box.width / 2, y: box.y + box.height / 2 },
          ),
        );
      }
      await page
        .getByRole("heading", { name: text.title, exact: true })
        .click();
    },
  };
}
