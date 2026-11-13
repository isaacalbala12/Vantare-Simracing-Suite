import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { residentOrderReceiptTimeoutMs } from "../src/contract/generated/launcher_resident.ts";
import { actionText } from "../src/renderer/i18n/launcher-actions.ts";
import { residentText as text } from "../src/renderer/i18n/launcher-resident.ts";
import { until } from "./wait-for.ts";

function recordAnswerRequests() {
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
}

export async function observeResidentAnswers(page: Page) {
  await page.evaluate(recordAnswerRequests);
}

export async function checkResidentAnswerInert(page: Page) {
  await page.getByRole("button", { name: "Launcher", exact: true }).click();
  const drawer = page.locator(".v-launcher-resident-drawer");
  await drawer.waitFor();
  // Use the real confirmation layer. The profile editor itself is an inline tab.
  await page.locator(".v-launcher-profile").first().focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Eliminar", exact: true }).focus();
  await page.keyboard.press("Enter");
  const confirmation = page.getByRole("dialog", {
    name: actionText.removeTitle,
    exact: true,
  });
  await confirmation.waitFor();
  await until(
    () =>
      confirmation
        .getByRole("button")
        .first()
        .evaluate((node) => node === document.activeElement),
    5000,
    "confirmation receives keyboard focus",
  );
  await until(
    () => drawer.evaluate((node) => !!node.closest("[inert]")),
    5000,
    "profile confirmation makes resident notice inert",
  );
  await drawer
    .getByRole("button", {
      name: "Reutilizar",
      exact: true,
      includeHidden: true,
    })
    .evaluate((node) => (node as HTMLButtonElement).click());
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(
      () => (Reflect.get(window, "residentAnswers") as unknown[]).length,
    ),
    0,
    "inert notice cannot answer",
  );
  assert.equal(
    await drawer.evaluate((node) => node.contains(document.activeElement)),
    false,
    "Tab cannot reach the inert notice",
  );
  await page.keyboard.press("Escape");
  await until(
    () => drawer.evaluate((node) => !node.closest("[inert]")),
    5000,
    "resident notice becomes usable after confirmation closes",
  );
  await drawer.getByRole("button", { name: "Reutilizar", exact: true }).click();
  await until(
    () =>
      page.evaluate(
        () =>
          (Reflect.get(window, "residentAnswers") as unknown[]).length === 1,
      ),
    5000,
    "positive control: explicit answer reaches the port",
  );
}

export async function checkResidentAnswer(owner: Page, base: string) {
  const page = await owner.context().newPage();
  try {
    await page.addInitScript(recordAnswerRequests);
    await page.goto(`${base}?escena=visual-dark:launcher-answer-question`);
    await checkResidentAnswerInert(page);
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
        await popup
          .getByText(text.answerState.queued, { exact: true })
          .waitFor();
        await page.clock.runFor(residentOrderReceiptTimeoutMs);
      }
      if (state === "finished")
        await popup
          .getByText(text.answerState.accepted, { exact: true })
          .waitFor();
      await popup
        .getByText(
          state === "rejected"
            ? `${text.answerState.rejected} ${text.rejection["stale-question"]}`
            : text.answerState[state],
          { exact: true },
        )
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => (Reflect.get(window, "residentAnswers") as unknown[]).length,
        ),
        1,
        "one explicit answer, no fallback/retry",
      );
      assert.ok(
        await page
          .getByRole("status", { name: text.answerStatusLabel, exact: true })
          .isVisible(),
      );
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
