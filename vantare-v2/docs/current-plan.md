# Plan global vivo de Vantare

> Estado verificado: 2026-08-11. Este archivo es un indice de ejecucion, no una
> bitacora. La cronologia retirada sigue disponible en Git y no se usa para
> elegir trabajo.

## Proposito y autoridad

- Empieza aqui para localizar el proyecto, su estado demostrado, la issue o
  fase activa, los bloqueos y la siguiente accion.
- Linear es la autoridad operativa para alcance, dependencias, rama y estado.
  El codigo y la evidencia del runtime prevalecen para comportamiento real.
- Los contratos del [expediente canonico](vantare-program/README.md), el
  [mapa de proyectos](vantare-program/project-map.md) y el handoff vivo de cada
  proyecto explican fronteras y detalle. Un handoff no sustituye a Linear.
- Base integrada comprobada para este corte: `origin/nightly@8880a8800e07e2af21fe5ff37a714578bf8fcd00`.
- El flujo obligatorio sigue siendo `rama de issue -> nightly -> testers -> master`.
  Terminado, integrado, promocionado y publicado son estados distintos; las
  promociones reservadas requieren la aprobacion explicita de Isaac.

## Reglas de lectura y actualizacion

1. Lee [AGENTS.md](../AGENTS.md) y este indice.
2. Abre solo el handoff del proyecto asignado y sus contratos aplicables.
3. Consulta la issue de Linear, sus relaciones y el plan o microplan vigente.
4. Verifica rama, SHA, PR, CI y runtime antes de repetir un estado.
5. Usa documentos historicos solo como contexto. No conviertas una nota antigua
   en orden de ejecucion.
6. Si cambia estado, evidencia, riesgo o siguiente accion, actualiza el handoff,
   Linear y este indice sin anadir cronologia.

## Telemetry Core

- **Estado demostrado:** ISA-160 / TC-10A esta integrada en Nightly mediante
  PR #202; `origin/nightly@8880a88` contiene la auditoria ejecutable de senales
  live para Strategy. CI del PR integrado: verde.
- **Issue/fase:** ISA-161 / TC-10B permanece `Backlog` en Linear.
- **Bloqueo:** Linear aun declara ISA-160 como `blockedBy` de ISA-161, aunque el
  commit ya esta en Nightly; hay que reconciliar esa relacion antes de ejecutar.
- **Siguiente accion:** alinear Linear y el
  [handoff de Core](vantare-program/handoffs/telemetry-core.md); despues
  microplanificar el productor aditivo `StrategyLiveProjection v1`. VE,
  neumaticos y weather siguen `unsupported/missing` hasta evidencia propia.

## Telemetry Analysis

- **Estado demostrado:** ISA-168 / TA-03C figura `Nightly` en Linear. El helper
  DuckDB sigue limitado a artefactos LMU locales autorizados; no habilita
  imports externos o comunitarios.
- **Issue/fase:** ISA-132 / TA-04 esta `Backlog`; ISA-159 / TA-05 tambien esta
  `Backlog` y depende de TA-04.
- **Bloqueo:** las relaciones de Linear aun muestran dependencias ya llevadas a
  Nightly; deben reconciliarse antes de afirmar que TA-04 esta desbloqueada.
- **Siguiente accion:** alinear Linear con el
  [handoff de Analysis](vantare-program/handoffs/telemetry-analysis.md), ejecutar
  TA-04 y solo despues producir `StrategyInputProjection v1` en ISA-159.

## Engineer / Spotter

- **Estado demostrado:** ENG-01..12, ENG-14 y ENG-15 estan en Nightly. La
  vertical Spotter existe, pero audio audible, multiclase, FCY/game phase y la
  aceptacion LMU extremo a extremo no estan demostrados.
- **Issue/fase activa:** ISA-313 / ENG-R01 esta `In Progress`, **Fase 5 —
  arquitectura documental Engineer para subagentes**. Este trabajo es el
  **Corte A: gobernanza y entrada global**; no modifica producto.
- **Rama/PR/CI:** rama
  `vantareapp/isa-313-eng-r01-reconciliar-nightly-y-replanificar-spotter`, PR
  draft #196. El HEAD publicado `61a5c99` tiene checks verdes; el merge local de
  `nightly@8880a88` y este corte ya tienen commit local, pero no push ni CI propio.
- **Bloqueo:** ISA-187 / ENG-16 e ISA-189 / ENG-18 siguen `Backlog` y bloqueadas
  por ISA-313. ISA-314 conserva por separado la promesa falsa de guardado.
- **Siguiente accion:** cerrar reviews del Corte A; despues ejecutar el Corte B
  de arquitectura documental Engineer. Solo tras aceptar la Fase 5 se prepara
  una issue/rama de producto para la primera subfase del
  [microplan Spotter](engineer/spotter-phase-1-microplan.md).
- **Entrada permitida:** [handoff vivo](vantare-program/handoffs/engineer-spotter.md),
  [roadmap general](engineer/engineer-beta-roadmap.md) y microplan activo. Todo
  cambio productivo Engineer/Spotter lo implementa un worker subagente; el
  orquestador no implementa producto, ni siquiera cambios triviales.

## Strategy Planner

- **Estado demostrado:** ISA-309 / STR-N02 esta `Done`; PR #192 fue integrado y
  la pila acumulativa vive en Nightly desde `7e39104`.
- **Issue/fase activa:** ISA-162 / STR-15B esta `In Progress`; PR draft #201
  tiene checks verdes sobre su HEAD publicado.
- **Bloqueo:** la ejecucion live espera ISA-161; la entrada historica espera
  ISA-132 e ISA-159. No se crea un reader ni fallback local en Strategy.
- **Siguiente accion:** revisar ISA-162/PR #201 y seguir el
  [handoff de Strategy](vantare-program/handoffs/strategy-planner.md); mantener
  separados catalogo firmado, comunidad y ejecucion live.

## Overlay Studio, Launcher y Hub

- **Estado demostrado:** Workshop, gates y los cuatro widgets Redline estan en
  Nightly; ISA-308/PR #195 esta `Done`. ISA-315 esta `Nightly` mediante PR #198.
- **Fase activa:** estabilizar Overlay Studio V1 en `testers` antes del
  2026-08-31 conforme al
  [plan comercial controlado](overlays-studio/overlay-studio-v1-commercial-launch-plan.md).
  Esto no equivale a `master`, Stable publico, venta ni suite completa.
- **Bloqueo:** la promocion a Testers necesita issue, gates y autorizacion
  propios. Billing y migracion de raiz bloquean la venta, no el hito Testers.
- **Siguiente accion:** congelar alcance el 2026-08-14 y preparar RC0 Nightly
  para el 2026-08-19. Launcher requiere una auditoria de integracion antes de
  features; Hub requiere characterization antes de `HUB-POLISH`.
- **Detalle:** [handoff Overlay/Launcher/Hub](vantare-program/handoffs/overlays-launcher-hub.md).

## Plataforma comercial y Testing Center

- **Estado demostrado:** Billing sigue **NO-GO** para venta. ISA-247 / BIL-10C
  esta `In Progress`; PR #127 y la correccion PR #199 estan integradas en
  Nightly, pero los gates remotos y monetarios no estan cerrados.
- **Otros frentes:** Account/Profile, Calendar, Settings e Installer necesitan
  proyecto o reconciliacion; la migracion de raiz espera el cierre de worktrees
  activos. Testing Center es independiente de los modulos de producto.
- **Bloqueo:** ningun apply remoto, dinero, produccion, venta o release queda
  autorizado por este indice. La migracion de raiz tiene riesgo P0 mientras
  existan worktrees activos.
- **Siguiente accion:** completar gates y review de ISA-247, presentar dry-run,
  backup y rollback antes de cualquier apply, y seguir el
  [handoff de plataforma](vantare-program/handoffs/platform-commercial.md).

## HISTORY — NO USAR PARA EJECUCION

La bitacora monolitica retirada se conserva en los dos padres de esta
reconciliacion: `61a5c99` (Engineer/Spotter) y `8880a88` (Nightly). Para una
auditoria historica puede leerse `vantare-v2/docs/current-plan.md` en esos SHAs;
este indice y las fuentes vivas superiores son la unica entrada de ejecucion.
