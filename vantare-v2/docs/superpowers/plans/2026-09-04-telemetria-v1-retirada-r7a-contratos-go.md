# ISA-894 · R7a: retirada de tipos y contratos Go de Overlay V1

## Objetivo

Eliminar del binario y del contrato generado la identidad de producto y los
tipos wire exclusivos de Overlay V1, partiendo de R6b
`813b96c43028353a599903fb035268c354b58896`, sin tocar todavía la cadena
frontend legacy que corresponde a R7b.

R7a termina con un único producto de overlay transportable,
`ProductOverlayV2`, y conserva sin cambios de semántica los contratos V1
independientes de Strategy, Engineer y Analysis.

## Alcance cerrado

### Retirar

- `telemetrytransport.ProductOverlay` y su aceptación por `knownProduct`.
- `internal/telemetry/projection/overlay/v1.go` y sus goldens exclusivos.
- Las raíces Overlay V1 de `tools/telemetry-contract-gen` y los tipos
  `Overlay*V1` que desaparezcan al regenerar `frontend/src/generated/telemetry.ts`.
- Fixtures y pruebas cuyo único propósito sea acreditar el wire Overlay V1.
- Usos de `ProductOverlay` como caso genérico o negativo en pruebas: migrarlos
  a productos vivos o a literales de rutas legacy cuando la prueba sea de
  ausencia.
- Benchmarks ejecutables que importen el proyector Overlay V1. Preservar los
  resultados históricos como evidencia; no reescribir historia.

### Preservar

- `ProductOverlayV2`, `projection/overlayv2/**` y el pull V2.
- El Hub genérico utilizado por Strategy.
- Todos los contratos y tipos V1 de Strategy, Engineer y Analysis.
- El endpoint de documento `/overlay.html`; no es telemetría V1.
- La documentación histórica de investigación y sus resultados publicados.
- Todo frontend productivo legacy, adapters, shadow, harnesses y tests de
  retirada frontend: se eliminan en R7b.

## Microcortes secuenciales

### R7a.1 · Guardarraíl rojo y raíces de contrato

1. Añadir primero un test estructural que falle mientras existan el paquete
   Go `projection/overlay`, `ProductOverlay`, sus tipos generados y sus raíces
   en contract-gen.
2. Retirar las raíces Overlay V1 del generador y actualizar su prueba para
   demostrar tanto la ausencia de Overlay V1 como la presencia de Overlay V2
   y de los V1 independientes que deben sobrevivir.
3. Regenerar el TypeScript exclusivamente con `task telemetry:contract`; nunca
   editar `frontend/src/generated/telemetry.ts` a mano.

### R7a.2 · Producto, consumidores Go y tooling

1. Migrar pruebas del Hub a Strategy/Engineer/Analysis según la intención real;
   no crear un producto ficticio de reemplazo.
2. Para pruebas de rutas retiradas, usar el literal histórico `/telemetry/overlay/projection`
   y nombres de evento históricos, sin reintroducir `ProductOverlay`.
3. Retirar el paquete/proyector/goldens Overlay V1 y adaptar los benchmarks
   vivos para que midan V2 o eliminar sólo el caso V1 ejecutable cuando sea
   puramente comparativo. Mantener resultados históricos inmutables.
4. Consolidar los guards anteriores de R6b en un guard final de ausencia Go,
   evitando tests duplicados o búsquedas que oculten `ProductOverlayV2`.

### R7a.3 · Evidencia y documentación viva

1. Publicar evidencia literal con inventario borrado/preservado, TDD rojo/verde,
   gates y riesgos.
2. Actualizar el handoff vivo, la issue y el hito correspondiente de
   `docs/roadmap/plan.md`; regenerar `roadmap.json`, nunca editarlo a mano.

## Verificación

- Test rojo específico antes de la retirada y verde después.
- `go test ./tools/telemetry-contract-gen ./internal/app/telemetrytransport ./internal/server ./internal/app ./cmd/vantare -count=1`.
- Tests aplicables de `docs/research/telemetry-architecture-2026/bench` si el
  paquete sigue siendo ejecutable.
- `task telemetry:contract` y luego `task telemetry:contract:check`.
- `pnpm --dir frontend test -- telemetry.generated.test.ts` o el filtro real
  equivalente; después `pnpm --dir frontend typecheck` y build completo.
- `go test ./... -count=1` con `frontend/dist` real.
- `go vet ./...`, distinguiendo deuda heredada de regresiones nuevas.
- `python ..\.github\scripts\roadmap_digest.py --repo .. --ref origin/nightly`
  y la misma orden con `--check` desde `vantare-v2`.
- `git diff --check` y búsqueda final exhaustiva: las menciones ejecutables de
  Overlay V1 deben ser cero; documentación histórica y guards de ausencia se
  clasifican explícitamente.

## Stop conditions

- Si un consumidor productivo aún necesita un tipo o ruta Overlay V1.
- Si retirar `ProductOverlay` obliga a cambiar la semántica de Strategy,
  Engineer, Analysis o Overlay V2.
- Si aparece la necesidad de tocar la cadena frontend productiva de R7b.
- Si contract-gen no puede regenerarse de forma determinista.
- Si una prueba sólo puede ponerse verde debilitando su comportamiento.

## Entrega

Un PR draft apilado sobre R6b, con commits pequeños, dos revisiones frescas
(contrato/especificación y calidad) y cero merge o promoción sin autorización
explícita de Isaac.
