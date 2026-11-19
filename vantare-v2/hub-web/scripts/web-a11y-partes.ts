/**
 * Reparto de `web-a11y.ts` en partes para el workflow «Hub web» (VANTA-138).
 * Sin imports de Playwright: lo lee también un test de cobertura.
 *
 * Cada nombre es el que `timed(...)` imprime como `[tiempo]`. La parte
 * `paginas` incluye además lo que la página principal hace sin `timed`
 * (axe del specimen, diálogo, menú, paleta, aviso y axe de Studio).
 */
export const CHECKS_PAGINAS = [
  "checkNativeAccessLayer",
  "checkHomeDensity",
  "checkHomePhotos",
  "checkWorkshopScreen",
  "checkTestingDensity",
  "checkSettingsDensity",
  "checkSettingsHeading",
  "checkAccountDensity",
  "checkLauncherDensity",
  "checkSidebarProfiles",
  "checkAppearanceDensity",
  "checkDialogSafety",
  "checkResidentControls",
  "checkResidentRemoval",
  "checkResidentResults",
  "checkLauncherOrigin",
  "checkRoadmapDensity",
  "checkResidentAnswer",
  "checkResidentReview",
  "checkCalendarDensity",
  "checkCalendarDialogSafety",
  "checkPerformanceDensity",
  "checkCommandPalette",
  "checkNotificationFocus",
  "checkPrivacyGate",
  "checkAccessGate",
  "checkAccount",
  "checkAccessStates",
  "checkOnboarding",
  "checkOnboardingGuardedExit",
  "checkStudioPreview",
  "checkStudioCatalogPhotos",
  "checkStudioStates",
  "checkMainScreens",
  "checkLightContrast",
  "checkStudioCanvas",
  "checkStudioCatalogDrop",
] as const;

/** Análisis (contexto propio) y Estrategia (contextos propios): no usan la página principal. */
export const CHECKS_ANALISIS = [
  "checkAnalysisComparison",
  "checkAnalysisSessions",
  "checkRecordingStatus",
  "checkStrategyScreen",
] as const;

export type Parte = "todo" | "paginas" | "analisis";

export function leerParte(argv: readonly string[]): Parte {
  const valor = argv.find((arg) => arg.startsWith("--parte="))?.slice(8);
  if (valor === undefined) return "todo";
  if (valor === "todo" || valor === "paginas" || valor === "analisis")
    return valor;
  throw new Error(`--parte=${valor}: usa todo, paginas o analisis`);
}

export function checksDe(parte: Parte): readonly string[] {
  if (parte === "paginas") return CHECKS_PAGINAS;
  if (parte === "analisis") return CHECKS_ANALISIS;
  return [...CHECKS_PAGINAS, ...CHECKS_ANALISIS];
}

/** Falla si la parte ejecutó otros `timed` que los suyos: una lista vieja no pasa en silencio. */
export function comprobarEjecutados(
  parte: Parte,
  ejecutados: Iterable<string>,
) {
  const esperados = new Set(checksDe(parte));
  const hechos = new Set(ejecutados);
  const sobran = [...hechos].filter((name) => !esperados.has(name));
  const faltan = [...esperados].filter((name) => !hechos.has(name));
  if (sobran.length > 0 || faltan.length > 0)
    throw new Error(
      `Parte «${parte}»: checks ejecutados distintos de la lista. Sobran: [${sobran}]. Faltan: [${faltan}].`,
    );
}
