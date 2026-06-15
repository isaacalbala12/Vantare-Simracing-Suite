# Changelog

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
