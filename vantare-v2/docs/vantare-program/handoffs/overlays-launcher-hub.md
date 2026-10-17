# Handoff vivo — Overlays, Studio, Launcher y Hub

[Histórico previo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/8c6e83f977c8d2245a04266cdaaf896ed8c1b131/vantare-v2/docs/vantare-program/handoffs/overlays-launcher-hub.md). El diario y avances están en las issues; este documento conserva el estado actual.

## Integración del calendario #1640 en #1660 · 2026-10-17

Merge de origin/nightly `2a580c458` sobre la rama de #1660, sin rebase ni
force-push. Resueltos los dos conflictos del calendario conservando su modelo
nuevo, degradación con copia .invalid y protocolo services 12. El feed del
overlay sigue la ruta compartida de IPC desde el layout real; se adapta a
franjas/tandas y al canal En pista. Windows usa el emisor del calendario nuevo,
sin el segundo toast del widget. Regresiones: feed, canales, caducidad,
franjas/tandas y copia intacta tras guardar. CI/SHA definitivos en issue/PR/buzón.
El seguimiento de tests MSIX de R2 queda en una rama aparte después del merge
de #1660 por el orquestador. Sin ventanas, capturas, LMU físico ni release.

## Review R1 #1660 · correcciones para ronda 2 · 2026-10-17

Informe NO APTO de DeepSeek leído. Correcciones `c7ffd8d9`; se fusiona
origin/nightly `de68847f7` (instalador #1600) sin conflictos ni rebase.
La CI de `6ca18326` pasa 1927/1927, lifecycle 5/5 y cinco checks;
durante esa ejecución entra el pulido #1679 en `a3fea01f`. Se fusiona
también sin conflictos, conservando su corrección de recuperación LMU y
los catálogos/regresiones R1; CI del HEAD final en issue/PR/buzón.
Ruta de agenda compartida desde el layout
real de Studio/overlay mediante `ipc::session_alerts::calendar_path`, con
regresión para argumentos beta/MSIX. El supervisor live deriva catálogo desde
`widgets!` (origen de `Kind::ALL`) y variantes desde `LIVE_EXTRA_SETTINGS`;
valida multiplicidades, no fija 18/22. Offline contrasta el catálogo exportado
con el fuente independiente, rechazando también binarios antiguos coherentes.
Tests del supervisor usan una expectativa explícita independiente.

Frescura/opción se validan antes de consumir el fin. Pausa/garaje/hueco de reloj
ocultan la sesión y conservan umbrales/sonido; nueva identidad sí reinicia.
Agenda lejana despierta en el umbral en vez de 1 Hz; la demanda retira
Positions/LapTimes hasta demostrar la fuente de fin real.
P3-3/P3-5/P3-6 y límites se documentan en `native/ui/session-alerts.md`:
etiqueta de umbral al entrar tarde, E/S periódica existente, audio físico y
blanco limitado a prácticas/qualy. Las listas Python de notas/timing permanecen.
La CI anterior solo acredita 39c8720f; SHA/checks de esta ronda en issue/PR/buzón.
Sin capturas/ventanas, LMU físico, merge a nightly ni release.

## Reanudación #1653 · catálogo de cobertura · 2026-10-16

El primer HEAD actualizado pasa CI Windows: 1911/1911 Nextest (19 omitidos),
lifecycle 5/5, formato/check/Clippy y cinco checks SUCCESS (run 38973145705).
Mientras corría, nightly avanzó a `1a8ddee33` (#1684); se fusiona también,
sin rebase ni force-push. La conclusión del HEAD definitivo se registra al
cerrar en #1660/#1653 y el buzón, no se extrapola el verde del SHA anterior.

Se fusiona origin/nightly `32c3f3a14` mediante `725cce28`, sin conflictos,
rebase ni force-push. El evaluador offline deja de fijar 18 widgets:
el consumidor Rust exporta el catálogo de `Kind::ALL`, y Python valida
nombres y cantidad contra él, rechazando faltantes, extras y duplicados.
El resumen usa esa cantidad; informes antiguos sin catálogo exigen recompilar.
Se conserva el límite de cobertura: evaluar proyecciones no certifica señales
reales de formación/salida. CI y SHA de esta fase se verifican al cerrar en
#1660/#1653 y el buzón; el verde anterior no acredita este nuevo HEAD.

## Continuación #1653 / VANTA-74 · v11 · 2026-10-16

[PR #1660](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1660)
a nightly, rama `vantareapp/isa-1653-avisos-sesion`; merge limpio `ff9bc31f`
de origin/nightly `bcaa0e3f`, que incluye #1664.
GitHub Project Vantare / area:overlays-runtime, sin milestone.
Estado Plane y SHA final publicados se verifican al cerrar en la issue y buzón.
Worker Mac por SSH, target propio; gates uno a uno con VANTARE_CARGO_MIN_GB=0.
[Contrato v11](../../telemetria/session-alerts-contract.md) y
[consumo del widget](../../../native/ui/session-alerts.md).

Se conecta SessionTiming actual: fin programado como «FIN PREVISTO»,
sin afirmar carrera ni fin real al llegar a cero. Sesiones consecutivas
reinician la cuenta sin blanco inferido. Blanco solo con finished_at_s
confirmado reciente; fases explícitas y metros estimados (≈) solo juntos;
próxima sesión solo con tipo, instante anunciado y reloj actual del mismo ID.
El calendario UTC sigue independiente. Amarillo sólido FCY / rojo final /
blanco terminado y mini configurable del diseño aprobado se conservan.

LMU aún NO demuestra inicio/fin reales, fase formación/salida ni próxima sesión:
se ocultan sin inventar datos. Sí publica fin programado, distancia estimada
a salida/meta fuera de boxes e identidad de sesiones consecutivas.
Se corrige el fallo de CI Windows de Sound::stop (función asociada).
Código `722c2bf0fcc9d9eee8c50392efe65f8254db5943`, publicado en GitHub.
PR fuera de draft, autorización del orquestador. Fmt/check/Clippy workspace
PASS; feature/contrato 23/23; lifecycle Mac 10/10 (Engineer cero aplicables);
telemetría 32/32 PASS. Nextest workspace: 1692 ejecutados, 1642 PASS y 50 FAIL
por «Mac platform not created on main thread», 12 omitidos por la configuración
vigente. No se filtran ni modifican esas pruebas; la CI Windows del SHA final
se verifica en #1660/#1653 y el buzón, sin extrapolar los resultados Mac.
Sin LMU ni ventanas/capturas de app.

Primera entrega conservada: código e1dd1747, docs a4385ed4; evidencia histórica
en ~/orq/1653-evidence/informe.md. Nueva evidencia con prefijo v11 en el mismo
directorio. El orquestador autorizó push y sacar #1660 de draft; no autorizó
merge a nightly, promoción ni release.

## 1. Resultado

Hub/Studio GPUI editan el layout único y los widgets del registro. Launcher gobierna procesos mediante el motor propio. Standings tiene columnas/formatos por Práctica, Qualy y Carrera; todos los widgets filtran por sesión. Pedales conserva separación ajustable y gana Look Vantare en columnas (#1566, integrada en nightly); el botón de pista alterna mostrar/dejar de mostrar mediante la solicitud compartida.

## 2. Autoridad y lectura verificada

GitHub Issues y Project Vantare; #1561/area:plataforma, In Progress, sin milestone comprometido. Plan `C:/tmp/ola2/plan-1561.md`: esta rama cubre PR-4/PR-6; PR-3/PR-5 ya integradas por #1579 en nightly. #1562/#1564 presentes en la base; #1569 conserva su issue independiente. #1531/#1532/#1534 cerradas. Leídos AGENTS, README nativo/UI, ADR 0101 y contrato de producto.

## 3. Estado real y canal

17/10/2026 · #1629/VANTA-8 · R5: respuesta a DeepSeek A/B1/B2/B3, sin P1. Correcciones de todos los P2 publicadas (`ae8a002df`, merge `db4455453`) y regresiones del texto/color/geometría que usa el pintor (no solo ViewModel), sin ventanas ni nuevas dependencias de tests. Check workspace/all-targets PASS; regresiones dirigidas 21/21 PASS. Contraprueba temporal: 21 FAIL/2 PASS al reintroducir defectos, fuentes restauradas por SHA256 y test de grupos reforzado para que las sugerencias no tapen un omitido. Se documentan los 99 P3, con los arreglos baratos de caché y los límites pendientes, en [respuesta R5](../research/1629-review-r5.md). Se incorpora nightly2a580 y después 9c19b2993 por merge (instalador #1600, telemetría #1679, calendario #1640 y Avisos #1660), resolviendo Banderas con Cars/Flags/Positions/SessionInfo sin Penalties. Fotos v11, Services v12 y derechos v5. Se validan gates/CI del SHA publicado (cola local ocupada); los verdes R4d son históricos y no certifican esta ronda. Estado, SHA remoto y resultados de cierre vigentes en [#1629](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1629) y [PR #1641](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1641); evidencia `C:/VantareServer/evidence/1629-r5/progress.json`. Árbol nativo congelado `c118c104dcafbf522209e6d01ef76fc8336fd1fe` tras corregir nueve puntos y coma exigidos por Clippy; primer intento CI f04a pasó fmt/check y no alcanzó Nextest/lifecycle, log conservado. #1675 está integrada mediante nightly c9a832d70: se conserva el banco oficial, se retira open_capture antiguo y se mantiene la guarda de fuentes antes de crear el HWND. No se ejecutan capturas en la respuesta P2; recaptura 17 × 4 y variantes pendiente con el lote oficial. Check opcional parity-capture no obtenido por cola ocupada, sin saltar la cola. El catálogo conserva también Avisos de sesión integrado en nightly: ALL19, visibles18 (cuatro gratis/catorce Pro), legado Daños detallados oculto. Sin merge del PR, promoción, release ni despliegue.

17/10/2026 · #1629/VANTA-8 · Se incorpora también nightly `1a8ddee33` (#1684, reinicio del login tras fallo de guardado), por merge sin conflictos y sin cambios propios a widgets/login. Nuevo corte pendiente de CI Windows; SHA/checks/estado vigentes en #1629 y PR #1641, evidencia `C:/VantareServer/evidence/1629-r4/refresh-1a8d/`. El corte cd641 con nightly32c3 pasó CI 5/5 en intento2 (1926/1926 y lifecycle completos); intento1 Engineer recovery perdió derechos y cerró stream sin ACK, preservado y seguido en #1654, sin debilitar pruebas. Su verde no se extrapola al nuevo Services. #1675 OPEN, cero ventanas/capturas; aceptación visual y física pendientes. Sin merge del PR, promoción, release ni despliegue.

16/10/2026 · #1629/VANTA-8 · Reanudación desde `a2dc6a119`: merge sin conflictos de `origin/nightly@32c3f3a14bd22e9bcedff9e21e1cb138f5cc5226` (#1681/#1683), sin rebase ni force-push. Solo entran once archivos comerciales; árbol nativo idéntico al validado en R4b (`4fcdf2c3d70282417535ef4ab70deaff5836d03b`). Cola local ocupada al intentar fmt con MIN_GB=0/jobs2: espera propia cancelada; por autorización del orquestador, validación de este HEAD mediante CI Windows. SHA remoto, resultados y siguiente paso verificados en #1629 y PR #1641; evidencia nueva `C:/VantareServer/evidence/1629-r4/refresh-32c3/`. No se extrapola el CI de a2dc al nuevo SHA. #1675 OPEN, ninguna ventana/captura; aceptación visual y física siguen pendientes. Solo actualización de la rama de issue, sin merge del PR, promoción, release ni despliegue.

16/10/2026 · 18:24 CEST · #1629/VANTA-8 · Entrega R4b sobre la base de cierre `95abdcc6e8a87b909848131231dc3031356b4fb7` (login propio), fusionada sin conflictos en `f0e5a925a09cef988000cf2386ced0cefe349b58`. Fotos v11, Services v11 y derechos v5; sin cambios propios al login/Founders. **Fmt/check workspace-all-targets/Clippy -D warnings PASS; Nextest perfilCI+parity-capture 1932/1932 PASS (19 skips, 457,880 s); corpus 32/32, lifecycle 18/18, launcher 41/41, calidad y 456 huellas PASS.** Sin fallos ni reintentos, un ACC lento de 88,048 s PASS. Fuente nativa congelada desde f0e5 y vinculada por hash de árbol en `C:/VantareServer/evidence/1629-r4/refresh-95abd/validation-source.json`; logs/resultados en ese mismo directorio. Los 23 casos dirigidos del primer corte también quedan cubiertos por la suite completa. CI del SHA publicado y estado final Plane/Project: ver PR #1641 y cierre de VANTA-8/#1629. El primer corte 4dee de abajo queda histórico. Sin merge del PR, promoción ni release. #1675 sigue OPEN: no se abre ni captura la app; recaptura 17 × 4 y variantes, aceptación visual y prueba física pendientes.

16/10/2026 · #1629 / VANTA-8 · Entrega R4 para revisión del orquestador, objetivo integración antes del 23/10. Merge de `origin/nightly@bcaa0e3f2de0278b329b94bd2095505d56c3ed1d` publicado en `3ca3acd95`; código de señales `a46d9db6afdc3ca8f4eca27e6ed9299450acb662`, rama `vantareapp/isa-1629-widgets-diseno`, PR [#1641](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1641). Conserva Founders/compra/correos y cuatro gratis; DTO live v11 estricto, Services v10 y derechos v5. Cinco conflictos resueltos conservando demandas/banderas personales y de sector junto al diseño. Referencias personal/óptima/líder conectadas a número y ambas historias de Delta; Radar pide Velocity y usa dos velocidades actuales; Mapa conserva el nombre de sesión aunque falte el total de vueltas.

Gates locales R4 en servidor, seriales, `MIN_GB=0`, jobs2 (Nextest build/test1), target propio `D:/VantareServer/targets/1629`: **fmt, check workspace/all-targets y Clippy -D warnings PASS sobre el código congelado; regresiones 23/23, Nextest perfilCI+parity-capture 1906/1906 (19 skips canónicos), telemetría incluida 32/32, lifecycle 18/18, calidad y 456 huellas PASS**. Nextest ejecutó 460,679 s, sin reintentos ni fallos; un ACC lento de 87,494 s PASS. Launcher 41/41 PASS y sin diff con nightly: cuelgue histórico no reproducido; sin build frío adicional ni arreglo ajeno. Se conservan fallos iniciales y correcciones en `C:/VantareServer/evidence/1629-r4/`; el os112 en C se resolvió con target nuevo D, sin mover/borrar la caché anterior. [Informe R4 y tabla de señales/límites](../research/1629-v11-r4.md). Estado Plane de entrega, HEAD remoto y CI del SHA publicado: consultar el cierre de VANTA-8/#1629 y el PR, no los resultados R3 históricos.

#1675 sigue OPEN, fuera de nightly: no se abre ni captura la app. Los 168 pares R3/68 estados son históricos y no certifican el HEAD v11. Queda recapturar 17 widgets × 4 estados y variantes únicamente con la herramienta integrada en modo lote sin ventanas, además de aceptación visual, LMU/ACC/OBS/DPI/tecla física y derechos reales. Sin datos inventados para ABS/TC/FFB, forecast, zonas de daño o sanciones tipadas sin productor. Sin merge de #1641, promoción, release ni despliegue.

15/10/2026 · #1629 / VANTA-8 · Orden vigente de Isaac: **prohibido abrir cualquier ventana de app o capturar, incluso fuera de pantalla**. Lotes detenidos; sin procesos propios de captura activos. Las pruebas anteriores de rectángulo/foco no descartan ventanas visibles transitorias; el capturador no se considera resuelto. 168 placas y matriz de 68 estados conservadas como evidencia provisional en `C:/VantareServer/evidence/1629-r3/`, anteriores al cierre de Banderas/mapa. Queda recapturar los 17 widgets × cuatro estados y sus variantes con una herramienta nueva, en sesión posterior autorizada. [Informe R3 y tabla por widget](../research/1629-windows-r3.md).

Código de cierre publicado en `48d7b8898`, entrega Por revisar con gates pendientes por RAM: se corrigen los cinco fallos del mapa del Nextest 1785/1790 (orden de escena, reloj solicitado, identidad espacial independiente de recepción/señales filtradas y prueba de idioma de cabecera visible). Fuente live, época y poses ajenas siguen rechazadas. Banderas distingue qualy y llegada con posición/clase; símbolos azul/cuadros refinados usando imágenes conservadas. Fmt/rustfmt, calidad y 456 huellas PASS. Los gates finales no arrancaron tras >18 min esperando RAM (3,5 → <2 GB libres frente a mínimo 4); se canceló solo la espera propia, sin procesos en segundo plano. Último Nextest 1785/1790: las cinco correcciones están publicadas pero aún no verificadas. Check/Clippy, lifecycle 18/18 y telemetría 25/25 pasaron en tandas anteriores, no certifican el cierre. El orquestador debe liberar RAM y repetir la receta `C:/VantareServer/evidence/1629-r3/_tools/gates-close.ps1`, que no abre ventanas. T3 rechazó el watch por ser subagente; sin aviso automático. Tandas anteriores publicadas `02c273f20`, `e1a778a42`, `6429c4aa2`, `a83935a44`. El CI a839 falló en la secuencia de mapa, corregida en este cierre; el fallo Triage del merge sintético anterior se conserva aparte. No se certifica paridad final ni se modifica launcher/Triage. Sin merge, promoción o release.

Las entradas siguientes de #1629 describen hitos previos; sus afirmaciones de captura fuera de pantalla quedan limitadas por la orden y el informe anteriores.

15/10/2026 · #1629 / VANTA-8 · Tanda Windows de captura: el banco de paridad abre una ventana no activable completamente fuera de todos los monitores y lee su HWND con PrintWindow, sin leer el escritorio. Valida posición y fuentes antes de aceptar la imagen. Windows registra la familia como `Rajdhani`; corregir `Rajdhani SemiBold` elimina la sustitución tipográfica de los 17 widgets. Pruebas reales en `C:/VantareServer/evidence/1629-r3/offscreen-final.json`, fuente antes/después en `fastest-lap/real/fontdiag.png` y `fontfix.png`. Clippy de workspace con la feature de capturas pasó en `clippy-visual-3.log`; esa evidencia es de la tanda, no certifica el diff visual posterior. Paridad de estados y gates finales aún en curso. No hay merge, promoción o release.

15/10/2026 · #1629 / VANTA-8 · Continuación Windows por gpt-6.1-sol, encargo explícito del orquestador sobre el relevo Sonnet. Rama `vantareapp/isa-1629-widgets-diseno`, base nightly `88051556`, relevo publicado `cd2608a14`, PR draft [#1641](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1641) a nightly. Nueve archivos heredados compilados: Relative identifica qualy/práctica en el título, Delta muestra la diferencia del sector en curso solo con datos completos, Fuel pinta el panel hasta el contenido y Tiempo ofrece tarjeta horizontal/columna vertical; Workshop usa las columnas de sesión de Standings. UI Nextest Windows: 343/343 PASS, 4 bancos omitidos, incluidas dos regresiones nuevas y los checks looks_architecture arreglados en el relevo. Evidencia `C:/VantareServer/evidence/1629-r3/tests-inherited-2.log`. Capturas Windows y revisión visual en curso; todavía no se certifica paridad ni suite workspace final. Sin merge, promoción o release.

Petición de Isaac durante la continuación: capturas sin ocupar su pantalla. El banco usa PrintWindow del HWND fuera de todos los monitores y sin foco; comprobación `offscreen-check.json` y `standings/real/offscreen-check.png` en la misma evidencia, 520×236 y solo un píxel suavizado distinto de la captura anterior. El renderer de producto es el mismo. `native/launcher` es idéntico a origin/nightly en esta revisión; reproducir en un target frío de nightly no es barato. El cuelgue histórico se conserva para seguimiento separado, sin modificar su código.

#1629 / VANTA-8: 17 widgets portados localmente; revisión y aceptación visual pendientes, rama `vantareapp/isa-1629-widgets-diseno`, base nightly `88051556`; encargo explícito del 14/10 amplía la issue copiada (HTML) al porte GPUI de 17 widgets. Seguimiento externo reservado al orquestador, sin push/PR/merge.
Continuación 15/10: los 17 widgets tienen escena y captura del Workshop real del Hub; `hub/examples/widget-workshop.rs` usa acceso de QA explícito sin servicios reales ni cambios de derechos. Coche/Cifras comparten Daños 200×272; el catálogo visible tiene 17 entradas. `PenaltyKind` y la unión de #1638 están en domain/racing_flags; no se ha tocado runtime/services/DTO. Domain 162 y UI 321 PASS (4 ignorados), Clippy `-D warnings`, build, arquitectura Domain 1/Hub 11, lifecycle Mac 10, telemetría 9 y formato PASS con Rust 1.95 y target propio. Hub completo: 390 PASS/47 FAIL/4 ignorados; 45 fallos GPUI de hilo principal en Mac ya aceptados por el orquestador y 2 por binario storage ausente. Se conservan los errores, sin debilitar tests. Paridad alta global todavía no certificada: faltan señales del HTML (previsión, daños por zona/rueda, tiempos de sanción), hay diferencias de rasterizado, geometría y contenido frente al HTML; Fuel estándar reserva 204 px frente a los 140 de la foto para no redimensionarse entre estados. El atajo global requiere compilación/QA Windows. Se han restaurado las etiquetas ES/EN en los pintores de esta continuación y corregido la demanda de señales del historial, mapa y duelo. Informe definitivo y SHAs en `~/orq/rep-1629-r2.md`; sin push, merge ni release.

<details><summary>Histórico del primer tramo de 7 widgets (sustituido por la continuación anterior)</summary>

Primer hito: Standings estándar del HTML (520 × 236 con ocho filas), dorsal junto al coche, solo el jugador iluminado, ancho independiente de nombres y caja estable entre fotos/avisos. Escena de ejemplo aprobada en el Workshop; se conserva el renderer productivo. Workshop vuelve visible en navegación; los gates de acceso y el catálogo de licencias siguen intactos.
Evidencia local `~/evidence/1629/standings/`: captura real del Workshop independiente 1× y comparación contra `shots/standings-hero.png`; rasterizado de texto Mac más grueso que HTML, aceptación visual pendiente. UI 301/301 (4 ignorados), Workshop Hub 6/6, navegación 10/10, build UI/Hub y Clippy `-D warnings` PASS con la feature existente `vantare-services/network`. Build Hub sin ella reproduce #1586. Suite Hub completa: 389 pasan, 47 fallan (GPUI fuera del hilo principal en Mac y storage sin binario); no se han ocultado ni debilitado. La captura del Hub muestra «Acceso sin verificar», también con `--demo`; falta vía local de acceso autorizado para QA. Hito Relative: 420×212 estándar, columnas/huecos fijos, jugador «Tú» centrado aunque falten vecinos; DTO del diseño aprobado y selección automática de ejemplo por widget en Hub. UI 302/302 (4 ignorados), build y Clippy PASS; captura y comparación en `~/evidence/1629/relative/`. Hito Delta: ampliado 768 px, caja fija entre referencias/pausa/invalidación, `transparentBackground` guardado y disponible en Studio, sin panel y con pista oscura/texto sombreado. UI 303/303 (4 ignorados), build y Clippy PASS; captura/comparación en `~/evidence/1629/delta/`. Hito Pedales: caja 96×160, pico de la última frenada (sin reloj), limitador con señal PitStatus solicitada, transparente con pistas oscuras/sombra y preferencia de pico en Studio. UI 306/306 (4 ignorados), build y Clippy PASS; captura/comparación en `~/evidence/1629/pedals/`. ABS/TC/FFB del HTML no están en el Snapshot actual y no se inventan. Hito Relative multiclase: caja 440×245 (±3) o 440×293 (±4), orden físico en pista y jugador centrado también con filtros de clase; no usa gaps del líder. Domain 160/160 y UI 306/306 (4 ignorados), build/Clippy PASS. Captura en `~/evidence/1629/multiclass-relative/`: distancias en curvas no disponibles, usa proximidad real en segundos. Hito Radar: panel Vantare 220×220, escala 8 px/m, clase por color y aviso lateral; frases persistidas con control Studio, mismo tamaño al ocultarlas. UI 307/307 (4 ignorados), Clippy y build PASS; captura normal/sin frases en `~/evidence/1629/radar/`. Velocidad de cierre no disponible en la proyección actual. Telemetría golden 9/9 PASS (482,58 s). Hito Telemetría de entrada: tira 600×84, historial real de 6 s, rellenos y cortes por canal, dos pedales por defecto y embrague opcional, sin mover geometría al perder datos. UI 309/309 (4 ignorados), Clippy/build PASS; ejemplo de 91 fotos observado y captura/comparación en `~/evidence/1629/input-telemetry/`. El régimen máximo y ABS no están en Snapshot: muestra RPM reales, sin umbral de cambio inventado. Pendientes los otros 10 widgets (Fuel, telemetría de pedales, Mapa, Tiempo, Banderas, Vuelta rápida, Cara a cara, Torre, Historial de delta y Daños con Cifras) y QA física Windows/OBS; ningún canal nuevo alcanzado.

Cierre parcial verificado 14/10/2026 20:42 UTC: 7 commits locales (uno por widget, arreglos consolidados). Domain 160/160, UI 312/312 (4 bancos ignorados), Workshop Hub 6/6, navegación beta 3/3, arquitectura Domain 1/1 y Hub 11/11, lifecycle Mac 10/10, telemetría golden 9/9, 456 huellas retiradas, build y Clippy `-D warnings` PASS. Suite Hub completa final: 390 pasan, 47 fallan, 4 ignorados: 45 necesitan GPUI en el hilo principal y 2 necesitan el binario storage; no se han debilitado tests. Revisión corrige el solape bandera/boxes en Standings y reinicia pico de frenada al cambiar fuente/sesión/coche, con regresión.

Revisión requerida conforme a AGENTS «no se sabe verificar» / «falta una dependencia aprobada»: Workshop Hub sigue exigiendo acceso verificado aun con `--demo`; falta una vía local autorizada para probarlo sin servicios reales ni modificar derechos. Snapshot solo aporta número de sanciones, no DT/stop & go; resolver el contrato con el orquestador. No se ha portado Banderas ni cambiado IPC/adapters. También faltan ABS/TC/FFB, régimen máximo para luces de cambio y previsión meteorológica del HTML; no se inventan señales. `CatalogAccess::Free` conserva Standings/Pedales y `LaunchV1` los cuatro gratis; no se ha cambiado esa política. Capturas del renderer productivo en Workshop independiente: comparación guardada, diferencia de rasterizado Mac y paridad alta/aceptación visual aún no certificadas. Captura Hub bloqueada, Studio manual y escenas Windows/OBS pendientes. Informe y SHAs finales en `~/orq/rep-1629.md` y `~/evidence/1629/entrega-parcial.md`; ese informe sustituye los SHAs de AVANCE previos a consolidar. Sin acceso a GitHub, sin push/PR/CI remota/merge/release, sin consultas ni cambios Plane/Notion por la excepción explícita.

</details>

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

#1629 continuación Mac: Historial de delta 760×192 (alto efectivo del HTML), traza por distancia, vuelta anterior y sectores disponibles; Hub reconstruye las muestras hasta el cursor. Banco local `hub/examples/widget-workshop.rs`, sin servicios reales ni derechos de producto. Evidencia `~/evidence/1629/delta-trace/`. Pendiente revisión global, sin push.

#1629 Mac: Telemetría de pedales pasa de 300×112 a tira 380×64, barras horizontales, volante y ángulo medido. 7 tests PASS; captura Hub en `~/evidence/1629/pedals-telemetry/`. ABS sigue ausente por falta de señal; sin dependencias nuevas.

#1629 Mac: Mapa 320×248 fijo, puntos por clase y transparencia guardada/editable en Studio; fixture Le Mans explícita, imposible reutilizarla como live. 5 tests PASS y captura Hub. Falta geometría productiva por circuito y señales de salida prevista de boxes; no se fabrican. Evidencia `~/evidence/1629/track-map/`.

#1629 Mac: Tiempo en pista vertical 132×440, franja y filas de medidas con tamaño fijo; 2 tests PASS y captura Hub. Pronóstico, tendencia térmica y hora del día no existen en Snapshot: se muestran guiones, sin recomendaciones inventadas; paridad de contenido pendiente de esas señales. Evidencia `~/evidence/1629/track-weather/`.

#1629 Mac: Banderas 340×88 y PenaltyKind neutral; DT/SG en placas, negra = descalificación, sin inferir el tipo desde el contador. 5 tests Domain + 6 UI PASS; capturas Hub DT/SG/DQ. Unión #1638 documentada en racing_flags/README.md; runtime/services/DTO intactos.

#1629 Mac: Vuelta rápida 480×104 con tipografía aprobada, mejora observada, coche/dorsal y sectores disponibles; conserva silencio inicial/expiración live. 5 tests PASS; fixture exacta da preview fija al Workshop. Captura Hub en `~/evidence/1629/fastest-lap/`.

#1629 Mac: Cara a cara 780×72; solo pareja jugador/rival seleccionado, últimas vueltas, diferencias de sector y alcance estimado desde ritmo observado. Se conserva el selector delante/detrás; ausencia de ritmo no extrapola. Tests Domain/UI PASS y captura Hub en `~/evidence/1629/head-to-head/`.

#1629 Mac: Torre 1400×56, 11 fichas por defecto (hasta 20), grupos de clase, código de piloto, batalla <1 s, boxes y movimiento/carrusel conservados. Domain/UI tests PASS; captura Hub completa en ventana QA 1800×900, `~/evidence/1629/broadcast-tower/`. El informe definitivo recoge los SHAs consolidados de Cara a cara y del resto de widgets.

#1629 Mac: Daños unifica Coche/Cifras 200×272; catálogo nuevo 17 entradas, ID numérico legado conservado para compatibilidad. Vista y tecla F1–F12 persistidas en Studio, ninguna por defecto; test de flanco de pulsación PASS. Windows consulta solo la tecla elegida y modificadores, con tarea cancelada al cerrar; validar en Windows. Snapshot solo aporta carrocería/suspensión agregadas: no se fabrican zonas, suspensión por rueda, pinchazo ni reparación. Capturas Hub de las dos vistas en `~/evidence/1629/car-damage-visual/`.

#1629 Mac: Fuel y stint conserva el Board y los medidores/filas del diseño Vantare; marco fijo por formato (230×128, 300×204, 460×440), suficiente para todas las líneas de los ocho estados de ejemplo. 15 pruebas PASS, incluida la regresión de geometría; captura Hub y comparación en `~/evidence/1629/fuel-strategy/`. La altura reserva los estados con avisos/servicio.

### #1655 / VANTA-82

2026-10-17 · R2 terminada por Codex gpt-6.1-sol, sin subagentes.
Rama `vantareapp/isa-1655-capturas`, PR #1675 OPEN fuera de draft a nightly.
Se integra `origin/nightly@32c3f3a14` mediante `1ba27cf51`, sin rebase ni
force-push. Conflicto del split de Cuenta resuelto en `view/account.rs`,
conservando el soporte de lote y el nuevo login. `fe4d7f6b0` añade su selector
EMAIL a la clave incremental, con regresión sin mutación del entorno.

H1: ui-quality sin salida mantiene IPC vivo y no usa caché; crea el mismo HWND
oculto/no activable fuera de todos los monitores y cierra por EOF. AnyWindowHandle
sincroniza tamaño sin prestar Hub. H2: el error de capturas a archivo con política
viva remite al banco IPC. H3: README exige DPI 96 / escalado 100 %. H4: marcador
configurable, caducidad y limpieza a 15 minutos bajo el mutex compartido.
El origen físico se conserva desde CreateWindowExW, sin SetWindowPlacement;
GetWindowRect antes de mostrar, NOACTIVATE/TOOLWINDOW, sin variable ni vigilante.

Validación tras el merge, código `fe4d7f6b0`: fmt, build Hub/ejemplo y Nextest
**41/41 focales PASS** (790 excluidos por filtro, sin ejecutar aquí toda la suite).
Banco real IPC/PrintWindow: **PASS**, 1 proceso/1 HWND, políticas1→2, dos PNG
1440×900 distintas, huérfano eliminado, EOF0 y cero incidencias de foco/monitor.
Rectángulo real **(-3488,0,-2048,900)**, no (184,-4).
Lote de Cuenta/Studio: **32,438 s**, una app/una ventana; incremental
**0,139 s**, una app/cero ventanas y mtimes intactos. Política IPC con salida
rechazada antes de abrir HWND. Calidad/462 pins y sintaxis Python PASS.
Compilaciones seriales, cola MIN_GB=0 y target1655; reintento sin sccache tras
una espera inicial de fmt terminada con -1, antes de ejecutar Cargo.
Los gates generales check/Clippy/Nextest/lifecycle se delegan a la **CI Windows
requerida**, autorizada por el orquestador. Su SHA y resultado vigente se verifican
y registran en issue/PR; no se equipara esta prueba focal con esos gates.

Resultados previos R2: Clippy producto workspace/all-targets -D warnings,
Nextest Hub/UI793/793 (10 skips), lifecycle13 y 34 focales PASS.
Perfil captura806/808 (dos fallos Track Map previos), Clippy captura18 avisos
previos de Análisis/Calendario, sin ocultar ni rebajar. No se repite aquí todo ese
perfil opcional. Telemetría local no repetida: el diff propio no cambia
runtime/domain/ipc/testdata; las modificaciones de esos crates proceden de nightly.
Skips anteriores: bancos manuales/opt-in. Sin dependencias nuevas.

Medidas completas conservadas: calendario54 PNG **1682,88→345,04 s**,
incremental4,05 s, procesos/HWND54/54→1/1→1/0; widgets236 PNG
**958,50→250,57 s**, incremental3,61 s, 236/236→1/1→1/0.
Antes = invocaciones individuales seguras, nunca el capturador visible.
290 ventanas individuales auditadas, cero foco/cruces; carga compartida.
Resize1280→1440→1280: cero píxeles distintos. Paridad individual/lote:
calendario23/54 exactas (23 máximo1, ocho controles con viewport antiguo);
widgets126/236 exactas (resto máximo2). Diferencias con referencias antiguas
explicadas, goldens intactos; aceptación visual pendiente.
Adaptador #1634 `calendar-batch-1634.patch` validado sobre97a0d7674;
ya integrado al sincronizar nightly2a580c458 (véase el cierre siguiente). Otros DPI no soportados/plataformas sin validar.

[Informe completo](../../analysis/1655-capturas.md).
Evidencia `C:/VantareServer/evidence/1655/round2-sync/`, R2 previa en
`round2/` y medidas originales en `1655/`; intentos fallidos conservados.
Plane VANTA-82 y Project Vantare se actualizan al cerrar la verificación de CI;
su lectura final vive en la issue junto con HEAD/remoto/checks.
Siguiente: revisión del orquestador y aceptación visual histórica.
Sin merge del PR a nightly, promoción ni release.

Verificación final: `f9c301668` obtuvo **5/5 checks verdes**, incluidos fmt,
check, Clippy -D warnings, Nextest workspace **1862/1862** (19 skips) y lifecycle.
SQL/E2E Marketing se omite en ese job por falta de Docker, sin cambios propios
en Marketing. Telemetría excluida por el clasificador (diff propio fuera de
runtime/domain/ipc/testdata). Mientras corría CI, nightly recibió #1684:
se incorpora también **1a8ddee33** con merge normal sin conflictos. Solo cambia
el guardado de login en services y su regresión/documentación; Hub/UI/vendor
de capturas permanecen iguales al código validado. La CI del nuevo SHA se
verifica otra vez en la issue antes de cerrar; sin modificar gates ni fixtures.

Cierre H1 de Cuenta: el banco `--capture` sin salida ni `--demo` conserva
también el perfil/módulos recibidos por IPC; no se sobrepone el perfil congelado.
Capturas con `--out`, lote y demo explícita mantienen sus fixtures. Regresión
con argumentos inyectados (sin tocar el entorno): banco, archivo, lote,
demo explícita y modo normal. **42/42 focales PASS** tras el ajuste
(`round2-sync/account-final-results.json`). GPUI/ventanas y su auditoría real
anterior no cambian. El SHA intermedio `aa2fa3465` obtuvo5/5checks verdes,
Nextest1863/1863 (19skips), Clippy/fmt/check/lifecycle; la CI del último ajuste
se registra en la issue/PR al terminar, sin reutilizar ese verde para otro SHA.

Sincronización posterior solicitada por el orquestador: merge de
`origin/nightly@2a580c458` (instalador #1600, telemetría #1679 y calendario
#1640), sin rebase ni force-push. El único conflicto, `calendar.rs`, se resuelve
con el módulo completo de nightly; no se restaura el calendario antiguo.
Se integra el adaptador previsto en `calendar/capture.rs`: cada entrada usa
`parameters.calendar`, con la variable antigua como fallback. Regresión sin
mutar el entorno para dos entradas con distinta vista, zona y estado.
README ya indica que el parche está aplicado, no hay que ejecutarlo otra vez.

H1: banco sin salida conserva IPC y perfil reales, sin caché ni foco; archivo
sigue usando el lote. H2: error de política congelada conservado. H3: DPI96/100%
operativo conservado. H4: ruta configurable y lease15min/limpieza conservados.
Las guardias de nacimiento oculto, CreateWindowExW, GetWindowRect y NOACTIVATE
no cambian. Los SHA/resultados anteriores corresponden a sus fuentes explícitas.
Nueva validación serial por cola (MIN_GB=0,1job), sin abrir ventanas visibles;
los gates generales se verifican de nuevo en CI Windows en el nuevo SHA.
Resultados finales/SHA/checks/Plane se releen y registran en issue/PR.
Evidencia de esta sincronización: `C:/VantareServer/evidence/1655/round2-nightly/`.

Cierre N1/N2/N3/N6 tras la review R2: el calendario de nightly conserva su API
nueva; no reaparecen `from_capture_name` ni el selector VIEW eliminado.
Un manifiesto de dos escenas r6 cambia los parámetros que no se serializan
en DemoData y verifica distintas vistas/zonas/estado incluso con igualdad de
la clave de reutilización. N2 usa una guarda de las raíces CLI del PID propio:
limpia al salir del lote y por error, valida el destino resuelto, preserva
rutas ajenas y comunica fallos. N3 retira el recibo temporal ante fallo de
escritura/rename; una prueba bloquea el destino real y exige conservarlo intacto.

Formato, build Hub/ejemplo y **44/44 focales PASS** (816 excluidos por filtro).
Lote real de `calendario-r6-mes` y `calendario-r6-serie`: **24,563 s**,
1app/1HWND, 833334píxeles distintos; incremental **0,114 s**, 1app/0HWND,
mtimes intactos y cero raíces QA restantes. Cero foco/cruces de monitor.
Banco live-IPC actual PASS:1app/1HWND, políticas1→2, dos PNG distintas,
huérfano retirado y EOF0. Sin ventanas visibles.
482directorios antiguos retirados de TEMP, ahora0. El borrado recursivo fue
rechazado por política automática; se movieron de forma reversible a
`round2-nightly/temporales-retirados/`, sin seguir enlaces ni tocar procesos
activos. Se conserva el inventario en `temp-cleanup.json`.
Los gates generales del nuevo SHA se verifican en CI Windows y sus resultados
finales se registran/releen en issue/PR. La prueba IPC fuerte sigue siendo
una regresión manual documentada de Windows (N4), ejecutada en esta entrega.

Durante la publicación de `c9442667d`, nightly avanza a `9c19b2993`
(Avisos de sesión #1660). Se incorpora también con merge normal sin conflictos,
conservando su feed/registro/widget; el escritor de avisos ya excluye
`capture.is_some()`. N1/N2/N3/N6 y H1–H4 no se sobrescriben. La CI del SHA
resultante sustituye a la ejecución de c944 cancelada por estar desactualizada.
