# ISA-1106 · Señales de sesión REST LMU hasta Overlay V2

Estado: implementado en rama `vantareapp/isa-1106-lmu-rest-session-signals`, base
`origin/nightly@131471ff`. Sin merge ni release. Revisión independiente pendiente
sobre el SHA final (no simulada aquí).

## Qué cambia

El lector REST LMU existente amplía `/rest/watch/sessionInfo` con tres señales
de sesión y las transporta por el recorrido canónico hasta el contrato
ViewModel compartido:

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
  `trackName`/`session`/`numberOfVehicles`/`currentEventTime`.
- Bandera de sesión (`yellowFlagState`): `FlagYellow` solo con evidencia
  positiva (distinto de cero numérico, cadena numérica distinta de cero o
  `true`). Ausente, null, cero, `false` o vocabulario no reconocido = missing:
  la ausencia jamás se lee como verde. `sectorFlag` se acepta y se ignora a
  propósito para la afirmación global: lo sectorial nunca promueve a global.
  `gamePhase` se acepta para futuro trabajo de vocabulario; lo desconocido
  queda missing sin fallar la sesión.
- Frescura/caducidad: TTL REST de 2 s ya existente; los campos se vuelven
  `stale` sin congelar marca temporal y se recuperan a `fresh` al reconectar.
  Una respuesta de sesión inválida (`currentEventTime` negativo, etc.) no
  registra éxito ni contamina valores previos (transaccional, como antes).
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
  Esa evidencia externa sostiene los nombres; la confirmación de
  enums/unidades en sesión activa de este equipo queda pendiente y NO se
  presenta como hecha.

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
