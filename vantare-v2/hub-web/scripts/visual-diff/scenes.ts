import type { Page } from "playwright-core";
import { launcherScenes } from "./launcher.ts";
import { notificationScenes } from "./notifications.ts";
import { roadmapScenes } from "./roadmap.ts";
import { testingScenes } from "./testing-scenes.ts";
import { upcomingScenes } from "./upcoming.ts";

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
export const visualScenes: Record<string, VisualScene> = {
  ...testingScenes,
  ...upcomingScenes,
  ...roadmapScenes,
  ...notificationScenes,
  ...launcherScenes,
  ...Object.fromEntries(
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
  ),
};
