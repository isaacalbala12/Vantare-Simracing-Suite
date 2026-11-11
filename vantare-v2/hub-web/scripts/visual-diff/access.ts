import type { VisualScene } from "./scenes.ts";

const names = [
  "acceso-base",
  "email-formulario",
  "email-codigo",
  "email-crear-contrasena",
  "email-consentimiento",
  "email-autorizando",
  "email-reiniciado",
  "email-ocupado",
  "email-espera",
];
export const accessScenes: Record<string, VisualScene> = Object.fromEntries(
  names.map((scene) => [
    scene,
    {
      mock: scene,
      async prepare(page) {
        await page
          .getByRole("dialog", { name: "Bienvenido a Vantare" })
          .waitFor();
        const field = page.getByRole("textbox", { name: "Email", exact: true });
        if (
          [
            "email-formulario",
            "email-crear-contrasena",
            "email-reiniciado",
            "email-ocupado",
            "email-espera",
          ].includes(scene)
        )
          await field.fill("piloto@example.invalid");
        if (scene === "email-espera") {
          await page
            .getByRole("button", { name: "Continuar", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Esperando…", exact: true })
            .waitFor();
        }
        await page.locator("h1").click();
      },
      async cleanup(page) {
        if (scene === "email-espera")
          await page
            .getByRole("button", { name: "Volver", exact: true })
            .click();
      },
    } satisfies VisualScene,
  ]),
);
