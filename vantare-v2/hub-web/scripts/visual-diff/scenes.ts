import type { Page } from "playwright-core";
import { accessScenes } from "./access.ts";
import { accountScenes } from "./account.ts";
import { calendarScenes } from "./calendar-scenes.ts";
import { frameScenes } from "./frame.ts";
import { homeScenes } from "./home.ts";
import { launcherScenes } from "./launcher.ts";
import { notificationScenes } from "./notifications.ts";
import { pilotScenes } from "./pilot.ts";
import { privacyScenes } from "./privacy.ts";
import { roadmapScenes } from "./roadmap.ts";
import { studioScenes } from "./studio.ts";
import { sweepScenes } from "./sweep.ts";
import { testingScenes } from "./testing-scenes.ts";
import { upcomingScenes } from "./upcoming.ts";

export interface VisualScene {
  mock: string;
  prepare(page: Page): Promise<void>;
  cleanup?(page: Page): Promise<void>;
}
const settingsTabs: Record<string, string> = {
  "ajustes-cuenta": "Cuenta",
  "ajustes-aplicacion": "General",
  "ajustes-apariencia": "Apariencia",
  "ajustes-rendimiento": "Rendimiento en pista",
  "ajustes-atajos": "Atajos",
  "ajustes-actualizaciones": "Actualizaciones",
  "ajustes-privacidad": "Privacidad",
  "ajustes-diagnostico": "DiagnÃ³stico",
};
// Each screen worker adds its own module, imported here. No fallback to another scene.
export const visualScenes: Record<string, VisualScene> = {
  ...accountScenes,
  ...accessScenes,
  ...frameScenes,
  ...homeScenes,
  ...calendarScenes,
  ...pilotScenes,
  ...privacyScenes,
  ...testingScenes,
  ...upcomingScenes,
  ...roadmapScenes,
  ...notificationScenes,
  ...launcherScenes,
  ...studioScenes,
  ...sweepScenes,
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
