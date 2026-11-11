import type { VisualScene } from "./scenes.ts";
export const privacyScenes: Record<string, VisualScene> = Object.fromEntries(
  ["privacidad-pendiente", "privacidad-uso"].map((scene) => [
    scene,
    {
      mock: scene,
      async prepare(page) {
        await page
          .getByRole("dialog", {
            name:
              scene === "privacidad-uso"
                ? "Consentimiento para datos de uso"
                : "Consentimiento para informes de fallos",
          })
          .waitFor();
        await page
          .getByRole("button", { name: "No, gracias", exact: true })
          .focus();
      },
    } satisfies VisualScene,
  ]),
);
