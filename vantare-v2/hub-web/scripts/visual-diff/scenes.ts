import type { Page } from "playwright-core";

export interface VisualScene {
  mock: string;
  prepare(page: Page): Promise<void>;
}
const settingsTabs: Record<string, string> = {
  "ajustes-aplicacion": "General",
  "ajustes-apariencia": "Apariencia",
  "ajustes-rendimiento": "Rendimiento en pista",
  "ajustes-atajos": "Atajos",
  "ajustes-actualizaciones": "Actualizaciones",
  "ajustes-privacidad": "Privacidad",
  "ajustes-diagnostico": "Diagnóstico",
};
// Each screen worker adds its own module, imported here. No fallback to another scene.
export const visualScenes: Record<string, VisualScene> = Object.fromEntries(
  Object.entries(settingsTabs).map(([scene, tab]) => [
    scene,
    {
      mock: "ajustes-con-diseno",
      async prepare(page: Page) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        await page.getByRole("tabpanel").waitFor();
      },
    },
  ]),
);
