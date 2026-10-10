# Handoff vivo — Overlays, Studio, Launcher y Hub

[Histórico previo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/8c6e83f977c8d2245a04266cdaaf896ed8c1b131/vantare-v2/docs/vantare-program/handoffs/overlays-launcher-hub.md). El diario y avances están en las issues; este documento conserva el estado actual.

## 1. Resultado

Hub/Studio GPUI editan el layout único y los widgets del registro. Launcher gobierna procesos mediante el motor propio. Standings tiene columnas/formatos por Práctica, Qualy y Carrera; todos los widgets filtran por sesión. Pedales conserva separación ajustable; el botón de pista alterna mostrar/dejar de mostrar mediante la solicitud compartida.

## 2. Autoridad y lectura verificada

GitHub Issues y Project Vantare; #1561/area:plataforma, In Progress, sin milestone comprometido. Plan `C:/tmp/ola2/plan-1561.md`: solo PR-4 y PR-6. #1562/#1564 ya presentes en la base; #1569 conserva su issue independiente. #1535/PR #1578 integrado en ee372540; servicios IPC v6, DTO live v10 y derechos/control v4. SQL no aplicado; su ejecución continúa exclusivamente en #1535.

## 3. Estado real y canal

Rama `vantareapp/isa-1561-studio-split`, worktree `C:/tmp/vw-1561-hub`, base actualizada por rebase `origin/nightly@ee3725407bd4ff7b4fb40083094e2152365d1857` (Studio idéntico a b2186f82). PR-4 mueve bloques sin cambiar lógica ni firmas públicas; visibilidad mínima `pub(super)` autorizada por Isaac. PR-4 `1fc35e0ef8373f24a271e651fabafd6b6d0cbf5e` publicado en [draft #1581](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1581) a nightly. PR-6 añade el test recursivo de tamaño. Revisión #1581: erratas ajenas a Studio restauradas, zoom privado, imports en cabecera, docs sin techos duplicados y excepciones con existencia obligatoria; SHA final y checks se verifican en #1561 y `C:/tmp/buzon/1561-hub.md`; sin merge, promoción ni release.

## 4. Decisiones cerradas

- Una proyección/estado por widget; N Looks sobre Board/Motion, sin otra aplicación Wails/React.
- Standings: tres listas/formatos; filas, Look, clase/gaps, pie y ventana del jugador comunes. Presets D7 solo nuevos/reset; reset afecta una pestaña. Legacy conserva columnas, también al editar Carrera primero; orden del simulador e intervalo sin cambios.
- Other/warmup = Práctica; columnas sin tipo inicial = Carrera; Stale conserva tipo. Mostrar en sin tipo = visible; AND con fuera de pista, incluso durante pausa. AlwaysVisible evita solo fuera de pista. Importación sessionTypes respetada.
- D12 aclarada: ancho por sesión solo automático; tamaño explícito del usuario respetado, ancla fija en ambos. Ejemplo sigue pestaña; fotos reales/En vivo conservan su sesión.
- #1562: garaje solo con señal explícita LMU, servicio/colas visibles, previews visibles; DTO live v10 estricto y lectores guardados separados.
- #1567: mostrar/dejar de mostrar sigue show.json, sin duplicar estado ni alterar filtros por sesión. Layout v1 conserva campos y migración; archivo inválido/conflicto no se sobrescribe.

## 5. Arquitectura y ownership

Domain proyecta; UI guarda settings y pinta; Hub edita documento/historial. [Registro](../../../native/ui/src/registry.rs), [layout](../../../native/ui/src/layout.rs), [Studio](../../../native/hub/src/studio.rs), [sesiones](../../../native/hub/src/studio/sessions.rs). UI/domain no dependen de runtime. Sin deps nuevas ni transporte/permiso en pintores. #1561 PR-4 divide Studio en canvas (marco/geometría/gestos), inspector_panel (controles/inspector), catalog (preparación/fotos/tira) y tests; mismo estado, tipos y renderer; PR-6 vigila los techos de tamaño y sus excepciones en `hub/tests/architecture.rs`, sin excepción para Studio; subir un techo exige un plan de partición en el mismo PR. PR-3/PR-5 de #1561 no se afirman integradas. `frame_with_motion` sigue vigente.

## 6. Evidencia y límites

#1561 PR-4, gates de la base previa b2186f82: fmt/Clippy -D warnings PASS; Nextest workspace 1613/1613, 7 skips (267,435 s); lifecycle 18/18. studio.rs 4498→652; canvas 1130, inspector 897, catalog 745, tests 1125. Definiciones y 20 fixtures conservados; listado Hub 412/Studio 42, incluidos 39 tests movidos. Color-moved revisado; diferencias estructurales/visibilidad/formato documentadas en buzón. Check parity-capture PASS; Clippy adicional de esa feature falla con 21 diagnósticos en archivos intactos. Sin QA manual física/capturas nuevas; headless no acredita LMU/OBS/DPI. PR-6, gates de la base previa b2186f82: fmt/Clippy PASS y Nextest Hub 413/413 (1 skip). RED con +1 en los cuatro techos y Studio por encima del techo general; restauración de cinco archivos byte por byte/SHA-256 y GREEN. El primer run limitado omitió PATH DuckDB y falló el writer del smoke de análisis; repetido con el entorno de gates, pasó. Revalidación completa sobre ee372540: fmt/Clippy -D warnings PASS, Nextest workspace 1619/1619 (7 skips, 231,321 s), lifecycle 18/18; check parity-capture PASS. RED/GREEN repetido con services/view y los otros cuatro casos; bytes/SHA-256 restaurados. Logs iniciales: `C:/tmp/ola2/evidence-1561-hub`. Correcciones de revisión #1581: fmt/Clippy -D warnings PASS, Nextest 1619/1619 (7 skips), lifecycle 18/18. RED/GREEN de excepción inexistente y cinco casos de crecimiento, restauración byte por byte/SHA-256; evidencia en `C:/tmp/ola2/evidence-1581-review`. Siguiente paso: revisión del mismo draft y QA manual pendiente, sin merge.

Entrega anterior #1564: RED `9c218b38`; código/capturas `c8401b50`; test D12 ampliado `63bead05`. Fmt/Clippy PASS, Nextest 1601/1601 (7 skips), lifecycle 18/18, telemetría 25/25, anti-slop 456 huellas PASS. Cuatro capturas Studio 1440×900 inspeccionadas: Práctica/Qualy 537,3345 de ancho natural y Carrera 579,3345, x=48/y=62 constante. Frame explícito 800×400/documento/ancla por tres pestañas PASS. Post-merge final: fmt/Clippy -D warnings PASS (22.43s), Nextest 1613/1613 (7 skips, 266.205s), lifecycle 18/18 y telemetría 25/25 PASS; anti-slop 456 huellas PASS. Cuatro capturas nuevas merge-studio-*.png abiertas e inspeccionadas, hashes idénticos a las anteriores. Botón de pista/tray y preview por sesión con tamaño explícito pasan los tests.
Logs y revisión/hashes: `C:/tmp/ola2/evidence-1564`; informe `C:/tmp/ola2/informe-1564-impl.md`; buzón `C:/tmp/buzon/1564.md`. No convierte fixtures/replays en LMU/ACC/OBS físicos, DPI/macOS ni input→Present. Present/s no mide latencia. Históricos/goldens se conservan sin recalibrar.
**#1536 · Launcher:** test COM compara destinos canonicalizados, conserva ejecutable/bytes, no ejecuta y rechaza UNC; arreglo `d7c6cd17`, histórico enlazado arriba.

## 7. Riesgos y deuda

- CI del nuevo PR draft pendiente; la evidencia de #1564 citada arriba corresponde a la entrega anterior.
- El split cambia rutas internas de tests y puede generar conflictos con ramas de Studio; #1569 sigue fuera de alcance. #1524: autoría no acredita fuente live.
- #1527 debe partir del DTO live v10 realmente integrado y mantener lectores persistidos compatibles.
- Evidencia física/plataforma y deuda de paridad de ADR 0101 conservadas en el histórico; no elevar severidad sin nueva prueba.

## 8. Issues terminadas, activas y pendientes

Integradas: #1530–#1534, #1536; documentación #1561 PR #1570, #1562 PR #1576, #1563 PR #1572 y #1567 PR #1575. Sus issues pueden seguir abiertas; integración no implica cierre. Integrada en esta base: #1564/PR #1577. Activa de esta rama: #1561 PR-4/PR-6. Pendientes coordinadas: #1561 PR-3/PR-5, #1566, #1569 y #1527. #1496/#1497 no se cierran por este resumen. IDs ISA/VAN históricos en permalink anterior.

## 9. Siguiente acción exacta

Revisar CI y QA manual física de draft #1581 antes de aceptar; SHA remoto y FIN se verifican en #1561/buzón. No merge ni promoción. QA manual solo sin pantalla-ocupada y con el mutex del harness.

## 10. Última actualización

2026-10-11 · GitHub #1561 · Codex. Alcance PR-4/PR-6 y dos DUDA resueltas por Isaac; base actual y estructura verificadas. Diario y SHA en issue/buzón.
