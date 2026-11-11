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
// Collapse navigation before opening Launcher: the decision makes it inert.
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
  },
};
