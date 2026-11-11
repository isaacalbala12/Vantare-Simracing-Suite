import assert from "node:assert/strict";
import type { VisualScene } from "./scenes.ts";
export const studioScenes: Record<string, VisualScene> = {
  "studio-base": {
    mock: "studio-base",
    async prepare(page) {
      await page
        .getByRole("button", {
          name: /^(Studio|Overlays Studio)$/,
          exact: true,
        })
        .click();
      await page
        .getByRole("heading", { name: /^Standings(?: 1)?$/, exact: true })
        .waitFor();
      const sidebar = page.locator(".v-sidebar");
      if (
        !(await sidebar.evaluate((node) =>
          node.classList.contains("v-sidebar--collapsed"),
        ))
      )
        await page.keyboard.press("Control+b");
    },
  },
};

studioScenes["studio-catalogo-teclado"] = {
  mock: "studio-base",
  async prepare(page) {
    await studioScenes["studio-base"].prepare(page);
    await page.getByRole("button", { name: "Añadir", exact: true }).click();
    await page
      .getByRole("searchbox", { name: "Buscar widget", exact: true })
      .waitFor();
    const groups = page.locator(".v-studio-catalog-grid");
    const index = await groups.evaluateAll((nodes) =>
      nodes.findIndex(
        (node) =>
          node.querySelectorAll("[data-kind]:not(:disabled)").length >= 4,
      ),
    );
    assert.ok(index >= 0, "Missing populated catalog group");
    const buttons = groups.nth(index).locator("[data-kind]:not(:disabled)");
    for (let count = 0; count < 80; count++) {
      if (
        await buttons
          .first()
          .evaluate((node) => node === document.activeElement)
      )
        break;
      await page.keyboard.press("Tab");
    }
    assert.equal(
      await buttons.first().evaluate((node) => node === document.activeElement),
      true,
    );
    const columns = await groups
      .nth(index)
      .evaluate(
        (node) =>
          getComputedStyle(node)
            .gridTemplateColumns.split(/\s+/)
            .filter(Boolean).length,
      );
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await buttons
        .nth(columns)
        .evaluate((node) => node === document.activeElement),
      true,
    );
  },
};

studioScenes["studio-ayuda-teclado"] = {
  mock: "studio-base",
  async prepare(page) {
    await studioScenes["studio-base"].prepare(page);
    const hint = page.getByRole("group", {
      name: "Pronto podrás mover y cambiar el tamaño de los overlays sobre el juego.",
      exact: true,
    });
    for (let index = 0; index < 80; index++) {
      if (await hint.evaluate((node) => document.activeElement === node)) break;
      await page.keyboard.press("Tab");
    }
    assert.equal(
      await hint.evaluate((node) => document.activeElement === node),
      true,
    );
    await page
      .getByRole("tooltip")
      .filter({ hasText: "Pronto podrás mover" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Colocar en pantalla", exact: true })
        .isDisabled(),
      true,
    );
  },
};

for (const scene of [
  "studio-vacio",
  "studio-oculto",
  "studio-error",
  "studio-protegido",
  "studio-mostrando",
  "studio-pro-bloqueado",
]) {
  studioScenes[scene] = {
    mock: scene,
    async prepare(page) {
      await page
        .getByRole("button", {
          name: /^(Studio|Overlays Studio)$/,
          exact: true,
        })
        .click();
      await page
        .getByRole("heading", { name: "OVERLAYS STUDIO", exact: true })
        .waitFor();
    },
  };
}
studioScenes["studio-catalogo"] = {
  mock: "studio-base",
  async prepare(page) {
    await studioScenes["studio-base"].prepare(page);
    await page.getByRole("button", { name: "Añadir", exact: true }).click();
    await page
      .getByRole("searchbox", { name: "Buscar widget", exact: true })
      .waitFor();
  },
};
studioScenes["studio-en-pista"] = {
  mock: "studio-base",
  async prepare(page) {
    await studioScenes["studio-base"].prepare(page);
    await page.getByRole("tab", { name: "En pista", exact: true }).click();
    await page.getByRole("switch", { name: "Visible", exact: true }).waitFor();
  },
};

// The 10b gallery matrix reuses the same closed mock data, without new wire methods.
for (const count of [4, 30]) {
  for (const collapsed of [false, true]) {
    studioScenes[
      `studio-galeria-${count}-${collapsed ? "cerrado" : "abierto"}`
    ] = {
      mock: count === 4 ? "studio-base" : "studio-muchos",
      async prepare(page) {
        await studioScenes["studio-base"].prepare(page);
        const toggle = page.getByRole("button", {
          name: "Contraer o ampliar información",
          exact: true,
        });
        if ((await toggle.getAttribute("aria-expanded")) !== String(!collapsed))
          await toggle.click();
        if (collapsed) {
          await page.getByRole("button", { name: /^Añadir widget/ }).click();
          const search = page.getByRole("searchbox", {
            name: "Buscar widget",
            exact: true,
          });
          await search.waitFor();
          assert.equal(
            await search.evaluate((node) => node === document.activeElement),
            true,
            "Add must focus the reopened catalog",
          );
          await page.locator(".v-studio-overlay-select").first().click();
          await page
            .getByRole("heading", { name: /^Standings(?: 1)?$/, exact: true })
            .waitFor();
          await toggle.click();
        }
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve()),
            ),
        );
        const previewChecks = await page
          .locator(".v-widget-preview")
          .evaluateAll((nodes) =>
            nodes.map((node) => {
              const image = node.querySelector<SVGElement>(
                'svg[data-fallback="true"]',
              );
              const css = getComputedStyle(node);
              const usefulHeight =
                node.clientHeight -
                parseFloat(css.paddingTop) -
                parseFloat(css.paddingBottom);
              return (
                !image ||
                image.getBoundingClientRect().height >= usefulHeight * 0.6
              );
            }),
          );
        assert.ok(
          previewChecks.every(Boolean),
          "SVG fallback must occupy at least 60% of useful height",
        );
        const borders = await page
          .locator(".v-studio-obs-button,.v-studio-edit-button")
          .evaluateAll((nodes) =>
            nodes.map((node) => getComputedStyle(node).borderTopWidth),
          );
        assert.deepEqual(borders, ["1px", "1px"]);
        const cards = page.locator(".v-studio-overlay");
        await cards.first().waitFor();
        if ((await cards.count()) !== count)
          throw new Error("Studio QA instance count differs");
        if (
          collapsed &&
          (await page
            .getByRole("complementary", { name: "Inspector de widgets" })
            .count())
        )
          throw new Error("Collapsed Studio inspector is still mounted");
      },
    };
  }
}

for (const mock of [
  "studio-muchos",
  "studio-pocos",
  "studio-bloqueado",
  "studio-miniatura-ausente",
]) {
  studioScenes[mock] = {
    mock,
    async prepare(page) {
      await studioScenes["studio-base"].prepare(page);
      await page.locator(".v-studio-grid").waitFor();
    },
  };
}

for (const count of [4, 30]) {
  for (const collapsed of [false, true]) {
    const base = `studio-galeria-${count}-${collapsed ? "cerrado" : "abierto"}`;
    studioScenes[`${base}-sidebar`] = {
      mock: count === 4 ? "studio-base" : "studio-muchos",
      async prepare(page) {
        await studioScenes[base].prepare(page);
        await page.keyboard.press("Control+b");
        await page
          .locator(".v-sidebar--collapsed")
          .waitFor({ state: "detached" });
        assert.equal(
          await page
            .locator(".v-sidebar")
            .evaluate((node) => node.getBoundingClientRect().width),
          272,
        );
      },
    };
  }
}

studioScenes["studio-eliminado"] = {
  mock: "studio-base",
  async prepare(page) {
    await studioScenes["studio-base"].prepare(page);
    const card = page.getByRole("button", { name: "Delta", exact: true });
    await card.focus();
    await page.keyboard.press("Delete");
    const dialog = page.getByRole("dialog", {
      name: "Eliminar widget",
      exact: true,
    });
    await dialog
      .getByRole("button", { name: "Eliminar widget", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByText("Delta eliminado", { exact: true }).waitFor();
    await page
      .getByRole("heading", { name: "Standings", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Deshacer", exact: true })
        .isEnabled(),
      true,
    );
  },
};
