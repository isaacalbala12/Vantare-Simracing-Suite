# Handoff vivo — Overlays, Studio, Launcher y Hub

[Histórico previo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/8c6e83f977c8d2245a04266cdaaf896ed8c1b131/vantare-v2/docs/vantare-program/handoffs/overlays-launcher-hub.md). El diario y avances están en las issues; este documento conserva el estado actual.

## 1. Resultado

Hub/Studio GPUI editan el layout único y los widgets del registro. Launcher gobierna procesos mediante el motor propio. Standings tiene columnas/formatos por Práctica, Qualy y Carrera; todos los widgets filtran por sesión. Pedales conserva separación ajustable y gana Look Vantare en columnas (#1566, integrada en nightly); el botón de pista alterna mostrar/dejar de mostrar mediante la solicitud compartida.

## 2. Autoridad y lectura verificada

GitHub Issues y Project Vantare; #1561/area:plataforma, In Progress, sin milestone comprometido. Plan `C:/tmp/ola2/plan-1561.md`: esta rama cubre PR-4/PR-6; PR-3/PR-5 ya integradas por #1579 en nightly. #1562/#1564 presentes en la base; #1569 conserva su issue independiente. #1531/#1532/#1534 cerradas. Leídos AGENTS, README nativo/UI, ADR 0101 y contrato de producto.

## 3. Estado real y canal

[#1581](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1581) MERGED en nightly `707514e2` (squash de `vantareapp/isa-1561-studio-split`, que incorporó `origin/nightly@1dfdd6f1` mediante merge). PR-4 `1fc35e0e`, PR-6 `0efeeab5` y correcciones `51ef00e5`. El split conserva lógica y firmas públicas; visibilidad mínima pub(super), zoom privado, imports en cabecera y excepciones con existencia obligatoria. SHA final/checks se verifican en #1561 y `C:/tmp/buzon/1561-hub.md`.

#1579 MERGED en nightly `6ce09c69`: PR-3/PR-5, guardias 22fe7490, PR-3 abc22332, PR-5 7a646ac8 y revisión d2710f4e; entrega original en `vantareapp/isa-1561-looks-frame`. Gates reconciliados con #1578: fmt/Clippy PASS, Nextest 1621/1621 (7 skips), lifecycle 18/18 y telemetría 25/25. Sin promoción/release.

#1564/PR #1577 y #1535/PR #1578 MERGED en nightly (b2186f82 y ee372540). Se conservan DTO live v10, servicios IPC v6 y derechos/control v4 independiente. #1535 aporta Roadmap ClickUp/Supabase y participación Testing; SQL no aplicado. La previa de producción está bloqueada por timeout/proyectos INACTIVE y destino sin confirmar, según #1535; no se acredita DEFINER/ACL/migraciones ni se restaura/enlaza/aplica SQL en esta entrega.

## 4. Decisiones cerradas

- #1569 (Isaac, ronda 4 opción 1): sin selección, el carril del inspector es el catálogo «Añadir widget»; el lienzo no cede ancho. Clic = primer hueco libre, arrastre con imán de 7 px, un paso de historial; Pro con candado y «Ver planes» a Cuenta (Licencias está oculta en beta); sin acceso verificado no se vende Pro.
- #1566 (Isaac): Pedales Vantare = opción A, tres columnas juntas (columna 24, barra 16; 96 × 160 con separación 2), sin rótulos (color por pedal), con porcentaje encima, sin marcha ni velocidad; separación #1563 en ambos Looks. Guardados sin `designSystem` → Eficiencia; nuevos → Vantare. `reference/pedals.png` intacta.
- Una proyección/estado por widget; N Looks sobre Board/Motion, sin otra aplicación Wails/React.
- Standings: tres listas/formatos; filas, Look, clase/gaps, pie y ventana del jugador comunes. Presets D7 solo nuevos/reset; reset afecta una pestaña. Legacy conserva columnas, también al editar Carrera primero; orden del simulador e intervalo sin cambios.
- Other/warmup = Práctica; columnas sin tipo inicial = Carrera; Stale conserva tipo. Mostrar en sin tipo = visible; AND con fuera de pista, incluso durante pausa. AlwaysVisible evita solo fuera de pista. Importación sessionTypes respetada.
- D12 aclarada: ancho por sesión solo automático; tamaño explícito del usuario respetado, ancla fija en ambos. Ejemplo sigue pestaña; fotos reales/En vivo conservan su sesión.
- #1562: garaje solo con señal explícita LMU, servicio/colas visibles, previews visibles; DTO live v10 estricto y lectores guardados separados.
- #1567: mostrar/dejar de mostrar sigue show.json, sin duplicar estado ni alterar filtros por sesión. Layout v1 conserva campos y migración; archivo inválido/conflicto no se sobrescribe.

## 5. Arquitectura y ownership

Domain proyecta; UI guarda settings y pinta; Hub edita documento/historial. [Registro](../../../native/ui/src/registry.rs), [layout](../../../native/ui/src/layout.rs), [Studio](../../../native/hub/src/studio.rs), [sesiones](../../../native/hub/src/studio/sessions.rs). UI/domain no dependen de runtime. Sin deps nuevas ni transporte/permiso en pintores. #1561 PR-4 divide Studio en canvas (marco/geometría/gestos), inspector_panel (controles/inspector), catalog (preparación/fotos/tira) y tests; mismo estado, tipos y renderer. PR-6 vigila techos y excepciones en `hub/tests/architecture.rs`, sin excepción para Studio; subir un techo exige un plan de partición en el mismo PR. PR-3 integrada mueve la apariencia a `ui::look::{Look, Tone, Accent}`, sin cambiar nombres serde. PR-5 integrada usa `frame(prefs, reduced)` en los 18 widgets: despacho generado, Fuel asienta en su propio frame, estáticos aceptan `_reduced`. Cadencia/etiquetas/catálogo sin cambios.

## 6. Evidencia y límites

Reconciliación con nightly 1dfdd6f1 (#1580): fmt/Clippy -D warnings PASS, Nextest 1626/1626 (7 skips, 231.034 s, dos hilos), lifecycle 18/18 PASS por la cola. Código upstream de Pedales íntegro; presupuestos y excepciones sin cambios. Logs: `C:/tmp/ola2/evidence-1581-merge-1580`.

Árbol reconciliado con nightly 6ce09c69: fmt/Clippy -D warnings PASS; Nextest 1622/1622 (7 skips, 209.427 s), lifecycle 18/18 PASS por la cola. Primer Nextest falló en Engineer `stream_waits_for_slow_rights_before_deciding`; repetición completa con dos hilos PASS, sin modificar ni excluir tests. Presupuestos y cuatro excepciones sin cambios. Logs: `C:/tmp/ola2/evidence-1581-merge`.

#1561 PR-4, gates de la base previa b2186f82: fmt/Clippy -D warnings PASS; Nextest workspace 1613/1613, 7 skips (267,435 s); lifecycle 18/18. studio.rs 4498→652; canvas 1130, inspector 897, catalog 745, tests 1125. Definiciones y 20 fixtures conservados; listado Hub 412/Studio 42, incluidos 39 tests movidos. Color-moved revisado; diferencias estructurales/visibilidad/formato documentadas en buzón. Check parity-capture PASS; Clippy adicional de esa feature falla con 21 diagnósticos en archivos intactos. Sin QA manual física/capturas nuevas; headless no acredita LMU/OBS/DPI. PR-6, gates de la base previa b2186f82: fmt/Clippy PASS y Nextest Hub 413/413 (1 skip). RED con +1 en los cuatro techos y Studio por encima del techo general; restauración de cinco archivos byte por byte/SHA-256 y GREEN. El primer run limitado omitió PATH DuckDB y falló el writer del smoke de análisis; repetido con el entorno de gates, pasó. Revalidación completa sobre ee372540: fmt/Clippy -D warnings PASS, Nextest workspace 1619/1619 (7 skips, 231,321 s), lifecycle 18/18; check parity-capture PASS. RED/GREEN repetido con services/view y los otros cuatro casos; bytes/SHA-256 restaurados. Logs iniciales: `C:/tmp/ola2/evidence-1561-hub`. Correcciones de revisión #1581: fmt/Clippy -D warnings PASS, Nextest 1619/1619 (7 skips), lifecycle 18/18. RED/GREEN de excepción inexistente y cinco casos de crecimiento, restauración byte por byte/SHA-256; evidencia en `C:/tmp/ola2/evidence-1581-review`. Siguiente paso: revisión del mismo draft y QA manual pendiente, sin merge.

Entrega anterior #1564: RED `9c218b38`; código/capturas `c8401b50`; test D12 ampliado `63bead05`. Fmt/Clippy PASS, Nextest 1601/1601 (7 skips), lifecycle 18/18, telemetría 25/25, anti-slop 456 huellas PASS. Cuatro capturas Studio 1440×900 inspeccionadas: Práctica/Qualy 537,3345 de ancho natural y Carrera 579,3345, x=48/y=62 constante. Frame explícito 800×400/documento/ancla por tres pestañas PASS. Post-merge final: fmt/Clippy -D warnings PASS (22.43s), Nextest 1613/1613 (7 skips, 266.205s), lifecycle 18/18 y telemetría 25/25 PASS; anti-slop 456 huellas PASS. Cuatro capturas nuevas merge-studio-*.png abiertas e inspeccionadas, hashes idénticos a las anteriores. Botón de pista/tray y preview por sesión con tamaño explícito pasan los tests.
**#1566 · Pedales Vantare** (rama `vantareapp/isa-1566-pedales-look-vantare`, PR #1580 integrada en nightly 1dfdd6f1, aprobada por Isaac): columnas juntas y sin rótulos: fmt/Clippy -D warnings PASS, Nextest 1617/1617 (7 skips; un timeout ajeno de `engineer::recovery` en un intento, verde al repetir), lifecycle 18/18. Captura Eficiencia 108×160 idéntica (0/17280 px, umbral 0) a la de #1563; `reference/pedals.png` legacy 120×160 de nightly conservada sin tocar. Capturas antes/después en `C:/tmp/ola2/1566/`; buzón `C:/tmp/buzon/1566.md`. Sin cambios en domain/IPC: telemetría no aplica.
Logs y revisión/hashes: `C:/tmp/ola2/evidence-1564`; informe `C:/tmp/ola2/informe-1564-impl.md`; buzón `C:/tmp/buzon/1564.md`. No convierte fixtures/replays en LMU/ACC/OBS físicos, DPI/macOS ni input→Present. Present/s no mide latencia. Históricos/goldens se conservan sin recalibrar.
**#1536 · Launcher:** test COM compara destinos canonicalizados, conserva ejecutable/bytes, no ejecuta y rechaza UNC; arreglo `d7c6cd17`, histórico enlazado arriba.

Guardias #1561 `22fe7490`: layout Eficiencia/Neutro/acentos de cuatro widgets, transiciones activas de Banderas/FastestLap/Input/PedalsTelemetry y replay: 8/8 PASS antes del refactor. Capturas base de 18 widgets por `compare.ps1` guardadas e inspeccionadas; diferencias con goldens históricos registradas sin recalibración. Cuatro pintores equivalentes tras renombrado de imports/tipos; PR-3 reduce 6 líneas Rust (13321→13315 en 12 fuentes, incluidos tests; 22fe7490→abc22332). PR-5 reduce 72 líneas Rust (12945→12873 en 24 fuentes); registro 175→157, wrappers 8→0 y sitios de API de movimiento por widget animado 2→1. Cuerpos de frame conservados 18/18. Gates anteriores al merge de #1578 por la cola: fmt/Clippy -D warnings PASS, Nextest 1615/1615 (7 skips), lifecycle 18/18; build parity-capture/paint-stats y guardias con ambas features 5/5 PASS. Paridad final inspeccionada: 18/18 hashes PNG idénticos, 0/1720978 píxeles distintos, umbral 0 sin máscaras. Verificación retenida 456 huellas PASS. Revisión #1579: JSON canónico fijado desde 22fe7490/b2186f82; cuatro instancias y nombres/defaults/fallbacks guardados 4/4 PASS. Mutación real del orden style/accent rechazada por bytes; restauración 4/4 PASS. Receta DTO v10, guardados v7–v10 y alta de Kind::label corregidas. Gates tras reconciliar #1578: fmt/Clippy PASS, Nextest 1621/1621 (234.263 s, 7 skips), lifecycle 18/18 y telemetría 25/25 (851.768 s; ACC 804.035 s). Fixtures vigentes y lectores guardados IPC PASS. Sin nuevas modificaciones a fuentes/fixtures/referencias de widgets; paridad previa conservada, no recapturada. Evidencia nueva: `C:/tmp/ola2/evidence-1561-ui`; buzón `C:/tmp/buzon/1561-ui.md`.

**#1569 · Añadir widget:** rama `vantareapp/isa-1569-anadir-widget` sobre #1581 + `origin/nightly@1dfdd6f1` (merge, sin rebase). `studio/add_widget.rs` (catálogo, agrupación, hueco libre, imán, arrastre, aviso) y `Editor::add_at`. Gates locales tras el merge: fmt/Clippy -D warnings PASS, Nextest 1633/1633 (7 skips), lifecycle 18/18. Capturas reales 1920×1080 (política LaunchV1) frente al HTML aprobado en cinco estados: `C:/tmp/ola2/evidence-1569/hoja-antes-despues.png`. El arrastre real con ratón no se automatizó: lo cubren tests de imán/hueco y el flujo headless de clic. SVG propios (petición de Isaac tras ver la hoja): 18 miniaturas a color y 18 iconos en `hub/assets/widgets/`, dibujados a partir del render productivo de cada widget y embebidos en `shell/assets.rs` (test por `Kind`); tarjetas, tira e inspector los usan. Hoja: `C:/tmp/ola2/evidence-1569/hoja-svg-widgets.png`. Revisión independiente (`C:/tmp/ola2/review-1585-opus.md`, 0 P1 · 3 P2 · 13 P3): P2 corregidos con test que falla antes (Esc solo desde el lienzo; sin acceso verificado no se vende Pro; hueco libre medido con rectángulos pintados) y «Ver planes» ahora abre Cuenta (Licencias está oculta en beta: el clic no hacía nada). P3 1, 3, 4, 7–12 y a11y corregidos; 2 (SVG no sigue al renderer) queda como deuda en el README; 5, 6 y 13 pendientes de decisión o de otra rama.

## 7. Riesgos y deuda

- `cargo build -p vantare-hub` aislado falla sin `vantare-services/network` (`services/access.rs` usa `config`); los gates de workspace no lo ven. Issue #1586, fuera de alcance de #1569.
- CI remota de #1585 tras el merge de nightly@707514e2 pendiente; los gates locales no acreditan los remotos.
- #1561: comparar contra esta base; los goldens históricos ya difieren en dimensiones/píxeles antes del refactor y no se recalibran.
- #1535: SQL no aplicado; producción/ref/DEFINER/ACL/migraciones sin verificar. Requiere confirmar destino y respuesta expresa del orquestador.
- El split cambia rutas internas de tests y puede generar conflictos con ramas de Studio; #1569 sigue fuera de alcance y requiere coordinación. #1524: autoría no acredita fuente live.
- #1527 debe partir del DTO live v10 realmente integrado y mantener lectores persistidos compatibles.
- Evidencia física/plataforma y deuda de paridad de ADR 0101 conservadas en el histórico; no elevar severidad sin nueva prueba.

## 8. Issues terminadas, activas y pendientes

Integradas: #1530–#1534, #1536; documentación #1561 PR #1570, #1562 PR #1576, #1563 PR #1572 y #1567 PR #1575. Sus issues pueden seguir abiertas; integración no implica cierre. #1564/PR #1577, #1535/PR #1578, #1561 PR-3/PR-5 (#1579), #1566/PR #1580 (aprobada por Isaac, sin rótulos, adaptada a `look::{Tone, Accent}`) y #1561 PR-4/PR-6 (#1581, `707514e2`) integradas en nightly; #1535 sigue abierta por la previa/SQL bloqueados. Activa: #1569 (PR #1585 a nightly, con `origin/nightly@707514e2` fusionado). Pendiente coordinada: #1527. #1496/#1497 no se cierran por este resumen. IDs ISA/VAN históricos en permalink anterior.

## 9. Siguiente acción exacta

#1569: esperar los checks remotos de #1585 tras el merge de nightly@707514e2 y activar auto-merge solo con todos en verde (autorizado por Isaac). QA manual del arrastre con ratón: la hace Isaac. Decisiones abiertas de la revisión: filtro de la tira (P3-5) y sección OBS sin selección (P3-6). QA manual física pendiente, solo sin pantalla-ocupada y con mutex del harness. Sin promoción testers/master ni release. #1535 conserva como siguiente paso confirmar proyecto/acceso y la previa SOLO LECTURA; no aplicar SQL sin respuesta expresa del orquestador.

## 10. Última actualización

2026-10-14 · #1607 / VANTA-45 · Reanudado por Codex CLI, sin subagentes. Base 69fa2d65 preservada; dos commits de T3 y árbol inicialmente limpio. Corrección 01:05 desbloqueó #1565; lock propio 03:09:33 tras #1605. Cinco correcciones publicadas con RED/GREEN y antes/después: resident por referencia, miniaturas preparadas, muestras compartidas Input y Delta, PNG de Workshop por contenido. Delta se contrastó en tres pares (CPU menor en los tres), sin escoger la campaña favorable. [Informe](../../analysis/rendimiento-ui-2026-10.md) y datos crudos en docs/analysis/data/rendimiento-ui-1607. Release propia dos jobs; 42 tomas de procesos y seis de scroll, con carga variable, sin atribuir ganancia global. Capturas Inicio/Launcher/catálogo Studio: 0/2.764.800 píxeles distintos, sin máscaras. Navegación autenticada bloqueada por acceso sin verificar; no se inyectó política. Fmt/check/Clippy/Nextest 1657/1657 (12 skips)/lifecycle 18/18/quality/456 huellas PASS; telemetría separada no aplicable al diff Hub/UI. PR draft #1611 OPEN a nightly; código final c40a90d9 publicado. Plane Por revisar verificado el 14/10 ~03:57; CI final por consultar en PR/issue, sin extrapolar gates locales. Procesos propios cerrados y lock liberado 03:55:39. Sin merge, promoción, release, instalación real, USB, nuevas dependencias ni diseño. Siguiente: revisión del orquestador, QA de Isaac autenticado/LMU/ACC/OBS y campaña sin builds para atribuir CPU/frametime/input→Present. Buzón C:/tmp/buzon/1607.md.

Hitos #1607: PNG `c40a90d9` (2234.920 → 115.473 µs/carga repetida; RED/GREEN), Delta `b8dd47e4` (0.13404 → 0.00866 µs/repetición; tres pares CPU menores, RED/GREEN), Input `9453d08f` (2.841 → 0.008600 µs/preparación repetida; RED/GREEN), miniaturas `bb3f1545` (19.527 → 0.008667 µs/asset repetido; RED/GREEN), resident `2fd6b9c5` (70.311 → 32.563 µs/poll de 128 perfiles; RED/GREEN).

2026-10-13 · GitHub #1569 · Claude (Opus 5.5): catálogo «Añadir widget» en el carril; §3 (evidencia), §4, §7 y §8.
2026-10-13 · GitHub #1569 · Claude (Opus 5.5): SVG propios de miniatura e icono de los 18 widgets; §3.
2026-10-13 · GitHub #1569 · Claude (Opus 5.5): correcciones de la revisión de #1585; §3.
2026-10-13 · GitHub #1569 · Claude (Opus 5.5): merge de nightly@707514e2 (#1581 integrada); §3, §7, §8 y §9.
2026-10-13 · GitHub #1561 · Codex. Merge de nightly con #1579 y #1580 conservados junto con PR-4/PR-6; estado y diario en issue/buzón.
2026-10-13 · GitHub #1566 · Claude (Opus 5.5): §1, §4, §6 y §8 por Pedales Vantare; merge de nightly con #1578 y #1579 conservados.

2026-10-14 · #1628 / VANTA-51 · Ronda 2, encargo directo Codex CLI; sin Plane, Notion, subagentes, PR ni merge. Base asignada b9ec75ed conservada. Código 7bd4dc00 (hito anterior 7b0a2769): detector local de CPU/núcleos físicos, RAM y primer adaptador DXGI de hardware; Automático inicial/recomendado = Equilibrado, o Ahorro con ≤4 núcleos o <8 GiB. Se guarda la elección junto al nivel resuelto, sin medición en carrera. ACC solo se detecta por los manifests instalados de las bibliotecas Steam existentes; fuera del catálogo Launcher. Pro Plus/Launch abren la web de precios; los proveedores siguen AccountBegin y no se duplican #1631/#1633.

QA Windows real: LMU+ACC encontrados; Ryzen 7 3700X, 8 núcleos, RX 7800 XT y 32 GB; Máximo→Automático/Equilibrado, guardado y reapertura sin asistente, uso/fallos apagados. Gate workspace 1763/1763 (12 skips), repetición final Hub/Launcher/services 679/679 (4 skips), lifecycle 18/18, fmt/check/Clippy e integridad 456 PASS. Siete capturas 1600×900 en C:/tmp/onboarding/nativo/r2; diferencias >20 por píxel, media sin máscaras 18,69 % r1→9,68 % r2. Quedan rasterización/glow/espaciado de GPUI y previews productivas distintas de las miniaturas HTML; textos honestos de privacidad/local y regla Automático explicados en el informe. Publicación autorizada: solo push de vantareapp/isa-1628-onboarding; HEAD final, prueba remota, logs y límites en C:/tmp/buzon/1628.md y C:/tmp/onboarding/nativo/r2/informe.md. Sin CI remota acreditada, promoción, release ni servicios comerciales reales; revisión e integración corresponden al orquestador.


### VANTA-51 / #1628 · Integración del consentimiento · 16-oct-2026

PR #1637, rama `vantareapp/isa-1628-onboarding`, worktree
`C:/VantareServer/wt/isa-1628-onboarding`. Merge de nightly `bcaa0e3f2`
en `a2f9b8ee6`, publicado sin conflictos; sin promoción de canal.
Marketing se conecta por servicios con OAuth actual a `native-mail-consent`
según `supabase/functions/native-admin/CONSENT.md`: consulta remota, elección
única de novedades/ofertas, locale es, fuentes onboarding/settings, ACK antes
de cambiar proyección o completar el paso. Uso y fallos siguen separados y
locales. 401 pasa por revocación del núcleo y cierra sesión; errores de correo
no confirman permisos ni reenvían decisiones automáticamente. Servicios v11.
Founders se presenta según el núcleo; Saltar lleva al aviso de fallos antes
del resumen. Los fallos siguen encendidos con aviso y pueden apagarse.

Review DeepSeek de `C:/VantareServer/evidence/ds-rev1637`: arreglos P2/P3
conservados con tests de navegación, planes, textos y salida privada.
P1 de widgets completos sigue abierto: depende de #1641 (no fusionado).
#1675 también OPEN; cero capturas/ventanas en este encargo.
Validación del código `cec0bed8d` / seguimiento `24d3d33c9`:
- CI Windows verde en `24d3d33c9`: fmt/check/clippy del workspace PASS;
  Nextest suite+corpus 1886/1886 PASS (19 omitidos por configuración existente),
  lifecycle 18/18,456 huellas PASS. Run38914287454, job117018176509.
- Los otros cuatro checks de ese SHA pasan: promoción, calidad, PostgreSQL/E2E
  de marketing y GitGuardian. Sin cambios SQL/Edge de este worker.
- Windows local fmt/check/clippy PASS. Nextest inicial paró en446 PASS/1 FAIL
  por C:lleno (StorageFull112). Log conservado; reintento cancelado aún en
  cola al comprobar la CI completa verde, evitando repetir trabajo ya validado.
  No se retiraron archivos: limpieza propia directa bloqueada por revisión
  automática; cargo clean alternativo cancelado en cola al recuperar espacio.
- Mac fmt/check/clippy PASS; consentimiento4/4 y regresiones onboarding11/11
  PASS; suite amplia702 PASS/52 FAIL/5 omitidos:50 GPUI conocidos en #1653 y
  2 smoke sin binario storage en ese target. Sin filtrar ni debilitar tests.
  Telemetría32/32,lifecycle11/11,456 huellas PASS. Worktree/target retirados.

PR #1637 fuera de borrador por encargo de Isaac. VANTA-51 pasa a Por revisar;
el cierre final solo actualiza este handoff, y su SHA/CI se verifica en #1628.
P1 de DeepSeek sigue abierto hasta widgets completos de #1641. #1675 OPEN:
sin capturas ni ventanas; QA visual pendiente del modo lote integrado en nightly.
Evidencia `C:/VantareServer/evidence/1628-integration-20261016`.
No hay merge a nightly ni release. Revisión/integración corresponden al
orquestador. T3 rechazó watch_pull_request porque este hilo es un worker:
la vigilancia final de CI corresponde al padre, avisado en buzón.


### VANTA-51 / #1637 · Reanudación y merge de nightly · 16-oct-2026

Reanudado desde `1278bc9e3`, limpio, en el mismo worktree. Encargo del
orquestador: resolver DIRTY con merge, sin rebase ni force-push.
Base incorporada `32c3f3a14`: login propio #1635 y correcciones Polar #1681/#1683.
Cinco conflictos resueltos conservando MailConsent y AccountEmail, la pantalla
Cuenta extraída a services/view/account.rs, Founders y los cambios comerciales.
Servicios pasa a v12 para rechazar los peers v11 sin marketing; se conserva
Debug redactado de las credenciales y se prueba el rechazo de v11 en el host.
Retirada solo la copia de account_plan_label que ya vive en account.rs.
Gates nuevos pendientes en esta base; se usará CI Windows. No se extrapolan
los checks de la entrega anterior. No hay promoción a nightly ni release.
P1 widgets completos #1641 y capturas #1675 quedan fuera de este arreglo del merge.
