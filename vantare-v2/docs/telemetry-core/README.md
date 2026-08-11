# Telemetry Core — contrato técnico y fronteras

> **Entrada técnica, no tracker.** Las decisiones y fronteras estables de este
> documento siguen siendo referencia. Los estados, canales y secuencias
> inferiores son snapshots históricos. Linear posee alcance, dependencias,
> rama/base esperadas, siguiente acción y plan; Git/GitHub demuestran el estado
> observado.

## Propósito

Este directorio reúne la evidencia y las decisiones técnicas de Telemetry Core.
LMU Shared Memory y LMU REST local son fuentes principales complementarias de
un único núcleo live. Overlay Studio, Desktop, OBS y Engineer/Spotter consumen
proyecciones del núcleo; ninguno posee un segundo pipeline de telemetría.

ISA-39 define los payloads v1 en
[`runtime-projections.md`](runtime-projections.md): contratos pequeños por
producto, calidad/presencia explícitas y versiones canonical/projection/
recording independientes. TC-05B/TC-05C ya aportan transporte y consumo
aislados en harness, pero todavía no existe wiring productivo global.

ISA-101 auditó el histórico y TC-06B / ISA-102 implementa en rama de issue el
adaptador privado SQLite modernc, todavía sin wiring productivo. MCAP queda
candidato condicionado para intercambio/replay; DuckDB solo posible cache
reconstruible futura y framing propio descartado.
[`storage-benchmark-isa-101.md`](storage-benchmark-isa-101.md),
[`historical-storage-schema.md`](historical-storage-schema.md),
[`recording-sink-sqlite-isa-102.md`](recording-sink-sqlite-isa-102.md) y
`docs/adr/0009-historical-storage-sqlite-mcap.md`.

TC-06C / ISA-103 añade replay raw, canónico e histórico y migraciones COW.
TC-06D / ISA-104 añade catálogo metadata-only, inspector local, paquete
sanitizado byte-exacto, UI correlacionada y una capacidad raw limitada todavía
sin wiring. Guías:
[`replay-migrations-isa-103.md`](replay-migrations-isa-103.md) e
[`inspector-privacy-diagnostic-export-isa-104.md`](inspector-privacy-diagnostic-export-isa-104.md).

## Jerarquía de fuentes

1. Linear posee el estado esperado, alcance, dependencias, siguiente acción,
   rama/base esperadas y el enlace al plan ejecutable.
2. Git/GitHub demuestran checkout, HEAD, PR, CI e integración observados.
3. `AGENTS.md` y `docs/agent-workflow.md` gobiernan el proceso.
4. ADR y contratos conservan decisiones técnicas estables.
5. Los documentos de `docs/telemetry-core/` conservan evidencia y contexto.

Si las fuentes discrepan, se detiene la ejecución y se reconcilia cada campo con
su propietario según `docs/vantare-program/source-ownership.md`.

## Snapshot histórico reconciliado

- En aquel snapshot, TC-01 constaba integrado en el canal histórico `develop`
  mediante ISA-23, ISA-24, ISA-25, ISA-96 e ISA-97.
- La base global de Go quedó verde en ISA-97.
- TC-02 y TC-03 están cerrados en la cadena apilada. TC-04A–C implementaron
  reducer, coordinación/hechos y derivaciones; TC-04D / ISA-38 implementa
  fan-out, backpressure y observabilidad. TC-05A/B están cerrados
  técnicamente, TC-05C y TC-06A están cerrados en la base de ISA-102. TC-06B y
  TC-06C y TC-06D están cerrados técnicamente, sin promoción.
  TC-07A.1 / ISA-129 cerró sus señales y evidencia real. TC-07B–TC-09F están
  cerrados técnicamente en la cadena apilada culminada por ISA-117: cutover
  productivo de Overlay y Engineer, retirada legacy, hardening, lifecycle y
  gate final.
- La cadena permanecía entonces en ramas de issue sin promoción. El handoff
  conserva continuidad técnica y evidencia; Linear determina estado esperado,
  rama/base esperadas y siguiente acción, mientras Git/GitHub demuestran rama,
  SHA, PR, CI e integración observados.

## Fronteras

| Área | Responsabilidad | Puede depender de | No puede poseer |
|---|---|---|---|
| Telemetry Core | lectura, fusión, identidad, tiempo, calidad, capabilities, lifecycle y fan-out | Shared Memory y REST local LMU | UI, persistencia de planes o decisiones del Engineer |
| Overlay | proyección visual y transporte a Studio/Desktop/OBS | snapshot/proyección canónica | readers LMU, polling REST o reglas de fusión |
| Engineer/Spotter | monitores, eventos, prioridad, audio y comandos preservados | proyección canónica y capabilities | servicio live paralelo o fallback sintético productivo |
| Strategy Planner | importación histórica, cálculo y planes de carrera | API pública estable o almacenamiento derivado futuro | lifecycle live del Core |
| Análisis futuro | consulta histórica y análisis avanzado | persistencia derivada/versionada | readers productivos duplicados |

Strategy Product B no forma parte de este paquete documental. Puede ser consumidor futuro, pero sus especificaciones, planes, ramas e issues viven en su propio proyecto.

## Reglas no negociables

- Un único owner productivo de Shared Memory y un único subsistema REST local.
- Ausencia de LMU significa `disconnected`; nunca datos ficticios presentados como live.
- Mock, simulator y replay solo mediante test o harness explícito.
- Ningún renderer de widgets conoce fuentes, transporte o persistencia.
- No se elimina funcionalidad Engineer; solo infraestructura duplicada demostrada sin consumidores.
- Cada issue ejecutable parte de la base aprobada indicada en Linear y usa su propia rama, worktree y chat.
- Ninguna rama de issue se promueve a `nightly` sin aprobación inicial de Isaac;
  `master` requiere siempre su validación final.

## Secuencia técnica aprobada en el snapshot del 2026-07-19

Isaac aprobó entonces la arquitectura modular y sus guardarraíles. ADR 0004 y
`docs/superpowers/plans/2026-07-19-telemetry-core-final-architecture-master.md`
sustituyeron los microplanes TC-02–TC-05 del 2026-07-13. La secuencia prevista
era ISA-26 y después TC-02–TC-09. Solo Linear puede indicar hoy qué corte y plan
son ejecutables.

Los planes anteriores se conservan como historia, marcados `SUPERSEDED`. No deben usarse para lanzar trabajo pendiente.

## Implementaciones runtime documentadas

- [Reducer single-writer](runtime-reducer.md)
- [SessionCoordinator y hechos](session-coordinator.md)
- [Derivaciones ordenadas](runtime-derivations.md)
- [Fan-out y backpressure](runtime-fanout.md)
- [Benchmark de almacenamiento ISA-101](storage-benchmark-isa-101.md)
- [Esquema histórico y contrato TC-06B](historical-storage-schema.md)
- [RecordingSink SQLite ISA-102](recording-sink-sqlite-isa-102.md)
- [Replay y migraciones ISA-103](replay-migrations-isa-103.md)
- [Inspector, privacidad y export ISA-104](inspector-privacy-diagnostic-export-isa-104.md)
- [Procedencia LMU/Overlay ISA-129](lmu-overlay-signal-provenance.md)
- [Matriz Overlay y evidencia ISA-129](overlay-shadow-matrix.md)
- [Retirada backend duplicado ISA-114](backend-retirement-isa-114.md)
- [Retirada frontend y transportes ISA-115](frontend-retirement-isa-115.md)
- [Hardening, rendimiento y observabilidad ISA-116](hardening-isa-116.md)
- [Wails, lifecycle y teardown ISA-87](wails-lifecycle-teardown-isa-87.md)
- [Gate final y checklist ISA-117](final-gate-isa-117.md)

## Evidencia real ISA-129

Las fixtures `lmu-1.4-pre-pit-track`, `lmu-1.4-pit`, `lmu-1.4-outlap` y
`lmu-1.4-garage` son capturas Shared Memory reconstruidas desde cero mediante
allowlist. Sus manifiestos y hashes están cerrados en
`internal/telemetry/drivers/lmu/testdata/menu_track_pit_disconnect_v1.golden.json`.
Demuestran `InPit=false -> true -> false` dentro de una sesión y un ciclo real
connected -> disconnected -> reconnected sin payload durante la desconexión.
Los nombres históricos de las fixtures no amplían la semántica: `mInPits`
solo demuestra un booleano in-pit, no garaje, box, pit lane ni fase de parada.

Esto no habilita todavía el wiring productivo ni el cutover de Overlay. Equipo,
número, compuesto, Virtual Energy, daños, weather y flags/fases sin fuente
demostrada siguen `missing` de forma explícita.
