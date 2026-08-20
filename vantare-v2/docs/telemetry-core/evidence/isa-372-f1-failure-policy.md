# ISA-372 / F1 — política de fallo no terminal

Fecha: 2026-08-19.

Rama: `vantareapp/isa-372-tc-f1-fallo-no-terminal`.

Base: `isa-373@3e9c77ed285388db0cceed843e600c1d742e31e8` (Nightly más F0).

## Resultado

- Reducer, coordinator y derive terminan antes de proyectar y publicar. Un
  fallo posterior de producto, payload o consumidor devuelve éxito al mapper:
  el frame aceptado queda commiteado y la adquisición continúa.
- Overlay y Strategy se publican de forma independiente. El fallo de uno no
  cierra el otro producto ni impide entregar Engineer.
- `failStop` queda reservado a errores clasificados como programación.
- Cada callback Engineer y cada publicación Overlay/Strategy tiene una
  frontera con `recover()`. El panic queda contado y no escapa al proceso.
- El status `error` se publica antes de cancelar y cerrar los hubs. El Hub
  conserva ese único status terminal pendiente para entregarlo antes de
  devolver `ErrClosed`.
- `TelemetryFailurePolicyV2` está activada por defecto (`nil` = on). Un puntero
  a `false` restaura durante un ciclo la política fail-stop anterior.
- `MaxPayloadBytes` sigue siendo 256 KiB. A 104 vehículos Overlay v1 se
  rechaza, cuenta y degrada; compactarlo pertenece a F6.

Los goldens de proyección v1 no se modificaron.

## Tabla error → clase

| Clase | Errores tipados |
| --- | --- |
| `programming` | Core/reducer: `ErrInvalidInitialCursor`, `ErrStaleBatch`, `ErrSequenceGap`, `ErrEpochGap`, `ErrInvalidEpochReset`, `ErrDuplicateVehicle`, `ErrMissingVehicleID`, `ErrVehicleRunMismatch`, `ErrVehicleCountMismatch`, `ErrIncompleteRunIdentity`, `ErrRunIdentityChanged`, `ErrReducerRunning`; coordinator: `ErrCoordinatorRunning`, `ErrFactBatchOverflow`, `ErrFactSequenceExhausted`, `ErrVehicleHistoryOverflow`; manager: `ErrManagerAlreadyStarted`, `ErrManagerRunning`, `ErrInvalidDriverCatalog`, `ErrInvalidDriverTransition`; transporte: `ErrInvalidEnvelope`, `ErrProductMismatch`; envelope: `ErrCloneRequired`; cualquier error desconocido (con log). |
| `productOrPayload` | Frames de `lmu.IsUnmappableFrame`; `context.Canceled`/`DeadlineExceeded`; `ErrReconnectExhausted`; transporte: `ErrClosed`, `ErrInvalidPayload`, `ErrPayloadTooLarge`, `ErrDeltaMismatch`, `ErrSequenceGap`, `ErrStatusRevision`, `ErrFactSequence`, `ErrUnsupportedProtocol`; `ErrUnknownProjectionVersion`; errores tipados de proyección Engineer (epoch, identidad, capability, payload, versión, status y fact desconocido). |
| `consumer` | Error envuelto por una frontera Engineer, `core.ErrBackpressure`, `core.ErrClosed`, `projection.ErrResyncRequired`, `projection.ErrSubscriptionClosed`, `telemetrytransport.ErrSubscriberLimit`; todo panic recuperado en `engineer.source-status`, `engineer.observation`, `engineer.fact`, `overlay.publish` o `strategy.publish`. |

Decisión sobre sinks: los seis errores de `lmu.IsUnmappableFrame` describen un
frame de producto todavía incoherente y son transitorios; backpressure y cierre
pertenecen al consumidor. `ErrStaleBatch` y las demás invariantes del reducer
siguen siendo programación hasta que F3 una mapper y reducer en una sola
transacción. Esta separación sigue `06-reliability-review.md` §13.

## Métricas nuevas

- `FramesDropped{reason}`.
- `PublishFailures{product}`.
- `ConsumerPanics{boundary}`.
- `FailStops`.
- `PayloadBytes{product}` con count y p50/p95/p99 sobre buckets acotados.
- `LifecycleTransitions{from,to}`.

`TelemetryCoreRuntime.Metrics()` devuelve copias de los mapas, sin payload ni
estado mutable compartido.

## Tests activados y nuevos

Activados desde F0, sin relajar su contrato:

- `TestPublishFailureIsNotTerminal`.
- `TestConsumerPanicDoesNotKillProcess`.
- `TestStatusErrorReachesSubscribersBeforeHubsClose`.
- `TestRuntimePublishes104VehiclesEndToEnd`: se corrigió únicamente la
  expectativa imposible antes de F6; a 104 Overlay v1 se descarta y cuenta,
  Engineer se entrega y el runtime sigue vivo.

Nuevos: tabla exhaustiva de clasificación, métricas/histograma, contrato de
256 KiB no terminal, predicado no terminal del manager, rollback del flag,
reinicio tras fallo transitorio y publicación de `degraded` con contador.

## Gates locales

- `pnpm --dir frontend install --frozen-lockfile`: PASS; solo preparó las
  dependencias ignoradas necesarias para materializar `frontend/dist`.
- `pnpm --dir frontend build`: PASS; se ejecutó para satisfacer el embed Go.
- `go build ./...`: llega únicamente al fallo preexistente permitido de
  `build/ios`: `function main is undeclared in the main package`.
- `go vet ./internal/telemetry/... ./internal/app/...`: conserva exactamente
  los tres avisos preexistentes de `unsafe.Pointer` en el reader LMU, versión
  LMU e iconos Launcher.
- `go test` sobre `./internal/telemetry/... ./internal/app/...`, excluyendo
  solo `internal/app/launcher` por el panic preexistente de
  `TestDiscoverIconsSmoke`: PASS.
- `git diff --check`: PASS.

No se ejecutó ni se afirma CI remoto, Wails/OBS real o una sesión de carrera.

## Verificación manual pendiente

1. En una build aislada con diagnósticos locales, confirmar que
   `TelemetryFailurePolicyV2` está on.
2. Con LMU y un grid que haga superar 256 KiB a Overlay v1, verificar que el
   status pasa a `degraded`, `FramesDropped{overlay-publish}` y
   `PublishFailures{overlay}` aumentan, y `FailStops` permanece en cero.
3. Confirmar que Strategy/Engineer continúan recibiendo sus productos.
4. Ejecutar una sesión LMU real de al menos 60 minutos y comprobar
   `FailStops = 0`.

La sesión LMU real de 60 minutos queda expresamente pendiente de Isaac. No se
ha inventado ni sustituido por fixtures. F6 sigue siendo necesaria para que el
payload Overlay de 104 vehículos se entregue en vez de descartarse.

## Entrega

Trabajo local en rama de issue, sin push, PR, CI remoto, merge, promoción ni
release. Rollback: configurar `TelemetryFailurePolicyV2` a `false` o revertir
los commits de F1 en orden inverso.
