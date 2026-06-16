# Changelog

## v0.3.0-alpha.1 - 2026-06-16

Hub refactor: per-widget WYSIWYG preview, Profiles widget toggles, and removal of the old Preview Workbench.

### Incluido

- **WidgetsPage**: nueva página de previsualización individual de widgets con el componente real escalado, lista lateral de widgets, inspector para editar apariencia y posición, dirty state con indicador visual y botón "Deshacer" de un nivel, y botón "Guardar" que emite `profile:save`.
- **ProfilesPage mejorada**: suscripción al perfil activo vía `hub:profile`, panel expandible por perfil con lista de checkboxes para habilitar/deshabilitar widgets individualmente. Cada toggle emite `profile:widget:update`.
- **WidgetPreview**: componente que renderiza cada widget overlay real escalado (`scale=0.5`) dentro de un contenedor con `overflow-hidden`, usando el registry compartido de componentes.
- **Shared widget component registry**: extraído a `shared-widget-map.ts`, reutilizado por `CompositeApp`, `ObsOverlayApp` y `WidgetPreview`.

### Eliminado

- **Preview Workbench antiguo**: eliminados `PreviewPage`, `PreviewCanvas`, `PreviewCanvas.test`, `PreviewWidgetFrame`, `PreviewWidgetFrame.test` y `WidgetList`. La ruta `preview` desaparece del Hub.
- **Topbar**: eliminada la entrada "Overlays" (preview) y la rama muerta `'live'`.
- **`Section` type**: finalizado a `'dashboard' | 'profiles' | 'widgets' | 'telemetry' | 'setup'`.

### Cambiado

- Versión de la app, `build/config.yml` e instalador NSIS actualizada a `0.3.0`.

## v0.2.9-alpha.1 - 2026-06-16

Hotfix de vibración de la app.

### Corregido

- **App que vibra / salta**: el auto-hide de scrollbar hacía que el ancho del `main` cambiara al aparecer/desaparecer la barra. Eso disparaba el `ResizeObserver` del canvas de preview, reescalaba toda la escena y entraba en un bucle de vibración. Se ha cambiado a una scrollbar estable (`scrollbar-gutter: stable`) siempre presente, fina y muy translúcida.
- **`ScrollableMain` simplificado**: ya no alterna clases de estado; solo aplica la clase base que estiliza la scrollbar.

### Cambiado

- CSS de scrollbar en `index.css` usa `scrollbar-gutter: stable` y color fijo.
- `ScrollableMain.tsx` elimina estado y timers.
- Versión de la app, `build/config.yml` e instalador NSIS actualizada a `0.2.9`.

## v0.2.8-alpha.1 - 2026-06-16

Reescritura del drag y resize del Preview Workbench.

### Corregido

- **Proporciones de widgets restauradas**: el resize ahora es libre desde la esquina inferior-derecha; ya no fuerza ratios incorrectos como `relative = 0.5` que hacía los widgets achatados.
- **Estela al arrastrar widgets**: el drag mueve el elemento DOM directamente sin re-renderizar el padre. El perfil se commitea solo en `mouseup`.
- **Resize brusco**: `PreviewWidgetFrame` mantiene su propio estado local durante el resize y usa el rectángulo original como base, evitando acumulación de deltas.
- **App que "salta" / se mueve**: eliminado el estado intermedio `previewRects` del padre, que provocaba re-renders masivos de toda la página.
- **Tests actualizados**: `PreviewWidgetFrame.test.tsx` ahora pasa `scale` requerido.

### Cambiado

- `PreviewCanvas` mueve el widget afectado vía DOM directo durante el drag.
- `PreviewWidgetFrame` gestiona su propio estado visual de resize y commit final.
- Versión de la app, `build/config.yml` e instalador NSIS actualizada a `0.2.8`.

## v0.2.7-alpha.1 - 2026-06-16

Arreglo definitivo del drag y resize en Preview Workbench.

### Corregido

- **Estela al arrastrar widgets**: el drag y resize ahora usan estado local en `PreviewCanvas` y solo commitean el perfil al soltar el ratón. Esto elimina el lag visual y la estela dejada por los widgets.
- **Resize brusco / widget se encoge de golpe**: `PreviewWidgetFrame` ya no gestiona su propio `mousemove`; ahora informa a `PreviewCanvas` del inicio del resize, que calcula el delta contra el rectángulo original. Se añadió un threshold de 1 px lógico para ignorar micro-movimientos accidentales.
- **Re-renders innecesarios**: `PreviewWidgetFrame` ahora usa `React.memo` y recibe una `previewPosition` opcional; durante el drag/resize solo el widget afectado se repinta, no toda la escena.
- **Tests actualizados**: `PreviewCanvas.test.tsx` ahora espera el commit en `mouseup` y tiene un nuevo test de resize.

### Cambiado

- Refactor completo de `PreviewCanvas` y `PreviewWidgetFrame`.
- Versión de la app, `build/config.yml` e instalador NSIS actualizada a `0.2.7`.

## v0.2.6-alpha.1 - 2026-06-16

Scrollbar auto-hide en el Hub.

### Corregido

- **Scrollbar invisible hasta que se hace scroll**: ahora la barra de scroll está oculta por defecto y solo aparece (fina y translúcida) durante el scroll. Tras 1 segundo de inactividad vuelve a desaparecer.
- **Impacto visual mínimo**: ancho reducido a 4 px, opacidad baja (`rgba(255,255,255,0.12)`), sin track. Se funde con el fondo oscuro del Hub.
- **Firefox compatible**: se usa `scrollbar-width: none` en reposo y `thin` durante el scroll.

### Cambiado

- Nuevo componente `ScrollableMain` que gestiona la clase `scrollable-active` y el timer de auto-hide.
- CSS de scrollbar movido a `.scrollable-main` / `.scrollable-active` en lugar de `html.hub *`.
- Versión de la app, `build/config.yml` e instalador NSIS actualizada a `0.2.6`.

## v0.2.5-alpha.1 - 2026-06-16

Scrollbars elegantes en el Hub.

### Corregido

- **Scrollbar estilo macOS/VS Code**: la barra de scroll ahora es fina (6 px), track transparente y thumb translúcido que se ilumina al pasar el cursor. Funciona en WebKit/Chromium y Firefox.
- **Scrollbars ocultas en modo overlay**: `body:not(.hub)` no muestra scrollbar, preservando la transparencia del overlay.

### Cambiado

- Añadidas reglas CSS de scrollbar bajo `html.hub *` en `index.css`.
- Versión de la app, `build/config.yml` e instalador NSIS actualizada a `0.2.5`.

## v0.2.4-alpha.1 - 2026-06-16

Mejora del scroll global en todas las páginas del Hub.

### Corregido

- **Scroll elegante en todo el Hub**: el layout ahora usa una columna de altura de ventana (`h-screen`) con `Topbar` sticky y `main` scrollable (`flex-1 overflow-y-auto`). Esto elimina las barras de scroll duplicadas y permite desplazarse suavemente por Dashboard, Overlays, Preview y Ajustes sin cortes.
- **Eliminado `overflow: hidden` global para el Hub**: las reglas CSS del root ahora permiten scroll cuando `body.hub` está activo, sin afectar el modo overlay transparente.

### Cambiado

- `Topbar` pasa de `fixed` a `sticky`, eliminando la necesidad de `pt-14` en el contenido.
- Versión de la app, `build/config.yml` e instalador NSIS actualizada a `0.2.4`.

## v0.2.3-alpha.1 - 2026-06-16

Hotfix del cierre de la app.

### Corregido

- **Cierre bloqueado**: al pulsar la X de la ventana, la app a veces mostraba "Vantare no responde". El `HotkeyManager.Stop()` esperaba indefinidamente a que terminara el message loop de Windows. Ahora espera como máximo 2 segundos y continúa el cierre si el loop no responde.

### Cambiado

- Versión de la app, `build/config.yml` e instalador NSIS actualizada a `0.2.3`.

## v0.2.2-alpha.1 - 2026-06-16

Hotfix de UX del editor y scroll.

### Corregido

- **Scroll global**: la app ahora permite hacer scroll vertical en el Hub y en Preview Workbench, evitando que elementos queden fuera de la pantalla.
- **Bug de resize**: al hacer clic en el handle de resize ya no se dispara el drag del widget. El resize ahora funciona correctamente sin que el widget "salte" a una posición incorrecta.

### Cambiado

- Versión de la app, `build/config.yml` e instalador NSIS actualizada a `0.2.2`.

## v0.2.1-alpha.1 - 2026-06-16

Hotfix del updater e instalador.

### Corregido

- **Updater no reinstalaba correctamente**: el instalador descargado se guardaba en un directorio temporal que se eliminaba inmediatamente tras lanzar el proceso. Ahora se persiste en `{cfgDir}/update` hasta que el instalador termine.
- **NSIS más robusto ante app en ejecución**: el instalador ahora verifica que `vantare.exe` se haya cerrado realmente (esperando hasta 5s + forzando cierre si es necesario) y comprueba que el archivo no esté bloqueado antes de reemplazarlo.
- **Verificación de extracción del instalador**: el instalador verifica que `vantare.exe` se haya extraído y tenga un tamaño razonable antes de borrar el backup; si falla, restaura la versión anterior con un mensaje claro.

### Cambiado

- Versión de la app, `build/config.yml` e instalador NSIS actualizada a `0.2.1`.

## v0.2.0-alpha.1 - 2026-06-16

Primera alpha completa para Le Mans Ultimate.

### Incluido

- **Editor visual del Preview Workbench**:
  - Drag & drop con snap a 8px y límites estrictos del canvas (1920x1080).
  - Resize con handle inferior-derecho; ratio fijo por tipo de widget excepto standings.
  - Inspector mejorado: nombre, updateHz, duplicar, reset, eliminar con confirmación.
  - Guardado manual + auto-save debounced + Ctrl+S + undo/redo básico.
- **Demo mode** en Preview Workbench: telemetría animada para diseñar sin sim; se detiene automáticamente si llega telemetría live.
- **Delta Best fiable**: nuevo engine por distancia en pista con modos self/session/global.
- **Ajustes globales**: selector de modo delta, hotkeys configurables, toggle de muestreo de CPU y sección OBS.
- **Hotkeys globales Windows**: toggle overlay y cambio de perfil siguiente/anterior.
- **OBS setup facilitado**: URL del overlay e instrucciones, tanto en Preview como en Settings.
- **Ops panel**: CPU del proceso real via gopsutil, con toggle de activación.
- **Visibilidad condicional básica**: mostrar/ocultar widgets según inPit y sessionType.

### Cambiado

- Versión de la app, `build/config.yml` e instalador NSIS actualizada a `0.2.0`.

## v0.1.6-prealpha - 2026-06-15
Pre-alpha de pulido del instalador: cierre graceful de la app y rollback automático.

### Incluido

- **Cierre graceful en NSIS**: antes de instalar, el instalador intenta cerrar Vantare mediante `CloseMainWindow()`, espera 3 segundos y solo usa `taskkill /F` como último recurso. Evita perder perfiles o layouts no guardados.
- **Rollback automático del ejecutable**: el instalador guarda una copia de seguridad de `vantare.exe` antes de reemplazarlo; si la extracción de archivos falla, restaura el backup y aborta la instalación.

### Cambiado

- Versión de la app, `build/config.yml` e instalador NSIS actualizada a `0.1.6`.

## v0.1.5-prealpha - 2026-06-15

Pre-alpha de robustecimiento del updater, instalador y UI antes de las features principales.

### Incluido

- **Updater mejorado**:
  - Verificación SHA256 del instalador antes de ejecutarlo (`InstallVerified` y `verifyChecksum` en `internal/updater/updater.go`).
  - Ignorar versión persistente (`ignoreVersion` en `internal/updater/settings.go` y método `IgnoreVersion`).
  - Comparación semántica de versiones en `internal/updater/version.go` con `ParseVersion` y `Compare`.
  - Auto-check silencioso al inicio que emite `updater:notify` cuando hay una actualización disponible.
  - Eventos adicionales: `updater:ignore`, `updater:install:verified`, `app:version` y `app:version:get`.
- **UI del updater**:
  - Banner flotante `UpdateBanner` para mostrar y saltar actualizaciones desde cualquier pantalla.
  - Changelog expandible en la lista de versiones.
  - Confirmación de downgrade con advertencia antes de instalar una versión anterior.
  - Botón "Saltar" para ignorar una versión sin instalarla.
  - Enlace de descarga manual directo al asset del instalador.
- **Topbar**: muestra la versión actual recibida por `app:version`.
- **Instalador NSIS**: ahora usa ámbito de usuario (`RequestExecutionLevel user`, `WAILS_INSTALL_SCOPE user`) para evitar UAC y permitir actualizaciones sin administrador.

### Cambiado

- Versión de la app y del instalador actualizada a `0.1.5` en `cmd/vantare/main.go`, `build/config.yml` y `build/windows/nsis/project.nsi`.

## v0.1.4-prealpha - 2026-06-15

Pre-alpha con sistema de actualizaciones integrado desde GitHub.

### Incluido

- **Updater integrado**:
  - Nuevo `internal/updater` para consultar releases de GitHub, filtrar por canal (stable/prerelease) y descargar/instalar la versión seleccionada.
  - Nuevo `UpdaterService` Wails con eventos `updater:settings:get`, `updater:settings:save`, `updater:check` e `updater:install`.
  - Nueva página **Ajustes** en el Hub (sección *Setup*) con selector de canal, listado de versiones, indicador de versión actual e instalación por versión.
  - Progreso de descarga vía `updater:progress` y confirmación con `updater:installed`/`updater:error`.

### Cambiado

- Versión de la app y del instalador NSIS actualizada a `0.1.4`.

## v0.1.3-prealpha - 2026-06-15

Pre-alpha de robustecimiento del streaming SSE/OBS y del pipeline de telemetría live.

### Corregido

- **Ciclo de vida del EventSource en OBS** (`frontend/src/overlay/ObsOverlayApp.tsx`): se crea el `EventSource` directamente en una variable accesible desde el cleanup, se cancela si el componente se desmonta durante el fetch y se limpia telemetry-ref al cargar un nuevo perfil.
- **`flushEmit` no bloquea suscripciones** (`internal/telemetry/service/service.go`): ahora copia la lista de suscriptores bajo lock, libera `subsMu` y luego envía, evitando que clientes lentos retrasen nuevas suscripciones.
- **Logging de errores REST de LMU** (`internal/app/lmu_enriched_source.go`): `lmuRESTCache.poll()` ahora loguea errores de `Standings` y `SessionInfo` con rate limiting de 5s para evitar spam.
- **Keep-alive SSE y compatibilidad con proxies** (`internal/server/sse.go`): se añade cabecera `X-Accel-Buffering: no` y se envían comentarios keep-alive cada 15 segundos para mantener la conexión activa detrás de proxies y evitar cortes por inactividad.

## v0.1.2-prealpha - 2026-06-15

Pre-alpha de robustecimiento del pipeline de telemetría live y limpieza de recursos.

### Corregido

- **LMU live por defecto**: el flag `-live` ahora defaulta a `true` en `cmd/vantare/main.go`, por lo que el ejecutable instalado intenta conectar a LMU sin necesidad de argumentos. Usar `-live=false` fuerza el modo mock.
- **Limpieza del singleton de telemetría** (`frontend/src/lib/telemetry-ref.ts`):
  - `clearRuntimeTelemetry` ahora resetea `timeRemaining`, `sessionType`, `sessionName`, `sessionKey` y `playerHasVehicle`.
  - El estado inicial de `sessionState` pasa de `""` a `"offline"`.
  - `applyTelemetryUpdate` valida que exista `payload.snapshot` antes de acceder a él.
- **Reset al cargar perfil**: `CompositeApp` llama a `resetTelemetryRef` al recibir `profile:loaded`, evitando que widgets muestren datos de una sesión/perfil anterior.
- **Fuga de handle de memoria compartida**: `enrichedLMUSource.Close()` ahora cierra el mmap subyacente (`LMUSource`), no solo la caché REST.
- **Doble cierre de fuente LMU**: `App.StopTelemetry()` ya no cierra `lmuSource` por separado; delega el cierre en `a.source`.

## v0.1.1-prealpha - 2026-06-15

Pre-alpha de correcciones y refinamientos para Relative y Standings.

### Incluido

- **Relative Widget**:
  - Corrección en el orden visual de los coches de delante: el 3º más lejano va arriba y el 1º más cercano queda justo encima del jugador.
  - Gaps de tiempo basados en distancia física circular en pista (wrap-around) en segundos.
- **Standings Widget**:
  - Filtro dinámico por clase: expone únicamente a los pilotos de la categoría del jugador (p. ej. LMP3).
  - Muestra la posición del piloto dentro de su categoría (`1º` a `Nº`) en lugar de la general.
  - Mapeado el tiempo restante de sesión (`timeRemainingInGamePhase`) y la clase activa en tiempo real al encabezado del panel.
  - Gaps de carrera calculados respecto al líder de la categoría.
  - Colores unificados por estado: texto blanco para coches en pista, gris (`#9CA3AF`) para coches en pit/box.
  - Badge de PIT más pequeño y adaptativo sobre el número del coche sin cortarse.
- **Infraestructura**:
  - Añadidas cabeceras e instrucciones HTML de anti-caché en `index.html` para evitar que los navegadores sirvan JS antiguos al recompilar.
  - Exclusión de vueltas netas en la lógica del backend para obtener gaps físicos estables y coherentes.

### Corregido

- **Conexión LMU por defecto**: el ejecutable instalado (`vantare.exe`) ahora inicia en modo live intentando conectar a la memoria compartida `LMU_Data` y a la API REST local de Le Mans Ultimate. Antes arrancaba en modo mock porque el flag `-live` defaultaba a `false`, por lo que los widgets de standings/relative no mostraban datos reales al abrir la app desde el instalador. Para forzar mock se puede usar `vantare.exe -live=false`.

## v0.1.0-alpha.1 - 2026-06-15

Primera alpha pública de Vantare Overlays v2.

### Incluido

- App v2 en `vantare-v2/` con Go + Wails v3 + React 19.
- Hub principal con dashboard, perfiles, Preview Workbench y panel Ops.
- Overlay desktop runtime bajo demanda: se abre solo al pulsar `Iniciar`.
- Ventana overlay fullscreen, transparente, always-on-top y click-through.
- Preview Workbench para elegir perfil, editar layout, activar/desactivar widgets, guardar e iniciar/detener overlay.
- Perfiles JSON en `vantare-v2/configs/*.json`.
- Telemetría live de Le Mans Ultimate mediante shared memory `LMU_Data`.
- Widgets visuales iniciales estilo Vantare Racing: standings, relative, delta, telemetry, telemetry vertical y pedals.
- Relative y Standings conectados a datos reales de LMU.
- Pipeline Go con normalizer, deadband, diff y emisión UI limitada.
- OBS/HTTP/SSE técnico:
  - `GET /health`
  - `GET /overlay?profile=...`
  - `GET /api/profile?profile=...`
  - `GET /telemetry/stream`
- Lite mode y tokens de tema runtime.
- Ops panel a baja frecuencia con RAM, goroutines y fuente de telemetría.

### Limitaciones conocidas

- Delta real (`deltaBest`) todavía no está conectado/calculado con datos live fiables de LMU.
- iRacing y Assetto Corsa son foundation/roadmap; no son adapters completos en esta alpha.
- OBS real debe validarse en una instalación de OBS; HTTP/SSE ya está implementado.
- CPU del panel Ops se muestra como `N/D`.
- Auth, cloud sync, marketplace y planes Pro/Ultimate quedan fuera de esta alpha.
- El directorio `apps/desktop/` es v1 legado y no forma parte de la alpha v2.

### Verificación requerida

```powershell
cd C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2
go test ./...
pnpm --dir frontend test
pnpm --dir frontend build
```
