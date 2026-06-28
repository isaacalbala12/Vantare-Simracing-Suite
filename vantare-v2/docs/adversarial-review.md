# Review adversarial actual: Perfil activo de overlay

**Fecha:** 2026-06-28
**Modo:** review + fix acotado del orquestador.
**Alcance revisado:** seleccion de perfil activo para hotkeys y boton "Abrir overlay".

---

## Veredicto

**ACCEPT WITH P3** tras correccion acotada.

El worker implemento el flujo principal, pero la review detecto un bug funcional en el contrato `id` vs `file`: el frontend emitia `{ id, file }`, `readProfileTarget` priorizaba `file`, y `HubService.SetActiveProfile` persistia ese filename como `activeOverlayProfileId`. La UI compara contra `profile.id`, por lo que el badge `Activo` y el boton global `Abrir overlay` podian no aparecer tras activar un perfil.

Fix aplicado: `HubService.SetActiveProfile(idOrFile)` acepta ID o filename, carga el perfil y persiste/emite siempre el `profile.ID` canonico. Se anadio regresion `TestHubServiceSetActiveProfileWithFilePersistsCanonicalID`.

Tambien se retiro del diff funcional un cambio accidental en `configs/example-racing.json`; ese perfil no pertenece al alcance de la feature.

---

## Checks ejecutados

| Check | Resultado |
| --- | --- |
| `go test -count=1 ./internal/app/... ./cmd/vantare/...` | OK |
| `go test -count=1 ./...` | OK |
| `pnpm --dir frontend test -- OwnProfilesView OverlaysStudioPage LayoutStudio SettingsPage` | 40/40 OK |
| `pnpm --dir frontend test` | 590/590 OK |
| `pnpm --dir frontend exec tsc -b` | OK |
| `pnpm --dir frontend build` | OK |
| `pnpm --dir frontend lint` | OK, warning conocido de `.eslintignore` |
| `git diff --check` | OK |

Nota: Vitest sigue imprimiendo logs `ECONNREFUSED :3000` despues del resumen con exit code 0. No bloquea, pero conviene registrarlo como deuda si se mantiene.

---

## Findings

### P0

Ninguno abierto.

### P1

**P1-1: `activeOverlayProfileId` podia persistir filename en vez de ID canonico — CORREGIDO.**

Evidencia previa:
- `OverlaysStudioPage` emitia `hub:set-active` con `{ id, file }`.
- `readProfileTarget` prioriza `file` para preservar el flujo legacy de `overlay:start`.
- `SetActiveProfile` persistia el valor recibido.
- `OwnProfilesView` usa `profile.id === activeProfileId`.

Fix:
- `SetActiveProfile` carga el perfil y persiste/emite `profile.ID`.
- Test de regresion con entrada `custom-alpha.json` esperando persistencia `custom-alpha`.

### P2

Ninguno abierto en el alcance.

### P3

- El test `TestHubServiceSetActiveProfileStopsRunningOverlay` conserva un nombre confuso: el servicio no auto-detiene overlay; el stop lo hace `cmd/vantare/main.go` antes de activar. No bloquea porque el runtime real queda cubierto por el handler, pero conviene renombrarlo o reforzarlo en limpieza futura.
- `settings:save` sigue guardando el objeto completo recibido desde frontend. Si una pantalla antigua enviase settings sin `activeOverlayProfileId`, podria limpiar el valor. El flujo actual de `SettingsPage` carga settings antes de guardar, por lo que no bloquea beta.
- Queda pendiente prueba manual Wails real: activar perfil, cerrar/abrir app, comprobar badge `Activo`, `Ctrl+Shift+V` y `Ctrl+Shift+E` sobre el perfil activo.

---

## Historico

# Review adversarial: Overlay edit mode in-place por hotkey

**Fecha:** 2026-06-28
**Modo:** REVIEW ONLY. No se edito codigo de producto.
**Plan revisado:** `docs/superpowers/plans/2026-06-28-overlay-in-place-edit-mode-hotkey.md`
**Reviewer:** Orquestador (GLM-5.2) con lectura directa del codigo fuente.

---

## Veredicto

**VIABLE PARA DEMO DE 2 HORAS CON 2 CORRECCIONES OBLIGATORIAS.**

El plan es solido: reutiliza piezas existentes (`profile:set-mode`, `window.Manager.ApplyProfile`, `WidgetEditFrame`, `HotkeyManager`), tiene tests existentes que protegen el comportamiento, y la Opcion B (in-place en `CompositeApp`) es la correcta.

Pero el plan tiene **2 hallazgos no detectados** que son bloqueantes para una demo segura. Estan en el apartado P0/P1. El plan ya identifica correctamente otros riesgos (coordenadas, resize libre) que confirmo.

---

## Metodologia

He verificado cada claim del plan contra el codigo fuente real:

- `internal/window/manager.go` (ApplyProfile, LayoutOrigin, ShrinkWrap)
- `internal/app/profile_service.go` (EmitLoaded, SetDisplayMode, SaveProfileState)
- `internal/app/overlay_controller.go` (Start/Stop/Status)
- `internal/app/hotkeys.go` (Register, UpdateFromSettings, messageLoop)
- `internal/app/settings_service.go` (DefaultAppSettings)
- `cmd/vantare/main.go` (registro hotkeys lineas 367-408, profile:set-mode 727-746, layout:save 782-809, rebuildHotkeys 542-582, factory 892-921)
- `frontend/src/overlay/CompositeApp.tsx` (render, listeners, toWindowLocal)
- `frontend/src/overlay/WidgetEditFrame.tsx` (drag/resize, clampRect)
- `frontend/src/overlay/EditOverlayApp.tsx` (handleChange, autosave)
- `frontend/src/overlay/ObsOverlayApp.tsx` (SSE, no lee windowMode)
- `frontend/src/main.tsx` (routing)
- `internal/window/manager_test.go` (tests ApplyProfile en 3 modos)
- `internal/app/profile_service_test.go` (tests SetDisplayMode, EmitLoaded)
- `frontend/src/overlay/CompositeApp.test.tsx` (tests existentes)

---

## Hallazgos por prioridad

### P0-NEW: `rebuildHotkeys` no incluye `toggleEditMode` -> hotkey se pierde al guardar settings

**No detectado por el plan.** El plan dice en P2: "Verificar que `UpdateFromSettings` incluye `toggleEditMode`" pero no identifica que hay que modificar `rebuildHotkeys`.

**Evidencia:**
- `cmd/vantare/main.go:542-582` define `rebuildHotkeys()` que construye un `actionMap` con solo 3 entradas: `toggleOverlay`, `nextProfile`, `prevProfile`.
- `rebuildHotkeys()` llama `hkMgr.UpdateFromSettings(settingsSvc.Settings(), actionMap)`.
- `UpdateFromSettings` (`hotkeys.go:283-328`) hace `m.entries = nil; m.actions = make(...)` y reconstruye solo lo que esta en `actionMap`.
- `rebuildHotkeys()` se llama en `settings:save` (`main.go:620`).

**Consecuencia:** Si el worker registra `toggleEditMode` con `hkMgr.Register(...)` en el bloque de lineas 370-408 (como dice el plan), esa hotkey funciona al inicio. Pero la primera vez que el usuario guarde cualquier setting (incluyendo personalizar la propia hotkey), `rebuildHotkeys` reconstruye solo las 3 entradas originales y **`toggleEditMode` desaparece**.

**Para demo de 2 horas:** Si el usuario no toca Ajustes, funciona. Pero es fragil y el plan no lo documenta.

**Fix obligatorio:** Añadir `toggleEditMode` al `actionMap` dentro de `rebuildHotkeys()` en `main.go:544-580`, con el mismo handler que se registra en el bloque inicial. El plan debe listar `cmd/vantare/main.go:542-582` como archivo a tocar (ya lo lista, pero no identifica este cambio especifico).

**Severidad:** P0 para robustez, P1 para demo (si no se tocan settings).

---

### P1-NEW: Loop `layout:save` -> `layout:saved` -> `profile:request` -> `profile:loaded` causa re-render completo durante drag

**No detectado por el plan.** El plan menciona que `CompositeApp` ya escucha `layout:saved` -> `profile:request` (linea 81-83) pero no analiza el impacto en edit mode.

**Evidencia:**
- `CompositeApp.tsx:81-83`: `Events.On("layout:saved", () => { Events.Emit("profile:request"); })`
- `profile:request` -> Go `EmitLoaded()` -> `profile:loaded` con perfil completo + layoutOrigin + windowMode.
- `CompositeApp.tsx:65-78`: `profile:loaded` hace `setProfile(data.profile)`, `setLayoutOrigin(data.layoutOrigin)`, `setWidgets(...)`.
- El plan propone que `handleChange` emita `layout:save` en cada drag/resize (como `EditOverlayApp`).

**Consecuencia:** En edit mode, cada drag/resize dispara: `handleChange` -> `layout:save` -> Go `SaveProfileState` -> `layout:saved` + `profile:saved` + `EmitLoaded` -> `profile:loaded` -> `CompositeApp` re-renderiza `profile`, `layoutOrigin`, `widgets`, y `editMode` (derivado de `windowMode`).

`EditOverlayApp` no tiene este loop porque no escucha `layout:saved`. Por eso el autosave en soltar funciona alli sin re-render.

En `CompositeApp`, el re-render completo tras cada guardado puede:
1. Resetear el estado del drag en progreso (si `WidgetEditFrame` pierde el mouse capture).
2. Causar flickering visible.
3. Si `windowMode` llega temporalmente inconsistente, togglear `editMode` y cambiar de `WidgetEditFrame` a `WidgetHost` mid-drag.

**Para demo de 2 horas:** El drag/resize probablemente funciona en soltar (el plan dice autosave "en soltar"). Pero el re-render completo tras `profile:loaded` puede causar un flash. Hay que verificar.

**Fix recomendado:** Una de:
- (a) En edit mode, `CompositeApp` no escucha `layout:saved` (como `EditOverlayApp`).
- (b) El handler de `profile:loaded` en `CompositeApp` ignora el evento si `editMode` ya es true y `windowMode` sigue siendo "edit" (evita reset innecesario).
- (c) `handleChange` actualiza estado local sin emitir `layout:save` inmediatamente; emite al soltar (que es lo que ya hace `WidgetEditFrame` via `onMouseUp`).

La opcion (c) ya esta cubierta: `WidgetEditFrame` solo llama `onChange` en `onMouseUp`. Pero `onChange` -> `handleChange` -> `layout:save` -> `SaveProfileState` -> `EmitLoaded` -> `profile:loaded` -> re-render. El re-render ocurre despues de soltar, no durante el drag. Es menos grave de lo que parecia, pero sigue siendo un re-render completo que puede causar flash.

**Severidad:** P1 (visual, no bloqueante para demo pero molesto).

---

### P0-CONFIRMED: Coordenadas en ModeEdit - `EmitLoaded` retorna shrink-wrap origin en vez de {0,0}

**Confirmado.** El plan identifica esto correctamente.

**Evidencia:**
- `profile_service.go:135-152` (`EmitLoaded`): si `s.mgr != nil`, llama `s.mgr.LayoutOrigin(s.profile)`.
- `manager.go:80-83` (`LayoutOrigin`): llama `ShrinkWrap(p, m.pad)` que retorna origin basado en widgets.
- En `ModeEdit` la ventana es fullscreen (manager.go:40 `Fullscreen()`), pero `LayoutOrigin` retorna el origin de shrink-wrap (no {0,0}).
- `CompositeApp.tsx:112` usa `toWindowLocal(w.position, layoutOrigin)` que resta origin. Si origin != {0,0} en edit mode, las coords quedan desplazadas.

**Fix del plan (correcto):** En `EmitLoaded`, si `s.profile.DisplayMode == config.ModeEdit`, retornar `origin = config.Rect{}`. Test `TestEmitLoadedEditModeOriginZero` debe verificarlo.

**Test existente relevante:** `TestProfileServiceEmitLoadedWithoutWindowManagerUsesFullscreenOrigin` (profile_service_test.go:146-177) ya verifica que sin `mgr` el origin es {0,0}. Pero no cubre el caso `mgr != nil` + `ModeEdit`.

---

### P1-CONFIRMED: Relative/Standings resize libre vs proporcional

**Confirmado.** El plan identifica esto correctamente.

**Evidencia:**
- `WidgetEditFrame.tsx:90-118` (`handleResizeStart`): cambia `w` y `h` independientemente (resize libre).
- `WidgetHost.tsx:14-18`: calcula `scale = min(visualPos.w / baseSize.width, visualPos.h / baseSize.height)` (preserva aspect ratio).
- Si el usuario resize libre en edit (cambia aspect ratio) y vuelve a racing, `WidgetHost` escala con el nuevo aspect ratio y el widget se deforma.

**Para demo:** Aceptado. El plan dice "documentar como follow-up". OK.

---

### P2-CONFIRMED: OBS no afectado

**Confirmado.** El plan identifica esto correctamente.

**Evidencia:**
- `ObsOverlayApp.tsx` carga perfil via `fetch("/api/profile?profile=...")` (HTTP, no Wails events).
- No escucha `profile:loaded` ni `overlay:edit-mode-changed`.
- No lee `windowMode` ni `displayMode` para renderizar.
- `profile:set-mode` cambia `s.profile.DisplayMode` en memoria pero `ObsOverlayApp` no lo usa para render.
- Si el usuario guarda el perfil con `displayMode: "edit"`, OBS recibe ese perfil via HTTP pero ignora el modo para render.

**Riesgo residual bajo:** Si `SaveProfileState` persiste `displayMode: "edit"`, al recargar la app el overlay desktop abre en edit mode por defecto. Para demo, esto es aceptable (el usuario pulsa `Ctrl+Shift+E` para volver a racing). Pero hay que documentarlo.

---

### P1-CONFIRMED: Hotkey `Ctrl+Shift+E` parseo

**Confirmado.** `ParseHotkeyCombo` (`hotkeys.go:82-111`) soporta letras a-z via `key[0] - 'a' + 0x41`. `"e"` -> VK 0x45. Funciona.

`ValidateHotkeyCombo` (`settings_service.go:128-151`) valida modificadores y key no vacia. `"ctrl+shift+e"` pasa.

No colisiona con `ctrl+shift+v` (toggleOverlay), `ctrl+shift+right` (nextProfile), `ctrl+shift+left` (prevProfile).

---

## Otros hallazgos

### P3: `WidgetEditFrame.clampRect` usa `window.innerWidth/Height`

`WidgetEditFrame.tsx:8-13` usa `window.innerWidth` y `window.innerHeight` como bounds para `clampRect`. En fullscreen, esto es la resolucion del monitor. `w.position` esta en coords absolutas del escritorio. Si el overlay esta en un monitor secundario con diferente resolucion, `clampRect` puede clamp incorrectamente. Para demo en monitor unico, funciona.

### P3: `shared-widget-map.ts` no incluye `engineer-notifications`

`WidgetEditFrame` usa `WIDGET_COMPONENTS` de `shared-widget-map.ts` que no incluye `engineer-notifications`. Si un perfil tiene un widget `engineer-notifications`, `WidgetEditFrame` renderiza sin componente (el `Component &&` check falla). El widget aparece como frame vacio. No crashea. Para demo, aceptable.

### P3: Chip `EDIT MODE` visible en stream

El plan acepta esto. Correcto para demo. Follow-up: ocultar si se detecta captura OBS.

---

## Checks existentes que protegen el cambio

| Check | Archivo | Cobertura |
|-------|---------|-----------|
| `TestApplyEditMode` | `manager_test.go:71-94` | Passthrough OFF + resizable + fullscreen + 2 llamadas SetIgnoreMouseEvents(false) |
| `TestRacingAfterEditUnFullscreen` | `manager_test.go:133-146` | Al volver a racing, UnFullscreen se llama |
| `TestApplyStreamingMode` | `manager_test.go:160-187` | Streaming off-screen |
| `TestProfileServiceSetDisplayMode` | `profile_service_test.go:112-130` | SetDisplayMode aplica fullscreen + ignoreMouse=false |
| `TestHotkeyManagerUpdateFromSettings` | `hotkeys_test.go:108+` | UpdateFromSettings reconstruye hotkeys |
| `CompositeApp.test.tsx` | 3 tests | Render runtime, telemetria, widgets enabled |

**Gap de cobertura:**
- No hay test de `EmitLoaded` con `mgr != nil` + `ModeEdit` (el plan propone `TestEmitLoadedEditModeOriginZero`).
- No hay test del handler de hotkey `toggleEditMode` (el plan propone `TestHotkeyToggleEditMode`).
- No hay test de `CompositeApp` en edit mode (el plan propone 5 tests nuevos).

---

## Riesgo de tocar demasiado backend/Wails

**Bajo.** El plan toca:
- `cmd/vantare/main.go`: registro hotkey + handler + `rebuildHotkeys` (P0-NEW).
- `internal/app/profile_service.go`: `EmitLoaded` (fix origin en ModeEdit).
- `internal/app/settings_service.go`: default hotkey.

No toca:
- `internal/app/overlay_controller.go` (ciclo de vida intacto).
- `internal/window/manager.go` (ya hace el toggle, no rediseno).
- `frontend/src/overlay/WidgetEditFrame.tsx` (reutiliza as-is).
- `frontend/src/overlay/EditOverlayApp.tsx` (legacy intacto).
- `frontend/src/main.tsx` (routing intacto).
- `pkg/config/**`, schema, telemetria, OBS.

Es minimal y localizado. Cumple AGENTS.md.

---

## Resumen para demo de 2 horas

| Riesgo | Severidad plan | Severidad real | Accion |
|--------|----------------|-----------------|--------|
| Coordenadas ModeEdit origin | P0 | P0 (confirmado) | Fix EmitLoaded (plan propone) |
| `rebuildHotkeys` sin toggleEditMode | No detectado | P0 robustez / P1 demo | Añadir al actionMap (NUEVO) |
| Re-render loop en edit mode | No detectado | P1 (flash visual) | Mitigar (NUEVO) |
| Resize libre vs proporcional | P1 | P1 (confirmado) | Aceptar para demo |
| Hotkey colision | P1 | OK (no colisiona) | Nada |
| OBS afectado | P2 | P2 (confirmado, bajo) | Verificar manual |
| Autosave accidental | P1 | Aceptado (consistente) | Nada |
| Chip visible en stream | P3 | P3 (aceptado) | Nada |

**Conclusion:** Implementar la Opcion B del plan con 2 correcciones adicionales:
1. Añadir `toggleEditMode` al `actionMap` de `rebuildHotkeys()` en `main.go:544-580`.
2. Mitigar el re-render de `CompositeApp` tras `layout:saved` en edit mode (opcional para demo, recomendado).

Con esas 2 correcciones, es seguro para una demo de 2 horas.

---

## Como verificar manualmente tras implementar

1. Abrir overlay (`Ctrl+Shift+V`).
2. Pulsar `Ctrl+Shift+E` -> verificar borde rojo, chip `EDIT MODE`, cursor move.
3. Arrastrar widget -> verificar movimiento + guardado.
4. Resize handle -> verificar redimension.
5. Pulsar `Ctrl+Shift+E` -> verificar vuelta a runtime (sin borde, passthrough ON).
6. Abrir Ajustes, cambiar cualquier setting, guardar -> pulsar `Ctrl+Shift+E` -> verificar que la hotkey sigue funcionando (este paso expone el P0-NEW si no se corrige).
7. Verificar que OBS no se afecta.
8. Verificar coordenadas: widget en posicion correcta tras toggle.
