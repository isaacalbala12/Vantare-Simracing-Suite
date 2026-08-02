# Strategy Planner — ownership y blockers de proyecciones

**Fecha:** 2026-08-01
**Autoridad:** ADR 0006 y Linear

## Regla

Strategy tiene dos entradas distintas. Ninguna puede producirse dentro de
Strategy y ninguna comparte almacenamiento interno con el consumidor.

| Contrato | Productor/owner | Issue productora | Consumidor | Issue consumidora |
| --- | --- | --- | --- | --- |
| `StrategyInputProjection v1` | Telemetry Analysis | ISA-159 / TA-05 | Adapter histórico Strategy | ISA-145 / STR-10 |
| `StrategyLiveProjection v1` | Telemetry Core | ISA-160 / TC-10A + ISA-161 / TC-10B | Motor live Strategy | ISA-152 / STR-17 |

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

El archivo actual `internal/telemetry/projection/strategy/v1.go` demuestra
únicamente sesión, progreso y pit. Es un contrato compile-only y declara
expresamente que Fuel, Virtual Energy, tyres y weather todavía no existen en
esa proyección. Por tanto no satisface STR-17.

ISA-160 / TC-10A, bloqueada por ISA-117, debe inventariar para cada señal:

- source y evidencia LMU;
- schema/unidad;
- authority/fusion;
- freshness/quality;
- identidad/corner/compound cuando aplique;
- capability `supported`, `degraded`, `unsupported` o `missing`.

Fuel ya existe en canonical y debe reutilizarse. VE, tyres y weather solo se
añaden si la evidencia permite fijar su semántica; de lo contrario permanecen
ausentes y Strategy usa input manual o rango explícito.

ISA-161 / TC-10B implementa el productor, wiring, hub/transporte, golden,
replay, resync y soak sin crear otro reader. ISA-152 está bloqueada por ISA-161
y no puede comenzar con el contrato compile-only actual.

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
