import type { VisualScene } from "./scenes.ts";
export const studioScenes: Record<string, VisualScene> = {
  "studio-base": {
    mock: "studio-base",
    async prepare(page) {
      await page.getByRole("button", { name: "Studio", exact: true }).click();
      await page
        .getByRole("heading", { name: "Standings", exact: true })
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
      await page.getByRole("button", { name: "Studio", exact: true }).click();
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
