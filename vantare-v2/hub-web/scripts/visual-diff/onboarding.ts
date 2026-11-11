import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import type { VisualScene } from "./scenes.ts";
// Navigation belongs to the QA adapter. The actual Intro components never read
// capture scene names, query strings, clocks, or reference image state.
export const onboardingScenes: Record<string, VisualScene> = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6, 7].map((step) => [
    `onboarding-${step}`,
    {
      mock: `onboarding-${step}`,
      async prepare(page: Page) {
        await page.emulateMedia({ reducedMotion: "reduce" });
        const catalog = new URL(page.url());
        catalog.searchParams.set("escena", "specimen");
        await page.goto(catalog.href);
        await page
          .getByRole("button", { name: "Configuración inicial", exact: true })
          .click();
        await page.getByRole("heading", { name: /LO QUE NECESITAS/ }).waitFor();
        if (step >= 1)
          await page
            .getByRole("button", { name: "Empezar", exact: true })
            .click();
        if (step >= 2)
          await page
            .getByRole("button", { name: "Continuar", exact: true })
            .click();
        if (step >= 3)
          await page
            .getByRole("button", { name: "Continuar", exact: true })
            .click();
        if (step >= 4)
          await page
            .getByRole("button", { name: "Ahora no", exact: true })
            .click();
        if (step >= 5)
          await page
            .getByRole("button", { name: "Continuar", exact: true })
            .click();
        if (step >= 6)
          await page
            .getByRole("button", { name: "Continuar", exact: true })
            .click();
        if (step >= 7)
          await page
            .getByRole("button", { name: "Terminar", exact: true })
            .click();
        const primary = page.getByRole("button", {
          name:
            step === 7
              ? "Abrir mi overlay"
              : step === 6
                ? "Terminar"
                : step === 0
                  ? "Empezar"
                  : step === 3
                    ? /^(Ahora no|Continuar)$/
                    : "Continuar",
          exact: true,
        });
        await primary.hover();
        const contrast = await primary.evaluate((button) => {
          const style = getComputedStyle(button);
          const luminance = (color: string) => {
            const channels = color
              .match(/[0-9.]+/g)
              ?.slice(0, 3)
              .map(Number);
            if (channels?.length !== 3)
              throw new Error(`Unsupported color ${color}`);
            const [r, g, b] = channels.map((channel) => {
              const x = channel / 255;
              return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const a = luminance(style.color),
            b = luminance(style.backgroundColor);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });
        assert.ok(contrast >= 4.5, `Primary hover contrast ${contrast}`);
        await page.mouse.move(0, 0);
        await page.waitForFunction(async () => {
          await Promise.all(
            Array.from(document.images, (image) =>
              image.decode().catch(() => {}),
            ),
          );
          return (
            document.fonts.status === "loaded" &&
            !document.querySelector('[aria-busy="true"]')
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

// Additional account states have no matching frozen GPUI bank scene: capture
// them without percentages, preserving onboarding-3 as the comparable guest.
for (const state of ["sesion", "cargando", "error"] as const) {
  const scene = `onboarding-cuenta-${state}`;
  onboardingScenes[scene] = {
    mock: scene,
    async prepare(page: Page) {
      await onboardingScenes["onboarding-3"].prepare(page);
      const pro = page.getByRole("button", { name: "Elegir Pro", exact: true });
      if (state === "sesion") {
        await page.getByText("Acceso verificado", { exact: true }).waitFor();
        assert.equal(
          await page
            .getByRole("button", { name: "Continuar con email" })
            .count(),
          0,
        );
        assert.equal(await pro.isEnabled(), true);
      } else if (state === "cargando") {
        await page.getByText("Comprobando cuenta…", { exact: true }).waitFor();
        assert.equal(await pro.isDisabled(), true);
      } else {
        await page
          .getByText("No se pudo cargar la cuenta.", { exact: true })
          .waitFor();
      }
    },
  };
}
