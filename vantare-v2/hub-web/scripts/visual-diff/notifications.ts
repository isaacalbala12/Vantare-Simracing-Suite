import assert from "node:assert/strict";
import type { VisualScene } from "./scenes.ts";
export const notificationScenes: Record<string, VisualScene> = {
  "notificaciones-completa": {
    mock: "notificaciones-base",
    async prepare(page) {
      const target = new URL(page.url());
      target.searchParams.set("escena", "notificaciones-cinco");
      await page.goto(target.href);
      await page
        .getByRole("button", { name: "Notificaciones", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Ver todas las notificaciones",
          exact: true,
        })
        .click();
      await page
        .getByText("Actualización de prueba lista", { exact: true })
        .waitFor();
      await page
        .getByText("El perfil de prueba falló", { exact: true })
        .waitFor();
      // Wait for tester access as well as the fixture before counting Beta.
      await page
        .getByText("Respuesta al informe de prueba", { exact: true })
        .waitFor();
      const full = page.locator(".v-notifications--full");
      await full.waitFor({ state: "visible" });
      await full.locator("article.v-notification").nth(4).waitFor();
      assert.equal(await full.locator("article.v-notification").count(), 5);
      assert.equal(
        await full.locator('article[data-unread="true"]').count(),
        3,
      );
    },
  },
  "notificaciones-completa-vacio": {
    mock: "notificaciones-base",
    async prepare(page) {
      await page
        .getByRole("button", {
          name: "Cambiar tema claro u oscuro",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Notificaciones", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Ver todas las notificaciones",
          exact: true,
        })
        .click();
      const full = page.locator(".v-notifications--full");
      await full.getByRole("button", { name: "Limpiar", exact: true }).click();
      await full.getByText("Todo al día", { exact: true }).waitFor();
      const toast = page.locator(".v-toast");
      if (await toast.isVisible()) {
        await toast
          .getByRole("button", { name: "Cerrar", exact: true })
          .click();
        await toast.waitFor({ state: "hidden" });
      }
    },
  },
  "shell-notificaciones-abiertas": {
    mock: "notificaciones-base",
    async prepare(page) {
      await page.getByRole("button", { name: "Inicio", exact: true }).click();
      await page
        .getByRole("button", { name: "Notificaciones", exact: true })
        .click();
      await page.getByText("Todo al día", { exact: true }).waitFor();
    },
  },
};
