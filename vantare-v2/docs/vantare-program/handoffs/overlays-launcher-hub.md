# Handoff vivo — Overlays, Studio, Launcher y Hub

[Histórico previo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/8c6e83f977c8d2245a04266cdaaf896ed8c1b131/vantare-v2/docs/vantare-program/handoffs/overlays-launcher-hub.md). El diario y avances están en las issues; este documento conserva el estado actual.

## 1. Resultado

Hub/Studio GPUI editan el layout único y los widgets del registro. Launcher gobierna procesos mediante el motor propio. Standings tiene columnas/formatos por Práctica, Qualy y Carrera; todos los widgets filtran por sesión. Pedales conserva separación ajustable; el botón de pista alterna mostrar/dejar de mostrar mediante la solicitud compartida.

## 2. Autoridad y lectura verificada

GitHub Issues y Project Vantare. #1564/area:ui, In Review, sin milestone comprometida; issue y escritura verificadas. Dependencias contrastadas: #1562/PR #1576 MERGED, #1563/PR #1572 y #1567/PR #1575 integradas; #1573 acceso y #1570 documentación presentes en nightly. PR de esta entrega: [#1577](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1577). README [UI](../../../native/ui/README.md)/[Hub](../../../native/hub/README.md) y plantilla activa leídos.

## 3. Estado real y canal

Rama `vantareapp/isa-1564-widgets-por-sesion-impl`. Base original #1562 `cdcc2bf7`; entrega anterior `8c6e83f9`. Incorporado `origin/nightly@acff350d740d33ae8901291b63d69da004912fbc` mediante merge, sin rebase. Resolución local validada; commit/HEAD de entrega y push se verifican en #1564 y buzón. El merge conserva ambos padres. Auto-merge de #1577 ya activo por el orquestador. Esta rama todavía no acredita integración de #1564 en nightly, promoción ni release.

## 4. Decisiones cerradas

- Una proyección/estado por widget; N Looks sobre Board/Motion, sin otra aplicación Wails/React.
- Standings: tres listas/formatos; filas, Look, clase/gaps, pie y ventana del jugador comunes. Presets D7 solo nuevos/reset; reset afecta una pestaña. Legacy conserva columnas, también al editar Carrera primero; orden del simulador e intervalo sin cambios.
- Other/warmup = Práctica; columnas sin tipo inicial = Carrera; Stale conserva tipo. Mostrar en sin tipo = visible; AND con fuera de pista, incluso durante pausa. AlwaysVisible evita solo fuera de pista. Importación sessionTypes respetada.
- D12 aclarada: ancho por sesión solo automático; tamaño explícito del usuario respetado, ancla fija en ambos. Ejemplo sigue pestaña; fotos reales/En vivo conservan su sesión.
- #1562: garaje solo con señal explícita LMU, servicio/colas visibles, previews visibles; DTO live v10 estricto y lectores guardados separados.
- #1567: mostrar/dejar de mostrar sigue show.json, sin duplicar estado ni alterar filtros por sesión. Layout v1 conserva campos y migración; archivo inválido/conflicto no se sobrescribe.

## 5. Arquitectura y ownership

Domain proyecta; UI guarda settings y pinta; Hub edita documento/historial. [Registro](../../../native/ui/src/registry.rs), [layout](../../../native/ui/src/layout.rs), [Studio](../../../native/hub/src/studio.rs), [sesiones](../../../native/hub/src/studio/sessions.rs). UI/domain no dependen de runtime. Sin deps nuevas ni transporte/permiso en pintores. #1561 P1-A mantiene la partición coordinada del Studio preexistente >2000 LOC; PR-3/PR-5 de #1561 no se afirman integradas. `frame_with_motion` sigue vigente.

## 6. Evidencia y límites

Entrega anterior #1564: RED `9c218b38`; código/capturas `c8401b50`; test D12 ampliado `63bead05`. Fmt/Clippy PASS, Nextest 1601/1601 (7 skips), lifecycle 18/18, telemetría 25/25, anti-slop 456 huellas PASS. Cuatro capturas Studio 1440×900 inspeccionadas: Práctica/Qualy 537,3345 de ancho natural y Carrera 579,3345, x=48/y=62 constante. Frame explícito 800×400/documento/ancla por tres pestañas PASS. Post-merge final: fmt/Clippy -D warnings PASS (22.43s), Nextest 1613/1613 (7 skips, 266.205s), lifecycle 18/18 y telemetría 25/25 PASS; anti-slop 456 huellas PASS. Cuatro capturas nuevas merge-studio-*.png abiertas e inspeccionadas, hashes idénticos a las anteriores. Botón de pista/tray y preview por sesión con tamaño explícito pasan los tests.
Logs y revisión/hashes: `C:/tmp/ola2/evidence-1564`; informe `C:/tmp/ola2/informe-1564-impl.md`; buzón `C:/tmp/buzon/1564.md`. No convierte fixtures/replays en LMU/ACC/OBS físicos, DPI/macOS ni input→Present. Present/s no mide latencia. Históricos/goldens se conservan sin recalibrar.
**#1536 · Launcher:** test COM compara destinos canonicalizados, conserva ejecutable/bytes, no ejecuta y rechaza UNC; arreglo `d7c6cd17`, histórico enlazado arriba.

## 7. Riesgos y deuda

- CI de #1577 tras push pendiente; ambos flujos de pista/sesión conservados en Studio/app/layout y gates locales aprobados.
- P2: Studio compartido con #1569; no partir durante entregas concurrentes. #1524 sigue pendiente: autoría no acredita fuente live.
- #1527 debe partir del DTO live v10 realmente integrado y mantener lectores persistidos compatibles.
- Evidencia física/plataforma y deuda de paridad de ADR 0101 conservadas en el histórico; no elevar severidad sin nueva prueba.

## 8. Issues terminadas, activas y pendientes

Integradas: #1530–#1534, #1536; documentación #1561 PR #1570, #1562 PR #1576, #1563 PR #1572 y #1567 PR #1575. Sus issues pueden seguir abiertas; integración no implica cierre. Activa de esta rama: #1564/PR #1577. Pendientes coordinadas: #1561 PR-3/PR-5, #1566, #1569 y #1527. #1496/#1497 no se cierran por este resumen. IDs ISA/VAN históricos en permalink anterior.

## 9. Siguiente acción exacta

Commit de merge y push de la rama, tras gates locales completos y diff revisado frente a ambos padres; verificar SHA remoto y FIN en buzón/issue. Comprobar CI y estado real de #1577: gates locales no acreditan aún su integración en nightly. Conservar auto-merge autorizado; no promover testers/master ni publicar release.

## 10. Última actualización

2026-10-10 · GitHub #1564 · Codex. Dependencias y nightly leídos; resolución local autorizada por el orquestador. Estado y diario en #1564, sin entradas por worker/ronda aquí.
