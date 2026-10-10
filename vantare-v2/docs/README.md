# Documentación vigente de Vantare

Este es el índice de documentación. La aplicación de esta rama es [Rust + GPUI](../native/README.md), según [ADR 0099](adr/0099-arquitectura-rust-nativa.md). Los contratos se contrastan con el código; un plan o una captura no demuestra disponibilidad pública.

## Uso de una build

[Instalación y pruebas](tester-build-instructions.md) · [OBS local](obs-local-setup.md) · [Incidencias](tester-known-issues.md) · [Feedback](tester-feedback-process.md).

## Desarrollo y revisión

1. [AGENTS](../AGENTS.md), issue en [GitHub Issues](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues) y GitHub Project Vantare.
2. [Expediente técnico](vantare-program/README.md), contrato aplicable y único handoff del área.
3. [Reglas nativas](../native/AGENTS.md), [mapa y topología](../native/README.md), README del crate afectado y [modelo de dominio](domain-model.md).
4. [Workflow](agent-workflow.md), [canales](branch-channels.md) y gates del README nativo antes de entregar.

## Contratos por tema

| Tema | Entrada |
|---|---|
| Producto y etapas | [Contrato](vantare-program/product-contract.md), [beta y lanzamiento](plan-beta-publica-y-lanzamiento.md) |
| Telemetría live | [Contratos nativos](../native/README.md), [handoff](vantare-program/handoffs/telemetry-core.md) |
| Análisis post-sesión | [Storage nativo](../native/storage/README.md), [handoff](vantare-program/handoffs/telemetry-analysis.md) |
| Engineer/Spotter | [Crate](../native/engineer/README.md), [handoff](vantare-program/handoffs/engineer-spotter.md) |
| Strategy Planner | [Crate](../native/strategy/README.md), [handoff](vantare-program/handoffs/strategy-planner.md) |
| Studio, widgets y Launcher | [Hub](../native/hub/README.md), [UI/Workshop](../native/ui/README.md), [handoff](vantare-program/handoffs/overlays-launcher-hub.md) |
| Cuenta, Billing y releases | [Servicios](../native/services/README.md), [identidad](adr/0100-identidad-clerk-polar-supabase.md), [handoff](vantare-program/handoffs/platform-commercial.md) |
| Testing Center | [Handoff](vantare-program/handoffs/testing-center.md), [runbooks](runbooks/) |
| Marca y UI | [Marca](BRAND.md), [diseño](DESIGN.md), [ADRs](adr/README.md) |

## Gobierno e histórico

GitHub Issues contiene alcance, dependencias y estado; GitHub prueba código, PR, CI, canal y release. Para el roadmap público, consultar [su procedimiento](roadmap-maintenance.md); #1535 actualiza ese contrato por separado.
Los planes de `superpowers/` solo se ejecutan cuando la issue vigente los adopta. `analysis/`, `research/`, specs y guías del legado conservan su corte; sus comandos y estados no son instrucciones actuales.
Histórico retirado en #1561: [inventario](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/documentation-inventory.md), [transición del tracker](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/notion-transition.md) y [auditoría del tracker](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/notion-document-audit.md). El historial completo permanece en Git.
