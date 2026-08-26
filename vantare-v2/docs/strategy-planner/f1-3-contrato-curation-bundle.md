# F1.3 — Contrato CurationBundle v1

**Fecha:** 2026-08-21
**Issue:** #726 (ISA-694 F1.3)
**Owner:** Strategy (`internal/strategy/curation`)
**Estado:** implementado por F6-a en rama de #766; pendiente de review

## Ubicación y justificación

Paquete `internal/strategy/curation` (subpaquete v2 idiomático). El bundle es la frontera de privacidad del Worker (ADR 0009 §5, §8): allowlist cerrada, fechas cuantizadas, identificador administrativo separado, denylist PII y sin telemetría cruda. Aislarlo en `curation` evita que `document` o `catalog` toquen su validación estricta y deja claro que el exportador seudonimizado (§5) nunca viaja con el documento de evento.

## Tipos

- `EpochQuantized` = `YYYY-Www` (semana ISO); `QuantizeEpoch(time.Time) EpochQuantized`. Fechas absolutas (`2026-08-21T14:00:00Z`) son denylist.
- `AdminEnvelope{UploadID, DeleteHash}` — identificador administrativo **separado** del payload analítico (borrado/cuota sin mezclar).
- `BundlePayload{ContractVersion=curationbundle.v1, BundleID, CombinationID, Epoch, StintAggregates[] {laps, avgFuelPerLap, avgVEPerLap}, PitAggregates{count, avgDuration, rates}, ObservedStrategies[] {stintCount, pitLaps, compounds}, ChannelQuality}` — allowlist cerrada (identidad de combinación desde catálogo interno, agregados, curvas cuantizadas, estrategias observadas, calidad de canal).
- `CurationBundleV1{Admin, Payload}` con `Validate()`, `StrictDecode([]byte) (CurationBundleV1, error)` usando `json.Decoder.DisallowUnknownFields()` en todos los niveles, y `denylistCheck` (canarios: `steamid`, `driverName`, `Users\`, `raw telemetry`, fechas absolutas).
- Presupuesto empírico ~1,3 KB gzip/sesión (F0-1, no parte del contrato pero documentado).

## Allowlist / Denylist

- **Allowlist conceptual `additionalProperties=false`**: en Go se aplica via `DisallowUnknownFields` en cada `Decode`; los tests rechazan campos desconocidos en `admin` y `payload`.
- **Denylist**: corpus de canarios PII + fuzz sobre el exportador; `TestCurationBundle_Denylist_PII` cubre `steamid`, `driverName`, rutas, telemetría cruda y fechas no cuantizadas.
- **Cuantización**: `TestCurationBundle_EpochQuantized` valida `2026-W33` ok y `2026-08-21` rechazado.

## Compatibilidad

- Primer versionado; no hay predecesor. Futuros campos requieren nueva `contractVersion`; un Worker que reciba `curationbundle.v2` con `DisallowUnknownFields` lo rechazará fail-closed (ADR 0009 §8: cero coerción).
- Si ADR vs spec: gana ADR rev.2 (ADR §5 fija fechas solo cuantizadas y allowlist cerrada; este contrato lo implementa al pie de la letra).

## Realización F6-a

- `GenerateBundleV1` consume únicamente las derivadas públicas de Strategy y
  Analysis y vuelve a aplicar la denylist al JSON final antes de encolarlo.
- Consentimiento, secretos protegidos y cola durable son estado local separado.
  El archivo de cola nunca contiene `uploadSecret` ni `deleteSecret`.
- Pausar cancela y marca como pausado todo request no aceptado. Un recibo del
  Worker ya aceptado permanece `sent`, exactamente como exige ADR 0009 §4.
- El cliente F6-b nace deshabilitado con URL vacía; HTTP solo se permite hacia
  loopback para pruebas y fuera de loopback exige HTTPS.

## Verificación

```bash
go vet ./internal/strategy/curation/...
go test ./internal/strategy/curation/... -run TestCurationBundle
gofmt -l ./internal/strategy/curation/
```
