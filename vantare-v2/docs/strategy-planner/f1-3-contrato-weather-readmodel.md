# F1.3 — Contrato StrategyWeatherReadModel v1

**Fecha:** 2026-08-21
**Issue:** #726 (ISA-694 F1.3)
**Owner:** Strategy (`internal/strategy/weather`)
**Consumidor único:** Overlays
**Estado:** compile-only `strategyweatherreadmodel.v1`

## Ubicación y justificación

Mismo paquete `internal/strategy/weather` que `WeatherScenario`, pero tipo distinto. Guard arquitectónico: **Overlays consume exclusivamente `StrategyWeatherReadModel v1` de Strategy** (ADR 0009 §15). Overlays jamás lee Core, REST ni repositorios directamente. Mantener ambos tipos en el mismo paquete hace visible que el read model es una proyección del scenario capturado, sin duplicar lógica de captura.

## Tipos

`StrategyWeatherReadModelV1{ContractVersion=strategyweatherreadmodel.v1, ModelID, CombinationID, GeneratedAt, Nodes[5] WeatherNode, Presence, Freshness{CapturedAt, FreshUntil, IsFresh, IsStale}, Source}`

Derivado del `WeatherScenario` capturado; mismas 5 progresiones; `Presence/Freshness` expone si el forecast está fresh para el overlay ingame (pieza pequeña del módulo Overlays, D5).

## Compatibilidad

- Primer versionado; no hay predecesor. Cambios futuros versionan `contractVersion`.
- Si ADR vs spec: gana ADR rev.2 (sin conflicto).

## Verificación

```bash
go vet ./internal/strategy/weather/...
go test ./internal/strategy/weather/... -run TestWeatherScenarioV1
```
El overlay ingame debe fallar cerrado si `isFresh==false` (degrada a vacío con aviso, no a sintético).
