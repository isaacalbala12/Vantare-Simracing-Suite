# Overlay Studio V3 — inventario de consumidores (2026-07-10)

Worktree: `refactor` @ inventario generado tras Fase 0 Task 0.5.  
Autoridad: ADR 0003 + plan maestro `2026-07-10-overlay-studio-rebuild-master.md`.

## Resumen

El legado mantiene **tres mapas de widgets** independientes, **dos rutas de telemetría** (Wails + SSE), **guardado de perfil acoplado a `layout:save`** y **diseños/presets duplicados** (galería oficial + presets Go). V3 concentra render en `WidgetVisualHost`, persistencia en perfil V3 y un único borrador de Studio.

---

## 1. Mapas de widgets duplicados

| Archivo | Contrato exportado | Consumidores | Clasificación | Reemplazo | Gate de borrado |
|---------|-------------------|--------------|---------------|-----------|-----------------|
| `frontend/src/overlay/CompositeApp.tsx` | `WIDGETS` local `Record<type, Component>` | Desktop overlay runtime | Retirement | `overlay/core` host + renderers V3 | Fase 8.7 — cero consumidores + cutover PASS |
| `frontend/src/overlay/ObsOverlayApp.tsx` | `WIDGETS` local duplicado | OBS Browser Source | Retirement | mismo host V3 vía endpoint OBS | Fase 8.7 |
| `frontend/src/overlay/shared-widget-map.ts` | `WIDGET_COMPONENTS` | `WidgetEditFrame.tsx`, tests | Retirement | Studio canvas frame V3 (Fase 4) | Fase 8.7 |
| `frontend/src/lib/widget-factory.ts` | `WIDGET_TYPES`, `createWidget` | `StudioWidgetList`, `WidgetList`, registry | Adapter → reemplazo | Catálogo derivado 4 widgets (Fase 5.6) | Fase 8.7 |
| `frontend/src/hub/overlays/widget-catalog.ts` | catálogo Studio + gates | `StudioWidgetList`, inspector | Adapter | catálogo V3 + access matrix (Fase 5) | Fase 8.7 |
| `frontend/src/hub/widgets/widget-design-gallery.ts` | `OFFICIAL_DESIGNS` | galería inspector, parity harness | Adapter | `official-designs.ts` V3 (Fase 5.7) | Fase 8.7 |

---

## 2. Host, preview y render legacy

| Archivo | Contrato | Consumidores | Clasificación | Reemplazo | Gate |
|---------|----------|--------------|---------------|-----------|------|
| `frontend/src/overlay/WidgetHost.tsx` | posición absoluta + children | CompositeApp, ObsOverlayApp | Adapter | `StudioWidgetFrame` / runtime frame V3 | Fase 7.3 |
| `frontend/src/overlay/WidgetEditFrame.tsx` | edición in-place desktop | EditOverlayApp (legacy) | Retirement | Studio único (ADR 0003) | Fase 8.7 |
| `frontend/src/hub/preview/WidgetRenderer.tsx` | preview Hub | PreviewPage, WidgetPreview | Retirement | `WidgetVisualHost` + harness | Fase 8.7B |
| `frontend/src/hub/preview/widget-preview-contract.ts` | contrato preview-only | WidgetRenderer | Retirement | ViewModel builders (Fase 2) | Fase 8.7B |
| `frontend/src/widget-parity-harness.tsx` | harness OFFICIAL_DESIGNS | scripts visuales legacy | Adapter | `overlay-harness/` V3 (Fase 2.7) | Fase 6.9 |
| `frontend/src/overlay/widgets/*.tsx` | renderers acoplados a telemetría | mapas WIDGETS | Frozen → retirement | `design-systems/vantare-*` (Fase 2–6) | Fase 8.7C |

---

## 3. Telemetría y transporte

| Archivo | Contrato | Consumidores | Clasificación | Reemplazo | Gate |
|---------|----------|--------------|---------------|-----------|------|
| `frontend/src/lib/telemetry-ref.ts` | `getTelemetryRef`, `applyTelemetryUpdate` | widgets live, App, tests | Reusable (adapter) | normalización en `telemetry-adapter.ts` (7.2A) | Mantener; no borrar |
| `frontend/src/overlay/widgets/mock-telemetry.ts` | `getMockTelemetry*` | widgets mock, Studio preview | Adapter | `createWidgetPreviewTelemetry` + mock adapter V3 | Fase 2.2 |
| `frontend/src/overlay/widgets/use-widget-telemetry.ts` | selector mock/live | Delta, Pedals, etc. | Adapter | `StudioTelemetryProvider` + rate coordinator | Fase 4.3A / 7.2 |
| `frontend/src/overlay/App.tsx` | `Events.On("telemetry:update")` | shell overlay | Adapter | Wails adapter V3 | Fase 7.2C |
| `frontend/src/overlay/CompositeApp.tsx` | `telemetry:update` | desktop widgets | Adapter | mismo pipeline unificado | Fase 7.2C |
| `frontend/src/overlay/ObsOverlayApp.tsx` | `EventSource("/telemetry/stream")` | OBS | Adapter | SSE adapter V3 | Fase 7.2D |
| `frontend/src/overlay/widgets/widget-preview-fixtures.ts` | fixtures canónicos + `CORE_TELEMETRY_STATES` | tests, harness V3 | **Reusable** | fuente determinista V3 | Mantener y extender |

---

## 4. Persistencia de perfil y eventos Wails/Go

| Archivo | Contrato | Consumidores | Clasificación | Reemplazo | Gate |
|---------|----------|--------------|---------------|-----------|------|
| `frontend/src/hub/overlays/useOverlayStudioState.ts` | draft local, `layout:save`, `profile:request` | Overlays Studio UI | Retirement | `hub/overlay-studio` store/comandos (Fase 3) | Fase 8.7A |
| `frontend/src/hub/pages/PreviewPage.tsx` | `layout:save`, `profile:loaded` | ruta preview legacy | Retirement | Browser View sobre perfil guardado (Fase 5.8) | Fase 8.7B |
| `internal/app/profile_service.go` | load/save JSON, `profile:loaded`, `layout:saved` | cmd/vantare, hub | Adapter | `studio_profile_service.go` V3 (Fase 1.6 / 7.5A) | Tras migración + tests |
| `internal/app/hub_service.go` | activación perfil + `profile:loaded` | Hub | Adapter | overlay controller V3 (7.5B) | Fase 7 |
| `pkg/config/profile.go` | schema V0/V2 | Go runtime | Adapter | `profile_v3*.go` (Fase 1) | Tras golden migration |
| `pkg/config/testdata/profile-v*-core-widgets.json` | fixtures migración | tests Go | **Reusable** | golden V3 | Mantener |

---

## 5. Diseños, presets y variantes

| Archivo | Contrato | Consumidores | Clasificación | Reemplazo | Gate |
|---------|----------|--------------|---------------|-----------|------|
| `frontend/src/hub/widgets/widget-design-gallery.ts` | `OFFICIAL_DESIGNS`, apply helpers | WidgetDesignGallery, SettingsPanel | Adapter | `official-designs.ts` + copy semantics (Fase 5.7) | Fase 8.7 |
| `frontend/src/lib/widget-presets.ts` | merge preset → widget | presets UI legacy | Retirement | user designs V3 | Fase 8.7 |
| `frontend/src/lib/widget-presets-store.ts` | `preset:*` Wails events | SettingsPanel | Retirement | `widget-design-client.ts` | Fase 5.7B |
| `internal/app/preset_service.go` | CRUD presets en disco | Wails events | Adapter | `widget_design_service.go` | Fase 1.7 |
| `frontend/src/lib/widget-variants.ts` | variant helpers | inspector legacy | Retirement | definiciones por tipo en `overlay/widget-types/` | Fase 8.7C |
| `frontend/src/hub/overlays/WidgetVariantManager.tsx` | variantes por widget | SettingsPanel | Retirement | secciones Design/Appearance V3 | Fase 5 |

---

## 6. Acceso premium y visibilidad

| Archivo | Contrato | Consumidores | Clasificación | Reemplazo | Gate |
|---------|----------|--------------|---------------|-----------|------|
| `frontend/src/hub/overlays/widget-catalog.ts` | `canAddWidget`, feature flags | catálogo Studio | Adapter | gates V3 (Fase 5.5) | Tests matrix PASS |
| `frontend/src/lib/access-policy.ts` | plan → features | Hub, license gate | **Reusable** | sin cambio de contrato V3 | Mantener |
| `frontend/src/hub/overlays/WidgetSettingsPanel.tsx` | secciones + `saveToWidget` draft local | inspector legacy | Retirement | inspector global V3 (Fase 5) | Fase 8.7A |
| (gap documentado) | conditional visibility UI vs runtime | Settings vs widgets | Bug legacy | `widget-visibility.ts` + BehaviorSection (5.4B) | Fase 5.4B / 7.3 |

---

## 7. Artefactos WidgetStudio / UI obsoleta

| Archivo / símbolo | Evidencia | Clasificación | Reemplazo | Gate |
|-------------------|-----------|---------------|-----------|------|
| `hub/overlays/StudioHome.tsx` `onOpenWidgetStudio` | CTA separado Widget vs Layout | Retirement | entrada directa perfil activo (Fase 7.9) | Fase 8.7A |
| i18n `studio.saveToWidget` | borrador por widget | Retirement | Save global Ctrl+S | Fase 8.1 |
| `hub/preview/*` | PreviewPage + WidgetPreview | Retirement | harness + Browser View | Fase 8.7B |
| `docs/.../layout-studio-subnav-redesign.md` | plan subnav v10 | **Superseded** | shell V3 Fase 4 | Solo referencia |

---

## 8. Registro de diseño / sistemas paralelos

| Archivo | Contrato | Clasificación | Reemplazo | Gate |
|---------|----------|---------------|-----------|------|
| `frontend/src/hub/registry/builtin-systems.ts` | sistemas builtin + WIDGET_TYPES | Adapter | manifests `vantare-original` / `vantare-crystal` | Fase 2.4 |
| `frontend/src/hub/registry/design-system.ts` | API registry Hub | Adapter | `overlay/core` design-system registry | Fase 2.4 |
| `frontend/src/overlay/widgets/widget-design-system.ts` | resolve crystal en widgets | Retirement | design-systems V3 | Fase 8.7C |
| `frontend/src/overlay/widgets/widget-appearance.ts` | apariencia por props | Adapter | appearance overrides V3 | Fase 5.4A |

---

## 9. Cobertura de búsquedas (read-only)

Comandos ejecutados (2026-07-10):

```text
rg WIDGETS|WIDGET_COMPONENTS|WIDGET_TYPES|OFFICIAL_DESIGNS|WidgetRenderer|WidgetHost frontend/src
rg layout:save|profile:loaded|profile:request|preset: frontend/src internal cmd
rg getTelemetryRef|useWidgetTelemetry|getMockTelemetry|EventSource|telemetry:update frontend/src
rg WidgetStudio|WidgetPreviewPanel|widget mode|saveToWidget frontend/src docs
```

Todos los archivos de producción citados en los resultados aparecen en las tablas anteriores.

---

## 10. Orden de migración recomendado (recordatorio)

1. Fase 1 — perfil V3 + servicios Go  
2. Fase 2 — plataforma widget + Delta + harness  
3. Fase 3 — draft/comandos  
4. Fase 4–5 — shell + inspector  
5. Fase 6 — tres widgets restantes  
6. Fase 7 — cutover Desktop/OBS  
7. Fase 8 — i18n, calidad, retirement audit