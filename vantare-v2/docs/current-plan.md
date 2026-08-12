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
- Base integrada comprobada de este corte: merge-base productivo `8880a8800e07e2af21fe5ff37a714578bf8fcd00`. Observación 2026-08-12 (tras fetch): `origin/nightly` en `234794d238a59fa14be53431065bf88eca46459a` (ISA-330); sin deriva en `internal/engineer` y cambios `cmd/vantare` solo Overlay Studio, sin deriva funcional Engineer; el SHA de Nightly es observación, no autoridad fija.
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
7. Cuando este indice marque un handoff bloqueado por estado heredado, la
   sintesis procede de Git/Linear y el handoff no se usa para ejecutar hasta su
   reconciliacion trazada.

## Telemetry Core

- **Estado demostrado:** ISA-160 / TC-10A esta integrada en Nightly mediante
  PR #202; `origin/nightly@8880a88` contiene la auditoria ejecutable de senales
  live para Strategy. CI del PR integrado: verde.
- **Issue/fase:** ISA-161 / TC-10B figura `In Progress` desde
  2026-08-11T12:23:02Z, pero Linear la muestra archivada desde
  2026-08-11T12:30:35Z. La consulta viva no devuelve `blockedBy`, PR ni CI.
- **Bloqueo:** una issue archivada no es autoridad ejecutable aunque conserve el
  estado `In Progress`; tampoco hay entrega remota demostrada para TC-10B.
- **Handoff bloqueado:** su bloque vivo aun presenta PR #202 y el merge de
  ISA-160 como pendientes, en conflicto con Git/Linear. No es entrada ejecutable
  hasta reconciliarlo y registrar la evidencia vigente.
- **Siguiente accion:** no ejecutar TC-10B. Restaurar o reconciliar primero en
  Linear la autoridad de ISA-161 y su rama canonica, y reconciliar el bloque
  vivo del [handoff de Core](vantare-program/handoffs/telemetry-core.md).
  Despues se verifican base/worktree contra Nightly. VE, neumaticos y weather
  siguen `unsupported/missing` hasta evidencia propia.

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
- **Issue activa:** ISA-327 / ENG-S1 — replanning técnico de S1 (autoridades y
  baseline confiable), `In Progress`, rama propia
  `vantareapp/isa-327-eng-s1-spotter-autoridades-y-baseline-confiable`; la
  implementacion no ha comenzado hasta aprobar su microplan. ISA-313 / ENG-R01
  sigue como programa/fase padre aceptado humanamente el 2026-08-12, aun no
  promovido.
- **Evidencia/publicacion:** el
  [handoff vivo](vantare-program/handoffs/engineer-spotter.md) es la unica
  autoridad para detalle mutable de rama, SHA, PR, CI y reviews; este indice no
  lo duplica.
- **Bloqueo:** ISA-187 / ENG-16 e ISA-189 / ENG-18 siguen `Backlog` en Linear.
  ISA-314 conserva el bug de guardado separado. S2/ISA-189, S4/ISA-187 e
  ISA-314 quedan diferidos expresamente hasta cerrar S1.
- **Siguiente accion:** revalidar Nightly antes de Corte A (detenerse solo por deriva funcional relevante para Engineer en `internal/engineer` o en wiring/call sites Engineer en `cmd/vantare` respecto a `8880a880`; cambios ajenos en `cmd/vantare` no bloquean solo por path; el SHA de Nightly es observación, no autoridad fija);
  publicar PR draft/CI y obtener la review final Claude cuando la cuota lo permita (DeepSeek READY; Opus/Fable final pendientes por cuota; la review Opus anterior no se marca como final PASS);
  solo después aprobar humanamente el [microplan de S1](engineer/phases/spotter/plan.md) y decidir el cambio visible Spotter ES→EN. No iniciar Corte A aún.
- **Entrada de planificacion:** [router Engineer](engineer/README.md),
  [handoff vivo](vantare-program/handoffs/engineer-spotter.md),
  [roadmap general](engineer/engineer-beta-roadmap.md) y
  [aceptacion](engineer/phases/spotter/acceptance.md). Todo cambio tecnico
  Engineer/Spotter lo implementa un worker subagente.

## Strategy Planner

- **Estado demostrado:** ISA-309 / STR-N02 esta `Done`; PR #192 fue integrado y
  la pila acumulativa vive en Nightly desde `7e39104`.
- **Issue/fase activa:** ISA-162 / STR-15B esta `In Progress`; PR draft #201
  tiene checks verdes sobre su HEAD publicado.
- **Bloqueo:** la ejecucion live espera ISA-161; la entrada historica espera
  ISA-132 e ISA-159. No se crea un reader ni fallback local en Strategy.
- **Handoff bloqueado:** aun describe PR #192 como abierto y una siguiente issue
  ya superada. El estado superior procede de Git/Linear; el
  [handoff de Strategy](vantare-program/handoffs/strategy-planner.md) no es
  entrada ejecutable hasta reconciliar su bloque vivo.
- **Siguiente accion:** reconciliar ese handoff con ISA-309, ISA-162 y sus PR;
  solo despues confirmar el siguiente corte de ejecucion.

## Overlay Studio, Launcher y Hub

- **Estado demostrado:** Workshop, gates y los cuatro widgets Redline estan en
  Nightly; ISA-308/PR #195 esta `Done`. ISA-315 esta `Nightly` mediante PR #198.
- **Fase activa:** estabilizar Overlay Studio V1 en `testers` antes del
  2026-08-31 conforme al
  [plan comercial controlado](overlays-studio/overlay-studio-v1-commercial-launch-plan.md).
  Esto no equivale a `master`, Stable publico, venta ni suite completa.
- **Bloqueo:** la promocion a Testers necesita issue, gates y autorizacion
  propios. Billing y migracion de raiz bloquean la venta, no el hito Testers.
- **Handoff bloqueado:** conserva PR #195 y acciones ISA-311 ya superadas. El
  estado superior procede de Git/Linear; el
  [handoff Overlay/Launcher/Hub](vantare-program/handoffs/overlays-launcher-hub.md)
  no es entrada ejecutable hasta reconciliar su bloque vivo.
- **Siguiente accion:** reconciliar ese handoff con ISA-308, ISA-315 y Nightly;
  solo despues confirmar fechas, gates y el siguiente corte. Launcher y Hub
  conservan sus auditorias previas a nuevas features.

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

La bitacora monolitica retirada se conserva en los padres completos
`61a5c99cb8fe9231368f263a3c73b1d1322db488` (Engineer/Spotter) y
`8880a8800e07e2af21fe5ff37a714578bf8fcd00` (Nightly), reconciliados por el merge
`1fcbbb91f511e3dda73f48376453ab1d9afbb28e`. Para auditoria historica puede
leerse `vantare-v2/docs/current-plan.md` en esos SHAs; este indice y las fuentes
vivas superiores son la unica entrada de ejecucion.
