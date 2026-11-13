import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { residentText as text } from "../src/renderer/i18n/launcher-resident.ts";
import { until } from "./wait-for.ts";

export async function checkResidentAnswer(owner: Page, base: string) {
  const page = await owner.context().newPage();
  try {
    await page.addInitScript(() => {
      Reflect.set(window, "residentAnswers", []);
      const send = MessagePort.prototype.postMessage;
      MessagePort.prototype.postMessage = function (message, options) {
        if (
          message?.kind === "request" &&
          message.request?.method === "launcher.resident.answer"
        )
          (Reflect.get(window, "residentAnswers") as unknown[]).push(
            message.request,
          );
        send.call(
          this,
          message,
          Array.isArray(options) ? { transfer: options } : options,
        );
      };
    });
    for (const state of [
      "accepted",
      "rejected",
      "finished",
      "unknown",
    ] as const) {
      if (state === "unknown") await page.clock.install();
      await page.goto(`${base}?escena=visual-dark:launcher-answer-${state}`);
      await page.getByRole("button", { name: "Launcher", exact: true }).click();
      const popup = page.getByRole("dialog", { name: text.title, exact: true });
      await popup.waitFor();
      const reuse = popup.getByRole("button", {
        name: "Reutilizar",
        exact: true,
      });
      assert.equal(await reuse.getAttribute("aria-disabled"), "false");
      for (const control of await page
        .locator(".v-window-controls button")
        .all()) {
        await control.focus();
        await until(
          () =>
            control.evaluate(
              (node) =>
                node === document.activeElement && !node.closest("[inert]"),
            ),
          5000,
          "caption controls remain keyboard reachable",
        );
      }
      await reuse.focus();
      await page.keyboard.press("Enter");
      if (state === "unknown") {
        await page
          .getByText(text.answerState.queued, { exact: true })
          .waitFor();
        await page.clock.runFor(5000);
      }
      await popup.getByText(text.answerState[state], { exact: true }).waitFor();
      assert.equal(
        await page.evaluate(
          () => (Reflect.get(window, "residentAnswers") as unknown[]).length,
        ),
        1,
        "one explicit answer, no fallback/retry",
      );
      assert.ok(await popup.getByRole("status").isVisible());
      if (state !== "finished")
        assert.equal(
          await popup
            .getByText(text.answerState.finished, { exact: true })
            .count(),
          0,
        );
      await popup
        .getByRole("button", { name: text.close, exact: true })
        .click();
      await page
        .getByRole("button", { name: text.open, exact: true })
        .waitFor();
      await until(
        () =>
          page
            .getByRole("button", { name: text.open, exact: true })
            .evaluate((node) => node === document.activeElement),
        5000,
        "close restores focus to the decision control",
      );
    }
  } finally {
    await page.close();
  }
}
