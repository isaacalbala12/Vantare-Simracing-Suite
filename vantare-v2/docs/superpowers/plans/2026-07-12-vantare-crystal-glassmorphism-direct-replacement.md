# Vantare Crystal Glassmorphism Direct Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use test-driven-development, browser-testing-with-devtools and verification-before-completion on every microcut. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir directamente el sistema visual actual `vantare-crystal` por la composición glassmorphism canónica de `docs/overlay-glassmorphism-pro.html`, conservar el ID público `vantare-crystal` y completar todos los widgets representados en el HTML para Studio, Desktop y OBS.

**Architecture:** Los 18 tipos funcionales y sus ViewModels viven en `frontend/src/overlay/widget-types`; `vantare-original` y el nuevo `vantare-crystal` son renderizadores puros sobre esos ViewModels. La instancia separa identidad funcional, sistema visual y diseño concreto: `widget.type` decide qué hace, `visual.systemId` decide el lenguaje visual y el diseño aplicado/provenance decide la composición compatible. El reemplazo de Crystal se realiza bajo el mismo `systemId`, con migración de configuración y sin mantener una segunda implementación glassmorphism paralela.

**Tech Stack:** React 19, TypeScript estricto, Go, CSS scoped por `data-widget-system`, Vitest, Playwright, Wails v3, runtime Studio/Desktop/OBS existente, sin dependencias nuevas.

**Execution package for GPT-5.6 Luna:** usar `docs/superpowers/plans/2026-07-12-crystal-luna-execution-index.md` y sus seis microplanes; este documento conserva la autoridad maestra, no debe ejecutarse de principio a fin como una sola tarea.

---

## 0. Autoridad visual y reglas duras

### Referencia canónica

- HTML visual: `docs/overlay-glassmorphism-pro.html`.
- Nombre público final: `Vantare Crystal`.
- ID estable: `vantare-crystal`.
- `docs/overlay-vantare-crystal-widgets.html` queda histórico/no canónico salvo decisión humana posterior.
- La implementación Crystal actual se elimina al terminar el cutover; no se conserva como `legacy-crystal`, `crystal-v1` ni fallback oculto.
- El bloque final `V2. WIDGETS REESTILIZADOS (GLASSMORPHISM PRO)` y todo `.v2-section` quedan expresamente excluidos: no se inventarían diseños, no se capturan crops, no se copian estilos y no cuentan en el inventario.

### Qué significa paridad 1:1

- Misma composición DOM visual, jerarquía, proporciones, grids, densidad, fuentes, superficies, bordes, radios, sombras, blur, pills, header/footer, highlights y variantes.
- Los datos mock del HTML se sustituyen por ViewModels puros, pero el estado `ready` canónico debe producir la misma escena visual.
- Fuentes remotas se empaquetan localmente o se resuelven mediante fuentes ya aprobadas; ningún renderer depende de red.
- Interacciones, scripts, fetches o estado de negocio del HTML no se copian.
- Estados V3 `missing`, `stale`, `disconnected` y `error` preservan la composición Crystal y aplican presentación determinista.

### Regla de sustitución directa

1. Incrementar `vantareCrystalManifest.version` de 1 a 2.
2. Mantener `systemId: "vantare-crystal"` en perfiles y diseños.
3. Migrar settings v1→v2 por tipo y variante.
4. Sustituir tokens y renderizadores en el mismo paquete.
5. Actualizar baselines solo después de aprobar comparación HTML↔renderer.
6. Prohibir coexistencia de dos renderizadores Crystal seleccionables.

### Protección del worktree

- Rama esperada: `refactor`.
- El worktree está sucio con la implementación completa V3; antes de ejecutar este plan debe existir un commit/base verificable o un worktree dedicado.
- No mezclar este plan con deuda global de lint/server ni con `vantare-v2/` anidado no relacionado.
- Si el diff inicial no puede atribuirse, parar.

## 1. Inventario definitivo: referencia numerada 01–16 → 18 tipos

| HTML | Tipo funcional V3 | Diseños Crystal oficiales |
|---|---|---|
| 01 Relative | `relative` existente | `relative-crystal-vertical` |
| 01 Standings | `standings` existente | `standings-crystal-vertical` |
| 02 Broadcast Tower | `broadcast-tower` nuevo | `broadcast-tower-crystal` |
| 03 Fuel Calculator + Lap History | `fuel-strategy` nuevo | `fuel-strategy-crystal-unified` |
| 04 Pedals V1 | `pedals-telemetry` nuevo | `pedals-telemetry-crystal` |
| 04 Pedals V2 | `pedals-telemetry-compact` nuevo | `pedals-telemetry-compact-crystal` |
| 04 Pedals V3 | `pedals` existente | `pedals-crystal` |
| 05 Racing Flags | `racing-flags` nuevo | `racing-flags-crystal` |
| 06 Delta Bar | `delta` existente | `delta-crystal-bar` |
| 07 Delta Trace | `delta-trace` nuevo | `delta-trace-crystal` |
| 08 Race Schedule | `race-schedule` nuevo | `race-schedule-crystal` |
| 09 Head to Head | `head-to-head` nuevo | `head-to-head-crystal` |
| 10A/B/C Input Telemetry | `input-telemetry` nuevo | `input-crystal-blade`, `input-crystal-capsule`, `input-crystal-dense` |
| 11 Multiclass Relative | `multiclass-relative` nuevo | `multiclass-relative-crystal` |
| 12 Track Weather | `track-weather` nuevo | `track-weather-crystal` |
| 13 Car Damage Visual | `car-damage-visual` nuevo | `car-damage-visual-crystal` |
| 14 Car Damage Numbers | `car-damage-numbers` nuevo | `car-damage-numbers-crystal` |
| 15 Delta Simple | `delta` existente | `delta-crystal-simple` |
| 16 Delta Advanced | `delta-advanced` nuevo | `delta-advanced-crystal` |

Resultado: 18 tipos funcionales, 21 diseños Crystal oficiales y 18 diseños Original mínimos (al menos uno por tipo). Hay 14 tipos nuevos respecto a los cuatro core actuales. Cada tipo nuevo debe tener renderer `vantare-original` honesto para que cambiar de sistema nunca produzca `unsupported widget type`.

### Regla tipo vs diseño

- Tipos distintos: Pedals V1/V2/V3, Damage 13/14 y Delta Advanced 16. Pueden compartir readers o tipos de datos pequeños, pero tienen definición, catálogo, ViewModel, inspector y persistencia independientes.
- Mismo tipo con varios diseños Crystal: Input Telemetry 10A/10B/10C y Delta 06/15.
- `WidgetDesignV1.id` identifica una elección de catálogo; el setting Crystal `templateId` identifica la composición que resuelve el renderer. No usar un `visualTemplate` global ni convertir cada diseño en `WidgetType`.
- Aplicar un sistema o diseño nunca altera `widget.id`, `widget.type`, contenido, comportamiento, layout ni z-order.

### Experiencia de selección en el inspector

1. `Sistema visual`: control segmentado explícito `Vantare Original | Vantare Crystal`.
2. `Diseños de Vantare`: solo diseños oficiales compatibles con `widget.type + systemId`.
3. `Mis diseños`: solo diseños de usuario compatibles con `widget.type + systemId`, con `Guardar actual`.
4. Cambiar de sistema aplica el diseño oficial predeterminado o recupera la última selección recordada de ese widget para ese sistema.
5. Cambiar de diseño conserva contenido/comportamiento/layout; undo/redo trata la operación como un único comando.
6. `Añadir widget` muestra los 18 tipos funcionales, no las 21 composiciones; usa el sistema predeterminado del perfil y el diseño predeterminado compatible.

## 2. Mapa de archivos

### Core/contracts

- Modify `pkg/config/profile_v3.go`
- Modify `pkg/config/profile_v3_validate.go`
- Modify `pkg/config/profile_v3_migrate.go`
- Modify `pkg/config/profile_v3_validate_test.go`
- Modify migration tests/goldens under `pkg/config/testdata/`
- Modify `frontend/src/overlay/core/profile-document.ts`
- Modify `frontend/src/overlay/core/widget-design.ts`
- Modify `frontend/src/overlay/core/widget-registry.ts`
- Modify `frontend/src/overlay/core/design-system-definition.ts`
- Modify `frontend/src/overlay/core/design-system-registry.ts`
- Modify tests homónimos y fixtures V3.

### Primitivas Crystal

- Replace `frontend/src/overlay/design-systems/vantare-crystal/tokens.css`
- Create `frontend/src/overlay/design-systems/vantare-crystal/crystal-primitives.tsx`
- Create `frontend/src/overlay/design-systems/vantare-crystal/crystal-primitives.test.tsx`
- Create `frontend/src/overlay/design-systems/vantare-crystal/reference-contract.test.ts`
- Modify `frontend/src/overlay/design-systems/vantare-crystal/manifest.ts`

### Tipos nuevos

Crear estas 14 carpetas exactas bajo `frontend/src/overlay/widget-types/`: `broadcast-tower`, `fuel-strategy`, `pedals-telemetry`, `pedals-telemetry-compact`, `racing-flags`, `delta-trace`, `race-schedule`, `head-to-head`, `delta-advanced`, `input-telemetry`, `multiclass-relative`, `track-weather`, `car-damage-visual` y `car-damage-numbers`.

En cada carpeta crear cuatro archivos usando literalmente el nombre de la carpeta como prefijo: `-definition.ts`, `-definition.test.ts`, `-view-model.ts` y `-view-model.test.ts`. Ejemplo completo: `broadcast-tower/broadcast-tower-definition.ts`, `broadcast-tower/broadcast-tower-definition.test.ts`, `broadcast-tower/broadcast-tower-view-model.ts` y `broadcast-tower/broadcast-tower-view-model.test.ts`. Los inspectores concretos son `BroadcastTowerContentInspector.tsx`, `FuelStrategyContentInspector.tsx`, `PedalsTelemetryContentInspector.tsx`, `PedalsTelemetryCompactContentInspector.tsx`, `RacingFlagsContentInspector.tsx`, `DeltaTraceContentInspector.tsx`, `RaceScheduleContentInspector.tsx`, `HeadToHeadContentInspector.tsx`, `DeltaAdvancedContentInspector.tsx`, `InputTelemetryContentInspector.tsx`, `MulticlassRelativeContentInspector.tsx`, `TrackWeatherContentInspector.tsx`, `CarDamageVisualContentInspector.tsx` y `CarDamageNumbersContentInspector.tsx`.

### Renderizadores

Para cada una de las 14 carpetas anteriores, crear la misma carpeta bajo `vantare-crystal/` y `vantare-original/`. Los pares de componentes son: `BroadcastTowerCrystal/Original`, `FuelStrategyCrystal/Original`, `PedalsTelemetryCrystal/Original`, `PedalsTelemetryCompactCrystal/Original`, `RacingFlagsCrystal/Original`, `DeltaTraceCrystal/Original`, `RaceScheduleCrystal/Original`, `HeadToHeadCrystal/Original`, `DeltaAdvancedCrystal/Original`, `InputTelemetryCrystal/Original`, `MulticlassRelativeCrystal/Original`, `TrackWeatherCrystal/Original`, `CarDamageVisualCrystal/Original` y `CarDamageNumbersCrystal/Original`; cada componente lleva test homónimo `.test.tsx` en su carpeta.

### Catálogo/diseños/harness

- Modify `frontend/src/hub/overlay-studio/catalog/AddWidgetDialog.tsx`
- Modify `frontend/src/hub/overlay-studio/components/WidgetListPanel.tsx`
- Modify `frontend/src/hub/overlay-studio/inspector/DesignSection.tsx`
- Modify `frontend/src/hub/overlay-studio/designs/design-utils.ts`
- Modify `frontend/src/hub/overlay-studio/overlay-studio-v3.css`
- Modify `frontend/src/i18n/locales/studio-v3/{es,en,it,pt}.ts`
- Modify focused tests for `DesignSection`, design commands and `AddWidgetDialog`.
- Modify `frontend/src/overlay/core/mock-scenarios.ts`
- Modify `frontend/scripts/overlay-studio-visual.mjs`
- Create `frontend/scripts/crystal-html-parity.mjs`
- Create baselines bajo `frontend/testdata/overlay-studio-visual/` únicamente tras aprobación.

## Fase 0 — Congelar referencia y medir gap

### Task 0.1: Worksheet automática del HTML

**Files:** Create `docs/templates/vantare-crystal-glassmorphism-worksheet.md`; Create `frontend/scripts/extract-crystal-reference.mjs`; Test script.

- [ ] RED: el extractor debe encontrar exclusivamente las composiciones numeradas 01–16, sus tokens y selectores obligatorios.

```js
const required = ["01.", "02.", "03.", "04.", "05.", "06.", "07.", "08.", "09.", "10A.", "10B.", "10C.", "11.", "12.", "13.", "14.", "15.", "16."];
const excludedMarker = html.indexOf("V2. WIDGETS REESTILIZADOS");
if (excludedMarker < 0) process.exit(1);
const canonical = html.slice(0, excludedMarker);
if (required.some((label) => !canonical.includes(label))) process.exit(1);
if (canonical.includes('class="v2-section"')) process.exit(1);
```

- [ ] Run: `node frontend/scripts/extract-crystal-reference.mjs --check`; Expected: FAIL antes de crear script/worksheet.
- [ ] Implementar extracción read-only de variables CSS, clases raíz, tamaños inline y títulos; cortar antes del bloque final V2 y no generar código React.
- [ ] Generar worksheet con selector, función, tipo/variante, ViewModel, setting visual y assertion.
- [ ] Run; Expected: PASS, 21 composiciones y cero entradas procedentes de `.v2-section`.
- [ ] Commit `docs(crystal): freeze glassmorphism reference contract`.

### Task 0.2: Capturas de referencia

**Files:** Create `frontend/scripts/crystal-reference-capture.mjs`; Create manifest JSON de crops.

- [ ] Abrir `docs/overlay-glassmorphism-pro.html` mediante servidor local, nunca `file://`.
- [ ] Capturar página y crops estables por sección a DPR 1, fonts ready y animaciones desactivadas.
- [ ] Guardar refs en `frontend/testdata/crystal-reference/` con metadata viewport/crop/hash.
- [ ] Validar cero error de consola/red excepto fuentes remotas conocidas; sustituir fuente por copia local en harness de referencia si fuera necesario, sin alterar HTML canónico.
- [ ] Commit `test(crystal): capture canonical HTML references`.

### Task 0.3: Gap report actual

**Files:** Create `docs/vantare-crystal-direct-replacement-gap.md`.

- [ ] Capturar los cuatro renderers actuales con mismos crops.
- [ ] Registrar diferencias estructurales: fonts, tokens, blur, glows, card rows, headers, footers, delta/pedals.
- [ ] No corregir todavía.
- [ ] Commit `docs(crystal): record direct replacement visual gaps`.

### Gate 0

HTML numerado 01–16 capturable, 21 crops definidos, bloque V2 excluido por test, worksheet completa y diff actual reproducible.

## Fase 1 — Expandir el contrato de widgets sin romper perfiles

### Task 1.1: WidgetType canónico y parsing

**Files:** Modify `pkg/config/profile_v3.go`, `profile_v3_validate.go`, `profile_v3_migrate.go` and tests/goldens; modify `frontend/src/overlay/core/profile-document.ts` and contract fixture tests.

- [ ] RED: documentos V3 aceptan los 18 tipos; rechazan desconocidos; documentos con cuatro widgets actuales siguen idénticos.
- [ ] Renombrar `CoreWidgetType` a `WidgetType` y `CORE_WIDGET_TYPES` a `WIDGET_TYPES`; añadir los 14 tipos nuevos y actualizar consumidores mediante rename mecánico protegido por TypeScript.
- [ ] No conservar un alias `CoreWidgetType`: tras el cutover solo existe un vocabulario de tipos y `rg "CoreWidgetType|CORE_WIDGET_TYPES" frontend/src` devuelve cero.
- [ ] Añadir en Go las 14 constantes `WidgetTypeV3` y actualizar `isSupportedWidgetTypeV3`; un fixture JSON por cada tipo debe parsear y validar igual en Go y TypeScript.
- [ ] No cambiar `schemaVersion: 3`; es ampliación aditiva.
- [ ] Run `go test ./pkg/config/... -run "ProfileDocumentV3|WidgetType" -count=1` y el test de contrato frontend; Expected: PASS.
- [ ] Commit `feat(overlays): register complete widget type vocabulary`.

### Task 1.2: Registry completo

**Files:** Modify `widget-registry.ts`; create placeholder-free definitions only as each type arrives.

- [ ] RED: matriz esperada enumera 18 definiciones exactamente una vez.
- [ ] Introducir export `ALL_WIDGET_TYPES` compartido para tests/parsers; evitar sets duplicados.
- [ ] No registrar stubs sin ViewModel funcional.
- [ ] Commit `refactor(overlays): centralize widget type inventory`.

### Task 1.3: Contrato sistema visual → diseño compatible

**Files:** Modify `profile-document.ts`, `widget-design.ts`, `design-system-definition.ts`, `manifest.ts`, commands/design tests.

- [ ] RED: cada diseño oficial tiene `widgetType`, `systemId`, `id` y `visual.templateId`; registry rechaza combinaciones incompatibles y `templateId` desconocidos.
- [ ] RED: Input 10A/B/C resuelven un solo `input-telemetry`; Delta 06/15 resuelven un solo `delta`; Pedals V1/V2/V3, Damage 13/14 y Delta Advanced resuelven tipos distintos.
- [ ] Mantener variantes reales como diseños, pero no fusionar widgets funcionalmente independientes aunque consuman telemetría parecida.
- [ ] Manifest Crystal pasa a version 2 con migración 1→2.
- [ ] Commit `refactor(crystal): add versioned visual template contract`.

### Task 1.4: Memoria visual por sistema

**Files:** Modify `pkg/config/profile_v3.go`, `profile_v3_validate.go`, normalization/migration tests; modify `profile-document.ts`, parser/migration tests and studio command reducer/tests.

- [ ] RED: al pasar Crystal→Original→Crystal, el widget recupera el último `designId`, `baseSettings` y `appearanceOverrides` válidos de Crystal sin tocar contenido/layout/behavior.
- [ ] Añadir este contrato aditivo; el bloque activo `visual` sigue siendo la fuente renderizada y la memoria nunca contiene contenido funcional:

```ts
export type WidgetVisualSelectionV3 = {
  systemVersion: number;
  configVersion: number;
  baseSettings: Record<string, unknown>;
  appearanceOverrides: Record<string, unknown>;
  provenance?: WidgetDesignProvenanceV3;
};

export type WidgetVisualV3 = {
  systemId: DesignSystemId;
  systemVersion: number;
  configVersion: number;
  baseSettings: Record<string, unknown>;
  appearanceOverrides: Record<string, unknown>;
  provenance?: WidgetDesignProvenanceV3;
  systemMemories?: Partial<Record<DesignSystemId, WidgetVisualSelectionV3>>;
};
```

- [ ] Añadir `defaultVisualSystemId?: DesignSystemId` a `ProfileDocumentV3`: documentos antiguos usan `vantare-original`; AddWidget lo usa sin forzar widgets existentes a cambiar de sistema.
- [ ] Reflejar en Go `DefaultVisualSystemID *DesignSystemID` y `SystemMemories map[DesignSystemID]WidgetVisualSelectionV3`; validar claves, versiones, provenance y límites de payload, y conservarlos en normalize/clone/save/load.
- [ ] Los documentos V3 antiguos sin memoria cargan con defaults deterministas; no elevar `schemaVersion` por este campo aditivo.
- [ ] Un cambio de sistema o diseño genera un solo history entry y undo/redo restaura sistema, diseño y overrides conjuntamente.
- [ ] Golden round-trip Go↔JSON↔TypeScript conserva ambas memorias byte-semánticamente y rechaza sistemas desconocidos.
- [ ] Commit `feat(studio): remember widget design per visual system`.

### Gate 1

Parsing legacy PASS, 18 tipos sin stubs, compatibilidad sistema/diseño validada y manifest v2 migra perfiles v1 determinísticamente.

## Fase 2 — Primitivas y tokens Crystal 1:1

### Task 2.1: Test contractual contra HTML

**Files:** Create `reference-contract.test.ts`.

- [ ] RED: parsear HTML y exigir tokens exactos:

```ts
expect(tokens["--bg-page"]).toBe("#060608");
expect(tokens["--font-sans"]).toContain("Inter");
expect(glass.background).toBe("rgba(18, 18, 22, 0.82)");
expect(glass.border).toBe("1px solid rgba(255, 255, 255, 0.09)");
expect(glass.radius).toBe("16px");
expect(glass.blur).toBe("24px");
```

- [ ] Confirmar RED contra `tokens.css` actual.
- [ ] No normalizar colores visualmente parecidos; exactitud textual/numérica.

### Task 2.2: Sustituir tokens

**Files:** Replace `tokens.css`; add local font declarations/assets if license permits.

- [ ] Scope bajo `[data-widget-system="vantare-crystal"]`.
- [ ] Definir Inter, Plus Jakarta Sans y JetBrains Mono o fallback aprobado con test explícito.
- [ ] Eliminar superficies azuladas/glows genéricos no presentes.
- [ ] Mantener `prefers-reduced-motion`.
- [ ] Contract test GREEN.
- [ ] Commit `feat(crystal): replace visual tokens with canonical glassmorphism`.

### Task 2.3: Primitivas visuales

**Files:** Create primitives TSX/test.

- [ ] RED para `CrystalCard`, `CrystalHeader`, `CrystalLogo`, `CrystalPill`, `CrystalFooter`, `CrystalTableRow`.
- [ ] Copiar composición visual, no datos mock ni lógica.
- [ ] Props puras y sin Wails/profile/layout.
- [ ] Commit `feat(crystal): add canonical glass primitives`.

### Gate 2

Contract HTML exacto, fonts locales, checker de sistema PASS y presupuesto blur ≤24px aprobado explícitamente (actual budget 16 deberá actualizarse con benchmark, no silenciarse).

## Fase 3 — Reemplazo de los cuatro core

### Task 3.1: Relative vertical

**Files:** Replace `relative/RelativeCrystal.tsx`, tests; update settings/migration.

- [ ] RED estructural: `CrystalCard`, logo, RELATIVE pill/header, grid `26/4/28/1fr/58/62`, filas 28px, alternating backgrounds, player strip, footer LIVE TIMING/SOF.
- [ ] Mantener columnas configurables mapeándolas a slots canónicos; columnas extra van a modo avanzado sin romper 1:1 default.
- [ ] Estados no-ready conservan frame/header/footer.
- [ ] Playwright crop vs HTML; aprobar umbral inicial y luego 0% con referencia raster estable.
- [ ] Commit `feat(crystal): replace relative with canonical glass renderer`.

### Task 3.2: Standings vertical

- [ ] RED: width 360, logo, class pill, grid `20/20/26/1fr/76/58`, table header, tyre badge, pit tag, highlight, footer LMU/track temp.
- [ ] Sustituir cards redondeadas por filas gapless del HTML.
- [ ] Studio/Desktop/OBS crops.
- [ ] Commit `feat(crystal): replace standings with canonical glass renderer`.

### Task 3.3: Pedals V3

- [ ] Mantener el tipo existente `pedals` exclusivamente para la composición V3 de barras verticales altas.
- [ ] RED para throttle/brake/clutch, valores, labels, dimensiones y aspect lock de la sección 04 V3.
- [ ] No añadir gear/RPM/speed al ViewModel de `pedals`; esos datos pertenecen a los dos tipos Pedals Telemetry.
- [ ] Un diseño oficial `pedals-crystal` y renderer Original existente migrado sin cambiar función.
- [ ] Commit `feat(crystal): replace pedals with canonical vertical renderer`.

### Task 3.4: Delta bar y Delta Simple

- [ ] Setting Crystal `templateId: delta-bar|delta-simple` validado por el registro de `delta`.
- [ ] RED bar: top pill lap/predicted/split, track center, colored fill, bottom delta pill.
- [ ] RED simple según sección 15; ambas composiciones consumen el mismo Delta ViewModel.
- [ ] Ampliar Delta ViewModel solo con lap/predicted/split requeridos por 06/15; los cuatro bloques de 16 no pertenecen a este tipo.
- [ ] Dos diseños oficiales y dos crops de paridad.
- [ ] Commit `feat(crystal): replace delta with canonical bar and simple designs`.

### Gate 3

Cuatro tipos core, cinco diseños Crystal × ready/missing/stale/disconnected/error × Studio/Desktop/OBS. Ninguna clase de composición Crystal v1 (`vc-*-glow`, row cards genéricas) permanece salvo coincidencia canónica justificada.

## Fase 4 — Infraestructura repetible para widgets nuevos

### Task 4.1: Factory de definiciones sin abstracción visual excesiva

- [ ] Extraer únicamente validación/default layout/behavior repetidos; no crear mega-factory de ViewModels.
- [ ] Test que cada definición declara content defaults, inspector sections, mock builder y updateHz.
- [ ] Commit `refactor(overlays): standardize complete widget definitions`.

### Task 4.2: Fuentes de datos opcionales

- [ ] Añadir readers puros compartidos para session/weather/damage/calendar/input history.
- [ ] Ausente ≠ cero; usar campos opcionales/status.
- [ ] Fixtures mock propios para todos los tipos.
- [ ] Commit `feat(overlays): add shared widget data readers`.

### Task 4.3: Original fallback honesto

- [ ] Crear primitive Original neutral para nuevos tipos, pero cada renderer debe mostrar todos los datos funcionales y estados; no “Coming soon”.
- [ ] Tests garantizan que ambos manifests soportan los 18 tipos.
- [ ] Commit `feat(original): support expanded widget catalog`.

### Gate 4

Matriz 18×2 resoluble; AddWidget nunca crea una combinación sin renderer.

## Fase 5 — Broadcast, estrategia, flags y Pedals Telemetry

### Task 5.1: Broadcast Tower

**Create:** widget type, ViewModel, inspector, Original, Crystal, tests.

- [ ] ViewModel: lap, drivers stream, active/player, class, gaps, track temp, SOF.
- [ ] Crystal: ticker horizontal exacto sección 02.
- [ ] Content: driver count/columns; Appearance: weather visibility/accent.
- [ ] Parity Studio/Desktop/OBS.
- [ ] Commit `feat(overlays): add broadcast tower widget`.

### Task 5.2: Fuel Strategy + Lap History

- [ ] ViewModel funcional a partir de telemetría disponible; campos ausentes honestos. No duplicar el futuro Strategy Planner.
- [ ] Crystal unified two-column card sección 03: fuel bar, quick stats, history.
- [ ] Inspector: history rows, units, visibility; no cálculo de negocio en renderer.
- [ ] Commit `feat(overlays): add fuel strategy widget`.

### Task 5.3: Racing Flags

- [ ] ViewModel: global/sector flags y message; states.
- [ ] Crystal sección 05 exacta.
- [ ] Behavior visibility por flag; no polling interno.
- [ ] Commit `feat(overlays): add racing flags widget`.

### Task 5.4: Pedals Telemetry V1

- [ ] Crear tipo `pedals-telemetry`, definición, ViewModel e inspector propios; ViewModel incluye pedal inputs, gear, RPM, speed y posición mostrada por la cápsula.
- [ ] Crystal reproduce únicamente la columna V1 de la sección 04; no es un template de `pedals`.
- [ ] Original renderer funcional, mocks y estados non-ready propios.
- [ ] Commit `feat(overlays): add pedals telemetry widget`.

### Task 5.5: Pedals Telemetry Compact V2

- [ ] Crear tipo `pedals-telemetry-compact`, definición, ViewModel e inspector propios; puede reutilizar readers puros de telemetría, nunca identidad documental ni settings de V1.
- [ ] Crystal reproduce únicamente la columna V2 de la sección 04; “V2” aquí identifica Pedals Compact y no el bloque excluido “Widgets reestilizados”.
- [ ] Original renderer funcional, mocks y estados non-ready propios.
- [ ] Commit `feat(overlays): add compact pedals telemetry widget`.

### Gate 5

Cinco tipos completos, registry/manifests/catalog, mocks, inspectors, runtime y parity.

## Fase 6 — Análisis y calendario

### Task 6.1: Delta Trace

- [ ] ViewModel incluye trace points, sector deltas, turn insight y track mini-map opcional.
- [ ] Crystal sección 07; SVG/canvas recibe datos puros y no mide layout para negocio.
- [ ] Limitar puntos/history y benchmark.
- [ ] Commit `feat(overlays): add delta trace widget`.

### Task 6.2: Race Schedule

- [ ] Adapter de calendar store/backend fuera del renderer; snapshot compacto de próximos eventos.
- [ ] Crystal sección 08 con cuatro tiers/cards exactas y estados sin calendario.
- [ ] Inspector: filtros/rows/timezone; renderer sin fetch.
- [ ] Commit `feat(overlays): add race schedule widget`.

### Task 6.3: Head to Head

- [ ] ViewModel selecciona player/opponent mediante lógica pura y campos comparativos.
- [ ] Crystal reproduce exclusivamente la sección numerada 09 dentro del rango canónico.
- [ ] Inspector de target/metrics.
- [ ] Commit `feat(overlays): add head to head widget`.

### Task 6.4: Delta Advanced

- [ ] Crear tipo independiente `delta-advanced`, con ViewModel para los cuatro bloques B/S/T/L y disponibilidad explícita por valor.
- [ ] Crystal reproduce exclusivamente la sección 16; no reutilizar el renderer ni `templateId` de `delta`.
- [ ] Original renderer funcional, inspector, mocks y estados non-ready propios.
- [ ] Commit `feat(overlays): add delta advanced widget`.

### Gate 6

History bounded, calendar lifecycle limpio, no dependencias prohibidas en renderers.

## Fase 7 — Input, multiclass, weather y damage

### Task 7.1: Input Telemetry 10A/B/C

- [ ] ViewModel: steering, throttle, brake, clutch, traces bounded y labels.
- [ ] Tres templates/diseños exactos: blade, capsule, dense.
- [ ] No duplicar Pedals: este tipo se centra en trazas/input comparativo; Pedals en lectura instantánea HUD.
- [ ] Commit `feat(overlays): add input telemetry templates`.

### Task 7.2: Multiclass Relative

- [ ] ViewModel distinto de Relative: agrupación multi-clase y gaps integrados/gapless.
- [ ] Crystal reproduce exactamente la sección numerada 11 dentro del rango canónico.
- [ ] Class palette editable y determinista.
- [ ] Commit `feat(overlays): add multiclass relative widget`.

### Task 7.3: Track Weather

- [ ] ViewModel: ambient/track temp, rain, wind, pressure/wetness disponibles; unknown explícito.
- [ ] Crystal reproduce exactamente la sección numerada 12 dentro del rango canónico.
- [ ] No inventar forecast si API solo da current.
- [ ] Commit `feat(overlays): add track weather widget`.

### Task 7.4: Car Damage Visual

- [ ] Crear tipo `car-damage-visual`, definición, ViewModel e inspector propios para chassis, aero y tyres por rueda con availability.
- [ ] Crystal reproduce exclusivamente la sección 13; diagrama accesible mediante labels/descripcion equivalente.
- [ ] Original renderer funcional, mocks y estados non-ready propios.
- [ ] Commit `feat(overlays): add visual car damage widget`.

### Task 7.5: Car Damage Numbers

- [ ] Crear tipo `car-damage-numbers`, definición, ViewModel e inspector propios para aero/body/suspension y campos numéricos disponibles.
- [ ] Crystal reproduce exclusivamente la sección 14; no es un template de Car Damage Visual.
- [ ] Original renderer funcional, mocks y estados non-ready propios.
- [ ] Commit `feat(overlays): add numeric car damage widget`.

### Gate 7

Catálogo funcional completo: 18 tipos, 21 diseños Crystal, 18 Original, inspectors, mocks, runtime.

## Fase 8 — Studio, perfiles, diseños y migraciones

### Task 8.1: AddWidget y lista

- [ ] RED: 18 tipos visibles según acceso; categorías; no duplicados; `input-telemetry` aparece una vez y `delta` aparece una vez, mientras los tres Pedals, dos Damage y Delta Advanced aparecen como tipos separados.
- [ ] Añadir usa el sistema predeterminado del perfil y el diseño oficial default compatible; nunca muestra 21 diseños como 21 tipos.
- [ ] Default layout dentro del canvas y nombre estable por tipo.
- [ ] i18n es/en/pt/it para nombres/descripciones.
- [ ] Commit `feat(studio): expose complete widget catalog`.

### Task 8.2: Selector jerárquico de sistema y diseño

**Files:** Modify `DesignSection.tsx`, `design-utils.ts`, CSS, i18n and focused tests.

- [ ] RED: el inspector presenta primero un control segmentado accesible `Vantare Original | Vantare Crystal` con selección actual inequívoca.
- [ ] RED: tras elegir sistema, `Diseños de Vantare` lista solo `widget.type + selectedSystemId`; `Mis diseños` aplica el mismo filtro y conserva `Guardar actual`.
- [ ] RED: `input-telemetry + Crystal` muestra exactamente 10A/10B/10C; `delta + Crystal` muestra exactamente 06/15; un tipo de diseño único muestra una sola tarjeta seleccionada.
- [ ] RED: cambiar sistema/diseño no modifica `type`, `content`, `behavior`, `layout` ni z-order; genera un solo dirty/history command y recupera la memoria del sistema al volver.
- [ ] Cards incluyen thumbnail real, nombre humano, estado seleccionado/aplicar y lock de acceso; navegación por teclado y nombres accesibles.
- [ ] Commit `feat(studio): separate visual system and widget design selection`.

### Task 8.3: Diseños oficiales

- [ ] Registrar 21 diseños Crystal con provenance Vantare, settings completos, thumbnail real y aspect/default size.
- [ ] Registrar al menos un diseño Original por cada uno de los 18 tipos.
- [ ] Aplicar diseño no cambia layout/id/z-order/behavior/content.
- [ ] Commit `feat(studio): register complete Crystal design collection`.

### Task 8.4: Migración directa Crystal v1→v2

- [ ] Golden tests con perfiles v1 de los cuatro core.
- [ ] Mapear settings obsoletos a template/defaults v2; conservar colores/visibility compatibles.
- [ ] Backup y recovery existentes.
- [ ] Nuevos tipos no requieren migración.
- [ ] Commit `feat(crystal): migrate profiles to glassmorphism v2`.

### Task 8.5: Diseños de usuario

- [ ] Diseños v1 Crystal guardados migran al abrir/aplicar; no quedan apuntando a settings eliminados silenciosamente.
- [ ] Cada diseño personal permanece ligado a un solo `widgetType + systemId`; no aparece bajo otro tipo o sistema.
- [ ] Guardar actual persiste la composición/overrides visuales y contenido solo si el usuario activa explícitamente `includesContent`.
- [ ] UI indica migración una vez si cambia apariencia materialmente.
- [ ] Commit `feat(studio): migrate user Crystal designs`.

### Gate 8

Open/save/reload/undo/redo/copy session/Browser View con todos los tipos; perfil legacy conservado y backup.

## Fase 9 — Paridad automatizada 1:1

### Task 9.1: Harness HTML↔renderer

**Files:** Create `crystal-html-parity.mjs`; update Vite harness.

- [ ] Renderizar referencia y renderer con mismos datos, dimensiones, DPR, fonts y fondo transparente/estable.
- [ ] Capturar crops lado a lado y diff heatmap.
- [ ] Fallar por dimensiones, overflow, font fallback, console error, failed request o pixel delta.
- [ ] No usar screenshot baseline del renderer como referencia canónica; fuente A es crop HTML.

### Task 9.2: Matriz visual

- [ ] 21 diseños ready Studio/Desktop/OBS.
- [ ] Estados non-ready por tipo en al menos Studio y OBS.
- [ ] Fill/intrinsic/compact cuando aplique.
- [ ] 1920×1080, wide/medium Studio y Browser View.
- [ ] Reduced motion.

### Task 9.3: Cierre progresivo de delta

- [ ] Primer gate estructural: selectores/dimensiones/tokens exactos.
- [ ] Segundo gate visual: delta ≤0.5% por crop para localizar antialias/fonts.
- [ ] Gate final: 0.000% cuando mismo motor rasteriza HTML/React; excepciones de antialias deben documentarse por píxel y aprobarse, nunca ocultarse elevando umbral global.
- [ ] Commit `test(crystal): enforce HTML renderer parity`.

### Gate 9

21/21 crops aprobados, ninguna petición remota, consola limpia, Studio/Desktop/OBS coherentes.

## Fase 10 — Rendimiento, accesibilidad y cutover

### Task 10.1: Performance

- [ ] 20 instancias mezcladas, 15/30 Hz, trace bounded.
- [ ] Medir blur 24px real; si incumple presupuesto, escalar material mediante token Lite/renderMode documentado sin romper referencia default.
- [ ] No bajar blur canónico silenciosamente.
- [ ] Bench drag/resize confirma renderers no reintroducen React state transitorio.

### Task 10.2: Accesibilidad

- [ ] Renderers sin controles; semantics/labels/table fallback.
- [ ] Contrast warnings documentados si el HTML los contiene; corregir solo con aprobación visual.
- [ ] Studio inspectors keyboard/focus/i18n.

### Task 10.3: Cutover y eliminación

- [ ] `rg` confirma cero imports/clases de Crystal v1.
- [ ] Eliminar tokens/renderers/tests/baselines antiguos, no renombrarlos.
- [ ] Mantener ID `vantare-crystal` y manifest v2.
- [ ] `design-system:check` exige 18 registros por sistema y migración continua.
- [ ] Commit `refactor(crystal): remove superseded Crystal implementation`.

### Task 10.4: Docs vivos

- [ ] Actualizar `widget-design-systems.md`, `widget-architecture.md`, authoring, porting, preview contract, testing strategy, visual harness, performance audit, current plan y final audit.
- [ ] Declarar `overlay-glassmorphism-pro.html` canónico y Crystal v1 retirado.
- [ ] Crear tabla para añadir futuros widgets/simuladores.
- [ ] Commit `docs(crystal): document glassmorphism direct replacement`.

## Checks finales

```powershell
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint
pnpm --dir frontend design-system:check
pnpm --dir frontend visual:overlay-studio
node frontend/scripts/crystal-html-parity.mjs
pnpm --dir frontend bench:overlay-studio-drag
go test ./internal/app/... ./cmd/vantare/... -count=1
go test ./...
git diff --check
```

Los fallos globales preexistentes deben reproducirse contra la base y documentarse. No pueden usarse para omitir checks enfocados.

## Revisión obligatoria por fase

1. Comparar el diff solo con la fase.
2. Confirmar renderer puro: sin Wails, SSE, profile, layout, permisos, fetch ni refs de telemetría.
3. Confirmar ViewModel funcional compartido Original/Crystal.
4. Confirmar settings visuales, content y behavior no se mezclan.
5. Ejecutar tests y Playwright de la fase.
6. Inspeccionar consola/network/overflow/fonts.
7. Actualizar `docs/current-plan.md` con evidencia y commit.
8. Detenerse antes de la siguiente fase.

## Definition of Done

- `vantare-crystal` significa exclusivamente el glassmorphism del HTML canónico.
- Crystal v1 está eliminado, no oculto.
- Manifest v2 migra perfiles/diseños v1.
- 18 tipos funcionales completos.
- 21 diseños Crystal oficiales con paridad 1:1.
- Todos los tipos tienen Original funcional.
- Inspectores, mocks, perfiles, layouts y diseños completos.
- Studio, Desktop y OBS comparten ViewModels/host.
- HTML↔renderer parity automatizada, no subjetiva.
- Fonts/assets offline.
- Estados ready/missing/stale/disconnected/error.
- Performance, reduced-motion, accessibility e i18n verificados.
- Suites, build, checker, visual, benchmark y Wails smoke ejecutados.
