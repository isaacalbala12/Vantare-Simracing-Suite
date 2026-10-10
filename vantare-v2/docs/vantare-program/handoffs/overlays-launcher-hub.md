# Handoff vivo — Overlays, Studio, Launcher y Hub

[Histórico previo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/8c6e83f977c8d2245a04266cdaaf896ed8c1b131/vantare-v2/docs/vantare-program/handoffs/overlays-launcher-hub.md). El diario y avances están en las issues; este documento conserva el estado actual.

## 1. Resultado

Hub/Studio GPUI editan el layout único y los widgets del registro. Launcher gobierna procesos mediante el motor propio. Standings tiene columnas/formatos por Práctica, Qualy y Carrera; todos los widgets filtran por sesión. Pedales conserva separación ajustable; el botón de pista alterna mostrar/dejar de mostrar mediante la solicitud compartida.

## 2. Autoridad y lectura verificada

GitHub #1561, area:plataforma, Project Vantare In Progress, sin milestone. Esta entrega cubre exactamente PR-3/PR-5 de `C:/tmp/ola2/plan-1561.md`; #1531/#1532/#1534 cerradas. Leídos AGENTS, README nativo/UI, ADR 0101 y contrato de producto. No incluye Studio, telemetría ni ports.

## 3. Estado real y canal

Rama aislada `vantareapp/isa-1561-looks-frame`: PR-3/PR-5 en draft [#1579](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1579) a nightly. Base inicial b2186f82; guardias 22fe7490, PR-3 abc22332, PR-5 7a646ac8 y correcciones de revisión d2710f4e. Se incorpora origin/nightly ee372540 mediante merge, sin rebase; SHA final/push y checks en issue/buzón. Gates del árbol reconciliado PASS: fmt/Clippy -D warnings, Nextest 1621/1621 (7 skips), lifecycle 18/18 y telemetría 25/25. La PR no está integrada ni hay promoción/release.

#1564/PR #1577 y #1535/PR #1578 MERGED en nightly (b2186f82 y ee372540 respectivamente). Se conservan DTO live v10, servicios IPC v6 y derechos/control v4 independiente. #1535 aporta Roadmap ClickUp/Supabase y participación Testing; SQL no aplicado. La previa de producción está bloqueada por timeout/proyectos INACTIVE y destino sin confirmar, según #1535; no se acredita DEFINER/ACL/migraciones ni se restaura/enlaza/aplica SQL en esta entrega.

## 4. Decisiones cerradas

- Una proyección/estado por widget; N Looks sobre Board/Motion, sin otra aplicación Wails/React.
- Standings: tres listas/formatos; filas, Look, clase/gaps, pie y ventana del jugador comunes. Presets D7 solo nuevos/reset; reset afecta una pestaña. Legacy conserva columnas, también al editar Carrera primero; orden del simulador e intervalo sin cambios.
- Other/warmup = Práctica; columnas sin tipo inicial = Carrera; Stale conserva tipo. Mostrar en sin tipo = visible; AND con fuera de pista, incluso durante pausa. AlwaysVisible evita solo fuera de pista. Importación sessionTypes respetada.
- D12 aclarada: ancho por sesión solo automático; tamaño explícito del usuario respetado, ancla fija en ambos. Ejemplo sigue pestaña; fotos reales/En vivo conservan su sesión.
- #1562: garaje solo con señal explícita LMU, servicio/colas visibles, previews visibles; DTO live v10 estricto y lectores guardados separados.
- #1567: mostrar/dejar de mostrar sigue show.json, sin duplicar estado ni alterar filtros por sesión. Layout v1 conserva campos y migración; archivo inválido/conflicto no se sobrescribe.

## 5. Arquitectura y ownership

Domain proyecta; UI guarda settings y pinta; Hub edita documento/historial. [Registro](../../../native/ui/src/registry.rs), [layout](../../../native/ui/src/layout.rs), [Studio](../../../native/hub/src/studio.rs), [sesiones](../../../native/hub/src/studio/sessions.rs). UI/domain no dependen de runtime. Sin deps nuevas ni transporte/permiso en pintores. #1561 P1-A mantiene la partición coordinada del Studio preexistente >2000 LOC; PR-3/PR-5 de #1561 se entregan en draft #1579, sin integración. PR-3 de esta rama mueve la apariencia a `ui::look::{Look, Tone, Accent}`, sin cambiar nombres serde. PR-5 usa `frame(prefs, reduced)` en los 18 widgets: despacho generado, Fuel asienta en su propio frame, estáticos aceptan `_reduced`. Cadencia/etiquetas/catálogo sin cambios.

## 6. Evidencia y límites

Entrega anterior #1564: RED `9c218b38`; código/capturas `c8401b50`; test D12 ampliado `63bead05`. Fmt/Clippy PASS, Nextest 1601/1601 (7 skips), lifecycle 18/18, telemetría 25/25, anti-slop 456 huellas PASS. Cuatro capturas Studio 1440×900 inspeccionadas: Práctica/Qualy 537,3345 de ancho natural y Carrera 579,3345, x=48/y=62 constante. Frame explícito 800×400/documento/ancla por tres pestañas PASS. Post-merge final: fmt/Clippy -D warnings PASS (22.43s), Nextest 1613/1613 (7 skips, 266.205s), lifecycle 18/18 y telemetría 25/25 PASS; anti-slop 456 huellas PASS. Cuatro capturas nuevas merge-studio-*.png abiertas e inspeccionadas, hashes idénticos a las anteriores. Botón de pista/tray y preview por sesión con tamaño explícito pasan los tests.
Logs y revisión/hashes: `C:/tmp/ola2/evidence-1564`; informe `C:/tmp/ola2/informe-1564-impl.md`; buzón `C:/tmp/buzon/1564.md`. No convierte fixtures/replays en LMU/ACC/OBS físicos, DPI/macOS ni input→Present. Present/s no mide latencia. Históricos/goldens se conservan sin recalibrar.
**#1536 · Launcher:** test COM compara destinos canonicalizados, conserva ejecutable/bytes, no ejecuta y rechaza UNC; arreglo `d7c6cd17`, histórico enlazado arriba.

Guardias #1561 `22fe7490`: layout Eficiencia/Neutro/acentos de cuatro widgets, transiciones activas de Banderas/FastestLap/Input/PedalsTelemetry y replay: 8/8 PASS antes del refactor. Capturas base de 18 widgets por `compare.ps1` guardadas e inspeccionadas; diferencias con goldens históricos registradas sin recalibración. Cuatro pintores equivalentes tras renombrado de imports/tipos; PR-3 reduce 6 líneas Rust (13321→13315 en 12 fuentes, incluidos tests; 22fe7490→abc22332). PR-5 reduce 72 líneas Rust (12945→12873 en 24 fuentes); registro 175→157, wrappers 8→0 y sitios de API de movimiento por widget animado 2→1. Cuerpos de frame conservados 18/18. Gates anteriores al merge de #1578 por la cola: fmt/Clippy -D warnings PASS, Nextest 1615/1615 (7 skips), lifecycle 18/18; build parity-capture/paint-stats y guardias con ambas features 5/5 PASS. Paridad final inspeccionada: 18/18 hashes PNG idénticos, 0/1720978 píxeles distintos, umbral 0 sin máscaras. Verificación retenida 456 huellas PASS. Revisión #1579: JSON canónico fijado desde 22fe7490/b2186f82; cuatro instancias y nombres/defaults/fallbacks guardados 4/4 PASS. Mutación real del orden style/accent rechazada por bytes; restauración 4/4 PASS. Receta DTO v10, guardados v7–v10 y alta de Kind::label corregidas. Gates tras reconciliar #1578: fmt/Clippy PASS, Nextest 1621/1621 (234.263 s, 7 skips), lifecycle 18/18 y telemetría 25/25 (851.768 s; ACC 804.035 s). Fixtures vigentes y lectores guardados IPC PASS. Sin nuevas modificaciones a fuentes/fixtures/referencias de widgets; paridad previa conservada, no recapturada. Evidencia nueva: `C:/tmp/ola2/evidence-1561-ui`; buzón `C:/tmp/buzon/1561-ui.md`.

## 7. Riesgos y deuda

- #1561: comparar contra esta base; los goldens históricos ya difieren en dimensiones/píxeles antes del refactor. No se recalibran. CI remoto del draft pendiente de revisión; no se acredita con los gates locales.
- #1535: SQL no aplicado; producción/ref/DEFINER/ACL/migraciones sin verificar. Requiere confirmar destino y respuesta expresa del orquestador; no lo resuelve #1579.
- P2: Studio compartido con #1569; no partir durante entregas concurrentes. #1524 sigue pendiente: autoría no acredita fuente live.
- #1527 debe partir del DTO live v10 realmente integrado y mantener lectores persistidos compatibles.
- Evidencia física/plataforma y deuda de paridad de ADR 0101 conservadas en el histórico; no elevar severidad sin nueva prueba.

## 8. Issues terminadas, activas y pendientes

Integradas: #1530–#1534, #1536; documentación #1561 PR #1570, #1562 PR #1576, #1563 PR #1572 y #1567 PR #1575. Sus issues pueden seguir abiertas; integración no implica cierre. #1564/PR #1577 y #1535/PR #1578 integradas en la base; #1535 sigue abierta por la previa/SQL bloqueados. Activa de esta rama: #1561 PR-3/PR-5 en draft #1579. Pendientes coordinadas: #1566, #1569 y #1527. #1496/#1497 no se cierran por este resumen. IDs ISA/VAN históricos en permalink anterior.

## 9. Siguiente acción exacta

Revisar los cuatro arreglos y los checks remotos del draft #1579; #1561 sigue abierta para el resto de la ola. Consultar SHA final y FIN en buzón/issue. Sin integrar #1579, promocionar testers/master ni release. #1535 conserva como siguiente paso confirmar proyecto/acceso y la previa SOLO LECTURA; no aplicar SQL sin respuesta expresa del orquestador.

## 10. Última actualización

2026-10-11 · GitHub #1561 · Codex. Estado y diario en la issue; alcance PR-3/PR-5 verificado, sin entradas por worker/ronda aquí.
