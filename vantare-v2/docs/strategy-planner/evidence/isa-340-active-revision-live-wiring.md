# ISA-340 / STR-17A — evidencia del wiring de la revisión activa

**Fecha:** 2026-08-14
**Base y merge-base:** `origin/nightly@d9e4bd352b62824b0e83a05b5c3c631fec1f0c73`
**Rama:** `vantareapp/isa-340-str-17a-resolver-la-revision-activa-y-cablear-el-motor-live`
**HEAD productivo verificado:** `668f54c3e87d9a26f41d593d71713e86b48a1134`

## Resultado

- El corte productivo contiene cuatro commits locales sobre la base Nightly:
  plan `2dd6a6af`, resolver `db7bceb1`, lifecycle `ca7eea01` y composition
  root `668f54c3`.
- `ResolveActivePlan` exige la referencia completa exacta de la revisión activa:
  plan, variante, ID de revisión y hash. Una colisión de ID con otra referencia
  es un error de integridad, no un resultado "no encontrado".
- Solo se admite `strategy.editor.v1`. El decoder valida JSON estricto,
  duplicados, campos desconocidos, límites, IDs de stint y `lapCount`; el plan
  live recibe únicamente ID y vueltas de cada stint. `FuelTargets` es
  exactamente `nil`: `fuelLitres` no se interpreta como una serie por vuelta.
- El único consumidor corre sobre el `StrategyHub` y el lifecycle ya poseídos
  por `TelemetryCoreRuntime`: mismo contexto, wait group, fail-stop y orden de
  cierre. No abre otro reader LMU, hub, endpoint, transporte ni storage.
- El composition root abre un solo repositorio Strategy y comparte esa misma
  instancia entre el bridge de aplicación y el snapshot de arranque. Resuelve
  y construye el engine una sola vez por startup; activar otra revisión durante
  la ejecución solo se aplica tras reiniciar.
- Estado ausente, revisión inexistente o incompatible, mismatch de integridad
  y error de repositorio deshabilitan solo Strategy live. Telemetry Core,
  Overlay y Engineer continúan. Los logs usan razones acotadas y no incluyen
  payload, paths locales, IDs, hash ni datos de telemetría.

## Reviews

- Task 1 — resolver y normalización: `APPROVED` tras corregir los hallazgos
  P1/P2.
- Task 2 — ownership del lifecycle: `APPROVED` tras corregir los hallazgos
  P1/P2.
- Task 3 — composition root y reinicio: `APPROVED` tras corregir los hallazgos
  P1/P2.
- No quedan findings P1/P2 abiertos en los tres cortes.

## Gates finales sobre `668f54c3`

- `go test -count=20 ./internal/strategy/live` — PASS.
- `go test -count=20 ./internal/app -run 'StrategyLive|StrategyExecution|TelemetryCore.*Strategy'`
  — PASS.
- `go test -count=20 ./cmd/vantare -run 'StrategyLive|ActiveRevision'` — PASS.
- `go test -count=1 ./internal/strategy/... ./internal/app ./internal/app/telemetrytransport ./cmd/vantare`
  — PASS.
- `go test -count=1 ./...` — PASS final en 37,6 s. La primera corrida global
  tuvo dos timeouts ajenos al cambio; ambos pasaron aislados y la repetición
  global final quedó verde.
- `go vet ./internal/strategy/live ./internal/app ./cmd/vantare` — PASS.
- `gofmt -l internal/strategy/live internal/app cmd/vantare` — limpio.
- `git diff --check` — PASS.
- `pnpm --dir frontend build` — PASS, 897 módulos; lockfile sin cambios. Fue
  solo el prerrequisito del embed de `cmd/vantare`: ISA-340 no modifica source
  frontend.

No se ejecutó `go test -race`: este host conserva `CGO_ENABLED=0` y no dispone
de GCC. Tampoco se ejecutó la suite frontend porque no se tocó source frontend.

## Evidencia LMU integrada

El primer intento opt-in de solo lectura dejó `TestStrategyLiveLMUOptIn` en
`source=degraded` y permitió aislar en ISA-361 / TC-03C.1 que, con dos procesos
`Le Mans Ultimate.exe`, el detector abandonaba ante el primer candidato cuya
ruta no podía consultar.

Para validar el arreglo y el wiring sin mezclar las ramas de issue se creó la
integración local desechable
`integration/isa-340-361-local-smoke@6de086d1fec4f9ef34e35012d209bc0ccfbc34fa`
sobre `nightly@d45d8d8d7f815562af76a14ad7343b692dac41db`. El árbol aplicó estos
cherry-picks exactos:

- ISA-361 productivo `02097860` -> `da1b9930`.
- ISA-340 resolver `db7bceb1` -> `404d817c`.
- ISA-340 lifecycle `ca7eea01` -> `3238e819`.
- ISA-340 composition root `668f54c3` -> `6de086d1`.

El plan y la documentación ISA-340 no se incorporaron a esa integración. El
build frontend requerido, los gates Go focales y la suite Go global pasaron
sobre el árbol combinado.

El primer smoke combinado se ejecutó sin jugador en pista y falló con cursor
`0/0`; por tanto, no aportó evidencia del camino live en pista. Después de que
Isaac confirmara explícitamente que el coche estaba en pista, el probe se
ejecutó exactamente una vez y pasó con:

- source `live`;
- cursor `epoch=1`, `sequence=3`;
- vueltas completadas `0`, present y fresh;
- Fuel `98/115 L`, amount/capacity present y fresh;
- desviación missing, correctamente, porque la revisión activa no contiene un
  objetivo Fuel exacto por vuelta.

Esto acredita el camino productivo LMU -> Telemetry Core -> Strategy con el
jugador en pista. No acredita una prueba manual completa de la aplicación Wails:
siguen pendientes la creación/activación por UI, la comprobación de logs y
consumer tras reiniciar, y la desactivación seguida de otro reinicio. Tampoco
acredita cobertura `-race`.

## Estado de entrega

El resultado está validado en la rama de issue y en una integración de smoke,
ambas solo locales. No hubo push, PR, CI remoto, merge, promoción a `nightly`,
`testers` o `master`, ni release. Linear fue sincronizado previamente mediante
el MCP directo: los seis criterios técnicos están
marcados y la issue permanece `In Progress` hasta la prueba manual/publicación.
ISA-153 queda técnicamente
desbloqueable, pero esta evidencia no la marca terminada ni autoriza empezar,
integrar o promover ese corte. Testers permanece diferido por instrucción de
Isaac.
