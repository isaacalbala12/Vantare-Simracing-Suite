# Handoff vivo — Telemetry Analysis

## Resultado y autoridad

VANTA-133 / [#1974](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1974): recorrido de análisis y almacenamiento. Encargo limitado a los pasos 0, 1 y 3 del diseño aprobado `D:/VantareServer/evidence/revision-general/analisis-DISENO.md`, sección (d), y a la revisión de Isaac del 2026-11-05. Paso 2 (conservar DuckDB o no) lo decide Isaac; pasos 4–8 sin iniciar.

[Estado y evidencia anteriores completos](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/03d886f7b/vantare-v2/docs/vantare-program/handoffs/telemetry-analysis.md): conserva #1429, #1584, #1606, sus decisiones, límites y referencias históricas. Esta tanda no acredita su aceptación física ni reabre la ruta Go.

## Estado real y canal

- Paso 1: [PR #1979](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1979), HEAD `6dc831bad`. Sin commits tras la aprobación de Isaac; integrado por él en nightly mediante `e77d6ae19`.
- Paso 0: [PR #1981](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1981), HEAD final `d81f26488`. CI completa verde, guard de arquitectura verde, sin dependencia de runtime en Hub; integrado por Isaac en nightly mediante `03d886f7b`.
- Paso 3: [PR #1986](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1986), draft a nightly, rama `vantareapp/isa-1974-paso3-ipc-series`, base actualizada `03d886f7b`. HEAD y CI finales se verifican en el PR; resumen de código y gates en esta entrega.

No hay merge, promoción, release ni despliegue por este worker. La tanda solo llega a nightly en las fusiones verificadas de los pasos 0 y 1. Estado de VANTA-133: Por revisar, verificado al publicar el draft.

## Cambios y comportamiento actual

Se retira `analysis::insights` y sus tests tras comprobar cero consumidores externos al módulo/tests. Se corrigen los README y el texto de usuario: «Las grabaciones de vueltas llegarán en una próxima versión». La grabación de series sigue sin conectarse; [#1975](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1975) la registra sin implementarla.

La caracterización conserva seis casos: lectura tras kill con WAL sin modificar originales; DB del motor sin esquema de series; códigos reales de watermark/versión; drop que recoge helper y libera lock; catálogo 256/257; Core sin suscriptor que aún retiene muestras. No corrige producto. El caso sin esquema fabrica ese estado, no mata Store::open; `incompatible` es accidental por el texto `series_meta`. El test de cancelación no demuestra cancelar SQL largo.

Hueco 4: Isaac descarta añadir runtime como dev-dependency del Hub. El paso 3 comparte el contrato por construcción en `ipc::series`; probar ambos lectores sobre la misma grabación se difiere al 6C, si llega. No se declara probada aquí esa paridad entre clientes.

`ipc::series` posee LapSample/LapBlock, SeriesChunk, codec v1, topes puros y SeriesAnalysis. `runtime::flows` reexporta los nombres anteriores; adquisición, feed y workers permanecen en runtime. IPC activa serde_json/float_roundtrip. No se modifica formato, cálculo, límites ni Cargo.lock. Hub y domain/ui no adquieren dependencia de runtime.

## Evidencia y límites

Paso 0: fmt/check/Clippy locales PASS, Nextest 1232/1232 (13 skips) y telemetría 34/34 (1 skip). CI del HEAD exacto d81f26488, run 41986851614: suite completa 2525/2525 (26 skips), lifecycle y cierre de procesos PASS; no se repite lifecycle local después de acreditarlo en esa CI.

Paso 1: fmt/check/Clippy y Nextest Hub 631/631 (4 skips) PASS. CI completa de 6dc831bad verde, verificada tras la fusión.

Paso 3: código 5c3e9528e, fmt/check/Clippy y Nextest IPC/runtime/Hub 1325/1325 (13 skips) PASS. Guards de arquitectura PASS. Telemetría 34/34 (1 skip), overlays normal/QA y lifecycle 25/25 PASS sobre la misma producción/dependencias de runtime e IPC; la actualización de base solo incorpora un README y el test de caracterización, según paso3-rebase-production-identity.json.

Seis goldens anteriores/posteriores (manual y fixture LMU: chunk, vuelta y análisis) comparados byte a byte: 6/6, 1971 bytes en total, sin normalización ni tolerancias. Cuerpos del codec/análisis idénticos y cuatro archivos de tests existentes sin modificar. Logs, hashes, mediciones separadas de producción/tests/docs y omisiones en `D:/VantareServer/evidence/isa-1974` y en los PR.

Targets exclusivos en D:, compilación mediante native/scripts/compilar.ps1, gates limitados a crates afectados y cola cedida entre comandos. La limpieza de los targets se registra en paso0-clean.log, paso1-clean.log y paso3-clean.log, fuera del repo; el estado final se refleja en #1974 y en los PR. Aviso leaky del fixture de launcher existente conservado en la evidencia, sin cambiarlo dentro de este encargo.

No acredita juego físico LMU/ACC, OBS, audio, DPI, latencia ni aceptación visual. Un fixture y lifecycle no sustituyen esas pruebas.

## Contratos que se conservan

- Recording opt-in; no activarlo al suscribir/arrancar Core.
- Storage sigue siendo dueño de DuckDB/SQL, con proceso y conexión secuencial.
- DB vantare.series-db.v1 y payload SeriesChunk v1; no migrar DB ajenas automáticamente.
- ACK tras COMMIT, repetición idéntica idempotente y conflicto rechazado. Watermark no acredita ausencia de huecos; finished no acredita sesión íntegra.
- Huecos explícitos; no inventar cobertura, ritmo, circuitos ni causas. Un chunk con gap puede quedar como puntos aislados según #1606.
- Contenido externo requiere sandbox real; Job Object no lo sustituye. Locks, incompatibilidad y cancelación deben preservar originales y conservar la causa real.

## Siguiente acción

Isaac revisa el paso 3 y decide el paso 2 antes de autorizar más recorrido. La conexión de grabación requiere #1975 y autorización/medición propias. La prueba diferida del hueco 4 pertenece al 6C si se elige esa ruta. No comenzar los pasos 4–8 por este handoff.

Última actualización: 2026-11-05 · VANTA-133 / #1974 · cierre único de la tanda de pasos 0, 1 y 3. Estado, HEAD, CI y medidas finales en la issue y los PR.
