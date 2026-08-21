# F1.3 — Contrato Catalog v1

**Fecha:** 2026-08-21
**Issue:** #726 (ISA-694 F1.3)
**Owner:** Strategy (`internal/strategy/catalog`)
**Estado:** compile-only + fixture firmado

## Ubicación y justificación

Paquete `internal/strategy/catalog` (subpaquete v2 idiomático). El catálogo es la frontera firmada hacia GitHub (ADR 0009 §12, D11): envelope con `domain`, `catalogId/channel`, `schemaId+schemaVersion`, `keyEpoch`, `version`, `publishedAt`, `expiresAt`, `payloadDigest`, serialización canónica JCS/RFC 8785 y Ed25519 con separación de dominio. Aislarlo en `catalog` evita que `contract` o `curation` toquen claves y permite que F5 (consumidor único del catálogo) y F6 (builder) usen el mismo builder/formato del fixture de F1.3.

## Envelope exacto ADR 0009 §12

```go
type Envelope struct {
  Domain        string    // "vantare.catalog.v1"
  CatalogID     string    // "vantare-strategy"
  Channel       string    // "stable"
  SchemaID      string    // "strategy.catalog"
  SchemaVersion string    // "1.0.0"
  KeyEpoch      string    // p.ej. "2026-08-a"
  Version       uint64    // monotónica dentro de la época
  PublishedAt   time.Time // UTC
  ExpiresAt     time.Time // UTC, > PublishedAt
  PayloadDigest string    // sha256 hex de JCS(payload)
}
type SignedCatalog struct {
  Envelope  Envelope
  Payload   json.RawMessage
  Signature string // base64 Ed25519 sobre domain || 0x00 || JCS(Envelope)
  KeyID     string
}
```

- **Serialización canónica:** JCS (RFC 8785): objetos con claves ordenadas, sin espacios, números mínimos, sin formato ad hoc; claves duplicadas ⇒ rechazo (`checkDuplicateKeys` / `DisallowUnknownFields` en verificación).
- **Firma:** Ed25519 con separación de dominio (`domain || 0x00 || JCS(envelope)`). `SignEnvelope` / `VerifyEnvelope` y `VerifySignedCatalog` cubren: firma inválida, `keyEpoch` desconocida, rollback de versión (entre y dentro de épocas, con `SeenEpoch`/`SeenVersion`), `expiresAt` vencido (duro: degrada a local con aviso), schema incompatible (ignorado con aviso). Persistencia atómica de época+versión máxima vista y purga de caché por claves revocadas quedan documentadas para F5 (no wiring en este corte).

## Fixture firmado (test)

- Clave de **TEST** claramente marcada en `internal/strategy/catalog/testdata/`: `test_private_seed.hex` (seed `010203...20`), `TEST_KEY_README.md`, `catalog_fixture_signed.json` (envelope §12 + payload mínimo + firma válida). La clave de test **jamás se usa para producción**.
- Tests: `TestCatalog_FirmaInvalida`, `TestCatalog_KeyEpochDesconocida`, `TestCatalog_RollbackVersion`, `TestCatalog_ExpiresAtVencido`, `TestCatalog_SchemaIncompatible`, `TestCatalog_FixtureFile` (verifica el fixture con la clave de test).
- JCS: `PayloadDigestFor` calcula `sha256(JCS(payload))` y se verifica contra `envelope.payloadDigest`.

## Compatibilidad

- Primer versionado (`strategy.catalog/1.0.0`). Claves confiadas embebidas por release con vigencia y versión/época mínima aceptable (para F5). `expiresAt` duro.
- Si ADR vs spec: gana ADR rev.2 (este contrato lo sigue al pie de la letra; anota cualquier detalle donde el spec fuera menos estricto).

## Verificación

```bash
go vet ./internal/strategy/catalog/...
go test ./internal/strategy/catalog/... -run TestCatalog
gofmt -l ./internal/strategy/catalog/
```
F5 probará el fixture con fetch+verificación+caché del envelope.
