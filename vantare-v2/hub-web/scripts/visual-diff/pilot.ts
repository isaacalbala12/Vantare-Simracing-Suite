import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { until } from "../wait-for.ts";
import type { VisualScene } from "./scenes.ts";
export const pilotScenes: Record<string, VisualScene> = {
  "ajustes-perfil-recorte": {
    mock: "ajustes-con-diseno",
    async cleanup(page) {
      const cancel = page.getByRole("button", {
        name: "Cancelar",
        exact: true,
      });
      if (await cancel.count()) await cancel.click();
      const discard = page.getByRole("button", {
        name: "Descartar",
        exact: true,
      });
      if ((await discard.count()) && (await discard.isEnabled())) {
        await discard.click();
        await until(
          () => discard.isDisabled(),
          2000,
          "pilot discard committed",
        );
      }
    },
    async prepare(page) {
      await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Nombre público", exact: true })
        .fill("Piloto QA");
      await page
        .getByRole("textbox", { name: "Descripción corta", exact: true })
        .fill("Ejemplo de perfil privado del piloto");
      await page.getByRole("combobox", { name: "País", exact: true }).click();
      await page.getByRole("option", { name: "España", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Coche favorito", exact: true })
        .fill("Porsche 911 GT3 R");
      await page
        .getByRole("textbox", { name: "Equipo favorito", exact: true })
        .fill("Equipo QA");
      await page
        .getByRole("checkbox", { name: "Le Mans Ultimate", exact: true })
        .click();
      await page
        .getByRole("checkbox", {
          name: "Assetto Corsa Competizione",
          exact: true,
        })
        .click();
      // Tool-only fixture extraction. No GPUI source or fixture enters the renderer.
      const native = await readFile(
        "../native/hub/src/pilot/capture.rs",
        "utf8",
      );
      const png = /STANDARD\.decode\("([A-Za-z0-9+/=]+)"\)/.exec(native)?.[1];
      assert.ok(png, "Missing native crop QA image");
      await page.getByLabel("Elegir foto", { exact: true }).setInputFiles({
        name: "pilot-qa.png",
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      });
      if (process.env.VANTARE_HUB_VISUAL_BASELINE === "centered-photo") {
        await page
          .getByRole("img", { name: "Piloto QA", exact: true })
          .first()
          .waitFor();
      } else
        await page
          .getByRole("button", {
            name: "Recorte de la foto: arrastra para mover, rueda para acercar",
            exact: true,
          })
          .waitFor();
      await page.getByRole("tabpanel").evaluate((node) => {
        const scroller = node.closest(".v-shell-main");
        if (scroller) scroller.scrollTop = 0;
      });
    },
  },
};
