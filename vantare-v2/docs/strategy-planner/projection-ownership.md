# Strategy Planner — ownership y blockers de proyecciones

**Fecha:** 2026-08-12
**Autoridad:** ADR 0006 y Linear

## Regla

Strategy tiene dos entradas distintas. Ninguna puede producirse dentro de
Strategy y ninguna comparte almacenamiento interno con el consumidor.

| Contrato | Productor/owner | Issue productora | Consumidor | Issue consumidora |
| --- | --- | --- | --- | --- |
| `StrategyInputProjection v1` | Telemetry Analysis | ISA-159 / TA-05 | Adapter histórico Strategy | ISA-145 / STR-10 |
| `StrategyLiveProjection v1` | Telemetry Core | ISA-160 / TC-10A + ISA-161 / TC-10B | Motor live Strategy (aún no implementado) | ISA-152 / STR-17 |

## Proyección histórica

ISA-159 está bloqueada por ISA-132 / TA-04. Produce desde el modelo público de
Analysis, no desde DuckDB ni rutas de archivos expuestas al consumidor.

Debe publicar por familia:

- identidad/compatibilidad de sesión;
- vueltas incluidas/excluidas;
- ritmo y rangos;
- Fuel y Virtual Energy;
- neumáticos/desgaste por posición y compuesto;
- pit loss y condiciones;
- procedencia, confianza, unidad y versión de cálculo.

Una familia ausente queda `unsupported` o `missing`; no bloquea las familias
demostradas. ISA-145 está bloqueada explícitamente por ISA-159 y solo adapta el
contrato al draft.

## Proyección live

ISA-160 / TC-10A está integrada en `nightly@8880a88` y fija el inventario
ejecutable: Fuel, pit y progreso están soportados; Virtual Energy, identidad,
compound, wear/corner de tyres y weather permanecen unsupported/missing.

ISA-161 se construyó originalmente desde esa integración de ISA-160. Su primer
rebase local fue sobre `origin/nightly@234794d`; su base y merge-base actuales
son `origin/nightly@b6df494`.

ISA-161 / TC-10B convierte el contrato compile-only anterior en un productor
live dentro de su rama de issue. Reutiliza el único driver/pipeline de
Telemetry Core y proyecta desde el mismo `FinalState` que Overlay. Publica:

- sesión: source time, end time, remaining y maximum laps;
- progreso: vuelta, sector y distancia de vuelta;
- pit;
- Fuel amount/capacity obtenidos atómicamente del mismo campo canónico;
- presencia, procedencia y freshness por campo;
- capabilities `session`, `progress`, `pit` y `fuel`.

Overlay conserva `Hub()` y Strategy usa `StrategyHub()` separado. Wails expone
status/projection namespaced y replay de status; SSE registra únicamente
`GET /telemetry/strategy/projection`, loopback-only. Los snapshots son latest
full/resync full y no se fabrica delta. Lifecycle, fail-stop y teardown poseen
ambos hubs. VE, tyres, weather y facts siguen ausentes sin fallback.

ISA-161 fue aceptada por Isaac e integrada mediante squash del PR
[#212](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/212) en
`nightly@b2e4067809d31152fdcf374875179e577d483c03`. El
[gate post-promoción](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31708164123)
pasó completo. ISA-152 / STR-17 queda técnicamente desbloqueada y está en
ejecución sobre una rama aislada desde ese SHA; el motor live aún no existe en
la base y no puede afirmarse implementado hasta cerrar su propia entrega.

## Dependencias ejecutables

```text
ISA-132 / TA-04
  -> ISA-159 / TA-05 StrategyInputProjection producer
      -> ISA-145 / STR-10 consumer
          -> ISA-146 / STR-11 derived planning inputs

ISA-117 / TC-09F
  -> ISA-160 / TC-10A signal audit/schema
      -> ISA-161 / TC-10B StrategyLiveProjection producer
          -> ISA-152 / STR-17 consumer
```

## Guards requeridos

- Strategy no importa `internal/telemetryanalysis` storage/SQL ni drivers LMU.
- Analysis no importa el dominio privado de Strategy.
- Core no contiene cálculo de planes.
- Contract tests prueban productor old/new contra consumidor old/new.
- Los valores stale/missing/invalid nunca se convierten en cero o estimación.
- La ausencia de una capability no habilita un fallback sintético.
