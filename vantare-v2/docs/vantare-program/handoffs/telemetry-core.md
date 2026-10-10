# Handoff vivo — Telemetry Core

Estado de la base indicada; releer la issue antes de ejecutar.
[Histórico completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/telemetry-core.md): conserva IDs, decisiones, informes, fallos y evidencia de cada ronda. No copiar ese diario aquí.

## 1. Resultado

Adquisición neutral LMU/ACC, calidad/frescura, fusión y derivaciones, publicación de fotos y journal. El núcleo entrega hechos: no pinta UI ni recomienda estrategia.

## 2. Autoridad y lectura verificada

Leídos [#1562](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1562), [#1527](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1527), [#1474](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1474) y [#1498](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1498); GitHub/Project Vantare gobierna estado. Entradas: [contratos nativos](../../../native/README.md), [reglas](../../../native/AGENTS.md), [ADR 0099](../../adr/0099-arquitectura-rust-nativa.md). Escritura de esta compactación verificada en #1561.

## 3. Estado real y canal

Base de código contrastada: `origin/nightly@ca17545f607b85f5d47dc9d060721b69e6a6a158`. Esta compactación vive en `vantareapp/isa-1561-docs`; no cambia producto ni acredita integración de las ramas de ola 2. SHA final y push en [#1561](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1561) y `C:/tmp/buzon/1561-docs.md`. PR [#1570](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1570) contra nightly, con auto-merge autorizado por el orquestador. Nightly `0cf38ed2` incorporada mediante merge `dbee0c18`; sin promoción ni release. #1562 prepara DTO v10 en `vantareapp/isa-1562-ocultar-fuera-de-pista`, hito `2d392341`; gates aún en validación al leer. No cambiar aquí la versión documentada del código base.

## 4. Decisiones cerradas

- `Adapter::poll` no bloquea y recibe reloj; Origin conserva tiempo de origen/recepción. Capacidades y calidad explícitas, sin fallbacks sintéticos.
- Live negocia solo DTO v9 en esta base; fotos guardadas v7/v8 pasan por lectores explícitos, nunca por el lector live.
- Fotos latest-wins no sustituyen journal/cursor/ACK de eventos. Época nueva invalida estado previo.
- Demand no autoriza inventar datos ni poner reglas del simulador en widgets; adapters privados y ViewModels puros.
- Catálogo de señales único descartado en #1561: no habría ahorrado ficheros en los cambios observados. Reconsiderar ante un adapter/señal nuevos con coste medido.

## 5. Arquitectura y ownership

[Adapter](../../../native/domain/src/adapter.rs), [merge](../../../native/runtime/src/core/merge.rs), [DTO](../../../native/ipc/src/dto.rs) y [codec](../../../native/ipc/src/codec.rs). Runtime posee adquisición/adapters y supervisión; domain es puro; IPC posee wire. No hay dependencia transitiva domain/UI→runtime ni lectores del juego en Engineer/widgets.

## 6. Evidencia y límites

Evidencia registrada en la base, no reejecutada por esta entrega documental: integración #1531, fmt/check/Clippy `-D warnings`, Nextest 1574/1574 (7 skips heredados), lifecycle 18/18 y telemetría 25/25. No convierte fixtures/replays en prueba física LMU/ACC, OBS, DPI, audio ni latencia de entrada. #1474 conserva informe `C:/tmp/fase2/informe-1473-integracion.md` y goldens ACC/LMU; su issue sigue abierta pendiente aceptación. Huellas de retirada y fixtures conservan procedencia; no alterar oráculos para pasar gates. #1562 reporta retirement 456/456 e inversión exacta de pins, con gates finales aún pendientes.

## 7. Riesgos y deuda

- P1: #1562/#1527 comparten contrato neutral; decidir VERSION sobre la base integrada y mantener compatibilidad de archivos.
- P2: señales ausentes/replay LMU no verificados no autorizan ocultación ni referencias Delta inventadas.
- Pendientes físicos/plataforma: LMU/ACC live, macOS y otros simuladores; tests de corpus no equivalen a esos gates.
- Mantener fallos de golden/plataforma y tests de concurrencia registrados (#1471/#1478), sin relajar aserciones.

## 8. Issues terminadas, activas y pendientes

Cerradas en la base: #1530 (DTO), #1532 (contratos de catálogo/disk), #1534 (crates), #1536 y arreglos dependientes. Abiertas: #1474/#1498; activas de feature #1562 y #1527. Los IDs TC/ISA históricos se conservan en el archivo por SHA; el maestro V2 antiguo es contexto y no otra cola de ejecución.

## 9. Siguiente acción exacta

Completar gates de #1562 sobre su árbol: fmt/Clippy/Nextest/lifecycle y telemetría, fixtures LMU/ACC, ausencia de señal, pit lane y previews. Su issue exige paridad histórica primero y no ocultar por datos ausentes. #1527 necesita señales independientes para última vuelta/sesión, con calidad y gate de telemetría; coordinar con DTO v10 de #1562 antes de implementar. No ejecutar esas features desde la rama docs.

## 10. Última actualización

2026-10-10 · GitHub #1561 · Codex. Código, README del área e issues leídos; seguimiento #1561 escrito y releído. Las siguientes acciones de área proceden de las issues abiertas, sin nuevas autorizaciones implícitas. El diario y los avances por ronda se escriben en la issue; aquí se sustituye el estado.
