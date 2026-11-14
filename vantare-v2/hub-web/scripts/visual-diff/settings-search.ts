import assert from "node:assert/strict";
import type { VisualScene } from "./scenes.ts";

export const settingsSearchScenes: Record<string, VisualScene> = {
  "ajustes-busqueda-posthog": {
    mock: "ajustes-con-diseno",
    async prepare(page) {
      const search = page.getByRole("searchbox", { name: "Buscar un ajuste…" });
      await search.fill("posthog");
      const privacy = page.getByRole("tab", {
        name: "Privacidad",
        exact: true,
      });
      await privacy.waitFor();
      assert.equal(await privacy.getAttribute("aria-selected"), "true");
      assert.equal(await page.getByRole("tab").count(), 1);
      await page.getByRole("tabpanel").waitFor();
      await page
        .getByRole("button", { name: "Consultar permiso de correos" })
        .waitFor();
      assert.equal(
        await search.evaluate((node) => node === document.activeElement),
        true,
      );
    },
  },
};
