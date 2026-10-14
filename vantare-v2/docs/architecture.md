# Arquitectura vigente

La decisión es [ADR 0099: Rust + GPUI](adr/0099-arquitectura-rust-nativa.md).
El único mapa de crates, dependencias y procesos vive en [native/README.md](../native/README.md), especialmente «Dependencias permitidas», «Ciclo de vida» y «Topología».

Antes de editar, leer [las reglas nativas](../native/AGENTS.md), el README del crate, la issue de GitHub y el [handoff del área](vantare-program/README.md).
Los DTO, los servicios y el control tienen versiones independientes; sus contratos actuales y lectores de datos guardados se documentan en el README nativo y en IPC.
La identidad remota sigue [ADR 0100](adr/0100-identidad-clerk-polar-supabase.md); los Looks siguen [ADR 0101](adr/0101-widgets-looks-common-state.md).

## Histórico

[Arquitectura anterior completa](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/architecture.md): describe Wails/React, retirados de esta rama por #1533. No reconstruir ese stack a partir de sus comandos ni inferir una release pública de la retirada local.
