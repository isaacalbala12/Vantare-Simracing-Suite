# Plan: Overlay edit mode in-place por hotkey (Fase 1 — layout)

**Fecha:** 2026-08-16
**Spec:** `docs/superpowers/specs/2026-08-16-overlay-inplace-edit-hotkey-design.md`
**Rama:** `vantareapp/overlay-inplace-edit-hotkey` · worktree `C:\tmp\vantare-inplace-edit\vantare-v2\vantare-v2`
**Base:** `origin/nightly@2d5ec944`
**Método:** TDD por microcorte, preview imperativa obligatoria (canvas-drag-imperative-preview.md), sin recrear la ventana al guardar.

## Dependencias entre componentes

```
Task 1 (Go: SaveInPlace) ──┐
Task 2 (Go: handler toggle)─┼── Task 3 (Go tests integración) ── Task 7 (gates Go)
Task 4 (FE: inplace-frame-preview) ──┐
Task 5 (FE: use-inplace-interaction) ─┼── Task 6 (FE: InPlaceEditOverlay + frames + CompositeApp) ── Task 8 (gates FE) ── Task 9 (docs/handoff)
Task 4 y 5 no dependen de Go; pueden alternarse.
```

## Task 1 — Go: `StudioProfileService.SaveInPlace` (persistir sin refrescar ventana)

- **Objetivo:** el edit overlay guarda el documento V3 con revisión optimista SIN invocar `onSaved` (que recrea la ventana).
- **Cambios:**
  - `internal/app/studio_profile_service.go`: extraer helper privado `save(requestID, expectedRevision, doc, notifySaved bool) error`; `Save` lo llama con `notifySaved=true`; nuevo `SaveInPlace` con `notifySaved=false` (emite `studio:profile:saved` igual, con requestId).
  - `HandleSaveInPlace(data)` + listener `overlay:edit-layout:save` en `RegisterHandlers` (reusa `decodeStudioProfileSavePayload`).
- **Tests (RED primero):**
  - `TestStudioProfileServiceSaveInPlacePersistsWithoutOnSaved` (onSaved nunca llamado; archivo persistido; `studio:profile:saved` emitido con requestId).
  - `TestStudioProfileServiceSaveInPlaceConflict` (revisión obsoleta → `studio:profile:conflict`, sin guardar).
  - `TestStudioProfileServiceSaveInPlaceInvalidPayload` (documento inválido → `studio:profile:error`).
- **Verify:** `go test ./internal/app/... -run StudioProfileService` verde; `gofmt` limpio.

## Task 2 — Go: handler `handleToggleEditMode` + hotkey action

- **Cambios en `cmd/vantare/main.go`:**
  - Nueva función `handleToggleEditMode(hubSvc *app.HubService, studioProfileSvc *app.StudioProfileService, overlayController *app.OverlayController, overlayRunning *atomic.Bool, emitter app.EventEmitter)`:
    1. Si `!overlayRunning.Load()` → `hubSvc.StartActiveOverlay()`; si error o `!status.Running` → log, `overlayRunning.Store(false)`, return (streaming/sin ventana → no-op).
    2. `doc := studioProfileSvc.Document()`; `target := ModeEdit` si `doc.DisplayMode != ModeEdit`; si no `target := ModeRacing`.
    3. `studioProfileSvc.SetDisplayMode(target)`; si error → log, return.
    4. `current := overlayController.CurrentWindow()`; si `current != nil` → `current.ApplyProfileMode(doc)`; si error → log (no aborta: EmitRuntimeLoaded sigue).
    5. `studioProfileSvc.EmitRuntimeLoaded()`.
    6. `emitter.Emit("overlay:edit-mode-changed", map[string]any{"mode": string(target)})`.
  - `buildHotkeyActionMap["toggleEditMode"]` → `handleToggleEditMode(...)`.
  - Listener `overlay:toggle-edit-mode` → `handleToggleEditMode(...)` (reemplaza `handleOpenOverlayStudio`).
- **Tests (RED primero)** en `cmd/vantare/main_test.go` (patrón de los tests existentes de hotkeys):
  - `TestHandleToggleEditModeEntersEditOnRunningOverlay` (racing → edit; SetDisplayMode + ApplyProfileMode + EmitRuntimeLoaded + evento `edit-mode-changed`).
  - `TestHandleToggleEditModeExitsToRacing` (edit → racing).
  - `TestHandleToggleEditModeOpensOverlayWhenNotRunning` (start activo + entra en edit).
  - `TestHandleToggleEditModeNoopWithoutDesktopWindow` (StartActiveOverlay devuelve Running=false → sin modo, sin evento).
  - `TestHandleToggleEditModeStoresRunningOnStartFailure`.
  - `TestBuildHotkeyActionMapToggleEditModeWiresHandler`.
- **Verify:** `go test ./cmd/vantare/...` verde; `gofmt` limpio.

## Task 3 — Go: gates intermedios

- **Verify:** `go test ./internal/app/... ./internal/window/... ./cmd/vantare/...`; `go test ./...`; `gofmt -l internal/ cmd/`; `git diff --check`. Commit si todo pasa (mensaje `feat(overlay): guardar layout V3 en modo edicion sin recrear la ventana` + `feat(overlay): hotkey toggle edit mode in-place (backend)`).

## Task 4 — FE: helpers DOM imperativos `inplace-frame-preview.ts`

- **Cambios:** nuevo `frontend/src/overlay/edit/inplace-frame-preview.ts` (patrón de `canvas-frame-preview.ts`, testids propios `inplace-edit-frame-<id>` / `inplace-edit-viewport-<id>`):
  - `registerInplaceFrameElement(id, el | null)`, `findInplaceFrameElement(id)`, `findInplaceViewportElement(id)`.
  - `beginInplaceFramePreview(id, kind, start)` → cache.
  - `applyInplaceFrameMovePreview(id, layout)` → `left/top` + `translate` transitorio.
  - `applyInplaceFrameResizePreview(id, layout)` → `left/top/width/height` + geometría del viewport interno (`data-widget-visual-base-width`).
  - `resetInplaceFramePreview(id)` → restaura start.
  - `resolveInplaceFrameGeometry(id, layout, previewActive)` → cache o layout.
  - `setInplaceFrameActive(id, active)` → clase CSS para `will-change`/`translateZ(0)`.
- **Tests (RED primero):** `inplace-frame-preview.test.ts` con DOM real (jsdom):
  - registra/resuelve frame por id; move escribe left/top sin tocar width/height; resize escribe geometría + viewport; reset restaura start; resolve usa cache cuando `previewActive`.
- **Verify:** `pnpm --dir frontend test -- src/overlay/edit/inplace-frame-preview.test.ts`.

## Task 5 — FE: `use-inplace-interaction.ts` (gestos move/resize con snap)

- **Cambios:** nuevo `frontend/src/overlay/edit/use-inplace-interaction.ts`:
  - Estado en ref (`interactionRef`): `{kind: "idle"|"move"|"resize", widgetId, start, pointerOrigin, sceneRect, scale, handle?}`; expone `interaction` público solo para `previewActive`/guías.
  - Reutiliza (import directo, sin duplicar): `clientToLogical` (canvas-geometry), `applyMovePreview` / `applyResizePreview` (useCanvasInteraction), `clampRecoverableLayout` (canvas-geometry), `widgetTypeRegistry` (overlay/core) para capabilities.
  - `beginMove(widget, event)`, `beginResize(widget, handle, event)` (botón izquierdo, `setPointerCapture`, preview imperativa).
  - `updatePointer(event)` → `applyInplaceFrameMovePreview/ResizePreview` (DOM directo; snap salvo `Alt`; guías opcionales).
  - `commit()` → layout final → **un solo** callback `onCommit(widgetId, layout)`; `cancel()` (Escape/lostpointercapture) → `resetInplaceFramePreview`.
  - `isPreviewActive(widgetId)`.
- **Tests (RED primero):** `use-inplace-interaction.test.tsx`:
  - beginMove + updatePointer escribe `frame.style.left/top` sin marcar documento dirty; primer pointermove sin teleport; commit único al soltar; Escape restaura; Alt desactiva snap; clamp dentro de layoutViewport; resize E/W para horizontal-only con min size; aspect-lock respetado.
- **Verify:** `pnpm --dir frontend test -- src/overlay/edit/use-inplace-interaction.test.tsx`.

## Task 6 — FE: `InPlaceEditOverlay` + `InPlaceWidgetEditFrame` + `CompositeApp`

- **Cambios:**
  - Nuevo `frontend/src/overlay/edit/InPlaceWidgetEditFrame.tsx`: frame absoluto (posicionado con `layoutOrigin`), `WidgetVisualViewport` + `WidgetVisualHost renderMode="desktop"` (datos live), chrome de selección, handles por `capabilities.resizeMode` (E/W si horizontal-only), badge `!behavior.enabled`, prop `previewActive` y re-aplicación post-render (patrón StudioWidgetFrame §8.1), snapshot congelado durante gesto.
  - Nuevo `frontend/src/overlay/edit/InPlaceEditOverlay.tsx`:
    - Mide viewport (ResizeObserver) + transformación `contain` (`resolveLayoutViewportTransform`).
    - Widgets del layout activo (`resolveRuntimeLayout`), todos (incluidos disabled, con badge).
    - Selección, `useInplaceInteraction`, chip `EDIT MODE` + hint (i18n).
    - Autosave: en `onCommit` → comando `widget/layout` sobre el documento local → `Events.Emit("overlay:edit-layout:save", {requestId, expectedRevision, document})`.
    - Escucha `studio:profile:saved|conflict|error` con su requestId → actualiza `revision` / estado de error discreto.
  - `frontend/src/overlay/CompositeApp.tsx`: estado `editMode` (de `windowMode` y `overlay:edit-mode-changed`); render condicional `DesktopOverlayRuntime key={revision}` vs `<InPlaceEditOverlay>` (sin key); actualiza `revision` en `studio:profile:saved`.
  - i18n en 4 locales.
- **Tests (RED primero):**
  - `InPlaceEditOverlay.test.tsx`: render escena con widgets; selección; drag → emite `overlay:edit-layout:save` con documento actualizado y expectedRevision; congelación de snapshot durante gesto; chip/hint; error visible en conflicto.
  - `CompositeApp.test.tsx`: sustituir guard 246 por "mounts edit chrome when overlay:edit-mode-changed fires"; entrar/salir por `windowMode`; no remount del editor al recibir `studio:profile:saved`.
- **Verify:** `pnpm --dir frontend test -- src/overlay/CompositeApp.test.tsx src/overlay/edit`; suite overlay completa.

## Task 7 — Gates Go completos

- `go test ./...`; `gofmt -l internal/ cmd/`; `git diff --check`. Commit.

## Task 8 — Gates frontend completos

- `pnpm --dir frontend test` (suite completa); `pnpm --dir frontend build`; `pnpm --dir frontend lint -- src/overlay/edit src/overlay/CompositeApp.tsx`; `git diff --check`. Commit.

## Task 9 — Docs y handoff

- Nota en `docs/current-plan.md` (estado real: implementado en rama, sin promoción).
- Actualizar handoff vivo `docs/vantare-program/handoffs/overlays-launcher-hub.md`.
- Checklist manual (spec §11) listo para Isaac.
- No se crea changelog fragment (requiere ISA-N; sin issue de Linear por decisión de Isaac).
- Commit documental.

## Riesgos clave (del plan de ejecución)

- No introducir posición transitoria por React state (anti-patrón §4 canvas-drag-imperative-preview.md).
- No recrear la ventana en el guardado del edit overlay (SaveInPlace).
- No tocar OBS, telemetría, schema, renderers, ni archivos del Studio salvo imports de funciones puras.
- Si un test de regresión del Studio falla tras importar funciones puras → parar y revisar (stop condition).
- El worktree principal contiene cambios ajenos; no mezclarlos.

## Criterio de cierre

Spec §9 (success criteria) + checks de Tasks 7/8 + revisión del diff completa por el orquestador.
