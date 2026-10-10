# Handoff vivo — Telemetry Analysis

Estado de la base indicada; releer la issue antes de ejecutar.
[Histórico completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/telemetry-analysis.md): conserva IDs, decisiones, informes, fallos y evidencia de cada ronda. No copiar ese diario aquí.

## 1. Resultado

Análisis post-sesión y gráficos a partir de series locales con calidad/procedencia. La ruta nativa no es el helper Go/LMU del histórico. No convertir resúmenes de muestras en tiempos de vuelta o ritmo no demostrados.

## 2. Autoridad y lectura verificada

Issue abierta [#1429](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1429), fase 4 de ADR 0099, y su [plan por fases](../../superpowers/plans/2026-09-29-arquitectura-rust-nativa.md) leídos antes del recorte. [Storage](../../../native/storage/README.md) y [Hub](../../../native/hub/README.md) fijan implementación actual; GitHub Project Vantare contiene el trabajo. #1561 registra/relee la actualización documental.

## 3. Estado real y canal

Base de código contrastada: `origin/nightly@ca17545f607b85f5d47dc9d060721b69e6a6a158`. Esta compactación vive en `vantareapp/isa-1561-docs`; no cambia producto ni acredita integración de las ramas de ola 2. SHA final y push en [#1561](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1561) y `C:/tmp/buzon/1561-docs.md`. Sin PR, merge, promoción ni release por este encargo. Storage y Analysis nativos están presentes en el código; #1429 sigue OPEN. El estado antiguo TA-03E/TA-03F no describe la aplicación de esta base ni certifica su aceptación actual.

## 4. Decisiones cerradas

- Recording opt-in: no activarlo al suscribir/arrancar Core.
- Storage es el único dueño de DuckDB/SQL; un proceso y una conexión secuencial, protocolo acotado.
- DB `vantare.series-db.v1`, payload SeriesChunk v1 independiente del DTO de fotos; no importar/migrar automáticamente una DB Go/LMU ajena.
- ACK tras COMMIT; repetición idéntica idempotente, conflicto no aceptado. Watermark no significa ausencia de huecos.
- `finished=false` no prueba writer vivo; attempted desconocido tras caída. Reliable conserva número; las otras calidades no se convierten en cero.

## 5. Arquitectura y ownership

[Storage](../../../native/storage/README.md) posee tablas/codec; [reader Hub](../../../native/hub/src/analysis/reader.rs) lanza helper oculto `--read-only` y pagina fuera de render. [Analysis](../../../native/hub/src/analysis/mod.rs) presenta modelos/gráficos sin enlazar DuckDB/runtime. No leer almacenamiento privado de Strategy ni duplicar adquisición live.

## 6. Evidencia y límites

Evidencia registrada en la base, no reejecutada por esta entrega documental: integración #1531, fmt/check/Clippy `-D warnings`, Nextest 1574/1574 (7 skips heredados), lifecycle 18/18 y telemetría 25/25. No convierte fixtures/replays en prueba física LMU/ACC, OBS, DPI, audio ni latencia de entrada. Protocolos `summaries` y `plot-page` y sus límites se verifican en storage/reader; el README documenta páginas de 16 y resúmenes acotados. Los tests y corpus congelados prueban el contrato cubierto; los antiguos benchmarks Go/CGO/SBOM describen solo aquel helper y permanecen enlazados por SHA.

## 7. Riesgos y deuda

- P1: contenido externo/comunitario requiere sandbox real; Job Object no es sandbox. TA-03D/ISA-164 histórico no autoriza nuevos imports.
- P2: locks, DB incompatible y cancelación deben conservar el archivo original y exponer causa real.
- Aceptación funcional/Windows de #1429 y datos reales con procedencia, sin asumir éxito del gate de instalación antiguo.
- No afirmar equivalencia completa entre DB de grabación nativa y 50 DuckDB LMU usados en el banco Strategy.

## 8. Issues terminadas, activas y pendientes

#1429 abierta es la referencia de implementación/aceptación nativa. #1459 es consumidor de evidencia histórica para Strategy, no propietario de DuckDB. TA-01..TA-05/ISA-122/124/126/135/164/168 y sus entregas quedan preservadas en el histórico, con su estado de aquel corte; no tratarlas como la tarea activa actual.

## 9. Siguiente acción exacta

Reconciliar #1429 con los criterios de fase 4: comprobar recording explícito, persistencia/reapertura/ACK, huecos, paginación, cancelación y lectura read-only en la build nativa autorizada. Pasar gates workspace/lifecycle y telemetría si cambia runtime/domain/IPC/testdata; documentar prueba real pendiente y aceptación en la issue. No reiniciar TA-03E/TA-03F Go a partir del handoff anterior.

## 10. Última actualización

2026-10-10 · GitHub #1561 · Codex. Código, README del área e issues leídos; seguimiento #1561 escrito y releído. Las siguientes acciones de área proceden de las issues abiertas, sin nuevas autorizaciones implícitas. El diario y los avances por ronda se escriben en la issue; aquí se sustituye el estado.
