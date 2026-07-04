# WIDGET-STUDIO-03 — Vantare Crystal, slots y variantes propias

## Objetivo

Implementar la base del nuevo sistema visual de widgets **Vantare Crystal** y adaptar `WidgetStudio` para editar widgets con el modelo acordado de **slots**, **columns** y **columnGroups**, usando el HTML definitivo `docs/overlay-vantare-crystal-widgets.html` como fuente visual.

El objetivo no es hacer un re-theme global ni rehacer todo el overlay de una vez. El objetivo es dejar una arquitectura mantenible para soportar dos sistemas de diseno (`base` y `vantare-crystal`) y futuros packs, empezar por el editor de widgets, y despues implementar widgets uno a uno.

## Fuentes obligatorias

Antes de implementar, leer:

- `AGENTS.md`
- `docs/current-plan.md`
- `docs/widget-architecture.md`
- `docs/widget-rendering-preview-contract.md`
- `docs/beta-widget-system-spec.md`
- `docs/product-widget-customization.md`
- `docs/overlay-vantare-crystal-widgets.html`
- `docs/overlay-glassmorphism-pro.html`
- `frontend/src/lib/profile.ts`
- `frontend/src/hub/overlays/WidgetStudio.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
- `frontend/src/hub/preview/WidgetRenderer.tsx`
- `frontend/src/overlay/CompositeApp.tsx`
- `frontend/src/overlay/ObsOverlayApp.tsx`

Skills recomendadas para el worker:

- `vantare-core`
- `frontend-ui-engineering`
- `frontend-design-deslop`
- `test-driven-development`
- `accessibility`
- `code-review-and-quality`

## Decisiones cerradas

- El diseno definitivo de esta fase se llama **Vantare Crystal**.
- Se soportaran al menos dos sistemas: el actual/base y `vantare-crystal`.
- Primero se implementa `WidgetStudio`; `LayoutStudio` queda fuera salvo tests que aseguren que no se rompe la separacion.
- `WidgetStudio` edita configuracion interna: diseno, slots, columnas, grupos, filtros, formatos y variantes.
- `LayoutStudio` edita posicion/tamano/composicion. No se toca en esta fase.
- Las variantes propias se guardan explicitamente; no hay autosave.
- Las variantes no guardan `position`, `w`, `h`, `x`, `y`.
- Slots son bloques semanticos aislados.
- Columns son datos repetidos/tabulares.
- ColumnGroups agrupan columnas repetidas por categoria.
- La metrica disponible se elige desde un allowlist general y luego se filtra por compatibilidad del widget.
- Free widgets: `Standings`, `Delta`, `Pedals`.
- Pro widgets visibles con preview bloqueada: `Relative`, `Broadcast Tower`, `Multiclass Relative`, `Race Schedule / Upcoming`, `Telemetry Blade`.
- Tester/experimental visibles como previews honestas: `Fuel Calculator`, `Track Weather`, `Car Damage Visual`, `Head 2 Head`, `Delta Trace / Corner Analysis`, `Racing Flags`.
- Widgets sin datos reales no deben entrar como runtime activo normal. Deben marcarse `DATA PENDING`, `DATA PARTIAL`, `TESTER` o `EXPERIMENTAL`.
- Free users deben ver preview de widgets de pago, pero no poder aplicar/guardar la variante bloqueada.
- Pedals V1/V2/V3 se modelaran como widgets separados cuando llegue su microcorte.
- Delta simple/bar/advanced se modelaran como widgets separados cuando llegue su microcorte.
- Broadcast Tower, Multiclass Relative y Telemetry Blade son widgets separados.

## No objetivos

- No redisenar todo el Hub.
- No cambiar `LayoutStudio`.
- No anadir drag/drop de slots.
- No anadir dependencias UI.
- No introducir datos fake en runtime.
- No mover widgets ni cambiar `position` desde `WidgetStudio`.
- No hacer todos los widgets nuevos en un unico corte.
- No tocar backend Go salvo que una fase posterior demuestre una necesidad real.

## Matriz inicial de widgets

| Widget | Estado | Plan | Data | Modelo | Esta fase |
|---|---|---|---|---|---|
| Standings | existente | Free | OK | columns | si |
| Delta | existente | Free | OK | slots | si |
| Pedals | existente | Free | OK | slots | si |
| Relative | existente | Pro | OK | columns | si |
| Broadcast Tower | nuevo/separado | Pro | OK probable | slots | despues de foundation |
| Multiclass Relative | nuevo/separado | Pro | OK probable | mixed | despues de foundation |
| Race Schedule / Upcoming | nuevo/separado | Pro | Partial | slots | solo catalogo/preview, runtime posterior |
| Telemetry Blade | separado | Pro | OK | slots | despues de foundation |
| Fuel Calculator | nuevo | Tester | Partial | slots | catalogo/preview honesta |
| Track Weather | nuevo | Tester | Pending | slots | catalogo/preview honesta |
| Car Damage Visual | nuevo | Tester | Pending | slots | catalogo/preview honesta |
| Head 2 Head | nuevo | Tester | Pending | slots | catalogo/preview honesta |
| Delta Trace / Corner Analysis | nuevo | Experimental | Pending | mixed | catalogo/preview honesta |
| Racing Flags | nuevo | Tester | Partial | slots | catalogo/preview honesta |

## Arquitectura propuesta

### 1. Design system resolver

Crear una capa pequena, pura y testeada para resolver tokens visuales por `themeId`:

- `base`
- `glassmorphism-pro` si ya existe y sigue en uso
- `vantare-crystal`

La capa debe devolver tokens semanticos y clases/variables para widgets, no mutar perfiles.

Archivos probables:

- `frontend/src/overlay/widgets/widget-design-system.ts`
- `frontend/src/overlay/widgets/widget-design-system.test.ts`

### 2. Catalogo de widget capabilities

Crear un catalogo que describa:

- access tier (`free`, `pro`, `tester`, `experimental`)
- data status (`ok`, `partial`, `pending`)
- modelo de edicion (`slots`, `columns`, `mixed`)
- si se puede aplicar en runtime
- descripcion visible
- widgets compatibles con cada metrica

Archivos probables:

- `frontend/src/hub/overlays/widget-catalog.ts`
- `frontend/src/hub/overlays/widget-catalog.test.ts`

### 3. Slot/column helpers

Crear helpers puros para construir defaults y validar configuracion:

- `buildDefaultSlots(widgetType, themeId)`
- `buildDefaultColumns(widgetType, themeId)`
- `buildDefaultColumnGroups(widgetType, themeId)`
- `filterMetricsForWidget(widgetType, metricCatalog)`
- `normaliseWidgetVariantConfig(variant)`

Archivos probables:

- `frontend/src/hub/overlays/widget-config-model.ts`
- `frontend/src/hub/overlays/widget-config-model.test.ts`

### 4. WidgetStudio Vantare Crystal

Adaptar el editor para:

- Lista de widgets como en el HTML.
- Badges `FREE`, `PRO`, `TESTER`, `EXPERIMENTAL`.
- Badges `DATA OK`, `DATA PARTIAL`, `DATA PENDING`.
- Panel central con preview del widget.
- Panel derecho con secciones `Slots`, `Columns`, `Column Groups`, `Filters`, `Format`, `Variant`.
- Preview visible para widgets bloqueados.
- CTA bloqueada para usuarios Free cuando el widget no sea Free.
- Sin controles de posicion/tamano.

Archivos probables:

- `frontend/src/hub/overlays/WidgetStudio.tsx`
- `frontend/src/hub/overlays/WidgetStudio.test.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx`
- nuevos componentes pequenos en `frontend/src/hub/overlays/`

### 5. Runtime widgets por fases

No mezclar foundation + 10 widgets nuevos en una sola edicion. Tras foundation:

1. Free existing: `Standings`, `Delta`, `Pedals`.
2. Pro existing: `Relative`.
3. Pro nuevos con datos OK: `Broadcast Tower`, `Multiclass Relative`, `Telemetry Blade`.
4. Pro/partial: `Race Schedule / Upcoming`.
5. Tester/experimental: solo catalogo/preview hasta confirmar datos.

## Microcortes

### MC-0 — Baseline e inventario

**Objetivo:** Confirmar estado actual antes de tocar codigo.

**Tareas:**

- Ejecutar `git status --short`.
- Buscar registros de widgets actuales en `WidgetRenderer`, `CompositeApp`, `ObsOverlayApp`, `widget-factory`, `widget-base-size`, `widget-preview-size`.
- Confirmar que `WidgetStudio` no toca `position`.
- Capturar lista real de tipos existentes.

**Aceptacion:**

- Hay una nota breve en `docs/current-plan.md` con el inventario real.
- No se cambia codigo productivo.

**Checks:**

- `git diff --check -- docs/current-plan.md`

### MC-1 — Resolver Vantare Crystal

**Objetivo:** Crear la base pura de design systems sin tocar UI.

**TDD RED:**

- Test que falla porque `resolveWidgetDesignSystem("vantare-crystal")` no existe.
- Test que exige fallback seguro a `base`.
- Test que verifica que los tokens no incluyen posicion ni tamano externo.

**Implementacion:**

- Crear resolver `base` + `vantare-crystal`.
- Tokens minimos: background, border, accent, text, muted, badge variants, shadow/glow policy, radius.
- Usar nombres semanticos; no dispersar hex en componentes.

**Aceptacion:**

- Resolver puro sin React.
- No cambia runtime visual todavia.
- No toca perfiles.

**Checks:**

- `pnpm --dir frontend test -- widget-design-system`
- `pnpm --dir frontend exec tsc -b`

### MC-2 — Catalogo de widgets, acceso y data status

**Objetivo:** Centralizar la matriz del HTML en un catalogo testeado.

**TDD RED:**

- Free: Standings/Delta/Pedals.
- Pro: Relative/Broadcast/Multiclass/Race Schedule/Telemetry Blade.
- Tester/Experimental: Fuel/Weather/Damage/H2H/Delta Trace/Flags.
- Data pending no puede ser runtime-applicable por defecto.

**Implementacion:**

- Crear `widget-catalog.ts`.
- Exponer helpers:
  - `getWidgetCatalogEntry(type)`
  - `canPreviewWidget(type, access)`
  - `canApplyWidget(type, access)`
  - `isRuntimeReadyWidget(type)`

**Aceptacion:**

- Free puede previsualizar Pro pero no aplicar.
- Tester puede ver/aplicar tester cuando el widget este runtime-ready.
- Data pending queda bloqueado para runtime.
- No duplica la licencia; usa `access-policy`/`AccessContext` si hace falta.

**Checks:**

- `pnpm --dir frontend test -- widget-catalog access-policy`
- `pnpm --dir frontend exec tsc -b`

### MC-3 — Modelo de slots/columns/columnGroups

**Objetivo:** Crear helpers de configuracion interna reutilizables.

**TDD RED:**

- `buildDefaultSlots("delta", "vantare-crystal")` devuelve slots, no columns.
- `buildDefaultColumns("standings", "vantare-crystal")` devuelve columnas.
- `relative` usa columns.
- `multiclass-relative` usa mixed.
- Ningun helper devuelve `position`, `x`, `y`, `w`, `h`.
- Metricas incompatibles se filtran.

**Implementacion:**

- Crear helpers de defaults y normalizacion.
- Mantener compatibilidad con `WidgetVariantConfig`.
- No cambiar schema salvo necesidad demostrada.

**Aceptacion:**

- Configuracion de variante sigue siendo interna.
- Tests protegen que `position` no entra en variantes.

**Checks:**

- `pnpm --dir frontend test -- widget-config-model WidgetStudio WidgetSettingsPanel`
- `pnpm --dir frontend exec tsc -b`

### MC-4 — WidgetStudio shell Vantare Crystal

**Objetivo:** Adaptar visualmente la pestana del editor al HTML definitivo.

**TDD RED:**

- Renderiza titulo/selector `Vantare Crystal`.
- Lista widgets con badges de acceso y data status.
- Renderiza `Slots`, `Columns`, `Column Groups`.
- No muestra controles de posicion/tamano.
- Widget Pro bloqueado muestra preview y CTA bloqueada para Free.

**Implementacion:**

- Crear componentes presentacionales pequenos si hace falta:
  - `WidgetCatalogList`
  - `WidgetAccessBadge`
  - `WidgetDataStatusBadge`
  - `WidgetConfigSections`
- Reusar `WidgetSandboxPreview`.
- Mantener guardado explicito.

**Aceptacion:**

- Visual cercano al HTML, sin re-theme global.
- `WidgetStudio` no importa ni usa `PreviewWidgetFrame`.
- No cambia `LayoutStudio`.

**Checks:**

- `pnpm --dir frontend test -- WidgetStudio WidgetSettingsPanel WidgetSandboxPreview`
- `pnpm --dir frontend exec tsc -b`
- `pnpm --dir frontend lint`

### MC-5 — Guardar variantes propias

**Objetivo:** Permitir guardar variantes propias por widget con `vantare-crystal`.

**TDD RED:**

- Guardar variante crea/actualiza `profile.variants`.
- Aplicar variante conserva `widget.position`.
- Cambiar slots/columns no persiste hasta guardar.
- Variante custom queda disponible en el selector del widget.

**Implementacion:**

- Integrar con flujo existente de perfil.
- Evitar autosave.
- Si ya existe flujo de variantes, extenderlo en vez de duplicarlo.

**Aceptacion:**

- No se rompe Recommended Profiles.
- No se cambia LayoutStudio.

**Checks:**

- `pnpm --dir frontend test -- WidgetStudio WidgetSettingsPanel profile-editor WidgetSandboxPreview`
- `pnpm --dir frontend exec tsc -b`

### MC-6 — Vantare Crystal para widgets Free existentes

**Objetivo:** Implementar `vantare-crystal` en `Standings`, `Delta` y `Pedals`.

**TDD RED:**

- Standings usa columnas configurables con Crystal.
- Delta usa slots Crystal.
- Pedals usa slots Crystal.
- Fallback base sigue funcionando.
- Runtime desktop y OBS renderizan el mismo contenido.

**Implementacion:**

- Añadir paths condicionales por `themeId`.
- No romper `glassmorphism-pro`.
- No introducir nuevos tipos aun salvo que el corte los separe explicitamente.

**Aceptacion:**

- Free widgets aplicables por usuarios Free.
- No hay datos fake.
- Tests de WidgetRenderer/CompositeApp/ObsOverlayApp pasan.

**Checks:**

- `pnpm --dir frontend test -- StandingsWidget DeltaWidget PedalsWidget WidgetRenderer CompositeApp ObsOverlayApp`
- `pnpm --dir frontend exec tsc -b`
- `pnpm --dir frontend build`

### MC-7 — Relative Pro como validador del sistema

**Objetivo:** Llevar `Relative` a Vantare Crystal con columns y gating Pro.

**TDD RED:**

- Free ve preview bloqueada y no puede aplicar.
- Paid/Tester puede aplicar.
- Columns de Relative se pueden editar sin tocar `position`.
- Runtime mantiene datos reales.

**Implementacion:**

- Adaptar `RelativeWidget`.
- Usar catalogo de columnas existente.
- Integrar badges/access en WidgetStudio.

**Aceptacion:**

- Relative valida el modelo Pro completo.
- No se rompe relative actual.

**Checks:**

- `pnpm --dir frontend test -- RelativeWidget relative-catalog relative-filters WidgetStudio`
- `pnpm --dir frontend exec tsc -b`

### MC-8 — Nuevos widgets Pro con datos OK

**Objetivo:** Añadir widgets separados de Pro con datos reales o derivados del modelo actual.

**Orden recomendado:**

1. `broadcast-tower`
2. `multiclass-relative`
3. `telemetry-blade`

**TDD RED por widget:**

- Registrado en `WidgetRenderer`.
- Registrado en `CompositeApp`.
- Registrado en `ObsOverlayApp`.
- Tiene default size en `widget-factory`.
- Tiene base size si procede.
- Tiene preview en WidgetStudio.
- Gating Pro correcto.

**Aceptacion:**

- No se implementan si no hay datos reales suficientes.
- Si un widget solo puede existir como preview, marcar `DATA PARTIAL` y no runtime-ready.

**Checks:**

- `pnpm --dir frontend test -- WidgetRenderer CompositeApp ObsOverlayApp widget-factory`
- tests especificos de cada widget
- `pnpm --dir frontend exec tsc -b`

### MC-9 — Catalogo tester/experimental sin fake runtime

**Objetivo:** Mostrar previews bloqueadas/honestas de widgets sin datos confirmados.

**TDD RED:**

- Track Weather aparece como `TESTER` + `DATA PENDING`.
- Data pending no se puede aplicar en runtime.
- Free puede ver preview visual pero no aplicar.
- Copy dice que requiere datos pendientes, no simula live data.

**Implementacion:**

- Catalog entries + preview shells honestas.
- No registrar runtime widgets si no hay datos.

**Aceptacion:**

- No hay claims falsos.
- No se introducen datos mock en overlay runtime.

**Checks:**

- `pnpm --dir frontend test -- widget-catalog WidgetStudio`
- `pnpm --dir frontend exec tsc -b`

### MC-10 — Visual harness y comparacion con HTML

**Objetivo:** Crear validacion visual repetible contra `docs/overlay-vantare-crystal-widgets.html`.

**Implementacion:**

- Script Playwright opcional para capturar:
  - HTML referencia.
  - WidgetStudio con Vantare Crystal.
  - Preview Standings.
  - Preview Delta.
  - Preview Pedals.
  - Preview Relative locked/free.
- No commitear PNGs salvo peticion explicita.

**Aceptacion:**

- Script falla si no puede abrir HTML.
- Script documenta diferencias comparables/no comparables.
- No depende de backend real.

**Checks:**

- `node frontend/scripts/<script>.mjs`
- `pnpm --dir frontend exec tsc -b`

### MC-11 — Documentacion final

**Objetivo:** Dejar documentado como continuar widgets uno a uno.

**Tareas:**

- Actualizar `docs/widget-architecture.md` si cambia algun contrato.
- Crear/actualizar doc de Vantare Crystal:
  - design systems soportados
  - slots vs columns
  - gating
  - como añadir widget nuevo
  - como añadir variante oficial
  - como verificar visualmente
- Actualizar `docs/current-plan.md`.

**Aceptacion:**

- Un worker puede añadir el siguiente widget sin preguntar arquitectura basica.
- Docs no contradicen `WidgetStudio`/`LayoutStudio`.

**Checks:**

- `git diff --check -- docs/`

## Prompt de ejecucion sugerido para worker

```text
Usa las skills: vantare-core, frontend-ui-engineering, frontend-design-deslop, test-driven-development, accessibility, code-review-and-quality.

Objetivo: ejecutar el plan `docs/superpowers/plans/2026-07-04-widget-studio-03-vantare-crystal-slots.md` completo por microcortes, sin hacer commit/tag/release.

Reglas duras:
- Lee `AGENTS.md`, `docs/current-plan.md`, `docs/widget-architecture.md`, `docs/widget-rendering-preview-contract.md`, `docs/beta-widget-system-spec.md`, `docs/product-widget-customization.md` y `docs/overlay-vantare-crystal-widgets.html` antes de editar.
- No edites `LayoutStudio` salvo tests/documentacion que prueben que no se rompe.
- `WidgetStudio` no puede mutar `position`, `x`, `y`, `w`, `h`.
- No añadas dependencias.
- No inventes datos live. Widgets con datos pendientes deben ser previews honestas o catalog entries bloqueadas.
- No borres ni cambies `glassmorphism-pro` salvo que un test demuestre compatibilidad.
- No uses `git add .`.

TDD:
- Para cada microcorte con comportamiento, escribe tests RED primero, confirma que fallan, implementa, confirma GREEN.
- Tests deben verificar comportamiento observable, no solo clases internas.

Ejecucion:
- Haz MC-0 a MC-11 en orden.
- Si un microcorte necesita tocar mas de 5 archivos o cambiar arquitectura, detente y reporta.
- Si un widget no tiene datos reales suficientes, no lo implementes como runtime: catalogalo como DATA PARTIAL/PENDING.

Checks finales obligatorios:
- `pnpm --dir frontend test`
- `pnpm --dir frontend exec tsc -b`
- `pnpm --dir frontend lint`
- `pnpm --dir frontend build`
- `git diff --check -- frontend docs`

Autorevision final obligatoria:
1. Lista exacta de archivos tocados.
2. Confirmacion de que WidgetStudio no muta position.
3. Confirmacion de que LayoutStudio no fue rediseñado.
4. Confirmacion de widgets Free/Pro/Tester/Experimental y su data status.
5. Confirmacion de que Free ve previews Pro bloqueadas.
6. Confirmacion de variantes propias guardadas explicitamente.
7. Tests RED vistos y GREEN final.
8. Checks ejecutados y resultado.
9. Riesgos restantes.
10. Sin commit, tag, release ni Discord.
```

## Check final del plan

- [ ] Cada microcorte tiene acceptance criteria.
- [ ] Cada microcorte con comportamiento tiene TDD.
- [ ] Foundation va antes que UI.
- [ ] Widgets nuevos van despues de catalogo + renderer contract.
- [ ] No hay tarea que obligue a tocar backend.
- [ ] No hay tarea que mezcle WidgetStudio y LayoutStudio.
- [ ] No se requiere editar el HTML definitivo.

## Riesgos

| Riesgo | Impacto | Mitigacion |
|---|---:|---|
| Intentar implementar todos los widgets nuevos a la vez | Alto | Ejecutar widgets por grupos y detener si no hay datos reales. |
| Mezclar posicion con variantes | Alto | Tests que fallen si una variante contiene `position/x/y/w/h`. |
| Bloquear previews para usuarios Free | Medio | Tests de access: preview visible, apply bloqueado. |
| Re-theme global no deseado | Alto | Resolver tokens por widget/themeId, no tocar tokens globales salvo aprobacion. |
| HTML contiene mocks visuales | Medio | Usar HTML como referencia visual, no como fuente de datos runtime. |
| Duplicar catalogos de metricas | Medio | Crear allowlist general y filtros por widget. |

## Preguntas no bloqueantes

- IDs finales de widgets separados: `broadcast-tower`, `multiclass-relative`, `telemetry-blade`, `delta-simple`, `delta-bar`, `delta-advanced`, `pedals-v1`, `pedals-v2`, `pedals-v3`.
- Si `Race Schedule / Upcoming` debe entrar como overlay runtime en esta fase o quedar solo como preview Pro/Data Partial.
- Si `glassmorphism-pro` debe mantenerse indefinidamente o migrarse a legacy tras Vantare Crystal.
