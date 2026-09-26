# Documentación vigente de Vantare

Este índice es la entrada de lectura. El [inventario](documentation-inventory.md) separa guías actuales, contratos, planes y evidencia histórica. No hay que leer todo el archivo para empezar.

## Uso de una build

[Instalación y pruebas](tester-build-instructions.md) · [OBS local](obs-local-setup.md) · [Incidencias](tester-known-issues.md) · [Feedback](tester-feedback-process.md).

## Desarrollo y revisión

1. [AGENTS](../AGENTS.md), tarea y proyecto en [Notion](https://app.notion.com/p/3fce51695c65834e80b381ec2d632192).
2. [Expediente técnico](vantare-program/README.md) y handoff del módulo.
3. [Operaciones](operations.md), [arquitectura](architecture.md) y [modelo de dominio](domain-model.md).
4. [Pruebas](testing-strategy.md) y [verificación manual](manual-verification.md).

## Contratos por tema

| Tema | Entrada |
|---|---|
| Producto y etapas | [Contrato de producto](vantare-program/product-contract.md), [etapas de beta y lanzamiento](plan-beta-publica-y-lanzamiento.md) |
| Telemetría live | [Telemetry Core](telemetry-core/README.md) y [handoff](vantare-program/handoffs/telemetry-core.md) |
| Análisis post-sesión | [Handoff y límites de integración](vantare-program/handoffs/telemetry-analysis.md), [investigación y contratos](vantare-program/research/telemetry-analysis/README.md) |
| Engineer/Spotter | [Handoff](vantare-program/handoffs/engineer-spotter.md) y [rework](engineer/rework-spec.md) |
| Strategy Planner | [Handoff](vantare-program/handoffs/strategy-planner.md) y [contrato de documento](strategy-planner/f1-3-contrato-documento-v2.md) |
| Studio y widgets | [Studio](overlays-studio/README.md), [Workshop](overlays-studio/overlay-workshop-authoring-guide.md), [ADR](adr/) |
| Launcher | [Arquitectura Launcher](launcher-v3-architecture.md) |
| Cuenta, Billing y releases | [Handoff plataforma](vantare-program/handoffs/platform-commercial.md), [cuenta y runbooks Billing](billing/README.md), [artefactos](release-artifacts.md) |
| Testing Center | [Handoff](vantare-program/handoffs/testing-center.md) y [runbooks](runbooks/) |
| Marca y UI | [Marca](BRAND.md), [diseño](DESIGN.md); contrastar decisiones visuales con el handoff de Hub/Studio |

## Gobierno

[Workflow](agent-workflow.md) · [Notion primero](vantare-program/notion-transition.md) · [Canales](branch-channels.md) · [Roadmap público](roadmap-maintenance.md).

Notion contiene alcance y estado operativo. GitHub prueba código, PR, CI, canal y release. El roadmap público se edita y publica visualmente en la app. Los planes de `superpowers/` solo se ejecutan cuando la tarea vigente los adopta; la carpeta no significa que todos estén aprobados o pendientes.

## Histórico

[Inventario y archivos sustituidos](documentation-inventory.md). Los logs, auditorías, baselines y planes fechados describen su corte. Conservar una evidencia no significa que sus resultados sigan vigentes. Los documentos sustituidos enlazan a su versión inmutable en Git y a su sucesor.
