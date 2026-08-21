# F1.3 — Contrato PilotProfile v1

**Fecha:** 2026-08-21
**Issue:** #726 (ISA-694 F1.3)
**Owner:** Strategy (`internal/strategy/pilotprofile`)
**Estado:** compile-only `pilotprofile.v1`

## Ubicación y justificación

Paquete `internal/strategy/pilotprofile` (subpaquete v2 idiomático). Owner es Strategy según ADR 0009 §15 y §5: `PilotProfile` es unidad que la subida opt-in comparte seudonimizada. Separarlo de `document` evita que el documento de evento acople perfiles de referencia (que viajan por catálogo) con perfiles propios; también aisla el formato de archivo para el puente de equipo sin servidor (export/import).

## Tipos

- `Condition` = `dry|wet|mixed` (por combinación **y condición**).
- `PilotProfileV1{ContractVersion=pilotprofile.v1, ProfileID, CombinationID, Condition, DisplayName, ExportedAt, Fuel{mean,range,sampleSize}, VE{...}, Pace{baseSeconds, degradationPerLap, sampleSize}, Provenance{kind, sourceId}}`
- `Export() []byte` y `Import([]byte) (PilotProfileV1, error)` con `json.Decoder.DisallowUnknownFields()` (allowlist semántica: rechaza campos desconocidos).
- Round-trip import/export íntegro; `DisplayName` no contiene PII de piloto real (seudonimizado; canarios PII del bundle aplican por analogía).

## Compatibilidad

- Primer versionado; no hay predecesor. El catálogo también publica perfiles de referencia por combinación (D15, procedencia `reference`); el app sustituye `reference` por datos propios cuando existen (spec §6, `ProvenanceReference`).
- Si ADR vs spec: gana ADR rev.2 (sin conflicto).

## Verificación

```bash
go vet ./internal/strategy/pilotprofile/...
go test ./internal/strategy/pilotprofile/... -run TestPilotProfile
gofmt -l ./internal/strategy/pilotprofile/
```
