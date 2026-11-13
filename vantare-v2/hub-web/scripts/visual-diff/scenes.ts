import type { Page } from "playwright-core";
import { privacyText } from "../../src/renderer/i18n/privacy.es.ts";
import { accessScenes } from "./access.ts";
import { accountScenes } from "./account.ts";
import { calendarNoticeScenes } from "./calendar-notices.ts";
import { calendarScenes } from "./calendar-scenes.ts";
import { commandScenes } from "./commands.ts";
import { dialogTopbarScenes } from "./dialog-topbar.ts";
import { frameScenes } from "./frame.ts";
import { homeScenes } from "./home.ts";
import { launcherScenes } from "./launcher.ts";
import { notificationHonestyScenes } from "./notification-honesty.ts";
import { notificationScenes } from "./notifications.ts";
import { onboardingScenes } from "./onboarding.ts";
import { palettePreviewScenes } from "./palette-previews.ts";
import { pilotScenes } from "./pilot.ts";
import { privacyScenes } from "./privacy.ts";
import { residentAnswerScenes } from "./resident-answer.ts";
import { residentResultsScenes } from "./resident-results.ts";
import { residentControlScenes } from "./resident-control.ts";
import { roadmapScenes } from "./roadmap.ts";
import { studioScenes } from "./studio.ts";
import { studioCatalogScenes } from "./studio-catalog.ts";
import { studioStateScenes } from "./studio-states.ts";
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
  "ajustes-diagnostico": "Diagnóstico",
};
// Each screen worker adds its own module, imported here. No fallback to another scene.
export const visualScenes: Record<string, VisualScene> = {
  ...residentControlScenes,
  ...residentResultsScenes,
  ...residentAnswerScenes,
  ...accountScenes,
  ...dialogTopbarScenes,
  ...accessScenes,
  ...frameScenes,
  ...homeScenes,
  ...calendarScenes,
  ...commandScenes,
  ...onboardingScenes,
  ...pilotScenes,
  ...privacyScenes,
  ...testingScenes,
  ...upcomingScenes,
  ...roadmapScenes,
  ...notificationScenes,
  ...launcherScenes,
  ...studioScenes,
  ...studioStateScenes,
  ...studioCatalogScenes,
  ...sweepScenes,
  ...Object.fromEntries(
    Object.entries(settingsTabs).map(([scene, tab]) => [
      scene,
      {
        mock: "ajustes-con-diseno",
        async prepare(page: Page) {
          await page.getByRole("tab", { name: tab, exact: true }).click();
          await page.getByRole("tabpanel").waitFor();
          if (scene === "ajustes-privacidad") {
            await page
              .getByText(privacyText.optional, { exact: true })
              .waitFor();
            for (const name of [
              privacyText.enable,
              privacyText.refresh,
              "Política de privacidad",
            ]) {
              const control = page.getByRole("button", { name, exact: true });
              if (
                !(await control.isEnabled()) ||
                (await control.getAttribute("aria-disabled")) === "true" ||
                !(await control.isVisible())
              )
                throw new Error(
                  `Privacy action unavailable in signed-in QA: ${name}`,
                );
              if (
                (await control.evaluate(
                  (node) => getComputedStyle(node).opacity,
                )) !== "1"
              )
                throw new Error(`Privacy action unexpectedly dimmed: ${name}`);
            }
          }
        },
      },
    ]),
  ),
  ...palettePreviewScenes,
  ...notificationHonestyScenes,
  ...calendarNoticeScenes,
};
