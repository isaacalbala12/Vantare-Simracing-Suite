# ADR 0006 — Dominio unificado y ownership de Strategy Planner

**Estado:** Accepted
**Fecha:** 2026-08-01
**Decisores:** Isaac y Vantare engineering
**Contexto:** ISA-134 / STR-00

## Contexto

El Strategy Planner se desarrolló históricamente como Product A, B y C. Ese
reparto produjo planes e issues que mezclaban cálculo manual, importación de
telemetría, almacenamiento histórico, UI y ejecución live. Telemetry Core ya
dispone de un runtime canónico y Telemetry Analysis debe poseer la biblioteca
histórica. Mantener la división antigua duplicaría adquisición, persistencia y
reglas de procedencia.

Al mismo tiempo, Product A contiene cálculos, tests y flujos manuales valiosos,
pero su branch diverge ampliamente de la base actual y su solver no es una
autoridad física completa.

## Decisión

### Un solo producto

`Strategy Planner` es un único producto con tres modos:

1. **Manual:** datos introducidos por el usuario.
2. **Asistido:** datos derivados de una proyección de Telemetry Analysis.
3. **Live:** estado actualizado mediante una proyección de Telemetry Core.

Product A/B/C permanecen únicamente como nombres históricos.

### Ownership

Strategy posee:

- borradores, revisiones y planes activos;
- stints, recursos, inventario físico de neumáticos y reglas del evento;
- cálculo, optimización determinista, escenarios y comparación;
- estado efímero de ejecución y propuestas de replanificación;
- galerías privadas, oficiales y comunitarias del producto;
- read models para Engineer y Overlays.

Strategy no posee:

- adquisición LMU live;
- lectura de Shared Memory o REST;
- discovery/parser/indexación de archivos históricos;
- correcciones o workspaces de análisis;
- dispositivos de audio, voz o UI de Engineer;
- renderizadores de widgets.

### Contratos

```text
Telemetry Analysis -- StrategyInputProjection v1 --> Strategy Planner
                      producer ISA-159             consumer ISA-145
Telemetry Core ----- StrategyLiveProjection v1 ---> Strategy Planner
                     audit ISA-160 / producer 161  consumer ISA-152
Calendar ----------- StrategyEventRules v1 --------> Strategy Planner

Strategy Planner --- StrategyPlanReadModel v1 -----> Engineer
Strategy Planner --- StrategyExecutionReadModel v1 -> Overlays
Engineer ----------- StrategyCommand v1 -----------> Strategy Planner
```

Todos los contratos son snapshots/eventos versionados, inmutables para el
consumidor y con procedencia, freshness/confianza y capacidades explícitas.
Ningún módulo accede al almacenamiento privado de otro.

El `projection/strategy/v1.go` presente en ISA-117 solo demuestra sesión,
progreso y pit; es compile-only para Strategy y no habilita el modo live. Los
blockers y gaps de Fuel/VE/tyres/weather se fijan en
`docs/strategy-planner/projection-ownership.md`.

### Modelo de documento

- `PlanDraft`: mutable, local y recuperable. Nunca gobierna el overlay Desktop
  ni una carrera activa por sí solo.
- `PlanRevision`: snapshot inmutable con versión, inputs, supuestos, resultado,
  procedencia y hash.
- `ActivePlan`: referencia atómica a una revisión aceptada.
- `StrategyExecutionState`: estado efímero de la carrera y sus desviaciones.
- `ReplanProposal`: propuesta versionada; requiere aceptación del piloto antes
  de cambiar `ActivePlan`.

La activación es atómica e idempotente. Una revisión ya activa no se modifica;
se crea otra revisión.

### Dominios físicos

Fuel, Virtual Energy, tiempo, vueltas, distancia y desgaste son tipos separados.
No se suman ni comparan magnitudes incompatibles. Las conversiones son
explícitas y testeadas.

Cada neumático es una unidad física con ID. Después de utilizarse en una
esquina queda ligado a FL/FR/RL/RR durante el evento. Los compuestos pueden
mezclarse cuando las reglas lo permitan. Medido, manual, estimado y rango sin
datos mantienen procedencia distinta.

### Autoridad matemática

El motor determinista explicable es la autoridad. Debe exponer inputs,
restricciones, cálculo, rango y confianza. Monte Carlo solo se añade cuando
demuestre una ventaja concreta para incertidumbre; nunca sustituye el resultado
determinista ni oculta las reglas. Un LLM solo redacta explicaciones/voz y no
calcula ni interpreta como autoridad.

### Persistencia

Persistencia local versionada y con migraciones. STR-03 posee en exclusiva el
repositorio, la atomicidad, las migraciones, los drafts, las revisiones y la
recuperación. El repositorio almacena documentos Strategy, no duplicados de
sesiones de Telemetry Analysis.

STR-15A consume ese repositorio desde aplicación/presentación para las queries y
la UI de `Mis planes`, además del formato import/export. No accede directamente
al filesystem ni reimplementa backup, revisiones, borrado, atomicidad o
migraciones. Las superficies de galería se separan en:

- Diseños/planes oficiales de Vantare.
- Comunidad, únicamente mediante publicación voluntaria.
- Mis planes, privados por defecto.

## Alternativas descartadas

### Mezclar Product A completo

Descartada: 371/44 commits de divergencia, siete conflictos directos y varias
integraciones transversales obsoletas. Incorporaría código no auditado y
ownership incorrecto.

### Mantener Product A/B/C como productos

Descartada: duplica modelos, UI y nomenclatura; complica migraciones y live.

### Hacer de Strategy el dueño de DuckDB/archivos LMU

Descartada: duplica Telemetry Analysis y acopla un producto a formatos de un
simulador.

### Monte Carlo como núcleo inicial

Descartada: añade opacidad antes de tener un oráculo determinista correcto.

## Consecuencias

### Positivas

- Fronteras claras y reemplazables.
- Más simuladores sin reescribir Strategy.
- Misma lógica para manual, asistido y live.
- Planes reproducibles y auditables.
- Engineer y Overlays consumen estado sin poder corromperlo.

### Costes

- Product A necesita rescate selectivo y no un merge rápido.
- Telemetry Analysis/Core deben publicar proyecciones antes de los modos
  asistido/live.
- El solver debe reescribirse y compararse contra fixtures históricos.

## Verificación

- Tests de arquitectura impiden imports desde drivers, DuckDB o stores privados.
- Tests de unidades impiden combinar Fuel y VE.
- Replays prueban idempotencia, epoch, stale y replanificación.
- Cada revisión conserva inputs/supuestos/procedencia y reproduce su resultado.
- El cutover exige consumidores cero y rollback antes de retirar Product A.
