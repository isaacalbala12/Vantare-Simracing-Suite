# Generador del contrato TypeScript de telemetría

`telemetry-contract-gen` genera el contrato wire TypeScript desde tipos Go
compilados. Las raíces son explícitas y están en `newGenerator`; no descubre
tipos por nombre ni recorre `core.ObservedState`, `schema.Field` o el estado
canónico.

Incluye:

- proyecciones v1 de Overlay, Engineer, Strategy y el contrato Analysis
  conservado para F12.b;
- contrato compacto `projection/overlayv2`, incluido su `QValue<T>` genérico;
- metadata y campos wire compartidos de `projection`;
- `Envelope`, `StatusEnvelope`, `StatusPayload`, `SnapshotKind`, `ProductID` y
  `EventKind` de `internal/app/telemetrytransport`;
- structs auxiliares alcanzables desde esas raíces cuando su forma cruza JSON.

`internal/telemetry/schema/envelope` no contiene hoy structs exportados con
tags JSON: sus wrappers internos no se generan. Los snapshots de producto
cruzan el wire mediante `projection.Metadata` y sus payloads v1.

Para regenerar:

```powershell
go run ./tools/telemetry-contract-gen
```

Cuando se añade un tipo wire, se incorpora como raíz con `addStruct` o
`addEnum`, se especifican sus valores literales y se actualizan los tests de
estructura. No se añade una raíz canónica para evitar convertir el contrato de
dominio en un contrato de transporte accidental.

`go run ./tools/telemetry-contract-gen -check` genera primero en un archivo
temporal y compara sus bytes con el archivo versionado. No modifica el árbol.
