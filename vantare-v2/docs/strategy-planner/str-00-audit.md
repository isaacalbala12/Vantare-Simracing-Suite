# STR-00 — Auditoría y replanificación del Strategy Planner

**Fecha:** 2026-08-01
**Issue:** ISA-134 / STR-00
**Tipo:** auditoría documental; no modifica código de producto
**Resultado:** GO condicionado para rescate selectivo; NO-GO para merge directo

## 1. Pregunta resuelta

Esta auditoría responde qué existe realmente del antiguo Product A, qué partes
pueden recuperarse, cómo se sustituyen las 26 issues históricas PB y cuál es la
ruta ejecutable hacia un único Strategy Planner.

La conclusión es inequívoca:

- Product A es evidencia y una fuente de piezas recuperables, no una base que
  pueda mezclarse completa.
- Product A/B/C dejan de ser productos separados. El producto canónico es
  Strategy Planner y se entrega mediante cortes STR.
- El módulo no leerá LMU, DuckDB ni almacenamiento privado de Telemetry
  Analysis. Consumirá proyecciones versionadas.
- El cálculo determinista explicable es la autoridad. Un LLM puede redactar
  texto o voz, pero no decidir la estrategia.
- Las issues PB se conservan como historia y se marcan como sustituidas solo
  después de publicar el mapa PB -> STR.

## 2. Referencias y procedencia

| Elemento | Referencia exacta | Uso |
| --- | --- | --- |
| Base aprobada | `ISA-117@170eaebbaa6744019ead96a2c78201b4da2fb9bb` | Base de todos los cortes STR |
| Product A | `codex/strategy-product-a@b9f193720b80484150691512a3fb1e09da9db41f` | Evidencia y rescate selectivo |
| Merge-base | `e5b2d27348161c367cdec6c1e152e10489859d05` | Medición de divergencia |
| Plan PB histórico | `ISA-21@6fa3c52af8309e000dafd164aa80189c718f0c7e` | Intención histórica, no contrato actual |
| Producto | `docs/vantare-program/product-contract.md` | Autoridad de límites |
| Continuidad | `docs/vantare-program/handoffs/strategy-planner.md` | Estado vivo |

La divergencia entre la base actual y Product A es de **371 commits exclusivos
de la base actual y 44 exclusivos de Product A**. La rama remota de Product A
no existe en el snapshot auditado; sí existe la referencia local exacta. Un
worktree histórico de Product A contiene cambios sin commit y se excluyó por
completo: solo se auditó el objeto Git `b9f1937`.

## 3. Inventario completo de Product A

El delta exacto desde su merge-base contiene **94 paths**: **87 auto-merged y
7 conflictos**, con **6.751 inserciones y 5 eliminaciones** en la simulación de
composición. La matriz exhaustiva enumera los 94 individualmente y fija la
allowlist de STR-01.

### 3.1 Dominio Go — 25 paths

| Área | Producción | Pruebas/evidencia | Decisión preliminar |
| --- | --- | --- | --- |
| Modelo y unidades | `model.go`, `units.go`, `validate.go` | `model_test.go`, `units_test.go`, `validate_test.go` | HARDEN |
| Carrera | `race.go` | `race_test.go` | HARDEN |
| Recursos | `resource.go` | `resource_test.go` | HARDEN |
| Pit | `pit.go` | `pit_test.go` | HARDEN |
| Neumáticos | `tyre.go` | `tyre_test.go` | HARDEN |
| Stints | `stint.go` | `stint_test.go` | HARDEN |
| Solver | `solver.go` | `solver_test.go`, `solver_bench_test.go` | REWRITE |
| Comparación | `compare.go` | `compare_test.go` | HARDEN |
| Sensibilidad | `sensitivity.go` | `sensitivity_test.go` | HARDEN |
| Fixtures | — | `canonical_fixture_test.go`, `testdata/canonical-cases.json` | KEEP como caracterización |

### 3.2 Aplicación Go — 8 paths

- Añadidos: `internal/app/strategy_service.go`, `strategy_bridge.go`,
  `strategy_export.go` y sus tres tests.
- Modificados: `internal/app/settings_service.go` y
  `internal/app/settings_service_test.go`.

Los servicios contienen ideas útiles, pero dependen de una composición y unos
contratos anteriores. El exportador exacto de `b9f1937` conserva `mustJSON`;
unas correcciones posteriores solo existen como cambios sin commit y no son
evidencia recuperable.

### 3.3 Frontend Strategy — 32 paths

Componentes:

- `StrategyPlannerPage`, `StrategyInputs`, `StrategyAdvancedTable`.
- `StrategyTimeline`, `StrategyTyreInventory`, `StrategyComparison`.
- `StrategyWarnings`, `StrategyPlanManager`, `StrategyCalendarImport`.
- `StrategyExport`, `StrategyPrintView`, `StrategyOnboarding`.

Estado y frontera:

- `strategy-contract.ts`, `strategy-bridge.ts`.
- `strategy-store.ts`, context, hooks y provider.
- `strategy-calendar-import.ts`.

Pruebas:

- 12 suites de componentes/estado/importación que suman 25 tests en el baseline
  exacto.

La UI demuestra flujos, pero no es la autoridad visual final. La referencia
final sigue siendo `strategy-base.html`: estrategias a la izquierda, stints en
el centro e inventario/entrada manual a la derecha.

### 3.4 Harness — 4 archivos

- `frontend/strategy-planner-harness.html`.
- `frontend/src/strategy-planner-harness.tsx`.
- `frontend/scripts/strategy-planner-smoke.mjs`.
- `frontend/src/lib/wails-runtime-strategy-mock.ts`.

El harness carga y el build pasa, pero el smoke se queda bloqueado incluso con
Vite ya disponible. Se registra como bloqueo del propio harness; no demuestra
por sí mismo un fallo de la UI.

### 3.5 Integraciones transversales — 17 paths

- `cmd/vantare/main.go`.
- `frontend/src/hub/HubApp.tsx`.
- calendario: `CalendarRaceDetailPanel.tsx`, su test y `CalendarPage.tsx`.
- navegación/dock/topbar: `navigation.ts`, test, `LauncherDock.test.tsx`,
  `Topbar.tsx`.
- acceso: `access-policy.ts` y test.
- cuatro locales: `en.ts`, `es.ts`, `it.ts`, `pt.ts`.
- `frontend/src/index.css` y `frontend/vite.config.ts`.

Estas rutas son las de mayor riesgo de merge porque han evolucionado mucho
desde Product A. Deben reimplementarse sobre la base actual, no rescatarse en
bloque.

### 3.6 Documentación — 8 paths

- `docs/analysis/strategy-bridge-decision.md`.
- `docs/research/strategy-planner-tinypedal-analysis.md`.
- `docs/strategy-planner-architecture.md`.
- `docs/strategy-planner-manual.md`.
- planes históricos Product A, B y C del 2026-07-11.
- modificación histórica de `docs/current-plan.md`.

Se conserva como antecedente. El ADR, este informe, el mapa PB -> STR y el plan
unificado pasan a ser la autoridad.

Reconciliación: 25 dominio + 8 aplicación + 32 frontend Strategy + 4 harness +
8 documentación + 17 integraciones = **94**. Solo el fixture JSON puede
copiarse de forma exacta en STR-01; los otros 24 paths del dominio se portan
manualmente bajo tests y los 69 restantes quedan en denylist.

## 4. Baseline reproducible de Product A

Se creó un worktree temporal limpio en el commit exacto. No se instalaron ni
modificaron dependencias; `node_modules` se proporcionó mediante un enlace
temporal a una instalación ya existente.

| Check | Resultado |
| --- | --- |
| `go test ./internal/strategy -count=1` | PASS |
| `go test ./internal/app -run Strategy -count=1` | PASS |
| `go vet ./internal/strategy ./internal/app` | PASS |
| Tests frontend focales Strategy | PASS, 13 archivos / 25 tests |
| Build frontend | PASS; aviso de chunk superior a 500 kB |
| URL del harness | PASS, HTTP 200 en puerto temporal |
| Smoke Playwright histórico | BLOCKED; espera indefinida sin salida |

El resultado caracteriza las piezas, pero no las certifica para producción.
No se ejecutó ninguna prueba monetaria, publicación, merge o promoción.

## 5. Simulación de composición Git

Se simuló un merge `--no-commit --no-ff` en un worktree temporal de la base
exacta y después se abortó. El worktree volvió limpio.

Resultado total: **94 paths = 87 auto-merged + 7 conflictos**. `auto-merged`
solo describe la mecánica de Git y no autoriza rescate.

Conflictos de contenido exactos:

1. `docs/current-plan.md`.
2. `frontend/src/hub/HubApp.tsx`.
3. `frontend/src/i18n/locales/en.ts`.
4. `frontend/src/i18n/locales/es.ts`.
5. `frontend/src/i18n/locales/it.ts`.
6. `frontend/src/i18n/locales/pt.ts`.
7. `frontend/src/index.css`.

Un merge completo también incorporaría integraciones antiguas no conflictivas
que no respetan necesariamente las fronteras actuales. Por eso el resultado
es **NO-GO para merge o cherry-pick por rango** y **GO para rescate selectivo
por archivo/idea con tests de caracterización**.

## 6. Auditoría de cálculos

### 6.1 Piezas útiles

- Carrera por vueltas o tiempo, con lógica explícita y tests.
- Modelo de necesidad/disponibilidad de recursos y cálculo de ahorro.
- Descomposición de pit en entrada, tránsito, servicio, reparación,
  penalización y salida.
- Neumáticos físicos, asignación por esquina, mezclas y curvas de desgaste.
- Stints, comparación, sensibilidad y fixtures deterministas.

### 6.2 Defectos que impiden considerar Product A autoridad

1. `solver.go` calcula tiempo como vueltas por ritmo más pérdidas de pit, pero
   no integra la degradación del neumático en el tiempo total.
2. El margen suma Fuel y Virtual Energy como si fueran la misma magnitud.
3. Las etiquetas rápida/equilibrada/segura no prueban optimalidad y varias
   variantes pueden producir exactamente el mismo tiempo.
4. Las semánticas de carrera por tiempo y vuelta final necesitan validación LMU.
5. Los supuestos de capacidad inicial, repostaje y solapamiento de servicios
   necesitan contratos de evento/simulador.
6. El inventario y el modelo de desgaste se solapan en más de un campo.
7. El objetivo del draft es un placeholder vacío.

La consecuencia es conservar fixtures y aritmética demostrable, pero reescribir
el optimizador y endurecer los modelos físicos antes de usarlos como autoridad.

## 7. Inventario completo de las 26 issues PB

La cadena histórica es serial y va de ISA-42 a ISA-67:

| Issue | Corte histórico | Destino STR |
| --- | --- | --- |
| ISA-42 | PB-01A Baseline/simulación Product A | STR-01 |
| ISA-43 | PB-01B Integración/characterization | STR-01 |
| ISA-44 | PB-01C Fronteras/contratos Product B | STR-02 |
| ISA-45 | PB-02A Archivos/esquemas LMU | TEL; Strategy consume STR-10 |
| ISA-46 | PB-02B Discovery/selección local | TEL; Strategy consume STR-10 |
| ISA-47 | PB-02C Adapter DuckDB | TEL; Strategy consume STR-10 |
| ISA-48 | PB-02D Dataset/consultas | TEL; Strategy consume STR-10 |
| ISA-49 | PB-03A Correcciones no destructivas | TEL; Strategy consume STR-10 |
| ISA-50 | PB-03B Derivados/confianza | TEL + STR-11 |
| ISA-51 | PB-03C Biblioteca/revisiones | STR-03 repositorio; STR-15A UI/paquetes; STR-15B/C catálogos |
| ISA-52 | PB-03D Dirty/concurrencia | STR-03 y STR-04 |
| ISA-53 | PB-04A Baseline visual/harness | STR-07 |
| ISA-54 | PB-04B Galería/navegación | STR-07 shell; STR-15A UI de Mis planes |
| ISA-55 | PB-04C Importación LMU | TEL; Strategy consume STR-10 |
| ISA-56 | PB-04D Editor básico/tabla | STR-07 y STR-09 |
| ISA-57 | PB-04E Shell de tres columnas | STR-07 |
| ISA-58 | PB-05A Store/undo | STR-04 |
| ISA-59 | PB-05B Stints/recursos | STR-05 y STR-08 |
| ISA-60 | PB-05C Tyre inventory domain | STR-06 |
| ISA-61 | PB-05D Drag and drop | STR-08 |
| ISA-62 | PB-05E Fuel save | STR-09 |
| ISA-63 | PB-06A Auditoría de escenarios | STR-12 |
| ISA-64 | PB-06B Variantes | STR-13 |
| ISA-65 | PB-06C Comparación de planes | STR-13 |
| ISA-66 | PB-06D E2E/errores/rendimiento | STR-21 |
| ISA-67 | PB-06E Cutover Product A | STR-22 |

No se elimina ninguna issue, milestone, documento o rama histórica.

El backlog ejecutable contiene **24 cortes Strategy**: STR-01..14, STR-15A,
STR-15B, STR-15C y STR-16..22. ISA-138 posee en exclusiva el repositorio,
atomicidad, migraciones, drafts, revisiones y recovery. ISA-150 se limita a las
queries/UI de `Mis planes` y los paquetes import/export que consumen ese
repositorio; no reimplementa persistencia. ISA-162 posee el catálogo oficial
firmado e ISA-163 posee comunidad, moderación y retirada. Comunidad no bloquea
el desarrollo live, pero sí el gate integral final.

Tres issues productoras transversales cierran las entradas que STR-00 no puede
asumir:

- ISA-159 / TA-05: `StrategyInputProjection v1`, owner Telemetry Analysis;
  bloquea ISA-145 / STR-10.
- ISA-160 / TC-10A: auditoría/schema live para Fuel, VE, tyres y weather.
- ISA-161 / TC-10B: `StrategyLiveProjection v1`, owner Telemetry Core; bloquea
  ISA-152 / STR-17.

La proyección live Strategy existente en ISA-117 solo demuestra sesión,
progreso y pit. Es compile-only para el producto y no habilita STR-17.

## 8. Riesgos y gates

| Severidad | Riesgo | Mitigación |
| --- | --- | --- |
| P1 | Rescatar el branch entero arrastra integraciones obsoletas | STR-01 selectivo y lista permitida |
| P1 | Strategy duplica importación/corrección/almacenamiento de Analysis | ADR de ownership + STR-10 por proyección |
| P1 | Solver parece óptimo sin incluir degradación ni unidades correctas | Reescritura STR-12 con oráculo y propiedades |
| P1 | Productores histórico/live ausentes o incompletos | ISA-159 y ISA-160/161 bloquean consumidores |
| P1 | Cambios live aplicados sin aceptación | ActivePlan versionado y flujo de comandos |
| P2 | Harness histórico se bloquea | Rehacer smoke en STR-07 sin bajar gates |
| P2 | Fórmulas LMU asumidas | Presets versionados y evidencia real/manual |
| P2 | Plans comunitarios filtran datos | Privado por defecto y export explícito |
| P2 | Carga live afecta LMU | Presupuestos y degradación en STR-17/21 |

## 9. Veredicto

**APPROVE para iniciar STR-01 sobre la base exacta de ISA-117.**

Condiciones:

- Nada se mezcla desde Product A en bloque.
- Cada corte nace desde la base aprobada o el anterior STR revisado.
- Telemetry Analysis debe publicar la proyección histórica; Strategy no abre
  directamente archivos LMU/DuckDB.
- Telemetry Core debe publicar la proyección live; Strategy no adquiere LMU.
- El cutover y la retirada de código se aplazan hasta demostrar consumidores
  cero, paridad y rollback.
- No hay promoción a `nightly`, `testers` o `master` en STR-00.
