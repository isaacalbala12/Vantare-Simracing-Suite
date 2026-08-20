# ISA-372 / F7 — aislamiento de consumidores

Fecha: 2026-08-19.

Rama: `vantareapp/isa-372-tc-f7-aislamiento-consumidores`.

Base: `tc-integration@f65f485fae50df472e5bea75a1dba5feed7ea8fe`
(Nightly + F0 + F1 + F4 + F5 + F2 + F3 + F6).

## Resultado

Engineer ya no ejecuta su callback dentro del bucle que acepta telemetría. Su
puerto default-on tiene una goroutine propia, estado latest-wins con canal de
capacidad 1 y timeout de 250 ms por defecto. Los facts usan otro canal: son
ordenados por epoch/secuencia, tienen retención acotada y declaran
`FactResyncRequiredError` ante hueco, overflow o fallo de proyección. Ninguno se
coalesce ni se pierde silenciosamente.

Strategy conserva el builder y `StrategyLiveRuntime`, pero no crea Hub ni
registra Wails/SSE por defecto. `-strategy-public-transport` recupera el
transporte anterior durante el ciclo de rollback. No existe suscriptor
productivo `telemetry:strategy:*` en `frontend/src`.

Recording conserva una cola acotada y sigue desconectado del runtime. Cuando
`TryAccept` rechaza por backpressure, registra el cursor inicial/final del lote
perdido, incrementa `CoordinatorStatus.GapMarkers` y expone `Incomplete`
inmediatamente. `GapMarkers()` devuelve una copia; no permite fingir
continuidad ni bloquear el Core.

## Política por consumidor

| Consumidor | Semántica | Saturación / fallo | Observabilidad | Puede detener Core |
| --- | --- | --- | --- | --- |
| Overlay v1/v2 | último full y status coherente | publisher latest-wins; fallo aislado y contado | métricas `Transport`, `FramesDropped` y `PublishFailures` | no |
| Engineer snapshot/status | latest-wins, canal cap 1 | drop-oldest contado; timeout y recover por frontera | `EngineerConsumeLatencyMs` p50/p99, `EngineerStatesDropped`, `EngineerTimeouts`, `ConsumerRecover` | no |
| Engineer facts | orden estricto por epoch/secuencia | cola acotada; hueco/overflow/proyección fallida abre boundary y exige resync | `EngineerFactResync`, `EngineerFactQueueDepth`, `EngineerFactsDropped` | no |
| Strategy | builder e in-process conservados; sin transporte público default | Hub/Wails/SSE sólo con flag de rollback; fallo Strategy no afecta Overlay | `StrategyTransport` queda a cero sin flag; fallos por frontera con flag | no |
| Recording | ordenado y auditable, todavía desconectado | rechazo no bloqueante; gap con rango + `Incomplete` | `CoordinatorStatus.GapMarkers`, `RejectedBatches`, `Failure` | no |
| Analysis | histórico | fuera del hot path | fuera de F7 | no |

## Engineer lento: medición antes/después

`TestSlowEngineerDoesNotBlockDriverLoop` conserva el límite original: Engineer
duerme 50 ms y el intervalo entre entradas al sink no puede superar 20 ms.

| Camino | Intervalo observado |
| --- | ---: |
| Antes, callback síncrono | 92,9868 ms |
| Después, primer gate F7.1 | 1,5167 ms |
| Repetición focal final F7.6 | 0,5007 ms |

Son medidas locales sintéticas en Windows, no una sesión LMU ni una garantía
de percentil del producto instalado. La regresión F0 está activa, sin `Skip` ni
relajación del umbral. `TestConsumerPanicDoesNotKillProcess` también pasa y
cuenta la recuperación de `engineer.observation`.

## Tests y gates locales

Pasaron los tests nuevos o activados de Engineer latest-wins, timeout,
rollback, panic, facts ordenados, overflow/resync, fallo de proyección como
boundary, Strategy sin Hub por defecto, aislamiento Strategy/Overlay y
Recording gap/no bloqueo. Los tests focales de Recording pasaron también 20
repeticiones.

Antes de cada commit funcional pasaron:

- build de todos los paquetes Go productivos, excluyendo únicamente
  `build/ios`;
- tests `./internal/telemetry/... ./internal/app/... ./cmd/... -count=1`,
  excluyendo `internal/app/launcher` por el panic preexistente de
  `TestDiscoverIconsSmoke`;
- `go run ./tools/telemetry-contract-gen -check`, guard de wiring y
  `git diff --check`;
- `go vet ./internal/telemetry/... ./internal/app/...` terminó con exit 1 sólo
  por los tres `unsafe.Pointer` heredados en `reader_windows.go`,
  `version_windows.go` e `icon_windows.go`.

No se tocó frontend. El build frontend ejecutado al preparar F7.1 pasó y sólo
materializó `frontend/dist` ignorado; no se ejecutó la suite frontend porque F7
no cambia TypeScript.

## Verificación manual pendiente

1. Iniciar Vantare y LMU con Engineer activo; conducir una sesión y provocar
   carga/latencia del consumidor sin guardar payload ni identidad.
2. Confirmar que Overlay y la adquisición permanecen fluidos y que crecen los
   contadores Engineer esperados, sin fail-stop.
3. Confirmar que la ruta/eventos públicos Strategy no existen por defecto y
   que el flag de rollback los restaura sólo durante la prueba.
4. Recording no se puede validar end-to-end todavía: F12 debe conectarlo con su
   consumidor y persistir los marcadores.

Resultado de sesión LMU real con Engineer activo: **pendiente de Isaac**.

## Pendientes y límites

- `EngineerService` detecta un hueco y devuelve el
  `FactResyncRequiredError` tipado. El puerto ofrece `ResyncFacts(from)`, pero
  el consumidor real aún no posee un callback hacia ese puerto para pedir y
  reaplicar el sufijo retenido; queda como seguimiento explícito antes de
  depender del resync automático en producto.
- Recording sigue sin wiring, como exige F7. F12 debe conectar un consumidor,
  decidir la persistencia de los gap markers y exponer su métrica operativa.
- No se ejecutaron LMU, Wails/WebView2 instalado, OBS, CI remoto ni pruebas de
  producto instalado. No hubo push, PR, merge, promoción ni release.

## Commits funcionales

- `79dd40ba` — F7.1 puerto Engineer asíncrono.
- `4fc492a7` — F7.2 facts con cursor y resync.
- `3b0a8907` — F7.3 fallo de fact como boundary.
- `51b92cf4` — F7.4 Strategy sin transporte público por defecto.
- `d5c11eb8` — F7.5 gap markers de Recording.
