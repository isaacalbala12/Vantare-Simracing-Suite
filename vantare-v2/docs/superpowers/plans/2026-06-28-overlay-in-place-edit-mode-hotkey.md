# Plan: Overlay edit mode in-place por hotkey

**Fecha:** 2026-06-28
**Modo:** PLAN ONLY. No se edita codigo de producto. No se implementa. No se hace commit/push/tag/release.
**Autor:** Arquitecto senior (orquestador) con skills de Go (golang-context, golang-concurrency, golang-error-handling, golang-testing, golang-safety).
**Estado:** Pendiente de revision del usuario.

---

## 0. Objetivo y alcance

Permitir que el usuario pulse una hotkey (`Ctrl+Shift+E`) y convierta el overlay desktop **actualmente abierto** en modo edicion in-place:

- **Runtime normal (`ModeRacing`):** mouse passthrough activo, widgets sin borde, sin drag/resize.
- **Edit mode (`ModeEdit`):** mouse passthrough desactivado, widgets con borde exterior sutil, drag/resize activo.
- Al salir, vuelve a runtime normal.

**No queremos:**
- Una pantalla separada de edicion como flujo principal (el flujo `/overlay/edit` actual queda como secundario/legacy).
- Tocar `WidgetStudio`, schema, telemetria, OBS ni disenos de widgets.
- Rediseno arquitectonico.

**Aprovechar lo existente:**
- `EditOverlayApp` + `WidgetEditFrame` (drag/resize sobre overlay real).
- `CompositeApp` (runtime read-only).
- `OverlayController` + `wailsOverlayFactory`.
- `window.Manager.ApplyProfile` (ya cambia passthrough segun `DisplayMode`).
- `profile:set-mode` (evento Wails existente que cambia `DisplayMode` y aplica al window manager).
- `HotkeyManager` (registro de hotkeys globales).
- `layout:save` (persistencia de layout).

---

## 1. Inventario tecnico (verificado)

### 1.1 Apertura/cierre overlay desktop

| Pieza | Archivo:linea | Rol |
|-------|---------------|-----|
| `OverlayController` | `internal/app/overlay_controller.go:28-104` | Posee el ciclo de vida de la ventana overlay. `Start(profile)` cierra la ventana previa y crea una nueva via factory. `Stop()` cierra la ventana. |
| `wailsOverlayFactory` | `cmd/vantare/main.go:879-921` | Crea la ventana Wails real: frameless, transparente, always-on-top, fullscreen, URL `/`. Tras crear, aplica `SetIgnoreMouseEvents(true)` + `SetResizable(false)` + `Fullscreen()`. |
| `wailsOverlayWindow` | `cmd/vantare/main.go:884-890` | Wrapper de `*application.WebviewWindow` que implementa `OverlayWindow.Close()`. |
| `HubService.StartOverlay` | `internal/app/hub_service.go:229-253` | Activa perfil, para overlay previo, inicia nuevo, emite `overlay:status`. |
| `HubService.StopOverlay` | `internal/app/hub_service.go:257-265` | Para el overlay, emite `overlay:status`. |
| Evento `overlay:start` | `cmd/vantare/main.go:708-721` | Frontend -> Go: inicia overlay. |
| Evento `overlay:stop` | `cmd/vantare/main.go:723-725` | Frontend -> Go: para overlay. |

**Flujo actual "Abrir overlay":**
1. Frontend emite `overlay:start` (con id/file del perfil) o hotkey `toggleOverlay`.
2. `HubService.StartOverlay(target)` activa el perfil en `ProfileService`, para overlay previo, llama `overlayController.Start(profile)`.
3. `OverlayController.Start` cierra ventana previa, llama `factory.NewOverlayWindow(profile, origin, bounds)`.
4. `wailsOverlayFactory.NewOverlayWindow` crea ventana Wails frameless/transparente/always-on-top con URL `/`, la pone fullscreen y activa `SetIgnoreMouseEvents(true)`.
5. La ventana carga la SPA en `/` -> `main.tsx` -> ruta por defecto -> `CompositeApp` (runtime read-only).
6. `CompositeApp` emite `profile:request` -> Go emite `profile:loaded` con perfil + `layoutOrigin` + `windowMode`.
7. `window.Manager.ApplyProfile` (conectado al `ProfileService`) aplica `ModeRacing`: shrink-wrap + passthrough.

### 1.2 Mouse passthrough

| Pieza | Archivo:linea | Rol |
|-------|---------------|-----|
| `WindowHandle.SetIgnoreMouseEvents` | `internal/window/manager.go:13` (interfaz) | Abstrae el click-through de la ventana. |
| `wailsWindowHandle.SetIgnoreMouseEvents` | `cmd/vantare/main.go:840-843` | Llama a `w.SetIgnoreMouseEvents(ignore)` (Wails v3 API) + `ensureTransparent()`. |
| `window.Manager.ApplyProfile` | `internal/window/manager.go:34-65` | Segun `DisplayMode`: `ModeRacing` -> passthrough ON + shrink-wrap; `ModeEdit` -> passthrough OFF + resizable + fullscreen; `ModeStreaming` -> off-screen. |

**Mecanismo:** Wails v3 `WebviewWindow.SetIgnoreMouseEvents(bool)`. En Windows internamente usa `WS_EX_TRANSPARENT` / Chromium API. No hay Win32 directo en Go.

### 1.3 Hotkeys globales

| Pieza | Archivo:linea | Rol |
|-------|---------------|-----|
| `HotkeyManager` | `internal/app/hotkeys.go:119-128` (Windows) / `hotkeys_stub.go` (otros) | Registro de hotkeys globales via `user32.dll RegisterHotKey` + message loop goroutine. |
| `Register(name, combo, action)` | `internal/app/hotkeys.go:140` | Registra una hotkey con su accion. |
| `UpdateFromSettings` | `internal/app/hotkeys.go:283` | Reconstruye hotkeys desde settings. |
| Defaults | `internal/app/settings_service.go:23-27` | `toggleOverlay=ctrl+shift+v`, `nextProfile=ctrl+shift+right`, `prevProfile=ctrl+shift+left`. |
| Registro en main.go | `cmd/vantare/main.go:367-408` | Registra `toggleOverlay`, `nextProfile`, `prevProfile`. `toggleOverlay` hace start/stop del overlay. |
| `hkMgr.Start()` | `cmd/vantare/main.go:764` | Arranca el message loop. |

**Ya existe `toggleOverlay` (`ctrl+shift+v`)** que abre/cierra el overlay. No existe hotkey de edit mode.

### 1.4 Eventos Wails de overlay

| Evento | Direccion | Archivo:linea | Proposito |
|--------|-----------|---------------|-----------|
| `overlay:start` | FE->Go | `main.go:708` | Iniciar overlay. |
| `overlay:stop` | FE->Go | `main.go:723` | Parar overlay. |
| `overlay:status` | Go->FE | `hub_service.go:236,248,263` | Estado del overlay (running, profileId, mode). |
| `profile:loaded` | Go->FE | `profile_service.go:147` | Perfil + layoutOrigin + windowMode. |
| `profile:request` | FE->Go | (listener `main.go:748`) | Pedir recarga de perfil. |
| `profile:set-mode` | FE->Go | `main.go:727-746` | Cambiar `DisplayMode` (Racing/Edit/Streaming) + aplicar al window manager + reemitir `profile:loaded`. |
| `layout:save` | FE->Go | `main.go:782-809` | Persistir widgets/variants. |
| `layout:saved` | Go->FE | `profile_service.go` (en SaveProfileState) | Confirmacion de guardado. |
| `profile:saved` | Go->FE | `profile_service.go` | Confirmacion de perfil guardado. |

**Hallazgo clave:** `profile:set-mode` ya existe y ya cambia `DisplayMode` aplicando `window.Manager.ApplyProfile` (que toggles passthrough). Es la pieza central reutilizable.

### 1.5 Render runtime del overlay

| Pieza | Archivo:linea | Rol |
|-------|---------------|-----|
| `main.tsx` | `frontend/src/main.tsx:35` | Ruta por defecto -> `CompositeApp`. |
| `CompositeApp` | `frontend/src/overlay/CompositeApp.tsx:39-121` | Runtime read-only. Escucha `telemetry:update` y `profile:loaded`. Renderiza `WidgetHost` por widget visible. `editMode={false}`. |
| `WidgetHost` | `frontend/src/overlay/WidgetHost.tsx:13-49` | Contenedor posicional absoluto con `pointer-events: none`. Escala contenido via `transform: scale()`. |
| `overlay-document` | `frontend/src/overlay/overlay-document.ts` | Aplica clase `desktop-overlay` (fondo transparente). |

**No hay flag global de "edit mode" en el frontend.** El routing decide que app renderizar. `CompositeApp` no tiene estado de edicion.

### 1.6 Edicion drag/resize existente

| Pieza | Archivo:linea | Rol |
|-------|---------------|-----|
| `EditOverlayApp` | `frontend/src/overlay/EditOverlayApp.tsx:7-88` | Pantalla de edicion en ventana overlay (ruta `/overlay/edit`). Renderiza `WidgetEditFrame` por widget. Emite `layout:save` en cada drag/resize. Boton "Cerrar edicion" emite `overlay:stop`. |
| `WidgetEditFrame` | `frontend/src/overlay/WidgetEditFrame.tsx:29-156` | Chrome de edicion: borde `border-vantare-red-400/70`, cursor `cursor-move`, resize handle 12x12px en bottom-right `bg-vantare-red-500` cursor `cursor-se-resize`. Drag/resize con mouse events nativos. `clampRect()` + `MIN_SIZE={w:80,h:40}`. |
| `PreviewWidgetFrame` | `frontend/src/hub/preview/PreviewWidgetFrame.tsx` | Edicion en Hub (LayoutStudio). Logica independiente (snapping, ratio). No reutilizable para overlay. |
| `canvas-math.ts` | `frontend/src/lib/canvas-math.ts` | Utils de Hub (snap, clampPosition, resizeWithRatio, clampSize). |

**`WidgetEditFrame` es reutilizable** para el overlay real. `EditOverlayApp` es el envoltorio que orquesta `WidgetEditFrame` + persistencia. Ambos estan disenados para la ventana overlay.

### 1.7 Guardado de layout

| Pieza | Archivo:linea | Rol |
|-------|---------------|-----|
| `layout:save` listener | `main.go:782-809` | Extrae widgets/variants del payload, llama `profileSvc.SaveProfileState`. |
| `ProfileService.SaveProfileState` | `internal/app/profile_service.go:84-120` | Backup, `config.SetGeneralLayoutWidgets`, `config.SaveFile`, rollback on error, emite `layout:saved` + `profile:saved`. |
| `config.SaveFile` | `pkg/config/profile.go:132-141` | `json.MarshalIndent` + `os.WriteFile`. |

**Flujo actual de LayoutStudio (Hub):**
1. `LayoutStudio` recibe `onSave` -> `useOverlayStudioState.saveProfile()` -> emite `layout:save` con widgets+variants.
2. Go persiste, emite `layout:saved`.
3. `useOverlayStudioState` escucha `layout:saved` -> marca `saveState="saved"`, `dirty=false`.
4. Auto-save tras 800ms sin cambios. Ctrl+S / Ctrl+Z / Ctrl+Y.

**Flujo actual de EditOverlayApp (overlay real):**
1. Drag/resize en `WidgetEditFrame` -> `onChange` -> `EditOverlayApp.handleChange` -> emite `layout:save` con widgets (sin variants).
2. Go persiste, emite `profile:saved` -> `EditOverlayApp` muestra "Guardado" 1.2s.
3. **Autosave en cada soltar** (no hay draft ni guardar explicito).

### 1.8 Confirmacion de reutilizacion

- **`EditOverlayApp`/`WidgetEditFrame` son reutilizables.** Estan disenados para la ventana overlay real. `WidgetEditFrame` provee drag/resize con mouse events nativos y `clampRect`. El unico acoplamiento de `EditOverlayApp` es que monta via ruta `/overlay/edit` y su "Cerrar" emite `overlay:stop` (cierra el overlay entero, no vuelve a runtime).
- **No conviene crear un wrapper nuevo** para la logica de drag/resize: `WidgetEditFrame` ya hace el trabajo. Si hace falta un wrapper, es solo para orquestar el toggle runtime<->edit dentro de `CompositeApp` sin recargar la ventana.

---

## 2. Decision de arquitectura

### Opcion A: Reutilizar `EditOverlayApp` abriendo `/overlay/edit`

**Mecanismo:** La hotkey navega la ventana overlay a `/overlay/edit` (cambia URL del webview) y aplica `ModeEdit`. Al salir, vuelve a `/` y `ModeRacing`.

**Pros:**
- Reutiliza `EditOverlayApp` + `WidgetEditFrame` sin tocarlos.
- Separacion clara: runtime app vs edit app.
- El chrome de edicion ya existe (borde, resize handle, toolbar "Cerrar edicion").

**Contras:**
- **Requiere recargar la ventana** (cambio de URL en webview). Wails v3 no garantiza SPA routing sin recarga al cambiar URL programaticamente; habria que usar `w.Navigate("/overlay/edit")` o `ExecJS("location.hash=...")`. Recarga = parpadeo + perdida de estado de telemetria.
- `EditOverlayApp` cierra el overlay entero al "Cerrar edicion" (`overlay:stop`), no vuelve a runtime. Habria que cambiar ese comportamiento (tocar `EditOverlayApp`).
- Dos apps montadas en la misma ventana = transicion no in-place real (es un cambio de pantalla).
- Coordenadas: `EditOverlayApp` no usa `layoutOrigin`/`WidgetHost` (posiciona directo en `w.position`), mientras `CompositeApp` usa `toWindowLocal`. Cambio de sistema de coordenadas al toggle.

**Riesgos:**
- Parpadeo/recarga al toggle (P1).
- Inconsistencia de coordenadas fullscreen vs window-local (P1).
- Hay que modificar `EditOverlayApp` para que "Cerrar" vuelva a runtime en lugar de cerrar overlay (tocar archivo "prohibido" en espiritu).

**Archivos tocados:** `cmd/vantare/main.go` (hotkey + navigate), `frontend/src/overlay/EditOverlayApp.tsx` (cambiar close), `frontend/src/main.tsx` (routing). ~4-5 archivos.
**Tiempo estimado:** 4-6h.

### Opcion B: Modo in-place dentro de `CompositeApp` (RECOMENDADA)

**Mecanismo:** `CompositeApp` gana un estado local `editMode: boolean`. Cuando la hotkey dispara `profile:set-mode` a `ModeEdit`, Go aplica passthrough OFF al window manager y emite `profile:loaded` con `windowMode="edit"`. `CompositeApp` detecta `windowMode==="edit"` y renderiza `WidgetEditFrame` en lugar de `WidgetHost` (con el mismo widget dentro). Al salir, `profile:set-mode` a `ModeRacing`, Go aplica passthrough ON + shrink-wrap, emite `profile:loaded` con `windowMode="racing"`, `CompositeApp` vuelve a `WidgetHost`.

**Pros:**
- **In-place real**: misma ventana, misma app, sin recarga, sin parpadeo. Toggle instantaneo.
- **Reutiliza `WidgetEditFrame`** (drag/resize + chrome) sin tocarlo.
- **Reutiliza `profile:set-mode`** (evento Wails existente) y `window.Manager.ApplyProfile` (ya toggles passthrough).
- **Una sola fuente de estado**: `windowMode` viene en `profile:loaded` (ya existe). No hay estado global nuevo.
- **Coordenadas consistentes**: en edit mode, `CompositeApp` puede usar el mismo `toWindowLocal` que en runtime (o posicionar `WidgetEditFrame` con coordenadas window-local). El overlay en `ModeRacing` hace shrink-wrap; en `ModeEdit` hace fullscreen. Hay que resolver el mapeo de coordenadas (ver riesgos).
- No toca `EditOverlayApp` (queda como flujo legacy/secundario).
- No toca `WidgetStudio`, schema, telemetria, OBS.

**Contras:**
- `CompositeApp` crece en complejidad (gestiona dos modos de render). Es un cambio de comportamiento en un archivo core.
- Coordenadas: en `ModeRacing` la ventana hace shrink-wrap (window-local coords = profile coords - origin). En `ModeEdit` la ventana es fullscreen (window-local coords = profile coords directas, origin=0). Hay que normalizar para que `WidgetEditFrame` posicione correctamente en ambos modos. **Solucion:** en edit mode, `CompositeApp` usa `layoutOrigin={x:0,y:0}` (fullscreen) y posiciona `WidgetEditFrame` con `w.position` directo. En runtime, usa `toWindowLocal` como hoy.
- El borde/resize handle de `WidgetEditFrame` es visible en stream si el usuario edita mientras hace stream. Es aceptable (es modo edicion) pero hay que minimizarlo.

**Riesgos:**
- Coordenadas fullscreen vs window-local al toggle (P1, mitigable: normalizar origin en `EmitLoaded` segun modo).
- Resize proporcional de Relative/Standings: `WidgetEditFrame` hace resize libre (no proporcional). En runtime, `WidgetHost` escala con `transform: scale()`. Si el usuario resize libre en edit y vuelve a runtime, el widget puede deformarse. **Mitigacion:** para la demo pre-stream, aceptar resize libre; documentar que resize proporcional es follow-up. O bien anadir ratio lock en `WidgetEditFrame` (fuera de alcance de este plan, ver riesgos).
- Autosave accidental: si `CompositeApp` emite `layout:save` en cada drag/resize (como hace `EditOverlayApp`), se persiste automaticamente. Para la demo, esto es aceptable (es lo que ya hace `EditOverlayApp`). Draft + guardar explicito es follow-up.

**Archivos tocados:**
- `cmd/vantare/main.go` (registrar hotkey `toggleEditMode` + handler que emite `profile:set-mode`).
- `internal/app/settings_service.go` (anadir default `toggleEditMode: "ctrl+shift+e"`).
- `frontend/src/overlay/CompositeApp.tsx` (estado `editMode`, render condicional `WidgetHost` vs `WidgetEditFrame`).
- Tests Go + frontend.
- Docs.

**Archivos NO tocados:** `EditOverlayApp.tsx`, `WidgetEditFrame.tsx`, `WidgetHost.tsx`, `WidgetStudio`, schema, telemetria, OBS, configs.

**Tiempo estimado:** 3-5h (menos que A porque no hay recarga ni cambio de routing).

### Opcion C: Hibrido minimo

**Mecanismo:** Como B, pero en lugar de modificar `CompositeApp`, se crea un componente nuevo `InPlaceEditApp` que envuelve `CompositeApp` y anade la capa de edicion. La hotkey monta/desmonta la capa.

**Pros:**
- `CompositeApp` queda intacto.
- Separacion de responsabilidades.

**Contras:**
- Mas archivos nuevos (mas superficie).
- Duplicacion de la logica de `profile:loaded`/telemetria que ya tiene `CompositeApp`.
- Complejidad de envoltorio sin beneficio claro sobre B.

**Riesgos:** similares a B pero con mas archivos.
**Tiempo estimado:** 5-7h.

### Recomendacion

**Opcion B para demo pre-stream y beta.**

Razones:
- In-place real, sin recarga, sin parpadeo (mejor UX para demo).
- Minimos archivos tocados.
- Reutiliza `profile:set-mode` + `window.Manager.ApplyProfile` + `WidgetEditFrame` (piezas existentes probadas).
- El cambio en `CompositeApp` es pequeno y localizado (estado + render condicional).
- Coordenadas se resuelven normalizando `layoutOrigin` segun modo (Go ya lo hace en `EmitLoaded`).

---

## 3. Contrato de hotkey

### 3.1 Hotkey final

**`Ctrl+Shift+E`** (accion `toggleEditMode`).

- No colisiona con `toggleOverlay` (`Ctrl+Shift+V`), `nextProfile` (`Ctrl+Shift+Right`), `prevProfile` (`Ctrl+Shift+Left`).
- `E` de "Edit". Mnemonico claro.
- Personalizable desde Ajustes (como las demas hotkeys).

### 3.2 Comportamiento segun estado

| Estado actual | Al pulsar `Ctrl+Shift+E` | Resultado |
|---------------|--------------------------|-----------|
| Overlay abierto en runtime (`ModeRacing`) | Toggle a edit | Go: `profile:set-mode` -> `ModeEdit` -> `ApplyProfile` (passthrough OFF, resizable, fullscreen) -> `EmitLoaded` (windowMode="edit"). FE: `CompositeApp` renderiza `WidgetEditFrame`. |
| Overlay abierto en edit mode (`ModeEdit`) | Toggle a runtime | Go: `profile:set-mode` -> `ModeRacing` -> `ApplyProfile` (passthrough ON, shrink-wrap) -> `EmitLoaded` (windowMode="racing"). FE: `CompositeApp` renderiza `WidgetHost`. |
| Overlay no abierto | No-op (o log debug) | El edit mode requiere overlay abierto. Si no hay overlay, la hotkey no hace nada. |
| Cambios sin guardar en LayoutStudio (Hub) | No relevante | LayoutStudio es el Hub (otra ventana). El edit mode in-place es sobre el overlay desktop. No hay interaccion directa. Si el Hub tiene dirty y el overlay esta abierto con el mismo perfil, el edit mode guarda via `layout:save` (autosave en soltar). No hay conflicto de estado porque son ventanas distintas. |
| App cerrandose | No-op | `HotkeyManager.Stop()` desregistra todo. |

### 3.3 Eventos Wails propuestos

**Reutilizar eventos existentes; anadir solo lo minimo.**

| Evento | Direccion | Nuevo? | Proposito |
|--------|-----------|--------|-----------|
| `profile:set-mode` | FE->Go | No (existe) | Cambiar `DisplayMode`. Payload: `{mode: "edit"|"racing"}`. |
| `profile:loaded` | Go->FE | No (existe) | Ya incluye `windowMode`. `CompositeApp` lo lee para saber si esta en edit. |
| `overlay:edit-mode-changed` | Go->FE | **Nuevo (opcional)** | Notificacion explicita del cambio de modo. Payload: `{mode: "edit"|"racing"}`. Util para que el frontend no dependa solo de `profile:loaded` (que se emite por muchas causas). **Recomendado anadirlo** para desacoplar el toggle de recargas de perfil. |

**Flujo de eventos del toggle:**
1. Hotkey `Ctrl+Shift+E` -> handler en `main.go`.
2. Handler lee `overlayController.Status()`. Si `!Running`, return (no-op).
3. Handler lee `profileSvc.Profile().DisplayMode`. Si `ModeRacing` -> target `ModeEdit`. Si `ModeEdit` -> target `ModeRacing`.
4. Handler emite `profile:set-mode` internamente (o llama directo a `profileSvc.SetDisplayMode(target)` + `EmitLoaded()`).
5. `SetDisplayMode` aplica `window.Manager.ApplyProfile` (toggles passthrough).
6. `EmitLoaded` emite `profile:loaded` con `windowMode` actualizado.
7. (Opcional) Handler emite `overlay:edit-mode-changed` con el modo nuevo.
8. `CompositeApp` recibe `profile:loaded` (o `overlay:edit-mode-changed`), actualiza `editMode`, re-renderiza.

**Nota:** El handler de hotkey puede llamar directamente a `profileSvc.SetDisplayMode` + `EmitLoaded` sin pasar por el evento `profile:set-mode` (que es FE->Go). Es mas simple y evita un round-trip de eventos. El evento `profile:set-mode` se mantiene para que el frontend tambien pueda pedir el cambio (ej. boton en toolbar).

---

## 4. Contrato visual

### 4.1 Widgets en edit mode

Reutilizar el chrome existente de `WidgetEditFrame` (no redisenar):

| Elemento | Especificacion | Implementacion existente |
|----------|----------------|--------------------------|
| Borde exterior | `border-vantare-red-400/70` (rojo Vantare semi-transparente), hover `border-vantare-red-400` | `WidgetEditFrame.tsx:127` |
| Resize handle | Cuadrado 12x12px en esquina inferior derecha, `bg-vantare-red-500`, cursor `cursor-se-resize` | `WidgetEditFrame.tsx:150-153` |
| Cursor drag | `cursor-move` sobre el frame | `WidgetEditFrame.tsx:127` |
| Tamano minimo | `w:80, h:40` | `WidgetEditFrame.tsx:6` |

### 4.2 Indicador "EDIT MODE"

Anadir un indicador minimo discreto en `CompositeApp` cuando `editMode=true`:

- **Chip fijo** en esquina superior izquierda: texto `EDIT MODE` en tipografia mono, `text-[10px]`, color `text-vantare-red-400`, fondo `bg-black/60`, padding `px-2 py-1`, border `border-white/10`, `z-50`, `select-none`.
- **No paneles grandes.** No toolbar con botones (el toggle es por hotkey). Solo el chip + el chrome de `WidgetEditFrame`.
- **Instrucciones minimas** en esquina inferior izquierda (como `EditOverlayApp`): `Ctrl+Shift+E para salir` en `text-[10px] text-white/30 select-none`.

### 4.3 Visibilidad en stream

- El borde rojo semi-transparente y el handle son visibles pero sutiles.
- El chip `EDIT MODE` es pequeno y discreto.
- **No molesta** porque el modo edicion es temporal (el usuario entra, ajusta, sale).
- Si el usuario hace stream mientras edita, se vera el chrome. Es aceptable para demo/beta. Follow-up: ocultar chrome si se detecta captura OBS (fuera de alcance).

---

## 5. Persistencia

### 5.1 Recomendacion para demo pre-stream

**Autosave al soltar drag/resize** (igual que `EditOverlayApp` actual).

Razones:
- Es el comportamiento existente de `EditOverlayApp` (consistencia).
- Menor riesgo: no hay estado "draft" que se pierda al cerrar.
- Mas simple: no hay UI de "Guardar"/"Descartar".
- El usuario ajusta y al soltar ya esta persistido.

### 5.2 Como se emite `layout:save`

`CompositeApp` en edit mode, al recibir `onChange(widgetId, rect)` de `WidgetEditFrame`:
1. Actualiza el perfil local (`setProfile`/`setWidgets`).
2. Emite `Events.Emit("layout:save", { widgets: next.widgets })` (sin variants; en edit mode in-place no se tocan variants).

Go (`main.go:782-809`) recibe `layout:save`:
1. Extrae `widgets` del payload.
2. Llama `profileSvc.SaveProfileState(widgets, nil)`.
3. `SaveProfileState` actualiza in-memory, `config.SaveFile` a disco, emite `layout:saved` + `profile:saved`.

### 5.3 Como se refresca el overlay

- `CompositeApp` ya escucha `layout:saved` -> emite `profile:request` -> Go emite `profile:loaded` -> `CompositeApp` actualiza perfil. (Este flujo ya existe en `CompositeApp.tsx:81-83`.)
- En edit mode, tras autosave, el overlay se refresca solo via este ciclo.
- **Cuidado:** en `ModeEdit` la ventana es fullscreen (no shrink-wrap). Tras guardar, `ApplyProfile` con `skipRefresh=true` (bounds-only) evita flash. `SaveProfileState` ya usa `ApplyToWindow(true)` (skipRefresh) para no re-fullscreen.

### 5.4 Draft + guardar explicito (follow-up post-beta)

Para despues de la beta: anadir estado `dirty` en `CompositeApp` edit mode, toolbar con "Guardar"/"Descartar", y solo persistir al guardar explicito. Fuera de alcance de este plan.

---

## 6. Plan segmentado

### P0 - Inventario y tests existentes

**Objetivo:** Confirmar el inventario y proteger el comportamiento actual con tests antes de cambiar nada.

**Archivos permitidos:** solo lectura + tests nuevos.
**Archivos prohibidos:** codigo de producto.

**Cambios exactos:**
- Verificar que existen tests para `OverlayController.Start/Stop/Status` (`internal/app/overlay_controller_test.go`).
- Verificar que existen tests para `window.Manager.ApplyProfile` en los tres modos (`internal/window/manager_test.go`).
- Verificar que existen tests para `HotkeyManager.Register` (`internal/app/hotkeys_test.go`).
- Verificar tests frontend de `CompositeApp` (`frontend/src/overlay/CompositeApp.test.tsx`).
- Si falta cobertura critica, anadir tests table-driven (sin tocar producto).

**Tests requeridos:**
- `go test ./internal/app/... ./internal/window/...` verde.
- `pnpm --dir frontend test` verde.

**Stop conditions:**
- Si los tests existentes no cubren `ApplyProfile` en `ModeEdit`, parar y anadir cobertura antes de avanzar.
- Si `OverlayController` no tiene tests de concurrencia (Start/Stop simultaneos), anadirlos.

---

### P1 - Backend: overlay edit state + mouse passthrough

**Objetivo:** Garantizar que `profile:set-mode` toggles passthrough correctamente y que `EmitLoaded` envia `windowMode` correcto en cada modo.

**Archivos permitidos:**
- `internal/app/profile_service.go` (solo si hay que ajustar `EmitLoaded` para edit mode origin).
- `internal/app/settings_service.go` (anadir default `toggleEditMode`).
- `cmd/vantare/main.go` (registrar hotkey `toggleEditMode` + handler).
- Tests Go asociados.

**Archivos prohibidos:**
- `internal/app/overlay_controller.go` (no tocar el ciclo de vida).
- `internal/window/manager.go` (ya hace el toggle; no redisenar).
- `frontend/**`.

**Cambios exactos:**

1. **`internal/app/settings_service.go`**: anadir entrada en defaults de hotkeys:
   ```go
   "toggleEditMode": "ctrl+shift+e",
   ```
   (En el mapa de defaults, junto a `toggleOverlay`, `nextProfile`, `prevProfile`.)

2. **`cmd/vantare/main.go`** (bloque de registro de hotkeys, despues de linea 408):
   ```go
   hkMgr.Register("toggleEditMode", settingsSvc.Settings().Hotkeys["toggleEditMode"], func() {
       if overlayController == nil {
           return
       }
       status := overlayController.Status()
       if !status.Running {
           return // no-op si overlay no abierto
       }
       profile := profileSvc.Profile()
       if profile == nil {
           return
       }
       var target config.DisplayMode
       if profile.DisplayMode == config.ModeEdit {
           target = config.ModeRacing
       } else {
           target = config.ModeEdit
       }
       if err := profileSvc.SetDisplayMode(target); err != nil {
           log.Printf("hotkey toggle edit mode error: %v", err)
           return
       }
       profileSvc.EmitLoaded()
       emitter.Emit("overlay:edit-mode-changed", map[string]any{"mode": string(target)})
   })
   ```

3. **`internal/app/profile_service.go`** (`EmitLoaded`): verificar que `layoutOrigin` sea correcto en `ModeEdit`. En `ModeEdit` la ventana es fullscreen, origin debe ser `{x:0,y:0}`. **Hoy `LayoutOrigin` llama `ShrinkWrap` que calcula origin segun widgets.** En fullscreen, eso es incorrecto (origin debe ser 0). **Cambio necesario:**
   ```go
   func (s *ProfileService) EmitLoaded() {
       // ...
       var origin config.Rect
       if s.mgr != nil {
           if s.profile.DisplayMode == config.ModeEdit {
               origin = config.Rect{} // fullscreen: coords directas
           } else {
               origin = s.mgr.LayoutOrigin(s.profile)
           }
       }
       // ...
   }
   ```
   (O bien que `LayoutOrigin` retorne `{}` cuando `ModeEdit`. Decision de implementacion.)

**Tests requeridos:**
- `TestSetDisplayModeTogglesPassthrough`: table-driven con `ModeRacing`/`ModeEdit`/`ModeStreaming` verificando llamadas a `SetIgnoreMouseEvents` (con mock `WindowHandle`).
- `TestEmitLoadedEditModeOriginZero`: verifica que en `ModeEdit`, `layoutOrigin` sea `{x:0,y:0}`.
- `TestHotkeyToggleEditMode`: verifica que el handler llama `SetDisplayMode` con el modo opuesto y emite `overlay:edit-mode-changed`.
- `TestHotkeyToggleEditModeNoOverlay`: verifica no-op si `!status.Running`.

**Stop conditions:**
- Si `SetDisplayMode` no aplica `ApplyProfile` correctamente en fullscreen, parar.
- Si `EmitLoaded` en `ModeEdit` rompe tests existentes de `LayoutOrigin`, parar y revisar.

---

### P2 - Hotkey

**Objetivo:** Registrar y validar la hotkey `Ctrl+Shift+E`.

**Archivos permitidos:**
- `cmd/vantare/main.go` (registro, si no se completo en P1).
- `internal/app/settings_service.go` (default, si no se completo en P1).
- `internal/app/hotkeys.go` (solo si `ParseHotkeyCombo` no soporta `e` letra — verificar).
- Tests.

**Archivos prohibidos:** resto.

**Cambios exactos:**
- Confirmar que `ParseHotkeyCombo("ctrl+shift+e")` parsea correctamente (deberia: soporta letras).
- Registrar en `main.go` (hecho en P1 si se sigue el orden).
- Anadir `toggleEditMode` al mapa de settings defaults.
- Verificar que `UpdateFromSettings` (que reconstruye hotkeys al cambiar settings) incluye `toggleEditMode`.

**Tests requeridos:**
- `TestParseHotkeyComboCtrlShiftE`: verifica parseo a modifiers + VK.
- `TestHotkeyManagerRegisterToggleEditMode`: verifica registro sin error.
- Test de integracion: settings con `toggleEditMode` -> `UpdateFromSettings` -> hotkey activa.

**Stop conditions:**
- Si `Ctrl+Shift+E` colisiona con otra hotkey del sistema o de la app, parar y proponer alternativa (`Ctrl+Shift+D` o `Alt+E`).

---

### P3 - Frontend: CompositeApp edit mode

**Objetivo:** `CompositeApp` renderiza `WidgetEditFrame` cuando `windowMode==="edit"` y `WidgetHost` cuando `windowMode==="racing"`.

**Archivos permitidos:**
- `frontend/src/overlay/CompositeApp.tsx`.
- Tests frontend de `CompositeApp`.

**Archivos prohibidos:**
- `frontend/src/overlay/EditOverlayApp.tsx` (no tocar; queda como legacy).
- `frontend/src/overlay/WidgetEditFrame.tsx` (no tocar; se reutiliza as-is).
- `frontend/src/overlay/WidgetHost.tsx` (no tocar).
- `frontend/src/main.tsx` (no tocar routing).
- `frontend/src/hub/**` (no tocar Hub/LayoutStudio).

**Cambios exactos en `CompositeApp.tsx`:**

1. Anadir estado `editMode` derivado de `windowMode` en `profile:loaded`:
   ```tsx
   const [editMode, setEditMode] = useState(false);
   // en listener de profile:loaded:
   setEditMode(data.windowMode === "edit");
   ```

2. Anadir listener de `overlay:edit-mode-changed` (opcional, para toggle sin recarga de perfil):
   ```tsx
   useEffect(() => {
     const unsub = Events.On("overlay:edit-mode-changed", (event: { data: { mode: string } }) => {
       setEditMode(event.data.mode === "edit");
     });
     return () => { unsub?.(); };
   }, []);
   ```

3. Render condicional:
   ```tsx
   {editMode
     ? widgets.map((w) => (
         <WidgetEditFrame key={w.id} widget={w} onChange={handleChange} />
       ))
     : (telemetryState ? widgets.filter((w) => isWidgetVisible(w, telemetryState)) : widgets).map((w) => {
         const Component = WIDGETS[w.type];
         if (!Component) return null;
         const localPos = toWindowLocal(w.position, layoutOrigin);
         return (
           <WidgetHost key={w.id} id={w.id} position={localPos} widget={w} profile={profile}>
             <Component editMode={false} telemetryMode="live" ... />
           </WidgetHost>
         );
       })
   }
   ```

4. Anadir `handleChange` (mismo patron que `EditOverlayApp`):
   ```tsx
   function handleChange(widgetId: string, rect: Rect) {
     if (!profile) return;
     const next: ProfileConfig = {
       ...profile,
       widgets: profile.widgets.map((w) => (w.id === widgetId ? { ...w, position: rect } : w)),
     };
     setProfile(next);
     setWidgets(next.widgets.filter((w) => w.enabled));
     Events.Emit("layout:save", { widgets: next.widgets });
   }
   ```

5. Anadir chip `EDIT MODE` + instrucciones (cuando `editMode`):
   ```tsx
   {editMode && (
     <>
       <div className="fixed top-4 left-4 z-50 select-none" data-testid="edit-mode-chip">
         <span className="text-[10px] font-mono text-vantare-red-400 bg-black/60 px-2 py-1 rounded border border-white/10">
           EDIT MODE
         </span>
       </div>
       <div className="fixed bottom-4 left-4 text-[10px] text-white/30 select-none">
         Ctrl+Shift+E para salir · arrastra y redimensiona
       </div>
     </>
   )}
   ```

6. Importar `WidgetEditFrame` y `Rect`.

**Tests requeridos:**
- `CompositeApp.test.tsx`: test de que con `windowMode="edit"` renderiza `WidgetEditFrame` (data-testid o clase del frame).
- `CompositeApp.test.tsx`: test de que con `windowMode="racing"` renderiza `WidgetHost` (comportamiento actual).
- `CompositeApp.test.tsx`: test de toggle via evento `overlay:edit-mode-changed`.
- `CompositeApp.test.tsx`: test de que `handleChange` emite `layout:save`.
- `CompositeApp.test.tsx`: test de que el chip `EDIT MODE` aparece solo en edit mode.

**Stop conditions:**
- Si `WidgetEditFrame` no posiciona correctamente con coordenadas window-local en fullscreen, parar y revisar `clampRect` / sistema de coords.
- Si el toggle causa re-render masivo o perdida de telemetria, parar.
- Si `layout:save` sin `variants` rompe `SaveProfileState` (que espera variants opcionales), parar.

---

### P4 - Tests

**Objetivo:** Cobertura completa de los cambios.

**Archivos permitidos:** tests Go + frontend.
**Archivos prohibidos:** codigo de producto (salvo ajustes minimos de testabilidad sin cambio de comportamiento).

**Tests requeridos:**

Go:
- `internal/app/profile_service_test.go`: `TestEmitLoadedEditModeOriginZero`, `TestSetDisplayModeAppliesWindow`.
- `internal/app/hotkeys_test.go` (o `main_test.go`): `TestHotkeyToggleEditMode`, `TestHotkeyToggleEditModeNoOverlay`.
- `internal/app/settings_service_test.go`: `TestDefaultHotkeysIncludeToggleEditMode`.
- `go test ./...` verde.

Frontend:
- `frontend/src/overlay/CompositeApp.test.tsx`: tests de edit mode (5 tests arriba).
- `pnpm --dir frontend test` verde.
- `pnpm --dir frontend lint` verde.
- `pnpm --dir frontend build` verde.

**Stop conditions:**
- Si anadir tests requiere tocar codigo de producto para testabilidad, parar y consultar.
- Si tests flaky por timing (mouse events), parar y usar fake timers / mocks.

---

### P5 - Docs y checklist manual

**Objetivo:** Documentar el feature y la verificacion manual.

**Archivos permitidos:**
- `docs/current-plan.md` (linea de estado).
- `docs/superpowers/plans/2026-06-28-overlay-in-place-edit-mode-hotkey.md` (este plan, marcar como ejecutado).
- `docs/overlay-edit-mode-manual-verification.md` (nuevo, checklist manual).

**Archivos prohibidos:** codigo.

**Cambios exactos:**
- Checklist manual con pasos:
  1. Abrir overlay (`Ctrl+Shift+V` o boton).
  2. Pulsar `Ctrl+Shift+E` -> verificar borde rojo en widgets, chip `EDIT MODE`, cursor move.
  3. Arrastrar un widget -> verificar movimiento + autosave (log de `layout:save`).
  4. Resize handle -> verificar redimension.
  5. Pulsar `Ctrl+Shift+E` -> verificar vuelta a runtime (sin borde, passthrough).
  6. Verificar que OBS no se afecta (overlay OBS sigue en `/overlay`).
  7. Verificar que WidgetStudio no se afecta.
  8. Verificar coordenadas: widget en posicion correcta tras toggle.

**Stop conditions:**
- Si la verificacion manual falla en cualquier paso, parar y reportar bug.

---

## 7. Riesgos

### P0 (bloqueantes)

| Riesgo | Probabilidad | Impacto | Mitigacion |
|--------|-------------|---------|------------|
| Mouse passthrough queda bloqueado en ON tras salir de edit mode | Media | Alto (overlay inutilizable) | `window.Manager.ApplyProfile` ya maneja `ModeRacing` con `SetIgnoreMouseEvents(true)` dos veces (linea 60 + post-fullscreen). Test `TestSetDisplayModeTogglesPassthrough` debe verificar el toggle completo. Si falla, no mergear. |
| Coordenadas fullscreen vs window-local inconsistentes al toggle | Alta | Alto (widgets en posicion wrong) | `EmitLoaded` debe retornar `origin={}` en `ModeEdit` (cambio en P1). Test `TestEmitLoadedEditModeOriginZero`. Verificacion manual paso 8. |

### P1 (serios)

| Riesgo | Probabilidad | Impacto | Mitigacion |
|--------|-------------|---------|------------|
| Resize proporcional de Relative/Standings: `WidgetEditFrame` hace resize libre, `WidgetHost` escala con `transform: scale()`. Resize libre en edit + vuelta a runtime = deformacion | Alta | Medio (visual) | Para demo: aceptar resize libre (es lo que ya hace `EditOverlayApp`). Documentar como follow-up. Opcion: anadir ratio lock en `WidgetEditFrame` por tipo de widget (fuera de alcance, follow-up post-beta). |
| Layout autosave accidental: cada drag guarda a disco | Media | Bajo (es el comportamiento existente de `EditOverlayApp`) | Aceptado para demo. Follow-up: draft + guardar explicito. |
| Hotkey `Ctrl+Shift+E` colisiona con otra app o shortcut del sistema | Baja | Medio | Verificar en Windows. Fallback: `Ctrl+Shift+D` o `Alt+E`. Personalizable desde Ajustes. |

### P2 (moderados)

| Riesgo | Probabilidad | Impacto | Mitigacion |
|--------|-------------|---------|------------|
| Overlay OBS se afecta | Baja | Alto (rompe stream) | Overlay OBS usa ruta `/overlay` -> `ObsOverlayApp` (otra app, SSE). No comparte estado con `CompositeApp`. `profile:set-mode` afecta el perfil compartido, pero `ObsOverlayApp` no lee `windowMode` para render. Verificar manualmente paso 6. |
| Perdida de telemetria al toggle (re-render de `CompositeApp`) | Media | Bajo | `CompositeApp` mantiene `telemetryKey` y refs. Toggle de `editMode` no resetea telemetria (es un estado independiente). Test de que telemetria sigue tras toggle. |
| `profile:loaded` se emite por muchas causas (cambio de perfil, guardado) y `CompositeApp` reacciona reseteando `editMode` | Media | Medio | `editMode` se deriva de `windowMode` en `profile:loaded`, que es la fuente de verdad del modo. Si un cambio de perfil emite `profile:loaded` con `windowMode="racing"`, `editMode` vuelve a false (correcto). El evento `overlay:edit-mode-changed` es redundante pero mas explicito. |

### P3 (menores)

| Riesgo | Probabilidad | Impacto | Mitigacion |
|--------|-------------|---------|------------|
| Chrome de edicion visible en stream si se edita en vivo | Alta (en demo) | Bajo (esperado) | Aceptado. Follow-up: ocultar chrome si captura OBS detectada. |
| `WidgetEditFrame` no soporta touch/pen | Baja | Bajo | Fuera de alcance (desktop app). |
| Hotkey manager stub en non-Windows no registra | Baja | Bajo | Documentado (beta es Windows). |

---

## 8. Checks finales recomendados

### Go
- `gofmt -l internal/ cmd/` (sin cambios sin formatear).
- `go test ./...` verde.
- `go vet ./internal/app/... ./internal/window/... ./cmd/...` verde.
- `go test -race ./internal/app/... ./internal/window/...` (si CGO disponible; si no, documentar).

### Frontend
- `pnpm --dir frontend test` verde.
- `pnpm --dir frontend lint` verde.
- `pnpm --dir frontend build` verde.
- `tsc -b` sin errores.

### Build
- `wails3 task windows:build` (o `build:native`) exitoso.
- Verificar que el binario arranca y el overlay abre.

### Manual
- Checklist de `docs/overlay-edit-mode-manual-verification.md` (P5).
- Verificar en Windows real con overlay abierto + juego/sim corriendo.

### Git
- `git diff --check` limpio.
- `git status --short` solo archivos esperados.

---

## 9. Veredicto de viabilidad

**VIABLE.** El feature se puede implementar con cambios pequenos y localizados reutilizando piezas existentes (`profile:set-mode`, `window.Manager.ApplyProfile`, `WidgetEditFrame`, `HotkeyManager`). No requiere nuevo diseño arquitectonico ni dependencias. Los riesgos P0 (passthrough y coordenadas) son mitigables con tests y un cambio pequeno en `EmitLoaded`.

---

## 10. Opcion recomendada

**Opcion B: Modo in-place dentro de `CompositeApp`.**

Razones:
- In-place real sin recarga (mejor UX para demo).
- Minimos archivos tocados (4 de producto + tests + docs).
- Reutiliza `profile:set-mode` + `ApplyProfile` + `WidgetEditFrame`.
- Tiempo estimado 3-5h.

---

## 11. Prompt final autocontenido para el worker implementador

```
Eres un worker implementador senior de Vantare Suite (Go/Wails v3 + React/TypeScript).
Repo: C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2
Lee AGENTS.md y docs/current-plan.md antes de empezar.
Ejecuta las skills de Go: golang-context, golang-concurrency, golang-error-handling, golang-testing, golang-safety.

OBJETIVO: Implementar "overlay edit mode in-place" activable por hotkey Ctrl+Shift+E.
Plan de referencia: docs/superpowers/plans/2026-06-28-overlay-in-place-edit-mode-hotkey.md (leelo completo).

ALCANCE ESTRICTO (Opcion B del plan):
- El overlay desktop abierto en runtime (ModeRacing) puede togglear a ModeEdit con Ctrl+Shift+E.
- En ModeEdit: passthrough OFF, widgets con WidgetEditFrame (borde + resize handle), drag/resize, autosave en soltar.
- Al pulsar Ctrl+Shift+E de nuevo: vuelve a ModeRacing (passthrough ON, WidgetHost read-only).
- Si el overlay no esta abierto, la hotkey es no-op.

ARCHIVOS PERMITIDOS (solo estos):
- internal/app/settings_service.go (anadir default "toggleEditMode": "ctrl+shift+e")
- cmd/vantare/main.go (registrar hotkey toggleEditMode + handler que llama profileSvc.SetDisplayMode + EmitLoaded + emite overlay:edit-mode-changed)
- internal/app/profile_service.go (ajustar EmitLoaded: en ModeEdit, layoutOrigin debe ser config.Rect{})
- frontend/src/overlay/CompositeApp.tsx (estado editMode desde windowMode + overlay:edit-mode-changed; render condicional WidgetHost vs WidgetEditFrame; handleChange con layout:save; chip EDIT MODE + instrucciones)
- Tests: internal/app/profile_service_test.go, internal/app/settings_service_test.go, frontend/src/overlay/CompositeApp.test.tsx (y otros tests necesarios)
- Docs: docs/current-plan.md (linea de estado), docs/overlay-edit-mode-manual-verification.md (checklist)

ARCHIVOS PROHIBIDOS (no tocar):
- internal/app/overlay_controller.go
- internal/window/manager.go
- frontend/src/overlay/EditOverlayApp.tsx
- frontend/src/overlay/WidgetEditFrame.tsx
- frontend/src/overlay/WidgetHost.tsx
- frontend/src/main.tsx
- frontend/src/hub/** (WidgetStudio, LayoutStudio, etc.)
- pkg/config/**, schema, telemetria, OBS, configs

IMPLEMENTA EN ESTE ORDEN:
1. P0: Verifica tests existentes de OverlayController, Manager.ApplyProfile, HotkeyManager. Si falta cobertura critica de ApplyProfile en ModeEdit, anadela (table-driven con mock WindowHandle).
2. P1: settings_service.go (default hotkey) + profile_service.go (EmitLoaded origin en ModeEdit) + main.go (registro hotkey + handler). Tests Go.
3. P2: Verifica ParseHotkeyCombo("ctrl+shift+e"). Test de registro.
4. P3: CompositeApp.tsx (editMode + render condicional + handleChange + chip). Tests frontend.
5. P4: Ejecuta todos los checks.
6. P5: Docs + checklist manual.

CONTRATO DEL HANDLER DE HOTKEY (main.go):
- Lee overlayController.Status(). Si !Running, return.
- Lee profileSvc.Profile(). Si nil, return.
- Si profile.DisplayMode == ModeEdit -> target = ModeRacing. Si no -> target = ModeEdit.
- Llama profileSvc.SetDisplayMode(target). Si error, log y return.
- Llama profileSvc.EmitLoaded().
- Emite emitter.Emit("overlay:edit-mode-changed", map[string]any{"mode": string(target)}).

CONTRATO DE EmitLoaded (profile_service.go):
- En ModeEdit: origin = config.Rect{} (fullscreen, coords directas).
- En ModeRacing/otros: origin = s.mgr.LayoutOrigin(s.profile) (shrink-wrap, como hoy).

CONTRATO DE CompositeApp.tsx:
- editMode se inicializa false y se setea desde windowMode en profile:loaded y desde overlay:edit-mode-changed.
- En editMode: renderiza WidgetEditFrame por widget enabled (sin WidgetHost, sin toWindowLocal, posicion directa con w.position). handleChange actualiza perfil y emite layout:save { widgets }.
- En runtime: comportamiento actual (WidgetHost + toWindowLocal + editMode={false}).
- Chip EDIT_MODE (top-left) + instrucciones (bottom-left) solo en editMode.

CHECKS OBLIGATORIOS antes de declarar done:
- gofmt -l internal/ cmd/ (limpio)
- go test ./... (verde)
- go vet ./internal/app/... ./internal/window/... ./cmd/... (verde)
- pnpm --dir frontend test (verde)
- pnpm --dir frontend lint (verde)
- pnpm --dir frontend build (verde)
- git diff --check (limpio)

STOP CONDITIONS (para y pide revision):
- Si necesitas tocar un archivo prohibido.
- Si los tests fallan por causa que no entiendes.
- Si WidgetEditFrame no posiciona bien en fullscreen (coords).
- Si passthrough no se reactiva al volver a ModeRacing.
- Si necesitas una dependencia nueva.
- Si necesitas cambiar arquitectura.

EVIDENCIA FINAL:
- Archivos creados/modificados.
- Tests anadidos y resultado.
- Checks ejecutados y resultado.
- Checks no ejecutados y motivo.
- Riesgos restantes.
- Como verificar manualmente.
```

---

## 12. Checks ejecutados en este plan

- `git status --short`: working tree limpio (solo untracked docs, sin cambios en codigo de producto).
- `git log --oneline -10`: revisado historial reciente (sin cambios previos conflictivos).
- Lectura de `AGENTS.md` y `docs/current-plan.md`: completa.
- Inventario backend via explorer: `internal/app/overlay_controller.go`, `internal/window/manager.go`, `internal/app/hotkeys.go`, `internal/app/settings_service.go`, `internal/app/profile_service.go`, `internal/app/hub_service.go`, `cmd/vantare/main.go`.
- Inventario frontend via explorer: `frontend/src/overlay/CompositeApp.tsx`, `frontend/src/overlay/EditOverlayApp.tsx`, `frontend/src/overlay/WidgetEditFrame.tsx`, `frontend/src/overlay/WidgetHost.tsx`, `frontend/src/main.tsx`, `frontend/src/hub/overlays/LayoutStudio.tsx`.
- Verificacion directa de interfaces: `OverlayWindow`, `WindowHandle`, `EmitLoaded`, `profile:set-mode` handler.
- `git diff --check`: limpio (no se toco codigo de producto).

## 13. Confirmacion

**No se toco codigo de producto.** Este documento es PLAN ONLY. Los unicos archivos que se crearan/modificaran son:
- Este plan (nuevo doc).
- `docs/current-plan.md` (una linea de estado).
- `docs/overlay-edit-mode-manual-verification.md` (se creara en P5 al ejecutar, no ahora).

No se hizo commit, push, tag ni release.