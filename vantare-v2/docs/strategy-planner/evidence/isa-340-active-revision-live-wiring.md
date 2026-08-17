# ISA-340 / STR-17A — evidencia del wiring de la revisión activa

**Fecha:** 2026-08-17
**Base y merge-base:** `origin/nightly@7a92241d4a1c7375106e601ce2daee36e6328758`
**Rama:** `vantareapp/isa-340-str-17a-resolver-la-revision-activa-y-cablear-el-motor-live`
**HEAD productivo verificado:** `7452c8ef817535d8c3c29562ce7ece24a2092490`
**Revisión de implementación/documentación validada por CI:** `ee008cc00b601c280df7c62c930a6e66f2628f4c`

**Backup pre-reconciliación:** `backup/isa-340-pre-reconcile-20260817` en
`abaf5f7931ef4cfe8ef19297e99aa9b6bbe2c556`.

## Resultado

- El corte productivo contiene cuatro commits de implementación sobre la base
  Nightly actual: `9f6c9c9f` (wiring), `63f4f87f` (resolver), `4b9f63f4`
  (lifecycle) y `7452c8ef` (composition root). La rama incorpora además el
  expediente documental de entrega. La reconciliación desde la rama histórica
  se realizó sin conflictos.
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

## Gates finales sobre `7452c8ef`

- `go test -count=20 ./internal/strategy/live` — PASS.
- `go test -count=20 ./internal/app -run 'StrategyLive|StrategyExecution|TelemetryCore.*Strategy'`
  — PASS.
- `go test -count=20 ./cmd/vantare -run 'StrategyLive|ActiveRevision'` — PASS.
- `go test -count=1 ./...` — PASS.
- `go vet ./internal/strategy/live ./internal/app ./cmd/vantare` — PASS.
- Los archivos Go propios del diff pasan `gofmt -l`; el chequeo amplio
  `gofmt -l internal/strategy/live internal/app cmd/vantare` sigue listando
  únicamente `internal/app/diagnostics_service.go`, deuda heredada de
  `origin/nightly` y fuera del alcance de ISA-340.
- `git diff --check` — PASS.
- `pnpm --dir frontend build` — PASS, 918 módulos; lockfile sin cambios. Fue
  solo el prerrequisito del embed de `cmd/vantare`: ISA-340 no modifica source
  frontend.
- `wails3 build DEV=true` — PASS, binario Windows generado correctamente.

No se ejecutó `go test -race`: este host conserva `CGO_ENABLED=0` y no dispone
de GCC. Tampoco se ejecutó la suite frontend porque no se tocó source frontend;
sí se ejecutaron el typecheck y el build productivo.

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
jugador en pista. En el momento de esa ejecución aún no acreditaba por sí sola
la prueba manual completa de Wails; la confirmación manual posterior de Isaac,
documentada abajo, cerró UI, reinicio, logs y desactivación. Tampoco acredita
cobertura `-race`.

## Actualización de smoke Wails (2026-08-17)

Isaac confirmó el recorrido manual de persistencia ejecutado en una aplicación
Wails aislada sobre la acumulación que contiene ISA-340: crear/guardar una
revisión, activarla, reiniciar y recuperar el plan activo, desactivarlo y
reiniciar de nuevo. También confirmó el reinicio con LMU, el log con una sola
revisión resuelta sin payload y la continuidad simultánea de Overlay y Engineer
al desactivar Strategy. La evidencia de esos tres puntos es confirmación
manual de Isaac; no se adjuntó un artefacto de log en el repositorio.

El resultado actual es, por tanto:

- UI create/save/activate: confirmado manualmente.
- LMU + log de resolución única sin payload: confirmado manualmente.
- Camino live con jugador en pista: confirmado por el probe integrado anterior.
- Fuel observado y desviación missing sin objetivo: confirmado por el probe.
- Deactivate + restart con continuidad Overlay/Engineer: confirmado
  manualmente.

## Estado de entrega

El resultado está validado en la rama de issue reconciliada y en una
integración de smoke. La rama ya está publicada en `origin` y existe el PR
draft `#280` hacia `nightly`; el run de la revisión validada
`32047829206` pasa todos los gates bloqueantes. Solo quedan avisos advisory de
lint global heredado. No hubo merge, promoción a `testers` o `master`, ni
release. Linear permanece `In Progress` mientras la revisión del PR esté
pendiente: los seis criterios técnicos y la verificación manual están
confirmados. No se adjuntó un artefacto de log. ISA-153 queda técnicamente
desbloqueable, pero esta evidencia no la marca terminada ni autoriza empezar,
integrar o promover ese corte. Testers permanece diferido por instrucción de
Isaac.
