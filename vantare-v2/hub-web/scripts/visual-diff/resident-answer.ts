import assert from "node:assert/strict";
import { residentOrderReceiptTimeoutMs } from "../../src/contract/generated/launcher_resident.ts";
import { residentText as text } from "../../src/renderer/i18n/launcher-resident.ts";
import {
  checkResidentAnswerInert,
  observeResidentAnswers,
} from "../check-resident-answer.ts";
import { until } from "../wait-for.ts";
import type { VisualScene } from "./scenes.ts";
export const residentAnswerScenes: Record<string, VisualScene> = {};
for (const state of [
  "question",
  "accepted",
  "rejected",
  "rejected-account",
  "rejected-denied",
  "rejected-unavailable",
  "finished",
  "unknown",
  "trust",
] as const) {
  residentAnswerScenes[`launcher-resident-${state}`] = {
    mock: `launcher-answer-${state}`,
    async prepare(page) {
      await observeResidentAnswers(page);
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
            .locator(".v-launcher-resident-body")
            .getByText(text.answerState.queued, { exact: true })
            .waitFor();
          await page.clock.runFor(residentOrderReceiptTimeoutMs);
        }
        if (state === "finished")
          await page
            .locator(".v-launcher-resident-body")
            .getByText(text.answerState.accepted, { exact: true })
            .waitFor();
        const rejection = {
          rejected: "stale-question",
          "rejected-account": "account-changed",
          "rejected-denied": "denied",
          "rejected-unavailable": "unavailable",
        } as const;
        const expected =
          state in rejection
            ? `${text.answerState.rejected} ${text.rejection[rejection[state as keyof typeof rejection]]}`
            : text.answerState[state as "accepted" | "finished" | "unknown"];
        await page
          .locator(".v-launcher-resident-body")
          .getByText(expected, { exact: true })
          .waitFor();
      }
      const beforeClose = await page.evaluate(
        () => (Reflect.get(window, "residentAnswers") as unknown[]).length,
      );
      await page
        .getByRole("dialog", { name: text.title, exact: true })
        .getByRole("button", { name: text.close, exact: true })
        .click();
      const reopen = page.getByRole("button", { name: text.open, exact: true });
      await reopen.waitFor();
      await until(
        () => reopen.evaluate((node) => node === document.activeElement),
        5000,
        "resident notice restores focus",
      );
      await reopen.click();
      await page
        .getByRole("heading", { name: text.title, exact: true })
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => (Reflect.get(window, "residentAnswers") as unknown[]).length,
        ),
        beforeClose,
        "hiding and reopening a notice never answers it",
      );
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

residentAnswerScenes["launcher-resident-inert"] = {
  mock: "launcher-answer-question",
  async prepare(page) {
    await observeResidentAnswers(page);
    await checkResidentAnswerInert(page);
    await page
      .locator(".v-launcher-resident-body")
      .getByText(text.answerState.accepted, { exact: true })
      .waitFor();
  },
};
