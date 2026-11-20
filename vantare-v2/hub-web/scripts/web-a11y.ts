import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Locator, type Page } from "playwright-core";
import { checkAccessGate } from "./check-access-gate.ts";
import { checkAccessStates } from "./check-access-states.ts";
import { checkAccount } from "./check-account.ts";
import { checkAccountDensity } from "./check-account-density.ts";
import { checkAppearanceDensity } from "./check-appearance-density";
import { checkCalendarDensity } from "./check-calendar-density";
import { checkCalendarDialogSafety } from "./check-calendar-dialog-safety.ts";
import { checkCommandPalette } from "./check-command-palette.ts";
import { checkDialogSafety } from "./check-dialog-safety.ts";
import { checkHomeDensity } from "./check-home-density";
import { checkHomePhotos } from "./check-home-photos";
import {
  checkLauncherDensity,
  checkLauncherOrigin,
} from "./check-launcher-density.ts";
import { checkLightContrast } from "./check-light-contrast.ts";
import { checkNativeAccessLayer } from "./check-native-access-layer.ts";
import { checkNotificationFocus } from "./check-notification-focus.ts";
import {
  checkOnboarding,
  checkOnboardingGuardedExit,
} from "./check-onboarding.ts";
import { checkPerformanceDensity } from "./check-performance-density";
import { checkPrivacyGate } from "./check-privacy-gate.ts";
import { checkResidentAnswer } from "./check-resident-answer.ts";
import { checkResidentControls } from "./check-resident-control.ts";
import { checkResidentRemoval } from "./check-resident-removal.ts";
import { checkResidentResults } from "./check-resident-results.ts";
import { checkResidentReview } from "./check-resident-review.ts";
import { checkMainScreens } from "./check-screens-a11y.ts";
import { checkSidebarProfiles } from "./check-sidebar-profiles.ts";
import { checkStrategyScreen } from "./check-strategy-screen";
import { checkStudioCanvas } from "./check-studio-canvas.ts";
import { checkStudioCatalogDrop } from "./check-studio-catalog-drop.ts";
import { checkStudioCatalogPhotos } from "./check-studio-catalog-photos";
import { checkStudioPreview } from "./check-studio-preview";
import { checkStudioStates } from "./check-studio-states.ts";
import { checkTestingDensity } from "./check-testing-density.ts";
import { printTimingSummary, timed, timedNames } from "./check-timing";
import { checkWorkshopScreen } from "./check-workshop-screen";
import { collectPageFailures, pageFailuresReport } from "./page-failures";
import { until } from "./wait-for";
import { comprobarEjecutados, leerParte } from "./web-a11y-partes";

async function focused(locator: Locator) {
  await until(
    () => locator.evaluate((node) => document.activeElement === node),
    5000,
    "keyboard focus",
  );
}

import tokens from "../design/tokens.json";
import { webQaPreview } from "./web-qa";

const evidence = resolve(
  process.env.VANTARE_HUB_EVIDENCE ?? "test-results/web",
);
await mkdir(evidence, { recursive: true });
// --parte=todo (por defecto, local) | paginas | analisis: el workflow reparte
// la línea de páginas y la de análisis (+ Estrategia) en jobs distintos.
const parte = leerParte(process.argv);
const server = await webQaPreview();
const browser = await chromium.launch();
// Analysis owns its context and page, so it runs beside the main page's checks
// instead of after them; its result is joined before the script ends.
async function runAnalysis() {
  let failures: string[] = [];
  try {
    const { checkRecordingStatus } = await import("./analysis-status-web.ts");
    const { checkAnalysisComparison } = await import(
      "./analysis-compare-web.ts"
    );
    const { checkAnalysisSessions } = await import(
      "./analysis-sessions-web.ts"
    );
    const { checkAnalysisSectors } = await import("./analysis-sectors-web.ts");
    const comparisonContext = await browser.newContext({
      timezoneId: "UTC",
      locale: "es-ES",
      reducedMotion: "reduce",
      deviceScaleFactor: 1,
    });
    const comparisonPage = await comparisonContext.newPage();
    comparisonPage.setDefaultTimeout(20000);
    const comparisonFailures = collectPageFailures(comparisonPage);
    failures = comparisonFailures;
    try {
      await timed("checkAnalysisComparison", () =>
        checkAnalysisComparison(
          comparisonPage,
          server.resolvedUrls?.local[0] ?? "",
          resolve(evidence, "analysis-comparison"),
        ),
      );
      await timed("checkAnalysisSessions", () =>
        checkAnalysisSessions(
          comparisonPage,
          server.resolvedUrls?.local[0] ?? "",
          resolve(evidence, "analysis-sessions"),
        ),
      );
      await timed("checkAnalysisSectors", () =>
        checkAnalysisSectors(
          comparisonPage,
          server.resolvedUrls?.local[0] ?? "",
        ),
      );
      await timed("checkRecordingStatus", () =>
        checkRecordingStatus(
          comparisonPage,
          server.resolvedUrls?.local[0] ?? "",
          resolve(evidence, "analysis-recording-status"),
        ),
      );
    } finally {
      await comparisonContext.close();
    }
    return { failures, error: undefined as unknown };
  } catch (error) {
    return { failures, error };
  }
}
const analysisRun = parte === "todo" ? runAnalysis() : undefined;
let failures: string[] = [];
let strategyFailures: string[] = [];
const startedAt = performance.now();
async function runPaginas() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  failures = collectPageFailures(page);
  page.setDefaultTimeout(20000);
  await page.goto(`${server.resolvedUrls?.local[0]}?escena=specimen`);
  await page.getByRole("heading", { name: "Componentes Vantare" }).waitFor();
  await page.evaluate(() => {
    document.documentElement.dataset.motion = "reduced";
  });
  const results = [];
  for (const palette of Object.keys(tokens.themes)) {
    for (const scheme of ["light", "dark"]) {
      await page.evaluate(
        ({ palette, scheme }) => {
          document.documentElement.dataset.palette = palette;
          document.documentElement.dataset.scheme = scheme;
        },
        { palette, scheme },
      );
      await page.evaluate(() => document.fonts.ready);
      const report = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      results.push({ palette, scheme, violations: report.violations });
      await writeFile(
        resolve(evidence, "axe.json"),
        JSON.stringify(results, null, 2),
      );
      assert.deepEqual(
        report.violations,
        [],
        `${palette}/${scheme}: accessibility violations`,
      );
    }
  }
  await page
    .getByRole("button", { name: "Abrir diálogo", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await timed("checkNativeAccessLayer", () => checkNativeAccessLayer(page));
  await dialog.getByRole("combobox", { name: "Esquema del diálogo" }).click();
  const light = page.getByRole("option", { name: "Claro", exact: true });
  await light.click(); // Playwright checks that the option receives the pointer above the modal.
  await until(
    async () =>
      (await dialog.getByRole("combobox").textContent())?.includes("Claro") ??
      false,
    5000,
    "confirmed content",
  );
  await page.screenshot({ path: resolve(evidence, "dialog-select.png") });
  await page.keyboard.press("Escape");
  const slider = page.getByRole("slider", { name: "Contraste" });
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await slider.evaluate(
      (input) =>
        getComputedStyle(input.closest(".v-slider-thumb") ?? input)
          .outlineStyle,
    ),
    "solid",
  );
  const region = page.locator(".v-table-scroll").last();
  await region.scrollIntoViewIfNeeded();
  assert.ok((await region.locator("tbody tr").count()) < 100);
  await region.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await region
    .getByText("qa-999.json", { exact: true })
    .waitFor({ state: "visible" });
  assert.ok((await region.locator("tbody tr").count()) < 100);
  await page.getByRole("button", { name: "Acciones", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await focused(page.getByRole("menuitem", { name: "Guardar cambios" }));
  await page.keyboard.press("Home");
  await focused(page.getByRole("menuitem", { name: "Guardar cambios" }));
  await page.keyboard.press("End");
  const disabledItem = page.getByRole("menuitem", {
    name: "Eliminar",
    exact: true,
  });
  await focused(disabledItem);
  assert.equal(await disabledItem.getAttribute("aria-disabled"), "true");
  await page.keyboard.press("Enter");
  await page.getByRole("menu").waitFor({ state: "visible" });
  await page.keyboard.press("Home");
  await focused(page.getByRole("menuitem", { name: "Guardar cambios" }));
  await page.keyboard.press("Enter");
  await until(
    async () => (await page.getByRole("menu").count()) === 0,
    5000,
    "element removed",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Buscar comandos" }).click();
  await page.getByRole("combobox", { name: "Comandos" }).fill("Ajustes");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await until(
    async () => (await page.getByRole("dialog").count()) === 0,
    5000,
    "element removed",
  );
  await page.getByRole("button", { name: "Mostrar aviso" }).click();
  const toast = page.locator(".v-toast");
  await until(
    async () =>
      (await toast.textContent())?.includes("No se pudo guardar") ?? false,
    5000,
    "confirmed content",
  );
  await page.keyboard.press("F6");
  await toast.getByRole("button", { name: "Cerrar" }).click();
  await until(async () => (await toast.count()) === 0, 5000, "element removed");
  await timed("checkHomeDensity", () =>
    checkHomeDensity(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkHomePhotos", () =>
    checkHomePhotos(page, server.resolvedUrls?.local[0] ?? ""),
  );
  if (parte === "todo") await runStrategy(page);
  await timed("checkWorkshopScreen", () =>
    checkWorkshopScreen(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkTestingDensity", () =>
    checkTestingDensity(page, server.resolvedUrls?.local[0] ?? ""),
  );
  const { checkSettingsDensity } = await import("./check-settings-density.ts");
  await timed("checkSettingsDensity", () =>
    checkSettingsDensity(page, server.resolvedUrls?.local[0] ?? ""),
  );
  const { checkSettingsHeading } = await import("./check-settings-heading.ts");
  await timed("checkSettingsHeading", () =>
    checkSettingsHeading(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkAccountDensity", () =>
    checkAccountDensity(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkLauncherDensity", () =>
    checkLauncherDensity(page, server.resolvedUrls?.local[0] ?? "", evidence),
  );
  await timed("checkSidebarProfiles", () =>
    checkSidebarProfiles(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkAppearanceDensity", () =>
    checkAppearanceDensity(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkDialogSafety", () =>
    checkDialogSafety(page, server.resolvedUrls?.local[0] ?? "", evidence),
  );
  await timed("checkResidentControls", () =>
    checkResidentControls(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkResidentRemoval", () =>
    checkResidentRemoval(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkResidentResults", () =>
    checkResidentResults(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkLauncherOrigin", () =>
    checkLauncherOrigin(page, server.resolvedUrls?.local[0] ?? "", evidence),
  );
  const { checkRoadmapDensity } = await import("./check-roadmap-density.ts");
  await timed("checkRoadmapDensity", () =>
    checkRoadmapDensity(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkResidentAnswer", () =>
    checkResidentAnswer(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkResidentReview", () =>
    checkResidentReview(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkCalendarDensity", () =>
    checkCalendarDensity(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkCalendarDialogSafety", () =>
    checkCalendarDialogSafety(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkPerformanceDensity", () =>
    checkPerformanceDensity(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkCommandPalette", () =>
    checkCommandPalette(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkNotificationFocus", () =>
    checkNotificationFocus(page, server.resolvedUrls?.local[0] ?? ""),
  );
  await timed("checkPrivacyGate", () =>
    checkPrivacyGate(page, server.resolvedUrls?.local[0] ?? "", evidence),
  );
  await timed("checkAccessGate", () =>
    checkAccessGate(page, server.resolvedUrls?.local[0] ?? "", evidence),
  );
  await timed("checkAccount", () =>
    checkAccount(page, server.resolvedUrls?.local[0] ?? "", evidence),
  );
  await timed("checkAccessStates", () =>
    checkAccessStates(page, server.resolvedUrls?.local[0] ?? "", evidence),
  );
  await timed("checkOnboarding", () =>
    checkOnboarding(page, server.resolvedUrls?.local[0] ?? "", evidence),
  );
  for (const mode of ["private", "protected"] as const)
    await timed("checkOnboardingGuardedExit", () =>
      checkOnboardingGuardedExit(
        page,
        server.resolvedUrls?.local[0] ?? "",
        evidence,
        mode,
      ),
    );
  await timed("checkStudioPreview", () =>
    checkStudioPreview(page, server.resolvedUrls?.local[0] ?? "", evidence),
  );
  await timed("checkStudioCatalogPhotos", () =>
    checkStudioCatalogPhotos(
      page,
      server.resolvedUrls?.local[0] ?? "",
      evidence,
    ),
  );
  await timed("checkStudioStates", () =>
    checkStudioStates(page, server.resolvedUrls?.local[0] ?? "", evidence),
  );
  const studioResults = [];
  for (const scheme of ["light", "dark"]) {
    await page.goto(
      `${server.resolvedUrls?.local[0] ?? ""}?escena=visual-${scheme}:studio-base`,
    );
    await page
      .getByRole("button", { name: /^(Studio|Overlays Studio)$/ })
      .click();
    await page.getByRole("heading", { name: "Look", exact: false }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    // heading-order is a best-practice rule, outside the specimen's WCAG tags.
    const report = await new AxeBuilder({ page }).analyze();
    studioResults.push({ scheme, violations: report.violations });
    await writeFile(
      resolve(evidence, "axe-studio.json"),
      JSON.stringify(studioResults, null, 2),
    );
    await page.screenshot({ path: resolve(evidence, `studio-${scheme}.png`) });
    assert.deepEqual(
      report.violations,
      [],
      `Studio/${scheme}: accessibility violations`,
    );
  }
  await timed("checkMainScreens", () =>
    checkMainScreens(page, server.resolvedUrls?.local[0] ?? "", evidence),
  );
  await timed("checkLightContrast", () =>
    checkLightContrast(page, server.resolvedUrls?.local[0] ?? "", evidence),
  );
  if (analysisRun) {
    const analysis = await analysisRun;
    failures.push(...analysis.failures);
    if (analysis.error !== undefined) throw analysis.error;
  }
  await timed("checkStudioCanvas", () =>
    checkStudioCanvas(page, server.resolvedUrls?.local[0] ?? "", evidence),
  );
  await timed("checkStudioCatalogDrop", () =>
    checkStudioCatalogDrop(page, server.resolvedUrls?.local[0] ?? "", evidence),
  );
  await writeFile(
    resolve(evidence, "interactions.json"),
    JSON.stringify({
      nestedSelect: true,
      sliderKeyboardFocus: true,
      virtualTable: true,
      menuKeyboard: true,
      commandPalette: true,
      toast: true,
      privacyGate: true,
      accessGate: true,
      onboarding: true,
    }),
  );
}
// Estrategia crea sus propios contextos y páginas (hora de Madrid): la página
// que recibe solo le sirve para llegar al navegador, así que puede ir sola.
async function runStrategy(page: Page) {
  await timed("checkStrategyScreen", () =>
    checkStrategyScreen(
      page,
      server.resolvedUrls?.local[0] ?? "",
      // Capturas solo bajo demanda (#2682): STRATEGY_SHOTS=1.
      process.env.STRATEGY_SHOTS === "1"
        ? resolve(evidence, "strategy")
        : undefined,
    ),
  );
}
async function runAnalisis() {
  const analysis = await runAnalysis();
  failures = analysis.failures;
  if (analysis.error !== undefined) throw analysis.error;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  try {
    const page = await context.newPage();
    strategyFailures = collectPageFailures(page);
    page.setDefaultTimeout(20000);
    await runStrategy(page);
  } finally {
    await context.close();
  }
}
try {
  if (parte === "analisis") await runAnalisis();
  else await runPaginas();
  comprobarEjecutados(parte, timedNames());
} catch (error) {
  // Playwright only reports the wait that expired; the page's own errors say why.
  console.error(pageFailuresReport([...failures, ...strategyFailures]));
  throw error;
} finally {
  printTimingSummary((performance.now() - startedAt) / 1000);
  await browser.close();
  await new Promise<void>((done, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : done())),
  );
}
