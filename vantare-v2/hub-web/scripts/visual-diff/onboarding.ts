import type { VisualScene } from "./scenes.ts";
// Navigation belongs to the QA adapter. The actual Intro components never read
// capture scene names, query strings, clocks, or reference image state.
export const onboardingScenes: Record<string, VisualScene> = Object.fromEntries(
  [0, 1, 2].map((step) => [
    `onboarding-${step}`,
    {
      mock: `onboarding-${step}`,
      async prepare(page) {
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
        if (step === 2)
          await page
            .getByRole("button", { name: "Continuar", exact: true })
            .click();
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
