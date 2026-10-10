> Roadmap #1535: las referencias a plan.md/generador en este documento son históricas.
> ClickUp es la única fuente; ver [mantenimiento vigente](../../roadmap-maintenance.md).

# Handoff vivo — Telemetry Core

Estado de la base indicada; releer la issue antes de ejecutar.
[Histórico completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/telemetry-core.md): conserva IDs, decisiones, informes, fallos y evidencia de cada ronda. No copiar ese diario aquí.

## 1. Resultado

Adquisición neutral LMU/ACC, calidad/frescura, fusión y derivaciones, publicación de fotos y journal. El núcleo entrega hechos: no pinta UI ni recomienda estrategia.

## 2. Autoridad y lectura verificada

Leídos [#1562](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1562), [#1527](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1527), [#1474](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1474) y [#1498](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1498); GitHub/Project Vantare gobierna estado. Entradas: [contratos nativos](../../../native/README.md), [reglas](../../../native/AGENTS.md), [ADR 0099](../../adr/0099-arquitectura-rust-nativa.md). Escritura de esta compactación verificada en #1561.

## 3. Estado real y canal

Base incorporada: `origin/nightly@acff350d740d33ae8901291b63d69da004912fbc`, con #1562/PR #1576 integrada. Resolución de merge de #1564/PR #1577 en `vantareapp/isa-1564-widgets-por-sesion-impl`, validación local completada: fmt/Clippy, Nextest 1613/1613 (7 skips), lifecycle 18/18 y telemetría 25/25 PASS. #1562 introduce situación neutral y DTO live v10; #1573 conserva admisión de acceso frente al cierre por juego. Sin promoción ni release. Evidencia anterior #1562: Nextest 1590/1590, lifecycle 18/18 y telemetría 25/25; el resultado post-merge se acredita con logs merge-*.log en C:/tmp/ola2/evidence-1564, separado del resultado anterior.

## 4. Decisiones cerradas

- `Adapter::poll` no bloquea y recibe reloj; Origin conserva tiempo de origen/recepción. Capacidades y calidad explícitas, sin fallbacks sintéticos.
- Live negocia solo DTO v10 en esta base; versiones guardadas anteriores pasan por lectores explícitos, nunca por el lector live.
- Fotos latest-wins no sustituyen journal/cursor/ACK de eventos. Época nueva invalida estado previo.
- Demand no autoriza inventar datos ni poner reglas del simulador en widgets; adapters privados y ViewModels puros.
- Catálogo de señales único descartado en #1561: no habría ahorrado ficheros en los cambios observados. Reconsiderar ante un adapter/señal nuevos con coste medido.

## 5. Arquitectura y ownership

[Adapter](../../../native/domain/src/adapter.rs), [merge](../../../native/runtime/src/core/merge.rs), [DTO](../../../native/ipc/src/dto.rs) y [codec](../../../native/ipc/src/codec.rs). Runtime posee adquisición/adapters y supervisión; domain es puro; IPC posee wire. No hay dependencia transitiva domain/UI→runtime ni lectores del juego en Engineer/widgets.

## 6. Evidencia y límites

Evidencia registrada en la base, no reejecutada por esta entrega documental: integración #1531, fmt/check/Clippy `-D warnings`, Nextest 1574/1574 (7 skips heredados), lifecycle 18/18 y telemetría 25/25. No convierte fixtures/replays en prueba física LMU/ACC, OBS, DPI, audio ni latencia de entrada. #1474 conserva informe `C:/tmp/fase2/informe-1473-integracion.md` y goldens ACC/LMU; su issue sigue abierta pendiente aceptación. Huellas de retirada y fixtures conservan procedencia; no alterar oráculos para pasar gates. #1562 reporta retirement 456/456 e inversión exacta de pins; la validación del merge #1564 queda separada: Nextest 1613/1613, lifecycle 18/18, telemetría 25/25 y retirement 456/456 PASS, sin QA física nueva.

## 7. Riesgos y deuda

- P1: #1562/#1527 comparten contrato neutral; decidir VERSION sobre la base integrada y mantener compatibilidad de archivos.
- P2: señales ausentes/replay LMU no verificados no autorizan ocultación ni referencias Delta inventadas.
- Pendientes físicos/plataforma: LMU/ACC live, macOS y otros simuladores; tests de corpus no equivalen a esos gates.
- Mantener fallos de golden/plataforma y tests de concurrencia registrados (#1471/#1478), sin relajar aserciones.

## 8. Issues terminadas, activas y pendientes

Cerradas en la base: #1530 (DTO), #1532 (contratos de catálogo/disk), #1534 (crates), #1536 y arreglos dependientes. Abiertas: #1474/#1498; activas de feature #1562 y #1527. Los IDs TC/ISA históricos se conservan en el archivo por SHA; el maestro V2 antiguo es contexto y no otra cola de ejecución.

## 9. Siguiente acción exacta

Publicar el merge #1564 ya validado localmente y comprobar CI/SHA remoto, conservando señales/fixtures y reglas de #1562. #1527 necesita señales independientes para última vuelta/sesión: releer su issue antes de implementar, coordinar sobre el DTO live v10 integrado y conservar compatibilidad de archivos. QA física de #1562 y paridad histórica se siguen en su issue.

## 10. Última actualización

2026-10-10 · GitHub #1564 · Codex. Nightly/#1576 y contrato DTO leídos; resolución autorizada de merge con plantilla de estado actual. Diario y checks en #1564; no ejecutar features de otras issues desde este handoff.
