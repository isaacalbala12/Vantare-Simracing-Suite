# ISA-894 · R5 retirada de la ruta SSE publica Overlay V1

## Objetivo

Retirar la ultima entrada HTTP publica de Overlay Projection V1. Tras este
microcorte, `GET /telemetry/overlay/projection` debe responder 404 en cualquier
configuracion del servidor, mientras Strategy SSE y OverlayFrame V2 conservan
sus contratos actuales.

Base congelada: `d9893379a0c19e2d39307aef957eafe3466c17b3` (R4).

## Alcance cerrado

- `internal/server/server.go`
- `internal/server/telemetry_projection_test.go`
- `cmd/vantare/main.go`
- `cmd/vantare/telemetry_lifecycle_harness_test.go`

Se permite anadir evidencia y actualizar el handoff/roadmap al cerrar el
corte. No se modifican en R5 el productor interno V1, su Hub, su flag o
persistencia, sus metricas, sus tipos/proyectores/fixtures, los adapters
frontend restantes, Strategy ni los helpers genericos de transporte.

## Contrato que debe preservarse

1. `/telemetry/overlay/projection` no se registra y responde 404 aun si existe
   internamente un Hub Overlay V1.
2. Strategy SSE sigue requiriendo su habilitacion explicita, mantiene el
   aislamiento por producto y conserva su payload actual.
3. Overlay V2 SSE y el pull Wails siguen disponibles y aislados.
4. El harness de ciclo de vida conserva evidencia de Strategy por Wails/SSE,
   Overlay V2 por pull/SSE, Engineer y cierre limpio de recursos.
5. El productor y Hub internos de Overlay V1 permanecen temporalmente para R6;
   este corte no declara la retirada fisica total.
6. `telemetrytransport.Hub`, `SSEHandler`, `ProjectionRoute` y Strategy V1 no se
   eliminan porque siguen siendo contratos productivos de Strategy.

## TDD obligatorio

### RED

Actualizar primero el test de servidor para exigir que la ruta Overlay V1
responda 404 incluso cuando se intenta configurar un Hub Overlay. El test debe
fallar contra R4 porque la ruta todavia se registra. Registrar comando y causa
literal antes de tocar produccion.

### GREEN

- Eliminar `ServerConfig.OverlayProjection` y el registro condicional de la
  ruta Overlay V1.
- Eliminar el cableado correspondiente de `cmd/vantare/main.go`.
- Adaptar el test de aislamiento para que la ausencia de Overlay V1 sea
  incondicional y Strategy siga cubierto.
- Retirar del harness solamente la publicacion/captura/comparacion HTTP de
  Overlay V1; mantener Strategy, Overlay V2 y las comprobaciones de lifecycle.

## Gates

- test focal RED registrado y luego GREEN;
- tests focales de servidor y lifecycle Windows;
- `go test ./...`;
- `go vet ./...` si no existe deuda heredada bloqueante;
- `gofmt` en todo Go modificado;
- `git diff --check`;
- busqueda que pruebe que `ServerConfig` y `main` ya no exponen
  `OverlayProjection`, y que la ruta literal no queda registrada en servidor;
- revision fresca de cumplimiento y despues revision fresca de calidad.

## Cierre

Documentar evidencia, actualizar el handoff vivo y el hito de telemetria del
roadmap sin declarar retirada total de V1. Crear PR draft apilada sobre R4. No
mergear ni promover a `nightly` sin autorizacion explicita de Isaac.
