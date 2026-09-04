# ISA-894 · R6a retirada del productor y activacion Overlay V1

## Objetivo

Dejar de construir y publicar dentro del binario cualquier snapshot o status de
Overlay Projection V1, y retirar todos sus mecanismos de activacion. Tras este
microcorte, ni settings ni variables de entorno pueden reactivar V1. El Hub
interno se conserva temporalmente vacio para retirarlo de forma aislada en R6b.

Base congelada: `2371958d0c81e669d7f66f9c3a296d3a2ef963d9` (R5).

## Alcance cerrado

Produccion:

- `internal/app/telemetry_core_runtime.go`
- `internal/app/overlay_v1_emit.go` (eliminacion)
- `internal/app/settings_service.go`
- `cmd/vantare/main.go`
- `frontend/src/hub/settings/settings-contract.ts`

Tests focales que deban migrar sus expectativas de metricas o configuracion:

- `internal/app/overlay_v1_emit_test.go`
- `internal/app/overlay_v1_guard_test.go`
- `internal/app/settings_service_test.go`
- tests `telemetry_core_*_test.go` y `telemetry_shadow_test.go` que aun exijan
  publicaciones V1 o el contador canonico heredado.

Se permite actualizar evidencia, handoff y roadmap al cerrar el corte. No se
modifican en R6a el Hub interno, `Hub()`, `telemetrytransport.ProductOverlay`,
`NewOverlayFull`, los tipos/proyectores/fixtures/adapters V1 restantes, el
tooling historico de benchmark, Strategy V1 ni ningun comportamiento de
OverlayFrame V2.

## Contrato que debe preservarse

1. `WriteBatch` no llama a `overlayprojection.ProjectV1`, no crea
   `NewOverlayFull` y no publica snapshots en el Hub Overlay V1.
2. Los cambios de estado no crean ni publican status `ProductOverlay` V1.
3. Desaparecen `OverlayV1Emit`, `VANTARE_OVERLAY_V1_EMIT` y el campo
   `overlayV1Emit` de settings/binding frontend; no queda rollback embebido.
4. La migracion de settings conserva `SchemaVersion == 6` sin depender del
   campo retirado. Un JSON antiguo que lo contenga se ignora de forma segura.
5. `ProjectionsPublished` y `OverlayProjectionsPublished` quedan temporalmente
   congelados en cero y documentados como retirados; no se reutilizan para
   contar V2. `StrategyProjectionsPublished` conserva su semantica actual.
6. El Hub Overlay V1 permanece construido, cerrable y consultable, pero sus
   metricas de publicaciones de snapshot/status quedan en cero. Su retirada
   fisica pertenece a R6b.
7. Strategy V1, OverlayFrame V2, Engineer, recording, rendimiento y cadencias
   no cambian.

## TDD obligatorio

### RED

Modificar primero un test focal para exigir ausencia incondicional de
publicaciones V1 incluso cuando se intenta usar el antiguo switch. Contra R5
debe fallar porque el flag todavia permite un snapshot y un status. Registrar
comando, fallo y expectativa antes de tocar produccion.

El guard estructural debe pasar de exigir un unico productor protegido por flag
a exigir cero construcciones `ProjectV1(final)`, cero ramas `overlayV1Emit` y
cero publicaciones globales V1. Se conserva su prueba adversarial de aliases y
variantes de emitter.

### GREEN

- retirar la proyeccion Overlay V1 de `WriteBatch` y simplificar
  `publishProjections` a Strategy;
- retirar la publicacion de status Overlay V1;
- retirar config, resolver, variable de entorno, settings y binding frontend;
- mantener campos metricos heredados a cero con comentario explicito, sin
  atribuirles publicaciones V2;
- migrar solo expectativas de tests que dependian de la produccion V1.

## Gates

- RED focal literal registrado y GREEN posterior;
- tests focales de `internal/app` y `cmd/vantare` afectados;
- tests frontend del contrato de settings si existen;
- `pnpm --dir frontend typecheck`, `pnpm --dir frontend build` y lint focal;
- `go test ./...` y `go vet ./...` distinguiendo deuda heredada;
- `gofmt` en Go modificado y `git diff --check`;
- busqueda de frontera que pruebe ausencia productiva de `OverlayV1Emit`,
  `overlayV1Emit`, `VANTARE_OVERLAY_V1_EMIT`, `ProjectV1(final)` y status
  `ProductOverlay` en el runtime;
- prueba de que Strategy V1 y OverlayFrame V2 siguen cubiertos;
- revision fresca de cumplimiento y despues revision fresca de calidad.

## Cierre

Documentar reduccion de codigo, pruebas, deuda heredada y elementos V1 que se
conservan exclusivamente para R6b/R7. Crear PR draft apilada sobre R5. No
mergear ni promover a `nightly` sin autorizacion explicita de Isaac.
