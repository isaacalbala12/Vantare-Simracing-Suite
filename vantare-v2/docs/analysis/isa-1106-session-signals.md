# ISA-1106 · Señales de sesión REST LMU hasta Overlay V2

Estado: implementado en rama `vantareapp/isa-1106-lmu-rest-session-signals`, base
`origin/nightly@131471ff`. Sin merge ni release. Revisión independiente pendiente
sobre el SHA final (no simulada aquí).

## Qué cambia

El lector REST LMU existente amplía `/rest/watch/sessionInfo` con las señales
de sesión disponibles y las transporta por el recorrido canónico hasta el
contrato ViewModel compartido:

`sessionInfo` → `RESTObservation` → fusión (REST-joined, precedente carNumber:
sin fuente SHM admitida, sin regla de matriz nueva) → `Observation` →
`BatchMapper` → `core.ObservedState` → `BuildSession.Flag` /
`BuildWeather.AmbientC` + `TrackC` → `SessionV2` / `WeatherV2` (forma del wire
intacta; el frontend ya trata `missing` con `—` y diagonales neutras).

- Temperaturas aire/pista (`ambientTemp`, `trackTemp`, Celsius canónico
  `weather.Temperature`): presente numérico finito dentro de rango plausible
  (−30…60 aire, −20…80 pista) = observado; ausente/null = missing; presente
  no numérico, no finito o fuera de rango = invalid. Cada campo es
  independiente: un campo malo nunca contamina a sus hermanos ni a
  `trackName`/`session`/`numberOfVehicles`/`currentEventTime`. Un campo
  ignorado (`gamePhase` en cualquier forma, `sectorFlag`) jamás bloquea la
  sesión (corrección B1).
- Bandera de sesión (mapeo candidato documentado B2, NO fuente certificada):
  el vocabulario de valores se adopta provisionalmente del header oficial
  distribuido con LMU (`Support/SharedMemoryInterface/InternalsPlugin.hpp`:
  "Yellow flag states (applies to full-course only)": -1 Invalid, 0 None,
  1 Pending, 2 Pits closed, 3 Pit lead lap, 4 Pits open, 5 Last lap,
  6 Resume, 7 Race halt (not currently used)), corroborado por el header
  original isiMotor y un consumidor independiente con el mismo mapa. Solo los
  enteros JSON inequívocos 2, 3, 4, 5 afirman `FlagYellow`; 1 (Pending) y 6
  (Resume) quedan neutros como ambiguos; -1, 0, 7, otros enteros,
  fracciones, strings, bool, arrays, objetos, null y ausente quedan missing.
  Sin atajos `!= 0`, sin coerciones ni alias, sin verde predeterminado, sin
  otros colores. La equivalencia REST == códigos SHM sigue pendiente de
  verificación (solo paridad de nombres): confianza alta en el SDK, media-
  baja en el puente REST. El criterio de aceptación física de la issue sigue
  pendiente: una captura en sesión activa con el `yellowFlagState` visible
  cierra la equivalencia. Las temperaturas no dependen de ello.
- Frescura/caducidad: TTL REST de 2 s ya existente; los campos se vuelven
  `stale` sin congelar marca temporal y se recuperan a `fresh` al reconectar.
  Una respuesta de sesión inválida (`currentEventTime` negativo, etc.) no
  registra éxito ni contamina valores previos (transaccional, como antes).
- Alcance de sesión (corrección B3): cada señal lleva el `sessionFloor` de
  fusión como el grid carNumber —valores de la sesión anterior pasan a
  `missing` aunque el TTL siga vigente, sin tocar marcas ni alargar TTL— y
  solo un REST nuevo las recupera.
- Proyección regulada (corrección B4): `ambientTemp`/`trackTemp` (valor y
  calidad) invalidan `SectionWeather` con el patrón de señales finas
  existente; el scheduler la reconstruye dentro de la política vigente
  (intervalo slow, techo 1 s) sin cambiar tasas. Sin optimización ni refactor.
- Fuera de alcance explícito: lluvia/viento/presión (siguen `missing`),
  `flag`/`underYellow` por coche, vocabulario completo de banderas
  (verde/rojo/FCY) y el endpoint de previsión `/rest/sessions/weather`
  (`WNV_*` por nodos PRACTICE/QUALIFY/RACE): es configuración prevista, jamás
  lectura actual, y no alimenta ningún builder.

## Evidencia real frente a fixtures

Evidencia real (solo lectura GET puntual, sin abrir/cerrar/configurar LMU ni
navegar/conducir, sin datos de usuario/pilotos):

- `GET /rest/watch/sessionInfo` → HTTP 200 cuerpo vacío; `GET
  /rest/watch/standings` → HTTP 200 cuerpo vacío; juego en `NAV_MAIN_MENU`,
  `BEFORE`, `GSTATE_SETUP` (menú, antes de sesión activa): no hay señales que
  validar en pista en este equipo hoy.
- `GET /rest/sessions/weather` → HTTP 200, 5473 bytes, `PRACTICE`/`QUALIFY`/
  `RACE` con cinco nodos (`START`, `NODE_25`, `NODE_50`, `NODE_75`, `FINISH`);
  cada nodo expone `WNV_HUMIDITY`, `WNV_RAIN_CHANCE`, `WNV_SKY`,
  `WNV_TEMPERATURE`, `WNV_WINDDIRECTION`, `WNV_WINDSPEED`: forecast
  configurado, no temperatura actual del asfalto.
- `GET /swagger-schema.json` → HTTP 200, 63555 bytes: enumera los endpoints,
  no define los campos de sus respuestas.
- Nombres candidatos `ambientTemp`, `trackTemp`, `gamePhase`, `sectorFlag`
  (singular), `yellowFlagState` y `flag`/`underYellow` por coche: documentados
  por un consumidor externo con captura REST en pista (race-engineer
  `03-LMU-INTEGRATION.md`, spikes S1/S2 en vivo 2026-06-14/16: `mGamePhase =
  5` en verde, `mYellowFlagState = 0` en verde, `mSectorFlag` con valores 1 y
  11 de enum pendiente, `GetGameState` con cadenas como `GPHASE_GREEN`).
  Esa evidencia externa sostiene los nombres de `sessionInfo` (la tabla S2
  los enumera junto a `maxTime`, `maximumLaps`, `raceCompletion`,
  `timeRemainingInGamePhase`, `raining`, `windSpeed`) y las unidades Celsius
  de SHM (`mAmbientTemp`/`mTrackTemp`); el vocabulario de valores amarillos
  se adopta del SDK oficial distribuido con LMU (ver sección Bandera) con la
  equivalencia REST pendiente de captura en sesión activa de este equipo, que
  NO se presenta como hecha. El usuario aún no respondió la petición de
  sesión activa.

Fixtures y tests (`rest_session_signals_test.go`,
`builder_session_signals_test.go`, auditoría de superficies exactas
actualizada): demuestran el contrato —normal, ausente, null, malformed,
stale, reconnect, no-contaminación entre sesiones, independencia por campo,
fusión y proyección— pero no equivalen a evidencia física.

## Archivos

- `internal/telemetry/drivers/lmu/rest.go`: decodificación tolerante por
  campo, `RESTObservation`/caché/stale/snapshot, `parseRESTTemperature`,
  `parseRESTSessionFlag`.
- `internal/telemetry/drivers/lmu/format.go`: `Observation` +3 campos.
- `internal/telemetry/drivers/lmu/fusion.go`: carry REST-joined con TTL.
- `internal/telemetry/drivers/lmu/batch_mapper.go`: mapeo a `Batch`.
- `internal/telemetry/core/reducer.go`: `ObservedState` +3 campos.
- `internal/telemetry/schema/session/types.go`: `session.Flag` + `FlagYellow`.
- `internal/telemetry/projection/overlayv2/builder_session.go`,
  `builder_weather.go`: proyección con calidad preservada.
- Tests nuevos + superficies exactas de la auditoría Strategy actualizadas
  (matriz v6/38 intacta; Strategy v1 sigue declarando weather unsupported,
  correcto: el carry es solo Overlay V2).

## Cómo verificar manualmente

1. Con LMU en menú: `sessionInfo` vacío → Efficiency/racing-flags muestran
   `—`/neutro, sin verde inventado (comportamiento ya observable en el
   candidato visual #1098).
2. En sesión activa futura: capturar `sessionInfo` real, confirmar
   enums/unidades y comprobar que `flag`/`ambientC`/`trackC` del frame V2
   reflejan la fuente con su calidad; la comprobación combinada con el
   renderer Efficiency (#1103/PR1107) se hará en worktree separado.
