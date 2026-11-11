import assert from "node:assert/strict";
import { until } from "../wait-for.ts";
import type { VisualScene } from "./scenes.ts";
export const launcherScenes: Record<string, VisualScene> = {
  "launcher-base": {
    mock: "launcher-base",
    async prepare(page) {
      await page.getByRole("button", { name: "Launcher", exact: true }).click();
      await page
        .getByRole("heading", { name: "Creador de Contenido", exact: true })
        .waitFor();
      const toggle = page.getByRole("button", {
        name: "Contraer o ampliar navegación",
        exact: true,
      });
      if ((await toggle.getAttribute("aria-expanded")) === "true")
        await toggle.click();
    },
  },
};

launcherScenes["launcher-nuevo-perfil"] = {
  mock: "launcher-base",
  async prepare(page) {
    await launcherScenes["launcher-base"].prepare(page);
    await page
      .getByRole("button", { name: "+ Nuevo perfil", exact: true })
      .first()
      .click();
    const name = page.getByRole("textbox", { name: "Nombre", exact: true });
    await name.waitFor();
    await name.focus();
    await name.evaluate((element: HTMLInputElement) =>
      element.setSelectionRange(element.value.length, element.value.length),
    );
  },
};

launcherScenes["launcher-aplicaciones"] = {
  mock: "launcher-aplicaciones",
  async prepare(page) {
    await launcherScenes["launcher-base"].prepare(page);
    await page.getByRole("tab", { name: "Aplicaciones", exact: true }).click();
    await page
      .getByRole("heading", { name: "Aplicaciones", exact: true })
      .first()
      .waitFor();
    await page
      .getByRole("button", { name: "Editar Vantare Overlay", exact: true })
      .waitFor();
  },
};

// The native reference uses the launcher-base QA bank with a pending decision.
// The pending decision stays non-modal: content and window controls remain usable.
launcherScenes["launcher-decision"] = {
  mock: "launcher-decision",
  async prepare(page) {
    const toggle = page.getByRole("button", {
      name: "Contraer o ampliar navegación",
      exact: true,
    });
    if ((await toggle.getAttribute("aria-expanded")) === "true")
      await toggle.click();
    await page.getByRole("button", { name: "Launcher", exact: true }).click();
    await page
      .getByRole("dialog")
      .filter({ hasText: "Decisión de lanzamiento" })
      .waitFor();
    assert.equal(await page.locator(".v-launcher-resident-scrim").count(), 0);
    const actions = page.locator(".v-launcher-resident-body button");
    const disabled = await actions.evaluateAll((nodes) =>
      nodes.map((node) => ({
        disabled: (node as HTMLButtonElement).disabled,
        opacity: Number(getComputedStyle(node).opacity),
        cursor: getComputedStyle(node).cursor,
      })),
    );
    assert.ok(
      disabled.length > 0 &&
        disabled.every(
          (item) =>
            item.disabled &&
            item.opacity < 0.6 &&
            item.cursor === "not-allowed",
        ),
    );
    const initial = page.locator('.v-launcher-profile[aria-pressed="true"]');
    const originalName = await initial.getAttribute("aria-label");
    const alternative = page
      .locator('.v-launcher-profile[aria-pressed="false"]')
      .first();
    const alternativeName = await alternative.getAttribute("aria-label");
    assert.ok(alternativeName);
    const target = page.getByRole("button", {
      name: alternativeName,
      exact: true,
    });
    await target.click();
    await until(
      async () => (await target.getAttribute("aria-pressed")) === "true",
      5000,
      "Underlying Launcher must still receive clicks",
    );
    if (originalName)
      await page
        .getByRole("button", { name: originalName, exact: true })
        .click();
    if (
      !(await page
        .getByRole("dialog", { name: "Decisión de lanzamiento", exact: true })
        .isVisible())
    )
      await page
        .getByRole("button", { name: "Ver decisión", exact: true })
        .click();
    assert.equal(await page.locator(".v-window-controls button").count(), 3);
    const reachable = await page
      .locator(".v-window-controls button")
      .evaluateAll((nodes) =>
        nodes.every((node) => {
          const box = node.getBoundingClientRect();
          return node.contains(
            document.elementFromPoint(
              box.x + box.width / 2,
              box.y + box.height / 2,
            ),
          );
        }),
      );
    assert.ok(reachable, "Window controls must stay uncovered");
  },
};

launcherScenes["launcher-decision-sidebar"] = {
  mock: "launcher-decision",
  async prepare(page) {
    await launcherScenes["launcher-decision"].prepare(page);
    await page.keyboard.press("Control+b");
    await page.locator(".v-sidebar--collapsed").waitFor({ state: "detached" });
    assert.equal(
      await page
        .locator(".v-sidebar")
        .evaluate((node) => node.getBoundingClientRect().width),
      272,
    );
    await page
      .getByRole("dialog", { name: "Decisión de lanzamiento", exact: true })
      .waitFor();
  },
};
