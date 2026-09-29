# ISA-1403 — Inventario de entrega live antes de retirarla de Go

Fecha: 2026-09-29. Base comprobada: `origin/nightly@c4c7a5ce`, rama
`vantareapp/isa-1403-rust-telemetry@4a2120f1`. Este inventario describe
callers presentes, no certifica que el producto ya use Rust. [ADR 0098](../adr/0098-rust-end-to-end-live-telemetry.md)
define el dueño futuro.

Actualización de la rama: Rust ya posee el pull por ventana y entrega el
Overlay a Studio y OBS a través de proxies Go. Windows selecciona el helper
Rust por defecto y lo empaqueta. Las filas siguientes describen la frontera
inicial inventariada; el receptor/estado Go de Engineer y Strategy, epoch,
fact ACK y los paquetes live antiguos siguen pendientes de retirada.

| Frontera actual | Dueño hoy y evidencia de código | Dueño final y prueba que permite retirar Go |
| --- | --- | --- |
| LMU SHM/REST → Core | `internal/telemetry/drivers/lmu`, `core`, `derive`, `engine` y `internal/app/telemetry_core_runtime.go` en Go; `rust/telemetry/src/lmu`, `core`, `derive`, `engine` solo candidato | Rust único. Oráculo LMU47, tests de estados/facts, single reader y callers productivos cero antes de borrar la ruta Go. |
| Pipe del candidato | `rust/telemetry/src/ipc/queue.rs` ya limita batches y facts; `internal/app/telemetryprocess/receiver.go` decodifica, valida cursores, retiene facts y crea ACK en Go | Rust conserva orden, límites, retención y destino. El host verifica autenticidad, versión y framing; no mantiene un segundo scheduler o retainer. Tests de crash, replay, ACK y peer inválido. |
| Overlay latest-wins | `internal/app/rust_telemetry_candidate_windows.go:deliver` aumenta `deliveryRev` y llama a `PublisherRegistry.PublishSnapshot`; `internal/app/telemetrytransport/publisher.go` guarda status/snapshot | Rust posee demanda, última revisión y selección del frame. El host solo expone bytes ya decididos. Comparar status, snapshot, late join, cierre y límite 72 KiB. |
| Pull de ventanas Studio/Desktop | `internal/app/telemetrytransport/overlay_pull.go` posee sesión por sender, ACK, replay pendiente, dirty/sections; `cmd/vantare/main.go` registra la ruta `/_vantare/overlay-telemetry`; `cmd/vantare/overlay_socket.go` la expone por WebSocket local | Rust posee sesión/ACK/replay/sections; Go Wails puede mantener un proxy opaco de petición/respuesta hasta el WebView. Tests contra los goldens del pull y ventana tardía/cerrada. |
| OBS | `internal/server/server.go` registra `PublisherSSEHandler` de `telemetrytransport/adapters.go` en `/telemetry/overlay-v2/projection` | Rust decide suscripción, latest-wins y estado; el servidor Go existente puede retransmitir bytes para conservar URL/autenticación. OBS físico y SSE reconectado con contrato idéntico. |
| Engineer | `telemetryprocess.ReceivedV1.EngineerObservation` adapta en Go, `RustTelemetryCandidateRuntime.deliver` llama a `Engineer.ConsumeObservation`, `ConsumeFact` y `ConsumeFactBoundary`; `internal/app/engineer_port.go` aplica la política de entrada | Rust entrega observación/status/fact/boundary y posee orden/ACK. `EngineerService` Go conserva reglas de radio y voz. Adaptador Go de entrada solo valida el contrato de producto y ejecuta el callback; no reordena ni inventa facts. Prueba de rechazo tras fact aceptado y replay durable. |
| Strategy live | `RustTelemetryCandidateRuntime.deliver` crea `NewStrategyFull` y llama al `StrategyHub` Go; `telemetrytransport/adapters.go` y `internal/server/server.go` publican Wails/SSE bajo flag | Rust posee proyección, demanda, entrega y cursor; un adaptador de producto Go expone el payload cuando corresponde. Prueba de Strategy OFF, late join y reinicio sin regresión de epoch. |
| Fuente y política | `cmd/vantare/main.go` elige Go/Rust y publica `telemetry-core:source-status`; `rust_telemetry_candidate_windows.go` infiere estados al recibir productos y traduce epoch | Rust informa salud/frescura y epoch de producto; host solo presenta caída del proceso y políticas de producto. El selector dual desaparece tras la retirada. Tests de frame congelado, pausa, cierre y política dinámica. |
| Contratos externos | `internal/telemetry/projection/contracts.go`, `tools/telemetry-contract-gen` y `frontend/src/generated/telemetry.ts` mantienen tipos Go/TS | Rust emite los mismos wire contracts. Mantener el generador Go mientras se migra el contrato; retirarlo solo con una fuente Rust única y check de generación exacta. No borrar DTO compartidos por Analysis/recording. |

## Primer corte ejecutable de E2

`rust/telemetry/src/delivery.rs` ya porta como librería pura la sesión por
ventana, ACK/replay, bootstrap/status, latest-wins y parches `sections=1`.
Pruebas Rust usan los golden Overlay de 1/20/44/104 coches y cubren sesión
vieja, epoch, consumidor lento y contador agotado. Falta una prueba cruzada
de la misma petición/respuesta contra Go y el cliente
`overlay-wails-pull.test.ts`, más el cableado al helper y proxy Wails. No hay
caller productivo de ese módulo, y este corte no retira el Publisher Go.

## Riesgos abiertos

- `overlay_pull.go` protege una sesión por sender y un replay pendiente; un
  broadcast global desde Rust no reproduce ese contrato.
- El WebSocket de Wails y el SSE de OBS tienen fronteras de acceso distintas.
  Conservar loopback, token, tamaño, cierre y la identidad de la ventana.
- Engineer no puede perder un fact tras ACK; al reiniciar debe recibir replay
  durable o un boundary explícito. Los snapshots latest-wins no cubren facts.
- El corpus LMU47 de pista estable no demuestra menú/boxes/crash/OBS físico.
  La ganancia del parser y las ventanas híbridas no miden este diseño final.
