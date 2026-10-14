# Handoff vivo — Telemetry Analysis

Estado de la base indicada; releer la issue antes de ejecutar.
[Histórico completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/telemetry-analysis.md): conserva IDs, decisiones, informes, fallos y evidencia de cada ronda. No copiar ese diario aquí.

## 1. Resultado

Análisis post-sesión y gráficos a partir de series locales con calidad/procedencia. La ruta nativa no es el helper Go/LMU del histórico. No convertir resúmenes de muestras en tiempos de vuelta o ritmo no demostrados.

## 2. Autoridad y lectura verificada

Issue abierta [#1429](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1429), fase 4 de ADR 0099, y su [plan por fases](../../superpowers/plans/2026-09-29-arquitectura-rust-nativa.md) leídos antes del recorte. [Storage](../../../native/storage/README.md) y [Hub](../../../native/hub/README.md) fijan implementación actual; GitHub Project Vantare contiene el trabajo. #1561 registra/relee la actualización documental.

## 3. Estado real y canal

#1606 / VANTA-46 En curso, ronda 2, mismo PR draft #1616 a nightly:
Sol confirma F5 parcial en gráficos. N3 reproduce seq1 fiable, seq2 omitida
y seq3 fiable dentro de un chunk: DuckDB real→plot-page→Reader→proyección
une ambos extremos (RED segmentos 1/1). Arreglo mínimo en Reader: aislar los
puntos de chunks marcados gap, porque v1 no localiza el corte. Mantiene datos
fiables, formato y límite de 1.000.000 incluyendo separadores; no cambia pintor
ni diseño. Hub analysis 11/11 y Core/feed/codec 9/9 GREEN; gates finales pendientes.
La curva puede quedar como puntos aislados en todo chunk con gap, incluidos
chunks posteriores si el flag sigue activo. No se inventa continuidad.
Logs C:/tmp/1606-evidence/r2-*. Sin datos reales ni merge/promoción/release.

#1584 (2026-10-13), rama `vantareapp/isa-1584-duckdb-locked-windows` desde
`origin/nightly@707514e296bdd3dcc07e14bfffa92b4171fa9749`: `open_error` reconoce
«being used by another process» como `locked`. El binding DuckDB 1.10505.0
conserva estado genérico y diagnóstico, sin código Win32 específico al abrir.
Regresión con `DuckDBFailure`: falla antes (`unreadable`) y pasa después
(`locked`), conservando el diagnóstico completo. Smoke Hub existente intacto.
Fmt/check/Clippy PASS; Nextest 1627/1627 (7 skips) y lifecycle PASS por
`C:/tmp/fase2/compilar.ps1`; integridad anti-slop/retirement PASS (456 huellas).
PR a nightly con auto-merge autorizado por Isaac;
SHA/PR/CI finales en [#1584](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1584)
y `C:/tmp/buzon/1584.md`. No activa el runner Windows de #1565 ni acredita
una nueva ejecución en SapphireOS.

Base de código contrastada: `origin/nightly@ca17545f607b85f5d47dc9d060721b69e6a6a158`. Esta compactación vive en `vantareapp/isa-1561-docs`; no cambia producto ni acredita integración de las ramas de ola 2. SHA final y push en [#1561](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1561) y `C:/tmp/buzon/1561-docs.md`. PR [#1570](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1570) contra nightly, con auto-merge autorizado por el orquestador. Nightly `0cf38ed2` incorporada mediante merge `dbee0c18`; sin promoción ni release. Storage y Analysis nativos están presentes en el código; #1429 sigue OPEN. El estado antiguo TA-03E/TA-03F no describe la aplicación de esta base ni certifica su aceptación actual.

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

2026-10-13 · GitHub #1584 · Codex. Corrección mínima del diagnóstico Windows y regresión antes/después; gates locales y límites en §3. PR/SHA/CI se registran en la issue y el buzón. El diario y los avances por ronda se escriben en la issue; aquí se sustituye el estado.
