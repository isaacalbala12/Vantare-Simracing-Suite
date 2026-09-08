# Handoff vivo — plataforma, cuenta, releases y migración

## ISA-1015 — rendimiento de la base, medición junto a LMU (2026-09-08)

Estado vigente: Isaac añade rapidez de arranque, pantallas, interacción,
desplazamiento y restauración al objetivo de consumo. Misma apariencia y datos;
HUD/Studio excluidos. Protocolo ampliado en el informe y roadmap, todavía sin
tiempos de navegación validados ni cortes de producto. Medir contenido utilizable,
separar primera visita/revisita y latencia visible de señal DOM. Navegación con
foco foreground; el reposo background no certifica rapidez percibida.

Tres corridas completas con LMU, 60 s warmup +180 s configurados cada una,
terminadas y cierre limpio: CPU 0,4907/0,6322/0,5718 %, memoria privada
346,33/344,25/343,35 MiB. Media entre corridas 0,5649 % y 344,64 MiB;
CV muestral CPU 12,57 %, RAM 0,44 %. No A/A formal ni ahorro. Motor 3D
atribuido 0,06407/0,06046/0,06543 %, no porcentaje total de tarjeta.
215 instantes propios, 213 GPU válidos; dos intervalos GPU excluidos.
Home background estable, Auto3/full/raf40, lmu/stale/available/sourceHz0;
no prueba conducción. LMU/Edge/Racelab conservados, consumo separado.
Crudos y resumen en results/isa1015-base-live. Tooling a185b50f subido;
60/60 tests PASS, revisión ACCEPT hasta 4000b023 y regresión decimal revisada
por padre. Smoke3 positivo; validación negativa nativa pendiente.

CI a185b50f: primer intento falla en PTT conocido #812; única repetición del
run 34166748099 pasa Go y falla en presupuesto parse de OverlayFrame v2:
1,532 ms frente a 1,5 ms, 3235 PASS/1 FAIL, hallazgo #1019 en Project Vantare.
Roadmap ampliado y regenerado, 23+21 tests PASS. Fallo anterior separado en #1018;
workflow inerte #728 persiste. Sin cambios en esas superficies ni merge/release.
Siguiente acción: atribuir arranque/preparar navegación real antes de seleccionar
una issue de corte. El historial siguiente conserva evidencia anterior y sus
pendientes se sustituyen por este estado cuando corresponda.

Decisión vigente: Isaac autoriza continuar con LMU y Edge abiertos; sustituye la
pausa sin juego del 2026-09-07. BaseRoute/A0 mide solo procesos propios; el juego
tiene CSV de contexto separado y debe conservar PID/vida durante el intervalo.
No PresentMon/ETW adicional ni control del juego. Auto admite sourceHz variable,
pero exige política estable; ops:metrics etiqueta fuente sin confundir live/stale
con menú/carrera. GPU conserva instancias por adaptador/motor, sin convertir la
suma histórica en porcentaje total. 60/60 tests del banco PASS. Dos regresiones
iniciales y dos P2 de revisión reproducidos/corregidos (primera fuente tardía y
gamePresent inicial contradictorio). Parser/diff-check PASS; cierre de revisión
ACCEPT estático de 0974d1d6. Dos smokes cancelados antes de medir por Hub no
foreground (Racelab conservaba foco), app propia cerrada y LMU/Edge intactos.
Coexistencia ahora valida los hechos nativos existentes: visible/no minimizado y
foco estable, etiquetando background/foreground y oclusión unknown. Conserva
valid original del monitor (foreground), publica criterio propio en el intervalo
y mantiene SinJuego estricto. Revisión de este criterio ACCEPT y smoke3 PASS.

Isaac aprueba auditar y medir todo salvo HUD/OBS/widgets y Overlay Studio,
preservando apariencia, capacidades y contratos compartidos. Base verificada
`origin/nightly@d6d0992f8dbc800ccb6d75f60fffdc7c3d561da2`; rama
`vantareapp/isa-1015-base-app-performance`, worktree `C:/tmp/vantare-isa1015-base-app`.
Checkout principal y cambios previos preservados. Issue #1015, área plataforma,
estado in-progress; sin versión comprometida ni autorización de integración.

Inventarios estáticos UI/Core terminados en snapshots independientes limpios.
Tres prioridades para atribuir: Ops sin consumidor, detección repetida de build
con LMU ausente y recálculos de Carreras/calendario. No son ahorros medidos.
Informe/protocolo: `docs/analysis/ISA-1015-base-app-performance.md`.

Tooling local: build de diagnóstico desde entorno sin leer `.env`, preservación
de configuración/generado previo; SinJuego ya no cambia PATH ni consulta/limpia
ETW de PresentMon. Dos regresiones fallan contra la base; preparación inicial
44/44 PASS y revisión estática ACCEPT. Extensión base posterior: 51/51 PASS,
parser/diff-check PASS, `go test ./...` completo y build del monitor PASS.
Roadmap previo 23+21 tests PASS. A0/SinJuego sigue no publicable y exploratorio;
faltan validación Wails de la extensión, GPU por motor, control de mezcla y
lifecycle minimizado para baseline aceptable. Sin corte productivo.

Preflight real posterior: build frontend/typecheck y Go PASS, canal nightly
explícito (el script antes conservaba master). BuildChannel normalizado a
minúsculas, regresión de Nightly y flag Go; banco 44/44 PASS. Binario SHA-256
`53136de43fde4117aa96fa12512b865291ce19b0fe5bbe7c33b6fd586ea26943`.
Runtime aprobado 700201f9 verificado + handshake smoke PASS, junto al exe.
Inicio real con Owner autenticado/deviceOK, sin HUD/Studio, Auto nivel 2 y
effects full; cierre limpio. Evidencia local en `results/isa1015-preflight`.
Configs/WebView propios; auth y cachés siguen rutas productivas compartidas,
sin leer ni copiar credenciales. Escenario portable preparado, no instalación habitual.

Preparación comprometida y subida en `2994de6e`; PR borrador #1017 hacia nightly.
Contrato exacto de roadmap contra issue #1015 PASS. Preparación inicial e93c7845
subida con CI remoto PASS (run 34161443366, gates de promoción/bloqueantes y
GitGuardian). Código ampliado hasta 3abe2b16, seguido del cierre documental;
consultar PR #1017 para SHA/CI de esa entrega posterior. No equivale a integración.
Testing Center agent fix sigue fallando en pushes sin jobs/check-runs (run
34164832100 sobre 29efba6c y anteriores): coincide con la issue abierta #728.
Workflows sin cambios; no confundir PASS del gate de rama con todos los workflows
verdes ni corregir #728 dentro de esta campaña.

Primera ventana de medición: Isaac declaró PC disponible y cerró LMU/otra Vantare. La tarea de
widgets terminó su turno documental. Isaac exige mantener los cinco Edge sin
ventana: no cerrarlos. Registrar sus snapshots aparte y reutilizar el binario/WebView
preparados para explorar Inicio (A0/SinJuego/Forzar, 60 s warmup + 180 s captura,
hygieneForced=true, publishable=false). No descontar interferencia a partir de
snapshots ni convertir esta exploración en aceptación. Revisión independiente de
este primer paso conforme; CPU/RAM propias, GPU suma de motores solo diagnóstica.
Primera captura completada: run1/a0-20260907-231514.csv bajo
results/isa1015-base-home, 60 s warmup + 180 s configurados; 80 muestras,
cadencia media 2,252 s. CPU propia 0,1907 %, memoria privada 342,69 MiB,
working sets 533,13 MiB (suma con páginas compartidas), VRAM 74,23 MiB.
GPU suma motores 0,0836 solo diagnóstica. Exe/dist estables y cierre limpio.
Edge mismos cinco PID, 0,046875 s CPU en intervalo ampliado de 263,141 s;
no se descuenta interferencia. No A/A, no aceptación ni ahorro.
Perfil Go de 120 s inconcluso (GetMessage domina las muestras, sin delta CPU del
mismo intervalo). Perfil JS optimizado ilegible descartado; se construyó copia
ReadableFrontend separada, SHA 01f1157e, y se restauró el dist optimizado f1a69bb8.
Perfiles legibles de 60 s: script Inicio 0,138 s, Mes 0,196 s, Timeline 0,314 s;
cero tareas largas. Calendario backend real 11 series, Mes 42 celdas y Timeline
660 salidas. RAf del propio diagnóstico no es coste productivo ni FPS presentado.
No hay todavía evidencia suficiente para elegir un corte. Ver informe para hashes,
crudos, límites y métricas; no comparar esta build con el CSV optimizado.

Worker nativo: commit 116250cf revisado por el padre e incorporado como 7758085d;
solo dos archivos del monitor. `--surface hub` observa PID+título Vantare Hub,
visibilidad/foreground, minimizado y presencia; oclusión unknown, overlay intacto.
El banco integra `-BaseRoute home|month|timeline` sobre A0/SinJuego, observador
pasivo de ruta/viewport/Auto y metadatos base. Cambios intermedios o silencios
de performance superiores a 3 s invalidan; Forzar/SinJuego sigue no publicable.
La revisión encontró dos P2: ida/vuelta Mes-Timeline invisible al observar solo
aria-current, y apertura/cierre de HUD entre extremos. Ambos reproducidos con el
observador real en fixtures DOM/event-bus (RED), corregidos observando atributos
de selección y overlay:status (GREEN); las interacciones invalidan sin guardar
su contenido y se desmontan todos los listeners. Revisión independiente de cierre
ACCEPT estático sobre 3abe2b16: ambos P2 cerrados, sin nuevos P1/P2 en el diff.

Pausa runtime: LMU PID 29092 se reabrió a las 23:40:05 CEST, después de todas las
capturas/perfiles y del cierre del diagnóstico (23:34:33). La tarea de widgets
está activa. No cerrar LMU ni los cinco Edge. Se preguntó disponibilidad de nuevo;
guard BaseRoute comprobado con LMU real: rechaza antes de lanzar Vantare.
Esta pausa fue sustituida por la autorización anterior. Siguiente con LMU abierto: smoke Wails positivo y negativo del
monitor/observador, una corrida completa, después A/A y control GPU/mezcla.
El run1 no recibe garantías retroactivas. Los cinco experimentos sin mejora no
han empezado ni se reinicia presupuesto. Los fallos CI históricos de la base
siguen separados; SQLite pasó en esta suite local. Sin merge, promoción ni release.

## ISA-1022 — nombre Calendario (2026-09-08)

Isaac solicita renombrar la pestaña Carreras a Calendario. Base nightly d6d0992f,
rama vantareapp/isa-1022-calendar-name, worktree C:/tmp/vantare-isa1022-calendar-name.
Cambio de texto en 16 catálogos (shell/races/home/strategy, ES/EN/PT/IT) y etiqueta
legacy de navegación; roadmap actualizado y generado. Se mantienen claves, rutas,
preferencias, vistas y datos. No se sustituyen menciones genéricas a competiciones.
Sin dependencia de los candidatos de rendimiento #1017/#1021 ni cambios HUD/Studio.
Dos expectativas existentes de tests actualizadas al nombre nuevo, sin alterar
las aserciones de navegación. 3236/3236 tests frontend, 415 archivos PASS;
typecheck/build/lint y 23+21 tests de roadmap PASS. Diff revisado y limpio.
Primera suite falló por el nombre anterior del botón; resultado conservado junto
al PASS final en results/isa1022-checks. AbortError de teardown y aviso de chunks
grandes sin fallo final. Sin Go modificado; no se repite Go local.
22 archivos modificados, ninguno creado/movido. Entrega draft; CI remoto y
verificación Wails pendientes. Ver #1022 para SHA/PR/CI actualizados.
Manual: revisar pestaña/títulos y enlaces de Inicio/Strategy en los cuatro idiomas.
Sin merge, promoción ni release.

## ISA-1055 — avisos nativos y permisos (2026-09-08)

C6c reutiliza notify.Service/SystemEnabled/autorización/minimizado y comprueba
acceso nativo al seguir y emitir recordatorio. Roles separados de planes, estado
active/grace; Free/bloqueado/desconocido no concede acceso. Payload compartido
conservado para autorizados. Gate adelantado al cálculo/dedupe para no consumir
avisos antes de validar cuenta; regresión por canales RED. Build y módulos
Calendar/license/notify/app y full Go PASS; 35 focales UI/i18n, roadmap23+21
y build PASS. Fullfrontend3240PASS/1timeoutPedals #1025; review ACCEPTa7454887. Base C6b a9a17cf3, rama vantareapp/isa-1055-calendar-native-reminders.
Informe ISA-1055 en docs/analysis; diferencia gate UI legado/nativo documentada.
C9 candidato #1054 aceptado; falta validación conjunta Wails y A/A–A/B. Sin merge/release.

## ISA-1050 — confirmación de seguimiento (2026-09-08)

C6b: resultado correlacionado tras persistencia, UI pendiente/sin doble clic,
éxito confirmado y error recuperable. Free bloqueado como antes. 94 focales
frontend, módulo app completo, build/tipos/lint/roadmap PASS. Full frontend
3240 PASS, un timeout TrackMap #1025. Review P2 de expectativas event-only
reproducido (7 RED) y corregido; review ACCEPT 81ffddfa y full Go PASS.
Base C6a e9dc8ef9; C6a aceptado y full Go PASS, candidato #1051. Rama
vantareapp/isa-1050-calendar-follow-confirmation. Informe ISA-1050 en docs/analysis.
Quedan C6c permisos/avisos nativos, C9, Wails y rendimiento. Sin merge/release.

## ISA-1049 — seguimiento atómico ante error (2026-09-08)

C6a de #1027: cuatro operaciones restauran memoria/Updated al fallar escritura;
el reintento persiste realmente. Cuatro regresiones RED→GREEN, módulo PASS.
Base C5 9f3c5447, rama vantareapp/isa-1049-calendar-follow-persistence.
Build/full Go/roadmap/review pendientes. Informe ISA-1049 en docs/analysis.
C8 aceptado en #1048; C7 #1047 CI verde. C5 #1045 CI roja por parser p99 #1019.
Quedan C6b UI/permisos, C9, Wails y A/A–A/B. Sin merge o release.

## ISA-1027 / ISA-1029 — Calendario, plan aprobado y primer corte (2026-09-08)

Isaac aprobó ejecutar el plan `docs/analysis/ISA-1027-calendar-plan.md`.
El expediente #1027 recoge ocho hallazgos y sus reproducciones; no es una
certificación visual Wails. HUD/OBS/Studio están excluidos de cambios.

Primer corte #1029: `vantareapp/isa-1029-calendar-retention`, worktree
`C:/tmp/vantare-isa1029-calendar-retention`, base nightly `d6d0992f`.
Regresiones RED verificadas para fallo remoto, proyecto remoto vacío,
publicación anterior/futura, reinicio, pérdida de vigencia y fallo de escritura.
GREEN: `go test ./internal/calendar/...` PASS. El documento guarda metadatos
aditivos, conserva horario/seguimientos al fallar red o arrancar y restaura la
memoria anterior si no puede persistir. Los eventos compartidos se conservan.
Build frontend PASS para el embed; `go test ./...` PASS y roadmap 23+21 PASS.
Primera revisión independiente: dos P2 reproducidos y corregidos (orden de
publicaciones de la misma semana mediante PublishedAt y protección de archivos
legacy ante publicación futura). Módulo Calendar y `go test ./...` GREEN;
revisión independiente final 01a6b613 ACCEPT para C2, sin P1/P2 nuevos;
ver #1029 para la evidencia de cierre, commit, PR y CI exactos.

Pendiente: propagar vigencia por normalización/frontend (C3), errores/acuse (C4),
recordatorios (C5/C6), fechas/vistas/detalle (C7–C9), Wails representativo (C1) y
banco A/A–A/B (C10/C11). #1020/#1022/#1024 son candidatos separados que no se
presuponen integrados. Sin porcentaje de ahorro global ni validación de conducción.
Sin merge, promoción o release; el checkout principal y LMU/Edge se preservan.

## ISA-1039 — recordatorios de series (2026-09-08)

C5 de #1027 expande solo la ventana de avisos de las series seguidas y corrige
truncamiento de minutos. RED inicial y de review reproducidos; módulo Calendar GREEN.
Poda dedupe de ocurrencias iniciadas, conserva seguimiento individual, sin tocar HUD/Studio.
Rama vantareapp/isa-1039-calendar-series-reminders ahora sobre C2 e9321068,
dependencia necesaria para vigencia. Rebase local sin integración de nightly;
documentos de ambos cortes conservados y JSON regenerado. Build y roadmap PASS;
Go completo final PASS y review 6094c44e ACCEPT. Informe ISA-1039 en docs/analysis.
C2/C3/C4a/C4b son candidatos #1031/#1034/#1036/#1040, sin integrar. C6–C11,
recorrido Wails y banco de rendimiento continúan pendientes. Sin merge ni release.

## ISA-1052 — detalle y selección (2026-09-08)

C9: sesiones estimadas marcadas con ~ y explicación; selección ligada a serie,
instante y destino, validada con el motor/publicación actual. Nuevo target limpia
filtro/selección; no pierde horas históricas válidas. RED 7+2, focal133PASS/2skips,
build/tipos/lint/roadmap PASS; review ACCEPT3c85e2b8. Full frontend3276PASS,
2skips y4timeouts externos (#1025). Base C8 ec3a75f5, rama
vantareapp/isa-1052-calendar-detail-selection. Informe ISA-1052 en docs/analysis.
C6a/C6b aceptados, full Go PASS, candidatos #1051/#1053; C6c y Wails/rendimiento
pendientes. No merge/release, HUD/Studio intactos.

## ISA-1046 — clasificación de Mes (2026-09-08)

C8 de #1027 evita que las ocurrencias generadas aparezcan como especiales.
Identidad/fuente exacta y todas las series publicadas, sin usar título/filtro activo.
RED tres fallos; GREEN siete portables y contraste opt-in con 4596 eventos Go,
ocho PASS. Sin mutar documento ni tocar HUD/Studio/CSS. Base C7 411b5538;
C7 aceptado en review y candidato #1047, no integrado. Rama
vantareapp/isa-1046-calendar-month-classification. Review halló P2 Mes → Día:
cuatro regresiones RED, corregidas; especiales presentes con/sin series y sin
duplicar ocurrencias. 113 focales PASS, build/tipos/lint/roadmap PASS; review ACCEPT 6a1daf60.
Suite completa 3269 PASS, 2 skips, 3 FAIL fuera de Calendario: parser p99
(#1019), Relative Crystal 30 s y Pedals Redline missing 20 s (#1025).
Informe en docs/analysis/ISA-1046-calendar-month-classification.md.
Continúan C6/C9, Wails y medición A/A–A/B; sin merge ni release.

## ISA-1044 — días locales y slots (2026-09-08)

C7 de #1027: fechas civiles con setDate; cantidad por ventana real en vez de ocho;
hora repetida conserva instante y se identifica con UTC. Base C3 317ff133,
sin integración. Rama vantareapp/isa-1044-calendar-local-days. RED seis fallos,
focal 124 PASS y matriz UTC/Madrid/Nueva York. Checks finales/review en curso.
Informe docs/analysis/ISA-1044-calendar-local-days.md. Sin CSS, HUD o Studio.
C2/C3/C4a/C4b/C5 candidatos #1031/#1034/#1036/#1040/#1045; quedan C6, C8/C9,
Wails y rendimiento A/A–A/B. No merge ni release.

## ISA-1032 — vigencia en Inicio y Calendario (2026-09-08)

Corte C3 del plan #1027 aprobado por Isaac, dependiente de #1029 / PR #1031.
Rama `vantareapp/isa-1032-calendar-validity`, worktree
`C:/tmp/vantare-isa1032-calendar-validity`, base nightly `d6d0992f`.
El corte conserva schedule en el store y limita previews/motor a [inicio, fin).
Documentos antiguos sin vigencia verificable no producen nuevas salidas.
Regresión con el seed real: seis casos RED→GREEN (metadatos, desconocido,
caducado, preview inválido, cinco vistas y detalle). 112 focales PASS;
typecheck/lint/build PASS. Suite completa 3243 PASS/2 FAIL: timeouts 20 s en
PedalsRedline excluido, antecedente #1025; no se declara verde ni se debilita.
Go completo y roadmap 23+21 PASS. Review inicial P2 de conteo mensual en día
parcialmente vigente: RED 12 frente a 3; GREEN 3. Revisión final fc12ceee ACCEPT
para C3 sin nuevos P1/P2; build final PASS.
evidencia final en docs/analysis/ISA-1032-calendar-validity.md y #1032.

No integrar este frontend antes del backend #1031: la nightly base aún no emite
el metadato. C4 aporta estados visibles/acuse; C5–C11 siguen pendientes.
F4/F5/F6 de la auditoría no se declaran resueltos aquí. Sin Wails real ni ahorro
global, HUD/Studio intactos, sin merge o release. La PR #1031 tiene revisión
independiente C2 ACCEPT y Go/build locales PASS; CI remoto se verifica aparte.

### Seguimiento de review C4b (2026-09-08)

ISA-1035 añade snapshot local del estado de refresh para el shell que se monta
después del arranque. No repite red. Regresión RED/GREEN del puente PASS;
revisión 749d7761 ACCEPT y Go completo PASS. Continúa en el mismo corte C4a,
sin integración; C4b ISA-1037 consume calendar:refresh:status:get/status.

## ISA-1035 — resultado de actualización de Calendario (2026-09-08)

C4a del plan #1027 aprobado. Rama `vantareapp/isa-1035-calendar-refresh-result`,
worktree `C:/tmp/vantare-isa1035-calendar-refresh-result`, base nightly d6d0992f.
El puente anuncia `calendar:refresh:started`, luego `calendar:loaded` si hay éxito
y `calendar:refresh:result` con `{ok:true|false}`. No expone detalles privados del
error. El arranque y la acción manual usan el mismo recorrido, serializado y con
contexto de cierre para la consulta remota. Tests de éxito/fallo RED→GREEN.
Bridge, build embed, Go completo y roadmap 23+21 PASS. Review independiente
b15c7f76 ACCEPT para C4a sin P1/P2. Evidencia docs/analysis/ISA-1035-calendar-refresh-result.md.

La conservación depende de C2 #1029/PR #1031; C3 #1032/PR #1034 limita vigencia.
Ambos tienen review independiente ACCEPT y checks locales focales/build/Go PASS;
#1031 CI falla en SQLite conocido #811 y la suite frontend de C3 tiene dos
timeouts Pedals conocidos #1025. No afirmar conjunto verde. C4b añade la UI de
estos estados; C1/C5–C11 pendientes. HUD/Studio, LMU y Edge intactos; sin merge/release.

## ISA-1037 — estados de Calendario (2026-09-08)

C4b de #1027: estados independientes del documento, refresh de una petición,
sin éxito anticipado y aviso de vigencia en la descripción existente. Cuatro
idiomas, sin CSS. Depende de #1029/#1032/#1035, todos candidatos sin integrar.
Rama vantareapp/isa-1037-calendar-status-ui desde nightly d6d0992f.
RED inicial siete fallos; review detectó dos P2, reproducidos y corregidos.
GREEN final 70 focales, build/typecheck/lint y roadmap 23+21 PASS; review 7a84c268
ACCEPT. Suite completa no verde: cuatro timeouts de overlays, i18n corregido;
Go completo falla deuda SQLite #708. C4a 749d7761 añade snapshot local para
recuperar resultado de arranque sin otra descarga. Evidencia y límites en
docs/analysis/ISA-1037-calendar-status-ui.md. Sin validación Wails conjunta todavía.
Pendientes del plan: recordatorios/confirmación de seguimiento, DST y slots,
clasificación de Mes, detalle, Wails real y medición A/A antes de más optimización.
No se toca HUD/Studio ni el checkout principal; no merge ni release.

## ISA-1011 — runtime de release (2026-09-07)

Nightly.15 no se publicó: el segundo intento 34062671599 pasó tests pero
falló en trust del runtime por toolchain rolling. Isaac autoriza corregirlo.
Se conserva el digest 700201f9 y se verifica la unidad publicada de Nightly.14
antes de empaquetarla. Descarga, extracción, verificación y smoke locales PASS.
Detalle en docs/analysis/ISA-1011-runtime-release.md; CI y release pendientes
en #1011/#1009. Sin cambio de código Go, secretos, dependencias ni master.

## ISA-1009 — publicación Nightly.15 autorizada (2026-09-06)

Isaac autoriza la release y la integración de Chromium (#1008, ac617491).
Se prepara el manifiesto v0.1.0.7-nightly.15 y su resumen del conjunto
#1001/#1003/#1006. E20 permanece opt-in y no se certifica CPU inferior al 2%.
Rama vantareapp/isa-1009-nightly-15; base ac617491. Publicar únicamente
mediante release.yml desde nightly, con SHA exacto, gates y seis artefactos
verificados. Estado final y enlace de ejecución en la issue #1009.
No hay promoción a testers/master. No se modifica el checkout principal.

## ISA-1007 — nueva build nightly y Chromium requerido (2026-09-06)

Build autorizada desde59185071; run34049646223 falló por Chromium ausente en
las pruebas visuales. Se prepara el mismo paso bloqueante de instalación que
usa branch-channel-gates, sin excluir tests ni cambiar permisos o secretos.
Regresión RED/GREEN y contrato roadmap. Rama vantareapp/isa-1007-nightly-build,
worktree C:/tmp/vantare-isa1007. Integración del fix y relanzamiento pendientes;
publicación de canal consultada al usuario, no asumida. Sin artefactos aún.
## ISA-900 — preferencias y prueba de notificaciones

- Rama aislada `vantareapp/isa-900-reparar-preferencias-notificaciones`, creada
  desde `nightly@1c45cc82` y rebasada de nuevo para integración sobre
  `origin/nightly@36ec5fdd7e9914638778ba946373b43a52fd3749`.
- Command Orbit ya aplica `updatesMuted` al pill del actualizador: silenciarlo
  lo oculta sin sustituir ni inventar el estado real del updater.
- Ajustes → Aplicación recupera la prueba nativa de Windows y expone envío,
  aceptación del backend o error. «Aceptado» no se presenta como prueba de que
  Windows haya mostrado visualmente el toast.
- Decisión de producto: Spotter sigue siendo overlay/audio de carrera y queda
  fuera de los canales de notificación, del centro y del historial.
- Código rebasado en `2096fcef`; TDD focal 35/35, suite frontend 3.191/3.191,
  typecheck, build, lint focal y contratos de roadmap 23/23 + 21/21 en verde.
  El lint global conserva un error ajeno en
  `car-damage-numbers-view-model-v2.ts:93`. El PR draft #907 es la única ruta
  hacia `nightly`. La revisión adversarial autorizada para integración concluye
  APPROVE con P0=0, P1=0 y P2=0; como riesgo residual quedan el smoke visual del
  toast en Wails y que la regresión del mute prueba la política pura, no una
  shell completa. Los checks remotos anteriores quedaron obsoletos al rebase y
  deben repetirse sobre el nuevo HEAD antes del merge. No hay aún integración
  en `nightly`, promoción posterior, release ni anuncio.

## ISA-843 — columnas de Próximas alineadas

- Rama aislada `vantareapp/isa-843-centrar-columnas-proximas`, basada en
  `origin/nightly@8a90c3a7837166ffec6943c839f7cb31cbf11b31`.
- En Carreras → Próximas, hora, duración/setup y licencia usan tracks estables
  y centran su contenido. Ya no cambian de eje según 20/30/60 minutos ni según
  Bronze/Silver/Gold.
- El harness real de Carreras midió nueve filas: antes la hora variaba entre
  673,06 y 692,39 px; después todas coinciden en 641 px. A 768 × 700, las nueve
  filas mantienen los tres ejes y `overflowX = 0`.
- Evidencia local: test focal 18/18, suite frontend 385 archivos/2.953 tests,
  typecheck, build, lint focal y design-system PASS. El harness visual pasa en
  1920 × 1080 y 1920 × 900 con gates de ejes compartidos y cero desbordamiento
  de fila; la inspección colaborativa adicional pasa a 768 × 700.
- Segunda pasada tras feedback de Isaac: los chips comparten ancho y el track
  de licencia gana aire propio. En 640/768 × 700, el mínimo visible entre
  duración y licencia sube de 18,5 a 26,31 px; centros y anchos no varían entre
  filas y `overflowX` continúa en cero. El harness impide volver a menos de
  32 px sin escalar, variar el ancho del chip o desalinear un eje.
- Implementación inicial en `a99c3f46`; segunda pasada incluida en el HEAD de
  la PR #846 hacia `nightly`. Isaac aprobó expresamente la promoción el
  2026-08-26; la issue #843 conserva el SHA integrado y los checks remotos del
  cierre. Esta autorización no alcanza `testers`, `master` ni una release.

## Decisión comercial vigente — ISA-315

- Hito de agosto: Overlay Studio V1 estable en `testers` antes del 2026-08-31.
  No equivale a promoción a `master` ni release Stable de toda Vantare.
- La migración de Vantare V2 a la raíz bloquea el lanzamiento completo, no la
  estabilización de Overlay en Testers. Se ejecuta y reverifica después del
  hito de agosto.
- Ventana comercial objetivo: 2026-09-22 a 2026-09-30, por invitación y
  cohortes. Overlay Studio V1 es la propuesta principal; Engineer, Strategy y
  Analysis deben mostrarse claramente como Beta/Preview mientras continúan.
- La venta sigue **NO-GO** hasta cerrar raíz, compra/licencia end-to-end,
  artefactos, updater/rollback, soporte y la decisión pendiente sobre firma.
  El plan no autoriza dinero real, producción, publicación ni comunicación.
- Plan canónico y gates:
  `docs/overlays-studio/overlay-studio-v1-commercial-launch-plan.md`.

## Autoridad y lectura

- `docs/vantare-program/README.md`, `product-contract.md` y
  `execution-policy.md`.
- Billing: issue/proyecto de GitHub, `docs/licensing-auth-architecture.md` y auditoría
  Polar/Supabase vigente.
- Roadmap publico: `docs/roadmap/plan.md`; Discord: `docs/discord-communications.md` y workflows actuales.
- Root: informe ISA-14 y su matriz de worktrees/rutas.
- La issue activa y su plan prevalecen sobre releases históricas.

## Estado

- ISA-246/BIL-N05 está integrado en `nightly@55fba3d`: el callback OAuth
  restaura la sesión del WebView y permite revalidar sin reiniciar.
- ISA-247/BIL-10C está en implementación aislada: roles operativos, leases,
  retiro legacy controlado, UI separada y herramienta administrativa. Ningún
  apply remoto se ejecuta desde la rama.
- Billing: BIL-01..BIL-07 ya estaban en `nightly`; este corte BIL-N02 incorpora
  BIL-08 tras validación acumulativa. Venta pública continúa **NO-GO**.
- Account/Profile: issue histórica ISA-12; proyecto pendiente.
- Calendar/Settings/Installer/Roadmap/Migración: proyecto o reconciliación
  pendientes. ISA-845 tiene implementados el parser del mensaje Discord
  oficial, seed de 2026-08-25, revisión owner y lector REST separado; su vía
  de integración inicial es el PR #881 contra nightly. El runtime local se
  validó con el canal configurado: 1 candidato de 11 series en la bandeja
  instalada y la tarea diaria terminó con código 0; no hay auto-publicación,
  secretos en Desktop, deploy, testers/master ni release.
- Root migration: auditoría ISA-14, bloqueada por worktrees activos.
- `nightly` y `testers` existen; el flujo vigente es issue → `nightly` →
  `testers` → `master`.
- Base ISA-212: `nightly@b8ffd7c6c824f17ebcc09a5e44bf4ac12bafb7c5`.
- Promoción vigente: ISA-212/BIL-N02 hacia `nightly`; `testers` y `master`
  quedan fuera.

## Cuenta

Perfil local, avatar procesado, Google OAuth/email magic link, modo gratuito sin
login, borrado local/remoto separado, un dispositivo activo, sesión offline
hasta expiración y secretos en almacenamiento protegido. SR/DR requiere
auditoría clean-room de DoX/SimHub y fuente LMU+Steam.

## Calendario

Feed oficial versionado/firmado. Isaac pega RaceControl semanal y un agente lo
estructura con validación. UTC interno; zona local visible. Carreras guardadas,
recordatorios, Launcher/Overlay/Strategy y nota. Servicio ligero solo con
recordatorios futuros y permiso. ISA-845 añade un lector Discord restringido a
  guild/canal (con autor o webhook opcionales) que deja candidatos locales para
  revisión owner. El comando admite ejecución única diaria y guarda el token
  fuera del repositorio en el almacén protegido del usuario; la tarea local
  está registrada a las 03:00 con la misma cuenta interactiva;
publicar sigue pasando por las RPC existentes y la comprobación server-side.

## Ajustes

General, Apariencia, Idioma/región, Cuenta/licencia, Launcher, Overlays,
Telemetría, Engineer/audio/voz, Strategy, Calendario, Hotkeys, Privacidad,
Actualizaciones, Diagnóstico y Acerca de. Scope global/perfil explícito;
import/export sin secretos; reset no borra datos sin selección.

ISA-841 se implementó en la rama aislada
`vantareapp/isa-841-zoom-global-interfaz` y se rebasó el 2026-08-28 sobre
`nightly@d9909aef4b9f2de2b3e61ed79a3a0fd98a91b73c`; PR #847 es su única ruta de
integración. Ajustes → Aplicación ofrece zoom global
80/90/100/110/125/150%, restablecimiento y atajos Ctrl +/−/0. La preferencia
local se compone con el zoom responsive automático y, cuando el suelo de la
shell no cabe al ampliar, conserva acceso mediante desplazamiento interno.
La suite frontend completa previa al rebase pasó 2.963/2.963, además de build,
typecheck, lint focal e i18n; el lint global conservó un error ajeno a la rama
(`car-damage-numbers-view-model-v2.ts:93`, `_damage` sin usar).
La build Wails de producción configurada se abrió desde el binario de la rama
y permitió probar la interacción real. En un monitor 1920×1080, Ajustes →
Aplicación encaja sin scroll entre 80% y 125%; a 150% no hay recorte horizontal
y el contenido inferior sigue accesible mediante scroll vertical. La issue
#841 registra el SHA integrado y los gates remotos vigentes; esta autorización
no alcanza `testers`, `master` ni una release.

ISA-908 extiende el mismo control en la rama aislada
`vantareapp/isa-908-zoom-control-rueda`, nacida de
`nightly@1c45cc827e47976ed41e1f28463529c04579e806`. Ctrl/Cmd + rueda arriba o
abajo recorre los mismos seis pasos y bloquea el zoom nativo de WebView; la
rueda sin modificador conserva su scroll normal. Los deltas pequeños de
trackpad se acumulan hasta 50 px y se separan tras 180 ms de reposo. Los tests
del hook cubren dirección, límites, rueda tradicional, trackpad, persistencia
y limpieza del listener. La issue #908 y su PR registran la evidencia vigente;
no hay integración, promoción ni release autorizadas para este corte.

## Roadmap/Discord

Toda issue publicable incluye `Resumen público`. Flujo: Idea → Siguiente
actualización → En desarrollo → Testing → Por lanzar → Publicado. Progreso
ponderado, digest diario, tarjeta HTML y texto accesible. Releases, crisis y
anuncios comerciales requieren aprobación.

ISA-860 implementa en la rama aislada
`vantareapp/isa-860-roadmap-contract`, nacida de `nightly@1d3ab03`, el contrato auditable preparado para bloqueo:
Forms `required`/`not-required`, IDs semanticos, JSON derivado desde la base,
allowlist cerrada para exenciones, excepcion exacta del bot y `CODEOWNERS`.
Las labels remotas ya existen, pero el contrato no esta integrado ni activo en
la rama predeterminada. Quedan pendientes review, PR/CI, promocion autorizada a
`nightly`, paso posterior por `testers`/`master` y configurar Code Owner review
y aprobacion del ultimo push. El workflow queda en `audit` hasta inventariar y
retroclasificar las PR vivas y separar la identidad autora de la identidad
Code Owner; activar review con la unica cuenta actual bloquearia sus propias
PR. ISA-862 registra esa activacion posterior sin grandfather reutilizable.
No hay auto-merge ni credencial nueva del bot.
Evidencia local: contrato 21/21, topologia 44/44, digest 23/23 y discovers
121/121 + 108/108 en verde; `roadmap_digest.py --check` y `git diff --check`
sin errores. La revision independiente xhigh concluyo GO con P0=0, P1=0 y
P2=0 para commit/push en modo `audit`.

## Releases

Web/GitHub para instalador; app para updater. Stable para todos, Nightly para
Pro Plus y Testers para Pro Plus/Launch. Instalación atómica, rollback y
desinstalación granular. Sin firma inicial: checksums/manifests, aviso
SmartScreen y guía; nunca bypass. Master produce versión pública.

## Migración

`vantare-v2` será raíz del mismo repo cuando se cierren grandes worktrees.
Archivar primero, preservar historia/secrets, simular y probar rollback. Borrado
masivo requiere Isaac. La migración de ramas materializa issue → Nightly →
Testers → Master y actualiza CI/webhooks/updater.

## Billing

Autoridad y contrato:

- Polar posee productos, precios, customers comerciales, orders, subscriptions
  y refunds. Supabase mantiene identidad y almacenamiento operacional.
- Pro: 4,99 EUR/mes. Pro Plus: 9,99 EUR/mes. Launch Edition: 30 EUR una vez.
- Recuperación de pago: máximo 72 horas sin extender `paidThrough`; después se
  degrada a gratuito. La credencial offline de suscripción vence en la fecha
  firmada; Launch conserva su alcance perpetuo.
- Un refund total atribuible revoca únicamente su grant; refunds parciales,
  pendientes, fallidos o ambiguos no revocan acceso automáticamente.

Estado BIL-01..BIL-08:

- Inbox durable antes de efectos, efectos idempotentes, quarantine/replay y
  límites de request.
- Mapping por entorno, checkout-attempt server-only, portal allowlisted y
  separación estricta sandbox/production.
- Intento OAuth ligado a provider/state, sesión exclusiva en Credential Manager,
  rotación protegida y logout request/ack fail-closed.
- Grants independientes, reconciliación monotónica de Customer State y ledger
  atribuible de orders/refunds.
- Runbooks y evidencia: `docs/billing/`, `docs/analysis/isa-69-*`,
  `docs/analysis/isa-70-*`, `docs/analysis/isa-71-*`, `docs/analysis/isa-72-*`
  y `docs/analysis/isa-88-*`.
- Gates locales: PostgreSQL desechable completo (clean, legacy upgrade,
  concurrency y restore), Deno 164/164, frontend focal 87/87, frontend global
  311 archivos/2.128 tests, build, lint focal, Go global, x20 y race detector
  focal. El workflow productivo es exclusivamente manual, protegido por
  environment.
- BIL-08 añade una credencial offline Ed25519 ligada a UUID y dispositivo. Pro
  y canales temporales vencen por `paidThrough`; Launch v1 conserva únicamente
  su scope adquirido y Testers. Legacy, edición, copia, clock rollback y
  rechazos online fallan cerrados.
- El emisor `license-credential` entra en la allowlist protegida; la clave
  privada existe solo como secreto server-side y el build incorpora únicamente
  claves públicas versionadas. No se ha configurado ni desplegado nada remoto.
- Evidencia BIL-08 sobre la composición final: frontend 311/311 archivos y
  2.128/2.128 tests, build y lint focal; Deno 173/173, formato, check y guard de
  deploy; Go focal x20, vet, race focal, Credential Manager real y fixture
  WebCrypto→Go PASS. La suite Go global deja visible únicamente la deuda
  heredada de Ajustes ISA-118, reproducida también en el `nightly` base; todos
  los paquetes BIL-08 pasan.

BIL-09 / ISA-74 añade un contrato transversal sin cambiar lógica productiva:
catálogo sandbox completo, matriz lifecycle versionada, Customer State,
beneficios, compras múltiples y refunds en orden inverso. Los desconocidos
fallan cerrados y la segunda ejecución converge. La evidencia y la tabla
evento/precondición/resultado viven en
`docs/billing/bil-09-lifecycle-matrix.md`.

BIL-10 / ISA-75 hace operable el runtime sin incorporar un proveedor nuevo:
señales sanitizadas del webhook, snapshot SQL agregado exclusivo de
`service_role`, alertas deduplicadas y runbook completo. IDs originales,
payloads, PII y errores libres quedan fuera. Replay, reparación, deploy y
producción siguen necesitando autorización. Autoridad:
`docs/billing/bil-10-observability-runbook.md`.

BIL-10C / ISA-247 separa acceso interno de comercio. Tester, Tester Nightly y
Owner viven en `operational_access_assignments`; el emisor limita sus leases a
14 días, 72 horas y 30 días respectivamente. Los grants legacy no participan
en credenciales y su retiro es por cuenta, reversible mediante backup,
append-only y dry-run por defecto. Autoridad:
`docs/billing/bil-10c-operational-access-runbook.md`.

El inbox durable queda particionado por entorno. Las filas anteriores al corte
se conservan como `unclassified`, visibles para operación pero excluidas de las
métricas de sandbox y producción. Los gates frescos pasan con 181/181 tests
Deno y PostgreSQL clean/upgrade/restore, incluidas 20 pruebas de observabilidad
por ruta.

El despliegue futuro debe aplicar migración antes que Edge. Un overload
server-only mantiene la versión anterior sin perder eventos y los clasifica
como `unclassified`; se retirará solo cuando el runtime nuevo esté confirmado.

No existe autorización para desplegar migraciones, mutar Polar/Supabase, cobrar,
reembolsar o habilitar venta. Los gates monetarios siguen pendientes.

## Testing Center

- ISA-346 y ISA-349 están integradas únicamente en
  `nightly@c394e71f0945e26ac02ccb7360ffffcd8955c157`: diseño privado de hasta
  diez capturas y contrato puro equivalente Go/TypeScript.
- ISA-350 completa en rama aislada la persistencia local: migración aditiva,
  bucket privado, policy INSERT exact-path, batches/slots, outbox durable y RPCs
  prepare/finalize/submit aditivo. El rollback exige limpieza física previa por
  Storage API/S3 y ejecuta la fase PostgreSQL de forma atómica y fail-closed.
- Evidencia fresca sobre `nightly@d45d8d8d`: runner ISA-350 80/80, rollback y
  reaplicación 80/80, revocación post-prepare, locks concurrentes y finalize
  exactly-once PASS; harness v1 72/56/55 y concurrencia PASS. Reviews finales
  `SPEC PASS` y `QUALITY PASS`. PR draft #253 hacia `nightly`; gates remotos
  `31827610539` en verde. No hay apply remoto, UI, validador, URLs temporales,
  agentes, merge ni promoción implícita.
- Plan vigente:
  `docs/superpowers/plans/2026-08-14-isa-350-testing-center-screenshot-persistence.md`.
- TAU-00/01 y TAU-02A/B/C permanecen en PR draft a `nightly`; TAU-02C cerró sus
  gates locales y remotos sin deploy ni merge.
- ISA-215 / TAU-03 añade el paquete local
  `testing-center.diagnostic.v1`: allowlist, redacción, límites, preview exacto,
  SHA-256 y descarte efímero. No tiene wiring productivo.
- TAU-04A/04B/04C conectan RPC idempotente, draft local privado y una pestaña
  in-app que exige coincidencia entre canal embebido de build y capability
  firmada. `master` y metadata desconocida fallan cerrados; el servidor vuelve
  a derivar membresía y rol.
- TAU-04C reutiliza el paquete de TAU-03, muestra sus bytes exactos, verifica
  SHA-256 en frontend y transporta el mismo payload. No serializa
  ajustes/perfiles ni crea otro collector general.
- Los logs continúan desactivados por defecto. Texto libre requiere opt-in y
  preview completo porque ninguna regex puede garantizar eliminar PII
  semántica arbitraria.
- No existe aún un buffer productivo de logs para este flujo. La UI declara
  cero disponibles y mantiene el control deshabilitado; no simula evidencia.
- ISA-222 / TAU-05A añade triage server-only, fingerprints exactos,
  ocurrencias y una reserva durable de creación. Cien repeticiones y dos
  transacciones concurrentes convergen en una issue técnica y un efecto
  reservado. No existe todavía llamada externa.
- ISA-223 / TAU-05B proyecta el issue y los comentarios con decoder cerrado,
  redacción, markers no confiables y adaptador dry-run que recalcula su digest.
  Replay se expresa solo como disponibilidad autenticada; logs, URL, assignee
  y Codex no entran en GitHub.
- ISA-224 / TAU-05C añade lease/claim, backoff, recheck de pausa, reconciliación
  ante respuesta ambigua y ledger de deliveries HMAC. GitHub no aporta un
  timestamp firmado: se usa delivery ID único y hora server-side, sin header
  inventado. La App mínima queda documentada pero no registrada ni activada.
- ISA-226 / TAU-06A añade una policy pura fail-closed. Solo dos superficies
  frontend, alcance pequeño, reproducción determinista y harness existente
  pueden ser elegibles; cualquier flag sensible, retry o rechazo exige owner.
  Texto y logs no son autoridad y quedan fuera de la decisión/digest.
- ISA-227 / TAU-06B fija instrucciones/objetivos, módulos/rutas, command IDs,
  budgets y salida JSON. Revalida policy y digest; el registro global in-memory
  es solo prueba, no un lock distribuido ni un agente real.
- ISA-228 / TAU-06C concluye NO-GO: policy/corpus estructurado pasan, pero
  faltan procedencia/redacción verificable, scope leaf-level, exclusión durable
  y SHA exacto. P0=0, P1=3, P2=1.
- ISA-229 / TAU-06D elimina texto/mensajes/códigos del sobre y liga una
  proyección mínima a IDs, bytes, SHA y consentimientos. El loader DB
  service-role permanece pendiente de TAU-06F.
- ISA-230 / TAU-06E aplica reglas leaf-level y liga el request a un SHA exacto;
  el resolver de ancestry server-side permanece pendiente de TAU-06F.
- ISA-231 / TAU-06F añade loader `service_role`, tamaño de transporte,
  snapshot head+ancestros, reserva única, claim global, lease, fencing y pausa
  pre-dispatch. Ambigüedad y caída post-permiso no reintentan automáticamente.
- ISA-232 / TAU-06G reaudita sin editar los módulos revisados: P0=0, P1=0,
  P2=0; 0/96 falsos `eligible`, 0/35 falsos `needs_owner`, cero retención y
  cero rutas sensibles aceptadas. Veredicto: GO condicionado para planear
  TAU-07 por microcortes.
- ISA-234 / TAU-07A prepara envelope HMAC, prompt/schema y workflow reusable
  inerte con acciones/CLI pinneadas. No tiene caller, secreto ni permisos write.
- ISA-237 / TAU-07B/C confirma que ChatGPT Pro puede ejecutar la prueba sin
  Platform API y que una ref exacta se verifica por SHA. La continuidad de una
  rama integrada es NO-GO: la PR no conservó de forma fiable el head/base
  esperado. Toda corrección usa sub-issue y rama nueva desde `nightly` actual.
- ISA-238 / TAU-07D fija Supabase como autoridad y Linear como único tracker
  externo. GitHub queda para código/PR/CI; el efecto `github_issue_create`
  permanece inerte hasta su supersesión aditiva, sin dual-write. Contratos
  locales: proyección Linear, rechazo y dossier determinista para Codex. El
  corte está apilado sobre `ISA-234@0e45228626adc59a5a90b72d1369bb110b1c4e8c`;
  Deno focal 47/47, type-check/formato, frontend build y Go global pasan. Sin
  schema, red, secretos, UI, servicios reales, merge o promoción. Review
  adversarial final: ACCEPT, P0/P1/P2/P3=0.
- El diseño aprobado el 2026-08-03 sustituye la activación automática posterior
  por `Vantare -> Supabase -> Linear -> delegación humana a Codex Cloud -> PR
  revisada`. Un rechazo bloquea, genera expediente determinista y exige decisión
  de Isaac antes de cualquier nueva delegación.
- La delegación con escritura selecciona y verifica rama/SHA fuera del prompt.
  La mención Linear `@Codex` no autoriza código cuando parte de `master`; puede
  utilizarse para análisis hasta validar un handoff exacto a Nightly o rama de
  issue.
- ISA-239 materializa TAU-07E localmente: destino único durable, supersesión
  reversible del outbox GitHub y proyección Linear exclusivamente en dry-run.
  Deno 92/92 pasa; PostgreSQL 43/43, rollback exacto, reaplicación 43/43 y
  carrera de dos workers pasan. Merge y promoción siguen bajo gate humano.
  Autoridad operativa:
  `docs/runbooks/testing-center-linear-outbox.md`. Autoridad de diseño:
  `docs/superpowers/specs/2026-08-03-testing-center-rejection-linear-codex-design.md`
  y plan
  `docs/superpowers/plans/2026-08-03-testing-center-linear-codex-execution-plan.md`
  actualizado. Red real, API Codex, repo write no sintético, App real,
  Discord y asignación automática siguen apagados hasta gates separados. La
  integración PostHog preparada no se da por válida: errores, replay, masking,
  consentimiento y retención pasan un microcorte de privacidad antes de la UI.
- ISA-240 materializa TAU-07F localmente sobre ISA-239. La firma Linear cubre
  los bytes exactos, delivery y timestamps se validan, y solo IDs/acción/digest
  entran a un ledger privado. El mapping de estados usa UUIDs revisados; replay,
  digest conflictivo, estado desconocido y orden invertido fallan cerrados.
  La reconciliación es observacional y no toca issue canónica, outbox, Codex,
  Git o canales. Deno Testing Center 98/98 y PostgreSQL 27/27 + rollback/reapply
  + carrera de dos procesos pasan. Autoridad:
  `docs/runbooks/testing-center-linear-webhook.md`. Endpoint, secreto, red y
  deploy permanecen expresamente pendientes de TAU-07I y gate de Isaac.
- ISA-241 materializa TAU-07G localmente sobre ISA-240. Los votos quedan
  ligados a issue/candidata/canal/versión/SHA y a roles server-side;
  `cannot_verify` no cambia el gate y un rechazo Testers posterior bloquea la
  candidata exacta. Dossier y transporte se verifican por SHA-256 en
  TypeScript y PostgreSQL. Solo Isaac registra una de cinco disposiciones;
  `same_branch` está retirado y una corrección sigue `needs_owner`, sin
  delegación automática. Deno Testing Center 99/99 y PostgreSQL 45/45 +
  rollback/reapply + history guard + carrera exactly-once pasan. Autoridad:
  `docs/runbooks/testing-center-candidate-feedback.md`. UI, PostHog, Discord,
  red, Linear real, Codex, deploy, merge y promociones permanecen pendientes.
- ISA-253 materializa la frontera local TAU-07H1 sobre ISA-241. La proyección
  PostHog sólo admite contexto técnico allowlisted y excluye mensajes, stacks,
  logs, perfiles y texto libre. Consentimiento y replay son separados;
  revocación y TTL 7/30 días se aplican en Supabase privado. Deno Testing
  Center 107/107 (focal 8/8) y PostgreSQL 33/33 + rollback/reapply + history
  guard pasan. No existe SDK,
  red, secreto, endpoint, captura/replay real, UI ni efecto sobre Linear,
  Discord, Codex o canales. Autoridad:
  `docs/runbooks/testing-center-posthog-privacy.md`.
- ISA-242 materializa TAU-07H2 sobre `ISA-253@aaff314411288927d97d52c05eb93b6c7d5b8729`.
  La pestaña existente incorpora validación de candidatas y rechazo estructurado
  sin exponer Linear ni acciones owner. Una Edge Function deriva identidad, rol,
  canal y candidata server-side, sanea el contexto y usa el RPC service-role de
  TAU-07G. Deno Testing Center 116/116 (Edge 9/9), frontend focal 32/32,
  lint, build y visual 4/4 pasan.
  Función, secretos y red siguen sin desplegar; PostHog/replay, Linear, Discord,
  Codex, merge y promociones permanecen apagados.
- ISA-243 / TAU-07I tiene autorización limitada al proyecto Supabase de testing
  `lbaxvpzexoferfvfkplz`. Linear ya contiene el proyecto
  `Testing Center — Feedback` y labels agrupadas para origen, canal, módulo y
  flujo; los UUID están fijados en el runbook. El runtime se ajusta a los
  nombres reales `My Live` / `Backlog`. El baseline remoto y las tres Edge
  Functions del piloto están activos solo en testing; probes sin credenciales
  fallan cerrados. Históricamente, el primer reporte Nightly quedó reservado
  bajo pausa y la primera llamada al worker falló antes de claim/`issueCreate`
  porque hosted no exponía `public.gen_random_uuid()`; el wrapper correctivo se
  desplegó y el claim remoto pasó con rollback. En aquel punto todavía no
  existían binding ni issue Linear. El reintento único autorizado devolvió
  `linear_response_ambiguous`; Supabase quedó `needs_owner`, intento/fencing 1,
  sin lease ni binding y con pausa activa. La reconciliación read-only encontró
  cero issues en Linear y el contrato prohibió una tercera llamada sobre ese
  efecto. El cierre actual del piloto se documenta en ISA-287/289 a continuación.
- ISA-287 / TAU-07J añade diagnóstico sanitizado para la respuesta ambigua del
  piloto. El contrato cerrado publica solo versión, fase
  segura, HTTP status acotado y códigos GraphQL `RATELIMITED`/`UNKNOWN`; la
  frontera HTTP lo canonicaliza en runtime para impedir campos añadidos. No
  cambia claim, fencing, binding ni retries: después de `issueCreate` siempre
  termina en `needs_owner`. Evidencia: focal 16/16, Testing Center 125/125,
  deploy guard 4/4, typecheck, formato y diff PASS. Tras revisión humana, solo
  el worker se desplegó en Supabase testing y quedó `ACTIVE` v7; un probe sin
  credenciales devolvió `401 unauthorized`. El round-trip autorizado creó
  exactamente ISA-288, completó un binding sin lease residual y recibió un
  webhook firmado `create/applied`. Un segundo reporte idéntico quedó
  `duplicate_linked`: dos ocurrencias, un efecto y una issue Linear. La pausa
  global está activa, el efecto histórico `needs_owner` quedó congelado por
  flujo y el bearer temporal fue revocado. Codex, Discord, merge y promociones
  continúan fuera de alcance.
- ISA-248 / TAU-07J prepara el handoff humano a Codex Cloud sin reactivar el
  workflow automático. Un dossier completo produce una proyección digestada y
  un texto fijo con evidencia no confiable delimitada. El preflight verifica
  repositorio, árbol limpio, SHA/base y ancestry; tolera el nombre interno
  `work` de Codex Cloud y exige confirmación humana cuando el sandbox no expone
  remote. Los criterios no pueden conceder retry, asignación, autoridad Git o
  release. Handoff Deno 8/8, Testing Center Deno 136/136 y Node 4/4 pasan. Falta
  observar una tarea sintética y su PR;
  no hay caller, secreto, deploy ni promoción.
- La reconciliación local autorizada de PR #121 parte de
  `ISA-234@a526e2b0a4e344f5841a7c216d77a0efc4f0b62e` e incorpora exactamente
  `nightly@4981e6fac5b2c95af9deb4ad2a64f0592a7b4d1e` mediante merge incremental,
  sin force-push. Linear no permitió crear otra issue por el límite gratuito;
  la excepción queda registrada en ISA-234 y no cambia el contrato de rechazo
  ni reactiva `same_branch`. Los gates locales pasan: deploy surface, Deno
  vigente 165/165, preflight 4/4, frontend focal 150/150, build y Go focal.
  CI, build de canal y prueba humana siguen pendientes; no hay merge ni
  promoción.

## Riesgos

- **P0 potencial:** Billing concede/revoca acceso incorrectamente.
- **P0 potencial:** migrar raíz con worktrees activos pierde/duplica trabajo.
- **P1:** el hardening local aún no ha sido validado mediante despliegue y matriz
  monetaria en entornos controlados.
- **P1:** Discord publica commits no relacionados desde `develop`.
- **P1:** ramas, updater y licencias de canal describen modelos distintos.

## Issues y siguiente acción

1. Completar gates locales y review de BIL-10C / ISA-247.
2. Presentar dry-run, backup y rollback antes de cualquier apply remoto.
3. Recoger feedback Nightly de BIL-01..10C sin habilitar venta.
4. Continuar gates monetarios y despliegue controlado sin venta pública.
5. Crear proyectos Account, Calendar, Settings e Installer con handoffs propios.
6. Reauditar ISA-14 cuando se cierren worktrees grandes.

Cada issue fija base limpia, archivos, checks y rollback antes de editar. Los
cambios monetarios reales y Master requieren Isaac.

## Última actualización

2026-08-04, ISA-243/287 completaron el piloto remoto con un caso sintético
nuevo. ISA-288 se creó exactamente una vez, el binding quedó `completed` sin
lease residual y el primer webhook firmado fue `create/applied`. Un segundo
reporte idéntico quedó `duplicate_linked`: dos ocurrencias, un efecto y una
issue Linear. El efecto ambiguo histórico continúa `needs_owner` y congelado
por flujo; la pausa global está activa y el bearer fue revocado. ISA-289 limita
el tooling al project ref de testing, añade preflight de vínculo y separa fallos
OAuth temporales de configuración permanente. No hay Codex, Discord,
promoción ni producción.
Billing conserva BIL-08/BIL-10 en `nightly`, ISA-118 permanece como deuda
global heredada y la venta pública continúa NO-GO.

Estado Nightly previo integrado en esta reconciliación:

2026-08-03, ISA-246 queda en `nightly@55fba3d` e ISA-247 implementa localmente
la separación entre planes comerciales y accesos operativos. El apply remoto,
Owner real y retiro de legacy siguen protegidos por gate. Venta pública NO-GO.
