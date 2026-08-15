# Spec: Overlay edit mode in-place por hotkey (Fase 1 — layout)

**Fecha:** 2026-08-16
**Estado:** DRAFT para ejecución TDD (SDD Phase 1)
**Rama:** `vantareapp/overlay-inplace-edit-hotkey`
**Base:** `origin/nightly@2d5ec944`

## 1. Objetivo

Que el usuario pulse una hotkey global (`Ctrl+Shift+E`, default ya existente
`toggleEditMode`) y el overlay desktop **actualmente abierto** entre en un modo
de edición in-place de **layout** (seleccionar, mover, redimensionar con snap y
guardar), sin pasar por la preview del Hub. Al pulsarla de nuevo, vuelve al
runtime normal (racing).

**In scope (Fase 1):**

- Toggle por hotkey entre `ModeRacing` (passthrough ON, read-only) y `ModeEdit`
  (passthrough OFF, editable) sobre el overlay abierto.
- Si el overlay no está abierto, la hotkey lo abre y entra directamente en edit
  mode (comportamiento histórico de junio, opción B).
- En edit mode: frames con chrome de selección, drag (move), resize con handles
  según `capabilities.resizeMode` (E/W para horizontal-only, 8 handles para el
  resto), snap a grid/edges con `Alt` para desactivarlo, Escape cancela el
  gesto, commit de un único comando `widget/layout` al soltar.
- Guardado del layout editado con autosave al soltar mediante el canal canónico
  V3 (`studio:profile:save` con revisión optimista), SIN recrear la ventana.
- Indicador visual discreto `EDIT MODE` + hint de salida.
- Refuerzo anti-regresión: preview imperativa del DOM durante el gesto (nunca
  pasar posición transitoria por React state), congelación del snapshot de
  telemetría durante el gesto, y reset del modo a `ModeRacing` al abrir/cerrar
  el overlay.

**Out of scope (Fase 1):** inspector de contenido/apariencia/comportamiento
(Fase 2), delete/duplicate/center/z-order por UI, undo/redo, guías visuales
multi-widget, teclado de canvas, rebinding de `toggleEditMode` desde Ajustes
(backend ya lo soporta; falta `HOTKEY_KEYS`), OBS streaming (sin ventana
desktop no hay edit), multi-selección, LayoutStudio, schema, telemetría,
renderers.

## 2. Contexto técnico (inventario verificado)

| Pieza | Estado | Detalle |
|---|---|---|
| `HotkeyManager` + default `toggleEditMode=ctrl+shift+e` | Existe | `internal/app/hotkeys.go`; `settings_service.go:205,617`; falta exposición en UI |
| `Manager.ApplyProfileV3` | Existe | `internal/window/manager_v3.go:6-34`: `ModeEdit` → `SetIgnoreMouseEvents(false)`, resizable, fullscreen |
| `LayoutOriginV3` | Existe | `manager_v3.go:37-45`: racing/edit → `{0,0}`; streaming → shrink-wrap |
| `OverlayWindow.ApplyProfileMode` | Existe | `cmd/vantare/main.go:2893-2899` aplica el modo a la ventana real |
| `StudioProfileService.SetDisplayMode` | Existe | `studio_profile_runtime.go:52-61` |
| `EmitRuntimeLoaded` con `windowMode` | Existe | `studio_profile_runtime.go:72-86` |
| `resetOverlayDisplayMode` / `resetOverlayProfileDisplayMode` | Existe | `main.go:3042-3074` |
| `StudioProfileService.Save` (revisión optimista) | Existe | `studio_profile_service.go:60-100`; dispara `onSaved` → `refreshActiveOverlayAfterSave` que **recrea la ventana** |
| `WidgetVisualHost` renderMode desktop | Existe | Frontera única; `CompositeApp` ya recibe documento + telemetría live |
| Funciones puras de geometría | Existen | `hub/overlay-studio/canvas/`: `applyMovePreview`, `applyResizePreview`, `clientToLogical`, `clampRecoverableLayout`, `snapWidgetLayout`, `resizeWidgetLayout`, `widgetTypeRegistry` capabilities |
| `canvas-frame-preview.ts` | Existe | Preview imperativa para Studio (testids `studio-widget-frame-*`); patrón obligatorio |
| Test de regresión actual | Existe | `CompositeApp.test.tsx:246` "does not mount edit chrome" — **se sustituye** por el guard opuesto |
| `studio:profile:save` payload | Existe | `{requestId, expectedRevision, document}`; respuestas `studio:profile:saved|conflict|error` |
| Documento V3 | Existe | `overlay/core/profile-document.ts`; `widget/layout` command en `studio-command.ts` |

## 3. Arquitectura propuesta

### 3.1 Backend (Go)

**`cmd/vantare/main.go`:**

1. Nueva función `handleToggleEditMode(hubSvc, studioProfileSvc, overlayController, overlayRunning, emitter)`:
   - Si `!overlayRunning.Load()` → `hubSvc.StartActiveOverlay()`; si `!newStatus.Running` (streaming, sin ventana) → no-op y return.
   - Lee el documento activo; determina target: `ModeEdit` si actual es racing/otro, `ModeRacing` si actual es `ModeEdit`.
   - `studioProfileSvc.SetDisplayMode(target)` (muta doc + `ApplyProfileV3`).
   - `overlayController.CurrentWindow().ApplyProfileMode(doc)` (aplica modo real a la ventana).
   - `studioProfileSvc.EmitRuntimeLoaded()` (envía `windowMode` nuevo).
   - `emitter.Emit("overlay:edit-mode-changed", {mode: target})`.
   - Errores: log + `overlayRunning.Store(false)` si el arranque falló.
2. `buildHotkeyActionMap["toggleEditMode"]` → llamar `handleToggleEditMode(...)` (en vez de `handleOpenOverlayStudio`).
3. Handler `overlay:toggle-edit-mode` → mismo `handleToggleEditMode(...)`.
4. `handleOpenOverlayStudio` se conserva (usado por el botón del Hub).

**`internal/app/studio_profile_service.go`:**

5. Nuevo método `SaveInPlace(requestID, expectedRevision string, doc *config.ProfileDocumentV3) error`:
   - Misma lógica que `Save` (persistir con `store.Save`, revisión optimista, emitir `studio:profile:saved` con el requestId) pero **NO** invoca `onSaved` → no se recrea la ventana del overlay.
   - Factor común con `Save` (helper privado para no duplicar).
6. Nuevo listener `overlay:edit-layout:save` en `RegisterHandlers` → `HandleSaveInPlace` (decodifica con el mismo `decodeStudioProfileSavePayload`, llama `SaveInPlace`).

**Tests Go:**

- `TestHandleToggleEditModeEntersEditModeOnRunningOverlay`
- `TestHandleToggleEditModeExitsToRacing`
- `TestHandleToggleEditModeOpensOverlayWhenNotRunning`
- `TestHandleToggleEditModeNoopWhenNoDesktopWindow` (streaming)
- `TestHandleToggleEditModeStoresRunningOnStartFailure`
- `TestBuildHotkeyActionMapToggleEditModeUsesHandleToggleEditMode`
- `TestStudioProfileServiceSaveInPlacePersistsWithoutOnSaved` (y respeta conflicto/revisión)
- `TestStudioProfileServiceSaveInPlaceEmitsSavedWithRequestID`

### 3.2 Frontend (TypeScript/React)

**`frontend/src/overlay/CompositeApp.tsx`:**

- Estado `editMode: boolean` (default false).
- Se actualiza desde `windowMode === "edit"` en `overlay:profile-v3-loaded` y desde `overlay:edit-mode-changed` (`{mode}`).
- Render:
  - `editMode=false` → `DesktopOverlayRuntime key={revision}` (comportamiento actual intacto).
  - `editMode=true` → `<InPlaceEditOverlay document={document} revision={revision} layoutOrigin={layoutOrigin} telemetry={coordinator} engineerPresentations={...} />` (sin `key={revision}`: la sesión de edición no debe remontarse al guardar).
- Escucha `studio:profile:saved` para actualizar `revision` local sin remount (solo cuando el requestId proviene del edit overlay).

**Nuevo `frontend/src/overlay/edit/InPlaceEditOverlay.tsx`:**

- Mide el viewport de salida con ResizeObserver (patrón de `RuntimeOverlaySurface`) y aplica la misma transformación `contain` (`resolveLayoutViewportTransform`).
- Renderiza la escena lógica con todos los widgets del layout activo (`resolveRuntimeLayout`), cada uno en un `InPlaceWidgetEditFrame`.
- Gestiona `selectedWidgetId` y la interacción mediante `useInplaceInteraction`.
- Snapshot de telemetría congelado durante el gesto (patrón `isCanvasInteracting` de StudioCanvas).
- Autosave: al soltar un gesto válido, `Events.Emit("overlay:edit-layout:save", {requestId, expectedRevision, document})`.
- Chip `EDIT MODE` (top-left) + hint salida (bottom-left), i18n.
- Escucha `studio:profile:saved|conflict|error` con su requestId: `saved` → actualiza revisión local; `conflict`/`error` → estado visible discreto.

**Nuevo `frontend/src/overlay/edit/use-inplace-interaction.ts`:**

- Reutiliza las funciones puras existentes del Studio:
  - `clientToLogical` (canvas-geometry)
  - `applyMovePreview` / `applyResizePreview` (useCanvasInteraction)
  - `clampRecoverableLayout`, `snapWidgetLayout`, `resizeWidgetLayout` (canvas-geometry/canvas-resize/canvas-snap)
  - `widgetTypeRegistry` capabilities (resizeMode, minimumSize, supportsAspectUnlock)
- Contrato obligatorio (canvas-drag-imperative-preview.md): durante el gesto, geometría SOLO por DOM imperativo (nunca props/state de posición); `resolveLayout` siempre devuelve `widget.layout` del documento; commit único `widget/layout` en pointerup; Escape/lostpointercapture restaura.

**Nuevo `frontend/src/overlay/edit/inplace-frame-preview.ts`:**

- Copia acotada del patrón `canvas-frame-preview.ts` con testids propios (`inplace-edit-frame-<id>`, `inplace-edit-viewport-<id>`). NO reutiliza el módulo del Studio (sus testids y registros están acoplados al canvas del Hub y su CSS `osv3-*`); el patrón es el contrato, no el archivo.

**Nuevo `frontend/src/overlay/edit/InPlaceWidgetEditFrame.tsx`:**

- Frame absoluto con `WidgetVisualViewport` + `WidgetVisualHost renderMode="desktop"` (ViewModel runtime con datos live — NO `studio`), chrome de selección, handles de resize según `capabilities.resizeMode` (E/W si horizontal-only; 8 handles si no), badge para widgets `!behavior.enabled`, `previewActive` para el gesto.

**i18n (`en/es/it/pt`):** claves `overlay.editMode.chip`, `overlay.editMode.hint`, `overlay.editMode.saveError`.

**Tests frontend:**

- `CompositeApp.test.tsx`: sustituir el test 246 por el guard opuesto; tests de entrada/salida de edit mode por evento y por `windowMode`; no remount al guardar (el componente de edición permanece montado tras `studio:profile:saved`).
- `use-inplace-interaction.test.ts`: gestos move/resize (preview imperativa, commit único, cancel, snap, clamp).
- `inplace-frame-preview.test.ts`: helpers DOM (apply/reset/find por testid propio).
- `InPlaceEditOverlay.test.tsx`: render escena, selección, autosave emite `overlay:edit-layout:save`, congelación de snapshot durante gesto.

## 4. Commands

```powershell
# Checks Go (desde el worktree, subdir vantare-v2)
go test ./internal/app/... ./internal/window/...
go test ./cmd/vantare/...
go test ./...
gofmt -l internal/ cmd/

# Checks frontend (desde el worktree, subdir vantare-v2)
pnpm --dir frontend test -- src/overlay/CompositeApp.test.tsx
pnpm --dir frontend test -- src/overlay/edit
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint -- src/overlay/edit src/overlay/CompositeApp.tsx

git diff --check
```

## 5. Estructura del proyecto

```
cmd/vantare/main.go                          → hotkey action + handler toggle edit
cmd/vantare/main_test.go                     → tests del handler
internal/app/studio_profile_service.go       → SaveInPlace + HandleSaveInPlace (+ helper común)
internal/app/studio_profile_service_test.go  → tests SaveInPlace
frontend/src/overlay/CompositeApp.tsx        → estado editMode + render condicional
frontend/src/overlay/CompositeApp.test.tsx   → guard opuesto + nuevos tests
frontend/src/overlay/edit/InPlaceEditOverlay.tsx          → orquestación edit overlay
frontend/src/overlay/edit/InPlaceWidgetEditFrame.tsx      → frame editable
frontend/src/overlay/edit/use-inplace-interaction.ts      → gestos (imperativo)
frontend/src/overlay/edit/inplace-frame-preview.ts        → helpers DOM
frontend/src/overlay/edit/*.test.{ts,tsx}                 → tests
frontend/src/i18n/locales/{en,es,it,pt}.ts                → claves edit mode
docs/superpowers/specs/2026-08-16-overlay-inplace-edit-hotkey-design.md  → esta spec
docs/superpowers/plans/2026-08-16-overlay-inplace-edit-hotkey.md          → plan (Phase 2)
docs/current-plan.md                         → nota de estado
docs/vantare-program/handoffs/overlays-launcher-hub.md → handoff vivo
```

## 6. Estilo de código

- Go: `gofmt`; errores envueltos con `%w`; sin `panic`; tests table-driven; sin `_` para ignorar errores.
- TS/React: TypeScript estricto; lógica de interacción fuera de componentes (hooks + helpers puros); memo con comparador fino en frames; sin estado global mutable; nunca `setState` de posición durante el gesto (ver §3.2).
- Frontend reutiliza las funciones puras del Studio por import directo; no duplica cálculos de geometría.

## 7. Estrategia de testing

- TDD: RED primero (tests del contrato), luego implementación mínima, luego refactor seguro.
- Nivel unitario para funciones puras (interacción, preview imperativa, SaveInPlace).
- Nivel integración ligera para `CompositeApp` (eventos Wails simulados, patrón existente del test) y `InPlaceEditOverlay`.
- Go: `go test ./...` completo al cierre.
- Frontend: suite completa + build + lint focal.
- No se ejecuta harness visual Playwright en este corte (ver riesgos).

## 8. Boundaries

- **Always:** leer AGENTS.md y handoff; verificar rama/worktree/base; TDD; ejecutar checks; actualizar handoff/current-plan; `git diff --check`.
- **Ask first:** tocar schema/persistencia fuera de `SaveInPlace`; añadir dependencias; cambiar CI; tocar `WidgetVisualHost` o renderers.
- **Never:** recrear la ventana del overlay al guardar desde edit mode; pasar geometría transitoria por React state; renderer alternativo; importar `Renderer` fuera del host; tocar OBS/telemetría/schema; mezclar cambios de otros agentes.

## 9. Success criteria (criterios de cierre)

1. `Ctrl+Shift+E` con overlay abierto en racing → entra en edit (passthrough OFF, chrome visible, datos live).
2. `Ctrl+Shift+E` de nuevo → vuelve a racing (passthrough ON, sin chrome, sin saltos de posición).
3. `Ctrl+Shift+E` con overlay cerrado → lo abre y entra en edit.
4. Streaming sin ventana desktop → no-op.
5. Arrastrar: frame sigue al cursor sin teleport ni rastro (preview imperativa); un solo `widget/layout` al soltar; autosave sin recrear la ventana; `studio:profile:saved` actualiza la revisión local.
6. Resize: handles correctos por tipo (E/W para horizontal-only), aspect-lock respetado, min size respetado.
7. `Alt` desactiva snap; `Escape` cancela el gesto.
8. Al abrir/cerrar el overlay se fuerza `ModeRacing` (sin regresión).
9. Suite Go completa PASS; frontend completo PASS; build PASS; lint focal PASS.
10. `CompositeApp.test.tsx` no contiene el guard "does not mount edit chrome" (sustituido por el opuesto).

## 10. Riesgos y mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| P0: coordenadas del gesto en fullscreen vs transformación `contain` | Media | Alto | Reutilizar `clientToLogical` con el rect medido de la escena real y la misma transformación del runtime |
| P1: teleport/rastro por re-render durante gesto | Media | Alto | Preview imperativa obligatoria + snapshot congelado + re-aplicación post-render (patrón Studio §8.1) |
| P1: guardado recrea la ventana | Alta (sin SaveInPlace) | Alto | `SaveInPlace` sin `onSaved`; test Go explícito |
| P1: divergencia documento overlay vs Hub Studio abierto | Media | Medio | Documentado como límite: no editar a la vez en overlay y Studio con el mismo perfil |
| P2: `toggleEditMode` no rebindeable desde Ajustes | Alta | Bajo | Fuera de alcance Fase 1; backend ya lo soporta |
| P2: teclas del juego capturadas mientras se edita | Media | Bajo | El usuario está en edit mode (fuera de pista); documentar en manual |
| P2: i18n incompleta en locales | Baja | Bajo | Claves añadidas a los 4 locales |

## 11. Verificación manual (después de implementar)

1. `git branch --show-current` == `vantareapp/overlay-inplace-edit-hotkey`; `git status --short` limpio.
2. `go test ./...` y `pnpm --dir frontend test` verdes.
3. Build local (según handoff: `pnpm --dir frontend build` + `go build -tags production` + `Start-Process .\bin\vantare.exe`).
4. Abrir overlay (`Ctrl+Shift+V`), pulsar `Ctrl+Shift+E` → chrome + passthrough OFF.
5. Mover/redimensionar widgets; verificar autosave y que la ventana NO parpadea.
6. Pulsar `Ctrl+Shift+E` → runtime normal sin chrome; posición persistida.
7. Abrir el perfil en Overlay Studio (Hub) y verificar que los widgets tienen las posiciones guardadas.
8. Cerrar y reabrir el overlay → arranca en racing.

## 12. Open questions

1. Autosave al soltar (igual que flujo legacy de junio) vs guardado explícito: **decisión: autosave** (comportamiento histórico aprobado; menor superficie UI).
2. ¿Mostrar en edit mode todos los widgets del layout o solo los visibles por telemetría? **Decisión: todos los del layout activo** (editar un widget oculto requiere poder verlo; badge para disabled).
3. Streaming: no-op (sin ventana desktop). **Aceptado.**
