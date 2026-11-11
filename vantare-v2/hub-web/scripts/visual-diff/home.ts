import type { VisualScene } from "./scenes.ts";
export const homeScenes: Record<string, VisualScene> = Object.fromEntries(
  [
    "inicio-base",
    "inicio-vacio",
    "inicio-cargando",
    "inicio-error",
    "inicio-lanzando",
    "inicio-sin-diseno",
    "licencias-modulos-dispositivos",
  ].map((scene) => [
    scene,
    {
      mock:
        scene === "licencias-modulos-dispositivos"
          ? "inicio-referencia"
          : scene,
      async prepare(page) {
        await page.clock.install({
          time: new Date("2026-09-30T16:30:00+02:00"),
        });
        await page.getByRole("button", { name: "Inicio", exact: true }).click();
        await page
          .getByRole("button", { name: "Lanzar perfil seleccionado" })
          .waitFor();
        await page
          .locator(
            scene === "inicio-cargando"
              ? ".v-home--loading"
              : ".v-home:not(.v-home--loading)",
          )
          .waitFor();
        if (scene === "inicio-error")
          await page.locator(".v-home-error").waitFor();
        await page.waitForFunction(() => {
          const preview = document.querySelector(".v-home-preview");
          const images = preview?.querySelectorAll(".v-home-widget");
          return (
            !images?.length ||
            [...images].some(
              (image) => image.getBoundingClientRect().width > 32,
            )
          );
        });
        await page
          .locator(".v-home-templates img, .v-home-preview img")
          .evaluateAll(async (images) => {
            await Promise.all(
              images.map((image) => (image as HTMLImageElement).decode()),
            );
          });
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
      },
    },
  ]),
);
