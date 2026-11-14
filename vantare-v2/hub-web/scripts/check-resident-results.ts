import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import {
  residentOrderReceiptTimeoutMs,
  residentStepLimit,
} from "../src/contract/generated/launcher_resident.ts";
import { controlText } from "../src/renderer/i18n/launcher-control.ts";
import { resultsText } from "../src/renderer/i18n/launcher-results.ts";
import { openProfileRemovalWithKeyboard } from "./check-dialog-safety.ts";
import {
  assertControlCaption,
  observeResidentControls,
} from "./check-resident-control.ts";
import { until } from "./wait-for.ts";

export async function prepareResidentResults(page: Page, state: string) {
  await observeResidentControls(page);
  if (state === "timeout") await page.clock.install();
  await page.getByRole("button", { name: "Launcher", exact: true }).click();
  await page
    .getByRole("heading", { name: "Creador de Contenido", exact: true })
    .waitFor();
  const button = page.getByRole("button", {
    name: controlText.retryAll,
    exact: true,
  });
  if (["unknown", "unsupported", "stale"].includes(state)) {
    assert.equal(await button.getAttribute("aria-disabled"), "true");
    await button.focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.evaluate(
        () =>
          (Reflect.get(window, "residentControlRequests") as unknown[]).length,
      ),
      0,
    );
  } else if (state === "inert") {
    const dialog = await openProfileRemovalWithKeyboard(page);
    const inertButton = page.getByRole("button", {
      name: controlText.retryAll,
      exact: true,
      includeHidden: true,
    });
    assert.equal(await inertButton.getAttribute("aria-disabled"), "false");
    await inertButton.evaluate((node) => (node as HTMLButtonElement).click());
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(
        () =>
          (Reflect.get(window, "residentControlRequests") as unknown[]).length,
      ),
      0,
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await button.focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("region", { name: controlText.title, exact: true })
      .getByText(`${controlText.retryAll}: ${controlText.accepted}`, {
        exact: true,
      })
      .waitFor();
  } else if (state !== "mixed" && state !== "final-pass" && state !== "many") {
    await button.focus();
    await page.keyboard.press("Enter");
    const status = page.getByRole("region", {
      name: controlText.title,
      exact: true,
    });
    if (state === "timeout") {
      await status
        .getByText(`${controlText.retryAll}: ${controlText.queued}`, {
          exact: true,
        })
        .waitFor();
      await page.clock.runFor(residentOrderReceiptTimeoutMs);
    }
    if (state === "finished")
      await status
        .getByText(`${controlText.retryAll}: ${controlText.accepted}`, {
          exact: true,
        })
        .waitFor();
    const text =
      state === "finished"
        ? controlText.completed
        : state === "rejected"
          ? `${controlText.rejected} ${controlText.rejection["start-failed"]}`
          : ["timeout", "gap", "restart"].includes(state)
            ? controlText.unknown
            : controlText.accepted;
    await status
      .getByText(`${controlText.retryAll}: ${text}`, { exact: true })
      .waitFor();
  }
  if (state === "many") {
    const list = page.getByRole("list", {
      name: resultsText.steps,
      exact: true,
    });
    assert.equal(await list.locator("li").count(), residentStepLimit);
    await list.focus();
    await until(
      () => list.evaluate((node) => node === document.activeElement),
      5000,
      "overflow list is keyboard focusable",
    );
    await page.keyboard.press("ArrowRight");
    await until(
      () => list.evaluate((node) => node.scrollLeft > 0),
      5000,
      "ArrowRight scrolls the real step list",
    );
    const last = list.locator("li").last();
    await last.scrollIntoViewIfNeeded();
    const bounds = await list.boundingBox(),
      item = await last.boundingBox();
    assert.ok(bounds && item);
    assert.ok(
      item.x >= bounds.x - 1 &&
        item.x + item.width <= bounds.x + bounds.width + 1,
      "last step remains accessible",
    );
  }
  if (state === "final-pass") {
    assert.equal(
      await page
        .getByRole("button", { name: controlText.retryFailed, exact: true })
        .getAttribute("aria-disabled"),
      "false",
    );
    assert.equal(
      await page.getByText("No ejecutado", { exact: true }).count(),
      1,
    );
    assert.equal(await page.getByText("Falló", { exact: true }).count(), 0);
  }
  const requests = await page.evaluate(
    () =>
      Reflect.get(window, "residentControlRequests") as {
        method: string;
        target?: { scope: string };
      }[],
  );
  const sends = [
    "mixed",
    "many",
    "final-pass",
    "unknown",
    "unsupported",
    "stale",
  ].includes(state)
    ? 0
    : 1;
  assert.equal(requests.length, sends);
  if (sends) {
    assert.equal(requests[0].method, "launcher.resident.retry");
    assert.equal(requests[0].target?.scope, "all");
  }
  await assertControlCaption(page);
}
export async function checkResidentResults(owner: Page, base: string) {
  const page = await owner.context().newPage();
  try {
    for (const state of [
      "many",
      "final-pass",
      "inert",
      "accepted",
      "rejected",
      "finished",
      "unsupported",
      "unknown",
      "gap",
      "restart",
      "timeout",
    ] as const) {
      await page.goto(
        `${base}?escena=visual-dark:launcher-results-${state === "inert" ? "mixed" : state}`,
      );
      await prepareResidentResults(page, state);
    }
  } finally {
    await page.close();
  }
}
