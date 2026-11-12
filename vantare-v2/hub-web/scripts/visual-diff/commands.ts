import type { VisualScene } from "./scenes.ts";

export const commandScenes: Record<string, VisualScene> = Object.fromEntries(
  ["shell-paleta-abierta", "shell-paleta-busqueda", "shell-paleta-vacia"].map(
    (scene) => [
      scene,
      {
        mock: "inicio-referencia",
        async prepare(page) {
          await page.clock.setFixedTime(new Date("2026-09-30T14:30:00Z"));
          await page
            .getByRole("button", { name: "Inicio", exact: true })
            .click();
          await page.locator(".v-home:not(.v-home--loading)").waitFor();
          await page.keyboard.press("Control+k");
          const search = page.locator("[data-command-palette]");
          await search.waitFor();
          if (scene === "shell-paleta-busqueda") await search.fill("Studio");
          if (scene === "shell-paleta-vacia")
            await search.fill("zz-no-resultados");
          // The GPUI reference HWND is unfocused: capture the same state, without a caret.
          await search.evaluate((node) => (node as HTMLInputElement).blur());
          await page.mouse.move(1300, 850);
        },
      },
    ],
  ),
);
