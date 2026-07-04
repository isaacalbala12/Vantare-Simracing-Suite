# WIDGET-STUDIO-04 — Editable slots, columns y column groups

## Objetivo

Convertir la foundation de `WIDGET-STUDIO-03` en una edicion real y segura de `slots`, `columns` y `columnGroups` dentro de `WidgetStudio`, manteniendo intacta la frontera con `LayoutStudio`.

Este plan esta pensado para ejecutarse con Mimo v2.5 en microcortes consecutivos y revisarse al final, como se hizo con Calendar. No requiere ir microcorte por microcorte con revision humana.

## Skills obligatorias para el worker

- `vantare-core`
- `planning-and-task-breakdown`
- `test-driven-development`
- `frontend-ui-engineering`
- `frontend-design-deslop`
- `accessibility`
- `code-review-and-quality`

## Fuentes obligatorias

Leer antes de editar:

- `AGENTS.md`
- `docs/current-plan.md`
- `docs/widget-architecture.md`
- `docs/widget-rendering-preview-contract.md`
- `docs/beta-widget-system-spec.md`
- `docs/product-widget-customization.md`
- `docs/overlay-vantare-crystal-widgets.html`
- `docs/superpowers/plans/2026-07-04-widget-studio-03-vantare-crystal-slots.md`
- `frontend/src/lib/profile.ts`
- `frontend/src/hub/overlays/widget-config-model.ts`
- `frontend/src/hub/overlays/widget-catalog.ts`
- `frontend/src/hub/overlays/WidgetConfigSections.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/overlays/WidgetStudio.tsx`
- `frontend/src/hub/overlays/WidgetVariantManager.tsx`
- `frontend/src/hub/overlays/WidgetSandboxPreview.tsx`
- `frontend/src/hub/preview/WidgetRenderer.tsx`

## Decisiones cerradas

- La UI editable debe ser generica para soportar widgets futuros.
- `WidgetStudio` edita configuracion interna del widget.
- `LayoutStudio` sigue siendo el unico propietario de `position`, `x`, `y`, `w`, `h`.
- No se implementa reordenacion de slots/columns en esta fase.
- `column.width` se edita con presets primero, no con numeros libres.
- Usuarios sin acceso ven preview pero controles disabled.
- La edicion usa draft local y guardado explicito.
- Debe existir guardado de variante reusable y tambien guardado sobre el widget actual.
- Las variantes custom son por `widget.type`.
- `BroadcastTower` y `MulticlassRelative` se mantienen `runtimeReady:false` hasta validacion real.
- Mimo debe ejecutar el plan completo y dejarlo listo para review final.

## No objetivos

- No redisenar `LayoutStudio`.
- No tocar backend Go.
- No anadir dependencias.
- No implementar drag/drop.
- No implementar widgets nuevos adicionales.
- No usar datos fake runtime.
- No autosave.
- No convertir `WidgetRenderer` en gate de runtime; el gate runtime sigue en `CompositeApp` y `ObsOverlayApp`.

## Arquitectura esperada

### Draft local

`WidgetSettingsPanel` o un hook dedicado debe mantener un draft local de la configuracion interna editable.

Flujo:

1. Cargar configuracion efectiva del widget:
   - variant aplicada,
   - `widget.props.variant`,
   - defaults por `widget.type` + `themeId`.
2. Editar draft local.
3. Marcar estado dirty.
4. Preview refleja draft.
5. El usuario elige:
   - guardar en widget actual,
   - guardar como variante reusable,
   - aplicar variante existente,
   - descartar cambios.

### Fuente de verdad

- `WidgetConfig.position` no se toca.
- `WidgetVariantConfig` puede contener `slots`, `columns`, `columnGroups`, `filters`, `formats`, `props`, `themeId`, `templateId`, `name`.
- `WidgetVariantConfig` no puede contener `position`, `x`, `y`, `w`, `h`.
- La configuracion actual de un widget puede vivir en `widget.props.variant` o equivalente existente, sin duplicar schema si no hace falta.

### Modelos editables

Slots:

- `enabled`
- `metricId`
- `label`
- `format`
- `accent`/estilo interno si el modelo actual lo permite
- `visibility` si existe en los documentos

Columns:

- `enabled`
- `metricId`
- `label`
- `format`
- `widthPreset`: `xs`, `sm`, `md`, `lg`, `auto`
- `align` si ya existe o es trivial

ColumnGroups:

- `enabled`
- `label`
- columnas internas del grupo
- estado agregado del grupo

## Microcortes

### MC-0 — Auditoria post WIDGET-STUDIO-03

**Descripcion:** Confirmar el estado real despues del commit anterior y acotar archivos antes de editar.

**Acceptance criteria:**

- [ ] `git status --short` revisado y cambios ajenos identificados.
- [ ] Confirmado que `WidgetConfigSections` esta read-only foundation.
- [ ] Confirmado que `WidgetVariantManager` bloquea acciones cuando `canApply=false`.
- [ ] Confirmado que `CompositeApp` y `ObsOverlayApp` filtran `runtimeReady:false`.

**Verification:**

- [ ] `pnpm --dir frontend test -- WidgetConfigSections WidgetVariantManager WidgetSettingsPanel CompositeApp ObsOverlayApp`

**Dependencies:** None.

**Files likely touched:** Ninguno, salvo nota final en docs si procede.

**Estimated scope:** XS.

### MC-1 — Helpers puros de edicion interna

**Descripcion:** Crear helpers puros para editar slots, columns y columnGroups sin React y sin tocar layout externo.

**Acceptance criteria:**

- [ ] `toggleSlotEnabled` cambia solo `slots`.
- [ ] `updateSlotConfig` permite editar metric/label/format/accent permitido.
- [ ] `toggleColumnEnabled` cambia solo `columns`.
- [ ] `updateColumnConfig` permite editar metric/label/format/widthPreset/align permitido.
- [ ] `toggleColumnGroupEnabled` cambia solo `columnGroups`.
- [ ] Helpers no mutan input.
- [ ] Helpers no devuelven `position`, `x`, `y`, `w`, `h`.
- [ ] IDs desconocidos no rompen el perfil.

**Verification:**

- [ ] Tests RED primero en `widget-config-model.test.ts`.
- [ ] `pnpm --dir frontend test -- widget-config-model`
- [ ] `pnpm --dir frontend exec tsc -b`

**Dependencies:** MC-0.

**Files likely touched:**

- `frontend/src/hub/overlays/widget-config-model.ts`
- `frontend/src/hub/overlays/widget-config-model.test.ts`

**Estimated scope:** M.

### MC-2 — Draft local y resolucion de config efectiva

**Descripcion:** Introducir una capa para resolver y editar la configuracion efectiva sin persistir automaticamente.

**Acceptance criteria:**

- [ ] `resolveEffectiveWidgetVariant(widget, profile)` devuelve config efectiva estable.
- [ ] Si el widget tiene `variantId`, usa la variante.
- [ ] Si no hay variante, usa `widget.props.variant` o defaults.
- [ ] El draft local puede divergir sin persistir.
- [ ] Descartar cambios restaura la config efectiva.
- [ ] No se toca `position`.

**Verification:**

- [ ] Tests RED primero.
- [ ] `pnpm --dir frontend test -- widget-config-model WidgetSettingsPanel`
- [ ] `pnpm --dir frontend exec tsc -b`

**Dependencies:** MC-1.

**Files likely touched:**

- `frontend/src/hub/overlays/widget-config-model.ts`
- `frontend/src/hub/overlays/widget-config-model.test.ts`
- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx`

**Estimated scope:** M.

### MC-3 — Editor real de Slots

**Descripcion:** Convertir la seccion Slots de `WidgetConfigSections` en controles reales.

**Acceptance criteria:**

- [ ] Cada slot tiene toggle enabled/disabled.
- [ ] Cada slot tiene selector de metrica compatible.
- [ ] Cada slot permite editar label/formato cuando aplique.
- [ ] Controles disabled si `canApply=false`.
- [ ] Cambios actualizan draft local y preview.
- [ ] No hay drag/drop.
- [ ] No se toca `position`.

**Verification:**

- [ ] Tests RED primero en `WidgetConfigSections.test.tsx` y/o `WidgetSettingsPanel.test.tsx`.
- [ ] Test Free + Pro: controles disabled.
- [ ] Test Paid: togglear slot llama `onDraftChange`.
- [ ] Test selector solo muestra metricas compatibles.
- [ ] `pnpm --dir frontend test -- WidgetConfigSections WidgetSettingsPanel`

**Dependencies:** MC-2.

**Files likely touched:**

- `frontend/src/hub/overlays/WidgetConfigSections.tsx`
- `frontend/src/hub/overlays/WidgetConfigSections.test.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx`

**Estimated scope:** M.

### MC-4 — Editor real de Columns con width presets

**Descripcion:** Convertir la seccion Columns en editor real para widgets tabulares.

**Acceptance criteria:**

- [ ] Cada columna tiene toggle enabled/disabled.
- [ ] Cada columna permite cambiar metrica compatible.
- [ ] Cada columna permite cambiar `widthPreset`: `xs`, `sm`, `md`, `lg`, `auto`.
- [ ] No hay width numerico libre en esta fase.
- [ ] Cambiar widthPreset modifica ancho interno, no `position.w`.
- [ ] Controles disabled si `canApply=false`.
- [ ] No hay reordenacion.

**Verification:**

- [ ] Tests RED primero.
- [ ] Standings puede desactivar una columna.
- [ ] Relative puede cambiar metrica compatible.
- [ ] Width preset no toca `position`.
- [ ] `pnpm --dir frontend test -- WidgetConfigSections WidgetSettingsPanel StandingsWidget RelativeWidget`

**Dependencies:** MC-3.

**Files likely touched:**

- `frontend/src/hub/overlays/WidgetConfigSections.tsx`
- `frontend/src/hub/overlays/WidgetConfigSections.test.tsx`
- `frontend/src/overlay/widgets/StandingsWidget.tsx`
- `frontend/src/overlay/widgets/StandingsWidget.test.tsx`
- `frontend/src/overlay/widgets/RelativeWidget.tsx`
- `frontend/src/overlay/widgets/RelativeWidget.test.tsx`

**Estimated scope:** M.

### MC-5 — Editor real de Column Groups

**Descripcion:** Habilitar edicion minima de grupos sin crear complejidad de drag/drop.

**Acceptance criteria:**

- [ ] Cada group tiene toggle enabled/disabled.
- [ ] El estado de grupo afecta a sus columnas en preview/config.
- [ ] Si no hay widget mixed runtime-ready, se prueba con fixture de config model.
- [ ] Controles disabled si `canApply=false`.
- [ ] No se toca `position`.

**Verification:**

- [ ] Tests RED primero.
- [ ] `pnpm --dir frontend test -- WidgetConfigSections widget-config-model`

**Dependencies:** MC-4.

**Files likely touched:**

- `frontend/src/hub/overlays/WidgetConfigSections.tsx`
- `frontend/src/hub/overlays/WidgetConfigSections.test.tsx`
- `frontend/src/hub/overlays/widget-config-model.ts`
- `frontend/src/hub/overlays/widget-config-model.test.ts`

**Estimated scope:** S.

### MC-6 — Guardar en widget actual

**Descripcion:** Permitir guardar el draft en el widget actual sin crear variante reusable.

**Acceptance criteria:**

- [ ] Boton `Guardar en widget` o equivalente visible cuando hay draft dirty.
- [ ] Guardar actualiza solo config interna del widget.
- [ ] Guardar no crea entrada en `profile.variants`.
- [ ] Guardar no toca `position`.
- [ ] Free + Pro no puede guardar.
- [ ] Paid/Tester si puede segun acceso.

**Verification:**

- [ ] Tests RED primero.
- [ ] `pnpm --dir frontend test -- WidgetSettingsPanel WidgetStudio WidgetVariantManager`

**Dependencies:** MC-2, MC-3, MC-4.

**Files likely touched:**

- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx`
- `frontend/src/hub/overlays/WidgetStudio.tsx`
- `frontend/src/hub/overlays/WidgetStudio.test.tsx`

**Estimated scope:** M.

### MC-7 — Guardar como variante reusable

**Descripcion:** Integrar draft editable con `WidgetVariantManager` para guardar variantes propias por `widget.type`.

**Acceptance criteria:**

- [ ] `Save as Variant` usa el draft actual.
- [ ] Variante custom queda asociada a `widget.type`.
- [ ] Variante no contiene `position`, `x`, `y`, `w`, `h`.
- [ ] Aplicar variante conserva `position`.
- [ ] Free + Pro no puede guardar/aplicar/borrar.
- [ ] Paid/Tester si puede cuando corresponde.

**Verification:**

- [ ] Tests RED primero.
- [ ] `pnpm --dir frontend test -- WidgetVariantManager WidgetSettingsPanel WidgetStudio`

**Dependencies:** MC-6.

**Files likely touched:**

- `frontend/src/hub/overlays/WidgetVariantManager.tsx`
- `frontend/src/hub/overlays/WidgetVariantManager.test.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.test.tsx`

**Estimated scope:** M.

### MC-8 — Runtime consume slots/columns reales

**Descripcion:** Hacer que los widgets existentes seguros lean la config editable.

**Acceptance criteria:**

- [ ] Standings respeta columnas disabled/metric/widthPreset.
- [ ] Relative respeta columnas disabled/metric/widthPreset.
- [ ] Delta respeta slots enabled/metric/label/formato cuando aplique.
- [ ] Pedals respeta slots enabled/metric/label/formato cuando aplique.
- [ ] Sin config explicita, el comportamiento previo se mantiene.
- [ ] No se introducen datos fake.

**Verification:**

- [ ] Tests RED primero por widget.
- [ ] `pnpm --dir frontend test -- StandingsWidget RelativeWidget DeltaWidget PedalsWidget WidgetRenderer`

**Dependencies:** MC-3, MC-4, MC-6.

**Files likely touched:**

- `frontend/src/overlay/widgets/StandingsWidget.tsx`
- `frontend/src/overlay/widgets/StandingsWidget.test.tsx`
- `frontend/src/overlay/widgets/RelativeWidget.tsx`
- `frontend/src/overlay/widgets/RelativeWidget.test.tsx`
- `frontend/src/overlay/widgets/DeltaWidget.tsx`
- `frontend/src/overlay/widgets/DeltaWidget.test.tsx`
- `frontend/src/overlay/widgets/PedalsWidget.tsx`
- `frontend/src/overlay/widgets/PedalsWidget.test.tsx`

**Estimated scope:** L, dividir internamente por widget si se infla.

### MC-9 — Visual polish del editor

**Descripcion:** Ajustar la UI editable para que sea clara, densa y cercana al HTML Vantare Crystal sin re-theme global.

**Acceptance criteria:**

- [ ] Secciones editables legibles en 1440px.
- [ ] Estado dirty visible.
- [ ] Estado locked visible.
- [ ] Disabled controls son claros.
- [ ] No hay controles de layout.
- [ ] No se depende solo de color para estados.
- [ ] No se introducen clases/test frágiles innecesarias.

**Verification:**

- [ ] `pnpm --dir frontend test -- WidgetConfigSections WidgetSettingsPanel WidgetStudio`
- [ ] `pnpm --dir frontend exec tsc -b`
- [ ] Screenshot manual o visual harness si ya existe y funciona.

**Dependencies:** MC-8.

**Files likely touched:**

- `frontend/src/hub/overlays/WidgetConfigSections.tsx`
- `frontend/src/hub/overlays/WidgetSettingsPanel.tsx`
- `frontend/src/hub/overlays/WidgetStudio.tsx`

**Estimated scope:** S.

### MC-10 — Documentacion y worker checklist

**Descripcion:** Documentar como añadir nuevos slots/columns y como evitar romper LayoutStudio.

**Acceptance criteria:**

- [ ] `docs/widget-architecture.md` actualizado si cambia contrato.
- [ ] `docs/current-plan.md` actualizado con WIDGET-STUDIO-04.
- [ ] Plan/autorevision indica que LayoutStudio no se toco.
- [ ] Checklist de nuevo widget editable documentado.

**Verification:**

- [ ] `git diff --check -- docs`

**Dependencies:** MC-9.

**Files likely touched:**

- `docs/widget-architecture.md`
- `docs/current-plan.md`
- este plan si hace falta ajustar alcance

**Estimated scope:** S.

## Checkpoints

### Checkpoint Foundation — despues de MC-2

- [ ] Helpers puros con tests.
- [ ] Draft local definido.
- [ ] Ningun cambio visual grande.
- [ ] `tsc -b` limpio.

### Checkpoint Editor — despues de MC-5

- [ ] Slots editables.
- [ ] Columns editables con presets.
- [ ] ColumnGroups editables.
- [ ] Controles disabled para Free + Pro.
- [ ] No se toca `position`.

### Checkpoint Persistence — despues de MC-7

- [ ] Guardar en widget actual.
- [ ] Guardar como variante.
- [ ] Aplicar variante.
- [ ] Descartar cambios.
- [ ] Sin autosave.

### Checkpoint Runtime — despues de MC-8

- [ ] Standings/Relative/Delta/Pedals consumen config real.
- [ ] Fallback antiguo intacto.
- [ ] No fake data.

## Checks finales obligatorios

```powershell
pnpm --dir frontend test -- WidgetConfigSections WidgetSettingsPanel WidgetVariantManager WidgetStudio widget-config-model
pnpm --dir frontend test -- StandingsWidget RelativeWidget DeltaWidget PedalsWidget WidgetRenderer
pnpm --dir frontend test
pnpm --dir frontend exec tsc -b
pnpm --dir frontend lint
pnpm --dir frontend build
git diff --check -- frontend docs
```

## Autorevision final obligatoria

1. Lista exacta de archivos tocados.
2. Microcortes completados.
3. Tests RED vistos y GREEN final.
4. Confirmacion de que `WidgetStudio` no muta `position`.
5. Confirmacion de que `LayoutStudio` no fue redisenado.
6. Confirmacion de que no hay autosave.
7. Confirmacion de que Free + Pro ve controles disabled.
8. Confirmacion de que Paid/Tester puede editar cuando corresponde.
9. Confirmacion de que guardar en widget actual no crea variante.
10. Confirmacion de que guardar como variante no incluye `position/x/y/w/h`.
11. Confirmacion de que runtime respeta slots/columns en widgets existentes.
12. Checks ejecutados y resultado.
13. Riesgos restantes.
14. Archivos seguros para commit.
15. Archivos que NO deben incluirse.
16. Sin commit, sin tag, sin release, sin Discord.

## Prompt de ejecucion para Mimo v2.5

```text
Usa las skills: vantare-core, planning-and-task-breakdown, test-driven-development, frontend-ui-engineering, frontend-design-deslop, accessibility, code-review-and-quality.

Ejecuta completo el plan `docs/superpowers/plans/2026-07-05-widget-studio-04-editable-slots-columns.md`, de MC-0 a MC-10, sin hacer commit/tag/release.

Reglas:
- Lee `AGENTS.md`, `docs/current-plan.md`, `docs/widget-architecture.md`, `docs/widget-rendering-preview-contract.md`, `docs/beta-widget-system-spec.md`, `docs/product-widget-customization.md`, `docs/overlay-vantare-crystal-widgets.html` y el plan antes de editar.
- TDD obligatorio: tests RED antes de cada comportamiento nuevo.
- No toques backend Go.
- No redisenes LayoutStudio.
- No anadas dependencias.
- No implementes drag/drop.
- No implementes reordenacion.
- No uses datos fake runtime.
- No autosave.
- WidgetStudio no puede mutar `position`, `x`, `y`, `w`, `h`.
- Las variantes no pueden guardar `position`, `x`, `y`, `w`, `h`.
- Free + Pro: preview visible, controles disabled.
- Paid/Tester: edicion permitida segun access.
- BroadcastTower y MulticlassRelative siguen `runtimeReady:false` hasta validacion real.

Implementa todos los microcortes y revisa al final.

Checks finales obligatorios:
- `pnpm --dir frontend test -- WidgetConfigSections WidgetSettingsPanel WidgetVariantManager WidgetStudio widget-config-model`
- `pnpm --dir frontend test -- StandingsWidget RelativeWidget DeltaWidget PedalsWidget WidgetRenderer`
- `pnpm --dir frontend test`
- `pnpm --dir frontend exec tsc -b`
- `pnpm --dir frontend lint`
- `pnpm --dir frontend build`
- `git diff --check -- frontend docs`

Autorevision final:
Incluye los 16 puntos del plan. No hagas commit, tag, release ni Discord.
```

## Riesgos

| Riesgo | Impacto | Mitigacion |
|---|---:|---|
| Mezclar layout externo con config interna | Alto | Tests que fallen si cambia `position`. |
| Editor generico demasiado grande | Alto | Microcortes por slots/columns/groups. |
| Tests de UI fragiles | Medio | Probar comportamiento observable, no clases Tailwind. |
| Draft local duplicando estado raro | Medio | Helper puro de resolucion + tests de discard/save. |
| Runtime rompe fallback antiguo | Alto | Tests por widget con config vacia. |
| Access bypass | Alto | Tests Free/Paid/Tester sobre handlers reales. |

## Open questions

No hay preguntas bloqueantes. Las decisiones de producto quedan fijadas en este plan:

- UI editable generica.
- Slot edita todo lo documentado.
- Sin reordenacion.
- Width presets primero.
- Free + Pro con controles disabled.
- Draft local.
- Guardar en widget actual y guardar variante reusable.
- Variantes por widget type.
- Broadcast/Multiclass siguen no runtime-ready.
- Mimo ejecuta todo y se revisa al final.
