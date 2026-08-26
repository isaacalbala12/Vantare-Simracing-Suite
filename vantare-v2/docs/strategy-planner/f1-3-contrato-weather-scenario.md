# F1.3 — Contrato WeatherScenario v1 (comando de captura)

**Fecha:** 2026-08-21
**Issue:** #726 (ISA-694 F1.3)
**Owner:** Strategy (`internal/strategy/weather`)
**Estado:** compile-only `weatherscenario.v1`

## Ubicación y justificación

Paquete `internal/strategy/weather` (subpaquete v2 idiomático). Owner es Strategy según ADR 0009 §15: Telemetry Core posee la adquisición REST `GET /rest/sessions/weather` y la expone como señal con presencia/freshness; **Strategy persiste `WeatherScenario v1` al capturar**. Separar `weather` de `contract` y de `solver` hace explícito que la captura es un comando de escritura del repositorio Strategy y no parte del documento de evento ni del catálogo.

## Tipos

- `WeatherNodeProgress` = `START/25/50/75/FINISH` (5 nodos, orden fijo).
- `WeatherNode{Progress, RainChance [0,100], Sky (clear/light_clouds/mostly_cloudy/overcast/partially_cloudy/drizzle), AirTempC, TrackTempC}`.
- `CaptureProvenance{Source, CapturedAt, FreshUntil, SessionType (PRACTICE/QUALIFY/RACE), SignalFreshness}` — procedencia y frescura de la captura (ADR 0009 §10).
- `WeatherScenarioV1{ContractVersion=weatherscenario.v1, ScenarioID, CombinationID, GeneratedAt, Nodes[5], Provenance}` con validación de progresión exacta y `freshUntil > capturedAt`.

## Compatibilidad

- Primer versionado; no hay predecesor. El endpoint verificado en #702 publica 5 nodos para PRACTICE/QUALIFY/RACE; el forecast de RACE es visible desde la práctica. Si A2 queda UNRESOLVED, el contrato queda definido pero sin captura (no bloquea el resto del corte).
- Si ADR vs spec: gana ADR rev.2 (ADR §15 fija ownership Core→Strategy, que este contrato respeta).

## Verificación

```bash
go vet ./internal/strategy/weather/...
go test ./internal/strategy/weather/... -run TestWeatherScenarioV1
gofmt -l ./internal/strategy/weather/
```
