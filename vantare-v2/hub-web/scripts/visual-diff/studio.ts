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
