import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "playwright-core";
import { until } from "./wait-for.ts";

declare global {
  interface Window {
    __onboardingWrites?: { finishes: number; completions: number };
  }
}
export async function checkOnboarding(
  page: Page,
  base: string,
  evidence: string,
) {
  await page.addInitScript(() => {
    const state = {
      finishes: 0,
      completions: 0,
      lastCompleted: undefined as boolean | undefined,
    };
    Object.assign(window, { __onboardingWrites: state });
    // Electron receives responses from the main process; the browser mock posts
    // them locally. Observe inbound replies in either transport without changing them.
    const originalStart = MessagePort.prototype.start;
    const watched = new WeakSet<MessagePort>();
    MessagePort.prototype.start = function () {
      if (!watched.has(this)) {
        watched.add(this);
        this.addEventListener("message", ({ data }) => {
          if (
            data?.kind !== "response" ||
            data.result?.method !== "settings.get"
          )
            return;
          const completed = data.result.value.general.onboarding_completed;
          if (state.lastCompleted === false && completed === true)
            state.completions++;
          state.lastCompleted = completed;
        });
      }
      originalStart.call(this);
    };
    const original = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (
      message,
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      if (
        message?.kind === "request" &&
        message.request?.method === "onboarding.finish"
      )
        state.finishes++;
      if (
        message?.kind === "response" &&
        message.result?.method === "settings.get"
      ) {
        const completed = message.result.value.general.onboarding_completed;
        if (state.lastCompleted === false && completed === true)
          state.completions++;
        state.lastCompleted = completed;
      }
      if (Array.isArray(options))
        original.call(this, message, { transfer: options });
      else original.call(this, message, options ?? {});
    };
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${base}?escena=onboarding-7`);
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Continuar con Discord", exact: true })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "Ahora no", exact: true }).click();
  await page.getByRole("radio", { name: "Ahorro", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Claro", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Saltar", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Terminar", exact: true }).click();
  await page.getByText("4 widgets", { exact: true }).waitFor();
  const open = page.getByRole("button", {
    name: "Abrir mi overlay",
    exact: true,
  });
  await until(() => open.isEnabled(), 5000, "summary save available");
  await open.evaluate((button) => {
    if (!(button instanceof HTMLButtonElement))
      throw new Error("Expected button");
    button.click();
    button.click();
  });
  await page.locator(".v-onboarding").waitFor({ state: "detached" });
  const state = await page.evaluate(() => window.__onboardingWrites);
  assert.ok(state);
  await writeFile(
    resolve(evidence, "onboarding-flow.json"),
    JSON.stringify(state, null, 2),
  );
  assert.equal(state.finishes, 1);
  assert.equal(state.completions, 1);
}
