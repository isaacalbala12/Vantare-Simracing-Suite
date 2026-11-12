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
        // Step 6 must retain the actual first-run fixture, with undecided
        // consent. Specimen represents an existing user who declined it.
        if (step !== 6) {
          const catalog = new URL(page.url());
          catalog.searchParams.set("escena", "specimen");
          await page.goto(catalog.href);
          await page
            .getByRole("button", { name: "Configuración inicial", exact: true })
            .click();
        }
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
            .getByRole("button", {
              name: /^(Ahora no|Continuar)$/,
              exact: true,
            })
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
        if (step === 6)
          assert.equal(
            await page
              .getByRole("switch", {
                name: "Enviar informes de fallos",
                exact: true,
              })
              .getAttribute("aria-checked"),
            "true",
            "First-run crash-report choice must be shown on, without writing it",
          );
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
onboardingScenes["onboarding-correo"] = {
  mock: "onboarding-cuenta-sesion",
  async prepare(page) {
    await onboardingScenes["onboarding-6"].prepare(page);
    const mail = page.getByRole("switch", {
      name: "Recibir novedades y ofertas por correo",
    });
    await mail.waitFor();
    assert.equal(await mail.isEnabled(), true);
    assert.equal(await mail.isChecked(), false);
    await mail.click();
    assert.equal(await mail.isChecked(), true);
    await page
      .getByText("Si cambias tu elección, se guardará al pulsar Terminar.", {
        exact: true,
      })
      .waitFor();
  },
};

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

for (const state of ["sin-permiso", "con-permiso", "error"] as const) {
  const scene = `onboarding-correo-${state}`;
  onboardingScenes[scene] = {
    mock: scene,
    async prepare(page) {
      await onboardingScenes["onboarding-6"].prepare(page);
      const mail = page.getByRole("switch", {
        name: "Recibir novedades y ofertas por correo",
      });
      await mail.waitFor();
      assert.equal(await mail.isEnabled(), true);
      assert.equal(await mail.isChecked(), state === "con-permiso");
      if (state === "error") {
        await mail.click();
        await page
          .getByRole("button", { name: "Terminar", exact: true })
          .click();
        await page
          .getByText(
            "Correos sin confirmar. Puedes terminar y reintentarlo en Ajustes › Privacidad",
            { exact: true },
          )
          .waitFor();
        await page
          .locator("dl > div")
          .filter({ has: page.locator("dt", { hasText: /^Correos$/ }) })
          .getByText("Sin confirmar", { exact: true })
          .waitFor();
      }
    },
  };
}
