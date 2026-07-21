# Telemetry Core — autoridad y fronteras

Estado de esta guía: vigente desde ISA-100 sobre `develop@f492007`.

## Propósito

Este directorio reúne la evidencia y las decisiones operativas de Telemetry Core. LMU Shared Memory y LMU REST local son fuentes principales complementarias de un único núcleo live. Overlay Studio, Desktop, OBS y Engineer/Spotter consumen proyecciones del núcleo; ninguno posee un segundo pipeline de telemetría.

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
- TC-02 quedó cerrado mediante ISA-26–29. TC-03 avanza de forma apilada: ISA-30 inventarió las fuentes, ISA-31 fijó lifecycle/selección, ISA-32 implementó Shared Memory en `539da68604d14df88f0d87638028f1f46ca95d8e` e ISA-33 implementa REST local sobre esa base. ISA-34 (autoridad/fusión) todavía no ha comenzado; TC-04–TC-09 permanecen sin iniciar.
- ISA-33 está preparada para `In Review`, sin wiring productivo ni merge, y requiere validación manual de Isaac antes de iniciar ISA-34.

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
- Nada entra en `develop` sin validación manual completa y aprobación explícita de Isaac.

## Plan vigente desde 2026-07-19

Isaac aprobó la arquitectura modular y sus guardarraíles. ADR 0004 y `docs/superpowers/plans/2026-07-19-telemetry-core-final-architecture-master.md` sustituyen los microplanes TC-02–TC-05 del 2026-07-13. La ejecución comienza en ISA-26 y continúa por TC-02–TC-09; una issue, rama, worktree, chat, review y pausa cada vez.

Los planes anteriores se conservan como historia, marcados `SUPERSEDED`. No deben usarse para lanzar trabajo pendiente.
