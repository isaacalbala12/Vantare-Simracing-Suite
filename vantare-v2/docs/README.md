# Documentacion de Vantare v2

Este es el unico router documental operativo. No contiene estado de issues,
ramas o releases. Esos campos pertenecen a Linear y Git/GitHub según
[`vantare-program/source-ownership.md`](vantare-program/source-ownership.md).

## Entrada para cualquier tarea

1. Lee [`../AGENTS.md`](../AGENTS.md).
2. Abre la issue de Linear asignada y verifica proyecto, alcance, dependencias,
   rama, base esperada y destino.
3. Contrasta esos datos con la raiz Git, worktree, rama, HEAD y dirty state
   observados.
4. Elige en la tabla inferior el handoff y los contratos aplicables.
5. Lee el codigo y los tests que demuestran el comportamiento actual.

La raiz Git puede estar por encima del directorio `vantare-v2`; usa
`git rev-parse --show-toplevel` y no la deduzcas desde el directorio abierto.
Sin issue verificada se permite investigar en solo lectura, pero no editar.

## Router por proyecto

| Proyecto o alcance | Handoff vivo | Contratos de entrada |
|---|---|---|
| Telemetry Core | [`handoffs/telemetry-core.md`](vantare-program/handoffs/telemetry-core.md) | [`telemetry-core/`](telemetry-core/), [`adr/0004-telemetry-core-modular-observation-architecture.md`](adr/0004-telemetry-core-modular-observation-architecture.md) |
| Telemetry Analysis | [`handoffs/telemetry-analysis.md`](vantare-program/handoffs/telemetry-analysis.md) | [`vantare-program/research/telemetry-analysis/README.md`](vantare-program/research/telemetry-analysis/README.md) |
| Engineer y Spotter | [`handoffs/engineer-spotter.md`](vantare-program/handoffs/engineer-spotter.md) | [`engineer/engineer-beta-roadmap.md`](engineer/engineer-beta-roadmap.md) |
| Strategy Planner | [`handoffs/strategy-planner.md`](vantare-program/handoffs/strategy-planner.md) | [`strategy-planner/README.md`](strategy-planner/README.md), [`adr/0006-strategy-planner-unified-domain-and-ownership.md`](adr/0006-strategy-planner-unified-domain-and-ownership.md) |
| Overlay Studio, widgets, Launcher y Hub | [`handoffs/overlays-launcher-hub.md`](vantare-program/handoffs/overlays-launcher-hub.md) | [`adr/0003-overlay-studio-v3-rebuild.md`](adr/0003-overlay-studio-v3-rebuild.md), [`overlays-studio/`](overlays-studio/) |
| Testing Center | [`platform-commercial.md`, sección Testing Center](vantare-program/handoffs/platform-commercial.md#testing-center) | [`adr/0007-testing-center-linear-operational-authority.md`](adr/0007-testing-center-linear-operational-authority.md), [`runbooks/testing-center-ui.md`](runbooks/testing-center-ui.md) |
| Plataforma, cuenta, Billing, calendario y releases | [`handoffs/platform-commercial.md`](vantare-program/handoffs/platform-commercial.md) | [`vantare-program/product-contract.md`](vantare-program/product-contract.md), [`branch-channels.md`](branch-channels.md) |
| Gobernanza transversal | La issue de Linear y este router | [`vantare-program/README.md`](vantare-program/README.md), [`vantare-program/execution-policy.md`](vantare-program/execution-policy.md), [`agent-workflow.md`](agent-workflow.md) |

Si una issue cruza proyectos, Linear debe indicar el owner principal y enlazar
los contratos adicionales. No se elige un handoff por similitud del titulo.

## Documentos estables

- [`vantare-program/product-contract.md`](vantare-program/product-contract.md):
  producto, licencias, privacidad e idiomas.
- [`vantare-program/project-map.md`](vantare-program/project-map.md): modulos,
  fronteras y dependencias.
- [`vantare-program/execution-policy.md`](vantare-program/execution-policy.md):
  autonomia, review y promociones.
- [`agent-workflow.md`](agent-workflow.md): flujo orquestador, worker y reviewer.
- [`branch-channels.md`](branch-channels.md): canales, gates y rollback.
- [`testing-strategy.md`](testing-strategy.md): estrategia y comandos de tests.
- [`manual-verification.md`](manual-verification.md): verificacion manual.
- [`adr/`](adr/): decisiones tecnicas. Usa siempre el path completo porque
  existen IDs historicos repetidos.

Los planes detallados viven en `superpowers/plans/`, pero solo son ejecutables
cuando la issue de Linear los enlaza. Un handoff puede recomendarlos como
contexto técnico, pero no autoriza su ejecución. Encontrar un plan por búsqueda
no lo convierte en autoridad.

## Workers y reviewers

Los prompts reutilizables viven en [`prompts/`](prompts/). Todos deben recibir
el sobre de tarea de `AGENTS.md`; `docs/current-plan.md` esta retirado y no se
usa para elegir trabajo.

Un reviewer lee la issue, el router, los contratos aplicables, el diff y la
evidencia fresca. No necesita cargar el archivo historico salvo que investigue
una decision pasada concreta.

## Historial

El antiguo plan acumulativo se conserva en
[`archive/current-plan-through-2026-08-10.md`](archive/current-plan-through-2026-08-10.md).
Es contexto sin autoridad operativa y no recibe nuevas notas.

Los documentos marcados como historicos, superados o archivados tampoco
autorizan trabajo, aunque sigan versionados para preservar razonamiento y
evidencia.
