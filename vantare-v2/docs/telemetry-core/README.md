# Telemetry Core — autoridad y fronteras

Estado de esta guía: vigente desde ISA-100 sobre `develop@f492007`.

## Propósito

Este directorio reúne la evidencia y las decisiones operativas de Telemetry Core. LMU Shared Memory y LMU REST local son fuentes principales complementarias de un único núcleo live. Overlay Studio, Desktop, OBS y Engineer/Spotter consumen proyecciones del núcleo; ninguno posee un segundo pipeline de telemetría.

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
[`recording-sink-sqlite-isa-102.md`](recording-sink-sqlite-isa-102.md) y ADR
0005.

TC-06C / ISA-103 añade replay raw, canónico e histórico y migraciones COW.
TC-06D / ISA-104 añade catálogo metadata-only, inspector local, paquete
sanitizado byte-exacto, UI correlacionada y una capacidad raw limitada todavía
sin wiring. Guías:
[`replay-migrations-isa-103.md`](replay-migrations-isa-103.md) e
[`inspector-privacy-diagnostic-export-isa-104.md`](inspector-privacy-diagnostic-export-isa-104.md).

## Jerarquía de autoridad

1. `AGENTS.md` y `docs/agent-workflow.md` gobiernan el proceso.
2. Los documentos de evidencia de `docs/telemetry-core/` describen lo ya observado e integrado.
3. El plan maestro describe el resultado y el orden global.
4. Un microplan solo es ejecutable cuando su cabecera lo indica.
5. Linear refleja el estado operativo y la rama de cada issue.

Si dos documentos contradicen evidencia más reciente, prevalece la evidencia actual y se detiene la ejecución hasta reconciliar el plan.

## Estado real reconciliado

- TC-01 está completado e integrado en `develop` mediante ISA-23, ISA-24, ISA-25, ISA-96 e ISA-97.
- La base global de Go quedó verde en ISA-97.
- TC-02 y TC-03 están cerrados en la cadena apilada. TC-04A–C implementaron
  reducer, coordinación/hechos y derivaciones; TC-04D / ISA-38 implementa
  fan-out, backpressure y observabilidad. TC-05A/B están cerrados
  técnicamente, TC-05C y TC-06A están cerrados en la base de ISA-102. TC-06B y
  TC-06C y TC-06D están cerrados técnicamente, sin promoción.
  TC-07–TC-09 siguen pendientes.
- La cadena permanece en ramas de issue sin wiring productivo ni promoción. El
  handoff vivo de `docs/vantare-program/` contiene los SHAs y siguiente corte.

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

## Plan vigente desde 2026-07-19

Isaac aprobó la arquitectura modular y sus guardarraíles. ADR 0004 y `docs/superpowers/plans/2026-07-19-telemetry-core-final-architecture-master.md` sustituyen los microplanes TC-02–TC-05 del 2026-07-13. La ejecución comienza en ISA-26 y continúa por TC-02–TC-09; una issue, rama, worktree, chat, review y pausa cada vez.

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
