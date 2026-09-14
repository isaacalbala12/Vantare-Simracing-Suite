# F1.3 — Contrato Documento Strategy v2

**Fecha:** 2026-08-21
**Issue:** #726 (ISA-694 F1.3)
**Owner:** Strategy (`internal/strategy/document`)
**Estado:** contrato `strategy.v2` implementado; revisado contra nightly del 2026-09-14. La fecha e issue iniciales identifican su origen, no el estado actual.

## Ubicación y justificación

Paquete `internal/strategy/document` (subpaquete v2 idiomático bajo `internal/strategy`).
No reutiliza `internal/strategy/contract` directamente para no mezclar el contrato v1 (`strategy.v1` orientado a PlanDraft/PlanRevision) con el documento v2 orientado a eventos. `document` es el owner del documento de evento; `contract` sigue siendo el owner del lifecycle de planes v1. La separación evita migraciones implícitas. `document` importa `telemetryanalysis/strategyprojection`: `PlanningInputs.Projection` persiste `StrategyInputProjectionV2` con su procedencia para que el cálculo sea reproducible. Analysis produce la proyección; Strategy conserva el input aceptado, no reimplementa el lector histórico.

## Objetivo

Representar los datos que conserva la migración de Orbit, según `matriz-migracion-orbit.csv` y fixtures `orbit-localstorage`:
- evento (`id`, `name`, `source`, `seriesId`, `track`, `cls`, `durationMin`, `startAt`, `team`, `teamMode`, `fillMode`, `lastOpenedAt`),
- pilotos con **orden** (`drivers[].order`) y **disponibilidad** (`availability: driverId -> [state, from, to]` con validación `from<to`, solapes y refs),
- variantes **por evento** (`strategies[]` con `order`, `state`, `overrides`, `tyres`; `activeStrategyId` validado contra estrategias sobrevivientes),
- inventario **físico de neumáticos por evento** (`tyreInventory: sets + byCompound + note`; compound crudo 0-2 sin mapping semántico),
- marca `legacy_synthetic_default` para distinguir defaults sintéticos (`durationMin=60`, `tankL=90`, `pitLossSec=60`, `startAt=now`, `name` fallback) del dato real del usuario, con `ProvenanceKind=legacy_synthetic_default` y `Evidence` explícito,
- `RawLegacy` (backup byte a byte) para preview/cuarentena sin pérdida,
- `MigrationMeta` (fingerprint/journal) para idempotencia.
- `planningInputs`, incluida la proyección histórica V2 aceptada para cálculo.

## Tipos

`StrategyDocumentV2` (`contractVersion=strategy.v2`, `schemaVersion=2.0.0`), `Event`, `Driver`, `Variant`, `AvailabilityWindow`, `TyreInventory`, `TyreSet`, `Sourced[T]` con `Evidence` (`Provenance` extendido con `reference` + `legacy_synthetic_default` según spec §6; ADR 0009 no contradice).

## Compatibilidad

- v1 (`strategy.v1` PlanDraft/PlanRevision) sigue válido; v2 no lo reemplaza sino que añade `StrategyDocumentV2` para la autoridad de persistencia por evento (F2 cutover).
- Migración v1→v2: no se transforma JSON v1 a v2; se re-deriva desde el backup Orbit con reglas de la matriz (defaults con procedencia `legacy_synthetic_default`, refs validadas tras mapear IDs, `RawLegacy` preservado).
- Si ADR y spec entran en conflicto: gana ADR rev.2 (no hay conflicto aquí; ADR §5 exige allowlist y fechas cuantizadas, que se aplican en CurationBundle, no en este documento).

## Verificación

```bash
go vet ./internal/strategy/document/...
go test ./internal/strategy/document/... -run TestStrategyDocumentV2
gofmt -l ./internal/strategy/document/
```
Las fixtures de migración y los tests de `internal/strategy/application` comprueban importación y procedencia `legacy_synthetic_default`. Los tests del paquete document verifican las invariantes del documento; no sustituyen la prueba del repositorio ni de la UI.

## Corrección de realización en F2(a) (#729)

El contrato compile-only original declaraba validación completa, pero su
`Validate` inicial solo comprobaba una parte de la shape: no rechazaba IDs u
órdenes duplicados, ventanas solapadas, enums/evidencias de variante, valores
no finitos, inventario inválido ni JSON raw malformado. Eso contradecía este
documento y la matriz de migración. F2(a) corrige el defecto sin cambiar el
wire ni añadir campos: `StrategyDocumentV2.Validate` realiza ahora esas
invariantes antes de que el repositorio acepte el documento.

También se corrige un defecto de representación: `json.RawMessage` no podía
cumplir “backup byte a byte” porque `encoding/json` compacta su contenido al
persistir. `RawLegacy` pasa a ser `[]byte`, codificado como base64 en el wire,
para conservar exactamente espacios, orden y también bytes de un JSON corrupto
destinado a cuarentena. Es el único cambio de shape respecto al compile-only y
queda fijado por un round-trip con whitespace significativo.

La eliminación de un piloto queda fijada así para Orbit: se retira también de
`availability` y de todos los órdenes de variantes, y se renumera el orden de
pilotos. Si alguna variante quedaría sin piloto, toda la operación falla sin
escribir con el error tipado `driver_in_use`. De este modo ninguna mutación
puede producir referencias colgantes y se conserva la invariante ya declarada
de que `Variant.order` no puede estar vacío.

El repositorio evoluciona de `strategy.repository.v1` a
`strategy.repository.v2`. Esta migración es distinta de la importación
Orbit de F2(c): conserva lógicamente los drafts, revisiones, activaciones y
plan activo v1; el campo `strategyDocument` queda ausente hasta el primer
comando de evento. La importación implementada en [legacy_migration.go](../../internal/strategy/application/legacy_migration.go) construye el documento desde el backup
Orbit y sus marcas `legacy_synthetic_default`.

## Código que realiza el contrato

[Documento](../../internal/strategy/document/document.go) · [mutaciones](../../internal/strategy/application/document_service.go) · [cálculo](../../internal/strategy/application/orbit_calculation.go) · [productor Analysis](../../internal/telemetryanalysis/sessioncatalog.go). Ejecutar los comandos anteriores desde `vantare-v2/`; no son evidencia de una prueba Windows.
