import assert from "node:assert/strict";
import { launcherText as text } from "../../src/renderer/i18n/launcher.ts";
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

launcherScenes["launcher-opciones-ocupadas"] = {
  mock: "launcher-ready",
  async prepare(page) {
    await launcherScenes["launcher-base"].prepare(page);
    await page
      .getByRole("button", { name: new RegExp(`^${text.launch}`) })
      .first()
      .click();
    // The local mock does not run the native 500 ms status publisher. Opening
    // the palette performs its normal launcher.get instead of fabricating a view.
    await page.getByText(text.queued, { exact: true }).waitFor();
    await page.keyboard.press("Control+k");
    await until(
      async () =>
        (await page.locator(".v-launcher-rail").textContent())?.includes(
          text.nextOptions,
        ) ?? false,
      5000,
      "fresh running snapshot",
    );
    await page.keyboard.press("Escape");
    await page
      .getByRole("heading", { name: text.nextOptions, exact: true })
      .waitFor();
    await page
      .getByText(text.queued, { exact: true })
      .waitFor({ state: "hidden" });
  },
};

// At 1080 px high the existing rail also exposes its close-on-exit Switch.
// Verify the real CSS/Tab path; jsdom alone cannot prove that it is reachable.
launcherScenes["launcher-opciones-lectura"] = {
  mock: "launcher-ready",
  async prepare(page) {
    await launcherScenes["launcher-opciones-ocupadas"].prepare(page);
    const controls = page.locator(
      '.v-launcher-options [role="combobox"],.v-launcher-quick [role="switch"]',
    );
    assert.equal(await controls.count(), 6);
    await controls.first().focus();
    for (let index = 0; index < 6; index++) {
      const control = controls.nth(index);
      assert.ok(await control.isVisible());
      assert.equal(
        await control.evaluate((node) => node === document.activeElement),
        true,
      );
      assert.equal(await control.getAttribute("aria-readonly"), "true");
      const reason = await control.getAttribute("aria-describedby");
      assert.ok(reason);
      assert.equal(
        await page.locator(`[id="${reason}"]`).textContent(),
        text.runningOptionsReadOnly,
      );
      if (index < 5) {
        await control.click();
        assert.equal(await page.getByRole("listbox").count(), 0);
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        assert.equal(await page.getByRole("listbox").count(), 0);
      }
      if (index < 5) await page.keyboard.press("Tab");
    }
    const toggle = controls.last();
    const checked = await toggle.getAttribute("aria-checked");
    await page.keyboard.press("Space");
    assert.equal(await toggle.getAttribute("aria-checked"), checked);
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
    const catalog = await page.locator(".v-launcher-catalog").boundingBox();
    const height = await page.evaluate(() => window.innerHeight);
    assert.ok(
      catalog &&
        catalog.y + catalog.height >= height - 20 &&
        catalog.y + catalog.height <= height - 17,
      "Native catalogue must fill the content down to the page footer",
    );
    assert.ok(
      await page
        .locator(".v-launcher-catalog-body")
        .evaluate((node) => node.scrollHeight > node.clientHeight),
      "Catalogue overflow must stay inside its own scroller",
    );
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
