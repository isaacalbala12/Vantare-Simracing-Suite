# STR-00 — Matriz exhaustiva de rescate de Product A

**Fuente:** `codex/strategy-product-a@b9f193720b80484150691512a3fb1e09da9db41f`
**Destino:** Strategy Planner unificado sobre `ISA-117@170eaeb`
**Resultado:** 94/94 paths clasificados; 87 auto-merged y 7 conflictos en la
simulación; merge completo prohibido.

## 1. Leyenda

- **KEEP:** evidencia histórica que se conserva, sin convertirla en autoridad.
- **HARDEN:** intención recuperable mediante port manual, contrato y tests.
- **REWRITE:** conservar el problema/oráculo y rehacer la solución.
- **REIMPLEMENT:** no copiar el path; implementar de nuevo en la base actual.
- **HISTORICAL:** solo referencia documental.
- **NO-RESCUE:** fuera de Strategy o sustituido por otra frontera.

`E-AUTO` significa que Git lo auto-mezcló en la simulación, no que sea seguro.
`E-CONFLICT` identifica uno de los siete conflictos exactos. `B9-PASS` indica
que su familia participó en un baseline verde del commit exacto; no certifica
semántica física ni integración actual.

## 2. Dominio Go — 25 paths

| # | Path exacto | Decisión | Evidencia | Consumidor/destino | Riesgo |
| ---: | --- | --- | --- | --- | --- |
| 1 | `internal/strategy/canonical_fixture_test.go` | KEEP | E-AUTO, B9-PASS | STR-01 caracterización | P2: oráculo histórico incompleto |
| 2 | `internal/strategy/compare.go` | HARDEN | E-AUTO, B9-PASS | STR-13 comparación | P2: ranking insuficiente |
| 3 | `internal/strategy/compare_test.go` | KEEP | E-AUTO, B9-PASS | STR-01/13 tests | P3: expectativas históricas |
| 4 | `internal/strategy/model.go` | REWRITE | E-AUTO, B9-PASS | STR-02 contrato | P1: draft sin versión/objetivo |
| 5 | `internal/strategy/model_test.go` | KEEP | E-AUTO, B9-PASS | STR-01/02 tests | P2: fija forma obsoleta |
| 6 | `internal/strategy/pit.go` | HARDEN | E-AUTO, B9-PASS | STR-05 pit | P1: solape/presets sin evidencia LMU |
| 7 | `internal/strategy/pit_test.go` | KEEP | E-AUTO, B9-PASS | STR-01/05 tests | P2: supuestos Product A |
| 8 | `internal/strategy/race.go` | HARDEN | E-AUTO, B9-PASS | STR-05 carrera | P1: vuelta final por tiempo no probada |
| 9 | `internal/strategy/race_test.go` | KEEP | E-AUTO, B9-PASS | STR-01/05 tests | P2: semántica LMU pendiente |
| 10 | `internal/strategy/resource.go` | HARDEN | E-AUTO, B9-PASS | STR-05 recursos | P1: capacidad/start y unidades |
| 11 | `internal/strategy/resource_test.go` | KEEP | E-AUTO, B9-PASS | STR-01/05 tests | P2: casos físicos limitados |
| 12 | `internal/strategy/sensitivity.go` | HARDEN | E-AUTO, B9-PASS | STR-13 robustez | P2: parámetros no versionados |
| 13 | `internal/strategy/sensitivity_test.go` | KEEP | E-AUTO, B9-PASS | STR-01/13 tests | P3: cobertura histórica |
| 14 | `internal/strategy/solver.go` | REWRITE | E-AUTO, B9-PASS | STR-12 solver v2 | P1: omite degradación y suma Fuel+VE |
| 15 | `internal/strategy/solver_bench_test.go` | KEEP | E-AUTO, B9-PASS | STR-01/12 benchmark | P2: benchmark no prueba corrección |
| 16 | `internal/strategy/solver_test.go` | KEEP | E-AUTO, B9-PASS | STR-01/12 oráculos | P1: etiquetas no prueban optimalidad |
| 17 | `internal/strategy/stint.go` | HARDEN | E-AUTO, B9-PASS | STR-08 stints | P2: no usa PlanRevision |
| 18 | `internal/strategy/stint_test.go` | KEEP | E-AUTO, B9-PASS | STR-01/08 tests | P3: shape antigua |
| 19 | `internal/strategy/testdata/canonical-cases.json` | KEEP exacto | E-AUTO, B9-PASS | STR-01 fixture | P2: datos sintéticos/históricos |
| 20 | `internal/strategy/tyre.go` | HARDEN | E-AUTO, B9-PASS | STR-06 neumáticos | P1: inventario y wear model solapados |
| 21 | `internal/strategy/tyre_test.go` | KEEP | E-AUTO, B9-PASS | STR-01/06 tests | P2: reglas de evento incompletas |
| 22 | `internal/strategy/units.go` | REWRITE | E-AUTO, B9-PASS | STR-02 unidades | P1: Fuel/VE deben ser incompatibles |
| 23 | `internal/strategy/units_test.go` | KEEP | E-AUTO, B9-PASS | STR-01/02 tests | P2: no cubre suma inválida del solver |
| 24 | `internal/strategy/validate.go` | HARDEN | E-AUTO, B9-PASS | STR-02 invariantes | P2: códigos/shape históricos |
| 25 | `internal/strategy/validate_test.go` | KEEP | E-AUTO, B9-PASS | STR-01/02 tests | P3: ampliar propiedades |

## 3. Aplicación Go — 8 paths

| # | Path exacto | Decisión | Evidencia | Consumidor/destino | Riesgo |
| ---: | --- | --- | --- | --- | --- |
| 26 | `internal/app/settings_service.go` | REIMPLEMENT | E-AUTO, app focal PASS | STR-03 persistencia | P1: Settings evolucionó/concurrencia |
| 27 | `internal/app/settings_service_test.go` | KEEP comportamiento | E-AUTO, app focal PASS | STR-03 tests nuevos | P2: test acoplado a Settings antiguo |
| 28 | `internal/app/strategy_bridge.go` | REIMPLEMENT | E-AUTO, app focal PASS | STR-04 bridge | P1: lifecycle/contrato anterior |
| 29 | `internal/app/strategy_bridge_test.go` | KEEP comportamiento | E-AUTO, app focal PASS | STR-04 contract tests | P2: eventos anteriores |
| 30 | `internal/app/strategy_export.go` | REWRITE | E-AUTO, app focal PASS | STR-15A paquetes locales | P1: `mustJSON` en b9 exacto |
| 31 | `internal/app/strategy_export_test.go` | KEEP comportamiento | E-AUTO, app focal PASS | STR-15A tests | P2: formato antiguo |
| 32 | `internal/app/strategy_service.go` | REIMPLEMENT | E-AUTO, app focal PASS | STR-03/04 servicio | P1: mezcla storage, cálculo y bridge |
| 33 | `internal/app/strategy_service_test.go` | KEEP comportamiento | E-AUTO, app focal PASS | STR-03/04 tests | P2: deep-copy fix no canónico |

## 4. Frontend Strategy — 32 paths

| # | Path exacto | Decisión | Evidencia | Consumidor/destino | Riesgo |
| ---: | --- | --- | --- | --- | --- |
| 34 | `frontend/src/hub/strategy/StrategyAdvancedTable.tsx` | REIMPLEMENT | E-AUTO, frontend PASS | STR-09 tabla | P2: forma Product A |
| 35 | `frontend/src/hub/strategy/StrategyCalendarImport.test.tsx` | KEEP comportamiento | E-AUTO, frontend PASS | STR-14 tests | P3: contrato Calendar antiguo |
| 36 | `frontend/src/hub/strategy/StrategyCalendarImport.tsx` | REIMPLEMENT | E-AUTO, frontend PASS | STR-14 adapter UI | P2: acoplamiento a página Calendar |
| 37 | `frontend/src/hub/strategy/StrategyComparison.test.tsx` | KEEP comportamiento | E-AUTO, frontend PASS | STR-13 tests | P3: variantes antiguas |
| 38 | `frontend/src/hub/strategy/StrategyComparison.tsx` | REIMPLEMENT | E-AUTO, frontend PASS | STR-13 comparación | P2: no muestra rango/riesgo real |
| 39 | `frontend/src/hub/strategy/StrategyExport.test.tsx` | KEEP comportamiento | E-AUTO, frontend PASS | STR-15A tests | P3: formato histórico |
| 40 | `frontend/src/hub/strategy/StrategyExport.tsx` | REIMPLEMENT | E-AUTO, frontend PASS | STR-15A export local | P2: contrato antiguo |
| 41 | `frontend/src/hub/strategy/StrategyInputs.test.tsx` | KEEP comportamiento | E-AUTO, frontend PASS | STR-07/09 tests | P3: copy/inputs históricos |
| 42 | `frontend/src/hub/strategy/StrategyInputs.tsx` | REIMPLEMENT | E-AUTO, frontend PASS | STR-07/09 entrada | P2: no cumple shell final |
| 43 | `frontend/src/hub/strategy/StrategyOnboarding.test.tsx` | KEEP comportamiento | E-AUTO, frontend PASS | STR-21 tests | P3: flujo previo |
| 44 | `frontend/src/hub/strategy/StrategyOnboarding.tsx` | REIMPLEMENT | E-AUTO, frontend PASS | STR-21 onboarding | P2: producto renombrado |
| 45 | `frontend/src/hub/strategy/StrategyPlanManager.test.tsx` | KEEP comportamiento | E-AUTO, frontend PASS | STR-15A tests UI/query | P3: storage previo debe sustituirse por contrato de repositorio |
| 46 | `frontend/src/hub/strategy/StrategyPlanManager.tsx` | REIMPLEMENT | E-AUTO, frontend PASS | STR-15A UI de Mis planes | P2: no separa presentación de persistencia ni galerías |
| 47 | `frontend/src/hub/strategy/StrategyPlannerPage.test.tsx` | KEEP comportamiento | E-AUTO, frontend PASS | STR-07 tests | P2: no es contrato visual |
| 48 | `frontend/src/hub/strategy/StrategyPlannerPage.tsx` | REIMPLEMENT | E-AUTO, frontend PASS | STR-07 workspace | P1: UI Product A no final |
| 49 | `frontend/src/hub/strategy/StrategyPrintView.test.tsx` | KEEP comportamiento | E-AUTO, frontend PASS | STR-15A tests | P3: print histórico |
| 50 | `frontend/src/hub/strategy/StrategyPrintView.tsx` | REIMPLEMENT | E-AUTO, frontend PASS | STR-15A export | P3: representación antigua |
| 51 | `frontend/src/hub/strategy/StrategyTimeline.test.tsx` | KEEP comportamiento | E-AUTO, frontend PASS | STR-08 tests | P3: timeline anterior |
| 52 | `frontend/src/hub/strategy/StrategyTimeline.tsx` | REIMPLEMENT | E-AUTO, frontend PASS | STR-07/08 stints | P2: no usa tarjetas finales |
| 53 | `frontend/src/hub/strategy/StrategyTyreInventory.test.tsx` | KEEP comportamiento | E-AUTO, frontend PASS | STR-06/08 tests | P3: DnD ausente |
| 54 | `frontend/src/hub/strategy/StrategyTyreInventory.tsx` | REIMPLEMENT | E-AUTO, frontend PASS | STR-07/08 inventario | P1: contrato físico mezclado |
| 55 | `frontend/src/hub/strategy/StrategyWarnings.test.tsx` | KEEP comportamiento | E-AUTO, frontend PASS | STR-05/13 tests | P3: warnings parciales |
| 56 | `frontend/src/hub/strategy/StrategyWarnings.tsx` | REIMPLEMENT | E-AUTO, frontend PASS | STR-05/13 avisos | P2: falta confidence/provenance |
| 57 | `frontend/src/hub/strategy/strategy-bridge.ts` | REWRITE | E-AUTO, frontend PASS | STR-04 bridge | P1: contrato Wails obsoleto |
| 58 | `frontend/src/hub/strategy/strategy-calendar-import.test.ts` | KEEP comportamiento | E-AUTO, frontend PASS | STR-14 tests | P3: shape Calendar antiguo |
| 59 | `frontend/src/hub/strategy/strategy-calendar-import.ts` | REIMPLEMENT | E-AUTO, frontend PASS | STR-14 adapter | P2: ownership/evento |
| 60 | `frontend/src/hub/strategy/strategy-contract.ts` | REWRITE | E-AUTO, frontend PASS | STR-02/04 contrato | P1: no versiona documentos nuevos |
| 61 | `frontend/src/hub/strategy/strategy-store-context.ts` | REIMPLEMENT | E-AUTO, frontend PASS | STR-04 store | P2: context anterior |
| 62 | `frontend/src/hub/strategy/strategy-store-hooks.ts` | REIMPLEMENT | E-AUTO, frontend PASS | STR-04 store | P3: API anterior |
| 63 | `frontend/src/hub/strategy/strategy-store-provider.tsx` | REIMPLEMENT | E-AUTO, frontend PASS | STR-04 store | P2: lifecycle anterior |
| 64 | `frontend/src/hub/strategy/strategy-store.test.ts` | KEEP comportamiento | E-AUTO, frontend PASS | STR-04 tests | P2: no separa activo/draft |
| 65 | `frontend/src/hub/strategy/strategy-store.ts` | REWRITE | E-AUTO, frontend PASS | STR-04 store | P1: estados mezclados |

## 5. Harness — 4 paths

| # | Path exacto | Decisión | Evidencia | Consumidor/destino | Riesgo |
| ---: | --- | --- | --- | --- | --- |
| 66 | `frontend/scripts/strategy-planner-smoke.mjs` | REWRITE | E-AUTO; smoke bloqueado | STR-07 Playwright | P1: espera indefinida/sin lifecycle |
| 67 | `frontend/src/lib/wails-runtime-strategy-mock.ts` | REIMPLEMENT | E-AUTO, frontend PASS | STR-07 harness | P2: mock no debe parecer live |
| 68 | `frontend/src/strategy-planner-harness.tsx` | REIMPLEMENT | E-AUTO; HTTP 200 | STR-07 harness | P2: composición Product A |
| 69 | `frontend/strategy-planner-harness.html` | REIMPLEMENT | E-AUTO; HTTP 200 | STR-07 harness | P3: entrada histórica |

## 6. Documentación — 8 paths

| # | Path exacto | Decisión | Evidencia | Consumidor/destino | Riesgo |
| ---: | --- | --- | --- | --- | --- |
| 70 | `docs/analysis/strategy-bridge-decision.md` | HISTORICAL | E-AUTO | ADR 0006 | P2: fronteras obsoletas |
| 71 | `docs/current-plan.md` | NO-RESCUE | E-CONFLICT | current-plan actual | P1: sobrescribir programa vigente |
| 72 | `docs/research/strategy-planner-tinypedal-analysis.md` | HISTORICAL | E-AUTO | investigación STR | P2: no es contrato/licencia de copia |
| 73 | `docs/strategy-planner-architecture.md` | HISTORICAL | E-AUTO | ADR 0006 | P2: Product A separado |
| 74 | `docs/strategy-planner-manual.md` | HISTORICAL | E-AUTO | UX/characterization | P3: UI previa |
| 75 | `docs/superpowers/plans/2026-07-11-strategy-product-a-manual-calculator.md` | HISTORICAL | E-AUTO | STR-01 evidencia | P3: plan ejecutado viejo |
| 76 | `docs/superpowers/plans/2026-07-11-strategy-product-b-telemetry-guide.md` | HISTORICAL | E-AUTO | mapa PB -> STR | P1: ownership Analysis incorrecto |
| 77 | `docs/superpowers/plans/2026-07-11-strategy-product-c-live-guide.md` | HISTORICAL | E-AUTO | STR-17/18 antecedente | P2: Product C ya no existe |

## 7. Integraciones transversales — 17 paths

| # | Path exacto | Decisión | Evidencia | Consumidor/destino | Riesgo |
| ---: | --- | --- | --- | --- | --- |
| 78 | `cmd/vantare/main.go` | REIMPLEMENT | E-AUTO | STR-04 composition root | P1: wiring anterior a Core final |
| 79 | `frontend/src/hub/HubApp.tsx` | REIMPLEMENT | E-CONFLICT | STR-07 navegación | P1: shell actual divergente |
| 80 | `frontend/src/hub/calendar/CalendarRaceDetailPanel.test.tsx` | NO-RESCUE | E-AUTO | Calendar/STR-14 contract test | P2: fuera de ownership Strategy |
| 81 | `frontend/src/hub/calendar/CalendarRaceDetailPanel.tsx` | NO-RESCUE | E-AUTO | Calendar | P2: no importar UI privada |
| 82 | `frontend/src/hub/components/LauncherDock.test.tsx` | NO-RESCUE | E-AUTO | Launcher | P3: fuera de alcance |
| 83 | `frontend/src/hub/components/Topbar.tsx` | REIMPLEMENT | E-AUTO | STR-07 ruta actual | P2: topbar evolucionada |
| 84 | `frontend/src/hub/navigation.test.ts` | REIMPLEMENT | E-AUTO | STR-07 navegación | P3: añadir caso sobre suite actual |
| 85 | `frontend/src/hub/navigation.ts` | REIMPLEMENT | E-AUTO | STR-07 navegación | P2: rutas actuales son autoridad |
| 86 | `frontend/src/hub/pages/CalendarPage.tsx` | NO-RESCUE | E-AUTO | Calendar | P2: fuera de ownership |
| 87 | `frontend/src/i18n/locales/en.ts` | REIMPLEMENT | E-CONFLICT | cortes UI | P1: catálogo actual divergente |
| 88 | `frontend/src/i18n/locales/es.ts` | REIMPLEMENT | E-CONFLICT | cortes UI | P1: catálogo actual divergente |
| 89 | `frontend/src/i18n/locales/it.ts` | REIMPLEMENT | E-CONFLICT | cortes UI | P1: catálogo actual divergente |
| 90 | `frontend/src/i18n/locales/pt.ts` | REIMPLEMENT | E-CONFLICT | cortes UI | P1: catálogo actual divergente |
| 91 | `frontend/src/index.css` | REIMPLEMENT | E-CONFLICT | STR-07 estilos | P1: global CSS no se rescata |
| 92 | `frontend/src/lib/access-policy.test.ts` | REIMPLEMENT | E-AUTO | STR-07/21 licencia | P2: catálogo comercial actual manda |
| 93 | `frontend/src/lib/access-policy.ts` | REIMPLEMENT | E-AUTO | STR-07/21 licencia | P1: reglas gratuitas/premium cambiaron |
| 94 | `frontend/vite.config.ts` | REIMPLEMENT | E-AUTO | STR-07 harness | P2: no alterar build global sin necesidad |

## 8. Reconciliación de conteos

| Familia | Paths |
| --- | ---: |
| Dominio Go | 25 |
| Aplicación Go | 8 |
| Frontend Strategy | 32 |
| Harness | 4 |
| Documentación | 8 |
| Integraciones transversales | 17 |
| **Total** | **94** |

La simulación produjo **87 paths auto-merged + 7 conflictos = 94**. Los siete
conflictos son `docs/current-plan.md`, `HubApp.tsx`, los cuatro locales y
`index.css`.

## 9. Allowlist segura de STR-01

STR-01 puede tocar como procedencia Product A únicamente los 25 paths bajo
`internal/strategy/` enumerados en las filas 1–25, con dos modos:

### ALLOW-EXACT

- `internal/strategy/testdata/canonical-cases.json` puede copiarse byte a byte,
  conservando hash y etiquetándolo como fixture histórico no autoritativo.

### ALLOW-PORT

- Los únicos 24 paths que pueden portarse manualmente son:
  - `internal/strategy/canonical_fixture_test.go`.
  - `internal/strategy/compare.go`.
  - `internal/strategy/compare_test.go`.
  - `internal/strategy/model.go`.
  - `internal/strategy/model_test.go`.
  - `internal/strategy/pit.go`.
  - `internal/strategy/pit_test.go`.
  - `internal/strategy/race.go`.
  - `internal/strategy/race_test.go`.
  - `internal/strategy/resource.go`.
  - `internal/strategy/resource_test.go`.
  - `internal/strategy/sensitivity.go`.
  - `internal/strategy/sensitivity_test.go`.
  - `internal/strategy/solver.go`.
  - `internal/strategy/solver_bench_test.go`.
  - `internal/strategy/solver_test.go`.
  - `internal/strategy/stint.go`.
  - `internal/strategy/stint_test.go`.
  - `internal/strategy/tyre.go`.
  - `internal/strategy/tyre_test.go`.
  - `internal/strategy/units.go`.
  - `internal/strategy/units_test.go`.
  - `internal/strategy/validate.go`.
  - `internal/strategy/validate_test.go`.
- Solo pueden portarse en un namespace de caracterización o mediante una
  implementación nueva.
- Cada path requiere primero un test que falle sobre la base destino.
- `solver.go` nunca entra como solver productivo; solo puede usarse como
  comparación histórica detrás de tests.
- Ningún tipo Product A se exporta como contrato público en STR-01.

### DENY-COPY

Los 69 paths de las filas 26–94 no pueden copiarse ni cherry-pickearse en
STR-01. Pueden leerse como evidencia y se reimplementan en su corte destino.
Un guard de STR-01 debe fallar si el diff contiene cualquiera de esos paths.

## 10. Condiciones de retirada

Ninguna pieza histórica se elimina hasta demostrar consumidores cero mediante
búsqueda estática/dinámica, pruebas del reemplazo, migración, rollback Git y
review independiente en STR-22.
