import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
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
        if (scene === "inicio-base") {
          await page
            .getByRole("button", { name: /^Lanzar Carrera LMU/ })
            .waitFor();
          for (const profile of [
            "Carrera LMU",
            "Streaming Le Mans",
            "Entreno rápido",
          ])
            await page
              .getByText(`${profile} · último lanzamiento`, { exact: true })
              .waitFor();
        }
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
homeScenes["inicio-base"].cleanup = async (page) => {
  await page.setViewportSize({ width: 1800, height: 1100 });
  try {
    const apps = page.getByRole("list", {
      name: "Aplicaciones del perfil favorito",
    });
    await apps.waitFor();
    assert.deepEqual(
      await apps
        .locator("li")
        .evaluateAll((items) =>
          items.map((item) => item.getAttribute("data-app")),
        ),
      ["lmu", "crewchief", "simhub", "custom:vantare"],
    );
    const output = process.env.VANTARE_HUB_EVIDENCE;
    if (output) {
      await mkdir(output, { recursive: true });
      const scheme = await page.evaluate(
        () => document.documentElement.dataset.scheme,
      );
      // Supplementary CDP image; the primary remains a 1440x900 HWND capture.
      await page.screenshot({
        path: join(output, `inicio-favorito-amplio-${scheme}.png`),
      });
    }
  } finally {
    await page.setViewportSize({ width: 1440, height: 900 });
  }
};
