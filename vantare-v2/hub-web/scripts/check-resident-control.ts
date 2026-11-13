import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { residentOrderReceiptTimeoutMs } from "../src/contract/generated/launcher_resident.ts";
import { controlText as text } from "../src/renderer/i18n/launcher-control.ts";
import { until } from "./wait-for.ts";
export async function observeResidentControls(page: Page) {
  await page.evaluate(() => {
    Reflect.set(window, "residentControlRequests", []);
    const send = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (message, options) {
      if (
        message?.kind === "request" &&
        [
          "launcher.resident.answer",
          "launcher.resident.cancel",
          "launcher.resident.rehearse",
          "launcher.launch",
          "launcher.favorite",
        ].includes(message.request?.method)
      )
        (Reflect.get(window, "residentControlRequests") as unknown[]).push(
          message.request,
        );
      send.call(
        this,
        message,
        Array.isArray(options) ? { transfer: options } : options,
      );
    };
  });
}
export async function assertControlCaption(page: Page) {
  const buttons = page.locator(".v-window-controls button");
  assert.equal(await buttons.count(), 3);
  for (const button of await buttons.all()) {
    await button.focus();
    await until(
      () =>
        button.evaluate(
          (node) => node === document.activeElement && !node.closest("[inert]"),
        ),
      5000,
      "control result keeps caption focusable",
    );
    const box = await button.boundingBox();
    assert.ok(box);
    assert.ok(
      await button.evaluate(
        (node, point) =>
          node.contains(document.elementFromPoint(point.x, point.y)),
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      ),
    );
  }
}
export async function checkResidentControlInert(page: Page) {
  await observeResidentControls(page);
  await page.getByRole("button", { name: "Launcher", exact: true }).click();
  await page.locator(".v-launcher-profile").first().focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Eliminar", exact: true }).focus();
  await page.keyboard.press("Enter");
  const confirmation = page.getByRole("dialog", {
    name: "Eliminar perfil",
    exact: true,
  });
  await confirmation.waitFor();
  const rehearsal = page.getByRole("button", {
    name: "Probar sin el juego",
    exact: true,
    includeHidden: true,
  });
  assert.equal(
    await rehearsal.getAttribute("aria-disabled"),
    "false",
    "positive control: rehearsal is enabled before inert barrier",
  );
  await rehearsal.evaluate((node) => (node as HTMLButtonElement).click());
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(
      () =>
        (Reflect.get(window, "residentControlRequests") as unknown[]).length,
    ),
    0,
    "inert body cannot issue resident orders",
  );
  assert.equal(
    await rehearsal.evaluate((node) => node === document.activeElement),
    false,
  );
  await page.keyboard.press("Escape");
  await confirmation.waitFor({ state: "hidden" });
  await rehearsal.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("region", { name: text.title, exact: true })
    .getByText(new RegExp(text.accepted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .waitFor();
  const requests = await page.evaluate(
    () =>
      Reflect.get(window, "residentControlRequests") as { method: string }[],
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "launcher.resident.rehearse");
}

export async function checkResidentControls(owner: Page, base: string) {
  const page = await owner.context().newPage();
  try {
    await page.goto(`${base}?escena=visual-dark:launcher-control-ready`);
    await checkResidentControlInert(page);
    await assertControlCaption(page);
    for (const state of [
      "accepted",
      "rejected",
      "finished",
      "unknown",
    ] as const) {
      if (state === "unknown") await page.clock.install();
      await page.goto(`${base}?escena=visual-dark:launcher-control-${state}`);
      await observeResidentControls(page);
      await page.getByRole("button", { name: "Launcher", exact: true }).click();
      await page
        .getByRole("button", { name: "Probar sin el juego", exact: true })
        .click();
      const notice = page.getByRole("region", {
        name: text.title,
        exact: true,
      });
      if (state === "unknown") {
        await notice
          .getByText(`${text.rehearse}: ${text.queued}`, { exact: true })
          .waitFor();
        await page.clock.runFor(residentOrderReceiptTimeoutMs);
      }
      if (state === "finished")
        await notice
          .getByText(`${text.rehearse}: ${text.accepted}`, { exact: true })
          .waitFor();
      const message =
        state === "finished"
          ? text.completed
          : state === "rejected"
            ? `${text.rejected} ${text.rejection["start-failed"]}`
            : text[state];
      await notice
        .getByText(`${text.rehearse}: ${message}`, { exact: true })
        .waitFor();
      assert.equal(
        await page.evaluate(
          () =>
            (Reflect.get(window, "residentControlRequests") as unknown[])
              .length,
        ),
        1,
      );
      await assertControlCaption(page);
    }
  } finally {
    await page.close();
  }
}
