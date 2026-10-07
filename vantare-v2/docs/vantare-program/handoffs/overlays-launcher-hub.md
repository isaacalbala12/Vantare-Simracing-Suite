# Handoff vivo — Overlay Studio, Launcher y Hub

## Candidato beta — verificación local cerrada (2026-10-07)
Código `1c9ca48d`, base `dd90b49c`, rama `vantareapp/isa-1470-candidato-beta`; merges en orden `6338e31e` y `f18b842e`, sin squash. Zoom no autorizado por nota y no integrado.
Gates completos finales PASS: fmt/check/Clippy -D warnings, Nextest1205/1205 (6 skips, goldens ACC/LMU), lifecycle17. Se conserva el fallo intermedio de caché/mtime y su repetición completa verde.
QA `0.1.0-beta.1`/testers: 72 capturas Hub 1920/1440 opacas, 54 widgets y todas sus hojas/paneles inspeccionados. 18/18 widgets idénticos a referencias; Standings0/292160px. Regresión alfa255/254/0 PASS.
Paquete Release beta fuera del repo: source_sha `1c9ca48d19997733df2d8e2cf425bca67fe3d466`, source_dirty=false; 10 ejecutables, sin Workshop; build Release PASS, packaging/tests.ps1 beta174 PASS. Desinstalación normal/interrumpida PASS en PS5.1 y pwsh.
Hub empaquetado abre/responde/cierra exit0 con datos y pipe aislados; captura1440 opaca inspeccionada. Muestra pantalla de acceso Comprobando sesión: no acredita login completado, LMU live, OBS, DPI125, Mac ni rendimiento. Feed GitHub real/firma USB/NSIS no probados.
Evidencia `C:/tmp/candidato-evidence/`; hojas `resumen-1920.png`, `resumen-1440.png`, `widgets/resumen.png`; detalle `inspeccion.md`. Informe/archivos/checks/manual en `C:/tmp/fase2/informe-candidato.md`. Paquete `release-package/`; primer paquete dirty es solo evidencia histórica, no el candidato final.
Cierre documental posterior al código no cambia los binarios del paquete. plan.md ausente en base: no se inventa otro roadmap. Checkout principal preservado.
Solo integración local autorizada por brief. Sin push, PR, CI remota, promoción, release ni cambios de cuentas/datos/servicios remotos.

## #1470 + #1472 + #1473 + #1474 — candidato beta, segundo merge (2026-10-07)
Base `dd90b49c`, rama `vantareapp/isa-1470-candidato-beta`, worktree `C:/tmp/vw3-candidato`.
Primer merge `2ab5d362` incorpora `6338e31e`; este segundo incorpora `f18b842e` sin squash.
Solo conflictos documentales: se conservan todas las entradas. Launcher r2 visual prevalece; añade Trust de seguridad. Widgets conservan la fuente #1473/#1474.
Diagnóstico Testing filtra Workshop para beta/testers, conserva inventario anterior para desarrollo/nightly/master. Regresión RED con inventario antiguo y PASS con el filtro correcto.
Gates finales por cola/-j2/target propio: fmt/check/Clippy -D warnings PASS, Nextest 1205/1205 (6 skips), ACC 752,973 s y LMU PASS; lifecycle 17 escenarios PASS.
Se conserva m2-test.log: reutilizó el binario RED al restaurar un mtime antiguo; fecha corregida y gates completos repetidos en final-*.log sin debilitar tests.
Build QA beta.1/testers PASS (warning previo parity-capture analysis/view.rs:989). 72 capturas Hub 1920/1440 PASS; alfa 255 en todos los píxeles; revisión visual en curso.
Pendientes hoja widgets/Standings 0 px y paquete Release externo. Evidencia `C:/tmp/candidato-evidence`, informe `C:/tmp/fase2/informe-candidato.md`.
Zoom NO integrado: no existe nota autorizándolo. plan.md ausente en base; no se crea otro roadmap.
Solo merges locales del brief; sin push, PR, CI remota, promoción, release ni cambios de usuarios/servicios remotos.

## #1470 + #1473 + #1474 — candidato beta, primer merge (2026-10-07)
Worktree `C:/tmp/vw3-candidato`, rama `vantareapp/isa-1470-candidato-beta`, base `dd90b49c`.
Se incorpora `6338e31e` mediante merge sin squash; único conflicto documental, ambas entradas conservadas completas.
Hub productivo idéntico a la base; los demás archivos incorporados coinciden con la fuente.
Gates por cola, -j 2 y target propio: fmt/check/Clippy -D warnings PASS; Nextest 1193/1193 PASS (6 skips), golden ACC 646,270 s y LMU PASS; lifecycle 17 escenarios PASS.
Evidencia `C:/tmp/candidato-evidence/m1-*.log`. Guard de alfa 255/254/0 PASS.
Pendiente segundo merge de seguridad `f18b842e`, diagnóstico beta sin Workshop, QA visual y paquete Release.
Zoom no incorporado: notas-candidato.md ausente. plan.md ausente en esta base; no se recrea.
Sin push, PR, CI remota, promoción ni release; checkout principal y beta instalada preservados.

## ISA-1470 — ronda 4, estados (2026-10-06)

Reanudación en `vantareapp/isa-1470-r4-estados`, base `136a90fa`, sobre los
11 ficheros sin commit conservados. Testing usa el canal de build compartido;
Mis informes tiene vacío centrado con acción y variante compacta bajo el formulario;
Validar elimina la pill suelta. Rótulos sin tracking, consejos con badges y
textareas sin asas falsas. Actividad se ajusta a su contenido y centra el vacío.
Cuenta limita su pill al contenido, elimina hover de resúmenes estáticos y
extiende los separadores bajo las pills. El enlace Abrir Aplicaciones queda
junto al error. Actualizaciones muestra aviso y acción solo para un paquete
preparado de versión distinta, y Estás al día con estado current confirmado.

El capturador QA reconoce un turno propio explícito y conserva el mutex global.
La raíz de estado QA se consulta solo con parity-capture y captura explícita;
no se modifica la instancia native-beta. Lanzar oculto hizo esperar una ventana
visible; las capturas se lanzan normales, con turno y timeout externo de 90 s.
Diagnósticos temporales retirados. Evidencia y logs fuera del repo:
`C:/tmp/1470-r4-estados-evidence/`; notas e informe en `C:/tmp/fase2/`.
Validación Windows PASS por cola: fmt, check, Clippy -D warnings, Nextest
1158/1158 (6 omitidos por configuración existente) y lifecycle (17 escenarios).
Tras el ajuste visual final se repiten check/Clippy/lifecycle y Hub 277/277.
Build QA perfil prueba PASS, 0.1.0-beta.1/testers. 18 capturas finales 1920/1440
miradas, incluidos Actividad vacía y actualización preparada; ambas comparativas
ronda-1/ronda-2 también inspeccionadas. Hashes y revisión en capture-hashes.json
e inspeccion.md. El guard de instalación cubre misma versión, vacía y estados
no ready; la prueba de turno cubre propio/ajeno/ausente. No se pulsó Instalar.
Persisten recortes de Overlay en pista a 1440 y otras zonas de la lista del
worker cortes; no se certifica paridad total. Go/frontend y CI remota no
aplican a esta entrega local; juegos/OBS y envío/instalación reales no probados.
El roadmap manual no existe en esta base; no se recrea. Se conserva DemoData
según nota 05:43: --demo explícito puede cargar fixtures, el arranque normal no.
Sin push, PR, integración, promoción, release ni medición de rendimiento.


## ISA-1473 — Tablas: proporciones RaceLabs, presentación Vantare (2026-10-06)

Worker `1473-tablas`, rama `vantareapp/isa-1473-widgets-tablas`, base
`13ae6945524b1b33dbd73b8df1ee2ae758707e7b`. Entrega local terminada para
revisión del orquestador, no integrada ni promovida. Commits por widget:
Relative `c4dae159`, Multiclass `e8c58dba`, H2H `bd011bcc`,
Broadcast `8373b8b7`, Fastest Lap `d203472a`.

Relative pasa a 470×277, siete filas de 29 px, cabecera 36 y pie 38;
Multiclass a 470×181 con cinco filas de 29 px y cabecera 36;
H2H a 388×110 con rivales de 24 y jugador de 62; Broadcast a 1920×86,
nombre 16, gap 12 y tarjeta del jugador 1,4 veces el ancho de sus vecinos.
Fastest Lap conserva 480×104, rótulo y piloto 14 con cajas de línea de 29.
Inter, colores y cifras tabulares siguen siendo los de Eficiencia.
Workshop deja de forzar Relative a 430 px; usa el ancho productivo 470.

La nota del orquestador de las 03:55 autoriza cambiar SIZE sin migración:
la beta nativa aún no se distribuyó. Las 14 escenas de layout de estas tablas
caben en 1920×1080; el layout de inicio coloca Relative desde su ancho.
Capturas antes/después y referencias públicas inspeccionadas en
`C:/tmp/1473-tablas-evidence/`; demostraciones Workshop, no evidencia LMU.
Ronda 3/resumen y nombres largos inspeccionados; H2H con tres pilotos,
Broadcast también a escala 1×. Separadores Multiclass únicos de 1 px.
Fmt (workspace y módulos), check y Clippy con warnings denegados pasan;
Nextest 1159/1159, seis skips (cinco pruebas manuales/live y lifecycle,
que pasa aparte: cinco tests de engineer y doce escenarios de runtime).
Build final de captura pasa en 15,08 s. Logs y reproducción manual en
`C:/tmp/1473-tablas-evidence/VERIFICACION.md`. Sin prueba LMU, OBS, Mac,
DPI distinto ni rendimiento; sin push, PR, CI remoto, merge o release.

Los cinco bloques de demanda permanecen idénticos a la base. #1474 modifica
Relative/H2H en otra rama: posible conflicto de fichero en sus `mod.rs`,
sin conflicto intencionado de responsabilidad; preservar sus cambios de demanda.
No se tocan domain, IPC, persistencia ni dependencias. `efficiency` es el kit
compartido, no un widget; se conserva intacto, igual que Standings.
Standings solo tiene propuesta/pregunta en `C:/tmp/beta/r4/informe-1473-tablas.md`.
Sin datos de sectores/mejores vueltas H2H ni ratings Relative: no se inventan.
Broadcast conserva selección, orden y cantidad configurada de pilotos;
centrar siempre al jugador requiere una decisión de contenido posterior.
`docs/roadmap/plan.md` no existe en esta base; no se recrea.

## ISA-1472 — confianza de perfiles importados (2026-10-07)

Entrega local `984909ea` en `vantareapp/isa-1472-seguridad-decisiones`, base
`d4a4e73a`, pendiente de revisión e integración. Hub y supervisor usan la
misma barrera previa a cualquier programa: rutas/argumentos efectivos y
«Confiar y lanzar» / «Cancelar». Reutiliza el diálogo de decisiones existente,
con SHA-256 por ID/contenido y comandos resueltos en `launcher-trust/` de la
generación de datos. Cambiar contenido o rutas vuelve a pedir revisión; las
estadísticas no. El origen Wails antiguo se conserva al cargar, editar y
duplicar. Atajos, LMU, inicio con Windows y reintentos no eluden la revisión;
sin respuesta no ejecutan. No se bloquean scripts legítimos ni se cierra
ninguna aplicación ajena. Un perfil creado por el usuario no requiere esto.

Regresiones: espera antes de cualquier Child, cancelación sin confianza,
confianza recordada, cambio de argumentos/rutas y duplicación histórica sin
marcar perfiles locales. Suite completa 1188/1188 + seis omisiones previas;
revalidación final Hub/supervisor 302/302, fmt/check/clippy y lifecycle PASS.
Standings Release propio 0/292160 px, umbral 0, referencia/captura/diff
inspeccionados. Dos capturas Debug tuvieron un píxel delta 1; se conservan.
Sin cambios en renderizadores. Evidencia `C:/tmp/1472-decisiones-evidence/`.

Verificación manual pendiente en un entorno aislado: lanzar un perfil ya
importado, revisar y cancelar; aceptar y repetir; cambiar un argumento o
ruta y comprobar la nueva revisión. No se probaron LMU vivo ni DPI ni se
controlaron programas reales del usuario. Sin push/PR/merge/promoción/release.
La clave pública y el roundtrip firmado del actualizador quedan para Isaac;
continuidad completa de auditoría y servicios en el handoff de plataforma.


## ISA-1467 — Workshop: estilo de Standings en vivo (2026-10-05)

### Ronda 2 / 1467b — entrega para revisión, paridad completa pendiente

Parte de `fe12dcbbf00003e983931e10ac7d3948eb8aae7d`, mismo worktree/rama.
El panel GPUI ahora tiene 248 px, scroll propio, selección del widget y sus
Settings, idiomas es/en, sesión, fuente, ubicación, fondo, escala, dimensiones,
comparación y restablecer. Las 43 escenas React se exportan con Playwright
existente y se convierten al DTO IPC; son demostraciones, nunca prueba LMU.
La reproducción añade fases, pausa, anterior/siguiente, bucle y deslizador.
Retroceder reconstruye el renderer productivo desde el inicio; la recarga de
estilo conserva el mismo proceso. No hay WebView ni renderer alternativo.

Se reprodujo y corrigió la colisión de IDs `#dev-1`; se añadieron regresiones
para IDs únicos/estables, tiempos Standings sin overwrite Relative, signo
relativo, playback y último documento válido ante escritura parcial.
Referencia e inventario en `C:/tmp/1467b-evidence/react.md`, capturas en
`react/` y `gpui/`, rondas 1 y 2 revisadas visualmente. La fase 2 se accionó
en la ventana propia y mostró cambio de posición/caption. Informe operativo:
`C:/tmp/fase2/informe-1467b.md`.

La validación de escala 0,5 reprodujo un brillo PIT fuera del widget:
`standings/view.rs` usaba una posición absoluta como offset de sombra.
Se cambia únicamente ese offset a un vector cero. `ronda-3.png` conserva
la reproducción y la captura corregida, ambas revisadas. La regresión es
visual sobre una ventana real porque el efecto depende del pintado GPUI;
no se añade un test que solo compare la constante de la implementación.

No se declara IGUAL completo: faltan V1/Foco, idiomas pt/it, estado Error
(el contrato nativo tiene Waiting), equivalentes de dents/históricos React,
persistencia de los nuevos controles al recompilar y paridad de tamaño/
columnas de Relative. Ancho/alto cambian el marco; no reproducen el escalado
independiente X/Y de React. Las superficies comparan el mismo renderer y no
simulan sus transportes. Persisten diferencias de controles/espaciado y el
centrado de la zona PIT. La comparación se apila verticalmente; la reproducción
recorre keyframes y no interpola continuamente las señales como React.
El siguiente trabajo requiere decidir el alcance de
paridad del renderer/contrato; no se altera arquitectura para ocultarlo.

Gates Windows finales PASS: check, Clippy `-D warnings`, fmt, Nextest
1095/1095 (4 omitidas) y lifecycle (12 escenarios). Build prueba PASS.
Exportador reejecutado con SHA idéntico; 43 escenas regeneradas idénticas.
No se ejecutaron gates frontend porque sus archivos no cambiaron.
Código local `56e11e8f19214d4191a06343e257858966878e7e`, transferido por
bundle privado al worktree Mac limpio y detached. `ui/workshop-en-vivo.sh`
PASS sobre ese SHA: build incremental 10,60 s, ventana GPUI y tres cargas de
estilo en PID 59560. JSON restaurado, proceso propio cerrado y worktree limpio.
`mac-verification.json` registra el hash del binario; no es verificación de
presentación física. Guardar → log 269,18 ms, sin afirmar latencia visual.
Persiste el aviso heredado de `LiveScreens::toggle` sin uso en Mac; no se
ejecutaron allí los gates completos ni una revisión visual de la pantalla.
La corrección PIT posterior es `a68316e426f822dcedd24a957f1ee97d918888bb`:
todos los gates Windows se repitieron y pasaron sobre ella. Su transferencia
al Mac quedó bloqueada por conexión cerrada y tres intentos SSH con timeout
(17:07). La prueba Mac anterior NO valida este último SHA. Siguiente acción:
restablecida la conexión, transferir el bundle final y repetir
`ui/workshop-en-vivo.sh`; no se tocó ningún proceso ajeno para recuperarla.
Sin push, PR, CI remoto, merge, promoción ni release. El roadmap manual no
existe en esta base; no se recrea. La issue #1467 permanece abierta.

### Entrega de estilo en vivo anterior

Entrega aislada en `vantareapp/isa-1467-workshop-estilo-vivo`, base
`a464e9fc95ff0af10508f88a53302a8803437b36`, worktree `C:/tmp/vw3-1467`.
El brief de Isaac autoriza extraer valores visuales, conservando Rust + GPUI y
el renderer productivo. `native/ui/styles/standings.json` contiene colores,
geometría, tipografía, sombra y opacidades; el build compila esos valores.
Solo `vantare-workshop --dev` lee y recarga el fichero cada 50 ms. Un JSON
inválido conserva el último estilo válido y muestra el error; la recarga
recalcula la geometría sin cambiar la escena ni reiniciar la ventana.

Gates Windows PASS: check, Clippy `-D warnings`, fmt (incluidos módulos UI
explícitos), Nextest 1092/1092 (4 omitidas) y lifecycle. La captura del renderer
compilado con sus valores originales es idéntica a la base: 0/292160 píxeles,
umbral 0. Frente a Wails: 7343/292160 (2,5133 %, umbral 8), igual que la base.
Se revisaron referencia, captura y mapa; estructura y contenido coinciden.
Evidencia en `C:/tmp/1467-evidence/`, incluida `ronda-1.png`; informe operativo
en `C:/tmp/fase2/informe-1467.md`. Guardar → píxel visible en Windows: 10/10 <200 ms, mediana 53,79 ms,
máximo 62,36 ms (`GetPixel`, sondeo 2 ms, mismo proceso, sin recompilar).
Se revisaron capturas limpias de cambios de fuente/color/geometría y del JSON
inválido. Commits de código: `030d117d` y `ae6ccb70`, transferidos al bare
privado Mac. El worktree aislado `/Users/isaacalbala/vw3-1467` ejecutó el script
Mac sobre `ae6ccb70`: build frío 7m12s, incremental 3,09s, ventana GPUI abierta
y tres cargas de estilo aceptadas en el mismo PID 97771. Guardar → log:
110,50 ms; esto no mide presentación física. JSON original restaurado y
proceso propio cerrado. Logs y hash del binario en `mac-verification.json` y
`mac-workshop.log`, dentro del banco de evidencia. El build Mac tiene un aviso
heredado de la base por `LiveScreens::toggle` sin uso; no se ejecutaron allí
los gates completos. La prueba visual del Mac queda a Isaac. En Windows el
script también pasó de extremo a extremo (build, ventana, recarga y cierre).
Los scripts
`native/ui/workshop-en-vivo.sh` y `.ps1` compilan con perfil `prueba`, `-j 2` y
abren Standings. La nota de Isaac de las 15:15 autoriza transferir esta rama
al bare privado del Mac; no autoriza push a GitHub ni integración.

`docs/roadmap/plan.md` no existe en esta base: se conserva su retirada previa,
sin inventar otro roadmap. Las instrucciones actuales de Isaac fijan GitHub
como tracker y prevalecen sobre referencias históricas a Notion/Asana.
Sin push a GitHub, PR, CI remoto, integración, promoción ni release.
Solo transferencia autorizada al bare privado Mac. No se toca la beta
`native-beta` ni telemetría live de Isaac. El spike de dylib queda
cancelado por la nota de Isaac de las 15:15.


## 2026-09-28 · ISA-1406 · Navegación Orbit sin salto

El harness de la shell reprodujo en Inicio → Ajustes un primer fotograma con
panel y cabecera a opacidad cero y columna contextual vacía. La causa visual
era la animación vertical de entrada y la resolución de portales después del
pintado. La rama `vantareapp/isa-1406-hub-navegacion-sin-salto`, basada en
`origin/nightly@355e9cfe`, resuelve los portales antes de pintar y fija la
entrada de vistas a 0 s, incluida Ajustes y Testing Center. La prueba de
navegador dio RED antes del cambio y PASS después, incluida una pestaña interna
de Ajustes. Frontend:
486 archivos/4113 pruebas PASS (2 omitidas), typecheck, build y lint PASS.
Falta verificar la sensación de navegación y el tiempo de datos en Wails real
con sesión; el harness usa runtime simulado. [PR draft #1407](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1407)
hacia `nightly`; sin integración ni promoción.

## 2026-09-26 · VAN-769 / GitHub #1381 · Integración inicial autorizada

Isaac revisó la entrega de temas y fondos de Studio en Wails y autorizó expresamente integrar únicamente la [PR #1384](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1384) en `nightly`. La rama se reconcilió con `origin/nightly@d09829c4` sin conflictos de código. El candidato inicial `9ea9a341` pasó sus gates bloqueantes, pero el validador de roadmap en modo auditoría señaló un orden distinto de entregas porque el digest se había generado desde el artefacto de la rama. Se regeneró `roadmap.json` partiendo del JSON protegido de `d09829c4`; la comparación estricta del contrato y las pruebas del generador pasan. La aceptación incluye la tarjeta Próxima serie con la paleta activa; los widgets mantienen sus diseños. CI debe repetirse sobre la cabeza con el digest corregido antes del merge. Este registro no afirma integración antes de comprobar el SHA remoto y los gates del merge. La comprobación física en LMU/OBS sigue siendo trabajo de Nightly. La autorización no comprende `testers`, `master` ni una release.

> **Seguimiento de widgets en [Asana](https://app.asana.com/0/1218742976551956/list), por instrucción de Isaac.**
> GitHub Issues conserva el puente técnico y su estado de entrega.
> Este handoff conserva evidencia técnica fechada; sus estados antiguos no
> sustituyen el estado vivo ni autorizan nuevas tareas.

## ISA-1388 — radar de proximidad (2026-09-25)

Isaac solicita un radar para pilotos cercanos inspirado por TinyPedal, RaceLab y LMU. El seguimiento vivo está en [Asana · Radar](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218838171528031); la [issue #1388](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1388) define el alcance técnico. La [PR draft #1389](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1389) nace de la rama aislada `vantareapp/isa-1388-radar-proximidad`, reconciliada sobre Nightly `f0ccfbf2`, que incluye #1386.

Primera entrega candidata: proyección Go de posiciones LMU frescas en el marco del jugador, radio de 30 m, hasta 16 rivales y clasificación de coches en paralelo con la geometría compartida del Spotter. La cadencia marca el radar sucio cuando cambia la posición aunque la alerta lateral no cambie. `FrameV2.radar` atraviesa transporte tipado y alimenta un único widget Eficiencia transparente para Studio, Desktop, OBS y Workshop. El ejemplo visual de Workshop contiene tres coches declaradamente ficticios y no suplanta la telemetría real.

Revisión visual de Isaac: retirado el recuadro exterior y ampliados los coches de 12 × 26 a 16 × 32 px en el renderizador productivo. Workshop añade una escena espacial de cinco pasos con acercamiento, solapamiento por ambos lados y separación, interpolada y muestreada a los 10 Hz declarados del widget. Es una demostración de posiciones, no una captura LMU; queda en bucle para valorar el tamaño en movimiento. La escala visual final aún requiere aceptación de Isaac y la comprobación física LMU sigue pendiente.

Nueva indicación solicitada por Isaac el 26/09: los coches a 10 m o menos reciben ámbar, los doblados por el jugador con progreso de vuelta completo y fresco usan azul oscuro, y un solapamiento conserva prioridad naranja. La identificación de doblados combina vueltas completadas, distancia dentro de vuelta y longitud de pista; al cruzar la línea sin un giro completo de diferencia no marca un doblado. Si esas señales faltan o están antiguas, no afirma esa condición. El contrato `RadarCarV2` añade `near` y `lapped`, la cadencia reacciona a vueltas y longitud de pista, y Workshop enseña ambos estados con datos de ejemplo. La prioridad de colores y el umbral son candidatos de revisión visual; LMU físico sigue pendiente. En esta iteración pasaron `go test ./...`, el check del contrato generado, TypeScript, lint, 486 archivos/4118 pruebas frontend (2 omitidas) y las 4 pruebas del presupuesto de frame. Una primera ejecución paralela de frontend sufrió un timeout en otro widget; la repetición con cuatro workers pasó completa. No se hizo build por la preferencia de Isaac de revisar cambios sin build por cada paso.

Revisión solicitada el 27/09: la escena del radar se abre reproduciéndose y en bucle. Diez fases de ejemplo enseñan entrada y salida del radio, aproximación, proximidad ámbar, solapamiento izquierdo, doble y derecho, y un doblado en azul oscuro que pasa a borde ámbar y luego a aviso naranja al solaparse. Las coordenadas avanzan linealmente entre fases; el renderer productivo interpola visualmente las muestras de 10 Hz en 100 ms. Workshop mantiene esa transición durante la demostración aunque el navegador solicite movimiento reducido; fuera del Workshop respeta dicha preferencia. Son datos de demostración, no telemetría física LMU. Verificación: 57 pruebas focales, typecheck, lint, 486 archivos/4119 pruebas frontend (2 omitidas), 4 pruebas del presupuesto y reproducción visual en Workshop PASS. Sin build por la preferencia expresa de Isaac, sin push ni integración; falta validación física LMU/Windows/OBS.

Comprobación actual: pruebas Go de proyección, transporte y replay PASS; TypeScript, lint y build PASS; 151 pruebas focales frontend y 4 pruebas del presupuesto de frame PASS tras la reconciliación. La pasada final de la suite frontend completa con cuatro workers pasó 486 archivos, 4109 pruebas y 2 omitidas. Las pasadas anteriores expusieron seis listas cardinales ya actualizadas y timeouts aislados de interfaz que pasaron por separado. La suite Go completa encontró una prueba temporal de Engineer Fuel que pasó aislada; el alcance radar está verde. CI de la PR #1389 sobre `fcd62003`: promotion, gate bloqueante, ratchet y GitGuardian PASS. Vista del Workshop 5174 revisada en navegador. Pendientes: revisión visual de Isaac y prueba física LMU/Windows/OBS. Sin integración de este radar ni promoción adicional.

Isaac acepta la animación completa y autoriza integrar #1389 solo en `nightly` el 27/09. La rama incorpora `origin/nightly@050fe951`, que retiró el plan y digest de roadmap del repositorio por la publicación compartida; se conserva esa retirada y el seguimiento del radar en Asana. Pendientes los gates del HEAD reconciliado y la comprobación física LMU/Windows/OBS; no se afirma todavía el merge.

Sobre el árbol reconciliado: `go test ./...`, `pnpm --dir frontend test` (485 archivos, 4109 pruebas y 2 omitidas; presupuesto 4/4), `typecheck`, `lint` y una build final PASS. El test frontend regeneró cinco capturas de Horizontal Standings ajenas al radar; se restauraron sin incorporarlas al cambio. Pendientes CI del nuevo HEAD y prueba física LMU/Windows/OBS.

## VAN-769 / GitHub #1381 — Temas de interfaz y fondos de Studio (2026-09-25)

[VAN-769](https://app.notion.com/p/3e6e51695c6581abbcdff05e070a4a69)
es la tarea viva del proyecto Hub / Orbit UI; [PR draft #1384](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1384)
lleva la rama aislada `vantareapp/isa-1381-temas-paleta-ui` a revisión.
Siete paletas con variantes claras/oscuras, modo Sistema, contraste, opacidad
y fuentes se aplican al Hub y Studio sin modificar el diseño de los widgets.
Studio ofrece `Tema actual`, catorce fondos fijos agrupados por paleta,
Rejilla, Degradado, Negro y biblioteca propia; recuerda la selección manual.
La tarjeta Próxima serie sigue los tokens de la paleta. En Wails real se
comprobaron tarjeta Grises clara/oscura, escenario Grises claro/oscuro,
selección fija Rosa/Oscuro y persistencia al volver a Studio; los widgets
conservaron sus colores. Typecheck, build, lint, i18n, pruebas focales y
presupuesto de frames pasaron. La suite completa tuvo 4.116 correctas,
dos omitidas y cuatro fallos locales (tres timeouts de geometría bajo carga
y una expectativa antigua corregida); las cuatro suites pasaron aisladas.
En `503483ca` el quality ratchet detectó 13 hallazgos jscpd al editar una
hoja con clones históricos; se movió la corrección de la tarjeta a la hoja
de paletas y se unificó la regla del escenario. La comprobación local del
ratchet arroja cero hallazgos nuevos. El gate frontend de Windows señaló
tres traducciones huérfanas del antiguo selector y se retiraron; la auditoría
i18n y 26 pruebas focales pasan tras el ajuste. CI del nuevo candidato
pendiente. Sin merge, promoción ni release.



## ISA-1390 — versión en la cabecera de Orbit (2026-09-25)

[Notion VAN-768](https://app.notion.com/p/3e6e51695c6581f78d55e9801c25c6ab) y [puente técnico #1390](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1390). Rama aislada `vantareapp/isa-1390-orbit-version-header`, base `origin/nightly@f0ccfbf2`. El indicador verde decorativo se elimina de la cabecera contextual; la versión se muestra cuando llega del runtime. La ruta existente es `app:version` desde Go a HubApp y ContextColumn. `VERSION` y `main.version` coinciden en `0.1.0.7`; el empaquetado de Windows inyecta la etiqueta de la build, incluido su canal. No se introduce una versión fija en frontend.

Prueba de regresión: la cabecera carece del indicador y acepta una versión nueva en el mismo montaje. Reproducción roja antes del cambio; después, 36/36 pruebas focales, typecheck, lint y build pasan. El primer intento de suite completa agotó el tiempo en dos tests visuales ajenos durante carga concurrente; ambos pasaron aislados (5/5). La repetición con dos workers pasó: 484 archivos, 4106 pruebas, 2 omitidas; la prueba aparte de presupuesto de frames pasó 4/4. El hito `orbit-v1-12` y su digest derivado reflejan el ajuste sin dar por completado todo el hito. La [PR #1391](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1391) se fusionó en `nightly` como `98c245bfb1a11ce240605dc78e26e9758477fa25`: SHA remoto y controles posteriores de promoción y bloqueo aprobados, incluida build Wails de CI. Pendiente comprobación visual en ventana Wails real; sin `testers`, `master` ni release.

## ISA-1385 — Car Damage Numbers Eficiencia (2026-09-25)

[Issue #1385](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1385). Isaac pidió adaptar la composición de cuatro filas del widget Crystal al fondo y la tipografía de Eficiencia. Rama/worktree aislados `vantareapp/isa-1385-car-damage-numbers-eficiencia` en `C:\tmp\vantare-isa1385-car-damage-numbers`. El trabajo local nació de `df6b4125` del mapa #1358, y antes del PR se reconcilió sobre `origin/nightly` `5c73013e`: el diff final contiene solo #1385.

El renderer Eficiencia presenta Aero, Body, Susp y una sola fila Tyre, con el agregado de neumáticos ya usado por Crystal, preservando `showTyres`. Las filas usan Inter; Crystal no se modifica. Workshop revisado en `127.0.0.1:5173` a 140 × 148 con tres valores al 100 % y neumático ausente representado como «—». Isaac aceptó la composición de cuatro filas independientes. Por su preferencia no se hizo build tras cada iteración.

Corrección tras la primera revisión de Isaac: el fondo del contenedor completo hacía que las filas parecieran un solo rectángulo. Se retiraron fondo, sombra y borde exterior; cada una de las cuatro filas tiene ahora su propio fondo y borde de Eficiencia, con espacio visible entre ellas. La revisión visual posterior en Workshop confirma cuatro recuadros independientes a 140 × 148. El ajuste afecta solo a CSS de Eficiencia; sin cambios de datos, Crystal o build.

Auditoría para PR solicitada por Isaac: LMU lee `mDentSeverity[8]` del coche jugador, la fusión conserva frescura, Go publica `frame.damage.dents` y el registro de ViewModels V2 alimenta el renderer Eficiencia. Una prueba de contrato recorre el frame golden V2 hasta las cuatro filas. La revisión reprodujo y corrigió dos errores del ViewModel: cero daño observado se perdía como dato ausente, y una muestra antigua o fuente degradada podía aparecer como actual o ausente. Un `QValue` fresco sin ocho valores útiles ya no fabrica ocho ceros. Los porcentajes de Aero/Body/Susp siguen siendo la transformación existente `min(severidad/2, 1)`, no una calibración física nueva.

Corrección solicitada por Isaac después de abrir la PR: el SDK local de LMU sí expone `TelemWheelV01.mWear` para FL/FR/RL/RR. `offsetof` con el propio header confirmó `+1000/+1260/+1520/+1780` en la fila. El lector valida 0..1 y transporta las cuatro fracciones con calidad propia por la fusión, el estado canónico y `frame.damage.tyreWear`; Car Damage Numbers muestra `max(1-mWear)` como desgaste de la peor rueda. La captura sanitizada preservará ahora estos bytes; las capturas históricas no los conservan, de modo que siguen sin acreditar la escala física. El golden del Workshop sí es una muestra de prueba declarada y enseña 13 % de desgaste; no se presenta como captura de LMU. Sin sesión LMU activa no hay prueba física de valores en carrera. La issue #1385 y el cuerpo de la PR draft explicitan el alcance revisado.

Checks en la base reconciliada: `go test` de los paquetes LMU y Overlay V2, typecheck, lint frontend, build frontend y cuatro pruebas del presupuesto de frames pasaron. La suite completa de frontend aprobó 4098 pruebas y omitió 2, pero terminó roja porque `work/horizontal-standings-flags.visual.test.tsx` agotó 20 s al cerrar Chromium en `afterAll`; esa prueba ajena pasó aislada (5/5). No se presenta el conjunto como verde. La build final es única tras las iteraciones. Pendientes CI del PR y validación física LMU/Windows/OBS; sin merge, promoción ni release.

[PR draft #1386](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1386) abierta hacia `nightly` con el diff exclusivo de #1385 y el fallo de la suite global declarado en la descripción. Rama remota publicada para revisión; CI y aceptación de la telemetría física siguen pendientes. No se ha autorizado ni realizado merge o promoción.

Checks de la corrección `mWear`: `go test ./...` pasó; catálogo, parser LMU, sanitizador, frame y cadencia tienen pruebas focales verdes. Frontend: 29 pruebas focales y 4 de presupuesto de frame pasaron; lint, typecheck y una build final pasaron. La suite completa aprobó 4098 pruebas, omitió 2 y terminó roja por timeout de dos pruebas visuales ajenas (Endurance shell y clipping de Standings); ambas pasaron aisladas (5/5). Workshop en la misma URL muestra cuatro filas y 13 % en NEUM. sobre golden de demostración. El SDK y los tests de bytes prueban el cableado, pero aún no existe una captura física de `mWear` tomada en sesión activa tras esta admisión. El PR sigue draft, sin merge.

25/09: Isaac autoriza expresamente integrar #1386 en `nightly` y acepta contrastar el desgaste con LMU en marcha después. Antes del merge, los controles remotos de promoción, gates bloqueantes, calidad y GitGuardian están verdes en `aeaa27a0`. La tarea [Notion VAN-767](https://app.notion.com/p/3e6e51695c65813fb751c943eb332000) registra esta decisión y el límite físico. Se clasifica #1385 como `roadmap:required` y se actualiza solo `milestones:functional-widget-design` y su digest derivado; el nuevo HEAD tendrá que superar CI antes de integrar. Este registro no declara todavía merge ni prueba física.

## ISA-1355 — integración de datos, volantes y catálogo (2026-09-24)

La [PR draft #1356](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1356) reúne las tres entregas coordinadas en [Asana · Pedals telemetry](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218756738610082). Sobre `bf2b12e9` (volantes) y `82883459` (renombre/compatibilidad), el tercer commit incorpora con `cherry-pick -x` el parche de datos `fb8590878d46988def86b55c2c0aa4add32c497b`, revisado contra sus cinco pruebas y consumidores. Rama `vantareapp/isa-1355-lmu-steering-wheels`, misma base `nightly f50ab4ab`; no hay conflicto semántico ni conversión de perfiles.

El ViewModel distingue ceros de señales ausentes/invalidas, limita pedales a 0–1 y elimina datos anteriores en conexión, detección o parada. El embrague oculto y la dirección opcional no degradan la calidad del widget. El compacto hereda el vaciado de instrumentos; la conversión compartida de velocidad descarta valores no finitos. El primer ratchet detectó dos emplazamientos de una normalización duplicada con Pedals: por autorización del orquestador, ambos reutilizan `pedalValue` con reglas exactamente equivalentes. Se conserva el comportamiento anterior de Pedals y no se cambian políticas ni baseline.

Verificación final tras esa reutilización: 159 pruebas focales; frontend completo con Node 22.23.2, **484 archivos / 4098 PASS / 2 omitidas**; typecheck, lint y build PASS; ratchet PASS, **NEW=0, MOVED=0, policy_changed=false**. La suite emite el aviso conocido de cancelación de fetch al cerrar happy-dom, sin fallo. Se restauran los cinco PNG incidentales de Horizontal Standings. La revisión visual anterior del selector/nombres sigue aplicando: este commit solo modifica adaptación de datos y documentación.

Límites: producción sigue sin señal de dirección validada y con posición V2 ausente; la rotación de Workshop proviene del fixture. Pendientes revisión del orquestador, aceptación visual de Isaac, CI remoto del tercer commit y validación física LMU/Windows/OBS. Los dos primeros commits ya pasaron CI. No se modifica Workshop 5178 ni se integra, promociona o publica una release.

## ISA-1355 — Pedales avanzados y compatibilidad del compacto (2026-09-24)

Ampliación de [Asana · Pedals telemetry](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218756738610082) en la [PR draft #1356](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1356), segundo commit separado sobre `bf2b12e9`, misma rama/worktree aislados. Aprobado por el orquestador: el compacto sale de los catálogos de creación, pero conserva definición, manifests, IDs de diseños y contratos frontend/Go para perfiles guardados. No se convierte al principal porque sus banderas `showSpeed`/`showRpm`, tamaño y presentación iRacing son diferentes.

`pedals-telemetry` se presenta como **Pedales avanzados**; `pedals-telemetry-compact` como **Pedales antiguos**. Etiquetas ES/EN/PT/IT, catálogo de añadir, nombres de tipo sin nombre personalizado en Orbit y rótulo Workshop actualizados. Los nombres que escribió el usuario se conservan. Hay 20 tipos seleccionables y 21 aceptados. Un enlace antiguo de Workshop al compacto sigue dibujándolo y muestra una opción deshabilitada/aviso; no lo ofrece desde las demás selecciones. El guardado no migra IDs ni borra ajustes. No se toca el Workshop 5178.

Verificación: 483 archivos / 4093 pruebas aprobadas / 2 omitidas con Node 22.23.2; 109 pruebas focales y 103 adicionales tras el último ajuste de etiqueta. Perfiles mixtos V3→V4 y roundtrip conservan contenido, layout, visibilidad, memorias visuales, procedencia, política de rendimiento y volante Ligier; los tres sistemas antiguos renderizan en Studio/Desktop/OBS. Typecheck, lint, build y ratchet PASS (NEW=0, MOVED=0, sin cambios de política). Revisión en Safari 5188: nombre **Pedales avanzados**, volante visible y menú con 20 entradas sin compacto. Capturas locales `/tmp/vantare-wheel-review/pedals-advanced-renamed.png` y `pedals-advanced-catalogue.png`. La galería anterior contiene 32 figuras (5 filas de 6 y una de 2), verificadas contra los 31 IDs LMU más genérico.

Pendientes: revisión final del orquestador, aceptación visual de Isaac, CI remoto del nuevo SHA y validación física LMU/Windows/OBS. La auditoría de telemetría va separada; no afirmar dirección física validada. Sin merge, promoción ni release.

## ISA-1355 — volantes LMU intercambiables (2026-09-24)

[Asana · Pedals telemetry](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218756738610082), puente [#1355](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1355). Worker GPT-6 Astra Max, rama `vantareapp/isa-1355-lmu-steering-wheels`, worktree `vantare-lmu-steering-wheels`, base `nightly f50ab4ab`. [Diseño](../../plans/2026-09-24-lmu-steering-wheels.md) y [catálogo/evidencia](../../analysis/lmu-steering-wheels.md).

El renderer productivo `PedalsAdvancedEfficiency` de `pedals-telemetry` incorpora 31 opciones LMU y conserva el genérico inicial. Apariencia persistente V4, selector de Studio y parámetro/control de Workshop, nombres comerciales comunes y etiquetas en cuatro idiomas. SVG propios simplificados: no se certifican réplicas exactas ni cada variante histórica. No se alteran datos, giro físico, nombres de widgets ni registro del compact; la auditoría y migración están en ramas de otros agentes.

172 pruebas focales finales con idiomas; suite completa Node 22.23.2: 482 archivos / 4080 PASS / 2 omitidas. Typecheck, lint, build y ratchet PASS (NEW=0, MOVED=0, policy_changed=false). Node 26 alpha produjo errores de entorno en la primera suite; se repitió con el runtime estable sin debilitar pruebas. Revisión de Safari confirma selección Ferrari/BMW, tamaño y catálogo de 32 dibujos a 72 px. Preview aislado 5188; evidencia local temporal en `/tmp/vantare-wheel-review/`. Pendientes aceptación visual de Isaac, revisión independiente y validación física LMU/Windows/OBS; señal steering todavía ausente en la base. Preparado como candidato, sin merge a ningún canal.


## ISA-1347 — contratos y correcciones de datos de widgets aceptados (2026-09-23)

Seguimiento por instrucción explícita de Isaac en [Asana · Desarrollo](https://app.asana.com/0/1218742976551956/list). Correcciones Delta `1218777895248782`, Pedals `1218777754821855`, Standings `1218777832104952`, Relative `1218778048433037` y Horizontal `1218777895238689`, todas En curso y releídas tras actualizar. Se preserva la aceptación visual previa. [Puente #1347](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1347), base inicial `nightly 8b25d076`, rebasada linealmente sobre `origin/nightly@b725c402`, rama `vantareapp/isa-1347-widgets-data-contract`.

[Contrato común](../../specs/2026-09-23-accepted-widgets-data-contract.md) y [plan](../../plans/isa-1347/PLAN.md). Tres workers GPT-6 en worktrees separados entregan correcciones; root integra y repite comprobaciones. Delta resuelve las tres referencias en Go; Pedals distingue ausencia de cero; Standings conserva calidad y referencias de clase/intervalo; Relative usa proximidad circular y progreso real para doblados; Horizontal conserva gaps en vueltas y ofrece el carrusel aceptado como control productivo. SOF fuera por decisión de Isaac. Bloque Vuelta ligado a vuelta actual del jugador, supuesto recomendado comunicado tras la consulta opcional.

Humedad de pista REST 0–1 y severidad de lluvia nativa SHM 0–1 conectadas con caducidad por campo. [Autoridad meteorológica](../../analysis/isa-1347-weather-authority.md). Viento sin unidad probada, dirección y presión sin autoridad permanecen ausentes. Bandera REST requiere correlación positiva con una sesión activa. No confundir pruebas de fixtures con certificación del simulador activo.

Producto validado en `95ad1dc3`, tras corregir los hallazgos de las revisiones independientes y el lector de posiciones Relative desconocidas. En ese árbol: frontend completo, 480 archivos, 4.037 PASS y 2 omitidas; Go focal de siete paquetes, tipos/generador, build frontend, build cruzado Windows, lint y ratchet aprobados (NEW=0, MOVED=0, policy_changed=false). Compactación sin pérdida ni aumento de presupuesto: 64.880 / 71.120 / 73.096 bytes. Backend/frontend requieren el mismo build; lector nuevo admite wire anterior. [Evidencia y límites](../../analysis/isa-1347-verification.md). Suite global Go en macOS sigue roja por fallos reproducidos en la base (diagnostics, SQLite y launcher), no se ocultan. La [PR #1352](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1352) se rebasó sobre `origin/nightly@b725c402` y se regeneró `roadmap.json`. El head remoto `c2999ac5` falló el gate compacto (1,906 ms frente a 1,5 ms). El siguiente head `5bf052c8` aprobó promoción, gates bloqueantes y GitGuardian, pero el ratchet reportó `jscpd NEW=2` en validaciones de forma repetidas. El ajuste local actual extrae `validQualityValueShape`; el scan directo solo conserva un duplicado cuyo hash ya figura en el baseline. Pruebas dirigidas 39/39; última muestra de rendimiento bajo carga: legacy 1,188 ms y compacto 1,440 ms; suite completa 481 archivos, 4.035 PASS y 2 omitidas al limitar Vitest a dos workers; build, typecheck y lint PASS. El CI remoto del seguimiento del ratchet aún está pendiente. Isaac solicitó explícitamente integrar la PR a Nightly el 2026-09-23; todavía no hay merge. Sin promoción adicional ni release. Próximo paso: publicar la corrección de duplicación, esperar todos los gates remotos y después continuar la verificación física en LMU/Windows/Desktop/OBS antes de cerrar las cinco correcciones de Asana.


## ISA-1320 — Relative: movimiento discreto para conducción (2026-09-22)

Seguimiento por decisión explícita de Isaac en [Asana](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218756738527745), En curso. Puente técnico [#1320](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1320). Base `nightly e6d7d2b5`, rama `vantareapp/isa-1320-relative-motion`.

Isaac pide animaciones más suaves que Standings y elige «movimiento suave y una señal de color muy tenue». GPT-6 Sol implementa el renderer en worktree propio; GPT-6 Luna prepara escenas de Workshop aparte; GPT-6 Astra revisará el commit de producto independientemente. Deslizamiento de rivales sin rebote, jugador estable, cifras sin animación, fundidos breves al entrar/salir y color tenue únicamente ante cruce real. La telemetría ordinaria no debe reiniciar animaciones ni medir layout. Respetar modos de movimiento y limpiar efectos al cambiar sesión, fuente o geometría.

La inspección inicial detecta reinicio de FLIP por cada modelo, ausencia de baseline inicial y descripciones de escenas que prometen efectos distintos del renderer. Se corrigen dentro de esta entrega. Implementación y escenas presentes en `c809d5e8`: deslizamiento de 220–300 ms, señal de color de hasta 4 %, entradas/salidas de 120 ms, huecos delante/detrás que estabilizan jugador y pie. Solo un cue por rival; cambios de cifras no reinician FLIP. Los cambios de tamaño o movimiento reaccionan aun conservando el mismo modelo. La revisión independiente GPT-6 Astra pasa 50 tests y comprobaciones WAAPI activas de StrictMode, escala 1,5, retarget, salida a mitad de movimiento y desmontaje. Root verifica 43 tests focales y comprueba los participantes visibles de todas las escenas en práctica, clasificación y carrera. La suite frontend completa del conjunto `c809d5e8` pasa 469 archivos y 3795 pruebas (2 omitidas). El refinamiento posterior `b7a19184` conserva opacidad en reentrada y cancela temporizadores; pasa 39 pruebas focales, typecheck, build, lint y ratchet (NEW=0, MOVED=0, policy_changed=false). La corrección `cf14f927` conserva también la opacidad en una segunda salida durante esa reentrada. Revisión independiente final GPT-6 Astra en `d869f521`: 7/7 pruebas Relative y diff limpio, sin hallazgos pendientes. Root repite build y ratchet sobre ese árbol final: PASS, NEW=0, MOVED=0, policy_changed=false; tipos y lint también pasan tras `cf14f927`. La suite completa antecede a esos refinamientos acotados; no se presenta como repetida sobre el último SHA. Pendiente aceptación visual de Isaac. El acceso automatizado al navegador ha estado bloqueado; no se afirma validación visual ni física. Sin autorización de integración para esta entrega. La PR #1306 de Standings permanece separada.

### Idioma — integración verificada

La PR [#1317](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1317) fue integrada por squash en `nightly` como `e6d7d2b5e58f55b82c0ed2f6a79667476d897086`, después de la aceptación de Isaac. Head fuente `86249c3a`; checks remotos de promoción, blocking gates, ratchet y GitGuardian aprobados. Árbol remoto coincide con la entrega. Asana `1218757534554194` registra integración y conserva pendiente la revisión física Windows/OBS que Isaac hará en nightly. No se promovió a testers/master.

## ISA-1332 — Horizontal Standings: animaciones (2026-09-23)

Seguimiento principal en [Asana](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218756818225223), En curso por petición de Isaac. [Puente técnico #1332](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1332). Base `nightly e6d7d2b5`; rama `vantareapp/isa-1332-horizontal-motion`. [Plan](../../plans/2026-09-23-isa-1332-horizontal-motion.md).

Isaac confirma Relative y Pedals; ambas revisiones se marcan completadas en Asana, sin confundir Pedals con Pedals telemetry ni aceptación con integración remota. El horizontal carece de animaciones en su renderer Eficiencia y usa una clave dependiente de la posición. Se implementan identidad canónica, movimiento horizontal discreto, fundidos de presencia y señal tenue de posición, con cifras estables y sin trabajo de animación por telemetría numérica. GPT-6 Sol trabaja renderer/VM/pruebas; GPT-6 Luna, escenas; el orquestador revisa y compone. Próximo paso: verificar e incorporar al preview combinado, preservando Delta/Standings/Relative. Sin merge ni certificación física.

### ISA-1332 — renderer verificado

Renderer/VM de GPT-6 Sol en `6c67ed73`: IDs canónicos, desplazamiento horizontal de 250–360 ms, fundidos de 120 ms y señal verde/roja al 5 % durante 450 ms. Cifras no inician efectos; 100 muestras quietas y durante movimiento/entrada no añaden mediciones, timers ni animaciones. Modos reducidos, retarget a escala 1,5, salida durante entrada y StrictMode cubiertos. Worker: 44 pruebas focales, tipos/build/lint de archivos modificados PASS. Root: suite frontend completa sobre el renderer y documentación, 469 archivos, 3790 PASS y 2 omitidas; el warning AbortError de cierre del entorno DOM no produjo fallo. Se retiraron únicamente cinco PNG de revisión regenerados incidentalmente por la suite, manteniendo las referencias versionadas.

GPT-6 Astra revisa independientemente los ocho archivos y pasa 40 pruebas: sin hallazgos bloqueantes. [Informe](../../analysis/isa-1332/motion-review.md). Los efectos React siguen ejecutándose y retornan antes de medir/animar; no se promete coste CPU nulo. Sin inspección visual de navegador/WAAPI físico. Próximo paso: incorporar y comprobar las escenas y el preview combinado.

### ISA-1332 — entrega preparada para revisión visual

Escenas de GPT-6 Luna `8d6f1239`: Secuencia completa, Cruce de posiciones, Inversión rápida, Salida y reentrada y Cifras sin reordenar. Filtro Eficiencia y pasos exactos en pausa; 65 pruebas focales y tipos PASS. Root compone el candidato fuente `4fcafa59`, idéntico al árbol comprobado `511489f0`: frontend completo 469 archivos, 3794 PASS y 2 omitidas; lint, build/TypeScript y ratchet PASS (NEW=0, MOVED=0, policy_changed=false). Contrato de roadmap verificado contra la issue viva: únicamente `milestones:functional-widget-design`. No se tocaron reglas, dependencias ni código Go; no se repitieron pruebas globales Go por ese alcance frontend.

GPT-6 Sol integra en una copia del preview y resuelve los conflictos conservando los filtros por sistema/sesión, los pasos exactos y todas las escenas Relative/Standings. Preview limpio `752bc0cc`: 188 pruebas focales del conjunto, tipos/build y diff limpio PASS. Root revisa el diff respecto a `d3aea8bc`: el CSS modificado se limita a Horizontal Standings, sin recuperar las transformaciones Delta retiradas. El servidor existente 5177 sigue en el mismo directorio; su checkout pasa a `752bc0cc` únicamente tras comprobar la composición. La apertura de la pestaña se solicitó a Codex y quedó encolada; no equivale a inspección visual.

Revisión manual: [Workshop · Secuencia completa](http://127.0.0.1:5177/workshop?widget=broadcast-tower&system=vantare-functional&session=race&scene=broadcast-tower-overtake-sequence&frame=0&brand=off) → Reproducir. Revisar después Inversión rápida y Salida y reentrada; repetir práctica/clasificación y movimiento reducido. Asana Horizontal Standings sigue En curso hasta aceptación de Isaac. Relative y Pedals están completados por su confirmación. Fuente `vantareapp/isa-1332-horizontal-motion` desde nightly `e6d7d2b5`; publicación como PR draft, sin merge ni promoción. El seguimiento Asana conserva la URL/SHA y el estado remoto actual tras publicar. Sin certificación visual nativa ni Windows/OBS.

## ISA-1162 — enlace OBS restaurado al pie del dock del Studio (2026-09-11)

Issue [#1162](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1162),
rama `vantareapp/isa-1162-obs-studio-link`, worktree `vantare-isa1162`,
PR draft [#1166](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1166)
hacia `nightly` (base `origin/nightly` 1487ec2e).

- El backend publica su dirección bound: `obs:url:get` → `obs:url` con
  `{baseUrl: "http://<addr>"}` desde `server.Addr()` (`cmd/vantare/obs_url.go`),
  registrado en `main.go` tras `httpSrv.Start()`.
- `useObsBaseUrl()` (`overlay-studio/orbit/obs-url.ts`) hace la petición y
  cae a `http://127.0.0.1:39261` hasta que responde; `buildObsOverlayUrl`
  arma `/overlay?profile=<fichero>` (fallback `example-streaming.json`).
- `StudioObsLink` vive como pie fijo del dock derecho del Studio (bajo el
  inspector, siempre visible con el dock abierto), con copiar URL e
  instrucciones. Una sola suscripción por árbol: la base se resuelve en
  `OverlayStudioV3` y baja por props (el test de StrictMode exige un
  listener por evento).
- Browser View ya no usa `window.location.origin` (wails:// en prod):
  abre contra el mismo origen real.
- Retirado el modo `obs` huérfano: `ObsOverlaySetupView`, `ObsSetup` y el
  target de la unión `studio-route-target`.
- i18n `studio.obs.*` en es/en/pt/it. Ojo: el boundary test de
  `overlay-studio` prohíbe tildes/ñ entre comillas o backticks en fuentes
  productivas — los docstrings van sin caracteres de cita.
- Docs: `obs-local-setup.md` apunta al nuevo punto (la sección Ajustes que
  anunciaba ya no existe); `engineer-obs-setup.md` corrige el puerto
  34115 → 39261. Hito `obs-browser-source-link` en `plan.md` +
  `roadmap.json` regenerado + fragmento `ISA-1162.json`.

Verificación: tests focales 54 PASS, `pnpm test` 3360 PASS, lint,
typecheck y build limpios; `GOOS=windows go build`/`vet` de
`cmd/vantare` limpios. Runtime real comprobado en este equipo con el
servidor levantado a mano: `/health` 200, `/overlay?profile=` 200 HTML,
`/api/profile-v3` 200 por filename/stem/id documental. Sin prueba en OBS
real (requiere la app Wails completa). Hallazgo aparte: el paquete
launcher no compila en darwin — issue #1167.

## ISA-1140 — Cascadia Code a subset WOFF2 latino (2026-09-11)

Issue
[#1140](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1140),
rama `vantareapp/isa-1140-fuente-subset`, worktree
`/Users/isaacalbala/Desktop/vantare-isa1140`. Cierra la limitación que dejó
ISA-940: aquella máquina no tenía `pyftsubset` y la fuente siguió como TTF.

- `pyftsubset` (fontTools 4.65 + brotli en venv `/tmp`, sin dependencias del
  proyecto) genera `CascadiaCode-subset.woff2` de 74 KB: Latin, Latin-1,
  Extended-A/B, puntuación general, flechas, operadores matemáticos,
  misceláneos técnicos, box-drawing/geométricos y Dingbats. Conserva el eje
  variable `wght` 200–700 y las ligaduras `calt` (`=>`, `->`, `<=`, `!=`).
- `fonts.css` apunta el `@font-face` al woff2. `CascadiaCode.ttf` queda en
  el repo como fuente de regeneración, sin entrar al bundle: Vite solo emite
  `dist/assets/CascadiaCode-subset-*.woff2` (74,17 kB).
- Verificación: cmap cubre U+00C0–U+017F completo; todo carácter no-ASCII
  usado en `src` que exista en la TTF sigue cubierto (los que no existían —
  emoji, ⚙, ⚠, ↵ — caen al fallback como antes); 267 glifos de ligadura
  conservados. Typecheck, lint, 3355 tests y build PASS.
- Nota de contrato: la issue declara `roadmap:not-required` pero el diff es
  código productivo; el validador en modo `audit` lo marcará sin bloquear.
- Sin merge ni promoción; PR draft a `nightly`.

## ISA-1152 — editor in-place C5: rediseño toolbar/frames, pestañas y panel ocultable (2026-09-11)

Quinto corte, apilado sobre la rama de ISA-1143 (`a8d8db1a`). Issue
[#1152](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1152),
rama `vantareapp/isa-1152-inplace-editor-c5`, worktree `vantare-isa1152`.
Feedback visual de Isaac sobre las capturas de C2–C4.

- **Frames**: outline no seleccionado pasa de rojo suave a gris fino; el
  seleccionado conserva el acento con glow exterior y los handles de resize
  son circulares.
- **Toolbar**: chip + sesión + "+ Widget" + Hecho dentro de una pill con
  blur (`inplace-toolbar*`), sin estilos inline dispersos.
- **Panel con pestañas**: una pestaña por sección resuelta
  (`resolveInspectorSections`), solo un cuerpo visible; pestaña por
  defecto = layout, la elección muere con el widget.
- **No tapa widgets**: botón de ocultar deja una pestaña de borde
  (reabre al click o al hover) y el panel se vuelve fantasma
  (`--ghost`, `pointer-events: none`) mientras `interaction.isInteractionActive`.
- **Modo flotante**: toggle en la cabecera; el panel se arrastra por su
  header y persiste `{mode, x, y}` en `localStorage` (`vantare.inplace.panel.v1`).

Verificación: tests focales 36 PASS (nuevos: ocultar→pestaña, ghost en
drag, flotante + drag de header, pestañas cambian sección), lint,
typecheck y `diff --check` limpios. Capturas `/tmp/vantare-shots/c5-*.png`.
Pendiente: commit, push y PR draft; sin prueba física LMU.

## ISA-1143 — editor in-place C4: secciones de diseño y acciones (2026-09-11)

Cuarto corte, apilado sobre la rama de ISA-1141 (`dfa24d18`). Issue
[#1143](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1143),
rama `vantareapp/isa-1143-inplace-editor-c4`, worktree `vantare-isa1143`.

El panel in-place deja de hardcodear secciones: ahora las resuelve con
`resolveInspectorSections` (mismo orden y gating por widget que el Studio)
y renderiza `DesignSection` (sistema/variante, aplicar a todos con
confirmación Studio, guardar como diseño, gates de licencia) y
`ActionsSection` (restaurar valores —conserva layout— y descartar todo,
vía `discardAll` del store). Nueva clave `studio.inspector.section.actions`
en los 4 locales.

Verificación: tests focales 34 PASS (3 nuevos: secciones diseño+acciones
con títulos traducidos, restaurar defaults conservando layout, descartar
todo vuelve al documento guardado), lint, typecheck y `diff --check`
limpios. Capturas `/tmp/vantare-shots/c4-*.png`. Pendiente: commit, push
y PR draft; sin prueba física LMU.

## ISA-1141 — editor in-place C3: catálogo de widgets y selector de sesión (2026-09-11)

Tercer corte, apilado sobre la rama de ISA-1129 (`6bb5e9a0`). Issue
[#1141](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1141),
rama `vantareapp/isa-1141-inplace-editor-c3`, worktree `vantare-isa1141`.

La barra del editor in-place gana dos piezas del Studio sin capas nuevas:
el diálogo `AddWidgetDialog` (botón `+ Widget`) reutilizado tal cual —gates
de licencia, delta único por layout y `buildAddWidgetCommand` con su
posicionamiento por defecto— y un selector de sesión
(general/práctica/clasificación/carrera/resistencia). Sin override se edita
la sesión que el runtime muestra; con override se previsualiza
`resolveSessionLayout` (clon de general si la sesión no existe aún) y el
primer comando la materializa vía `withSessionLayout`, idéntico a Studio.
Cambiar de sesión deselecciona y cierra el menú contextual.

Cambio transversal: `DEFAULT_ACCESS` del panel pasa a `FREE_ACCESS` en
`lib/access-policy.ts` — el `export` de constante en un archivo de
componente rompía la regla `react-refresh/only-export-components` y el
fallback de acceso queda en el hogar natural del tipo.

Verificación: tests focales 31 PASS (3 nuevos: materialización de sesión al
primer edit, añadir desde catálogo, cancelar el diálogo), lint, typecheck y
`diff --check` limpios. Capturas locales `/tmp/vantare-shots/c3-*.png`.
Pendiente: commit, push y PR draft; sin prueba física LMU. Siguiente: C4
(diseños + acciones de restauración).

## ISA-1129 — editor in-place C2: panel colapsable, layout numérico y fixes (2026-09-11)

Segundo corte de la paridad comprimida, apilado sobre la rama de ISA-1123
(`02f266d8`). Issue
[#1129](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1129),
rama `vantareapp/isa-1129-inplace-editor-c2`, worktree `vantare-isa1129`.

El panel in-place ahora reutiliza `LayoutSection` del Studio (X/Y/W/H
numérico, bloqueo de proporción, orden z, centrar y restablecer — todas las
acciones pasan por `StudioCommand`/`executeWidgetAction` existentes), se
pliega a su cabecera con un chevron, y salta a la izquierda cuando el widget
seleccionado ocupa la mitad derecha del overlay, de modo que nunca tapa lo
que se edita.

Fixes incluidos que ya eran defectos antes de este corte: los títulos de
sección del panel usaban claves i18n inexistentes
(`overlay.studio.inspector.sections.*`) — corregido a
`studio.inspector.section.*` con nueva clave `content` en los cuatro locales;
`WidgetContextMenu` no clampeaba su posición al viewport (desbordaba en
clicks cerca del borde, también en Studio — ahora mide y recoloca en
`useLayoutEffect`); el comparador de `memo` del panel ignoraba
`autosave.paused` y congelaba los chips de conflicto/reintento.

Verificación: suite frontend completa PASS (3346 tests tras el fix de
`progreso: 78` → escala válida en `plan.md`, corregido también en la rama de
C1 como `02f266d8`), typecheck, build, lint y `git diff --check` limpios.
Capturas locales en `/tmp/vantare-shots/c2-*.png` sobre harness
`inplace-edit-harness.html` (localhost:5200). Pendiente: commit, push y PR
draft; sin prueba física LMU. Cortes siguientes: añadir widget y selector de
sesión (C3), diseños y restauración (C4).

## ISA-1123 — editor in-place C1: teclado, acciones y salida (2026-09-11)

Isaac pidió iterar el editor in-place del overlay desktop (`Ctrl+Shift+E`)
hacia paridad comprimida con Overlay Studio; se aprobó el Corte 1 de cuatro
(teclado + acciones de widget + salida visible). Issue
[#1123](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1123),
rama `vantareapp/isa-1123-inplace-editor-c1`, worktree propio
`vantare-isa1123`, base `origin/nightly@131471ff`.

Implementado reutilizando el modelo de comandos del Studio sin capas nuevas:
`getStudioHotkey` cableado en la rama de edición (undo/redo, `Ctrl+D`,
`Delete` con `StudioConfirmProvider`, flechas 1/8 px, `Esc` deselecciona en
idle, `Tab` cicla, `Ctrl+S` guarda), menú contextual `WidgetContextMenu` por
click derecho, toggle de visibilidad en la cabecera del inspector
(`widget/behavior`/`enabled`), botón Done que emite `overlay:toggle-edit-mode`,
deselect al pulsar el fondo y `interactionActive` real en el autosave. Fix
incluido: `useInplaceAutosave` ahora vacía `coalesced` al terminar el gesto —
sin ese flush, un save diferido por gesto activo nunca llegaba. También se
cargan `orbit-kit.css`/`orbit-studio.css` en la ventana overlay: el panel
in-place existía desde F2 pero sin el CSS del inspector compartido.

Verificación: 3343 tests frontend PASS (424 archivos), typecheck, build y
lint focal PASS, `git diff --check` limpio. Pendiente de PR draft a nightly;
sin prueba física LMU en este corte. Cortes siguientes no entregados: panel
colapsable/reubicable y layout numérico (C2), añadir widget y selector de
sesión (C3), diseños y acciones de restauración (C4).

## ISA-1098 — Efficiency integrada en Nightly (2026-09-12)

Integración autorizada por Isaac el 2026-09-12. El smoke físico final usó la
build diagnóstica Wails generada por `scripts/bench/build-measurement.ps1` con
el `.env.local` externo autorizado, sin copiar ni mostrar valores. El binario
`bin/vantare-isa1098-smoke.exe` mide 33.310.720 bytes y tiene SHA-256
`F7064850C77B2BCB4716F391AAD869F601300213748B983BEEB2C14EFFAFB50C`.
En la sesión Free, Studio guardó Efficiency Broadcast, lo pintó mediante el
renderer productivo y restauró Signature. Dos ciclos reales abrir/detener
acabaron en 394/52 ms y 366/56 ms, sin cierre de Vantare; Ajustes, Carreras y
el regreso a Studio cargaron correctamente. El overlay montó sus tres frames,
pero LMU no estaba emitiendo y mostró el diagnóstico canónico
`Overlay V2 frame unavailable`: esta prueba no acredita bandera ni temperatura
en sesión activa. La rama se reconcilia con `origin/nightly@9651733f`, que ya
contiene #1165 y #1168; se conservan las implementaciones compartidas y
granulares ya revisadas del candidato. Este mismo PR registra la integración
a Nightly; no promociona a testers/master ni publica una release.

Extensión de integración del 2026-09-12 autorizada por Isaac: el candidato
incorpora las mejores implementaciones vigentes de #1157, #1168, #1163,
#1161, #1118, #1170, #1117, #1122, #1158 y #1165 como bloques
independientes. El runtime reutiliza el contexto y sus firmas cuando no cambia
su contenido; settings, licencia y updater tienen un único fanout Wails por
canal; Studio usa un store externo con selectores granulares; las rutas
desmontables cancelan trabajo pendiente; SideRaces reduce su cadencia cuando
la salida está lejos; y el mapper evita el slice temporal de calidad por
vehículo. El Hub comparte una sola suscripción para overlays y calendario,
carga sus páginas y los idiomas secundarios bajo demanda y obedece el
presupuesto de efectos `noBlur`/`flat` publicado por Go. La adaptación de #1163 conserva
`WidgetPolicyWire` como única autoridad Free/Pro y no recupera
`AccessContext`. La variante de #1170 que exponía un slice global mutable se
reemplazó por un array devuelto por valor con regresión específica. Se excluyen
la conversión de fuente ya superada de #1118, el componente `ObsSetup` ya
retirado y el PR #1132 por duplicar esos bloques. #1180 y #1182 permanecen
separados porque cambian la apariencia de otras pantallas y no son una mejora
del candidato Efficiency.

Gate completo de la extensión ampliada: frontend 448 archivos, 3557 pruebas
PASS y 2 omitidas; typecheck, lint y build web PASS; `go test ./...` PASS. El
`AbortError` de happy-dom conserva exit 0. La división por página deja la shell
principal en 69,48 kB y Studio en un chunk bajo demanda de 81,05 kB; no se
declara todavía ahorro físico de CPU, GPU o memoria. Build Wails forzada con
canal `nightly` desde el `.env.local` original autorizado: URL, anon key y
registro público de licencia coinciden embebidos mediante su representación
base64, sin copiar ni mostrar valores. `bin/vantare.exe` mide 29.957.632 bytes
y tiene SHA-256
`465444F142848FD2AFD4B4FD0B1DF05E535631170D25C43CE8CE351EF5049344`.
La base se actualizó a `origin/nightly@079fbfe3`; su nuevo roadmap de beta y
la integración oficial de #1170 se conservaron. La resolución mantiene
`AllSections` devuelto por valor para no exponer el array global mutable del
PR original, y el digest se regeneró desde `plan.md`. Esta build todavía requiere
el smoke manual conjunto antes de integrar a Nightly y no acredita la
equivalencia de bandera durante una sesión LMU activa.

Actualización vigente: la rama se reconcilió con `origin/nightly@e13756ef`
en `a8eedecf`, conservando el editor in-place actual y adaptando su inspector,
catálogo y guardado a `WidgetPolicy`. Después incorporó la rama completa y
validada de #1127 en `d9a2c56d` y las señales REST LMU revisadas de #1106 en
`0168a2a9`. El candidato reúne por tanto #1083, #1103, #1097, #1105, #1106 y
#1127; no crea otro renderer, autoridad de licencia ni lector LMU.

La resolución productiva del editor in-place pasó typecheck y 46 pruebas
focales. El conjunto reconciliado pasa 104 pruebas focales de Efficiency,
marca, política, transporte y edición; 3515 pruebas frontend (440 archivos,
2 omitidas), `go test ./...`, typecheck, lint y build web. El ruido
`AbortError` de happy-dom conserva exit 0 y la build mantiene el aviso ya
inventariado de chunks mayores de 500 kB. `plan.md` declara los cuatro hitos
afectados (`functional-widget-design`, `widget-access-branding`,
`telemetry-live`, `overlay-tester-feedback`) y `roadmap.json` se regenera
desde la base Nightly confiable.

La build Wails configurada pasó con el procedimiento oficial y las tres
variables públicas de `.env.local` quedaron embebidas (comparación booleana,
sin imprimir valores). El ejecutable resultante mide 29.903.360 bytes y tiene
SHA-256 `1854A0EA2FC723B8F16BADDFEDF5DF7B359F8DCA84800F2E06BF5BF53B55C3C4`.
Sobre esa unidad se comprobó físicamente Efficiency Signature y Broadcast en
Studio con la política paga vigente: marca apagada por defecto, cabecera y pie
configurables y persistencia de Broadcast. Con el overlay abierto se hicieron
dos guardados reales Signature -> Broadcast; ambos registraron
`studio profile saved`, recrearon WebView2 y la app siguió respondiendo. El
ciclo detener -> abrir -> detener acabó en `Abrir overlay`, también estable.
El recorrido exacto Home `Abrir overlay` -> `Abrir Studio` detuvo el overlay y
abrió el editor sin cierre ni bloqueo. Los perfiles y calendario tocados por
el smoke se restauraron y el árbol tracked quedó limpio.

La política Free permanece cubierta por regresiones automatizadas, pero no se
presenta como prueba física: dos intentos portables sin `license-cache.json`
continuaron viendo la sesión paga del perfil WebView2 compartido de producción.
Aislarla exigiría cerrar sesión o mover datos reales del usuario, acciones que
se descartaron. Durante el smoke se descubrió además un fallo separado: si el
Hub está descargado, detener el último overlay cierra Vantare tras agotar dos
segundos al apagar HTTP; queda aislado en #1178 y no se mezcla en #1098.

Siguiente gate: una sesión LMU activa debe confirmar temperaturas y
equivalencia de bandera REST. Ausencia, invalidez o caducidad permanecen
neutras. PR #1107 continúa en draft; sin merge a Nightly, testers/master ni
release.

Rama `vantareapp/isa-1098-efficiency-integration`, worktree `C:/tmp/vantare-isa1098`,
base reconciliada `e13756ef` (= `origin/nightly` verificado). Solo se
reúnen commits aprobados, conservando historia con merges locales. Candidato
preparado en rama de issue; el estado de publicación, PR y CI del SHA actual
se consulta en la issue #1098. Sin merge a Nightly, testers/master ni release;
comprobación física LMU activa pendiente.

Merges locales: `205fa091` <- `87cef39a` (#1083 Signature/Broadcast),
`ec9d6d19` <- `6ae58f6e` (#1103 banderas y slots de sesión),
`85f739ba` <- `3b490906` (#1097 política nativa, guards y transportes) y el
merge de `cd334d14` (#1105 acceso y marca en React: nativa `3b490906`,
frontend `cd334d14`). Policy, guards y cableado Wails/SSE de #1097 intactos;
#1105 migra por completo a WidgetPolicy los 6 archivos access/catalog/orbit/store
(sus versiones, sin declaraciones legacy huérfanas; denegaciones Free,
delta/premium y delete/move preservadas). `WidgetVisualHost` une AMBAS props
`authoringModel` (solo dev) y `brandVisible`; el renderer usa `visualModel` +
`presentationSettings`, preservando Tower de autoría y marca. Plan elige solo
el hunk actualizado de #1105, resto de Nightly intacto; handoff conserva AMBAS
secciones. Los conflictos de este último merge los resolvió el padre; Muse no
rediseñó ni arregló producto.

Cruces resueltos semánticamente, sin copiar versiones enteras: Redline Tower y
dorsales canónicos de PR #1102 preservados (cero ficheros borrados); ambos
estilos Efficiency y pie/cabecera nuevos conservados; `WidgetVisualHost`
sigue frontera única con ViewModels puros; canvas conserva preview DOM
imperativa; IDs estables `vantare-functional`,
`standings-functional-compact`, `standings-functional-broadcast`. Detalle:
Workshop une overrides Redline + columna funcional y controles de estudio con
aside de laboratorio; viewport une geometría Tower (482) con fluidez
Redline/Functional; caracterización pasa a 67 diseños (Tower + 2 Functional);
ViewModel une `trackName`/`totalRows` con `flag`/`sessionInfo`; golden une
metadato Tower e información de sesión.

Adaptación test-only detectada por focales: #1083 retiró
`resolveStandingsRedlineFrameLayout/MoveLayout` y el test Tower de #1102 lo
importaba (4 fallos). El test usa ahora el patrón vigente
`resolveMinimumWidthFrameLayout(layout, resolveStandingsRedlineMinimumWidth(widget))`,
misma aserción y mismos valores; sin cambios de producto ni tolerancias.

Roadmap: `plan.md` solo añade los dos hitos exactos de #1098
(`milestones:functional-widget-design` como feature,
`milestones:widget-access-branding` como feature con el hunk actualizado de
#1105: política nativa por widget, marca Free obligatoria y comprobación
física/integración pendientes); ningún otro hito de la base cambia.
`roadmap.json` regenerado con
`.github/scripts/roadmap_digest.py --repo . --ref origin/nightly`, nunca a mano.

Límite #1106 confirmado por revisión: BuildSession (bandera) y BuildWeather
(temperaturas) publican missing porque no hay fuente canónica admitida;
Efficiency muestra neutro/`—`; circuito/remaining/fuel.sessionLaps sí reales.
No se arregla con otro lector ni se inventan datos. Sin animación.

Evidencia del candidato final (logs en `vantare-v2/.task/isa-1098-evidence/`,
carpeta ignorada; base `a9b8dd36`, código revisado `426f75b4`): React 439
archivos / 3483 PASS / 2 omitidos (exit 0; ruido happy-dom heredado en
stderr); tipos, build (aviso heredado de chunks >500 kB), lint, Go completo
(cero FAIL) y build nativo PASS — 6 exit 0 confirmados por el padre. Gate de
coherencia roadmap PASS, digest idempotente y gate de contrato de PR PASS
(exactamente los dos IDs declarados). Revisión final aprobada sin hallazgos.
Señal #1106 (bandera/temperaturas missing) y comprobación física conjunta
Studio/guardado/Desktop/OBS pendientes; el harness no acredita Wails/LMU ni
licencia real. Sin probar Wails/LMU aquí.

## ISA-1105 — Acceso y marca por widget en React (cierre frontend 2026-09-10)

Hijo de #1097 aprobado por Isaac. Rama
`vantareapp/isa-1105-widget-access-branding-ui`, worktree
`C:/tmp/vantare-isa1105/vantare-v2`, base `6ae58f6e` (#1103 sobre
#1083@87cef39a); nativa #1097 en commit `3b490906`. Roles vigentes: Codex
implementa, Muse mecánica/revisión acotada. Inicio dirty intencionado del
primer corte #1097 (Delta advanced, borrar/mover/conservar bloqueados)
preservado y completado.

Consumo frontend de la política nativa `WidgetPolicyWire` (sin PII) con una
sola autoridad: sin snapshot vigente rige Free básica, sin fallback legacy.
Wails `widget-policy:get` → `widget-policy:snapshot` + `widget-policy:changed`
(suscribir antes de pedir); OBS SSE `/api/widget-policy/stream` con snapshot
autoritativo y `changed` solo mayor. Revisión menor solo tras reconexión
reconocida; caducidad con temporizador acotado por tramos (2^31-1) que
notifica, pide snapshot fresco y nunca prolonga premium. Studio filtra en
catálogo/inspector/dispatch/guardado; Desktop/OBS filtran antes de crear
`RuntimeWidgetFrame`/suscribir telemetría. Marca integrada Crystal/Efficiency
obligatoria en Free (banda propia con cabecera oculta, dentro del marco
calculado y sin recortes; Pedals lleva micro-chip discreto sin intersección
con canales), oculta por defecto en pago con opt-in `showBrand`. Original sin
cambios. Guardado nativo denegado (`code: widget-access-denied`) se mapea al
aviso traducido existente, también en InPlace.

Evidencia: 326 tests del bloque de lógica PASS (focales + consumo Desktop/OBS
con downgrade vivo); P1 candado de marca y P2 aviso InPlace cerrados con
33/33 focales (Appearance 8/8, InPlace 11/11, profile-client 14/14);
typecheck PASS; geometría Chromium real Signature/Broadcast/Crystal con
cabecera/pie ocultos y doctype fiel; 4 capturas auténticas en
`C:/tmp/vantare-isa1105-captures/` (las 4 primeras descartadas por fixture en
quirks; visual 9/10 en SSR/harness, prueba física pendiente); hito roadmap en
`feature` con `roadmap.json` regenerado. Full, build y lint, una sola vez
sobre el candidato conjunto #1098. Sin push/PR/merge, sin testers/master/
release, sin LMU físico ni licencia real afirmados.

## ISA-1103 — Información de sesión en Efficiency (2026-09-10)

Petición adicional de Isaac: diagonales según bandera, sin transición; dos datos
configurables en cabecera y pie opcional fino. Implementación aislada sobre
`87cef39a`, rama `vantareapp/isa-1103-efficiency-session-info`, worktree
`C:/tmp/vantare-isa1103`. Signature mantiene 50 px de cabecera y Broadcast 46;
el pie añade 22 px al marco compartido. Inspector y Workshop usan el manifest.
El refresco de Standings reconoce también cambios de información sin posiciones.

Límite confirmado: BuildSession/BuildWeather todavía publican flags/temperaturas
como missing. No se crea otra fuente de LMU. Bandera desconocida/antigua neutra;
datos ausentes «—». Vueltas estimadas desde `fuel.sessionLaps` canónico, nunca
autonomía ni un cálculo nuevo en React. El escenario de diseño invalida la
estimación del golden al sobrescribir su tiempo para no mostrar datos incoherentes.

51 tests focales y 120 regresiones de host/marco/Studio pasan. Primera suite
completa detectó 9 fallos explicados por la nueva altura, fixture sin weather y
snapshot previo al nuevo VM; los 120 tests incluyen sus correcciones y la
repetición completa posterior es verde (3377 PASS). Revisión independiente Muse
1.3 Contributor aprobada sin bloqueantes; P2 238/258 cerrado. Detalle en
[microplan ISA-1103](../../analysis/ISA-1103-efficiency-session-info.md).

P2 cerrado: Signature estrecha (Posición+Piloto, 238 px) ocultaba los datos de
cabecera. `resolveFunctionalHeaderInfoPlacement` (`inline`/`split`/`band`/`none`)
desvía la información a una franja de 22 px reservada en el marco cuando no cabe
en la zona libre; Signature conserva 50 px y Broadcast 46 px en ancho habitual,
y slots `none` o cabecera oculta no añaden franja. Evidencia: focales 9/180
PASS, suite 425 archivos con 3377 PASS y 2 omitidos (exit 0), typecheck/build/
lint PASS con exit 0; logs en `C:/tmp/vantare-isa1103-*.log`. Navegador del
orquestador sobre harness (no físico): Signature Pos+Nombre 238x394 con banda
22 px (Sebring/20:03 sin solape), Broadcast Pos+Nombre 258x414 con banda, y sin
banda (0 nodos, 392 px) con ambos datos en Ninguno. Sin cambios Go.
No es aceptación física de Isaac. Pendientes prueba física conjunta e
integración a Nightly.

ISA-1097 continúa en su propio worktree: Delta premium y eliminación tras
downgrade corregidos con 4 RED → 23 PASS. Política nativa/marca aún pendiente;
la revisión identifica transporte sin PII para OBS y conservación de vencimientos
verificados para expirar derechos en vivo. No se incluye ese código aquí.
ISA-1083 tiene CI PASS en `87cef39a`, run 34431634439. Isaac ha pospuesto la
comprobación física e integración hasta comprobar el conjunto. Sin merge/release.

## ISA-1127 — ciclo de vida de la ventana overlay de escritorio (2026-09-11, en rama)

Issue [#1127](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1127)
(`area:overlays-runtime`, `roadmap:required` → `milestones:overlay-tester-feedback`),
rama `vantareapp/isa-1127-overlay-lifecycle`, worktree
`C:/tmp/vantare-isa1127-overlay-lifecycle`, PR draft
[#1169](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1169) a
`nightly`. Origen: en la comprobación física de ISA-1098 (Efficiency PR1107 +
REST 1106) la app se cerró al abrir overlay + edición y los overlays no
reaparecieron; la reproducción física no se consiguió y este corte **no
afirma** cerrar ese crash. Lo que sí demuestran los tests con fakes son tres
defectos reales del controlador, presentes también en Nightly:

- Dos `Start` concurrentes crean dos ventanas nativas y la perdedora queda
  huérfana (siempre encima, inalcanzable por `Stop`). En producción ya hay
  Starts concurrentes: `refreshActiveOverlayAfterSave` recrea la ventana en
  cada guardado de Studio mientras el usuario puede pulsar abrir.
- `Stop` durante la creación en vuelo devuelve `running=false`, pero la
  ventana creada se instala después y reaparece como fantasma.
- `Close()` se invocaba bajo `c.mu`: un runtime nativo que despache el evento
  de cierre en la pila del caller bloquearía `HandleWindowClosed` en deadlock
  (el callback real de Wails en `main.go` ya lanza goroutine, así que el test
  síncrono prueba robustez del contrato, no el crash físico).

Corte mínimo: `internal/app/overlay_controller.go` añade `startMu` que
serializa `Start`/`Stop` y cierra la ventana anterior fuera de `c.mu` en todos
los caminos. `HandleWindowClosed` no cambia. Sin dependencias ni arquitectura
nueva.

Evidencia: 3 regresiones nuevas (`overlay_controller_lifecycle_test.go`)
**rojas en base** `131471ff` (worktree temporal detached, 3/3 corridas:
huérfana `closed=0`, fantasma `Running:true`, deadlock 2 s) y **verdes con el
fix** bajo `-race`; los 8 tests existentes del controlador pasan. `go test
./...` completo exit 0 (requirió `pnpm install --frozen-lockfile` + `pnpm
build` para el embed de `frontend/dist`). `plan.md` actualizado
(`overlay-tester-feedback`) y `roadmap.json` regenerado con
`roadmap_digest.py --ref origin/nightly`. Fragmento de changelog
`ISA-1127.json`.

La rama quedó reconciliada con `origin/nightly` `dc5e7ae1` mediante merge en
la propia rama de issue (el PR nació CONFLICTING porque nightly había sumado
ISA-1162/1152/1123; ninguno toca `overlay_controller.go`). Conflictos solo en
docs derivados: handoff (orden de entradas) y `roadmap.json` (regenerado).
Validación física local completada con `bin/vantare.exe`, reconstruido por el
procedimiento documentado (`wails3 task -f build`, canal `nightly`) desde el
`.env.local` original autorizado: URL Supabase, anon key y registro público de
licencia se cargaron solo en memoria y las tres coincidencias embebidas dieron
`EMBED_MATCH=True`, sin imprimir valores. SHA256
`FA10F5326052B115AF767B7AAB3A3E5090789F64855012D70C3821A3EFA55B8F`.

En un arranque limpio, con una sola instancia y el servidor OBS escuchando en
`127.0.0.1:39261`, se activó `Clean Overlay` y se reprodujo abrir overlay desde
Hub → abrir Studio: Hub siguió respondiendo y Studio abrió en 189 ms, sin cierre
de la app. Al entrar en Studio el overlay pasó a detenido, comportamiento
observable que no equivale a una ventana huérfana. Desde Studio se abrió de
nuevo el overlay y se realizaron dos guardados reales moviendo el widget
`delta` y devolviéndolo: ambos alcanzaron `Guardado automáticamente`, cada uno
creó un nuevo entorno WebView2 y el proceso siguió respondiendo. `Detener
overlay` volvió a `Abrir overlay`; no hubo `panic`, `fatal` ni fallo de escucha
en el log limpio. Los perfiles y el calendario tocados durante el smoke se
restauraron después y el árbol tracked quedó limpio. Esta evidencia valida el
flujo probado con `Clean Overlay`; no demuestra aún paridad de Efficiency+REST,
Pro/Owner ni todos los perfiles. Sin promoción a nightly, testers, master ni
release.

## ISA-1101 — integración inicial autorizada a nightly (2026-09-10)

Isaac solicita «antes de continuar mergea tu trabajo a nightly». Este corte
reúne exclusivamente ISA-1071 hasta `83eb38fc` (PR #1076) e ISA-1072 hasta
`7129f2a2` (código revisado `7f721def`), sobre nightly `b6b5754e`.
Rama `vantareapp/isa-1101-redline-nightly`, worktree limpio propio
`C:/tmp/vantare-isa1101`. El contenido productivo es idéntico al revisado:
solo se actualizan aquí roadmap, digest, changelog y continuidad.
La issue [#1101](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1101)
registra la PR de integración, los controles sobre su SHA y el resultado
remoto del merge. #1076 será sustituida por esa PR, sin duplicar su entrega.

Entregable inicial: Tower Preview opt-in y dorsal canónico compartido para
todos los standings. No cambia defaults ni migra perfiles. Evidencia previa:
CI de #1076 verde, revisión independiente de ambos cortes, suite frontend
424 archivos / 3333 tests y `go test ./...` PASS; la integración exige sus
propios gates antes del merge. No se deduce aceptación física de estos tests.

Excluidos y preservados: SVG experimental y extracción IA rechazada del
logo, fabricante sin fuente, configuración y datos locales de la apertura
en ISA-1072, cambios de otros agentes y archivos de entorno. El último EXE
configurado se abrió desde `bin`, pero la sesión fue interrumpida después
de mostrar «Cargando perfiles»; no se certificaron dorsales en juego ni se
confirmó el cierre de aquel proceso. No se relanza la app durante el merge.

Siguiente paso tras verificar el merge: retomar la prueba de la build
canónica con configuración autorizada; confirmar dorsales en LMU sin
inventar marcas. Logo, fabricante, animaciones y personalización modular
siguen abiertos. Integrar código en nightly no autoriza publicar recursos,
release ni promocionar a testers/master. Rollback: PR que revierta esta
integración en nightly, sin reescribir el canal.

## ISA-1072 — reconstruccion desde env.local original (2026-09-09)

Por indicacion de Isaac, reconstruccion forzada con `wails3 task -f build`
desde el `.env.local` original autorizado del checkout principal, cargando
solo las tres entradas publicas en memoria, sin copiar ni mostrar valores.
Canal explicito nightly. Frontend y Go build PASS. Comprobacion del EXE:
las tres cadenas que genera el procedimiento canonico coinciden con las
del archivo original (`EMBED_MATCH=True` para URL, anon key y registro
publico de licencia). SHA256 actual:
`F27704C64F073C1145C40C9E6D7EE1207C42EB5F9E4674B2DB6FDD681F0D1C84`.
Sustituye el artefacto previo; no se ha abierto esta nueva build ni se
extrapola a ella el resultado de acceso anterior. Sin promocion o release.

## ISA-1072 — build configurada y bloqueo de acceso (2026-09-09)

Build local desde `e1220286`, codigo revisado `7f721def`, mediante
`wails3 task -f build` con `VANTARE_BUILD_CHANNEL=nightly`. El entorno del
orquestador hereda las tres variables publicas Supabase/licencia SET;
el entorno de OpenCode no heredaba el registro. No se copiaron ni mostraron
valores. Frontend y Go build PASS. EXE `bin/vantare.exe`, SHA256
`0101ED981F800C6A71AD30F6E85652958E489AE586801A25518466A6A4DDEDA6`.

Prueba nativa: ejecutable y PID verificados. Arrancar desde el directorio
`bin` usa configuracion habitual, sin copiar credenciales; arrancar desde
la raiz del worktree usaba configs de desarrollo y abria onboarding.
Perfil habitual `Prueba Redline Tower ISA-1071` reconocido, canal NIGHTLY.
Cuenta muestra FREE/Activo y Studio sin acceso. `Comprobar acceso` termina
con `NO SE PUDO ACTUALIZAR EL ACCESO`. No hay PASS de dorsales fisicos ni
licencia de pago. No se modifico cuenta, permisos ni LMU. Instancia de
prueba cerrada y runtime liberado a Strategy. La primera apertura desde
raiz genero datos locales y actualizo calendar-lmu.json: preservados,
fuera del commit de evidencia.

Fabricante: auditoria confirma que no existe fuente integrada explicita.
Probe de solo lectura `/rest/multiplayer/teams` no produjo filas en esta
sesion; no demuestra ausencia en todos los escenarios. Hace falta decidir
fuente antes de implementar. Logo transparente pendiente; no aceptar el
SVG redibujado ni la extraccion IA opaca. Sin push, merge o release.

## ISA-1072 — dorsal canónico en todos los standings (2026-09-09, en rama)

Isaac autoriza implementar el 2026-09-09 y extiende el alcance a TODOS los
diseños de standings: corte compartido driver LMU -> Core -> Overlay V2 ->
ViewModel, sin lectores por widget ni datos inventados. Base apilada ISA-1071
`83eb38fc`, rama `vantareapp/isa-1072-standings-identities`, worktree
`C:/tmp/vantare-isa1072`. Sin subdelegación; ningún otro worker edita el
worktree.

Causa raíz: el lector REST de LMU descartaba el `carNumber` real
(`restStanding` solo conservaba player/position/laps/pitstops) y el builder
dejaba el número vacío a propósito porque `VehicleState` no tenía la señal.

Corte mínimo (solo dorsal; el fabricante queda detenido abajo):
`schema/standings.CarNumber` (string: `007` nunca se convierte a entero) ->
`rest.go` captura la rejilla por poll (slotID explícito `*int32` para no
confundir ausente con slot 0 válido, número 1-4 dígitos, duplicados contados
antes de validar) con el mismo presupuesto de polling (2 endpoints, 250 ms,
TTL 2 s, sin lector nuevo) -> `fusion.go` la une a la rejilla SHM por slot
más vehículo coincidente, solo con rejilla dentro de su TTL, sin identidad
ausente, y con suelo de sesión desde las dos señales existentes (cambio
fresco de firma pista/tipo y `ClockReset` del driver): una rejilla anterior
al límite no publica aunque el slot y la etiqueta coincidan; el join es
O(vehículos+rejilla) -> `batch_mapper.go` la traslada -> `core.VehicleState`
-> `builder_standings.go` la proyecta verbatim solo si está fresca (el wire
no lleva calidad para el dorsal). `frame.go` ya tenía `number` opcional y la
VM compartida ya mapeaba `row.number`: todos los diseños se benefician sin
cambios frontend. Sin offsets SHM inventados (el layout no tiene dorsal).
Catálogo: señal `standings.car_number` añadida como ID 52 `appended` (el
catálogo ya cubre señales REST); sin regla de matriz porque no hay escalar
que arbitrar — la autoridad es el endpoint REST acotado por su TTL.
Inventario `strategy_signal_audit` y golden `signal-catalog.md` actualizados
por procedimiento.

Fabricante DETENIDO (sin adivinar): ni el REST (`slotID, carId,
vehicleFilename, vehicleName, carNumber` observados; pitmanager confirma la
forma) ni la SHM (solo `VehicleLabel`/`VehicleClass`, etiquetas de muestra,
no autoridad) exponen marca. Resolverla exige metadatos autorizados de
vehículo (catálogo externo o lectura de `.veh`/equivalente) = dependencia
externa + decisión de arquitectura. Propuesta precisa: issue nueva para
`standings.manufacturer` como señal opcional con fuente declarada
(REST extendido si LMU lo expone, o tabla vehículo->marca versionada y
auditada), con sus tests de ausencia/correspondencia; hasta entonces la VM
mantiene `manufacturer` ausente y ningún renderer la inventa.

Tests (rojo antes, verde después): validación/`007`/stale en REST, join por
slot+vehículo, mismatch, identidad ausente, duplicados x2/x3, slot ausente
frente a slot 0, TTL, frontera de sesión por firma y por `ClockReset`,
passthrough del mapper con turnover de sesión, proyección fresca/stale/
invalid del builder y auditoría de superficies. Foco frontend 12/12 PASS
(VM `007` y gaps sin cambios).

Limitación residual honesta: un reinicio que conserve pista, tipo y reloj
continuo no levanta frontera aquí; ese caso queda acotado solo por el TTL
REST de 2 s. Sin merge, PR, promoción ni release. Sin probation física
Wails/LMU (sin control del juego en este corte).

## ISA-1072 follow-up — sello de rejilla al inicio de la petición (2026-09-09)

Review de calidad bloqueante sobre `77d5c616`: la rejilla se sellaba al
final de la respuesta REST, así que una petición enviada antes de la
frontera de sesión y respondida después pasaba el suelo con filas viejas
(repro: inicio 9.9 s, frontera 10 s, respuesta 10.1 s, mismo slot y
etiqueta). Fix mínimo en el mismo corte: `fetchREST` guarda `startedMono`
al iniciar y solo la rejilla lo usa (los escalares conservan el sello de
respuesta); la fusión no cambia. Regresión con sellos reales de fetch
(`TestRESTGridUsesRequestStartStamp`,
`TestFusionSessionFloorRejectsGridStartedBeforeBoundary`): falla sin el fix
con el `007` filtrado tal cual, pasa con él. Intenciones existentes fijadas
sin cambiar comportamiento: el match de nombre SHM mira validez, no
frescura (pin con test), y el check de fusión usa `defaultRESTTTL` mientras
`markRESTStale` aplica el `cfg.ttl` en cada poll. Sin merge, PR, promoción
ni release.

Cierre documental (2026-09-09): el reviewer acepta `7f721def` sin
bloqueantes por inspección (cierre del in-flight y TTL conservador); no
ejecutó tests. El orquestador verificó por su cuenta `go test ./...` con
exit 0 y los focos lmu/overlayv2/catalog en PASS. Siguiente paso: build
canónica y prueba física Wails/LMU pendientes. No se afirma integración en
`nightly`, y marca/logo siguen sin resolver según la propuesta ISA-1072.

## ISA-1071 — aceptación visual y corte productivo (2026-09-08)

Isaac acepta la torre y elige `redlineHeader=current`, luz roja y alpha .95.
Autoriza continuar para probarla en nightly. El siguiente corte registra un
diseño opt-in (sin migraciones), adapta su escala al marco persistido y conecta
los campos V2 disponibles. Marca y dorsal no emitidos por Core no se inventan.
No cambia la arquitectura ni absorbe #1068/#1069/#1070. Verificar tamaños,
filas completas, nombres largos, datos ausentes y sesiones; después suite,
build y revisión independiente. No hay todavía integración ni build nightly.

Implementado localmente: diseño `standings-endurance-redline-tower` (Preview),
sin cambiar el default; viewport de base 482 escalado al tamaño persistido,
filas completas y campos V2 de pista, total, posición de clase y dorsal si
existe. Inspector conserva filas y explica columnas fijas sin borrar ajustes.
La procedencia de fabricante/dorsal no emitidos vive en #1072; no tocar Core
desde #1071. Los recursos raster/fuentes del prototipo requieren cerrar su
trazabilidad para distribución antes de declarar candidato publicable.
Muse `ses_f7d72ab5cffeq7KpWw1XtUF8Z0` se abortó tras quedar sin avance,
sin cambios; el orquestador completó el microcorte. No hay workers editando.
Pruebas focales 32/32 y Chromium (280/340/482/650, gaps largos y señal atrasada)
PASS. Código guardado en `d8efd680`. Typecheck, build productivo, lint y digest
PASS. La última suite pasó 423 archivos/3332 tests y falló por el texto `95%`
del roadmap, corregido sin alterar la prueba; focal posterior 27/27 PASS.
Suite final **424 archivos / 3333 tests PASS, 2 omitidos**, exit 0, cuatro
workers; avisos heredados de teardown happy-dom sin fallos finales.
Código `d8efd680` y documentación `84589e00` subidos a la rama de issue.
Muse revisó el snapshot aislado
`C:/tmp/vantare-isa1071-review` (sesión `ses_f7d5791bcffebtSNgcFt1CvUs8`),
solo lectura. Su permiso para leer Ponytail ya está aprobado. La llamada
inicial expiró, pero la sesión siguió activa y entregó veredicto: apto para
PR draft, sin P1. Dos observaciones menores atendidas: `trim()` en la etiqueta
de sesión y documentación que distingue dorsal opcional del contrato frente
a la carencia del productor Core actual. No se retira ese gap sin datos reales.
La revisión no acredita Wails/LMU ni permite promoción/release.

Entrega preparada en [PR #1076](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1076),
**draft a nightly**, código `de1239a5` subido. Ajustes finales: 33 focales y
typecheck PASS. CI remoto pendiente; no auto-merge, promoción ni release.
Siguiente corte: cerrar recursos de distribución y #1072, después binario
configurado y comprobación física del diseño; solicitar integración solo
con los gates aplicables cerrados. No certificarlo usando el fixture HTML.

## ISA-1071 — reproducción HTML Redline en React (2026-09-08, aislado)

- Rama `vantareapp/isa-1071-workshop-redline-lab`, base/HEAD sin commit
  `b6b5754eee059bc239fce18c08b39adae8c553fa`, worktree `C:/tmp/vantare-isa1071`.
- Worker Muse inició settings/CSS; quedó sin avance y se detuvo antes de que
  el orquestador completara controles, URL, sidebar y comprobaciones.
- Isaac rechazó la primera aproximación: restilizaba la tabla compacta y no
  reproducía el HTML. Esa entrega queda sustituida por la composición Tower
  productiva de 482 × 1087: cabecera 99, categoría 38, doce filas con su ritmo
  exacto y pie 67. Perfiles anteriores mantienen `classic` por defecto.
- `WidgetVisualHost` sigue siendo la frontera única. Workshop puede entregarle
  una ViewModel de referencia explícita, solo aceptada en desarrollo; los
  escenarios V2 mantienen su autoridad y no reciben marcas/dorsales inventados.
- Fuentes y sprites son los mismos archivos del HTML aprobado. Las marcas
  solo aparecen con identidad explícita en la ViewModel; no se infieren de
  nombres. El fixture de 12 pilotos no forma parte del bundle productivo.
- Escenario `context` reutiliza la imagen del estudio, solo en la ruta de
  desarrollo. No se incorpora al widget ni a sus capturas de paridad.
- Browser: 16 combinaciones de cuatro cabeceras y cuatro selecciones, 74 nodos
  por combinación con geometría, textos y estilos medidos iguales al HTML.
  Dos instancias Desktop/OBS: 12 filas, 482 × 1087, clips independientes,
  fondo rgba(16,23,27,.95), pseudo-línea del jugador ausente.
- El estudio Tower reproduce el HTML estático: no reutiliza las animaciones
  de tabla basadas en 30px. Su adaptación modular/dinámica sigue pendiente,
  y la validación Wails/LMU. La aceptación visual posterior consta arriba. #1069 conserva
  el hallazgo de columnas de la tabla clásica; no se mezcla aquí.
- Evidencia detallada, archivos y checks: [ISA-1071](../../analysis/ISA-1071-redline-html-parity.md).
- Cierre: 422 archivos / 3324 tests PASS, 2 omitidos; typecheck, build, lint
  y diff check PASS. Fixture/escenario ausentes de dist. Avisos heredados de
  chunks grandes y teardown happy-dom registrados. Vista final abierta con
  firma, luz roja, 95%, referencia de 12 pilotos, 482 × 1087 y escala 0.65.
- Estado histórico anterior a la aceptación: valoración visual con Isaac. No commit,
  push, PR, CI remoto, merge, promoción ni release para este corte.

## ISA-1004 — Dense y Broadcast tras validación Windows (2026-09-06)

Isaac autoriza corregir ambos hallazgos y mergear a nightly. Base c18f2e6e;
rama `vantareapp/isa-1004-dense-broadcast`, worktree `C:/tmp/vantare-isa1004`.
Regresiones RED/GREEN: Dense 560x100 (con escala productiva width/360) contiene
pedales, etiquetas e historial; Broadcast omite INT32_MAX y límites inválidos,
conservando totales finitos. Revisión independiente sin hallazgos bloqueantes.
Suite413 archivos/3219 tests, build/typecheck, lint y build Windows PASS.
Studio Live y HUD sobre LMU muestran Dense completo y Broadcast sin el centinela.
Base actualizada a3f58853f tras #1003, solo conflicto derivado de roadmap.
Build/typecheck,34 tests focales y HUD con LMU repetidos PASS sobre el conjunto.
Cierre de PR#1006 y CI trazado en #1005; no testers/master ni release.
Ocultar el Hub al abrir HUD es intencionado y queda fuera del arreglo.
La auditoría física previa no certificó marcha atrás, trail dinámico ni vueltas;
esta entrega no los presenta como cerrados. Evidencia: [ISA-1004](../../analysis/ISA-1004.md).

## ISA-1000 — integración autorizada a nightly (2026-09-06)

Isaac autoriza integrar el trabajo terminado y resolver desde V2, con rollback
si falla. Base remota `483f4e80`; rama aislada
`vantareapp/isa-1000-integracion-v2-feedback`, worktree `C:/tmp/vantare-isa1000`.
Manifest: retirada completa `28bac676` + auditoría `7cd24786`, microcortes
#994/#995 y feedback #993 (`2dbf358b`). No incluye #997–999 sin terminar.
Se conservan los cambios ya integrados en nightly. Conflictos resueltos sin
resucitar builders/readers V1. Relative Redline usa la versión sin FLIP/ghosts.
Typecheck, build frontend/Windows, Go completo y lint PASS. Frontend: 3208
PASS y una suite con import legacy corregida, focal posterior 2/2 PASS;
CI debe certificar la suite del nuevo SHA. PR #1001 publicada, integración
autorizada pendiente de checks remotos. Evidencia y vuelta
atrás: [ISA-1000](../../analysis/ISA-1000-integracion.md). Los límites históricos
sobre promoción quedan sustituidos únicamente para este conjunto autorizado;
no releases ni testers/master, no aceptación física implícita.

## ISA-979 — contorno estático del mapa V2 (entrega aislada)

Derivado exclusivamente visual del pack inmutable: una caché privada de una
entrada por módulo, invalidada por identidad de geometría y dimensiones del
viewport. No retiene frames, posiciones ni configuración del usuario; cambiar
pista sustituye la entrada. Los marcadores siguen calculándose por frame.
La petición nueva de auditoría ISA-978 autoriza este corte medido; no reabre la
cola histórica ni modifica Telemetry Core o la retirada ISA-894.

Base `659b2c57dc2c7fc75962cc3c8e425ed1289266ec` (nightly), rama
`vantareapp/isa-979-cache-track-outline`, worktree aislado. Caracterización
escrita antes del cambio (11 tests), benchmark BASE/HEAD de 44 coches/Le Mans,
10 repeticiones y 1.000 warm-up. Evidencia y gates en
[ISA-979](../../analysis/isa-979-track-outline.md). Rollback: revert del PR completo.
Sin merge, promoción ni release; Windows runtime no ejecutado.

## Replanificación vigente — 2026-09-03, ISA-962

Isaac sustituye la secuencia «primero Redline → A–J» por el
[maestro de Telemetría V2](../../superpowers/specs/2026-09-03-telemetria-v2-plan-maestro.md).
Su única continuidad operativa está en [Telemetry Core](telemetry-core.md).
Este handoff conserva el expediente visual; no dirige otra cola paralela.
S3 FINAL PASS permanece acotado al candidato y evidencia indicados abajo;
S4/S5/S2 no se consideran ejecutadas ni se reanudan automáticamente. Isaac
asume las pruebas manuales del juego. Los «siguientes pasos» inferiores quedan
superados cuando contradigan esta decisión. Sin lanzamiento ni comprobación
física nueva, retirada V1, merge o release en este corte documental.

## Autoridad y lectura

- `docs/vantare-program/README.md` y `product-contract.md`.
- Overlay: ADR 0003, `docs/overlays-studio/`, proyecto Linear y sus dos HTML.
- Crystal: `docs/overlay-glassmorphism-pro.html`, solo secciones 01–16.
- Launcher: `docs/launcher-v3-architecture.md`, su plan vigente y Linear.
- Hub: código actual y characterization; los roadmaps históricos no son spec.

## Estado

- **ISA-1083 — Efficiency / Eficiencia (2026-09-10):**
  **Decisiones actuales:** Efficiency es un sistema con estilos Signature y
  Broadcast. Studio lo traduce como Eficiencia (ES), Efficiency (EN), Eficiência
  (PT) y Efficienza (IT). IDs persistidos conservados por compatibilidad.
  Delta es de pago, confirmado por Isaac; su aplicación pertenece a ISA-1097.
  CI del head `dd6a2c36` falló exclusivamente en el presupuesto temporal de
  OverlayFrameV2: 1,5 ms frente a límite estricto <1,5 ms, test no modificado.
  No se cambia el umbral; los checks del siguiente head siguen siendo necesarios.
  **Revisión de nomenclatura:** P2 detectado y cerrado con regresión RED/GREEN:
  los perfiles previos mostraban `Functional Signature/Broadcast · Preview` en
  Orbit. La presentación ahora resuelve el catálogo oficial compatible; conserva
  nombres de usuario, IDs y documentos. 31 tests focales PASS. Revisor independiente
  sin bloqueantes. Suite final: 424 archivos, 3356 PASS y 2 omitidos, exit 0;
  lint y build canónico Windows (incluye frontend/tipos) PASS. Binario local
  sin configuración de servicios añadida; no certifica licencia real.
  **Entrega del ajuste:** código en `5db70a08`, push verificado en PR #1100.
  CI remota `34430760576` SUCCESS sobre ese código: Go, frontend, tipos y
  Windows/Wails incluidos. El paso advisory de contrato roadmap señaló campos
  ausentes en la ficha; #1083 y #1097 ya usan las secciones canónicas, y el
  validador local contra el mismo HEAD y la issue viva pasa los dos IDs exactos.
  Falta la prueba física antes de integrar; Nightly sigue en `b6b5754e`.
  Workshop verificado en navegador con ambos estilos. Las herramientas de esta
  sesión no controlan ventanas nativas; no confundir esta evidencia con la prueba
  física pendiente de Studio/Desktop.
  **Entrega 2026-09-10:** implementación `d5255acd`, push verificado y PR draft
  [#1100](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1100)
  hacia Nightly. CI remota inicialmente pendiente al abrir; el resultado
  actualizado está indicado arriba. Issue en `state:in-review`.
  Worktree propio limpio. No hay merge ni release; #1098 registra la integración
  y #1097 la política comercial posterior. Las notas de iteraciones inferiores
  conservan su estado histórico y no sustituyen este corte.
  **Ejecución aprobada 2026-09-10:** cerrar el widget y su integración a Nightly
  por partes, luego unificar acceso y marca en ISA-1097. Plan vigente:
  `docs/analysis/ISA-1083-delivery-plan.md`. Primero contrato Go de guardado y
  selector normal de Studio; Workshop por sí solo no certifica estos recorridos.
  La autorización sustituye las notas históricas sin merge autorizado; siguen
  pendientes validación física y evidencia de integración (#1098). Revisión
  independiente terminada sin bloqueantes tras corregir tres P2: cabecera tras
  reordenación, anchos S/M/L y expansión junto al borde inferior. Expediente:
  `design-evidence/functional/integration-review.md`. Suite completa posterior:
  3345 PASS / 2 omitidos, exit 0; 22 focales tras el último ajuste de cabecera.
  Persistencia
  Go y selector normal de Studio terminados con regresiones RED/GREEN. Se corrige
  el marco de perfiles de 340 px mediante geometría compartida, conservando el
  preview DOM imperativo. 145 tests focales de geometría PASS; Go completo,
  frontend previo a geometría (3330 PASS / 2 omitidos), build/tipos y lint PASS.
  Isaac confirma disponibilidad sin pruebas concurrentes. La app abierta
  procede de ISA-1072, no de esta entrega: no atribuirle la nueva implementación.
  La segunda parte está trazada en #1097 con Delta de pago ya decidido.
  **Ajuste posterior:** Isaac rechaza las marcas rojas junto a los pilotos de
  Broadcast y valora positivamente el resto. Se elimina ese adorno CSS;
  las dimensiones, textos, cápsulas, cabecera y Principal se conservan.
  Ajuste verificado: 13 tests focales y build/typecheck PASS; navegador confirma
  10 filas sin marcas, con los cuatro módulos a 594 × 370 px. Evidencia nueva:
  `design-evidence/functional/standings-broadcast-clean.png`. Sin commit ni PR.
  **Última decisión:** Isaac elige la opción Images 3 como principal y la 2 como
  secundaria, ambas derivadas de la captura real de Joined01. Se trasladan al
  renderer compartido como Signature y Broadcast. Signature conserva el ID
  `standings-functional-compact`; Broadcast añade `standings-functional-broadcast`
  al catálogo. Selector en Workshop, módulos conservados y mismo ViewModel.
  Inter, filas de 30 px y selección neutra. Aceptación del React pendiente.
  Principal 238–574 px / 350 px alto; Broadcast 258–594 px / 370 px alto.
  Las 32 combinaciones y los estados de fuente pasan en navegador integrado.
  Revisión final: 9,0/10 en ambas; se refinan motivo compacto y cápsulas de
  Broadcast. Suite completa 3328 PASS / 2 omitidos, 51 focales posteriores,
  build/typecheck y lint PASS. Guard de sistemas: tres fallos Endurance
  heredados, sin ocultar. Sin Wails/LMU, commit, push, PR, CI remota o promoción.
  Detalles, referencias elegidas y evidencia en el informe ISA-1083.
  **Decisión previa:** Isaac prefiere el widget unido y rechaza la fila roja de
  Fodor y la placa del 7. Joined01 reúne las columnas sin hueco ni rebaje de
  cabecera; selección gris neutra continua y marca roja fina en el borde.
  El 7 queda sin placa. Se conserva Inter y cristal suave; no cambian datos,
  módulos ni otros renderizadores. Aceptación visual pendiente.
  Revisor Joined01: **9,0/10**, las tres correcciones resueltas en React.
  Navegador: 16 combinaciones y estados PASS, sin errores JS; Inter confirmado.
  Suite completa: 3325 PASS, 2 fallos de espera y 2 omitidos; repetición de
  ambos tests junto al estudio: 41 PASS. Se conservan ambos resultados en
  el informe; la repetición focal no equivale a una suite completa verde.
  Build/typecheck, lint y diff check PASS. Rama/base/HEAD sin cambios;
  entrega local sin commit, push, PR, CI remota ni promoción.
  **Corte anterior:** Isaac rechaza cifras desconectadas y aspecto plano.
  Depth03 unifica todo en Inter y compone núcleo y extensión con una separación
  de4px y cabecera secundaria rebajada7px; el jugador une ambas como una fila
  vino continua. Mantiene carbón/blanco/rojo y glass suave. Revisor **9,0/10**;
  aceptación de Isaac pendiente. Suite3327 PASS/2 omitidos,36 focales posteriores,
  build/typecheck/lint PASS y16 combinaciones en navegador sin errores. Altura344px,
  anchuras238–574px y nombres completos14px. Capturas finales e informe en
  `docs/analysis/ISA-1083-functional-design.md`. Sin commit, push, PR o promoción.
  Las notas y la incidencia CPU siguientes pertenecen al historial anterior.
  **Última corrección:** Isaac considera React07 un avance, pero sus colores y
  lenguaje no representan Vantare. Vantare01 sustituye azul/gris por carbón
  neutro, blanco y rojo `#C1121F`; firma compacta de marca, posición del jugador
  oblicua roja, lavado vino y nombres uppercase. Conserva cristal suave y módulos.
  Vantare02 añade el isotipo real existente a la cabecera. Revisor: 8,825 global,
  9 en identidad de marca; identificación resuelta y aceptación de Isaac pendiente.
  Navegador16 combinaciones PASS, 238–574px, altura342px y nombres completos14px.
  Build/lint PASS. Suite completa3326 PASS/2 omitidos/1 fallo de presupuesto CPU
  del decoder V2 (1,562 frente a1,5ms), sin cambios en dicho decoder/test.
  Repetición aislada del decoder junto al widget:14 PASS; no se declara suite
  completa verde ni mejora de rendimiento. Typecheck final comprobado aparte.
  **Decisión vigente:** Isaac rechaza las bases Images y pide diseñar directamente
  en React desde la referencia de cristal suave; Images queda para detalles
  posteriores. Se prioriza taste, funcionalidad y modularidad visual.
  Rama `vantareapp/isa-1083-functional-standings`, base `b6b5754e`, worktree
  `C:/tmp/vantare-isa1083`. Sistema opt-in registrado con un solo Standings sobre
  WidgetVisualHost. Vista de estudio dentro de Workshop, cuatro módulos reales,
  carrera/práctica, tres fondos y estados de fuente. Variante dev explícita con
  datos de demostración; no altera golden ni perfiles. Anchura fluida sin escalar
  texto: las 16 combinaciones conservan nombres íntegros y filas a tamaño nativo.
  Tarea de revisión `01a08756-30ab-7682-af63-1df81364debe`: React01 7,4; React02
  8,0; React03 8,275; React04 8,3; React05 8,6; React06/07 **8,675**. Historial
  anterior a la corrección de marca: núcleo posición/piloto/GAP en carrera, vueltas/PIT como
  extensión, tipografía híbrida y mejor vuelta protagonista en práctica.
  No alcanza 9 y queda pendiente de aceptación visual de Isaac.
  Suite frontend 3322 PASS/2 omitidos, build y lint PASS; 36 focales posteriores
  y navegador sin errores. Guard de sistemas sigue señalando tres referencias
  heredadas en tests Endurance; no se ocultan. Sin commit, push, PR, promoción,
  merge o release ni evidencia física Wails/LMU. Detalles y límites en
  `docs/analysis/ISA-1083-functional-design.md`.

- **ISA-1120 — Eficiencia v2, direcciones en el Workshop (2026-09-11):**
  Isaac pide iterar el diseño Eficiencia hacia una v2 a través del harness.
  Rama `vantareapp/isa-1120-efficiency-v2` sobre
  `origin/vantareapp/isa-1083-functional-standings` (Eficiencia aún no está en
  Nightly), worktree `~/Desktop/vantare-isa1120` (macOS). Tres direcciones de
  estudio conmutables en el Workshop —Torre, Podio y Foco— como piel
  `data-study-style` enlazable por `study=` en la query; viven solo en
  `overlay-workshop.css` y los controles del estudio, sobre el renderer
  productivo compartido. Sin diseños oficiales, persistencia, tokens
  productivos ni cambios de #1097/#1098/#1103. Typecheck, 18/18 tests focales
  del parser/ruta, lint y diff-check PASS. Capturas y detalle en
  `design-evidence/functional/v2-directions.md` (`efficiency-v2-*.png`).
  Se añadieron tres direcciones más diferenciadas: Papel (piel CSS de
  atmósfera clara), Muro y Escalera (renderers de estudio propios sobre el
  mismo ViewModel). **Decisión de Isaac 2026-09-11: V1 y Foco son las dos
  direcciones vigentes;** Torre, Podio, Papel, Muro y Escalera quedaron
  descartadas y retiradas del harness (las capturas quedan como evidencia en
  `design-evidence/functional/`). Además, a petición de Isaac, la v1
  productiva dejó de marcar al jugador con el tick rojo y el texto «TÚ» — la
  banda neutra (algo más marcada) es el único marcador — y Foco agranda las
  etiquetas de columna. También: sombra del panel suavizada, separadores de
  vuelta reanclados al número, y nueva banda inferior `.vf-footer` (pista/
  aire/viento) que solo aparece cuando el frame V2 entrega esos campos — hoy
  LMU no los soporta, así que la producción queda igual hasta que exista la
  fuente. Traducir Foco a diseño oficial es otra entrega. Sin merge,
  promoción ni release.

- **ISA-1128 — Eficiencia ampliada a Relative, Delta y Pedals (2026-09-11):**
  Isaac pide llevar el lenguaje Eficiencia al resto de widgets para evaluarlo
  en el Workshop antes de catálogo. Rama `vantareapp/isa-1128-functional-widgets`
  sobre `origin/vantareapp/isa-1120-efficiency-v2`, worktree
  `~/Desktop/vantare-isa1128`. Tres renderers nuevos en
  `design-systems/vantare-functional/` (`RelativeFunctional`,
  `DeltaFunctional`, `PedalsFunctional`) sobre los ViewModels productivos:
  Relative reutiliza cabecera+tabla con badge de posición del jugador, tick de
  clase, hueco «A TI» en la fila del jugador y separador de columna de
  vuelta; Delta cabe en el aspecto bloqueado 280×96 con la última vuelta a la
  derecha de la cabecera (como el reloj de Standings), valor grande por tono y
  pista de centro; Pedals dibuja tres canales C/B/T con rellenos y
  porcentajes. El manifest funcional declara los cuatro widgets y la query
  del Workshop (`system=vantare-functional`) deriva la compatibilidad del
  manifest en vez de una lista duplicada. **Desviación de alcance
  documentada:** el contrato del catálogo exige exactamente un diseño
  oficial por par widget:sistema registrado, así que los tres pares llevan
  diseño `Signature` (`isDefault`) y Eficiencia aparece en el selector de
  sistemas de Studio **en esta rama** — sin merge ni promoción, la oferta al
  usuario final sigue pendiente de la decisión de Isaac en la integración.
  Fix lindante: `buildStandingsViewModelV2` leía `frame.weather` sin guardia
  y reventaba en frames sin clima (fixture de host y cualquier frame V2 sin
  el bloque); ahora es opcional. Checks: typecheck PASS, lint PASS, build
  PASS, suite 427 ficheros / 3389 tests PASS (incluye los 4 tests de
  caracterización de catálogo actualizados), `git diff --check` limpio.
  Evidencia en `design-evidence/functional/efficiency-{relative,delta,pedals}.png`.
  Además, el Workshop dejó de ser frágil: una URL rechazada ya no deja una
  página muerta (abre el estado por defecto con el motivo visible), cambiar
  de widget limpia escena/diseño/piel heredados y el selector de variantes
  solo ofrece las del widget activo. La vista de estudio se generalizó:
  cualquier selección `system=vantare-functional` abre el panel enfocado
  (widget conmutable entre Standings/Relative/Delta/Pedals con aterrizaje en
  la fixture más expresiva de cada uno, selector de sistema para salir de
  Eficiencia, rótulo del escenario derivado del widget); Estilo, Dirección
  v2 y Módulos siguen siendo solo de Standings. El playhead de escena se
  reancla al cambiar de escena (ajuste en render, no efecto) para que el
  `frame=` de la URL sea honesto. **Decisión de Isaac 2026-09-11: la vista de
  estudio pasa a ser el único harness del Workshop.** El panel genérico
  (header + fieldsets + sección de escenas) desaparece: el lateral cubre
  widget, sistema, diseño, variante por widget, escena, estado, sesión,
  ubicación, fondo, superficie, comparación y escala para cualquier sistema;
  los bloques de Eficiencia (Estilo, Dirección v2, Módulos) solo aparecen en
  Standings. El transporte de escena vive superpuesto abajo-izquierda del
  escenario. Se corrigió el desbordamiento del select de escena (fieldset
  min-content) y el aterrizaje `standings-functional-study` solo aplica con
  Eficiencia (con otro sistema cae a `standings-multiclass`). **Capa demo del
  Workshop:** el golden nombra a sus 20 coches `Driver 0NN` y deja delta,
  embrague, dirección, history y clima sin valor; `buildWorkshopFrameV2`
  aplica ahora una parrilla de muestra (20 nombres de resistencia sobre las
  posiciones canónicas, asientos de escena conservados, nombres espejo en
  relative/relativeSettled, delta +0.214, pedales completos, history de un
  sector con frenada, clima de muestra) antes de variantes y escenas — solo
  en el Workshop, sin tocar el golden ni producción; stale/error siguen
  vacíos y honestos. Capturas del estudio en
  `design-evidence/functional/study-{standings,relative,delta,pedals}.png`,
  `harness-*.png` y `demo-*.png`. **Relative Eficiencia solo-filas (decisión
  de Isaac, referencia iRacing):** sin cabecera de marca, sin fila de
  etiquetas, sin decoración de esquina; `showHeader` deja de existir en
  relative (delta/pedals lo conservan) y la variante dev
  `relative-multiclass` recorta columnas a posición/clase/nombre/gap para no
  pintar huecos declarados. **Barras de info (siguiente decisión de
  Isaac):** el VM de relative publica campos meta opcionales — sessionLabel,
  remainingText, trackText, playerBadgeText (P·clase) y clima — solo cuando
  el frame V2 los entrega; el renderer pinta barra superior (pista · badge
  del jugador) e inferior (sesión+reloj · ambiente) reutilizando el lenguaje
  del footer de Standings. **Selector de marca (decisión de Isaac):** los
  renderers de standings/delta/pedals leen `settings.brandVisible` — la
  decisión inyectable del contrato ISA-1105 — y el Workshop expone
  `brand=off` con el segmento "Marca" en el panel (autoridad local mientras
  la política nativa con licencia llega por ISA-1098/1105, aún sin mergear
  en nightly). **bestLap en la demo:** el golden lo trae `missing` en todas
  las filas y la columna "Mejor vuelta" pintaba solo `—`; como no es un
  hueco declarado, la capa demo lo deriva de lastLap con mejora determinista.
  Evidencia `relative-rows-only.png`, `relative-bars.png` y
  `standings-no-brand.png`. **Harness síncrono (decisión de Isaac, análisis
  completo):** el widget ya no es producto de cuatro capas de parcheo ni de
  un `prepared` diferido — `buildWorkshopWidget(query)` es el único punto
  que decide la forma (forma → diseño → dev → sesión → marca → módulos, en
  orden fijo) y corre síncrono en el render; el runtime es otra función
  pura de la selección + playhead cuantizado. Los módulos del estudio
  viven en la URL (`modules=…`) y todo estado es compartible. Fixture
  inválido → error visible con controles vivos. Bug arrastrado resuelto: el
  swap de columnas por sesión corría sobre cualquier widget funcional y
  explotaba en Delta/Pedals (sin `content.columns`); ahora es solo de
  Standings y hay regresión cubriendo los 12 combos widget×sesión.
  **Panel simplificado:** una sola variante de standings funcional
  (`standings-functional-study` — los módulos siempre aplican), fuera la
  pseudo-opción "Ajustes por defecto del renderer" (sin designId se aplica
  el diseño oficial por defecto, como en producto), cabecera sin marca
  rediseñada como banda de información, y 15 pilotos mínimo en el estudio.
  Pendiente: opción de Studio para máximo de pilotos con ventana
  top-3 + jugador. **Delta rehecho** (Isaac: "el diseño es malo"): valor
  con glifo de dirección ▲/▼, escala de instrumento ±2 s con marcas y
  etiquetas, relleno degradado con brillo por tono. Evidencia
  `delta-instrument.png` / `delta-instrument-nobrand.png`. Tras verlo,
  Isaac pidió fuera la cabecera entera: el delta es instrumento puro
  (valor + escala + pie ÚLT. VUELTA), `showHeader` retirado del
  manifiesto; evidencia `delta-noheader.png`. **Segunda dirección Delta:**
  `templateId: "capsule"` (tipo Crystal — fila en píldora, pista gruesa,
  píldora de valor) junto a `instrument` por defecto; diseño oficial
  `delta-functional-capsule`, elegible en Estilo. Evidencia
  `delta-capsule.png`. **Sistema "iRacing"** (`vantare-iracing`, dev):
  referencia clásica de sim racing. Primer widget:
  `pedals-telemetry-compact` renombrado "Pedales avanzados" (4 locales) —
  marcha ámbar, km/h + rpm, 3 barras verticales y volante que gira con
  `player.steering` (recién mapeado al VM compacto). Diseño
  `pedals-advanced-iracing`; evidencia `iracing-pedals-adv.png`.
  **Slots de pie** (hasta 5) en standings/relative de Eficiencia vía
  `footerSlots` + `slots=` en la URL — vocabulario compartido, resuelto
  desde el VM (jugador + sesión + ambiente); reemplazan el pie ambiental.
  **Auditoría del motor de animaciones**: `docs/analysis/ISA-1128-motion-engine-audit.md`
  — la política de rendimiento Go llega al scheduler pero no a los
  renderers; propuesta de MotionLevel + effects en el host.
  **Pie adaptable (Isaac: "se desborda"):** la fila única con clip quedó
  descartada — ahora los huecos doblan a segunda fila con letra escalada al
  ancho (container query + clamp) y el renderer presupuesta filas sobre
  `layout.h` real: la tabla cede en filas completas y el pie nunca se corta
  (constantes espejo de `resolveFunctionalStandingsSize`; sin layout no se
  recorta nada — tests y hosts antiguos intactos). **Motion Eficiencia +
  eficiencia del motor:** `core/widget-motion.ts` comparte el patrón
  prevRef+timers+layout-effect (`useWidgetMotion`, `MotionLevel`,
  `resolveMotionLevel`); el host resuelve el presupuesto desde
  `capabilities.performance` + prefers-reduced-motion y lo pasa a los
  renderers como props `motion`/`effects` (niveles 4→reduced, 5→minimal).
  `useDeltaMotion` migrado al helper (standings/relative de Endurance
  conservan su orquestación con estado propio). Los tres renderers
  funcionales animan: FLIP por índice renderizado, flash rise/fall
  discreto en cambios de posición, cruce de cero y nueva referencia en
  delta, fills con transición en pedales. `data-effects` (noBlur/flat)
  apaga blur/sombras según política. **Harness corregido:** la parrilla del
  estudio conserva los asientos de escena (Bovy 7, Bruni 10…) y
  `applyScene` reordena el relative por gap tras un cruce — antes la
  escena movía el dato pero la VM mantenía el orden viejo y nada se
  animaba. Verificado en navegador: overtake/battle destellan y deslizan,
  delta-cross-zero pulsa, relative-cross reordena con FLIP.
  **Primera revisión adversarial del motor (10 P2, todos corregidos en
  `c3f68d43`/`9918ec6f`/`7642df46`):** doble escala en el stride medido
  (`getBoundingClientRect` devuelve px escalados; corregido con
  `offsetHeight` y `RELATIVE_ROW_PX` 19.8→28), `data-motion-level` en las
  raíces + gate CSS `transition/animation:none` en minimal, cancelación de
  WAAPI/timers/attrs al bajar el nivel, cruce de relative por cambio de
  `side` (no por delta de índice), timers con clave para no apagar el
  flash siguiente, `flat` cubre efectos interiores del delta, tick del
  transporte sin re-render cuando la muestra cuantizada no cambia,
  interpolación de overrides discretos aterrizando en `t>=1`, y la
  parrilla del estudio recupera el asiento visible de Laursen (P15).
  **Segunda revisión adversarial (arquitectura, 4 P2, corregidos):**
  `flipRows` compartido en `widget-motion.ts` — FLIP medido por id de
  fila estable (rects normalizados por la escala del root, `from =
  prevTop − top + inFlight`) que retargetea desde la posición visual en
  vuelo y sobrevive a remounts de nodo (batalla Redline
  block↔battle-box); `persist` en el contexto del hook se limpia al
  romper la continuidad; memoria del último lado no neutro del delta
  (perder→neutro→ganar marca el cruce) en functional y Endurance;
  `useStandingsMotion` usa `flipRows`, cancela WAAPI/timers/attrs al
  deshabilitarse y sus timers llevan clave (stepDeltas ya no apila
  cadenas); `PedalsEndurance` emite `data-motion-level`; y el host se
  suscribe a `prefers-reduced-motion` vía `useSyncExternalStore` — un
  cambio en caliente baja a `minimal` en el mismo render sin esperar otro
  frame. Fix colateral: los 3 errores preexistentes de `react-hooks/refs`
  en `widget-motion.ts` (escrituras de ref en render) quedan dentro de un
  layout effect. Verificado en Chromium: re-target con keyframes no-stride
  (49.6px/23.6px), delta marca gaining y losing, relative marca fall+rise
  sobre Bruni, y reduced-motion emulado a mitad de vuelo deja 0 WAAPI
  corriendo y restaura `full` al quitarlo. En la parrilla golden
  multiclase las escenas de estudio no producen reorden dentro de clase
  (los asientos 7↔10 son de clases distintas), así que el FLIP de
  Endurance queda cubierto por los tests de `flipRows` (remount por id,
  retarget con transform en vuelo) más el teardown del hook — la escena
  correcta para demostrarlo en navegador sigue pendiente. Checks:
  typecheck PASS, lint PASS (archivo ya sin errores), build PASS, suite
  3403/3404 (el único fallo es el i18n-audit preexistente por una clave
  huérfana en studio-orbit, confirmado en HEAD limpio).
  **Cierre de la auditoría (dos cabos sueltos, corregidos):**
  escena nueva `standings-class-battle` — Birch (GTE P9) se pega a Pier
  Guidi (GTE P6), la costura cristaliza en caja (2,5 s sostenidos) y el
  adelantamiento intercambia las filas dentro de la misma clase con la
  caja viva. Es la primera escena que reordena filas visibles en la
  parrilla multiclase: el bloque hypercar (clase del jugador, siempre el
  último) queda recortado por `fitStandingsRowsToHeight` a la altura
  oficial (~620 px), así que las parejas antiguas eran invisibles y, sin
  fila de jugador en el modelo recortado, `deriveBattlePairs` no podía
  derivar nada. Verificado en Chromium con `height=940`: seam → box →
  dissolve → swap dentro del wrapper con FLIP medido (6,3 px, retarget
  1,4 px) → nueva costura invertida. Además `applyScene` ahora avisa una
  vez por escena/piloto cuando un parche no resuelve ninguna fila (ni por
  nombre ni por asiento) — el resbalón silencioso del hallazgo 10 deja
  de ser silencioso. Y `useRelativeMotion` de Endurance, código muerto
  con el bug de doble escala latente (medía `getBoundingClientRect` sin
  normalizar), queda eliminado junto a sus tests: la plantilla Redline
  Relative decidió no usar FLIP y nadie lo importaba. Checks: typecheck
  PASS, lint PASS, build PASS, suite 3396/3397 (mismo i18n-audit
  preexistente).
  **PROMOCIONADO a nightly (2026-09-12, PR #1194, squash `1567a263`):**
  revisión del diff completo previa al merge corrigió tres hallazgos
  propios — clave i18n huérfana `overlay.inspector.pedals.showHeader`
  retirada de los 4 locales studio-orbit (i18n-audit vuelve a verde),
  `vantare-iracing` añadido al contrato Go V3
  (`IsSupportedDesignSystemID` + round-trip de perfil) y lint de
  `orbit-outside-harness.tsx` (fast-refresh, roto en ISA-1185). La
  fusión con `nightly` integró el laboratorio tower de Redline
  (ISA-1071): overrides `redline*` por `buildWorkshopWidget`, canvas de
  referencia en `WorkshopSurface` y fieldset en
  `FunctionalStudyControls`; `resolveStandingsRedlineMinimumWidth`
  devuelve `undefined` en tema tower (marco físico fijo). CI completo
  verde en ambos ciclos (suite 3476, Go, build Windows, Testing Center).
  **Divergencia tras el squash de ISA-1183 (`eee3b99e`, #1191):** esa
  rama se había separado tras la primera revisión adversarial y al
  integrarse conservó sus versiones en los archivos compartidos —
  nightly quedó autoconsistente y verde, pero sin la segunda/tercera
  ronda descrita arriba: `flipRows` (retarget en vuelo, identidad por
  `data-standings-row`), `persist`/memoria de lado del delta, teardown
  y timers con clave de `useStandingsMotion`, `data-motion-level` en
  `PedalsEndurance`, suscripción reactiva a `prefers-reduced-motion` en
  el host, escena `standings-class-battle` + aviso de parches sin
  resolver, retirada de `useRelativeMotion` muerto, el caso
  `vantare-iracing` en `IsSupportedDesignSystemID` (frontend lo sigue
  registrando → perfiles con pedales iRacing no persisten) y el lint de
  `orbit-outside-harness.tsx`. **Divergencia resuelta:** el contrato Go
  volvió a nightly en `257b5fe6` (PR #1206) y la segunda/tercera ronda se
  reaterrizó en `6160caf8` (PR #1209) — `flipRows` por identidad de fila
  con retarget desde posición visual y medidas normalizadas a la escala,
  `ctx.persist`, reduced-motion reactivo vía `useSyncExternalStore`,
  teardown + timers con clave, memoria de último lado no neutro del delta,
  `data-motion-level` en Pedals Endurance, escena `standings-class-battle`
  + aviso de parches sin resolver, y retirada de `useRelativeMotion`
  muerto. `37b455be` se omitió (nightly resolvió el lint del harness orbit
  por otro camino). En la resolución se conservó el nightly actual:
  `StandingsFunctional` mantiene SessionInfo/`infoPlacement` y
  `RelativeFunctional` el presupuesto escalado por
  `resolveWidgetVisualGeometryForType`. Gates del reaterrizaje:
  typecheck/lint/build PASS, suite 452 archivos / 3598 tests verdes.
  Preexistentes en nightly verificados en checkout limpio y ajenos:
  `internal/app/launcher` solo compila en Windows (corregido luego por
  ISA-1183) y 2 tests de DiagnosticsBridge fallan en macOS. Pendiente:
  validación física en OBS/WebView2 y la traducción de Foco a diseño
  oficial (ISA-1183 ya entrega parte). Sin release ni promoción a
  `testers`/`master`.

- **S3 cerrado, 2026-09-03:** el mismo EXE R-FIX4 desde
  `4864b5c6`, SHA `cb69a4d5…878faba`, muestra Pedals sobre LMU con freno real
  al 100%, contenido y sin halo/recorte. Captura aislada posterior al 46% y
  muestra DOM anterior al 34% durante liberación: no son simultáneas y no
  acreditan una duración exacta ni una curva calibrada. Licencia activa y V2
  live/playerPit track confirmados mediante salidas sanitizadas. Main abre
  ambas imágenes; Muse independiente `ses_f988a07a7ffeg8yy6dsIV2igLF`:
  CUMPLE acotado. Atéstación existente, sin cambios, verifica tres seals,
  cinco perfiles y diez PNG/checker y devuelve **S3 FINAL PASS**, exit 0.
  Resultado `C:\tmp\vantare-s3-gate\results\s3-final-attestation-rfix4-20260903.json`;
  prueba activa suplementaria en `pedals-active-rfix4-20260903/`, fuera de las
  corridas selladas originales. Detalles y hashes en el checkpoint R-FIX4.
  Proceso 15040 cerrado por CLI antes de cinco minutos y ausencia confirmada;
  LMU permanece abierto. CI `33761361312` de `c13b8888`: tres SUCCESS.
  PR #969 continúa draft, sin merge/promoción/release. **Siguiente: S4
  reconexión → S5 reapertura → S2 tráfico último**, cada comprobación ≤5 min.
  S3 no certifica por sí solo toda V2, memoria, rendimiento global ni retiro
  de V1. No Delta, vueltas, soaks ni automatizaciones.

- **Checkpoint físico R-FIX4, 2026-09-03 15:34 Madrid:** arreglo Go incorporado
  en la rama candidata como `4864b5c6`; `c13b8888` añade sólo documentación.
  Ambos publicados en PR #969 draft. Build de medida con licencia desde
  `4864b5c6`, exe SHA-256
  `cb69a4d56ca7cb59078cb7bd7e223b33c34aa927ec808c2e49154386b878faba`;
  build frontend y Go exit 0, configuración consumida por el procedimiento
  autorizado sin leer/imprimir secretos. Índice S3 `63b71810…084ddcc`.
  Mismo candidato/índice: Relative 128.0 s, Standings 27.9 s, Pedals 26.5 s.
  Todos los captures automáticos completos; main abre diez PNG/checker y
  reviewer Muse `ses_f988a07a7ffeg8yy6dsIV2igLF` revisa los diez sin hallazgos
  concretos de clipping/alpha/ghost. Mirror dos cambios (7.675 s entre ellos),
  Proximity tres (8.027/7.676 s), Traffic dos (8.444 s), cada uno con 119
  muestras/20.587 s, sin intervalos rápidos ni solape Traffic.
  Prueba pasiva adicional, mismo exe y jugador en pista, 25 muestras/25.013 s
  live, secuencias 809–2356: diez firmas canónicas y tres settled. Dos cambios
  observados separados 7.067 s: ya no hay congelación indefinida observada.
  El muestreo 1 Hz NO demuestra paridad exacta en cada publicación (un cambio
  ya difiere del canonical al muestrearlo). Tests y lectura del algoritmo
  cubren el criterio latest; no confundir esa prueba con observación física.
  Primer intento pasivo terminó por cierre entre perfiles/ECONNRESET y no
  cuenta como evidencia. La corrida independiente sí es válida.
  Nativa Relative sobre LMU conservada; intento nativo adicional de Pedals
  no mostró el overlay y no se acredita. Su evidencia anterior de composición
  sólo cubre reposo; las nuevas cuatro imágenes de Standings/Pedals tampoco
  acreditan entrada/saturación real. **S3 sigue sin FINAL PASS por Pedals
  activo no observado.** No se ejecutaron S4/S5/S2 ni atestación final.
  El proceso de la lectura independiente recibió cierre limpio tras menos
  de dos minutos; LMU permanece abierto. CI final de `c13b8888` en curso,
  run `33761361312`. Sin merge, promoción, release ni automatizaciones.
  Detalle/seals: `C:\tmp\vantare-s3-gate\results\rfix4-checkpoint-20260903.md`.

- **Entrega local R-FIX4, 2026-09-03 15:20 Madrid:** commit worker
  `e72fbfcf055817c4bb19231da9b4f811a7665f9f`, dos archivos Go, todavía sin
  integrar. El test nuevo falla antes del arreglo; worker acredita 11 focales
  PASS. Main lee el diff completo y ejecuta todo el paquete `overlayv2` sin
  filtro: PASS (0.107 s). `go test ./...` completo termina con exit 0 en el worktree aislado,
  reutilizando `frontend/dist` verificado tras comprobar que no cambió ningún
  fuente frontend. Review de cumplimiento independiente
  `ses_f9892509dffeyF6bi3BtFQSWFX`, snapshot aislado
  `C:\tmp\vantare-redline-rfix4-review`: APPROVE. Calidad independiente
  `ses_f988e13f6ffeCPZCM24BuOUoLU`: APPROVE, sin bloqueantes reproducibles.
  La prueba física de la nueva build sigue pendiente. No atribuir al EXE
  `6fc3c506` el arreglo Go. Otro Muse `ses_f988d7b2dffeQ2aCUTv69R4DPO`
  prepara en paralelo las acciones existentes S4/S5/S2, sólo lectura y sin PC;
  su ejecución sigue condicionada al S3 completo.
  El fallo afecta las cinco filas visibles: 14 firmas canónicas frente a una
  publicada. La revisión visual confirmó los seis PNG Relative del catálogo
  corregido; retiró dos alertas no reproducibles (línea decorativa Traffic y
  glow Proximity no eran texto cortado ni ghosts). No se añaden arreglos por
  esos estilos. La rama del PR #969 está publicada en `9fa5863d`, con catálogo
  y checkpoints; CI de ese SHA está en curso. Sin merge ni promoción.

- **R-FIX4 confirmado, 2026-09-03:** revisión paralela encuentra hambre de
  actualización de vecinos en el productor Go: evidencia real de 25 muestras
  live/24.241 s, secuencias 6817–8365, `relative` con 21 firmas frente a una
  sola `relativeSettled`. `relative_settler.go` reinicia `pendingSince` cuando
  cambia cualquier miembro/orden; el tráfico continuo puede congelar la
  pertenencia aunque se actualicen valores. No es PASS de estabilidad.
  Fuente sanitizada `C:\tmp\vantare-s3-gate\results\relative-canonical-20260903.json`.
  Microcorte de dos archivos Go bajo ISA-962, base `bdd26eec`, worktree
  `C:\tmp\vantare-redline-relative-rfix4`, rama
  `vantareapp/isa-962-redline-relative-rfix4`. Muse implementador
  `ses_f98997f66ffedm6RZmr55OC96n`; Muse revisor de riesgos independiente
  `ses_f98ae9cd8ffeiBBObbendSddjP`, sin escrituras ni PC. Primero RED de
  tráfico continuo; acotar la espera sin subir el hold, introducir otro
  buffer ni alterar autoridad V2. Main revisa e integra sólo tras reviews.
  Las capturas estáticas S3 conservan valor para geometría/alpha pero no
  cierran S3 dinámico. Pedals nativo sobre LMU acreditado en reposo; entrada
  real/saturación no observada. Observación física cerrada en menos de cuatro
  minutos y proceso de prueba terminado; LMU permanece abierto.
  R4/R5/R6 aún no ejecutados; no se repiten vueltas ni Delta.

- **Paralelización y checkpoint 2026-09-03:** por petición de Isaac, las
  revisiones independientes de código y capturas avanzan en paralelo con el
  único operador físico. No se espera el cierre de una familia para preparar
  otra; S4/S5/S2 siguen dependiendo del S3 completo. Solo Muse Spark 1.3
  Contributor/OpenCode/xhigh; sin tareas programadas ni delegación anidada.
  R-FIX3 `e209cf18` tiene compliance y calidad APPROVE, regresión Node 3/3 y se
  incorporó en la rama aislada candidata como `bdd26eec`. Solo catálogo/test:
  el EXE sigue siendo build `6fc3c506`, SHA `20db565c…`; no recompilado.
  El índice corregido `9406adf9…` declara las once columnas de Standings.
  Las cinco presentaciones tienen captura automática completa con ese mismo
  índice: Standings 24.2 s, Relative 125.0 s y Pedals 24.9 s. Standings prueba
  826x900/20 filas/11 métricas y Practice sin ganancias/pérdidas. Diez imágenes
  abiertas por el orquestador; revisión visual Muse separada. No es S3 PASS:
  Relative conserva la misma pertenencia durante las ventanas observadas y se
  contrasta con `relative`/`relativeSettled` canónicos; Pedals solo acredita
  reposo y composición nativa sobre LMU. Entrada/saturación aún no observada.
  Evidencia y tres seals independientes en
  `C:\tmp\vantare-s3-gate\results\s3-checkpoint-20260903.md`.
  Los intentos previos se conservan intactos. CI SUCCESS corresponde a
  `6fc3c506`, no se atribuye a `bdd26eec` antes de su nueva ejecución remota.
  Calendar ajeno preservado; sin merge/release ni retirada V1.

- **Actualización operativa 2026-09-03 — R3a y modelo único:** Isaac confirma
  jugador preparado. Se observa LMU en cockpit junto a pista con tráfico; no
  se completan vueltas. PR #969 conserva candidato `6fc3c506` y los tres checks
  obligatorios SUCCESS. Automatización de cinco minutos sigue eliminada.
  Todos los subagentes nuevos usan exclusivamente Muse Spark 1.3 Contributor
  mediante OpenCode (`opencode-go/muse-spark-1.3-contributor`, `xhigh`).
  Revisor solo lectura `ses_f98ae9cd8ffeiBBObbendSddjP` en snapshot aislado
  `C:\tmp\vantare-redline-r4-review`; sin control del PC ni builds paralelos.
  R3a ejecutado con el EXE congelado: licencia activa, renderer Standings Redline,
  V2 live y secuencias 378/412/444. La sonda falla: frame 430x900 y cinco columnas
  frente a 826x900/once exigidos. El perfil materializado no declara `columns`;
  el parser usa las cinco predeterminadas. Se abre R-FIX3 de catálogo/regresión
  bajo ISA-962; no se atribuye todavía a clipping del renderer. Captura con cero
  recortes detectados, exterior alpha y cero ganadas/perdidas en Practice.
  Evidencia local inmutable:
  `C:\tmp\vantare-s3-gate\results\runs\standings-20260903-144839-164-54201101`.
  Es un intento fallido, no PASS S3. No modificar esa evidencia ni bajar la
  expectativa a 430. R3b–R7 pendientes; candidato de producto sin cambios,
  calendar ajeno preservado, sin merge/release ni retirada V1.

- **Actualización operativa 2026-09-02, candidata congelada `6fc3c506`:**
  se eliminó con la herramienta oficial la automatización
  `continuar-cierre-redline-isa-962`, a petición de Isaac; ya no existe su
  `automation.toml`. La ejecución continúa en la tarea activa, sin heartbeat.
  Luna `01a06324-7706-7a81-ba29-c5ec83326284` verificó en lectura los hashes
  EXE/dist/índice y los cinco perfiles del manifiesto
  `C:\tmp\vantare-s3-gate\results\r2-preflight-20260902-6fc3c506.json`: PASS.
  No demuestra licencia activa ni física. Worker cerrado. Terra
  `01a06324-77da-7740-a1b5-9f5c0e999fc1` entregó la receta S4/S5 en lectura,
  sin controlar el PC ni modificar producto, en snapshot aislado
  `C:\tmp\vantare-redline-r4-review`; worker cerrado. S4 debe observar pérdida
  y recuperación real de la fuente, no inyectar datos ni usar `sesion-v1.ps1`.
  S5 reutiliza controles de overlay/CDP y apertura normal Studio/OBS. Las
  recetas no son evidencia física ni prueba de los plazos. El orquestador
  sigue como único operador y debe verificar renderer con la sonda específica.
  CI `33660140203` terminó SUCCESS sobre `6fc3c506`: promoción, Go, frontend,
  lint cambiado, Testing Center y build Wails PASS; anotación de lint global
  advisory ajena separada del gate obligatorio. R2, primer intento 17:30 UTC:
  EXE verificado PID19568, ventana8849048 coincidente con Computer Use;
  HTTP29222 del mismo PID y CDP9222 del hijo WebView16808. Captura sanitizada
  `r2-6fc3c506-license-attempt-1.json`: active/configured/authenticated/deviceOK.
  LMU PID4880/ventana1509852 corresponden también a la pantalla controlada;
  preflight técnico R2 PASS en el primer intento. Evidencia adicional
  `C:\tmp\vantare-s3-gate\results\r2-6fc3c506-runtime.json`.
  Jugador en pista y cinco presentaciones S3 siguen pendientes.
  Preparación física posterior: Spa práctica con el coche del jugador #17;
  dos entradas observadas desde Start Driving al cockpit y retorno posterior
  a la pantalla de boxes, sin acreditar salida a pista. Se detienen intentos.
  Luna `01a0632f-a4e8-7802-936f-47d1784f75cb` identificó en lectura
  `UserData/player/keyboard.json` (custom activo): acelerador17, freno31,
  subir marcha16, limitador38; AI Control no figura. El orquestador contrastó
  con `dinput.h` del SDK local: W/S/Q/L. No se editaron controles ni se
  atribuye el problema a RawInput. Worker cerrado. R3–R6 BLOQUEADOS a la
  espera de jugador fuera de boxes; requieren intervención puntual de Isaac.
  CI/licencia/preflight no se repiten por este bloqueo. No hay PASS S3, merge,
  release ni retirada V1. La siguiente acción es colocar el coche en pista
  y ejecutar el banco preparado con la misma build, respetando cinco minutos.
  La pantalla BetaWelcome dice Plan Free mediante texto literal, no se usa
  para sustituir el contrato de licencia. Ninguna captura S3 se declara PASS.
  Esta actualización documental se prepara en rama aislada
  `vantareapp/isa-962-redline-coordination` para conservar la candidata física
  inmutable; se incorporará al mismo handoff al cerrar el checkpoint.

- **Prioridad operativa 2026-09-02 — cerrar Redline primero (ISA-962):**
  [maestro integral y microcortes](../../superpowers/specs/2026-09-02-huella-minima-plan-maestro.md),
  con [subplan A Redline](../../superpowers/specs/2026-09-02-redline-plan-maestro.md).
  Isaac aclara que quiere planificar TODO el compromiso original: el maestro
  B–J cubre banco, atribución y recortes de memoria/CPU/GPU, UI Hub, efectos
  Redline, Coste e informe, niveles/Automático, HUD swap, composición y V1.
  Maestro aprobado por Isaac para iniciar. Modelos: Luna para mecánico, Terra
  para la mayoría, Sol para hipercomplejo; fast/priority. Isaac ha
  autorizado integrar el candidato en `nightly` una vez superados sus gates;
  no releases, otros canales ni retirada irreversible V1. PR #969 sigue draft.
  Primero reparar el entorno Chromium de CI; después S3 de las cinco
  presentaciones Redline, S4/S5 limitados a su regresión y S2 último, con jugador
  en pista, sin vueltas/Delta y máximo cinco minutos por comprobación.
  Memoria #956 y optimizaciones globales quedan secuenciadas después de Redline,
  no descartadas ni sin plan. R1 iniciado con worker Luna nativo
  `01a062d5-4dda-7ba3-bc0a-48f763e333a2` (Nietzsche), worktree
  `C:\tmp\vantare-redline-ci-r1`, rama `vantareapp/isa-962-redline-ci-r1`, base
  `66ead80f`. Alcance: instalación Chromium anterior a Vitest y regresión de CI;
  sin renderer/LMU. T3 en 3773 no responde; Codex nativo hereda configuración
  `service_tier=priority`. Tras entrega: Terra para review de contrato y calidad.
  Luna entregó `e03ff363` (dos archivos, 25 líneas): instalación obligatoria de
  Chromium antes de Vitest y regresión. RED previo; 45 tests Python y parser
  YAML PASS. Terra `01a062d8-416b-7eb3-9822-1bac4967413e` revisó el diff y
  verificó cumplimiento: APPROVE. Terra de calidad
  `01a062da-1617-7c62-874f-301a3e29440a`: APPROVE sin hallazgos. El orquestador
  inspeccionó el diff y repitió los 45 tests. Integración en rama candidata;
  aún pendiente el CI remoto de ese cambio, no merge a nightly.
  Durante preflight estático apareció R-FIX1: el materializador del catálogo
  copiaba ancho persistido 280 a la expectativa física de Standings, aunque
  el contrato exige normalizarlo a 826. Worker Luna
  `01a062d9-d42d-7451-96ab-ea6ce0caa25f`, worktree
  `C:\tmp\vantare-redline-gate-frame`, base `e03ff363`, sólo catálogo/materializador/
  test. Debe preservar el perfil 280; no cambiar renderer ni derivar la
  expectativa de la medición observada. Entrega `aaa9a491`: test RED (1 PASS /
  1 FAIL), GREEN 2/2, syntax/diff-check PASS. Terra de cumplimiento
  `01a062dc-52b2-7941-bab3-93635c8971fa`: APPROVE y 2/2 verificados;
  Terra de calidad `01a062de-1a30-7c32-adb2-49b202eea34c`: APPROVE sin
  hallazgos. Integrado en candidata; el orquestador repitió los 2/2 tests.
  El conjunto R1/R-FIX1 no cambia runtime. No se ha iniciado prueba física.
  CI previo `33651244585` sobre `66ead80f` terminó FAIL antes de Vitest:
  `TestCoordinatorWithSQLiteDrainsAndReleasesAllHandles`, `store_test.go:801`,
  `recording commit exceeded budget`. No demuestra nada sobre R1 aún no subido;
  no se relajan presupuestos ni se cambia recording dentro del arreglo Chromium.
  Revalidar con el SHA integrado y registrar por separado si reaparece.
  Diagnóstico local del orquestador: ese test aislado, `-count=3`, PASS en
  0,329 s; no reproduce el fallo del runner y no demuestra CI completo verde.
  Conjunto R1/R-FIX1 subido en `9d3971af`, run `33652826996`. Su job de
  promoción estaba verde en modo auditoría pero tenía un error de formulario
  de #962. Se completaron las secciones del contrato sin ampliar alcance.
  El validador estricto descubrió además arrastre del digest anterior; se
  regeneró `roadmap.json` sembrándolo desde la base confiable `659b2c57` y
  conservando `plan.md` candidato. No se cambia el modo auditoría ni se omite
  ningún check. Hace falta CI del SHA documental actualizado.
  Build de preparación `9d3971af` pasó frontend/typecheck y Go con el
  procedimiento autorizado de configuración embebida, sin mostrar valores.
  No se ha validado aún licencia activa ni ejecutado física. Manifiesto local:
  `C:\tmp\vantare-s3-gate\results\r2-preflight-20260902.json`; la siguiente
  preparación debe identificar el nuevo digest, no relabelar el ejecutable.
  **Actualización 2026-09-02 16:22 UTC:** CI `33653238356` del candidato
  `33f6dcfa` terminó FAIL sólo en frontend: 440/441 archivos y 3420/3421 tests
  PASS. Chromium ya se instala y Go pasó. Fallo:
  `PedalsRedline.layout.test.tsx`, saturación de freno, 8 píxeles cambiados
  fuera del well/slot donde exige cero. Focal local sin cambios: 3/3 PASS.
  R-FIX2 iniciado con Terra high/priority `01a062f0-0cd4-7261-98f2-ebf89a5439a0`
  (Euler), rama `vantareapp/isa-962-redline-pedals-ci`, worktree
  `C:\tmp\vantare-redline-pedals-ci`, base `33f6dcfa`. Sólo test y, si se prueba
  causa productiva, CSS/TSX exclusivo de Pedals Redline (máximo 3 archivos).
  Distinguir halo real de máscara subpíxel/entorno; no aumentar tolerancias,
  ocultar el test ni aplicar parche especulativo. Review independiente después.
  Física y merge siguen pendientes. Preparación vigente identificada en
  `C:\tmp\vantare-s3-gate\results\r2-preflight-20260902-33f6dcfa.json`;
  no hay prueba nueva de licencia activa, Wails ni LMU.
  R-FIX2 entregado por Euler en `364f7e2c`: sólo test (+121/-3), suite
  441 archivos/3423 tests, focal 5/5, build/typecheck/lint reportados PASS.
  Control negativo de antigua sombra detecta 20.674 píxeles exteriores.
  Diagnósticos: `C:\tmp\pedals-redline-ci-diagnostics-364f7e2c`. El orquestador
  comprobó que `inset.json` tiene cero diferencias incluso con la máscara
  anterior: los ocho píxeles concretos de CI siguen sin reproducción local.
  No se declara aún acreditada esa atribución. Helper unitario y máscaras
  de los tests de capturas deben compartir cobertura efectiva. Terra
  `01a062fc-2417-72d2-9bb5-ccacaf62a242` revisa cumplimiento sobre ese SHA;
  worker sin editar durante review, aún no integrado ni subido.
  Review Pauli: REQUEST_CHANGES P1, aceptado. `364f7e2c` no se integra.
  El siguiente intento requiere el mismo comparador para positivo/negativo
  y una captura que falle la máscara original; no fabricar exactamente ocho
  píxeles para igualar CI. Ronda local acotada a cinco minutos; si no reproduce,
  entregar sólo diagnósticos manteniendo máscara/aserción original para obtener
  coordenadas/rects del runner. No aceptar fórmula plausible como causalidad
  demostrada ni reiniciar suites grandes sin información nueva.
  Ronda acotada final: desplazar el renderer productivo 0,5 px tampoco
  reproduce (máscara anterior y propuesta: cero diferencias). Euler revirtió
  `364f7e2c` en su rama y entregó `0172d1de`, autónomo, sólo diagnóstico
  (+21 líneas de test). Conserva máscara y aserción cero originales; ante
  fallo registra hasta 16 coordenadas/RGBA, DOMRects, DPR y sombras calculadas.
  Focal 3/3 y typecheck PASS reportados; no se repitieron suite/build/lint
  completos para este cambio observacional. Pauli revisa cumplimiento; después
  procede review de calidad independiente e integración sólo de `0172d1de`.
  No hay arreglo productivo acreditado ni pruebas físicas nuevas.
  Terra Pauli (cumplimiento) y Terra Galileo
  `01a06303-97eb-76e0-9f78-b9540130ab53` (calidad) aprobaron `0172d1de`.
  El orquestador inspeccionó el diff neto, verificó otra vez el focal 3/3 e
  integró sólo el commit diagnóstico como `a0ffe300`. Workers/reviewers
  cerrados; la candidata pasó suite completa (441 archivos/3421 tests, 66,45 s),
  typecheck y lint. La suite emitió `AbortError` de teardown Happy DOM pero
  terminó con todos los tests PASS y código cero; no se oculta ese diagnóstico.
  No se repitió build/Go en este corte de observabilidad exclusiva del test;
  no cambia fuentes productivas, contratos ni el artefacto de runtime.
  El siguiente CI debe conservar el fallo si reaparece y aportar sus
  coordenadas, no se considera resuelta todavía la causa de Pedals.
  **Actualización 2026-09-02 17:01 UTC:** CI `33657242122` sobre `7e0e4d73`
  vuelve a fallar sólo el mismo test (440/441 archivos y 3420/3421 tests PASS).
  El diagnóstico sí aporta evidencia nueva: ocho diferencias en x=328,
  y=369..376, junto al texto inferior; well termina y=276,5886, slot y=389,6615
  y ambos rects tienen right=327,84375, DPR=1. Sombras `none`/`inset`.
  No atribuirlo al halo del well ni ampliar la máscara: x=328 está también
  fuera de la propuesta anterior. JSON literal preservado en
  `C:\tmp\vantare-s3-gate\results\pedals-ci-33657242122.json`.
  R-FIX2b: worker Terra high/priority, worktree exclusivo
  `C:\tmp\vantare-redline-pedals-glyph`, rama
  `vantareapp/isa-962-redline-pedals-glyph`, base `7e0e4d73`.
  Investigar texto/fuentes/raster con reproducción RED: máximo tres archivos
  (layout test, CSS exclusivo Redline y TSX si necesario), sin modificar
  máscara/tolerancia, sin ocultar ni recortar el texto. Primera ronda acotada
  a cinco minutos y checkpoint. Después revisión independiente antes de integrar.
  Física, promoción y resto del programa continúan pendientes; no hay merge.
  Banach terminó NEEDS_CONTEXT, sin cambios: fuente local Roboto-Bold y valor
  contenido; faltaba reproducir la selección fallback. Tras la objeción de
  Isaac a las pausas, el orquestador pausó la tarea programada y asumió el
  bloqueo directamente en el worktree exclusivo, limpio, sin otro writer.
  Reproducción TDD: forzar la alternativa genérica `sans-serif` ya declarada
  por producto selecciona Arial Black a peso 800 y produce exactamente los
  ocho píxeles/RGBA/rects de CI. El valor mide 139,276 px frente a slot135,755.
  RED 4 PASS/1 FAIL; cambio mínimo exclusivo `.ven-pred-slot b`: peso700,
  misma fuente de 11 px, sin clipping ni cambio de máscara. Selecciona Arial
  Bold, valor118,151 px, cero diferencias exteriores. GREEN5/5, más aserción
  explícita del valor completo dentro de su slot. PNG/JSON preservados en
  `C:\tmp\pedals-redline-glyph-red` y `C:\tmp\pedals-redline-glyph-green`;
  el orquestador revisó ambas imágenes. Suite/build/typecheck/lint en ejecución;
  review Terra independiente de cumplimiento iniciada antes de calidad.
  Commit del fix `b3f60b03`: dos archivos (+33/-4). Suite441/3423,
  typecheck/build/lint PASS. Erdos de cumplimiento
  `01a0631c-28ef-73c3-97d2-129d8050920f`: APPROVE sin bloqueantes tras revisar
  diff y reproducción. Revisión Terra de calidad en curso; no integrado todavía.
  [Evidencia y comandos del microcorte](../../analysis/2026-09-02-redline-pedals-font-fallback.md).
  Heisenberg de calidad `01a0631e-a409-7792-8248-b0735416d0d2`: APPROVE sin
  hallazgos, focal5/5 verificado. Orquestador integra el fix y la evidencia en
  la candidata; todos los workers/reviewers cerrados. CI exacto nuevo pendiente.
  La tarea programada permanece PAUSADA por instrucción correctiva de Isaac;
  la continuación se hace activamente en esta sesión. Preparar la nueva build
  configurada y sus hashes en paralelo a CI; todavía no lanzar física ni LMU.
  Las notas históricas inferiores no sustituyen este alcance ni el SHA de cada
  evidencia. No se ha ejecutado ninguna prueba física nueva al escribir el plan.

- **ISA-967 — Pedals Redline contenido en su frame (2026-08-31, rama):** el
  renderer productivo `pedals-redline` ya no hereda el `padding`/`min-height`
  del shell genérico de pedales ni el mínimo intrínseco de sus wells. El
  override queda limitado al selector del template Redline; a 520×420 todos
  los descendientes visibles caben con tolerancia de 0,5 px. Se añadió un
  test Playwright de geometría contra el pipeline productivo completo con
  estados V2 `ready` y `missing`. No modifica `pedals-classic`, `pedals-neo`
  ni otros diseños. La
  validación física S3 con Wails/LMU y licencia activa sobre `cf75af2f` quedó
  `ready` a 520×420: raíz contenida, cero descendientes recortados, cero clips
  internos y cero placas opacas exteriores. Evidencia local:
  `C:\tmp\vantare-s3-gate\results\runs\pedals-20260831-163106\22-pedals-redline`.
  La repetición física posterior detectó que, con freno al 100 %, la sombra
  exterior de saturación se escalaba como un halo blanco alrededor del well.
  `80da8c91` la confinó a un brillo `inset` sin perder la lectura `100%` ni la
  transparencia. La regresión Chromium compara reposo/saturación con
  `deviceScaleFactor: 1`, exige una señal `inset` distinta y cero píxeles
  cambiados fuera del well/slot local; así queda atendida la revisión
  adversarial posterior a `80da8c91`.

- **ISA-958 — autoridad estable Redline en Go (2026-09-01, rama):** Endurance
  Redline consume exclusivamente `FrameV2.relativeSettled`, una ventana
  ordenada con hold de 7 s propiedad de cada `CachedProjector`. La UI rehidrata
  datos vivos sin cambiar filas durante churn; ausencia real o nueva identidad
  de sesión publica de inmediato. El decoder exige como máximo 8+jugador+8,
  sides y orden canónicos, IDs únicos y exactamente un jugador, y el store no
  acepta `sequence` duplicada o regresiva en la misma sesión/epoch. El adapter
  Redline no expone estado de estabilidad frontend; Classic/Minimal/Neo no
  cambian. Integrado en el candidato final Redline: frontend 441 archivos y
  3.418 pruebas PASS, `go test ./...`, build, typecheck implícito, lint y
  `diff --check` PASS. Las revisiones adversariales de la rama de autoridad y
  del contrato de integración no mantienen hallazgos P0/P1. Falta únicamente
  la validación física S3; no hay PR, promoción ni prueba Wails/LMU nueva.

- **Histórico ISA-958 previo a la autoridad Go (2026-08-31, sustituido):** la
  pertenencia mantiene solo VehicleID y exige 900 ms monotónicos; no compara
  posiciones de coches distintos para saltarse el hold. Cada render rehidrata
  los campos de la row Relative actual, elimina ausentes y no avanza con
  secuencias duplicadas/atrasadas aunque declaren un `generatedAt` posterior. Position,
  gap, nombre, clase y última vuelta comparten row/epoch, sin join a Standings.
  El host crea el estado por montaje con un inicializador perezoso de React y
  lo delimita por identidad lógica `perfil:widget.id`, sin depender del objeto
  recreado por responsive layout, refs leídas durante render, mutable global,
  timers ni renders extra. Un cruce ahead/behind debe sostenerse durante el
  hold monotónico de 900 ms: hasta entonces se conserva la última row completa
  aceptada y, al vencer, se publica la nueva row canónica en la siguiente
  cadencia. Motion delimita también epoch/session, por lo que un cambio ready a
  ready no crea ghosts; cada desaparición tiene identidad propia para que un
  timer anterior no elimine una salida posterior del mismo VehicleID.
  TDD de cierre sobre `bff576bc`: RED literal 5 fallos/36 pases; GREEN focal
  acumulado 6 archivos/75 pruebas, typecheck, build, lint focal, changelog,
  generador/check de roadmap y `diff --check` verdes. No sustituye la prueba
  física Wails/LMU, que no se ejecutó en esta rama.
  RED físico aportado por Isaac sobre build bff/#967: run
  `relative-20260831-164218/13-relative-redline-mirror`,
  `invalidRows=false`, `playerChanged=false`, `jumps=4`. Las muestras 8→10 y
  16→19 demuestran dos sustituciones canónicas duplicadas por el ghost de
  salida (5→6→5 filas). El cierre local reserva ghosts solo para huecos netos:
  una sustitución 5→5 conserva una única transición y la entrada sigue usando
  su animación existente. La traducción determinista del RED físico falló
  1/9 antes del cambio y quedó 9/9 después; la repetición física por Isaac
  queda pendiente.
  Un segundo RED físico del candidato combinado `8f2c3dbb`, run
  `relative-20260831-171609/15-relative-redline-traffic`, alternó cinco filas
  con jugador `lmu-slot-0` y cero filas en las muestras 20/22; stderr registró
  `state=live available=true reconnectAttempt=1`, mientras el run que pasó no
  entró en stale/reconnect hasta después del muestreo. El cierre limita toda la
  histéresis a los templates Relative Endurance Redline mediante una señal
  explícita del host: Classic/Minimal/Neo y otros sistemas conservan el
  comportamiento inmediato anterior. Dentro de la misma epoch/session, un
  reconnect puede puentear un frame Relative vacío durante 400 ms; stopped,
  stale o una nueva epoch/session vacían de inmediato.
  La captura física `relative-20260831-172352/15-relative-redline-traffic`
  mostró además el lapnote azul detrás de filas durante churn, con VehicleID
  estables en las 25 muestras. Traffic agrupa aviso y amenaza en un slot y
  desactiva solo el FLIP traslacional mientras ese slot compuesto existe; el
  gate geométrico mueve la amenaza arriba y exige cero intersecciones entre
  lapnote y filas.
  Baseline real nightly `659b2c57`, Spa práctica/boxes: 347 muestras/90 s,
  65 transiciones y 56 composiciones; 262 muestras en la composición estable.
  El probe de repetición debe separar membership canónica de ghosts de motion.
  La revisión NO-GO de `53d725fc` queda corregida localmente en `e84d593a`:
  `error`, `stopped` y `stale` invalidan el estado estable antes de aceptar una
  secuencia reiniciada de la misma sesión; el hold de reconnect vive solo en la
  ViewModel y el test integrado conserva filas a 399 ms y publica cero a
  400/401 ms, sin prolongación por el renderer ni por ghosts sin jugador.
  Traffic excluye del FLIP únicamente el wrapper compuesto de amenaza+lapnote;
  una fila ordinaria sigue animándose. El aislamiento de Classic, Minimal, Neo
  y las superficies compartidas permanece cubierto. RED previo: 3 fallos/27
  pases; GREEN acumulado: 10 archivos/114 pruebas, typecheck, build, ESLint
  focal y `git diff --check` verdes. No se abrió Wails/LMU; S3 física sigue
  pendiente y no hay push, PR, merge ni promoción.
  Último NO-GO P1 corregido localmente en `c80a0769`: Redline ya no
  muta `lastSequence`, `lastRows` ni el hold durante render. Calcula un draft
  inmutable desde la última autoridad publicada y solo lo publica en
  `useLayoutEffect` tras commit, sin programar un segundo render por snapshot.
  La regresión Suspense abandona sequence 2 y demuestra que no contamina la
  recuperación con el mismo sequence. El DOM integrado cubre mirror/Desktop,
  proximity/Studio y traffic/OBS: filas visibles a 399 ms, cero filas y cero
  ghosts a 400/401 ms, recuperación limpia tras error y no-Redline sin
  histéresis. Focal 80/80, typecheck, build (solo warning heredado de chunks
  >500 kB), ESLint focal y `git diff --check` PASS. Sin Wails/LMU, push, PR,
  merge ni promoción.
  Corrección posterior pendiente de revisión: el RED físico
  `relative-20260831-213627/13-relative-redline-mirror` registró nueve cambios
  completos en 24 s sin ghosts, desconexión ni drift. Tras REQUEST_CHANGES, el
  hold de siete segundos sólo conserva slots cuyos VehicleID siguen presentes
  en el `scoped` canónico: si falta uno, acepta inmediatamente la ventana
  candidata completa, sin ghosts, stale ni huecos. Player y filas que no cruzan
  se rehidratan desde el frame actual; el cruce del mismo rival conserva 900 ms.
  RED 3 fallos/39 pases y GREEN 42/42 cubren reemplazo parcial, player actual,
  ausencia de IDs no canónicos y reset session/epoch. Falta repetir la prueba
  física Wails/LMU. Sin push, PR, merge ni promoción.

- **ISA-957 — filas completas y semántica de Standings (2026-08-31, rama):**
  las nueve plantillas Endurance recortan el modelo con
  `floor(altoUtil/altoFila)` antes de renderizar; el caso 520×560 deja 14 de
  18 filas Redline completas y reserva el flujo transitorio de una retirada y
  una batalla (54 px: ghost 30 + box completo 24). Overlay V2 publica `bestLap` y el
  ViewModel muestra en práctica/clasificación la mejor vuelta de la fila y su
  diferencia contra la mejor de sesión; en carrera conserva el gap oficial al
  líder; el shadow compara ese campo y el referente se calcula antes de
  `rowCount`. La regresión de layout monta las nueve plantillas, cuenta sus
  filas DOM y contrasta la geometría declarada en `tokens.css` y la medición
  del flujo aun con `overflow:hidden`; una mutación de 1 px admite una quinta
  fila recortada y falla. Evidencia local: tests frontend focales, paquete Go Overlay V2,
  typecheck y `git diff --check`; no se lanzó Wails ni se tocó CSS.
- **ISA-959 — Track Map Endurance respeta el frame (2026-08-31, rama):**
  `vantareapp/isa-959-track-map-footer-clipping`, base exacta
  `origin/nightly@659b2c57`. La auditoría Wails/LMU real midió un renderer de
  `640×485.625` dentro del frame `640×440`, con el footer completamente fuera.
  La raíz `.ven-track-map` ahora ocupa el alto disponible con `border-box`, sin
  cambiar geometría, tipografía, ViewModel ni la frontera `WidgetVisualHost`.
  Tras el REQUEST_CHANGES adversarial sobre `66d3f541`, la regresión Chromium
  monta `RuntimeWidgetFrame`, `WidgetVisualViewport` y `WidgetVisualHost` para
  Desktop/OBS, y la frontera compartida viewport/host para Studio. Mide frame,
  renderer, SVG, outline y footer por los cuatro lados, dimensiones,
  visibilidad, intersección y orden mapa→footer, con `overflow:visible` para no
  esconder el fallo. Cubre `160×110`, `320×220`, `640×440` y resize libre
  `480×260` en las tres superficies. Contra el CSS anterior falló directamente
  en Desktop `160×110`: bottom `121.40625` frente al máximo `111`; con el fix
  pasa la matriz 12/12. Queda pendiente la revalidación manual en Wails/LMU
  real; no se arrancó la app. Sin push, PR, merge, promoción ni release.
- **ISA-989 — feedback de tester (2026-09-05, rama):** base `659b2c57`,
  worktree aislado `C:/tmp/vantare-isa989`. Guardado compara JSON por contenido,
  conservando orden de arrays, y Track Map transparente comunica clases V2.
  Regresiones RED/GREEN y round-trip Go comprobados; cortes ISA-990/991/992
  revisados e integrados localmente, con corrección adicional de filas compactas
  detectada en review. Go completo, build y lint integrados pasan; suite frontend
  global438archivos/3342tests PASS. Gate de roadmap y Chromium con dimensiones
  persistidas PASS. PR borrador#993 subida hacia nightly; aceptación física
  Wails/LMU pendiente. Head-to-Head conserva proporción360:128 y puede cambiar altura
  de perfiles previos; RPM es escala0–10k sin alerta de corte inventada.
  No merge/promoción/release ni
  prueba física Wails/LMU. Evidencia: `docs/analysis/ISA-989-feedback.md`.

- **ISA-940 — lifecycle a coste cero (2026-08-30):** rama
  `vantareapp/isa-940-lifecycle-coste-cero`, rebasada sobre
  `origin/nightly@9723148f`. El overlay navega a `overlay.html`, deja fuera del
  entry Hub/Supabase/motion y, en niveles 3–5, limita su ventana a la unión de
  widgets con 16 px de margen; edición y niveles 1–2 conservan el monitor
  completo. Wails alpha.98 no expone suspensión WebView2, por lo que el Hub se
  destruye y recrea. El frontend empuja a Go un registro generacional de
  bloqueadores para Studio, Launcher, OAuth, Estrategia y demás borradores
  locales; sin primer snapshot o con cualquier bloqueador se conserva la
  ventana. La pareja efectiva L1/L3 desde el mismo HEAD/exe/dist publicó L3 al
  runtime, dejó el renderer Hub en 0 MiB y midió 405,34 MiB privados: −27,88 %
  frente al baseline de 562 MiB, aceptado por P13 con gate RAM ≥20 %. CDP midió
  389,39 ms para reabrir el Hub destruido. El recorte restante de GPU process y renderer
  del overlay pertenece a [#951](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/951).
  Nightly mantiene como autoridad la política v4 de ISA-943/ISA-947; ISA-940 no
  promociona el nivel 3 y conserva el nivel 1 como valor productivo inicial.

- **ISA-944 — sensor de host y modo Automático F3 (2026-08-30, rama):**
  `vantareapp/isa-944-sensor-automatico` incorpora el sensor Go a 1 Hz para CPU
  total, CPU/RAM del proceso y sus WebView2 propios, detección de LMU en primer
  plano y frametime por PresentMon streaming. La sesión ETW propia usa
  `VantareSensor-<pid>`, limpia al arrancar solo sesiones cuyo PID Vantare ya
  no está vivo y, al cerrar, mata
  y espera el PID exacto de PresentMon entre dos paradas exactas de la sesión;
  `RSXTraceSession` y `VantareHuella-*` quedan fuera. Automático empieza en 3,
  opera entre 2 y 5, sube tras 30 s sanos, baja en dos muestras e impone 60 s
  de histéresis; sin frametime sigue por CPU y publica `reason: unavailable`.
  La política se aplica en caliente, emite `performance:level` solo con Hub
  visible y anuncia cambios mediante texto i18n del Ingeniero. Esta rama
  sustituye el automático provisional descrito por ISA-943; conserva íntegra
  su resolución app+perfil y solo puede bajar la calidad solicitada. Los tests
  Go del alcance pasan, incluido el orden de cierre y la sesión estable
  simulada de diez minutos. En la prueba Wails real de 181 s, 182/183 muestras
  llevaron frametime LMU y el nivel siguió 3→4→5 sin volver a oscilar; CDP
  capturó el snapshot inicial y final de `capabilities.performance`. Vantare y
  su PresentMon desaparecieron al cerrar, su ETW quedó limpia y
  `RSXTraceSession` permaneció activa. Una prueba opt-in de la ruta Go fijó
  además el mensaje OEM de `logman` español cuando la segunda parada encuentra
  la sesión ya ausente. El guion reproducible queda en
  `scripts/bench/isa944-auto-smoke.ps1`; falta la captura sin LMU. PR draft
  **#948** hacia `nightly`; sin merge ni promoción.
  Isaac aceptó el gate 12.2 y revirtió el rollout temporal: Automático es el
  defecto desde #948 y persiste `auto`/3/`default`. El schema v5 migra la
  ausencia de `performance` sin aviso; el sentinel v4 sin procedencia
  `level`/1 migra una sola vez con `migratedFrom: rollout-level-1`, Ajustes lo
  explica mediante `Note` y el primer guardado explícito elimina el marcador.
  Las elecciones explícitas se preservan mediante `source: user`.
  El tope D4 consume directamente la política app+perfil efectiva de #947 e
  incluye `VANTARE_PERF_LEVEL` en builds de diagnóstico; cambios de perfil A→B
  actualizan el límite en caliente y los overrides custom de Hz y efectos se
  clonan al mover el nivel automático.
  `SetHubVisibleProvider` permite reemplazar en caliente la generación que
  decide si se publica `performance:level`; al rebase sobre #942 debe recibir
  el estado de `HubLifecycle`, no conservar el `hubW` inicial.
  El A/A final `sensor-cost-20260830-054516`, desde árbol limpio y nivel 5,
  midió +0,1437 puntos de CPU media, +0,2516 puntos p95 y +4,66 MiB privados;
  registra SHA-256 del ejecutable, 107 muestras sin deriva y cierre con cero
  `vantare-*.exe` y cero sesiones `VantareSensor-*`.

- **ISA-943 — perfil v4 y Ajustes › Rendimiento (2026-08-30):** rama
  `vantareapp/isa-943-perfil-v4-ajustes-rendimiento`, base inicial
  `origin/nightly@ca166b38`. El store acepta perfiles v3 indefinidamente y al
  primer guardado escribe v4, conserva una copia `<perfil>.v3.bak`, descarta
  `behavior.updateHz` y registra valores fast atípicos con ruta/widget/valor.
  La política raíz `inherit|level|custom` se combina en Go con Ajustes; el modo
  automático provisional solo puede bajar calidad. Ajustes ofrece los cinco
  nombres aprobados, Personalizado y Automático deshabilitado, refresca desde
  `performance:level`, muestra los avisos de migración atípica y ofrece
  overrides de Hz por widget con coste `+CPU`. El campo v4 de efectos queda
  reservado para la issue dedicada a las variantes Endurance. Studio
  guarda la política v4, muestra el nivel efectivo y ya no presenta el selector
  legado de frecuencia; los guardados posteriores de layout preservan la
  política. Smoke Wails/CDP propio en 9245: nivel 1→4 y `rafCap` null→30 en el
  mismo target de overlay, con PID propio cerrado y puerto liberado. Evidencia:
  `docs/telemetry-core/evidence/isa-943/`. Quedan para Isaac únicamente el pase
  visual de los controles existentes; las variantes `noBlur`/`flat` y su
  control/coste GPU pertenecen a su issue dedicada. El sensor
  real de Automático sigue fuera de C2. Los guardados de Ajustes y política de
  perfil comparten un coordinador: serializa la persistencia, relee ambos
  estados confirmados y reconcilia esa pareja; Studio protege ruta/documento/
  revisión con un mutex y ambas UIs esperan una confirmación correlacionada.

- **ISA-924 — banco de huella y baseline por hardware (2026-08-28):** PR #929
  integrado en `nightly`; corrección operativa en
  `vantareapp/isa-924-atribucion-renderer-overlay`, base
  `origin/nightly@ca166b38`. Se versionaron la spec autorizada, dos perfiles v3
  reproducibles, banco PowerShell 7, control/probe CDP y agregador de ruido.
  El árbol WebView2 se acota por `--user-data-dir=<exe>\EBWebView`; el renderer
  Hub se fija antes de abrir el overlay. La corrida real con 37 coches reveló
  que el renderer del overlay quedaba sin atribuir; la corrección abre una
  ventana desde `overlay:start-active` hasta target `/` + widgets listos y usa
  `SystemInfo.getProcessInfo` para desempatar por PID y creación más reciente.
  Solo la ambigüedad residual queda `renderer-unassigned`. Las muestras donde
  fallan los contadores GPU se marcan inválidas y no sesgan la media como cero.
  El segundo hallazgo del baseline real fue que una interrupción podía dejar
  `VantareHuella-*` viva y hacer que la siguiente captura produjera cero frames.
  La rama ahora cierra PresentMon + sesión ETW en `finally`, recupera al inicio
  sesiones huérfanas cuyo PID ya no pertenece a Vantare y las registra. Un CSV
  sin frames queda `gameFrametimeValid=false`: frametime no publicable, recursos
  de Vantare todavía válidos. La elevación de PresentMon es opcional mientras el
  CSV v2 resulte válido.
  PresentMon 2.5.1 quedó disponible como binario standalone oficial porque el
  MSI de winget devolvió 1620; usa una sesión ETW propia y nunca
  `--stop_existing_session`. Smoke Wails real A0/A1 PASS: A1 abrió 3 widgets,
  separó ambos renderers, capturó frametime LMU y cerró con
  `Application.Quit()`. La review independiente REQUEST_CHANGES quedó
  corregida: N < 3 no publica; `-Forzar` deja CSV/Markdown no publicables y el
  agregador los rechaza; PresentMon v2 deriva pérdidas de `DisplayedTime=NA`;
  CDP espera Hub y widgets; el árbol se redescubre cada 5 s; unidades MiB y
  `PresentMon.exe`/PATH persistente. El protocolo permite y registra como
  `systemWebView2` solo perfiles bajo `AppData\Local\Packages\Microsoft*`;
  otros Edge/WebView2/Vantare siguen bloqueando. Smoke A1 sin `-Forzar`, 30
  muestras sobre LMU: `publishable=True`, 6 procesos del shell/1 perfil
  permitido, 3/3 widgets, ambos renderers, 3.097 frames, 0 perdidos, cierre
  limpio y cero procesos propios residuales. Es prueba del banco, no baseline:
  quedan pendientes
  180 s × 3 en A0/A1/HubVisible/HubMin, perfil completo, iGPU y VR. Sin merge
  ni promoción.

- **ISA-849 — columnas configurables en Standings Redline (2026-08-25, SDD):**
  rama rebasada el 2026-08-27 sobre `origin/nightly@b1d5b15b` para que solo la plantilla titular
  `standings-redline` respete visibilidad, orden, anchura y alineación sin perder
  sus animaciones. Isaac cerró alcance: Posición y Piloto son anclajes fijos;
  las nueve métricas restantes son flexibles; al activar muchas se ensancha el
  widget y Studio avisa, sin resize automático. Se rechazó un adaptador
  específico por complejidad: la propuesta consume las columnas directamente
  en el TSX/CSS productivo. Review Fable: APROBABLE CON CAMBIOS; Isaac aceptó
  las enmiendas el 2026-08-27. Redline tendrá anchura CSS real sin cambiar la
  geometría de Original/Crystal/otros Endurance; el único campo aditivo será
  `configuredDriverName`; batalla continúa dependiendo de Gap y PIT conserva
  su estado aunque su columna esté oculta. Spec y PLAN/TASKS vivos:
  `docs/superpowers/specs/2026-08-25-standings-redline-columnas-configurables-design.md`.
  PR draft #795/ISA-799 solapa la habilitación de motion en Studio y queda como
  dependencia de integración, no absorbida. Rama
  `vantareapp/isa-849-standings-redline-columnas`. T1 completó el contrato
  aditivo mínimo: V1 y V2 publican `configuredDriverName` sin alterar
  `columns` ni los campos vigentes. Las regresiones fallaron primero y pasan
  17/17. T3a fija además el contrato de viewport: solo Endurance Redline usa
  `layout.w` como anchura base real; Original y otro Endurance conservan 520 px
  escalados. La política ya está conectada en Studio, Desktop/OBS, edición
  in-place y Workshop, incluido el preview DOM imperativo durante resize para
  evitar escalado transitorio. Sus regresiones fallaron primero; gate T3 final
  7 archivos/93 tests. T2 reemplaza la maqueta rígida por anclajes + delta +
  nueve métricas flexibles en orden, con presets/alineación canónicos y el mismo
  renderer para filas vivas y ghosts. Conserva 30 px, keys, clases semánticas y
  datos de motion; focal Redline+contrato 20/20. T4 compuerta solo las señales
  dependientes de celdas: sin Gap no hay batalla/presión; sin Best lap no hay
  hot/corona; sin Neumático no hay reveal. PIT y FLIP/flash/delta/entrada/ghost
  permanecen. Las tres regresiones fallaron primero; gate motion 27/27,
  typecheck y diff-check PASS. T5 adapta únicamente el inspector Redline:
  Posición/Piloto quedan activados y sin check/orden, pero conservan ancho y
  alineación; las métricas móviles saltan ambos anclajes y un aviso i18n indica
  la anchura mínima sin modificar el layout. T6 añade variantes reproducibles
  `standings-minimal` y `standings-all-columns` al Workshop. El primer protocolo
  visual detectó 10 px de overflow real porque la envolvente CSS seguía fija a
  420 px; `width: 100%` lo corrige solo para Redline. Con procedencia limpia
  `c892eca6`, Desktop/OBS/Harness pasan 12/12 capturas; el arranque frío de Vite
  dejó las dos primeras capturas Studio sin root y contaminó su grupo, pero el
  rerun Studio caliente pasa 4/4. Las cuatro superficies quedan así verificadas
  en transparent/solid/grid/context, sin overflow, errores ni contaminación.
  La secuencia productiva
  observó rise/fall, batalla, PIT, hot, reveal de neumático y ghost; las capturas
  mínima (420 px) y completa (1200 px) no muestran recorte horizontal ni
  solape. El preview colaborativo T3 no llegó a adjuntar tab tras tres timeouts,
  así que esto es evidencia Chromium/Workshop, no Wails real. Rebase de
  integración sobre `origin/nightly@741d31bf`; #795 sigue draft y abierto, sin
  absorber su alcance. La revisión propia del 2026-08-28 cubrió corrección,
  simplicidad, arquitectura, seguridad y rendimiento. Detectó y corrigió dos
  hallazgos Required antes del PR: la anchura mínima inline anulaba el
  `width: 100%` al ensanchar y Gap/Mejor vuelta/Neumático no respetaban toda la
  alineación configurada. También simplificó el reorder a una copia de array,
  sin adaptador ni abstracción nueva. Veredicto final: Approve, sin
  Critical/Required pendientes. Sobre el SHA revisado: focal 33/33, suite
  completa 419 archivos/3163 tests, typecheck, build, ESLint focal y protocolo
  visual OBS 4/4 PASS, sin overflow ni errores. El lint global conserva solo el
  `_damage` previo fuera de alcance. Push, PR, CI, merge, promoción y release
  todavía no realizados en este punto del expediente.

- **ISA-842 — autosave e historial productivo de Overlay Studio (2026-08-25,
  PR draft a nightly):** rebasada sobre `origin/nightly@c7d25f94`, la rama
  `vantareapp/isa-842-studio-autosave-undo` convierte cada cambio documental
  confirmado en autosave con debounce de 300 ms. `StudioProvider` mantiene un
  único save en vuelo y coalesce ediciones posteriores sobre la revisión
  confirmada; errores y timeouts dejan el documento recuperable. La ruta
  productiva monta `Ctrl+Z`, `Ctrl+Shift+Z` y `Ctrl+Y`, conserva 100 pasos aunque
  autosave ya haya confirmado el estado y persiste también cada undo/redo. El
  save incluye el archivo ligado a la sesión: cambiar el perfil activo global
  no puede escribir el documento abierto sobre otro perfil. Estado visible:
  pendiente, guardando, guardado automáticamente o reintento. ADR 0093 sustituye
  solo el guardado explícito de ADR 0003. Evidencia fresca tras el rebase:
  frontend completo 389 archivos/2978 tests PASS, focal final de autosave/store
  2 archivos/25 tests PASS, typecheck y build PASS, lint de los 14 TS/TSX
  modificados PASS y
  `go test ./...` PASS. El
  lint global solo conserva el fallo previo `_damage` no usado en
  `car-damage-numbers-view-model-v2.ts`, fuera de alcance. En el harness Orbit
  con Wails mock, X se guardó de 1560 a 1500; `Ctrl+Z` restauró 1560 y
  `Ctrl+Shift+Z` rehizo 1500, ambos con estado `saved`. Falta prueba manual en el
  ejecutable Wails real. Implementación rebasada en `a62c5035` y guard de
  revisión SWR en `569c3dec`; PR **#853** hacia `nightly`, autorizado para merge
  por Isaac el 2026-08-26. Sin promoción a `testers`/`master` ni release.

- **ISA-770 — saltos de widgets en Studio (2026-08-25, PR a nightly):**
  la medición A/B en Wails/WebView2 separó dos caminos. En movimiento reducido,
  el padre de `5a8de7ed` presentó un frame con escena oculta, escala cero,
  widgets `0×0` y un desplazamiento de 698 px; el commit actual dejó los cuatro
  contadores a cero. El Windows medido usa `prefers-reduced-motion: false`, así
  que ese fix no explicaba por sí solo el salto normal. Para ese camino se
  incorporaron los fixes ya validados de la rama de rendimiento: cache SWR del
  documento, convergencia sin rerender si el documento fresco es idéntico,
  bloqueo de fuentes locales antes de montar widgets y geometría del stage
  persistida entre montajes. En el mismo WebView2, entrada fría y vuelta
  Launcher → Studio terminaron con widgets positivos desde su primer frame,
  cero transiciones activas y desplazamiento máximo de 0 px. La ventana Wails y
  el motor WebView2 fueron reales; el frontend se sirvió desde el harness mock
  aislado porque el perfil temporal de Wails no tenía sesión/licencia. El script
  reproducible queda en `frontend/scripts/studio-widget-jump-webview-ab.mjs`.
  Rama `vantareapp/isa-770-onboarding-retencion`, **en PR #844 hacia
  `nightly`** (2026-08-25). Sin release.

- **Inspector de widgets del Studio rehecho (2026-08-25, PR a nightly):** el
  panel lateral tenía tres controles que no hacían lo que aparentaban y una
  columna dominada por seis selectores de color a ancho completo. Corregido:
  «Color de acento» se retira del manifiesto de Vantare Endurance porque ese
  sistema nunca lee `--vo-standings-accent` (en Vantare Original sigue, ahí sí
  está cableado); el desplegable de sistema aplica el diseño por defecto del
  destino en vez de solo filtrar la lista; cada color sobrescrito ofrece
  restablecer al valor del diseño y la sección, «Restablecer apariencia»; el
  selector de diseño avisa cuando hay apariencia por encima. En lo visual, los
  colores pasan a filas compactas agrupadas, `appearance` se separa de `design`
  como acordeón propio, los resúmenes dejan de repetir la cabecera y cada
  sección se explica al dejar el ratón encima. Los pasos de columna dicen
  «Estrecha»/«Izquierda» en vez de `SM`/`MD`/`LG`. Gates PASS: 2978 tests,
  typecheck, lint, auditoría i18n y evidencia visual regenerada. PR #844.
- **Ajustes Orbit: autosave de atajos, descarga de informe y búsqueda
  (2026-08-22, en rama):** tres mejoras de la pantalla Ajustes sobre
  `origin/nightly@4ec98fea`, rama `vantareapp/isa-767-ajustes-orbit-autosave-informe-busqueda`,
  PR draft **#768** hacia `nightly`: (1) los atajos se guardan al grabarlos sin
  botón «Guardar»; (2) botón de descarga del informe de diagnóstico preparado
  (la acción `download` existía testeada pero ninguna pantalla la ofrecía);
  (3) búsqueda de ajustes en la columna de contexto con índice de filas reales,
  matching sin diacríticos y navegación al resultado. Gates locales PASS:
  frontend 2883/2883, typecheck, lint y build. Hallazgos diferidos documentados
  como issues #762 (más hotkeys requieren backend Go), #763 (cerrar a bandeja,
  no hay tray) y #764 (decidir telemetría de producto; no existe analytics).
  Sin integración ni promoción; pendiente review de Isaac.
- **Hub: porte Command Orbit completo en Nightly (2026-08-19).** El hub de
  escritorio migró a la shell **Command Orbit v0.3** (`docs/design/orbit-v03/`):
  integrado en `nightly` con el commit `af2c90d1` (PR #279) en la release
  **v0.1.0.7-nightly.10**. Shell Orbit (rail lateral, columna contextual,
  topbar, paleta `Ctrl K`), kit `frontend/src/ui/orbit/`, tema
  `vantare-orbit.json`, `orbit.tokens.css` y harnesses `visual:orbit-*`.
  **Fase 8 en curso (ISA-368):** retirada del sistema v5 del hub
  (`card-sleek`, `glass-panel`, uppercase de chrome, `ProSidebar`/`V52Shell`) y
  del flag `hub.orbit`; los overlays mantienen su sistema V3. Próximos pasos:
  code review/limpieza del porte y decisión de promoción a `testers`.

- **Fase 2 — inspector flotante in-place (2026-08-16, implementada en rama):**
  extensión del modo edición del overlay con un panel flotante para editar
  content/appearance/behavior del widget seleccionado con datos live.
  Implementada en `vantareapp/isa-402-fase2-inspector-flotante` (6 cortes
  completos): sesión única con `StudioProvider` + `InPlaceProfileClient`
  (load en memoria, save → `overlay:edit-layout:save`, nunca
  `studio:profile:save`), `useInplaceAutosave` por comandos con debounce/
  coalescing, hardening del store (refs de documento/revisión), vista headless
  `WidgetPropertyInspectorView` compartida con el Hub (guard de imports),
  panel fijo a 5 Hz con undo/redo por botones, `LicenseProvider`/`I18nProvider`
  en la rama edit, `recoveryStorage={null}`, sesión pineada a `layout.type`,
  gate P1 de preview imperativa bajo el store PASS. Gates locales: frontend
  388/2863 PASS, Go completo PASS, build/lint focal/diff-check PASS. Spec:
  `docs/superpowers/specs/2026-08-16-overlay-inplace-edit-fase2-inspector-design.md`
  (ACCEPTED); plan: `docs/superpowers/plans/2026-08-16-overlay-inplace-edit-fase2-execution-plan.md`.
  Sin push/PR/promoción; pendiente de revisión de Isaac.
- ISA-365 corrige en rama aislada el Relative: selecciona por distancia física
  circular dos rivales delante y dos detrás, mantiene al jugador centrado y no
  elimina filas cuando LMU carece de gap temporal. En boxes y ante datos no
  comparables muestra `—` neutral; Original, Crystal y Endurance respetan el
  lado físico explícito. Los perfiles antiguos se normalizan a 2+1+2.
  Frontend 376/2750 y build PASS; el gate visual valida todas las capturas de
  Relative al 0 % y conserva dos diferencias ajenas de Delta stale. El lint
  focal propio pasa y el barrido completo del diff solo reproduce el error
  heredado `_absent` de `authoring-fixtures.ts:231`, fuera del cambio. Rama
  nacida sobre `origin/nightly@3eb5dd7b`, sincronizada con
  `nightly@7341e8cd` y publicada en la PR draft #263 hacia `nightly`; sin
  integración, promoción ni release. El CI de la PR, run `31896585676`, pasó
  ruta de promoción, gates bloqueantes y seguridad sobre `839603f5`.
- **Edit mode in-place del overlay (2026-08-16, promovido a `nightly`):** la
  hotkey `Ctrl+Shift+E` (`toggleEditMode`) ya no abre Overlay Studio en el Hub:
  alterna el overlay desktop entre racing y un modo edición de layout in-place
  (seleccionar/mover/redimensionar con snap, guías de alineación y autosave).
  Rama de integración `vantareapp/isa-401-os-12-n01-promover-inplace-edit-a-nightly`;
  spec `docs/superpowers/specs/2026-08-16-overlay-inplace-edit-hotkey-design.md` y
  plan `docs/superpowers/plans/2026-08-16-overlay-inplace-edit-hotkey.md`.
  Gates locales PASS (Go completo, frontend 378/2765, build, lint focal) y CI
  del PR #267 PASS sobre el HEAD exacto. Sin issue de Linear (decisión de
  Isaac 2026-08-16); el nombre `isa-401` cumple el gate de topología.
- ISA-363 está promovida a `nightly` y corrige el parpadeo de widgets durante
  el relevo
  `stale -> live`: Desktop y OBS conservan el último snapshot como `stale`
  hasta recibir la proyección de la nueva revisión, sin publicar el frame
  `disconnected` intermedio. Arranque sin datos, estados reales de conexión o
  parada y proyecciones bloqueadas mantienen el cierre seguro. TDD RED/GREEN,
  focal 4/4, frontend 375 archivos/2736 tests, build, ESLint focal y diff-check
  PASS; el lint global conserva 49 errores y 2 warnings heredados fuera del
  cambio. La rama se sincronizó con `origin/nightly@028c7512`; implementación
  aprobada `ae313e2e`, head final `ac46c3c3` y CI final del PR #260
  `31896118568` en verde. Tras autorización expresa de Isaac, el PR #260 se
  integró por squash en `nightly@7341e8cd`. El gate posterior `31896647826` y
  el roadmap `31896647803` pasaron sobre ese SHA. ISA-367 registra la
  promoción; sin paso a `testers`/`master` ni release.
- ISA-364 está promovida a `nightly` y corrige el listado vacío de
  `Mis perfiles`: los documentos guardados como V3 puro se listan mediante el
  migrador canónico, mientras el
  camino V0/V2 conserva su compatibilidad. El servicio no modifica perfiles ni
  incluye JSON de ajustes o inválidos. TDD RED confirmado; focales de listado
  y paquete `internal/app` PASS. Gates finales: `go test ./...`, frontend
  375/2734, build, `go vet ./internal/app`, fragmento y diff-check PASS; los
  `AbortError` de teardown frontend permanecen heredados y el proceso termina
  con exit 0. El CI final del PR #261, run `31894030661`, pasó topología,
  gates bloqueantes, build Wails y pasos informativos sobre `03a0205b`. La
  rama partió de `origin/nightly@3eb5dd7b`; implementación `f753c172` y merge
  squash del PR #261 en `nightly@22946e6f`, autorizada expresamente por Isaac.
  El gate posterior `31894845365` y el roadmap `31894845385` pasaron sobre el
  SHA integrado. ISA-366 registra la promoción; sin paso a `testers`/`master`
  ni release.
- Escala proporcional de escritorio (rama `vantareapp/isa-343-ui-resp-escala-proporcional-1080-4k`,
  sin Linear por decisión de Isaac; el prefijo isa-343 solo cumple la política de canales del CI y
  no reutiliza la issue descartada; spec `docs/superpowers/specs/2026-08-14-ui-escala-proporcional-1080-a-32-9-4k.md`):
  el overlay (Desktop/OBS) escala por altura desde la base `1920x1080` (QHD≈1.333x, 4K=2x)
  y en ultrawide reparte los widgets hasta un frame máximo 21:9 centrado; los widgets
  full-width (Broadcast Tower) se estiran al frame. El Hub aplica zoom global uniforme
  (`CSS zoom` en `html.hub`, factor `clamp(altura/1080, 1, 2.5)`) y el Studio escala con él
  conservando sus coordenadas internas. Los trabajos previos ISA-337/ISA-343 quedan
  descartados por Isaac y no se reutilizan. Gates: suite frontend completa 378/2768,
  build, lint focal y runner visual `visual:escala-proporcional` (matriz 10 viewports +
  zoom 5 + capturas 5) PASS. Las capturas usan UI real productiva: Hub completo con mock
  Wails (topbar/dock/dashboard) y widgets con diseño oficial sobre el escenario del Studio.
  Isaac revisó y aprobó las capturas. Pendiente: verificación manual en Windows
  (zoom WebView2, DPI 100/125/150) y decisión de Isaac sobre promoción a `nightly`.
- Hub / ISA-358 está promovida a `nightly` mediante PR #245 y squash
  `2909ba73d907eee993fcdec866829973b1bb1474`: la versión/canal del hero procede del runtime, el
  calendario comparte un único estado y no pierde respuestas inmediatas, el
  carrusel usa el snapshot público generado desde Linear con procedencia
  visible y Novedades usa los manifiestos canónicos de release auto-descubiertos.
  Focales 46/46, suite frontend 371/2681, build, lint focal propio y diff-check
  pasan. El preview T3 abrió el servidor correcto pero no pudo producir
  snapshot ni evaluación; queda pendiente la comprobación visual manual. Los
  gates del PR, el gate posterior de Nightly `31817001802` y la regeneración
  del snapshot público `31817001849` pasaron. No hubo promoción a
  `testers`/`master` ni release.
- ISA-357 corrige localmente la batalla animada de Standings Redline: solo
  carrera, una pareja máxima y prioridad por cercanía a la fila del jugador,
  con desempate por intervalo y orden estable. El relevo entre parejas tampoco
  solapa una disolución anterior con la nueva caja. El code review corrigió la
  transición carrera→clasificación, la ausencia de la fila del jugador y la
  frescura de una secuencia rápida A→B→A. TDD focal 21/21, frontend 370
  archivos/2679 tests, build, ESLint focal, design-system 3/3, fragmento y
  diff-check PASS. Persisten dos `AbortError` heredados de teardown con exit 0.
  El Workshop respondió con Vite, pero snapshot y evaluación DOM de T3
  fallaron/agotaron timeout; el servidor temporal quedó cerrado y la inspección
  visual manual continúa pendiente.
  Rama aislada desde `origin/nightly@673283a2`, sincronizada finalmente con
  `nightly@2909ba73` en `a389f8d0`; implementación `71d6b360` y fix de review
  `cf83021a`. La PR #243 se integró por squash en `nightly@fe04a0af`; gates de
  PR y posteriores al merge PASS. Sin promoción a `testers`/`master` ni release.
- ISA-334 (Broadcast Tower horizontal): el fix `04c3ac3c` ya está promovido
  a `nightly`, y se portó a la rama `vantareapp/isa-338-...` (commit `4d69de18`,
  2026-08-14). El widget nace como franja horizontal a todo el ancho real del
  perfil con la altura canónica Crystal de 71px (1872×71), con resize solo
  este/oeste y conformado de layouts legacy a esa franja. El port ajusta la
  altura a 71px (no a los 50px del fix original) para que el renderer Crystal
  no se recorte. Verificado en harness: catálogo 1920×71, frame 1920×71,
  handles E/W, renderer Crystal sin scroll vertical.
- Overlay: el Workshop y sus barandillas fueron promovidos a Nightly mediante
  PR #162; continúa excluido físicamente de Stable. Los arreglos de Studio de
  PR #187, el gate visual de PR #193 y Standings/Relative/Delta Redline de PR
  #191 están también en Nightly. Pedals Redline se entrega en PR draft #195 y
  completa la cobertura visual de los cuatro widgets insignia. El flaky de CI
  ISA-311 quedó corregido y promovido mediante PR #200 a `nightly@54f267b`.
- Delta: ISA-347 está implementada y validada en rama aislada sobre
  `origin/nightly`; añade referencias reales personal/sesión/anterior, unicidad
  por layout y hotkey global configurable. El code review corrigió historial
  nativo, selección canónica legacy y concurrencia del hotkey en `46df1b2`. La
  rama incorporó `nightly@638b470` en `f0e40bd`; la PR #233 pasó los gates y se
  integró por squash en `nightly@5499008`, sin promoción a `testers`/`master` ni
  release.
- Decisión ISA-315: objetivo 2026-08-31 = Overlay Studio V1 estable en
  `testers`. No equivale a `master`, release pública ni suite completa. Existe
  una cohorte aproximada de 10 testers Windows 10/11 con respuesta el mismo
  día. Plan canónico:
  `docs/overlays-studio/overlay-studio-v1-commercial-launch-plan.md`.
- Venta controlada objetivo 2026-09-22..30: Overlay Studio V1 como producto
  principal y módulos no terminados etiquetados Beta/Preview. Depende de gates
  separados de raíz, Billing, artefactos y aprobación; no está autorizada por
  este handoff.
- Launcher: ISA-9 fue validada históricamente; integración real por auditar.
- Hub: ISA-358 integrada en Nightly; ISA-360 registra la promoción y su
  evidencia exacta.
- Base documental ISA-315 rebasada: `nightly@54f267b`.
- PR #198 está autorizado para promoción a `nightly`; `testers`, `master`,
  venta y release permanecen fuera del alcance. Las integraciones en `develop`
  son históricas.

## Overlay Studio

Editor único. Canvas gestiona espacio; inspector/documento configuración;
renderers reciben ViewModels puros.

- multi-select y grupos persistentes sin anidación inicial;
- bloqueo por salida;
- borrador/snapshots de preview; Desktop/OBS cambian al guardar/aplicar;
- diseños oficiales inmutables y duplicables;
- tipo → sistema visual → diseño → configuración;
- Original/Crystal; Crystal gratuito con marca;
- perfiles por simulador con herencia;
- mocks explícitos; stale/missing seguros;
- Desktop puede compartir Studio; OBS puede ser independiente;
- HTML como contrato visual;
- 60 FPS si el hardware lo permite; 10 widgets sin degradación y estrés 20.

Autoridad: `layout-studio-v10.html` para shell/editor y
`docs/overlay-glassmorphism-pro.html` secciones 01–16 para Crystal. Se excluye
V2/reestilizados. El siguiente paso de telemetría es TC-07.

Riesgos:

- **P1:** confundir fondo del showcase con widget en paridad.
- **P1:** divergencia Studio/Desktop/OBS.
- **P2:** baselines obsoletos ocultando regresiones.
- **P2:** cambios locales del checkout `refactor`.

## Overlay Workshop y apertura correcta desde rama/worktree

Workshop tiene un MVP local dev-only en `/workshop`: reutiliza
`WidgetVisualViewport` y `WidgetVisualHost` productivos, con fixtures puros y
query reproducible. Su contrato y microplan están en
`docs/overlays-studio/os-09-overlay-workshop-contract.md`.
ISA-261 establece `frontend/src/overlay/authoring/fixtures/` como única
autoridad para escenarios deterministas; `overlay-harness/harness-fixtures.ts`
solo conserva el re-export temporal. El contrato histórico Crystal (21/18) y
el contrato adicional de Engineer Radio permanecen separados.

### Smoke real de la aplicación que se ha verificado

La ruta que se utilizó correctamente para probar la aplicación completa fue una
build local de producción y **no** `wails3 dev`. Debe ejecutarse desde la raíz
del checkout o worktree que se quiere validar.

1. Confirma primero la fuente que vas a compilar. No continúes desde una rama o
   worktree distinto al que se quiere probar:

   ```powershell
   git branch --show-current
   git rev-parse --short HEAD
   git status --short
   ```

2. Cierra cualquier binario anterior para no confundir la build nueva con una
   instancia antigua:

   ```powershell
   Get-Process vantare -ErrorAction SilentlyContinue | Stop-Process -Force
   ```

3. Indica el `.env.local` autorizado. En el checkout habitual será
   `frontend\.env.local`. Un worktree limpio normalmente no contiene ese archivo
   porque está ignorado por Git; en ese caso apunta `$envFilePath` al archivo
   local autorizado, sin copiarlo al repo, imprimirlo ni mostrar sus valores:

   ```powershell
   $envFilePath = Join-Path $PWD 'frontend\.env.local'
   if (-not (Test-Path -LiteralPath $envFilePath)) {
     throw 'Set $envFilePath to the authorised local frontend/.env.local'
   }

   foreach ($line in Get-Content -LiteralPath $envFilePath) {
     if ($line -notmatch '^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=') {
       continue
     }
     $parts = $line -split '=', 2
     $name = $parts[0].Trim()
     $value = $parts[1].Trim()
     Set-Item -Path "Env:$name" -Value $value
     if ($name -eq 'VITE_SUPABASE_URL') {
       $env:VANTARE_SUPABASE_URL = $value
     }
     if ($name -eq 'VITE_SUPABASE_ANON_KEY') {
       $env:VANTARE_SUPABASE_ANON_KEY = $value
     }
   }

   if (-not $env:VITE_SUPABASE_URL -or
       -not $env:VITE_SUPABASE_ANON_KEY -or
       -not $env:VANTARE_SUPABASE_URL -or
       -not $env:VANTARE_SUPABASE_ANON_KEY) {
     throw 'Missing public Supabase configuration'
   }
   ```

   Es necesario cargar ambos pares: Vite usa `VITE_SUPABASE_*` y el backend Go
   necesita `VANTARE_SUPABASE_*`. Cargar solo uno deja media aplicación sin
   configurar.

4. Compila el frontend, genera la configuración temporal del backend, construye
   el ejecutable y elimina siempre el archivo generado:

   ```powershell
   corepack pnpm --dir frontend build

   powershell -NoProfile -ExecutionPolicy Bypass -File `
     .\tools\generate_supabase_config.ps1 `
     -OutFile .\cmd\vantare\supabase_build.go

   try {
     go build -tags production -trimpath -buildvcs=false `
       -ldflags "-w -s -H windowsgui -X main.version=v$(Get-Content VERSION)" `
       -o .\bin\vantare.exe .\cmd\vantare
   } finally {
     Remove-Item .\cmd\vantare\supabase_build.go -ErrorAction SilentlyContinue
   }
   ```

   `cmd/vantare/supabase_build.go` contiene configuración generada: está
   ignorado por Git, no se abre, no se imprime y nunca se commitea.

5. Abre exclusivamente el ejecutable recién construido:

   ```powershell
   Start-Process -FilePath .\bin\vantare.exe -WorkingDirectory .\bin
   ```

   No abras `vantare.exe` desde la raíz, `build\bin`, un portable antiguo ni una
   build de otro worktree.

6. Smoke mínimo: la app abre; la sesión y el acceso se resuelven; Hub carga; y
   Overlay Studio abre. Registra la rama y SHA probados. Si aparece
   «Configuración incompleta», la build/backend no recibió la configuración
   pública de Supabase o se abrió un binario stale: no es un problema de la
   cuenta ni de su licencia.

### Cuándo usar Wails dev

`powershell -NoProfile -ExecutionPolicy Bypass -File
.\tools\start-wails-dev.ps1` queda como alternativa para depuración interactiva
con HMR. No sustituye al smoke anterior y su resultado no demuestra que
`bin\vantare.exe` se haya construido correctamente.

Autoridades complementarias: `docs/release-beta-operations-runbook.md`
(**Opción A2: build rápida de smoke local, no publicable**; no distribuye
installer, zip ni release) y `docs/tester-build-instructions.md`.

## Launcher

MoTeC i2 Standard 1.1; fijados/recientes/no instaladas/catálogo; ejecutables,
shortcuts, apps Windows y Steam; perfiles con apps/módulos/esperas; continuar o
abortar ante fallo; cerrar solo procesos iniciados por Vantare; perfil LMU
externo opt-in; autostart una vez; módulos con estado; estadísticas locales;
catálogo firmado/cacheado.

### Auditoría de lanzamiento · 2026-09-24

[Issue #1368](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1368)
revisa el `origin/nightly` verificado en `6df485fe`. Estado: **no apto para
lanzamiento** hasta cerrar sus gates. La pantalla Orbit manda el perfil dentro
de `{profile: ...}`, pero Wails lo deserializa como perfil directo; crear y
guardar fallan y `launcher:error` no se muestra. El ejecutor no aplica las
políticas de proceso ya abierto, cancelación, salida ni primera espera. El
comando de decisión solo responde con un evento y no gobierna la cadena. El
cierre/reinicio comprueba el PID sin confirmar ruta o nombre reales. Atajo e
inicio con Windows se editan, pero el guardado Orbit no activa sus handlers;
el gestor de atajos tampoco conecta una pulsación con el lanzamiento. La
cancelación borra la exclusión mutua antes de terminar la cadena.

Evidencia: `go test ./internal/app/launcher/...` y `go test ./cmd/vantare/...`
pasaron; 108 pruebas frontend enfocadas y `pnpm build` pasaron. `pnpm test`
global y `go test -race` amplio no son gates válidos en esta máquina por
agotamiento de memoria/paginación; race también encontró un compilador C
incompatible. No hubo prueba física Wails/Steam/LMU ni del instalador. El
siguiente corte debe reproducir y corregir estos fallos, pasar CI y comprobar
en Windows real creación, ejecución, errores, recuperación, procesos, atajos,
autostart y las aplicaciones comprometidas para el lanzamiento.

Avance de la rama `vantareapp/isa-1368-launcher-release-audit`: el perfil de
Orbit se envía con la forma que deserializa Wails; crear solo abre un borrador
y cancelar no deja un perfil vacío. `launcher:error` se presenta en Orbit y un
perfil sin pasos no se puede lanzar. La primera espera se aplica y es
cancelable; la cancelación conserva la exclusión de la cadena hasta que termina.
El cierre/reinicio requiere un PID observado en la sesión y un ejecutable
consultado al sistema; un paso fallido no autoriza cierre y reiniciar valida
la ruta antes de tocar el proceso. El catálogo ya no anida botones. Las
regresiones focales, typecheck, build y lint pasan. `go test -p 1 ./...` no
concluyó: quedó esperando en el paquete `internal/app` mientras otra prueba
DuckDB seguía activa en la máquina; se interrumpió esta ejecución sin atribuir
el problema al Launcher. **Sigue sin aptitud de lanzamiento:** las políticas `ask`,
`alreadyRunning`, `cancel` y `exit` aún no gobiernan el ejecutor; el atajo y
autostart editados no se activan al guardar; falta Wails/Steam/LMU físico y
comprobar el artefacto instalable. No hay promoción ni release.

Segundo avance de #1368: los atajos de perfil se cargan al arrancar y se
reconstruyen tras guardar/borrar usando el gestor global que sí despacha la
pulsación. El guardado rechaza combinaciones reservadas o en conflicto con
Hub/u otros perfiles; el editor también bloquea nombres vacíos y atajos no
admitidos. El flag de inicio de Windows se sincroniza al guardar, con rollback
del perfil si falla la escritura del Run key, y se retira antes de borrar el
perfil; un perfil normal sin autostart no requiere acceso al registro. El
primer delay ahora se edita en `policy.firstStepDelay` y se muestra igual que
lo ejecuta Go. 13 archivos/117 pruebas Launcher, build, typecheck y lint
locales pasan. El CI del primer commit pasó el gate bloqueante, pero el
ratchet detectó 10 fragmentos CSS reagrupados; el estilo del aviso se movió a
una hoja nueva para que el archivo histórico permanezca idéntico a la base.
La repetición de CI de este último cambio está pendiente. El `--launch` del
Run key sigue sin invocarse en el arranque y varias entradas de perfil pueden
abrir varias instancias; hay decisión de producto solicitada. Atajos y Run key
no tienen aún prueba física tras reinicio. **No apto para lanzamiento.**

Seguimiento del 24-09-2026 en #1368: el ratchet remoto de `765ce2af` pasó.
Se añadieron pruebas de rollback cuando el Run key falla al crear o borrar un
perfil, y se alineó la lista de atajos reservados de Go con la interfaz.
También se reprodujo un fallo de la cadena: una app ausente permitía seguir
al siguiente paso pese a `failure: stop`; el test falló antes de corregirlo.
`go test ./internal/app/launcher ./cmd/vantare -count=1` pasó después.
El HEAD `ea46ba05` está publicado en la PR draft #1369; sus gates remotos
siguen en curso. Persisten las decisiones y pruebas físicas indicadas arriba.
Una prueba adicional reprodujo que el watchdog de Orbit marcaba una cadena
como fallida a los 30 s durante una espera configurada de 60 s. La señal
`pending` ahora lleva el delay previsto y el watchdog espera ese plazo más
su margen habitual. Pruebas Go focales, 11 frontend, typecheck, build y lint
pasaron localmente; falta el CI del nuevo HEAD y validación visual real.
El toast que relanza la cadena completa ya lo dice explícitamente; el evento
legacy aún se llama `retry:failed` y el reintento solo de pasos fallidos sigue
pendiente de implementación en ese corte.

Tercer avance de #1368: `a22ff8e8` pasó gates bloqueantes, ratchet,
promoción de ruta y GitGuardian en la PR draft #1369. El reintento del toast
ahora selecciona solo pasos fallidos y no ejecutados; conserva los índices del
perfil original en snapshot/Orbit, de modo que una app ya completada sigue
mostrándose como tal. Reintentos sucesivos tampoco relanzan pasos completos.
Un intento simultáneo devuelve error sin sustituir el progreso de la cadena
activa. Las pruebas Go del orquestador y `cmd/vantare` pasaron localmente;
también 11 pruebas frontend, build y lint. El nuevo HEAD aún debe pasar CI.
Siguen pendientes la aplicación completa de políticas, el autostart de una
instancia y la comprobación física de Wails/Steam/LMU/instalador. **NO-GO.**

Cuarto avance de #1368: el HEAD `d277fbc4` pasó los gates bloqueantes, pero
el ratchet remoto falló por `staticcheck NEW=1` en Linux; el workflow no subió
`.last-run.json` porque `upload-artifact` excluye archivos ocultos y el log
solo muestra el conteo. No se considera gate verde. En la rama local, la
política `failure: ask` ya pausa la cadena, emite una solicitud con acciones
cerradas y plazo de 2 minutos, y `launcher:decision:resolve` reanuda solo
con una acción ofrecida. La decisión recordada se guarda antes de reanudar;
cancelación o plazo vencido detienen la cadena y retiran el diálogo. Orbit
presenta la pregunta y el watchdog respeta el plazo. Un fallo en el último
paso termina sin preguntar si se continúa. Las pruebas Go focales repetidas,
13 frontend, typecheck, build y lint pasaron localmente. Falta publicar este
corte, resolver el hallazgo nuevo del ratchet y verificarlo en Wails real.

Quinto avance de #1368: `8a4e5978` pasó el gate bloqueante completo (Go,
frontend, lint y build Wails Windows), promoción de ruta, GitGuardian y ratchet
de calidad (NEW=0, policy_changed=false). Una regresión posterior reprodujo
que cancelar un perfil acababa sobrescribiendo `stopped` por `failed`, y Orbit
ofrecía reintentar una cancelación voluntaria. El runner ahora emite el estado
`stopped`; servicio y UI lo conservan y no muestran el toast de fallo. Tests
Go y frontend focales y typecheck pasaron; el CI de este nuevo corte queda
pendiente. Persisten las políticas de cancelación y salida de procesos,
proceso ya abierto, autostart de una sola instancia y pruebas físicas. **NO-GO.**

El guardado ahora rechaza activar autostart en un perfil sin pasos. La
regresión falló antes del cambio y pasó después junto con `go test` focal de
Launcher y `cmd/vantare`. Los borradores vacíos siguen siendo guardables sin
autostart. La semántica de varios perfiles de inicio sigue pendiente de la
decisión de Isaac.

Sexto avance de #1368: la autoridad de cierre/reinicio de un ejecutable ahora
conserva el PID, la ruta observada y la hora de creación real del proceso
durante toda la sesión del servicio. La limpieza visual a los 30 segundos ya
no descarta esa autoridad; el cierre/reinicio vuelve a consultar el proceso
vivo y rechaza un PID reciclado aunque apunte al mismo ejecutable. Solo se
registra un paso ejecutable terminado correctamente y cuya ruta coincide con
el catálogo; el PID de `rundll32` usado por Steam no se considera el juego.
Cerrar o reiniciar revoca la identidad anterior. Tests Go focales pasaron en
Windows. Falta CI del nuevo HEAD, prueba física de cierre/reinicio y resolver
el comportamiento de procesos al cancelar o salir. **NO-GO.**

Un reinicio explícito ahora observa la identidad de la instancia nueva y la
registra para permitir un cierre posterior, solo si ruta y hora de creación
coinciden con el catálogo. Si no puede observarla, la instancia nueva no
adquiere autoridad de cierre. Durante las pruebas se reprodujo además una
regresión del descubrimiento de iconos: workers concurrentes podían emitir
81 % y después 78 %. El servicio serializa y mantiene monótono el progreso;
el test falló antes del arreglo y pasó 10 repeticiones después. Go y vet
focales pasan. Falta CI remoto del HEAD final y comprobación física.

Séptimo avance de #1368 (candidato local, aún sin publicar): la cadena consulta
los procesos Windows por ruta completa y hora de creación antes de aplicar
`alreadyRunning`. Reutilizar no concede autoridad de cierre; reiniciar solo
se ofrece si todas las instancias coinciden con identidades iniciadas y
registradas por Vantare. La decisión `ask` pausa la cadena y permite recordar
reutilizar o reiniciar. Los tests de proceso real y de decisiones pasan en
Windows, pero todavía falta la prueba física de una aplicación externa.

El paso `steam-uri` deja de dar éxito por abrir `rundll32`: exige conocer el
ejecutable del juego, espera hasta 2 minutos para observar su proceso y
devuelve fallo si no aparece. El PID del manejador URI no se presenta como
PID del juego ni se registra como proceso propio. Discovery intenta resolver
el ejecutable también desde la ubicación del registro; Steam puede figurar
instalado sin que el perfil sea lanzable si falta esa ruta. Orbit mantiene el
estado de lanzamiento durante la espera. Pruebas rojas antes del cambio para
discovery/disponibilidad, Go focal y vet PASS; 16 pruebas frontend dirigidas,
typecheck, build y lint PASS. `go test -race` no se completó por la opción de clang
`-Qunused-arguments` que el `gcc.exe` local no admite. El corte publicado
`f43225ea` pasó gates bloqueantes (incluido build Wails Windows), promoción
de ruta, ratchet de calidad y GitGuardian. Siguen pendientes autostart de una
instancia, políticas
de cancelación/salida/reintentos y revisión física Wails/Steam/LMU/instalador.
**NO-GO**, sin merge, promoción ni release.

Octavo avance de #1368 (candidato local): al cancelar un perfil, el runner
espera a registrar su último paso antes de aplicar la política. `leave`
conserva las aplicaciones; `close-started` actúa solo sobre procesos asociados
a ese perfil e identidades observadas; `ask` ofrece ambas opciones en Orbit,
caduca dejando abiertas las apps y puede recordar la respuesta. Las pruebas
de cancelación y del diálogo pasan. Un reinicio explícito conserva la
asociación al perfil si la nueva identidad está verificada; revoca siempre el
PID anterior. Una respuesta tardía solo puede cerrar procesos nacidos antes
de la cancelación, aunque el perfil se relance mientras espera. Aún falta
validar el cierre con procesos reales y completar la
política independiente `exit`.

Revisión del instalador: `project.nsi` enviaba cierre normal a Vantare y,
tras cinco segundos, ejecutaba `taskkill /F` por nombre. Eso podía saltarse
una decisión de salida y matar una instancia todavía abierta. El candidato
solicita el cierre normal y aborta la instalación si el ejecutable sigue en
uso tras el plazo de espera existente de diez segundos; no fuerza el cierre.
Queda pendiente construir y probar el instalador real con Vantare abierto,
incluida una respuesta lenta al aviso de salida.

Revisión de ciclo de vida: el reinicio ya no ata la aplicación externa al
contexto de Vantare; cerrar el Hub no la termina implícitamente cuando debe
quedar abierta. El cierre explícito deja de usar `taskkill /T`, que podía
alcanzar descendientes no iniciados directamente por Vantare, y actúa solo
sobre el PID verificado. Los tests Go focales y vet pasan; falta comprobar
este comportamiento con procesos reales durante la sesión visual acordada.

Noveno avance de #1368 (candidato local): al cerrar Vantare se detienen y
esperan las cadenas activas antes de decidir sobre los procesos que abrió
esta sesión. Cada perfil aplica `exit: leave`, `close-started` o `ask`; la
pregunta nativa de Windows propone cerrar solo identidades verificadas y deja
las aplicaciones abiertas por defecto. Los procesos ya terminados no provocan
un aviso. El cierre del Launcher se ejecuta al inicio del apagado, antes de
consumir el presupuesto compartido de los demás servicios. El apagado anula
las preguntas pendientes de cancelación y evita que una respuesta antigua
aplique esa política después de asumir el control la política de salida.
Las regresiones de salida, diálogo pendiente y exclusión de nuevas cadenas,
`go test ./internal/app/launcher ./cmd/vantare -count=1 -timeout 90s` y
`go vet` focal pasan. Falta publicar y verificar este HEAD en CI, además de
probar el aviso y el cierre con Wails y procesos reales. El HEAD anterior
`a27f2419` tiene ratchet, ruta y GitGuardian verdes; el gate bloqueante
remoto continúa pendiente. **NO-GO**, sin merge, promoción ni release.

Décimo avance de #1368 (candidato local): Orbit deja editar en modo avanzado
las políticas ya operativas de aplicación abierta, fallo de paso,
cancelación y salida. El formulario conserva las demás opciones al cambiar
una política y ofrece etiquetas en es/en/pt/it. La regresión de controles
ausentes falló primero y pasó después. Las 125 pruebas focales del Launcher,
typecheck, build y lint frontend pasan. La suite frontend global se interrumpió
tras timeouts de layout ajenos al Launcher al correr en paralelo con build y
lint; las dos suites que fallaron pasaron aisladas (5 pruebas). Se espera el
gate remoto para el veredicto de conjunto. La política de reintento sigue
pendiente de concretar; Isaac tiene una pregunta abierta sobre qué debe
significar `retry: all`. La UI y los procesos reales siguen sin revisión
física; antes de computer use se avisará y esperará su confirmación.
Una regresión posterior detectó que el editor dejaba guardar esperas
fraccionarias aunque el contrato Go usa segundos enteros; ahora solo acepta
enteros seguros no negativos. La prueba falló antes y pasó después con
typecheck.

Undécimo avance de #1368 (candidato local): el flag `--launch=<id>` se entrega
ahora al Launcher al arrancar y Wails mantiene una sola instancia de Vantare.
Las peticiones de otros valores Run recibidas mientras se cargan los ajustes
se encolan y se procesan cuando el servicio está listo, conservando el orden;
se descartan flags inválidos. Se sigue el contrato existente de múltiples
perfiles marcados para inicio con Windows dentro de una instancia, sujeto a
la respuesta de Isaac sobre esa preferencia. Si una cadena hace una pregunta
antes de montar Orbit, el proveedor se suscribe y pide al backend las
decisiones todavía pendientes; las resueltas no se reenvían. Las regresiones
de cola y recuperación fallaron antes y pasan después. 126 pruebas focales
Launcher frontend, Go focal, typecheck, build, lint y vet pasan. Faltan CI
del HEAD publicado, arranque real de Windows y prueba de preguntas al entrar
en el Hub. No se afirma aptitud de lanzamiento todavía.

Duodécimo avance de #1368 (candidato local): el arranque con flag comprueba
que el perfil aún existe y que cada paso apunta a un archivo local antes de
abrir una cadena. Una ruta ausente o una carpeta se omiten con registro local,
sin mostrar un error tardío al usuario. Si el perfil ya no existe, se retira
su valor Run para que no reaparezca en cada inicio de Windows. La prueba del
perfil obsoleto y las de ruta ausente/carpeta fallaron antes y pasan después;
Go focal y vet pasan. El chequeo es de existencia/ruta, no certifica que el
archivo sea un binario válido ni sustituye la prueba física del programa.

Al revisar la instancia única se detectó que una segunda apertura manual,
sin flag de perfil, se perdía si la primera instancia estaba minimizada.
La segunda invocación vuelve a mostrar el Hub existente; si llega mientras
se crea la ventana, la petición queda pendiente y se aplica una sola vez.
La regresión falló antes y pasó después con Go focal y vet.

El ratchet del HEAD `7cdbc9f4` encontró 10 duplicaciones CSS nuevas porque
las reglas añadidas al editor modificaban `orbit-launcher.css`, cuyo encabezado
histórico repite estilos de otras vistas. Las reglas nuevas viven ahora en
`orbit-launcher-policy.css` y el archivo histórico recupera exactamente el
contenido de la base. El mismo clasificador local de calidad devuelve
`NEW=0` y 42 reagrupaciones verificadas por igualdad de blobs; las 10 del
Launcher ya no son bloqueantes. Pasan 12 pruebas del editor, typecheck, build
y lint. El HEAD publicado `0428a24b` pasó el ratchet remoto (NEW=0), el gate
bloqueante completo (incluido build Wails Windows), la ruta de promoción y
GitGuardian. **NO-GO** hasta resolver las decisiones de producto y verificar
en Windows real el Hub, procesos, Steam/LMU y el instalador. Isaac pidió aviso
y confirmación antes de la revisión mediante computer use; sigue pendiente.

Decimotercer avance de #1368 (candidato en PR draft, 2026-09-25): Isaac decidió
que solo un perfil puede iniciar con Windows y que `retry: all` repite todos
los pasos desde el primero. El guardado desmarca los demás perfiles, sincroniza
los valores Run y restaura la configuración anterior si falla el registro;
al arrancar, los ajustes antiguos con varios perfiles marcados se reducen al
primero. `retry: all` repite la cadena completa, mientras el aviso ofrece
«Repetir todos los pasos» y «Repetir pasos fallidos» como acciones distintas.
La revisión en navegador Codex detectó que Orbit no ofrecía la política de
reintento en el editor avanzado; ya permite elegir `ask`/`failed`/`all` y
de 1 a 3 intentos adicionales, con traducciones es/en/pt/it. La prueba
falló antes del arreglo y pasa después. Los tests de regresión de perfil,
rollback, migración, política y botones, los dos paquetes Go completos,
typecheck y build frontend pasan localmente.
La revisión posterior al primer push encontró que guardar un perfil normal
volvía a sincronizar el Run de otro perfil ya marcado. La prueba reprodujo
el fallo y el guardado ahora solo registra el perfil seleccionado y desregistra
los que realmente pierden el inicio automático. Los dos paquetes Go vuelven
a pasar tras la corrección.
La cola de flags recibidos por la instancia única también comprueba el perfil
seleccionado tras migrar los ajustes: un segundo valor Run antiguo no abre
otra cadena. Se añadió la regresión de dos flags encolados en orden inverso.
Los IDs de perfiles ya borrados siguen llegando al manejador previo para
retirar su valor Run obsoleto; una regresión protege esa limpieza.
Si el registro impide migrar dos perfiles marcados, la cola limita igualmente
el lanzamiento al primero; el test reproduce ambos flags en orden inverso
con los ajustes legacy todavía intactos.
El HEAD de código `856b06eca8735cbc8179cbf045f272f8f3fe9acf` pasó el
gate bloqueante remoto completo (Go, frontend y build Wails Windows), el
ratchet, la ruta de promoción y GitGuardian. El handoff añade esta evidencia
en un commit documental posterior, cuyos checks deben verificarse por separado.
El commit documental `d817f55b24ad57a4012b352b80e1fec0444c2913` pasó
también todos los checks de PR: gate bloqueante, ratchet, ruta de promoción y
GitGuardian. Las cuatro suites locales del instalador Windows pasan: modelo
transaccional NSIS, tamaño mínimo del ejecutable, preflight de release y
empaquetado del runtime confiable. Usan fixtures; no se construyó ni instaló
un candidato real porque este worktree carece de `bin/vantare.exe` y del
runtime de release. El cambio documental que registra estas pruebas debe
verificar sus propios checks remotos antes de considerarlos vigentes.
La comprobación física de Wails/Steam/LMU/instalador sigue pendiente: Isaac
prohibió por ahora usar computer use en el escritorio, pero permite una
revisión del servidor en el navegador de Codex. **NO-GO** hasta tener esa
evidencia física. Sin merge, promoción ni release.

## Hub

Conservar estructura. Solo consistencia visual, estados reales, responsive,
accesibilidad y rendimiento. El selector superior abre módulos, apps, perfiles
y recientes.

## Issues y siguiente acción

- Overlay: revisar/rebasar PR #195, corregir ISA-311, congelar alcance el 14 de
  agosto y preparar RC0 Nightly para el 19 según el plan ISA-315. La promoción
  a Testers requiere issue y aprobación propias; no abrir otro reader LMU.
- Launcher: resolver los gates de #1368 antes de nuevas features o promoción.
- Hub: crear HUB-POLISH después de characterization visual.
- Checks: harness real, Playwright, transparencias, responsive, capturas,
  frontend test/build; no regenerar baselines para esconder fallos.

## Última actualización

2026-08-14, ISA-335 corrige en Nightly el rechazo al guardar perfiles con
`vantare-endurance`. La causa era un desfase entre el catálogo frontend ya
promovido y las allowlists Go de persistencia/diseños. La revisión adversarial
eliminó la lista duplicada: ambos consumidores consultan ahora el mismo contrato
tipado. La regresión cubre sistema activo/predeterminado, `systemMemories`,
round-trip en disco y diseños de usuario; los IDs desconocidos siguen fallando
cerrados. Go focal y global, frontend 370/2661 y build pasan. Base inicial
`origin/nightly@8de4f511`; rama
`vantareapp/isa-335-os-bug-guardar-perfiles-rechaza-vantare-endurance-como`.
Fix y regresiones: `074dba6`; centralización revisada: `a4749e9`;
`design-system:check` 3/3 PASS. Isaac autorizó la promoción y el auto-merge
necesario ante integraciones concurrentes; ISA-345 conserva el registro. La PR
#223 se integró por squash en
`nightly@32e9b70907458874d79fd28c5a37ae97cccc436d`. El gate post-integración
`31762153097` pasó ruta, build frontend, Go, frontend, lint de cambios, visuales
y Windows/Wails; el snapshot `31762153118` pasó. El lint global conserva deuda
heredada advisory. Sin promoción a Testers/Master ni release.

2026-08-10, ISA-315 fija el objetivo Stable en Testers para Overlay Studio V1
y la ventana comercial controlada de septiembre. Esta decisión y el estado
superior prevalecen sobre los bloques históricos de OS-09 que siguen debajo.

### ISA-347 — Delta real, único y controlable por hotkey

- Rama/worktree:
  `vantareapp/isa-347-delta-referencias-reales-de-telemetria-instancia-unica-y`
  en `C:\tmp\vantare-isa347\vantare-v2`, desde
  `origin/nightly@7e4eac63fdc3a81278f8815d28e33c8a1293db4a`.
- La telemetría Delta mantiene tres referencias independientes y fail-closed:
  personal observado desde LMU cuando existe, mejor válida de la sesión y
  vuelta anterior válida. Ninguna referencia ausente hereda otra bajo una
  etiqueta falsa.
- Cada layout admite un solo widget `delta`. Catálogo, comandos Studio y
  validadores TS/Go aplican el mismo contrato; los layouts de sesión explícitos
  son alternativos y nunca se renderizan simultáneamente. Los Delta extra de un
  perfil histórico pasan a `preservedWidgets` con su configuración completa,
  de modo que no se renderizan ni se pierden.
- Hotkey `cycleDeltaReference`, configurable en Ajustes y por defecto
  `Ctrl+Shift+D`: Personal → Sesión → Anterior → Personal. Usa el gestor global
  existente, guarda el perfil activo y vuelve a publicar el documento runtime.
  La migración de AppSettings v2→v3 añade el atajo sin sustituir combinaciones
  ya configuradas.
- Evidencia: `go test ./...` PASS; frontend 370 archivos/2673 tests PASS;
  build y ESLint focal PASS. Vitest conserva dos `AbortError` heredados de
  teardown después del resumen con exit 0.
- Estado real: implementación `3a54d34` y fix `46df1b2`, sincronizados con
  `nightly@638b470` mediante `f0e40bd`. Review adversarial: P0=0, P1=3
  corregidos, P2=0 y P3=0. `go test ./... -count=1`, frontend 370/2673, build,
  ESLint focal, vet focal sin deuda nueva y diff-check pasan. La PR #233 pasó
  los gates bloqueantes y se integró por squash en `nightly@5499008` el
  2026-08-14. Sigue pendiente la comprobación manual LMU/Wails; no hubo
  promoción a `testers`, `master` ni release.

### ISA-262 — usar el Workshop local

- Desde este worktree, instalar dependencias desde el lockfile si faltan y abrir
  `corepack pnpm --dir frontend dev`. La URL reproducible es
  `http://localhost:5173/workshop?widget=delta&system=vantare-crystal&design=delta-crystal-simple&state=ready&surface=studio&variant=default`.
- Los parámetros `widget`, `system`, `design`, `state`, `surface` y `variant`
  se validan fail-closed: una combinación inválida muestra un error y no escoge
  otro diseño. Cambiar los selectores reescribe la URL sin persistir nada.
- No usar esta ruta como preview de licencia, Wails, LMU o perfiles. Vite la
  elimina del build productivo: `main.tsx` no importa estáticamente authoring y
  el módulo sólo se carga con `import.meta.env.DEV`.
- El stage (`data-overlay-workshop-stage`) es chrome de autoría. Para alpha,
  bounds, overflow y paridad se inspecciona el root real
  (`data-overlay-workshop-widget-root`), que contiene el mismo Host/Viewport
  que producción. ISA-263 añade controles y comparativas, no debe duplicar el
  renderer.
- Evidencia ISA-262: Vitest focal 4 archivos / 15 pruebas, lint focal, build
  productivo sin sentinels Workshop, `design-system:check` y Playwright para
  Workshop válido/inválido y Hub sin `console`/`page errors`. La prueba de boot
  ejecuta el script real con `body` ausente, espera un solo listener de
  `DOMContentLoaded` y cubre Hub. Input Telemetry se siembra después del render
  en `useLayoutEffect`, con cleanup por widget; StrictMode preserva historias de
  otras instancias y no duplica la fixture. HMR CSS se aplicó y revirtió sin
  reiniciar el Workshop.

### ISA-263 — controles de autoría

- La URL dev admite además `session`, `location`, `background`, `scale`,
  `preset`, `width`, `height` y `compare`; todos se validan fail-closed y se
  serializan de forma reproducible. `background` solo cambia el stage de CSS:
  nunca entra en el Host, renderer, documento ni crop del widget.
- Los presets 720p, 1080p y 1440p declaran dimensiones de prueba; escala,
  dimensiones, fixture y comparación son efímeros. `Reset controls` restaura
  los defaults canónicos, no el deep-link inicial, sin persistir perfiles.
- Studio, Desktop, OBS y Harness usan la misma función de superficie y el mismo
  `WidgetVisualViewport` + `WidgetVisualHost`. OBS no recibe etiqueta ni chrome
  técnico dentro de su superficie. El root capturable sigue siendo
  `data-overlay-workshop-widget-root`; el stage sigue separado.
- Verificación de cierre ISA-263: Chrome/Playwright cubre deep-link válido e
  inválido, todos los fondos, Studio/Desktop/OBS/Harness, comparación,
  teclado/foco, reset, presets, dimensiones y viewports 1280x720, medio y
  compacto. El documento no produce overflow horizontal; el stage puede hacer
  scroll local para alojar una previsualización grande en compacto. Cero errores
  de consola, página o red relevantes.
- El bootstrap de `/workshop` evita ya cargar Wails: `main.tsx` carga el runtime
  normal dinámicamente desde `AppShell.tsx`. Esto evita la antigua petición
  fallida a `wails/custom.js`; no cambia el runtime normal. HMR CSS se aplicó y
  revirtió sin reiniciar la ruta.
- Las dimensiones y escala se editan como borradores locales: una pareja de
  dimensiones solo entra en URL/root cuando ambas son válidas; una escala
  válida entre 0.25 y 2 conserva valores como `0.3`. Ningún input incompleto o
  fuera de rango escribe una URL no reproducible.
- Evidencia focal final: 6 archivos/29 Vitest PASS, ESLint directo de bootstrap
  y authoring PASS, `design-system:check` PASS, build productivo PASS y
  compile-out sin sentinel `overlay-workshop`, `Overlay Workshop` o `DEV ONLY`
  en los assets. El lint global sigue registrando 30 errores/2 warnings
  heredados fuera del write set.

### ISA-265 — protocolo visual aislado

- Ejecutar `corepack pnpm --dir frontend visual:overlay-workshop -- --widget=delta --system=vantare-crystal --design=delta-crystal-simple --surface=all --viewport=1280x720`. Genera evidencia temporal para cuatro superficies y cuatro escenas sin baselines.
- Stage es chrome de autoría. El root validado es el renderer real: `[data-widget-renderer="<type>"]`, excepto Delta Bar Crystal `.vc-delta-bar`; no usar `data-overlay-workshop-widget-root` como crop.
- Se validan cardinalidad, font readiness, console/page errors, bounds, client/scroll, overflow declarado, alpha, guard y provenance. `root.png` es captura transparente del renderer contractual: su SHA-256 debe coincidir entre las cuatro escenas de cada superficie; si difiere, todos los escenarios de esa superficie quedan `sceneContaminated=true` y fallan. El reporte exige SHA Git real y registra `dirty`; los artefactos están bajo `frontend/.tmp/overlay-workshop-visual-protocol/` y no se versionan.
- Única protrusión: `delta-crystal-simple`, Y ≤13px por su badge compacto; todo exceso adicional falla. El runner imprime progreso, escribe checkpoint y cierra navegador/Vite en `finally`.
- El decode PNG canónico por CDP tiene un coste total aproximado de 5–8 min para la suite 4×4; no se alteran timeouts, helper Crystal, baselines ni umbrales para acortarlo.
- Crystal report-only es un gate independiente: la ejecución limitada a 90s llegó a 7 diseños PASS sin terminar el manifiesto. Nunca tratarla como aprobación total ni tocar baselines; resolver duración en otra issue.

### ISA-291 — autoría directa planificada y aprobada

- Rama: `vantareapp/isa-291-os-09g2-autoria-directa-sobre-codigo-productivo`.
  Worktree: `C:\Users\isaac\.codex\worktrees\isa291-direct-authoring\vantare-v2`.
  Base exacta: ISA-265 `54088b2e5ad25d9a897cb89187ee9684b75c645f`.
- Decisión: editar el TSX/CSS productivo y observarlo por HMR en el mismo
  `WidgetVisualHost`. HTML es referencia visual, no fuente ni compilador. Se
  descartan DSL, scaffolder obligatorio, catálogo paralelo, generated barrel,
  `catalogPosition`, `import.meta.glob` y migración de los 41 diseños.
- Autoridades: spec
  `docs/superpowers/specs/2026-08-05-overlay-workshop-direct-code-authoring-design.md`
  y plan `docs/superpowers/plans/2026-08-05-overlay-workshop-direct-code-authoring.md`.
- Commits documentales: `41a3f02` (spec), `426f7c6` (plan), `2864846`,
  `57cf199` y `2b18e02` (endurecimiento adversarial).
- Revisión adversarial final: GO. El plan protege drift concurrente, cancelación,
  recovery, HMR sin reload, arranque parcial y cierre de procesos/puerto. El
  revisor no editó archivos ni Linear y no delegó.
- Estado real: planificación cerrada; implementación no iniciada; ningún cambio
  productivo, push, PR o promoción de canal derivado de ISA-291.
- Para continuar en otro chat: leer AGENTS, `docs/agent-workflow.md`, la spec y
  el plan; verificar rama/worktree limpios; comenzar por Task 0. El root
  orquestador asigna cortes, pero cada worker ejecuta inline sin subagentes.

#### Paquete activo de delegación entre chats

Este bloque es la autoridad operativa mientras ISA-291 esté en ejecución. Un
chat nuevo no necesita el historial de Codex si sigue este orden:

1. Abrir `C:\Users\isaac\.codex\worktrees\isa291-direct-authoring\vantare-v2`.
2. Leer `AGENTS.md`, `docs/agent-workflow.md`, la spec ISA-291 y el plan ISA-291.
3. Verificar rama `vantareapp/isa-291-os-09g2-autoria-directa-sobre-codigo-productivo`,
   `git status --short` vacío y que `HEAD` contiene `366308e`.
4. Consultar el ledger inferior y ejecutar únicamente la primera Task pendiente.
5. Actualizar este ledger después de cada worker/review/commit, antes de lanzar
   el siguiente corte.
6. Reflejar el mismo estado en Linear ISA-291. No promover a `nightly`.

Reglas de delegación:

- Solo el orquestador raíz crea workers.
- Un worker recibe una Task o microcorte acotado y tiene prohibido delegar,
  lanzar subagentes, cambiar arquitectura o ampliar archivos.
- El worker debe parar ante cambios ajenos, dependencia nueva, test no entendido,
  contradicción documental o imposibilidad de verificar.
- El orquestador revisa diff, tests, alcance y commit antes de continuar.
- La revisión adversarial final debe ser read-only y ejecutada por un agente
  distinto del implementador, también sin subagentes.

Formato obligatorio del encargo a un worker:

```text
Ejecuta exclusivamente Task <N> del plan ISA-291 en el worktree y rama canónicos.
Lee AGENTS, agent-workflow, spec y plan completos. No lances ni delegues a otros
agentes. Conserva el write set exacto, aplica TDD y comandos del plan, haz staging
por rutas y crea solo el commit indicado. Si aparece una stop condition, detente.
Entrega: rama/HEAD, archivos, tests/checks, omisiones, riesgos, commit y status.
No push, PR, Linear ni promoción de canal salvo instrucción del orquestador.
```

Ledger de ejecución vivo:

| Task | Contenido | Estado | Commit/evidencia | Próxima condición |
|---|---|---|---|---|
| 0 | Preflight reproducible | Completada | Node 24.14.1; pnpm 9.1.0; lock blob `8ecdce49`; sin commit de producto | Task 1 |
| 1 | Guard complementario del Host | Completada | `f9c6617`; Vitest focal 3/3 PASS; revisión de diff sin hallazgos | Task 2 |
| 2 | Invariantes del catálogo | Completada | `c0fff0d`; catálogo 11/11 y contratos acumulados 14/14 PASS | Task 3 |
| 3 | Mutaciones reversibles | Completada | `d2555a4`; Node 8/8 PASS; revisión raíz sin hallazgos | Task 4 |
| 4 | Smoke HMR real | Completada | `1a7bf80` + `a5ed874`; Node 15/15 PASS; smoke ejecutado sobre HEAD limpio | Task 5 |
| 4b | Correcciones P3 de revisión | Completada | `339e81a`; mensaje de guard, carve-out muerto y fragilidad del ancla documentada | Task 5 |
| 5 | Guía de autoría | Completada | `ca978d0`; guía con 4 recetas y contrato OS-09 corregido | Task 6 |
| 6 | Gates acumulativos | Completada (parcial) | suite 2181/2181, lint focal, `design-system:check`, build y compile-out PASS; smoke y protocolo visual omitidos por decisión de Isaac | Task 7 |
| 7 | Handoff y cierre | Completada | docs cerrados | Revisión manual de Isaac |
| 8 | Promoción a nightly | En revisión | Isaac validó al 100 % el 2026-08-05; rama de integración `os-09-n01` con merge `10be06d`; gates combinados 2217/2217, build y compile-out PASS | Merge del PR por Isaac |

Estado actual: implementación autorizada por Isaac el 2026-08-05. Task 0 pasó:
se instalaron dependencias ignoradas con `--frozen-lockfile`, el lockfile real de
la raíz Git conservó el blob `8ecdce49a78adc664e4796f388889fbd41a67c08` y
Vitest 4.1.9, Vite 8.0.16 y Playwright 1.60.0 están disponibles. Task 1 añadió
Workshop al guard de consumidores de `WidgetVisualHost`; la revisión raíz
repitió la caracterización focal con 3/3 PASS y confirmó un diff de un solo
archivo, sin renderer ni excepción paralelos. Task 2 extendió los invariantes a
todos los diseños y parejas realmente registrados: IDs únicos y exactamente un
default por pareja, sin tocar `official-designs.ts`. El test de catálogo pasó
11/11 y ambos contratos juntos 14/14. Task 3 añadió helpers reversibles con
restauración byte a byte, preservación de drift externo, evidencia de recovery,
guard de worktree y cleanup bajo cancelación; la revisión raíz repitió 8/8
tests y confirmó un commit de exactamente dos scripts. Próxima acción exacta:
Task 4.

## ISA-291 — autoría directa (cierre técnico)

1. **Decisión aprobada.** Overlay Workshop es un bucle de autoría sobre el TSX/CSS
   productivo. No hay conversión Workshop→app, catálogo paralelo, DSL ni
   scaffolder obligatorio. Autoridades:
   `docs/superpowers/specs/2026-08-05-overlay-workshop-direct-code-authoring-design.md`
   (spec), `docs/superpowers/plans/2026-08-05-overlay-workshop-direct-code-authoring.md`
   (plan) y `docs/overlays-studio/overlay-workshop-authoring-guide.md` (guía operativa).
2. **Rama y base.** `vantareapp/isa-291-os-09g2-autoria-directa-sobre-codigo-productivo`,
   base ISA-265 en `54088b2e5ad25d9a897cb89187ee9684b75c645f`, worktree
   `C:\Users\isaac\.codex\worktrees\isa291-direct-authoring\vantare-v2`. Commits de
   implementación: `f9c6617`, `c0fff0d`, `d2555a4`, `1a7bf80`, `a5ed874`, `339e81a`,
   `ca978d0`, más los commits documentales de cada corte.
3. **Arquitectura conservada.** `WidgetVisualHost` → `designSystemRegistry` /
   manifest → renderer productivo. Workshop es el cuarto consumidor del host,
   junto a Studio canvas, runtime y ProfilePreview. Ningún renderer nuevo, host
   alternativo ni segundo catálogo.
4. **Cómo abrir el bucle.** `corepack pnpm --dir frontend dev` y abrir
   `http://localhost:5173/workshop?widget=delta&system=vantare-original&design=delta-original-base&state=ready&surface=studio&variant=default&session=race&location=track&background=grid&scale=1&preset=1080p`.
   El smoke reversible es `corepack pnpm --dir frontend smoke:overlay-workshop-hmr`
   y sus tests unitarios `corepack pnpm --dir frontend test:overlay-workshop-hmr`.
5. **Qué demostró cada gate.** El guard de caracterización bloquea que Workshop
   importe un renderer concreto o esquive el host, nombrando el archivo ofensor.
   Los invariantes de catálogo garantizan IDs únicos y exactamente un default por
   pareja widget/sistema registrada, sin tocar `official-designs.ts`. El smoke
   demuestra que un cambio de TSX y otro de CSS se aplican por HMR sin navegación
   ni reload, y que los bytes se restauran exactamente.
6. **Riesgos restantes.** (a) `TSX_ANCHOR` del smoke depende de dos líneas
   literales de `DeltaOriginal.tsx`; un reformateo lo rompe, aunque falla en seco
   y está documentado en la guía. (b) El smoke exige todo el subárbol `vantare-v2`
   limpio, no solo los dos archivos objetivo. (c) La suite completa emite un
   `AbortError` de teardown de happy-dom que no falla ningún test; es deuda
   heredada, ajena a este corte. (d) Ver el punto 6b: cuestión abierta sobre el
   assert de "sin reload" del smoke.

6b. **Cuestión abierta — el CSS recarga, no hace hot-update.** Verificación manual
   del 2026-08-05 sobre este worktree, con Vite en `localhost:5173` y Delta
   Original en `/workshop`: editar `vantare-original/tokens.css` **sí** aplica el
   cambio al instante sin reiniciar Vite (fondo `rgb(16,16,20)` → `rgb(120,0,180)`,
   y restauración byte a byte verificada por SHA-256), pero lo hace mediante una
   **recarga completa de documento**, no mediante hot-update de CSS. Evidencia: un
   centinela en `window` se perdió en las tres ediciones (un control sin editar
   nada demostró que el contexto persiste normalmente) y la consola registró
   cuatro ciclos `[vite] connecting… connected` sin ningún `[vite] css hot updated`.
   Causa probable: `tokens.css` entra por `@import` desde `src/index.css` y pasa
   por Tailwind v4, que regenera el grafo CSS completo.

   Esto **no invalida el bucle de autoría**, que es la propiedad que interesa: el
   cambio se ve sin reiniciar el servidor. Pero entra en conflicto aparente con
   `assertNoReload` del smoke, que muta ese mismo archivo y afirma verificar la
   ausencia de recarga. El smoke **no se ejecutó** en esta verificación y sus
   condiciones difieren (Chromium propio de Playwright, y el TSX mutado en vuelo
   durante la fase CSS). Acción pendiente para quien retome ISA-280: ejecutar
   `smoke:overlay-workshop-hmr` y resolver la discrepancia. Si el assert resulta
   ser demasiado estricto para este grafo CSS, relajarlo a "el cambio se aplica sin
   reiniciar el servidor" en lugar de debilitar la evidencia.
7. **Fuera de alcance de ISA-291.** Migración de los 41 diseños, canvas
   drag/resize, perfiles, persistencia, lectores LMU, Billing, Wails/SSE y
   baselines visuales. No se cambió ningún píxel ni ningún archivo de producto.
8. **Próxima acción exacta para un chat nuevo.** Isaac completó la verificación
   manual el 2026-08-05, validó ISA-291 al 100 % y autorizó la promoción. El
   trabajo vive ahora en la rama de integración
   `vantareapp/os-09-n01-promocion-overlay-workshop-a-nightly` (creada desde
   `origin/nightly` `fb2c355`, merge `--no-ff` en `10be06d`, sin conflictos), con
   PR abierto hacia `nightly` y **pendiente de que Isaac dé el merge**. Esa
   promoción mueve el Overlay Workshop completo: ISA-260–265 (la herramienta) más
   ISA-291 (sus barandillas y manual); los commits están apilados y no se pueden
   separar. Impacto para usuarios y testers: ninguno, el Workshop está excluido de
   Stable y el compile-out lo confirma. Tras el merge: ISA-280 (OS-09L, gate
   técnico final) y resolver la cuestión abierta del punto 6b.

## ISA-326 / OS-11 — superficie arbitraria y paridad Studio/Desktop/OBS

- **Estado al 2026-08-12:** implementación de Tasks 0–4 completada y revisada;
  gates acumulados de Task 5 ejecutados. Queda la aceptación manual de Isaac en
  hardware Windows multimonitor antes de cualquier promoción.
- **Rama/worktree:**
  `vantareapp/isa-326-os-11-superficie-arbitraria-y-paridad-de-resolucion` en
  `C:\tmp\vantare-isa326\vantare-v2`, desde
  `origin/nightly@8880a8800e07e2af21fe5ff37a714578bf8fcd00`.
- **Hallazgo raíz:** el selector actual solo altera el zoom calculado. Documento,
  validación, drag/resize, Desktop y OBS siguen ligados a 1920×1080 y mantienen
  fórmulas/orígenes distintos.
- **Decisión vigente:** `layoutViewport {width,height}` opcional y
  retrocompatible en V3; ausencia = 1920×1080. Unidades CSS/DIP. Transformación
  pura `contain` compartida, centrada y sin deformación. Cualquier resolución es
  válida; los presets solo son atajos.
- **Política entre proporciones:** sin reflow implícito. Si documento y salida no
  coinciden, se preserva la proporción con bandas transparentes. Un contrato de
  anclajes/reflow requerirá alcance separado.
- **Frontera preservada:** `WidgetVisualHost` y los renderizadores visuales no se
  modifican. El canvas conserva preview imperativa durante drag/resize.
- **Monitor:** Wails ya aporta `Screens.GetAll` y `Screen.GetByIndex`. Studio
  persiste índice y `layoutViewport` de forma atómica usando `Bounds` CSS/DIP;
  Desktop crea y lleva a fullscreen la ventana sobre esa pantalla exacta. No se
  usa el viewport del Hub, `WorkArea` ni una multiplicación por DPI.
- **Autoridades:** `docs/adr/0092-overlay-arbitrary-layout-viewport.md` y
  `docs/superpowers/plans/2026-08-11-overlay-arbitrary-viewport-parity.md`.

Ledger vivo:

| Task | Contenido | Estado | Evidencia | Próxima condición |
|---|---|---|---|---|
| 0 | ADR, microplan y expediente | Completada | Commit documental; diff check limpio | Task 1 |
| 1 | Contrato TS/Go + transformación pura | Completada | `5a98553` + `a9c2fc8`; TS 67/67, Go pkg y completo PASS; doble review PASS | Task 2 |
| 2 | Superficie editable en Studio | Completada | 2A `b873a82`/`7b24f09`; 2B `8249585`/`50e9b9e`/`5fc3809`; 2C `edf3359`/`13fe677`/`1aa1ec7`; dobles reviews PASS | Task 3 |
| 3 | Paridad Desktop/OBS | Completada | 3A `ecda9ee`/`c8f00e5`; 3B `b4a5c94`/`fb5b5ae`; dobles reviews PASS | Task 4 |
| 4 | Hub fluido + frontera monitor nativo | Completada | `0aa50aa`, `3f819d4`, `30c5292`, `0421e55`, `452b4ce` y correcciones hasta `4703a48`; reviews finales Ready/PASS | Aceptación manual física |
| 5 | Gates, evidencia y cierre | Completada técnicamente | Go completo PASS; frontend 2567/2567; build y diff-check PASS; lint con deuda heredada documentada | Isaac prueba Windows multimonitor y decide promoción |

Evidencia Task 1:

- `layoutViewport` es opcional en storage V3; ausencia conserva 1920×1080 y
  `null` se rechaza igual en TS y Go.
- Límites compartidos: 32..16384 CSS/DIP. Recoverability usa la superficie
  resuelta; no modifica coordenadas legacy.
- Transformación pura `contain` con offsets centrados y mapeo forward/inverse;
  inputs inválidos fallan explícitamente en vez de producir `NaN`/infinito.
- Checks del worker: frontend focal 67/67, frontend completo 2480/2480,
  `go test ./pkg/config`, `go test ./...`, build, lint focal y diff-check PASS.
  El root repitió focal 67/67, Go pkg y diff-check con PASS.
- Review de especificación: PASS. Review de calidad tras correcciones: Ready to
  proceed, cero Critical/Important. Minor aceptado para evidencia acumulada:
  falta test del máximo exacto 16384; la comparación inclusiva fue inspeccionada.
- Ruido heredado: dos `AbortError` de teardown de happy-dom tras la suite, con
  exit 0 y todos los tests PASS.

Evidencia microcorte 2A:

- `document/layout-viewport` persiste el tamaño explícito sin mutar documento,
  comando ni metadata. El parser canónico valida siempre esta edición, también
  en producción.
- Una superficie inválida o que deje widgets irrecuperables falla de forma
  atómica con `StudioCommandError`; Store conserva el historial y publica el
  mensaje. Errores inesperados de permisos o commit se relanzan.
- Dirty, undo, redo y save están cubiertos; acceso lo trata como mutación layout
  documental sobre layouts persistidos.
- Commits: `b873a82` y corrección de spec `7b24f09`. Root repitió focal 66/66.
  Build PASS. Spec review PASS y quality review Ready, cero Critical/Important.
- Minors aceptados: los tests no hacen observable la deduplicación interna de
  permisos (layout hoy es incondicional) ni fuerzan un error inesperado desde
  `commitStudioCommand`; la implementación de ambos caminos fue inspeccionada.
- Task 2 se divide en 2A estado, 2B geometría pura y 2C canvas/controles para
  mantener write sets acotados y review entre cortes.

Evidencia microcorte 2B:

- Fit, clamp, snap, safe area, center, move y resize consumen `LayoutViewport`.
  Los aliases 1920×1080 quedan deprecados y solo como fallback transitorio de
  callers que 2C debe eliminar.
- Matriz TDD: 1280×720, 3440×1440, 5120×1440, 1000×1000 y bordes custom 1006px
  no alineados a la rejilla.
- Review detectó dos regresiones de borde antes de 2C: snap posterior al clamp
  podía perder recoverability en move y las guides de resize podían quedar en
  la posición previa al clamp. Corregidas en `50e9b9e` y `5fc3809` con cobertura
  X/Y y guías perpendiculares.
- `MINIMUM_VISIBLE` deriva ahora de la autoridad core. Preview drag/resize sigue
  imperativa y solo hace commit al terminar.
- Evidencia final: focal 73/73, build, lint focal y diff-check PASS. Spec review
  PASS y quality review Ready, sin Critical/Important/Minor nuevos.

Evidencia microcorte 2C:

- `StudioPreviewState` ya no contiene una resolución ficticia. El documento
  gobierna dimensiones, fit, área segura, interacción y todas las rutas visibles
  de centrado; los perfiles legacy conservan el fallback 1920×1080.
- Presets planos y dimensiones custom 32..16384 persisten mediante
  `document/layout-viewport`. La escena muestra límites propios sobre un stage
  neutral; el fondo seleccionado pertenece a la escena y el panel es responsive.
- Dos reviews detectaron estados engañosos del selector ante un preset rechazado
  y ante volver al preset vigente desde un draft custom. Se corrigieron en
  `13fe677` y `1aa1ec7`; selector, drafts, cabecera, escena y documento quedan
  sincronizados sin hacer optimista un cambio que recoverability pueda rechazar.
- Evidencia final independiente: focal 9 archivos 55/55, regresiones de geometría
  y preview imperativa 67/67, build y diff-check PASS. Spec review PASS y quality
  review Ready, cero Critical/Important. Lint conserva únicamente 4 errores y 1
  warning heredados en líneas anteriores a ISA-326.
- Observación aceptada: elegir explícitamente 1920×1080 en un perfil legacy puede
  materializar `layoutViewport` y marcar dirty; es coherente con persistir la
  superficie seleccionada según ADR 0092.

Ejecución Task 3:

- **3A — superficie runtime compartida:** medir la salida CSS, aplicar una sola
  transformación `contain` a la escena lógica y demostrar paridad Desktop/OBS,
  offsets centrados, legacy y `layoutOrigin` lógico.
- **3B — preview y app OBS:** hacer que la preview reciba la superficie
  documental y eliminar sus imports de constantes Studio, sin doble escala.
- Los microcortes son secuenciales y cada uno exige spec review y quality review
  antes de avanzar; sus write sets no se solapan.

Evidencia microcorte 3A:

- `RuntimeOverlaySurface` mide la caja CSS no transformada y aplica una única
  transformación `contain` a una escena lógica. Desktop y OBS comparten la misma
  implementación; frames y `layoutOrigin` permanecen en espacio lógico.
- La escena espera una medida positiva, soporta resize fraccional, legacy
  1920×1080, offsets X/Y y limpia observer/listener. Los subtítulos viven dentro
  de la misma escena; ningún renderer ni `RuntimeWidgetFrame` fue modificado.
- Spec review detectó dos Important antes de 3B: `getBoundingClientRect` podía
  medir un ancestro ya escalado y causar doble escala, y `overflow: visible`
  permitía que widgets parciales contaminaran bandas transparentes. Corregidos
  en `c8f00e5` usando `contentBoxSize/contentRect` o fallback `clientWidth/Height`,
  y clipping en el límite documental.
- Evidencia final: focal raíz 5 archivos 39/39, build, ESLint focal y diff-check
  PASS. Spec review PASS y quality review Ready, cero Critical/Important.
- Gate 3B: la API OBS todavía entrega `layoutOrigin` shrink-wrap mientras Desktop
  usa cero. 3B debe normalizar esa diferencia y demostrar paridad end-to-end;
  no basta con la paridad del componente bajo inputs iguales.

Evidencia microcorte 3B:

- La preview OBS recibe el `layoutViewport` documental, elimina toda dependencia
  de constantes Studio y usa el transform `contain` core sobre una caja CSS no
  transformada. Espera la primera medida válida, soporta dimensiones
  fraccionales y limpia `ResizeObserver` o el fallback de `window.resize`.
- En preview, la escena exterior aplica una sola escala y el runtime interior
  mide la superficie lógica con `scale=1`. En streaming, el runtime mide la
  salida real. Un documento 1000x1000 sobre 1600x900 conserva escala 0,9,
  offset X 350 y coordenadas documentales `x=123`, `y=87`.
- `ObsOverlayApp` ignora el `layoutOrigin` shrink-wrap legado del endpoint; OBS
  deja de desplazar widgets respecto a Desktop. El fondo y la cuadrícula quedan
  dentro de la escena y las bandas exteriores permanecen neutrales.
- Spec review detectó que el recordatorio de calendario también se escalaba en
  preview. Se corrigió en `fb5b5ae`: solo el runtime entra en la escena
  documental y el banner permanece como capa de salida, con cierre intacto.
- Evidencia final independiente: focal 8 archivos 64/64, suite frontend
  2543/2543, build, ESLint focal y diff-check PASS. Spec review PASS y quality
  review Ready, cero Critical/Important. Ruido heredado: dos `AbortError` de
  teardown con exit 0 y warnings de `.eslintignore`/chunk. Smoke visual real
  pendiente para Task 5.

Evidencia Task 4 y cierre acumulado:

- El workspace Profiles/Studio usa todo el ancho disponible sin quitar el cap de
  1920 px a las demás secciones. Focal 21/21, suite completa 2545/2545, build y
  review PASS (`0aa50aa`).
- El cliente nativo enumera pantallas en CSS/DIP, tolera nombres vacíos y valida
  índice seguro. El comando `document/monitor` hace monitor+superficie en un solo
  paso de dirty/undo/redo; la UI conserva custom si Wails no está disponible.
  Commits `3f819d4`, `30c5292` y `0421e55`; reviews Ready sin Critical/Important.
- Desktop resuelve la pantalla exacta, usa sus `Bounds` para la colocación inicial
  y después fullscreen. Los cierres tardíos de una ventana reemplazada no pueden
  cerrar ni desincronizar la nueva; la identidad no comparable falla sin panic y
  los side effects quedan serializados. Commits desde `452b4ce` hasta
  `4703a48`; spec PASS y quality Ready, cero Critical/Important.
- Gates acumulados sobre `4703a48`: `go test ./...` PASS; frontend 360 archivos,
  2567/2567 PASS; build y `git diff --check origin/nightly...HEAD` PASS. ESLint
  directo sobre los 53 TS/TSX tocados queda rojo con 6 errores y 1 warning en
  líneas heredadas; el global conserva 36 errores y 2 warnings. Las comparaciones
  contra el baseline hechas por microcorte no encontraron violaciones nuevas.
  La suite conserva dos `AbortError` de teardown de happy-dom tras el resumen,
  con exit 0.
- Inspección T3 del harness Studio: superficies 3440×1440 y custom 1000×1000;
  viewports 1440×900, 1024×768 y 800×700 sin scroll horizontal del documento y
  con escala uniforme. El navegador no dispone del runtime Wails ni de un perfil
  servido por el backend, por lo que no sustituye la prueba física Desktop/OBS.
- Riesgos aceptados: `monitorIndex` es posicional y la enumeración solo se
  refresca al abrir Studio; hot-plug durante la sesión requiere reabrirlo. La
  prueba manual Windows con dos monitores/DPI mixto queda pendiente para
  Nightly; Isaac excluyó OBS como gate de este corte.
- Smoke Wails posterior al cierre: build y arranque nativo PASS; Hub 1280×800,
  WebView2 y `/health` operativos. El host solo tiene `DISPLAY1` 1920×1080 y el
  Studio real requiere login/configuración Supabase ausente en este worktree, así
  que multimonitor/DPI mixto continúa siendo gate humano.
- El smoke HTTP con un perfil V3 custom 1000×1000 confirmó que
  `/api/profile-v3` conserva `layoutViewport`, pero `/overlay` quedó vacío: la
  CSP preexistente permite inline y bloquea los módulos/estilos propios de Vite.
  ISA-329 (`OBS · CSP local bloquea los assets propios y deja /overlay vacío`)
  queda como bug High abierto y limitación conocida; por decisión explícita de
  Isaac no bloquea esta Nightly. No se amplió silenciosamente el write set de
  ISA-326 para tocar seguridad/servidor.
- Promoción completada el 2026-08-12: ISA-330 creó una rama de integración desde
  `origin/nightly@5069cbb`, fusionó la rama ISA-326 (`7600206`) mediante
  `--no-ff` en `d0789e5`, incorporó después el PR #207 desde
  `origin/nightly@cc54d36` en `e45bcf9` y preparó `v0.1.0.7-nightly.7`. El PR
  #208 pasó CI y se fusionó por squash en `nightly@234794d`. `testers` y
  `master` quedaron fuera del corte.
- Gates locales combinados finales de ISA-330 sobre `cc54d36`: Go completo PASS;
  frontend 367 archivos/2636 tests PASS; build PASS; diseño 3/3; visual Studio PASS con widgets,
  paridad, interacción y los tres viewports responsive a 0.000 %. Los tres
  baselines de Studio se actualizaron después de inspeccionar que el cambio era
  el `contain` aprobado y no una pérdida de paneles o controles. Lint global
  sigue rojo por deuda previa, pero pasa de 47 errores/2 warnings en
  `cc54d36` a 44/2 en la integración; no añade deuda.
- Release publicada: el workflow oficial `Release build` run `31633854889`
  terminó PASS en el rerun final sin cambios de código y publicó
  `v0.1.0.7-nightly.7` sobre `234794d`. La pre-release no es draft, contiene
  los seis assets oficiales y la descarga independiente confirmó los SHA-256
  del instalador, portable y ejecutable. Los dos intentos anteriores fallaron
  antes de publicar por descarga transitoria de Electron y por el soak Windows
  intermitente ya inventariado. ISA-329 sigue abierta como limitación OBS
  aceptada expresamente para este corte; no se afirma paridad OBS.

## ISA-369 / HUD-ORBIT-01 — fundamentos Command Orbit v0.3 (2026-08-17)

- Alcance aislado del briefing `docs/design/orbit-v03/15-briefings/00-fundamentos.md`.
  No toca páginas, shell, kit completo ni algoritmos de dominio.
- Rama
  `vantareapp/isa-369-hud-orbit-01-fundamentos-orbit-tema-tokens-sprite-de-iconos`,
  worktree `C:\tmp\vantare-isa369`, base real `origin/nightly@7a92241d` y
  commit funcional `cd34753a`. `e6a8a994` está contenido en la base.
- `VantareTheme` reconoce `vantare-orbit`; sus extensiones son opcionales y
  emiten defaults Orbit para mantener compatibles `vantare-v5` y
  `vantare-lite`. El runtime resuelve el tema almacenado sin convertirlo aún
  en tema predeterminado.
- `orbit.tokens.css` coincide línea por línea con la copia canónica y expone
  utilidades Tailwind 4. Inter variable y Cascadia Code se empaquetan en
  `frontend/src`; el harness comprueba que no hay requests a Google Fonts.
- El sprite contiene los 14 símbolos del prototipo y `ui/orbit/Icon` conserva
  tamaño/trazo configurables. La densidad usa la clave
  `vantare.v03orbit.density` y aplica `body.dataset.density` con fallback
  `balanced` tolerante a fallos de storage.
- Evidencia fresca: focal 3 archivos/14 tests PASS; suite frontend 390
  archivos/2869 tests PASS; build PASS; ESLint focal PASS;
  `visual:orbit-foundations` PASS. Capturas balanced/compact 1920×1080 en
  `docs/design/orbit-v03/evidence/porte/00-fundamentos/`, inspeccionadas sin
  iconos ausentes, recortes ni fallos tipográficos.
- Lint global: 46 errores/2 warnings tanto en esta rama como en un worktree
  temporal limpio de `origin/nightly@7a92241d`; la deuda es heredada y no se
  corrigió fuera de alcance.
- Review propio en cinco ejes: Approve, sin Critical/Required pendientes. PR
  draft #279 abierto a `nightly`; `01-shell` permanece bloqueado hasta la
  aceptación de este briefing.

## ISA-838 — cambio de sección de Studio sin remontaje (2026-08-25)

- Rama `vantareapp/isa-838-studio-tab-fluidity`, worktree
  `C:\tmp\vantare-isa838`, base limpia
  `origin/nightly@8a90c3a7837166ffec6943c839f7cb31cbf11b31`. ISA-770 no era
  autoridad para este bug de rendimiento; se abrió ISA-838 y se añadió al
  Project Vantare en `In Progress` antes de editar.
- Había dos desmontajes productivos: `StudioRouteEditor` sustituía
  `OverlayStudioV3` al entrar en Perfiles/Recomendados/Comunidad/OBS y
  `OrbitShell` eliminaba `StudioRoute` al entrar en Launcher u otra sección.
- La ruta interna conserva el editor y lo vuelve inerte mientras pinta la vista
  secundaria. La shell monta Studio de forma perezosa en la primera visita y
  conserva después la misma instancia; la ruta memoizada no vuelve a renderizar
  por un cambio ajeno de sección.
- El keep-alive oculta globalmente con `display:none`, `aria-hidden` e `inert`.
  Un gate de actividad estable desconecta los suscriptores visuales del
  coordinador sin remontar React ni reiniciar el transporte live; al volver se
  reconectan al último snapshot. Los `WidgetVisualHost` y el renderer productivo
  siguen siendo únicos.
- Regresiones: misma identidad DOM interna y global, lazy mount, inercia,
  suspensión/reanudación de suscripciones y transporte live single-start.
  Suite frontend completa: 386 archivos y 2958/2958 tests PASS. Typecheck PASS,
  build frontend PASS y build Wails production con el `.env.local` autorizado
  embebido PASS. ESLint focal PASS; el global conserva el error heredado
  `_damage` no usado en `car-damage-numbers-view-model-v2.ts`.
- A/B Wails sobre la misma base, tres tandas de 20 idas y vueltas
  Studio↔Launcher por build: mediana de CPU del renderer 41,41 ms/roundtrip en
  baseline y 33,59 ms/roundtrip en ISA-838 (-18,9 %). El tag production desactiva
  CDP por contrato, por lo que no se presenta esta medida como traza
  click-to-paint ni como garantía absoluta de ausencia de hitch.
- Smoke Wails real PASS: sesión resuelta, Hub, Studio y Launcher visibles; cuatro
  capturas A/B en
  `C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2\fotos\isa-838-{baseline,final}-{studio,launcher}.png`.
- Entrega funcional `b87fe14e`, rama publicada y PR draft #851 abierto hacia
  `nightly`; issue, label y Project Vantare en `In Review`. Sin merge,
  promoción, release ni cambio del roadmap público.
- Riesgo residual aceptado: tras la primera visita, Studio retiene su documento
  y DOM en memoria para que las vueltas sean instantáneas. La primera apertura
  sigue pagando el montaje inicial; las afirmaciones de fluidez se limitan a
  cambios posteriores entre secciones ya visitadas.

### Extensión ISA-838 — feedback inmediato del rail (2026-08-26)

- Un probe Wails posterior separó el primer cambio del contenido del feedback
  del rail: en 20 alternancias Studio↔Launcher el contenido empezaba a cambiar
  con mediana de 1,40–1,43 ms, mientras el marcador activo aparecía con mediana
  de 34,20–34,47 ms en ambos sentidos sobre un monitor de 60 Hz. La simetría
  descarta la reactivación de Studio como causa dominante de esa sensación.
- El rail esperaba a `onClick` y después interpolaba de forma genérica todas las
  propiedades durante `--orbit-fast` (130 ms). Ahora acusa la pulsación nativa
  de inmediato, deja el fondo fuera de la interpolación y limita color,
  `box-shadow` y retorno de escala a 60–80 ms. No añade estado React optimista
  ni altera la fuente de verdad de navegación.
- Se añadió un contrato focal que protege el feedback de presión y evita
  reintroducir la transición genérica. Gates frescos: focal 17/17 PASS, suite
  completa 387 archivos y 2960/2960 tests PASS, typecheck PASS, lint focal PASS,
  build frontend PASS y build Wails production con el `.env.local` autorizado
  embebido PASS. El lint global conserva exclusivamente el error heredado
  `_damage` no usado en `car-damage-numbers-view-model-v2.ts`.
- Smoke Wails real aceptado por Isaac: el sidebar funciona «mucho mejor».
  Captura posterior en
  `C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2\fotos\isa-838-sidebar-feedback-after.png`.
  La imagen es evidencia local y no se versiona.

## ISA-893 — checkpoint de autoridad Overlay V2 (2026-08-28)

- Rama `vantareapp/isa-893-overlay-v2-autoridad-completa`, worktree
  `C:\tmp\vantare-isa893\vantare-v2`, base exacta
  `origin/nightly@f2e73d3aec1cadb47586cdea07fdbc54effea58f`.
- Hitos 1–6 publicados: inventario 20/20; contexto runtime puro derivado de
  V2; selección V2-first en el único `WidgetVisualHost`; fallos
  inválido/ausente/error terminales y stale visible; rollback total solo en
  memoria; gate cerrado catálogo 20 = políticas 20 y builders V2 no externos
  18.
- `engineer-radio` consume exclusivamente `engineerPresentation` y
  `race-schedule` recibe `raceScheduleEvents` desde Calendar. Ninguno convierte
  su fuente auxiliar en telemetría V2.
- Evidencia focal acumulada: contexto/visibilidad/layout 19 tests PASS; host y
  auxiliares 33 PASS; estados V2 22 PASS; rollback/registro/host 30 PASS;
  comparador 28 PASS. `pnpm --dir frontend typecheck` PASS después de cada
  hito de código. La suite completa y builds quedan para el cierre integrado.
- Bloqueo de coordinación vigente: no editar `CompositeApp.tsx`,
  `ObsOverlayApp.tsx`, `RuntimeOverlaySurface.tsx`, `RuntimeWidgetFrame.tsx` ni
  `telemetry-rate-coordinator.ts` hasta que #936 llegue a `nightly`. Después se
  debe rebasar y eliminar los adaptadores V1 transitorios de layout/visibilidad,
  activar `overlayV2Authority` en Studio/Desktop/OBS y ejecutar los gates
  completos más Wails/LMU real.
- Riesgo operativo de la issue: #893 conserva simultáneamente las labels
  `roadmap:required` y `roadmap:not-required` y todavía no enumera el token
  exacto de roadmap. Debe resolverse antes del commit semántico de `plan.md` y
  de los gates finales.
- No hay PR, merge, promoción ni release. HEAD funcional antes de este
  checkpoint: `0a25f4ad`.

## ISA-962 — integración final Endurance Redline (2026-09-01)

- Rama aislada `vantareapp/isa-962-redline-final-integration`, base exacta
  `origin/nightly@659b2c57dc2c7fc75962cc3c8e425ed1289266ec`; commit funcional
  `bf13921a93d7a662ab2f59526d5f1258217141f2`.
- El candidato integra #957, #958, #959, #960, #961 y #968. La fixture Relative
  deriva de la fila canónica V2; no añade fallback ni relaja `OverlayQValue`.
- Tras reproducir en capturas físicas los saltos, cruces y celdas recortadas,
  Mirror, Proximity y Traffic dejaron de usar FLIP/ghosts y representan el
  orden físico de cada frame directamente. El exterior transparente quedó
  confirmado sobre checkerboard; las capturas anteriores no se declaran PASS
  porque proceden de boxes y de un HEAD previo.
- S3 ya no puede ejecutarse desde el colector genérico. El catálogo fuente
  versiona exactamente Standings Redline, Relative Mirror/Proximity/Traffic y
  Pedals Redline; su materializador genera perfiles e índice ligados al HEAD.
  Delta y cualquier criterio de vuelta están excluidos.
- Gates frescos: focal Relative 9/9 PASS; scripts de banco 22/22 PASS; frontend
  completo 441 archivos y 3421/3421 tests PASS; typecheck, build, ESLint focal,
  `node --check`, digest de roadmap y `git diff --check` PASS. El build conserva
  únicamente el aviso informativo de chunks mayores de 500 kB.
- Revisión adversarial final sobre `1363de97` APPROVE, sin P0/P1. La rama está
  publicada y el PR draft #969 apunta a `nightly`. CI sobre `9af9daa6` falló
  en el run `33502297892`: falta Chromium headless de Playwright al ejecutar
  tests frontend. Promotion path y GitGuardian pasaron; no es CI global verde.
- Pendiente físico: ejecutar S3 con el jugador en pista (máximo cinco minutos
  por comprobación), después S4, S5 y S2 al final, según el plan maestro.
  Corrección del diagnóstico anterior: no se demostró que RawInput descartara
  teclas; solo se observó falta de respuesta y una discrepancia entre la
  pantalla controlada y los procesos locales. R2 debe demostrar que se controla
  el mismo entorno antes de otra prueba. Boxes no es PASS. Sin merge ni release;
  la autorización condicional de Isaac del 2026-09-02 no equivale a integración.

## ISA-968 — Standings Redline estrecho (2026-08-31)

- Rama aislada `vantareapp/isa-968-standings-redline-narrow`, worktree
  `C:\tmp\vantare-isa968\vantare-v2`, base exacta
  `bff576bc3d8175bf986ff7bfef56c19b1ad5e7ab`.
- RED productivo: la regresión con el golden Overlay V2 de 20 vehículos falló
  en `desktop/280px` con 32 descendientes fuera del frame; raíz, bloque y filas
  medían 430 px y las columnas Gap/Última vuelta quedaban recortadas.
- Solución final: únicamente Standings Redline calcula un mínimo desde sus
  columnas y amplía el frame físico efectivo cuando el ancho persistido no
  basta. No comprime tipografía, no oculta columnas y no conserva el escalado
  visual alternativo. Desktop, Studio y OBS comparten esa misma geometría.
- GREEN: matriz productiva ready en Desktop, Studio y OBS a 280, 340, 419 y
  420 px, más missing en Desktop/OBS, sin descendientes visibles fuera del
  frame. Focal ampliado: 6 archivos y 24/24 tests PASS. Typecheck, build y lint
  frontend PASS; el build conserva únicamente el aviso informativo de chunks
  mayores de 500 kB. Digest de roadmap y dry-run del fragmento ISA-968 PASS.
- La validación física S3 Wails/LMU no se ejecutó por instrucción expresa de
  este corte y permanece pendiente antes de promoción. Trabajo solo local: sin
  app, push, PR, CI remoto, merge, promoción ni release.
- Cierre adversarial integrado en ISA-962: un perfil heredado en `x=1639,
  w=280` se representa a `x=1094, w=826`; al arrastrar 100 px a la izquierda
  persiste `x=994` sin salto, hacia la derecha permanece acotado en `x=1094`,
  y un click sin movimiento no ensucia ni autosalva el documento. Selección y
  tiradores acompañan siempre al frame efectivo. El renderer Redline publica
  además
  `data-session-mode` y `data-position-delta` para que S3 demuestre Practice y
  cero ganadas/perdidas sin depender de clases CSS. Candidato integrado:
  frontend 441/441 archivos y 3.418/3.418 pruebas, Go completo, build y lint
  PASS; revisión adversarial de la rama ISA-968 APPROVE. S3 físico sigue
  pendiente sobre el nuevo HEAD.

## Optimización UI Orbit — estado 2026-09-08

Serie de issues de rendimiento tras la auditoría ISA-1111. Entregadas en rama
aislada a `nightly` (pendiente review/merge):

- #1153 useNow compartido (NextRaceCard/SideRaces), #1154 suscripción muerta
  StrategyOrbitPage, #1156 canal granular launcher profiles, #1157 contexto
  overlay estable + memo frames, #1158 i18n lazy (~102KB gzip), #1161 higiene
  de desmontaje/timers/fetch.
- #1164 (ISA-1140): subset Cascadia Code 379KB→~74KB woff2, TTF conservado
  como fuente de regeneración.
- #1165 (ISA-1150): la shell honra `performance:level` — `noBlur`/`flat`
  apagan backdrop-filter y (flat) animaciones infinitas y sombras grandes
  vía `:root[data-orbit-perf-effects]`, sin re-render.
- #1168 (ISA-1147): fanout Wails por dominio fase 1 — `settings` (5→1
  suscripción, store con canales granulares y dedup por valor en
  notifications; ChainRunnerProvider dejaba de repintar el Hub entero por
  evento) y `license` (4→1). Resto de dominios pendiente si aporta.
- #1163 (ISA-1149): Studio con store externo + `useSyncExternalStore`.
  B1: provider 506→~170 líneas, shim `useStudioDocument()` intacto. B2: los
  10 consumidores de producción migrados a selectores granulares; el shim
  queda para tests/consumidores futuros. 640 tests del área Studio verdes.
- Descartadas tras verificación manual: #1134 manualChunks, #1135 Supabase
  en path crítico (correcto), #1137 greeting (trivial), #1138 barrels
  (tree-shaking ya funcionaba), #1139 (ya resuelta por #1122). Hallazgos Go
  revisados: la mayoría eran diseño deliberado; los reales quedan en #1160.

### Continuación (mismo día)

- #1168 ampliada con fase 2: fanout del dominio updater (14 suscripciones
  directas → máx. 9). El inventario del resto de Events.On confirmó que no
  hay más dominios con duplicación que valga la pena — los de 2 sitios son
  marginales.
- #1170 (ISA-1160): los dos únicos hallazgos Go verificados — mapper sin
  slice por vehículo (era stack-alloc; ahorro real es el trabajo por
  vehículo, no GC) y AllSections alias del array de paquete (sí escapaba
  a heap por tick; benchmark -1 alloc/op).
- Review SWE-2 de #1163 encontró un bug preexistente: error de carga de
  Studio inalcanzable tras spinner (guard !document ganaba a lastError).
  Corregido con test de regresión.

## ISA-1149/1140/1147/1150/1160 + ISA-1179/1181/1185 — Optimización y reestilo Orbit (2026-09-12)

- PROMOCIONADO a nightly (verificado en origin/nightly, HEAD d2450cc5):
  #1164 subset Cascadia WOFF2 (380→74KB), #1170 allocs Go en path caliente,
  #1165 blur condicional por nivel de rendimiento, #1168 fanout Wails
  settings+license+updater, #1163 store externo Studio con selectores
  granulares (B1+B2) y fix de error de carga inalcanzable en StudioRouteEditor.
- Reestilo Orbit entregado como drafts pendientes de autorización: #1180
  (BetaWelcome, recordatorios calendario, globales, DowngradeModal sobre
  ConfirmDialog del kit), #1182 (estados auxiliares Studio/Perfiles +
  primitiva .orbit-alert), #1186 (editor in-place, subtítulos ingeniero,
  HubToast, LanguageSelector + harness orbit-outside). Capturas de
  verificación en el escritorio de Isaac.
- Tras estas PRs los únicos consumidores legacy restantes son auth/*
  (bloqueado por migración a Clerk) y settings/diagnostics/* (interno).
  El overlay en juego queda como decisión de producto: es UI de widgets,
  no de gestión.
- Fase C del shim Studio documentada como opcional sin fecha: cero ganancia
  de runtime hoy; los tests antiguos la ejercitan deliberadamente.

## ISA-1098 — cierre conciliado de Efficiency y política común (2026-09-13)

- Candidato `vantareapp/isa-1098-efficiency-integration`, PR #1107 a
  `nightly`, conciliado con `origin/nightly@1aea57118f972c04144dc4546ff8cc16705e6e79`.
  Isaac autorizó la integración a Nightly; testers, master y release quedan fuera.
- La conciliación conserva el Standings Signature/Broadcast aprobado, cabecera
  y pie configurables y acentos de bandera sin transición de color. Incorpora
  el catálogo completo de 18 widgets Efficiency de #1191 y su motor vigente;
  el movimiento de filas obedece el presupuesto publicado por Go.
- `WidgetPolicyWire` queda como autoridad única para catálogo, Studio,
  Desktop, OBS y marca. Free conserva Standings/Pedals y exige marca en
  Crystal/Efficiency; los perfiles mantienen widgets bloqueados y sus ajustes.
- Gates locales tras la conciliación: 109 pruebas focales PASS; 3601 pruebas
  funcionales frontend PASS y 2 omitidas; typecheck, lint, build web y
  `go test ./...` PASS. El benchmark de parseo dio 1,562 ms bajo carga
  concurrente y pasó tres repeticiones aisladas sin cambios.
- La build Wails canónica previa, con `.env.local` externo autorizado, validó
  Free, cambio Signature/Broadcast, dos guardados y dos ciclos abrir/detener
  (394/52 ms y 366/56 ms). LMU no estaba activo: temperaturas y equivalencia
  de códigos REST de bandera permanecen pendientes de prueba física.
- `plan.md` publica `functional-widget-design` y `widget-access-branding` como
  entregados; `roadmap.json` se regenera desde la base confiable. CI del SHA
  final y pertenencia al remoto Nightly son los últimos gates antes del cierre.

## ISA-901 — centro de notificaciones y Spotter overlay-only (2026-09-15)

- Candidato `vantareapp/isa-901-centro-notificaciones`, PR draft a `nightly`.
  Depende de #900 (ya cerrada); paraguas #899. Sin merge ni promoción
  implícita: la integración la autoriza Isaac.
- `internal/notify.Center` es el store acotado (50) y la única autoridad de
  avisos recientes; publica el snapshot completo en `notifications:center`
  tras cada mutación y un webview reconectado pide `notifications:center:get`.
  `revision` descarta entregas viejas. Contrato y matriz en ADR-0096.
- Matriz por fuente: `updater`/`launcher` → hub+windows+history; `system`
  (prueba manual) → hub+history sin Windows. Fuente silenciada aterriza leída
  y sin toast. Acciones solo `navigate` con allowlist backend
  (`settings:updates`, `launcher`): el frontend manda el id y el backend
  revalida antes de emitir `notifications:center:navigate`.
- Exclusión Spotter por construcción: `Source` es conjunto cerrado sin
  `spotter`, así que `Publish` lo rechaza con `ErrSourceDenied`; ningún camino
  del ingeniero toca el centro ni el toast. Su salida sigue siendo
  overlay/subtítulos/audio.
- `centerEmitter` reemplaza `notifyingEmitter`: `launcher:chain:done` ahora
  produce registro del centro; `notify.Service.SendGated` es el canal Windows
  (reutiliza preferencia+autorización+ventana oculta) en goroutine propia.
  `LaunchFinished` quedó sin consumidores y se retiró.
- UI: campana con badge en la topbar Orbit + panel (leído/limpiar/acción).
  i18n en es/en/it/pt; las claves `notifications.record.*` las emite el
  backend y un test de contrato cruza `notify_center.go` con los catálogos.
- Evidencia: `go test -race ./internal/notify` PASS (un test de concurrencia
  cazó y corrigió corrupción en el move-to-front del dedupe); 3600+ tests
  frontend PASS; typecheck/lint/build web PASS; auditoría i18n 0 huérfanas;
  `GOOS=windows go build ./cmd/vantare` PASS.
- Pendiente humano: verificación visual de la campana en la app real
  (Wails/WebView2) y toast Windows; son parte del paquete de validación beta.

## ISA-1221 — recuperación del trabajo local de widgets (2026-09-22)

- [Tarea principal VAN-41](https://app.notion.com/p/3dbe51695c658125b1c2efc198edfc94), proyecto Overlay Studio. Isaac pide subir al remoto los cambios locales pendientes.
- Rama `vantareapp/isa-1221-widgets-local-sync`, basada en `origin/nightly@1e9932c4d8ca3d53a58d093449cfb840f7108e8f`. Snapshot `44a33047af0a05c71ad7d550fa4a9f60ae90d456` conserva el trabajo de `vantare-isa1221-workshop` sobre `c3e6e44c`; el checkout original y su índice permanecen intactos.
- Recupera Delta, Relative (orden delante de cercano a lejano), Standings compacto/podio, Pedals Eficiencia/iRacing, Fuel Strategy, aliases Efficiency y controles de Workshop, con documentos y capturas locales. Conserva las optimizaciones vigentes de nightly en host, coordinador y geometría. Redline tower mantiene su prueba explícita de viewport; las previews ordinarias usan la envolvente externa.
- Frontend con Node 22.23.2 y dependencias del lockfile: 466 suites PASS, 3766 pruebas PASS y 2 omitidas. Build (incluye TypeScript) y lint verificados. Go overlayv2: tests y vet PASS. Las pruebas globales Go fallan en macOS por launcher Windows y diagnósticos/sqlite; reproducido también en la base nightly para los fallos de diagnósticos/sqlite.
- Calidad: FAIL, 55 nuevos hallazgos bloqueantes (34 Knip, 18 duplicaciones, 3 ciclos de dependencias). Sin relajación de reglas ni baseline. Inventario en `docs/engineer/audits/2026-09-22-widget-local-sync-quality.md`. La recuperación se publica como borrador, no como entrega certificada.
- Pendiente: resolver calidad, CI del SHA publicado, revisión visual de Isaac y certificación LMU real. Sin merge, testers, master ni release. Roadmap required: `milestones:functional-widget-design`; el porcentaje del área no avanza por publicar un borrador; digest basado en la nightly confiable.

### ISA-1221 — corrección de los avisos revisados (2026-09-22)

- Continúa [VAN-41](https://app.notion.com/p/3dbe51695c658125b1c2efc198edfc94) / PR #1298. Corregidos los 55 avisos: ratchet PASS, NEW=0 y MOVED=0 en todos los analizadores, sin cambiar política/baseline/excepciones.
- Resuelta además la aceptación de claves heredadas en IDs de perfiles; cobertura de normalizador y V3/V4 para sistema por defecto, widgets y memorias. Aliases y contratos persistidos conservados.
- Suite frontend: 466 archivos, 3772 PASS y 2 omitidos. Build/TypeScript, lint y 69 focales finales PASS. Revisión independiente: sin bloqueantes, 83 pruebas PASS. Equivalencia estática CSS: 445 selectores activos sin cambios de declaraciones finales.
- Informe completo y revisión previa en `docs/engineer/audits/2026-09-22-widget-local-sync-quality.md`. Sin nueva certificación visual ni LMU en vivo; PR en borrador, integración a nightly pendiente de aceptación.


### ISA-1221 — integración inicial autorizada (2026-09-22)

- Isaac autoriza expresamente integrar PR #1298 en nightly mediante subagente. La dependencia de CI #1302 / VAN-737 corrige la prueba negativa que asumía cambios de política en cualquier PR; mantiene los controles y cuenta con revisión independiente.
- El candidato de widgets conserva el código revisado en `6c59caf2`; esta conciliación solo incorpora la dependencia de tooling y documentación de aceptación. El nuevo ajuste de animación Delta `e492aa88` está en otra rama y no forma parte de #1298; Isaac lo aprobó visualmente durante esta integración y se seguirá por separado.
- Verificación remota de SHA/canal y checks en [VAN-41](https://app.notion.com/p/3dbe51695c658125b1c2efc198edfc94). La revisión visual continúa en Workshop y la certificación LMU activa permanece pendiente; sin testers/master/release.


## 2026-09-22 · ISA-1315 inicio: idioma común sin trabajo por muestra

Isaac aprobó compartir el idioma de la app con las etiquetas de widgets y exigió separar toda resolución de traducciones de la telemetría. Seguimiento de widgets en [Asana, En curso](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218757534554194), por su instrucción expresa; [#1315](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1315) conserva el puente CI. [Diseño y plan aprobado](../../plans/2026-09-22-isa-1315-widget-locale.md). Base nightly e41f703c, worktree aislado vantare-widget-locale, rama vantareapp/isa-1315-widget-locale. Próximo paso: implementación mediante worker y revisión independiente de persistencia/concurrencia. PR #1306 continúa separada; sin integración ni promoción de canales.


### ISA-1315 · continuidad de la revisión GPT-6

A petición expresa de Isaac, GPT-6 Sol retoma implementación y GPT-6 Astra revisa arquitectura y backend en checkout separado. El primer commit de implementación es 34bec633; no representa entrega final. La revisión detectó que la recuperación `.failed` podía aplicar tras reinicio un idioma rechazado: queda exigida corrección acotada y regresión. El frontend debe serializar elecciones rápidas porque Wails beta.24 ejecuta callbacks concurrentes.

Base e41f703c + diseño67e9e9ce: frontend build PASS y quality PASS (NEW=0, MOVED=0). Fallos previos reproducidos en macOS: cmd/vantare depende de símbolos Windows; TestProfileRejectsAbsolutePathWindows devuelve404 en lugar de400. No se modifican esos fallos ajenos al alcance ni se presentan los controles globales Go como verdes. Próximo paso: completar frontend, comprobar los contadores con widgets reales y revisar el candidato final. Seguimiento principal sigue [Asana, En curso](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218757534554194).


### ISA-1315 · cierre técnico de la rama

Implementación de GPT-6 Sol en `34bec633`, `d4806bb9`, `8540c1b8` y `cc59e9fc`. GPT-6 Astra aprobó la infraestructura de `8540c1b8` después de corregir la recuperación `.failed`, la colisión de IDs entre ventanas, el rechazo de envío y los snapshots OBS inválidos. El último commit añade únicamente comprobaciones de contadores. El orquestador revisó el diff y la evidencia.

Entrega: [PR draft #1317](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1317) a `nightly`, desde la base `e41f703c`. El seguimiento principal permanece en [Asana](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218757534554194), En curso hasta la revisión visual de Isaac. No hubo integración remota ni promoción de canales. Los controles remotos se iniciaron al publicar; consultar la PR para su resultado actual.

Cambios: preferencia UI nativa persistida en SettingsService y eventos de idioma en cmd/server; contexto I18n en Hub, Desktop, OBS y Workshop; catálogos y presentación de Eficiencia; pruebas de autoridad, reconexión, concurrencia y rendimiento. Sin dependencias nuevas, cambios de política de calidad o modificación de códigos de sesión/telemetría. El roadmap modifica únicamente `milestones:functional-widget-design` y su JSON se generó desde `e41f703c`. Fragmento ISA-1315 añadido.

Evidencia:

- Frontend completo sobre `8540c1b8`: 468 archivos, 3779 tests PASS y 2 omitidos; build y lint PASS. En `cc59e9fc`, dos casos de rendimiento y lint PASS.
- WidgetVisualHost real: 100 frames conservan el nodo, las resoluciones de sesión, las cargas de diccionario, las lecturas/escrituras de almacenamiento y las suscripciones/mensajes Wails. Cambiar idioma sí cambia la etiqueta y conserva el montaje. No se afirma coste CPU nulo durante una selección de idioma.
- Reviewer independiente: 10 archivos y 86 tests PASS; Go focal con `-race` PASS. Persistencia, sidecar genérico y reinicio/concurrencia verificados.
- Quality sobre `cc59e9fc`: aggregate PASS, NEW=0, MOVED=0, policy_changed=false; todos los analizadores terminaron. Un intento previo con Node 26 falló al parsear dependency-cruiser; la ejecución válida usa Node 22.23.2. No se modificaron reglas o baselines.
- `go test ./...` se interrumpió tras unos seis minutos esperando launcher.test; no está verde. cmd/vantare no compila en Mac por símbolos Windows. TestProfileRejectsAbsolutePathWindows y dos pruebas de DiagnosticsBridge fallan también en la base `e41f703c`, reproducido por el orquestador. No se amplió el alcance para ocultarlos o corregirlos aquí.
- Preview local de GPT-6 Luna: `2be30c59` combina idioma con motion `317d31c4` (PR #1306) y conserva los cambios aceptados. Build PASS, 172 pruebas focales PASS y después dos pruebas de contadores PASS; árbol limpio. El servidor del preview está activo en el puerto 5177. El merge local del preview no representa integración remota.

Límites: sin verificación física Windows/OBS ni visual automatizada, por la restricción de acceso del navegador; no se eludió por otra herramienta. Workshop autónomo comparte el idioma de su origen del navegador, sin prometer sincronía con una app nativa separada. El catálogo completado es Eficiencia; otros sistemas conservan textos pendientes. Sigue el comportamiento previo de mantener el catálogo anterior mientras se carga otro: puede haber un breve desfase entre etiquetas estáticas de widgets y texto del Hub en la primera selección. Próximo paso: revisar el selector de idioma en Workshop y la sincronía física con Desktop/OBS.

## ISA-1221 — Standings Eficiencia: animación intermedia para conducción (2026-09-22)

- Seguimiento [VAN-41](https://app.notion.com/p/3dbe51695c658125b1c2efc198edfc94). Isaac aprueba la opción intermedia propuesta, expresamente no broadcast. Diseño y plan en `docs/specs/2026-09-22-standings-motion-design.md` y `docs/specs/standings-motion/PLAN.md`.
- Rama/worktree `vantareapp/isa-1221-standings-motion` / `vantare-standings-motion` desde nightly `1101f735`. Conserva el ajuste Delta aprobado `e492aa88` y los arreglos de harness `5df46ab9`, recuperados como dependencias en `433d0169`; sus ramas remotas originales permanecen intactas. La integración anterior #1298 ya está verificada y no se repite.
- Renderer compartido: desplazamiento continuo desde el primer cambio, chip de puestos por posición canónica (de clase en Multiclass), barrido de mejor vuelta personal y récord morado, distintivo del más rápido, PIT con entrada/salida suave y FLIP ligado a su fila. Las cifras no se transforman y la geometría de la tabla permanece estable. Máximo tres avisos simultáneos con prioridad récord/posición/mejora personal.
- La VM V2 deriva autoridad numérica fresh y el mejor piloto del campo configurado completo, antes de rowCount/ventana. Sin falsos eventos por recorte ni valores ausentes. El modo reducido conserva desplazamientos; minimal actualiza directo. Motor compartido con inicialización opcional de medidas y limpieza de layout antes de perder la referencia DOM. Standings conserva los handles de sus animaciones para cancelar fila, PIT y barrido también si React ya retiró los nodos por desconexión, error o cambio de ventana; poda los finalizados en cada actualización.
- Workshop añade escenas de mejora personal, récord y secuencia combinada a las de posiciones/PIT. En práctica/clasificación los cambios de mejor vuelta vuelven a ordenar el ejemplo. No se modifica la producción Go ni el golden canónico.
- Validación local final: 468 suites / 3810 tests PASS y 2 omitidos. Build/TypeScript y lint PASS. Revisión independiente final PASS, 64 tests / 4 suites; corrigió fallback a posición con vuelta oculta, transiciones CSS en stale y cancelación al desmontar o retirar filas. Las tres regresiones de desconexión/error/ventana fallaron antes del arreglo y pasan después; el reviewer las reprodujo independientemente. Ratchet final PASS: NEW=0/MOVED=0, policy_changed=false, base nightly `1101f735`; sin modificaciones de política/baseline.
- Workshop en `127.0.0.1:5177` sirve el nuevo worktree. Pendiente revisión visual de Isaac y comprobación LMU real. Sin merge, testers/master ni release. Batallas y transiciones de la ventana quedan para la revisión siguiente.
- Verificación manual: en Carrera, activar Mejor vuelta y Estado en boxes, seleccionar **Secuencia combinada · conducción** y pulsar **Reproducir**. Después revisar cada escena individual y las mejoras de vuelta en Práctica/Clasificación. Se comprobó HTTP 200 y el directorio real del proceso; no se declara validación visual automatizada porque el navegador está bloqueado por la política de seguridad de la sesión. Go no cambió; la certificación Windows/LMU queda fuera de la validación local de macOS.

### Segundo bloque autorizado: batallas y ventana (2026-09-22)

- Isaac valora positivamente el primer bloque y pide ejecutar ahora los dos pendientes. Continúa VAN-41 / PR #1306. Diseño ampliado y plan registrados en `05349705`; worker `standings_battles_window` en worktree aislado `vantare-standings-motion-worker`, orquestador en `vantare-standings-motion`. Misma nightly base `1101f735`, aún vigente; sin promoción de canal.
- Implementado por el worker en `78115bd9`, consolidado como `ed8d1985`: batalla discreta de rivales consecutivos de la misma clase con gaps frescos, prioridad al jugador y umbrales 0,8/1,2 s; entrada/salida de filas de la ventana en 200 ms con recolocación FLIP y PIT ligado al piloto. La presencia conserva opacidad y posición durante interrupciones/reentrada, compensa escala y cancela sus recursos al invalidar continuidad. Las filas salientes quedan fuera del layout, accesibilidad y presupuesto de avisos. El motor admite preservar fades de forma opcional sin cambiar sus otros consumidores. Sin inferir autoridad de texto ni añadir dependencias/contrato Go.
- Workshop añade **Batalla cercana · conducción** (`standings-functional-battle`) y **Entrada y salida de ventana** (`standings-functional-window`): siete escenas en total. La segunda cambia la ventana realmente visible mediante un ancla efímera, conserva posiciones canónicas y prueba también PIT. Seleccionar Carrera, Normal o Multiclase y pulsar **Reproducir** en cada una. El servidor 5177 sirve este worktree actualizado; directorio y HTTP 200 verificados.
- Validación: 121 pruebas focales / 6 suites del worker PASS; revisión independiente final sin hallazgos y 152 pruebas / 7 suites PASS, incluida reproducción de entrada→salida→reentrada→salida. Suite completa del candidato: 468 archivos, 3832 PASS y 2 omitidos. Build/TypeScript y lint PASS. Ratchet PASS, NEW=0/MOVED=0, policy_changed=false contra nightly `1101f735`; sin modificar políticas/baselines. Roadmap actualizado en los cuatro idiomas y digest regenerado desde la misma base confiable; fragmento de changelog válido.
- El candidato se publica en la misma PR #1306; SHA remoto y estado definitivo de CI se registran y releen en VAN-41 y el proyecto Overlay Studio. Pendiente revisión visual de Isaac y LMU real; navegador no disponible por la política de seguridad de la sesión. Standings sigue sin aceptación final. Sin merge/promoción/release de este bloque.
- CI del primer bloque `88b27f63`: calidad/GitGuardian/promoción PASS. Blocking gates falló por timeout de `TestRuntimeRoutesActionsButKeepsThemDisabled` en voiceinput, sin cambios en ese paquete frente a nightly. Diez ejecuciones locales de esa prueba pasan (macOS); el rerun remoto único del mismo SHA pasó Go, frontend y Windows/Wails. Fallo intermitente inicial conservado como evidencia, sin editar backend ni relajar controles. Los cambios del segundo bloque requieren sus propios checks.

### Harness: revisión conjunta de batalla y ventana (2026-09-22)

- Isaac pide incluir las dos animaciones en el harness. Las escenas individuales ya estaban servidas; se amplía **Secuencia combinada · conducción**, que tenía seleccionada, de cinco a doce fotogramas. Después de vueltas, posiciones y PIT muestra acercamiento/batalla/separación y ventanas P1→P7→P9→P1 (corregidas tras la revisión inferior), conservando las posiciones y la mejor vuelta alcanzadas.
- La escena de ventana también aplica su recorte de demostración en V1, que normalmente presenta filas fijas. Conserva el estilo y Normal/Multiclase elegidos; no cambia el renderer productivo. Corregido el cálculo del reloj del harness: los límites exactos a 15/30 Hz no retroceden una muestra por redondeo. Las regresiones de batalla y ventana en la secuencia combinada fallaron antes y pasan después de estos ajustes.
- Validación focal: 170 pruebas / 13 suites de autoría PASS; global: 468 archivos / 3836 pruebas PASS y 2 omitidas. Build/TypeScript, lint y ratchet PASS (NEW=0/MOVED=0, policy_changed=false). El módulo servido por 5177 contiene la nueva secuencia. Roadmap en cuatro idiomas y digest desde nightly `1101f735` actualizados. El CI previo de `ce7c40b4` terminó completamente en verde; SHA remoto y checks propios del ajuste final se registran en VAN-41 / PR #1306. Revisión visual de Isaac y LMU real siguen pendientes.
- Verificación manual: mantener Standings, Carrera y **Secuencia combinada · conducción**; pulsar **Reproducir** para empezar desde el principio. Con Mejor vuelta y Estado en boxes activos, revisar los doce pasos. Las escenas individuales siguen en el selector. Sin merge/promoción/release.

### Revisión adversarial: pasos 8–12 del harness (2026-09-22)

- **Afirmación revisada:** el último tramo de la secuencia combinada permite ver batalla y entrada/salida de la ventana con la selección de Isaac (Default, Normal, Carrera, 10 pilotos, alrededor de 4, gap/última vuelta/PIT/mejor vuelta).
- **Refutado en `a079a948`:** P12 quedaba fuera de `rowCount=10`, desaparecía el jugador de referencia y el paso 12 repetía la ventana anterior; contador/leyenda se adelantaban medio intervalo a PIT/ventana; el marco centrado crecía 30 px y desplazaba toda la tarjeta 15 px; los gaps volvían a la base al empezar la ventana. Cuatro regresiones fallaron antes del arreglo. La revisión independiente `review_steps_8_12` reprodujo el salto con geometría explícita y no encontró recorte adicional con PIT activo; sus 45 pruebas previas no cubrían esta composición.
- **Corrección `dde258cf`:** escenas P1→P7→P9→P1 y gaps conservados, contador/leyenda del paso actual, reproducción con timestamps ya muestreados y avance manual al fotograma exacto. El harness reserva sólo altura externa durante escenas con ventana, respeta tamaños explícitos y no modifica el renderer, motor o viewport productivo.
- **Evidencia local:** 173 pruebas de autoría / 13 suites y 3839 globales / 468 archivos PASS (2 omitidas), build/TypeScript, lint y ratchet PASS (NEW=0/MOVED=0, policy_changed=false). Revisión independiente final PASS: 83 pruebas / 4 suites, reserva externa estable a escalas 0,3/1/2, tamaño explícito de 700×240 respetado y avance/reproducción de escenas de 1700 ms comprobados. **Veredicto técnico:** PASS acotado al harness, sin nuevos hallazgos. El servidor 5177 sirve el mismo worktree candidato; no se afirma inspección visual porque el control del navegador no pudo verificar la política del administrador y denegó acceso.
- **Estado y límites:** candidato sobre nightly `1101f735`; durante la revisión nightly avanzó a `ae5a1482` por Wails beta.24 (#1309), sin cambios en estas animaciones. Esta entrega mantiene su base y no integra esa actualización de plataforma. Roadmap del candidato generado desde su base confiable explícita. Pendientes aceptación visual de Isaac, LMU real y la integración autorizada con la base vigente; sin merge/promoción/release.
- **Revisión manual:** pulsar Reproducir y observar pasos 8–12; el paso 9 mantiene la distancia y activa PIT, 10 centra P7, 11 centra P9 y 12 vuelve a P1. Confirmar que el podio y el marco no saltan verticalmente, cada ventana tiene jugador visible y los pasos coinciden con lo que se muestra.

### ISA-1320 — verificación y revisión manual

Cambios de producto: `RelativeFunctional.tsx`, `relative-presentation.ts`, `use-relative-motion.ts`, estilos Relative y presupuesto presentacional en el ViewModel V2. El motor común añade inicialización y seguimiento optativos, preservando consumidores existentes. Escenas y controles de Workshop filtran los antiguos guiones de Relative para Eficiencia y ofrecen cruces en ambos sentidos, entrada/salida/reentrada, inversión de 180 ms, datos cambiantes con filas quietas y secuencia completa.

Revisión manual: seleccionar Relative/Eficiencia → Animaciones → Secuencia completa → Reproducir; después probar Inversión rápida y Datos cambian, filas quietas. Comprobar jugador/pie estables, señal tenue solo en cruces y cifras sin pulso. Repetir con preferencia de movimiento reducido y diferentes escalas. Los fixtures no certifican conducción real ni Windows/OBS. El preview local conserva también Delta/Standings de la PR #1306; esa composición local no implica que #1306 esté integrada en nightly.

Entrega de revisión publicada: [PR draft #1323](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1323), rama `vantareapp/isa-1320-relative-motion`, código `cf14f927`, sin merge. Preview local limpio `cf18f9d6` activo en `http://127.0.0.1:5177/workshop?widget=relative&system=vantare-functional&session=practice&scene=relative-functional-sequence&frame=0`; combina con `2be30c59` y conserva las correcciones aceptadas de Delta/Standings. Validación del conjunto: 185 pruebas focales, tipos y build PASS; después de retirar dos reglas Delta antiguas introducidas al resolver el CSS, 14 pruebas Delta PASS y diff de Delta sin regresión respecto al preview anterior. CI remoto de la PR en curso; controles locales aprobados. Asana Relative permanece En curso, pendiente de la valoración visual de Isaac.

### ISA-1320 — revisión de captura de Isaac, 22:22

La captura posterior a la entrega muestra un error en el guion: las escenas Eficiencia nombraban Bruni/Birch pero los asientos de la parrilla eran Nico Pino/Mikkel Jensen. `a7449ce8` corrige exclusivamente captions y claves de las seis escenas; conserva las escenas legacy. La regresión recorre cada muestra en práctica, clasificación y carrera y comprueba los nombres de los pilotos realmente visibles. 52 pruebas focales de escenas/Workshop, typecheck, lint y diff limpio PASS.

También se observa un hueco antes del pie en el paso inicial que retira al segundo rival trasero. La reserva visual tiene un slot vacío, pero la base anterior ya fijaba el alto de la tabla y el pie mediante flex; eliminar ese slot por sí solo no elimina el espacio. Isaac concreta después que falta el sexto rival y no se recupera; la causa y corrección quedan registradas a continuación. No se considera Relative confirmado ni completado.


### ISA-1320 — sexto rival recuperado en Workshop

Isaac confirma que falta uno de los seis rivales configurados. Reproducción independiente sobre el preview `0b9dee71`: la ruta montada conserva a Jensen en el paso 6, pero solo muestra 6 filas totales en lugar de 7. La preparación del fixture recortaba a 3 delante + jugador + 3 detrás antes de aplicar cruces y ausencias; perdía los candidatos necesarios para rellenar la ventana.

`956f6990` conserva el campo disponible en las escenas Relative antes de aplicar sus cambios. La selección productiva existente elige los tres rivales más cercanos por lado. Sin cambios de geometría, motor de animación ni telemetría productiva. Prueba permanente con un único WidgetVisualHost montado: nueve pasos, siete identidades únicas, salida/reentrada de Jensen y nodo del jugador estable. Fuente: 48 pruebas focales, tipos, build y lint PASS.

Preview `f2cde704` incorpora solo ese ajuste sobre `0b9dee71`, conserva Delta/Standings y pasa 75 pruebas focales. Revisión independiente de la ruta Workshop completa con la URL del usuario: nueve pasos y saltos hacia atrás mantienen siete filas; la aserción que fallaba antes pasa después. Vite 5177 continúa sirviendo el ajuste sin reiniciar. Estas son pruebas DOM, no certificación visual. Asana sigue En curso hasta aceptación de Isaac; sin merge de #1323.


### ISA-1320 — orden espacial junto al jugador

Isaac señala los rivales invertidos, citando el 18 frente al 16 por detrás en la secuencia, frame4. Confirmado delante: el contrato V2 entrega cerca→lejos, pero la presentación lo pintaba igual de arriba abajo; dejaba el rival lejano junto al jugador. `2cb3e2a3` selecciona primero los rivales cercanos dentro del presupuesto y después invierte solo el grupo delantero para mostrar lejos→cerca→jugador. Detrás mantiene cerca→lejos; sin reordenar telemetría, posición de carrera ni datos por muestra.

La prueba DOM de orden falla antes y pasa después. 66 pruebas focales, tipos, build y lint PASS. Revisión independiente de ruta completa en práctica, clasificación y carrera: nueve pasos y saltos hacia atrás mantienen seis rivales, con gaps descendentes de arriba abajo en ambos grupos. Se conserva la identidad del jugador y el arreglo del sexto rival.

El ejemplo trasero requiere distinguir clasificación y distancia: frame4 asigna18=−5,1s,17=−7s,16=−8,9s, por lo que18 es el más cercano según esos datos. Se ha preguntado a Isaac por el criterio esperado; no se inventan gaps ni se invierte detrás para cumplir el número de posición. Pendiente su valoración visual; Asana En curso, sin merge.


### ISA-1320 — señal de diferencia de vueltas en carrera

Isaac autoriza una señal discreta para entender por qué un coche peor clasificado puede circular delante del jugador. [Plan](../../plans/2026-09-22-isa-1320-relative-lap-signal.md). Etiqueta junto al nombre: −N indica menos vueltas que el jugador y +N más; unidad V/L/V/G en es/en/pt/it y descripción accesible completa. Solo carrera, fuente live, fase fresh y diferencia entera vigente; jugador, cero, datos antiguos/inválidos/ausentes y otras sesiones no generan etiqueta.

Se reutiliza `derive.VehicleGap.Laps`, derivada de los datos de clasificación `LapsBehindLeader` del simulador. `RelativeRowV2.lapDelta` conserva valor y calidad en immediate y settled, y su fingerprint publica cambios de valor/calidad. No se calcula una segunda diferencia desde CompletedLaps, LapDistance, posiciones, clases o gaps temporales. El renderer solo presenta el valor; etiqueta memoizada y diccionarios estáticos, sin temporizadores ni lectura de geometría nueva. La señal se describe como diferencia de vueltas de clasificación; no certifica por sí sola cada transición física al doblar en una sesión LMU real.

Backend 661f1ea9 + 6fdf4fd8: suite overlayv2, vet, contrato generado y tests de calidad/signo/cadencia/settled PASS; root revisa diff y ejecuta con race las suites completas overlayv2 y derive, PASS. UI 6e635540 y unidad corregida eafc2858: primera revisión focal92PASS, revisión independiente renderer/window/motion29PASS. Verificación final de UI en d26a8cb7: 99 pruebas focales, tipos, build y lint PASS. Root ratchet PASS, NEW=0/MOVED=0 y policy_changed=false. El refinamiento 27df6697 retira un recorte innecesario de seis líneas para conservar el campo completo; 28 pruebas de escenas/ventana PASS. Root verifica además la ruta Workshop montada: cuatro pruebas PASS en carrera/práctica/clasificación y cambio manual de paso, con siete filas y nodo del jugador estable. La escena combinada conserva AndréP1/GiovinazziP4−1V; la escena específica de diferencias de vueltas utiliza una clasificación intermedia coherente para mostrar ambos signos. Pendiente revisión visual de Isaac; no merge ni certificación Windows/OBS.

## ISA-1334 — integración conjunta de widgets Eficiencia (2026-09-23)

Isaac autoriza integrar en `nightly` el trabajo del día: Standings con animación de conducción ([#1306](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1306), `317d31c4`), Relative con movimiento y diferencia de vueltas ([#1323](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1323), `2e8061f5`) y Horizontal Standings ([#1333](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1333), `340455d2`). La rama `vantareapp/isa-1334-widgets-day-integration` conserva los tres commits fuente mediante merges explícitos sobre `nightly` `e6d7d2b5`, sin promover a testers/master ni publicar una versión. Durante CI, `nightly` incorporó además Fastest Lap mediante #1330 (`4bb11fdb`); la rama de integración absorbió esa base sin sustituir el widget ni sus escenas, y regeneró el roadmap desde el nuevo SHA protegido.

Los conflictos de Workshop, escenas y motor de movimiento se resuelven preservando filtros por sistema y sesión, el fotograma manual exacto, las animaciones de los tres widgets y las etiquetas traducidas. La comparación con el preview aceptado `752bc0cc` deja idéntico el código de widgets; solo añade la validación estricta de `RelativeRowV2.lapDelta` y la muestra faltante del benchmark. Los archivos de idioma/telemetría de producción no se sustituyen por fixtures. El roadmap deriva del plan candidato y del JSON protegido de la base `origin/nightly`.

La aceptación visual de Relative y Standings ya consta en sus entregas. Quedan revisión visual de Horizontal Standings, comprobación física Windows/OBS y validación con telemetría LMU real para las señales descritas en los planes de origen. Esta integración no afirma esas pruebas. Seguimiento principal en [Asana ISA-1334](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218766733477999); la [issue #1334](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1334) conserva el contrato técnico de CI.


## 2026-09-22 · ISA-1328 · Aviso de vuelta rápida, candidato para revisión

Isaac pide convertir en producto el concepto morado aprobado en marketing. Seguimiento principal, por su instrucción expresa: [Asana · Widget · Aviso de vuelta rápida](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218762634127535); [GitHub #1328](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1328) sirve como puente CI. Base `nightly` `e6d7d2b5e58f55b82c0ed2f6a79667476d897086`; rama aislada `vantareapp/isa-1328-fastest-lap`. [Diseño y plan](../../plans/2026-09-22-isa-1328-fastest-lap.md).

- Widget independiente `fastest-lap` de Eficiencia: cronómetro morado, panel oscuro, diagonales rojas, piloto y tiempo. Catálogo Studio, perfiles V3 y permisos Overlays Advanced; es/en/pt/it. Alcance inicial de clase propia, seleccionable sesión completa; duración 3–15 s (6 por defecto), piloto opcional.
- Un renderer puro compartido por WidgetVisualHost. La presentación temporal local establece la referencia sin aviso al abrir, cambiar de sesión/epoch/alcance o reconectar. Solo mejoras observadas de tiempos frescos y positivos, a milisegundos; no empates, frames fuera de orden ni marcas heredadas al entrar/cambiar de piloto. Un único timer sustituible, sin polling, IPC, almacenamiento ni nuevas dependencias.
- Se suscribe a cambios de tiempos/identidad por eventos incluso en el nivel mínimo de rendimiento. Posiciones/distancias sin cambios de tiempos no despiertan el widget. Sin benchmark físico ni afirmación de coste CPU cero.
- Escena Workshop reproducible: baseline, mejora, caducidad, segunda mejora. El modo Studio muestra una previsualización persistente cuando hay una marca fresca; Desktop/OBS son temporales. Adelantar, retroceder y volver a reproducir reinician la referencia de demostración sin relajar el rechazo de muestras fuera de orden en producto.

Evidencia: suite frontend completa (470 archivos, 3814 PASS, 2 omitidos); tras corregir el escenario, 44 pruebas focales PASS. Build/TypeScript y lint PASS. Go config y performance completos con `-race`, guardas de permisos y nuevo widget con `-race`, y `go vet` de paquetes modificados PASS. Quality PASS: NEW=0, MOVED=0, policy_changed=false. Roadmap modifica solo `milestones:functional-widget-design`; JSON generado con el script de la base y commits alcanzables desde `e6d7d2b5`. Fragmento ISA-1328.

Verificación manual: navegador con componente real y datos de demostración; estado inicial silencioso, mejora visible 1:29.902, desaparición sin nuevas muestras, repetición tras retroceder, cambio es/en y composición 480×104 / previsualización 280×72. Preview local en `http://127.0.0.1:5188/workshop?widget=fastest-lap&system=vantare-functional&surface=studio&scene=fastest-lap-alert` (requiere servidor local activo).

Límites: `go test -timeout 60s ./...` falla en macOS en cmd/vantare (símbolos Windows), launcher (timeout), ruta Windows, Diagnostics y SQLite; no se declara verde. `go vet ./...` también queda bloqueado por símbolos Windows; su ejecución focal y el ratchet Windows pasan. Pendientes revisión independiente y comprobación física LMU/Windows/OBS. Seguimiento en Asana permanece En curso con candidato entregado para revisión, porque el proyecto no tiene sección En revisión. No hay merge, promoción ni release; la siguiente acción es revisar el diseño y validar las señales en sesión real antes de autorizar integración.

Entrega ISA-1328: [PR draft #1330](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1330), implementación `dbc35180`, rama publicada y adjunta a la tarea Codex. Los checks remotos se iniciaron al publicar; consultar el estado actual en la PR. Asana se actualiza con esta misma evidencia y queda sin completar, pendiente de aceptación.


### 2026-09-23 · ISA-1328 · tamaño real, personal/clase y ciclo de animación

Isaac conserva el diseño y pide tamaño editable, récord personal y de su clase, y corregir animaciones. Ajuste en la misma rama aislada y [PR draft #1330](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1330); seguimiento principal en [Asana](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218762634127535). Sustituye la opción clase/sesión de la propuesta inicial por dos avisos activos por defecto. Mejor personal = sesión actual de la clasificación V2; si ambos récords coinciden, un único aviso de clase. Sin nueva autoridad de tiempos.

- El viewport compartido entrega al renderer el ancho y alto reales, sin estirar la composición. Workshop ofrece controles visibles; mínimo 280×72, predeterminado 480×104. El perfil conserva layout y ambos controles de aviso.
- Entrada reiniciada por ID de aviso, salida animada de 220 ms dentro de la duración configurada, un solo temporizador pendiente y limpieza en reinicios/desmontaje. Conserva motion off/minimal y prefers-reduced-motion.
- Workshop distingue vista estática (Ver diseño) y reproducción temporal también en Studio. Fixture con personal, récord de rival de clase y doble récord; las etiquetas no adelantan eventos a mitad de fotograma.

Evidencia actual: 470 archivos frontend PASS, 3832 pruebas y 2 omitidas; build/TypeScript y lint PASS. Quality PASS, NEW=0, MOVED=0, policy_changed=false. Prueba visual en navegador de 280×72 y 480×104, avisos personal/clase, prioridad de clase, reproducción automática en Studio y expiración sin nueva muestra. El aviso de fetch cancelado en teardown de happy-dom no causa fallo de suite (exit 0). Sin cambios Go; conserva la evidencia focal y los límites globales de macOS de la entrega anterior. Roadmap actualiza únicamente milestones:functional-widget-design y se regenera desde e6d7d2b5.

Siguiente paso: aceptación visual de Isaac y validación independiente/LMU/Windows/OBS antes de autorizar integración. Asana permanece En curso y sin completar; no hay merge, promoción ni release.


### 2026-09-23 · ISA-1328 · aceptación e integración inicial autorizada

Isaac revisa los ajustes de tamaño, avisos personal/clase y animaciones en Workshop, los acepta y pide expresamente integrar la [PR #1330](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1330) en `nightly`. El código aceptado es `8411ecdb692e1444c110719c5834a2b46300c2fb`; este cierre solo registra la aceptación en documentación, roadmap y fragmento, sin cambiar producto.

Se conserva la evidencia de 3832 pruebas frontend PASS (2 omitidas), build/TypeScript, lint y quality PASS. La incorporación se hace por PR normal con los controles remotos vigentes; el SHA de integración y su pertenencia a `origin/nightly` se registrarán y releerán en [Asana](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218762634127535). No se declara un merge antes de verificarlo. No hay revisión externa registrada; la aceptación visual es de Isaac. La validación física LMU/Windows/OBS continúa en Nightly y no se presenta como ya superada. Esta autorización no incluye Testers, Master, una release o un anuncio público.

## 2026-09-25 · ISA-1368 · revisión física del Launcher

La [PR draft #1369](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1369) se inició sobre `nightly` `5c73013e` y se reconcilió con `f0ccfbf2` en su rama aislada, sin merge a un canal ni promoción. Isaac autorizó usar el PC para verificar el candidato y pidió un único perfil de inicio con Windows y dos acciones separadas: repetir todos los pasos desde el primero o solo los fallidos. El entorno de prueba usó `C:\tmp\vantare-launcher-qa-20260925` como directorio de trabajo; no reutilizó perfiles ni cambió el inicio con Windows del usuario.

En el ejecutable Wails real se reprodujeron y corrigieron tres fallos de interfaz: las cinco políticas avanzadas carecían de etiqueta visible, el selector de aplicaciones quedaba debajo del cajón de edición y el diálogo/aviso de una cadena enseñaban IDs internos en vez de nombres. Pruebas de regresión fallaron antes del arreglo y pasaron después. La versión recompilada mostró las etiquetas, permitió guardar un perfil nuevo y mostró «Le Mans Ultimate» y «QA LMU ya abierto» en el diálogo y el aviso. LMU ya estaba abierto con PID 12340; elegir «Reutilizar» completó el perfil sin cambiar ese PID.

Con dos copias controladas de un ejecutable de Windows en el directorio QA se guardó una cadena de dos pasos; se retiró solo la segunda copia para provocar un fallo real de apertura. Wails mostró el primer paso listo, el segundo fallido, el nombre correcto y los botones independientes «Repetir pasos fallidos» y «Repetir todos los pasos». Se pulsaron ambos, pero el proceso del primer paso termina demasiado rápido para certificar visualmente el alcance exacto de cada repetición; ese contrato queda cubierto por las regresiones Go. La interacción física posterior se detuvo cuando el control del PC detectó actividad del usuario. No se tocó LMU ni se reinició Windows.

Evidencia local del nuevo candidato: `pnpm --dir frontend test` PASS (483 archivos, 4117 pruebas, 2 omitidas; presupuesto de 4 pruebas PASS), typecheck PASS, lint PASS, `wails3 task windows:package:all` PASS con ejecutable, ZIP e instalador 0.1.0.7 y SHA256 verificados. La primera ejecución global tuvo un timeout en una prueba de layout ajena al Launcher; pasó aislada y la segunda ejecución global pasó íntegra. El instalador y el binario creados están sin firma. Quedan pendientes la prueba física de instalación/actualización, el inicio real de sesión de Windows con un único perfil, hotkeys tras reinicio, cancelación/salida con procesos iniciados por Vantare y la validación remota del nuevo HEAD. El puerto HTTP de la app y varios hotkeys estaban ocupados por otra instancia de Vantare del usuario en el PC; no se considera prueba de esas funciones. Estado: NO-GO para lanzamiento; sin release.
Comprobación adicional: `go test ./internal/app/launcher ./cmd/vantare` PASS tras la revisión física. El comportamiento de ambos alcances de repetición permanece en sus pruebas Go; la observación visual de un proceso instantáneo no sustituye esa evidencia.

Al avanzar `nightly`, GitHub marcó la PR en conflicto y no generó los workflows de CI de los SHA `961a2558`/`52478296`. La rama incorporó los commits `446001dd` y `f0ccfbf2`; solo colisionó `roadmap.json`, que se regeneró desde el plan combinado y `origin/nightly` con el script oficial (`--check` PASS). En la base combinada pasan el build frontend, `go test ./...`, 52 pruebas focales de Launcher, 10 pruebas de layout aisladas y lint. La suite frontend global local se interrumpió con timeouts de layout y un fallo del proceso bajo carga simultánea de otros tests del PC; no se declara PASS. La CI del merge debe ejecutarse sobre el SHA definitivo. El paquete Wails examinado físicamente pertenece al código anterior al merge; no hay nueva prueba visual de los cambios entrantes de calendario/telemetría.

CI de `9bf95ae2`: los gates de canal y seguridad pasaron; el ratchet de calidad encontró una duplicación nueva de CSS al modificar `orbit-kit.css`, y el gate funcional siguió hasta PASS. La regla de elevación del selector se trasladó al estilo local del componente; la hoja CSS compartida vuelve a coincidir exactamente con la base. La clasificación oficial de duplicados sobre el nuevo árbol da NEW=0 tras verificar la procedencia de 42 hallazgos reagrupados; 14 pruebas del selector, typecheck y lint PASS. Pendiente repetir CI sobre el commit de corrección. No se declara aptitud de lanzamiento mientras falten los controles físicos descritos arriba.

CI de `cd031150` sobre `f0ccfbf2`: calidad, promoción, seguridad y gates bloqueantes PASS, incluidos build frontend, contrato TypeScript de telemetría, Go, pruebas frontend globales, lint de cambios y build Wails Windows. Antes de cerrar, `nightly` avanzó a `98c245bf` (cabecera Orbit) y la PR volvió a tener conflicto únicamente en el JSON generado del roadmap; se incorpora esa base y se regenera el artefacto oficial. Las pruebas físicas del instalador y de una sesión nueva de Windows siguen pendientes de coordinar con Isaac.

CI de `0a8d2f74` sobre `98c245bf`: calidad, promoción, seguridad y gates bloqueantes PASS, incluidos build frontend, pruebas Go y frontend, lint de cambios y build Wails Windows. La PR #1369 está limpia y combinable, pero sigue draft y sin integrar. El estado de lanzamiento permanece NO-GO por las pruebas físicas pendientes, no por un fallo conocido de CI.

El 2026-09-26, a petición de Isaac, la revisión adicional usó exclusivamente el navegador integrado de Codex con Vite y `VITE_RUNTIME_MOCK=mock` en `127.0.0.1:5173`, sin ocupar el escritorio. Se vieron Launcher, catálogo, perfiles, editor avanzado y las cinco políticas con etiquetas accesibles. El selector de reintentos apareció por encima del cajón y permitió elegir «Todos los pasos» con límite adicional; al crear un perfil se pudo añadir un paso y seleccionar OBS Studio. No hubo errores de consola. El mock solo responde a `launcher:snapshot:get`: Guardar/Lanzar no persistieron ni ejecutaron procesos, de modo que esta sesión no prueba backend, registro Run, hotkeys ni instalador. La shell conserva intencionalmente un suelo de 1180 px y scroll interno en una vista de 390 px; no se considera prueba móvil de aceptación del Launcher Windows. Se cerraron el tab de QA y el servidor. `nightly` avanzó por documentación a `d09829c4`, se incorporó con roadmap regenerado y CI de `3336422c` PASS en todos los gates obligatorios; PR draft limpia y combinable. Sigue NO-GO hasta las pruebas físicas acordadas.

Isaac ofreció el PC tras reiniciar Windows. El arranque del sistema fue el 2026-09-26 a las 12:26:30; Vantare no estaba ejecutándose. Se encontró una entrada `HKCU\...\Run` llamada `Vantare.test-profile` que apuntaba a un `vantare.test.exe` temporal de `go-build` ya inexistente. Se verificó esa condición y se retiró solo esa entrada; quedaron cero entradas `Vantare.*`. Por tanto, este arranque no certifica el inicio automático de un perfil real. Desde el HEAD `d2900a12` se volvió a generar localmente el paquete oficial 0.1.0.7: ejecutable, ZIP, instalador y SHA256, con verificación de versión y runtime PASS; `git status` limpio tras el build. Ejecutable e instalador muestran `NotSigned`. La PR del mismo HEAD pasó todos los gates obligatorios. La prueba de instalación/actualización y la ejecución del candidato esperan la confirmación puntual exigida por computer-use; todavía no se han realizado. Estado comercial NO-GO, sin merge ni release.

`nightly` avanzó a `5b6a0781` con ISA-1381 (apariencia), incluido su handoff y plan. Se incorporó a la rama de ISA-1368; el único conflicto fue `roadmap.json` generado, regenerado desde el plan combinado y `origin/nightly` con `--check` PASS. El frontend compiló y pasó el chequeo de tipos, las 129 pruebas focales del Launcher y `go test ./...` PASS en el árbol combinado. Este nuevo merge requiere sus propios gates de CI y un nuevo paquete para cualquier prueba física del HEAD final. La instalación previa conserva otro hash y mostró siete apps detectadas y dos perfiles oficiales, sin editar perfiles.

Isaac autorizó integrar #1369 en `nightly` para poder probar el Launcher. La PR pasó todos sus gates en `da304acc` y se integró por squash como `b6833bb5368a459688cc1d76f526ecf1c2aa1833`, sin diferencias de árbol entre el candidato y `origin/nightly`. El digest del roadmap posterior al merge y la ejecución `36252220712` pasaron: ruta de promoción y gate bloqueante completo, incluidos Go, frontend y build Wails Windows. La issue #1368 permanece abierta con `state:nightly` para instalación/actualización física, una sesión nueva de Windows con un solo perfil, hotkeys, políticas de cancelar/salir y validación Steam/LMU. El paquete local de `da304acc` coincide en código y contenido con `b6833bb5`, pero sigue sin firma y sin prueba de instalación. No hay promoción a `testers`/`master` ni release; el lanzamiento comercial permanece NO-GO.

### Continuación RONDA 2 — bloque 1 (2026-10-05)

Dirección V1/Default/Foco en el Workshop sobre el mismo renderer. Foco elimina
ornamento y usa chip al contorno; Default conserva la ventana del jugador.
Comparación horizontal y dimensiones que escalan las primitivas en X/Y.
Regresión de ejes independientes añadida. Check, Clippy, fmt, Nextest
1096/1096 (4 omitidas), lifecycle12 y build prueba PASS. Captura ronda-4
mirada en C:/tmp/1467b-evidence. Límite: glifos usan tamaño Y y espaciado X;
GPUI no ofrece aquí deformación anisotrópica de glifos. No es paridad exacta.
SSH Mac vuelve a responder; validación del HEAD final pendiente. Sin push,
PR, merge, promoción ni release. Roadmap manual ausente en esta base.

### RONDA 2 — bloque 2 (2026-10-05)
Relative usa en Workshop el tamaño compacto 430×256 y columnas del React;
se conserva el tamaño productivo. Corregida la elipsis vacía de clase y la
alineación de nombres. Las 18 selecciones nativas tienen escena válida; cross-ahead
se capturó en fase 3. El importador prioriza classId explícito; regenerar 43
escenas no cambió sus bytes. Comparación reparte dos columnas iguales.
Fmt/check/clippy, Nextest 1097/1097 (4 omitidas), lifecycle12 y prueba PASS.
Ronda-5 recompilada y mirada: datos, filas y caja coinciden; no certifica
paridad píxel a píxel. Sin push/PR/merge/release.

### RONDA 2 — bloque 3 (2026-10-05)
Ajustes JSON versionados por worktree: widget, escena, fondo, escala,
dimensiones, idioma es/en, dirección y settings. Reabrir sin argumentos y
recompilar con dev.ps1 restauran la selección; CLI explícita conserva autoridad.
Ficheros inválidos se conservan y muestran error. Test de archivo real PASS.
Fmt/check/clippy, Nextest1098/1098 (4 skip), lifecycle12 y prueba PASS.
Dos procesos 29160/24828 restauraron Relative/cross-ahead/solid/1.5x; sus
capturas son idénticas. Ronda-6 React/GPUI mirada: misma caja y datos;
chrome y transporte aún tienen diferencias visuales. Watcher completo de
recompilación no se repitió en esta ronda. Sin push/PR/merge/release.

### RONDA 2 — bloque 4 (2026-10-05)
Interpolación local del Workshop: easing React, radar lineal y muestreo por
cadencia del widget registrado. Gaps/delta/pedales/reloj continuos; posición,
boxes y vueltas cambian al llegar. Ausencias y Stale no se rellenan. Pausa
conserva fase; Reproducir del panel empieza desde cero. Historias no se inventan.
Fmt/check/clippy, Nextest1099/1099 (4 skip), lifecycle12 y prueba PASS.
Ronda-7 y muestras temprana/tardía miradas: Nico −0.6→−0.3 dentro de fase1,
posición20 y fila quietas. Tiempos React/GPUI no sincronizados; no prueba
paridad temporal exacta ni rendimiento LMU. Corrección: registro nativo18,
React22; faltan engineer-radio/race-schedule/delta-advanced/pedals-telemetry-compact.
Sin push/PR/merge/release. Error y validación Mac final siguen pendientes.

### RONDA 2 — bloque 5 parcial (2026-10-05)
Error seleccionado oculta el renderer y muestra el texto del React en la
caja del widget; Recibiendo/restablecer recuperan el renderer. No se inventa
SourceState ni se toca runtime. Ronda-8 y recuperación miradas en proceso22476.
Es comprobación UI manual, sin test UI automatizado añadido. Gates completos
fmt/check/clippy, Nextest1099/1099 (4 omitidas), lifecycle12 y prueba PASS.
Pendientes al corte: pt/it (Language y32 consumidores compartidos), cuatro
renderers React ausentes, históricos/dents adicionales y paridad del chrome.
X/Y de glifos conserva límite del bloque1. Mac00454fe4 compiló, abrió ventana
GPUI y aceptó cambio/restauración de JSON con worktree limpio; por SSH no
certifica presentación física. Se verificará el último HEAD tras este bloque.
No hubo push/PR/merge/promoción/release ni modificaciones de dependencias.

### Corte RONDA 2 — Mac y entrega (2026-10-05)
Código b9419d3d verificado en Darwin arm64 mediante ui/workshop-en-vivo.sh:
compilación, ventana GPUI y tres estilos aceptados (original/cambio/restauración),
worktree limpio. Evidencia mac-verification-r2.json fuera del repo. No prueba
visual física Mac ni gates completos de su workspace. Este cierre documental
no altera código; se transfiere y repite el script sobre su HEAD final.
Ronda-4 repetida y mirada sobre el ejecutable final: comparación en dos
columnas iguales; rondas5–8 inspeccionadas. Persistencia antes/después idéntica.
Entrega parcial y pendientes del bloque5 siguen vigentes; issue1467 abierta.
Gates de cada bloque PASS. Sin CI remota, push, PR, merge, promoción ni release.
### ISA-1470 - Fase 0, integración local del rediseño (2026-10-05)

Issue GitHub #1470, worktree `C:/tmp/vw3-1470`, rama
`vantareapp/isa-1470-hub-rediseno`, base `a464e9fc`. Merges locales expresamente
pedidos por el brief: #1453 `b45fc499`, #1463 `a6006ef2`, #1461 `21fc7cc0`,
#1467 `c57c2c43` y #1469 `84e88526`, en ese orden. El conflicto de Standings
conserva las regresiones de invalidación y de estilo vivo. Los ocho archivos
pendientes de #1469 se copiaron sin alterar su checkout; commit `39690eae`.

Fmt/check/clippy y 1120/1120 pruebas Nextest filtradas PASS; el corpus ACC
completo se ejecutó aparte (190308 fotos, 478,768 s) y lifecycle 5+12 PASS.
La exclusión entre merges afecta solo a ese golden; no se modifica el corpus.
La revisión de paridad encontró que un borde coloreado de ancho cero añadía
seis píxeles en las esquinas del chip HYP. Signature vuelve a usar borde
transparente; Focus conserva el suyo. La regresión se verifica con la captura
real del renderer y `ui/compare.ps1`: 0/292160 píxeles, umbral 0, sin máscaras,
frente a la base NATIVA congelada de #1467 en a464e9fc, mismo perfil prueba.
La referencia Wails del repo conserva diferencias históricas: este cero no
certifica paridad con Wails ni con el chrome completo del Workshop.
Evidencia externa: `C:/tmp/1470-evidence/`, `f0-corner-fixed.log` y su PNG/diff.

El cierre supera el límite de 60 minutos por corpus, gates repetidos y build
frío de prueba. No se reducen checks para declarar el resultado. Fase 1 aún
pendiente de validación. No hay push, PR, CI remota, promoción ni release;
solo los cinco merges locales autorizados, con la beta de Isaac intacta.

### ISA-1470 - Fase 1, cimientos del Hub (2026-10-05)

Sobre F0 `0f06ad5c`, sin promoción de canal. Bloque público UI `aacc0908`. La API compartida es
`vantare_ui::theme::{Design, Tokens, LiveTheme, register_fonts}`. Sus cuatro JSON
viven en `native/ui/themes/`: Grafito carmín por defecto, DeepSeek Harness con
los neutros de la referencia, Noche Le Mans y Piedra cálida (ambos oscuros).
Release/prueba incorpora los JSON; debug observa mtime. `for_authoring` permite
Workshop --dev incluso en perfil prueba. El consumidor instala `value` en GPUI,
refresca y presenta `error`; una escritura parcial conserva el último tema válido.
Rajdhani y Space Mono, con OFL, viven en `native/ui/assets/fonts/`; registrar tras
Inter. El tema se persiste atómicamente en appearance.json con detección de conflicto.
Los estilos de widgets conservan su autoridad independiente.

Hub consume esos tokens mediante Orbit: tarjeta neo, cabecera, filas, botones,
play circular, keycaps, progreso, avatar y los SVG Pit aprobados. Reutiliza los
controles existentes y sus estados, sin renderer paralelo ni dependencia nueva.
`orbit::activity_time(value, now)` es el helper común de fechas españolas, con
reloj inyectable y pruebas de cambio de día y conversión de zona. La shell usa
barra 272/76, Ctrl+B, Ctrl+L, breadcrumb/estado LMU/campana y contexto a la derecha.
Inicio implementa el layout C con selector de perfiles del Launcher y miniaturas
del renderer productivo. Los lanzamientos pasan por el controlador existente;
no se añade ejecución ni autoridad. Strategy/Engineer quedan Próximamente;
Workshop/Analysis se ocultan en la shell beta. Licencias permanece dentro de Cuenta.

Contrato LOCAL de derechos IPC: versión 2 -> 3, nuevo `Policy.tester`, derivado
solo de credenciales verificadas válidas con derechos exactos
`vantare.operational.owner`, `vantare.operational.tester` o
`vantare.operational.nightly_tester` (categoría tester ya admitida por el núcleo).
Comprar Calendario no concede rol. Testing/Calendario solo se pintan con ese rol
verificado. Invalidación/expiración lo revocan. No cambia servidor ni licencia remota.
Versiones distintas producen `VersionMismatch` tipado, deniegan permisos y muestran
un aviso cerrado de reiniciar núcleo/Hub/overlays de la misma build. La regresión
usa servidores en otro proceso y recoge sus hijos incluso ante fallo. Matrices de
credencial firmada y navegación cubren usuario, tester, owner y módulo comprado.

Evidencia externa: `C:/tmp/1470-evidence/f1-inicio.png` (HTML | GPUI), rondas 1–3,
1440x900/1920x1080/2560x1440, tema DeepSeek y Apariencia; imágenes inspeccionadas.
Las notas 21:20 y 21:40 están aplicadas. Estado mide su contenido; favorito compacto
no desborda; candado dentro del chip; actividad desplaza dentro de la tarjeta.
Los PNG muestran datos de QA explícitos del renderer vigente, no telemetría en vivo.
Solo `inicio-base` carga home-r7-launcher.json. Su app manual usa una ruta QA
inexistente y discovery no la marca launchable; no se usa en producto. Sin captura,
Inicio empieza vacío y recibe fotos IPC reales; no fabrica estado conectado ni CPU.
La ruta de captura queda detrás de parity-capture, omite login solo en --capture y
usa ventana exacta a DPI96; respeta pantalla-ocupada/mutex y solo recoge su instancia.
La ventana productiva conserva login verificado y usa mínimo 1280x800.

Paridad final del renderer Workshop/Standings: 0/292160 px, umbral por canal 0,
contra base nativa congelada a464e9fc; no certifica Wails ni chrome completo.
Fmt/check/clippy PASS; lifecycle 5+12 PASS. Nextest completo 1129/1129 PASS
(580,112 s; ACC 190308 fotos, 479,569 s), seis skips del filtro existente; los
dos binarios lifecycle se verifican por separado. Build prueba PASS, con un aviso
preexistente de cx sin usar en analysis/view.rs bajo parity-capture.
No se cambian el corpus ni sus expectativas; quedan registrados los dos fallos QA
corregidos (fixture de shell y nombre de tubería Feed), sin debilitar tests.

Siguiente: las seis pantallas de Fase 2 consumen esta API y Orbit. Sus vistas
anteriores no se declaran rediseñadas aquí. Verificar manualmente selección/reinicio
de tema, autoría JSON válida/parcial/recuperada, Ctrl+B/Ctrl+L, navegación por rol
y escalas Windows 125/150 %, todavía sin prueba física en esta campaña. No hay
medición de rendimiento LMU, build Release distribuible, push, PR, CI remota ni
promoción/release. docs/roadmap/plan.md no existe en esta base; comunicado al
orquestador, sin inventar un roadmap alternativo. La beta de Isaac permanece intacta.
## ISA-1470 — Fase 2, Ajustes y Cuenta (1470-ajustes)

Entrega aislada sobre `46244ea2`, rama `vantareapp/isa-1470-ajustes`, worktree
`C:/tmp/vw3-1470-ajustes/vantare-v2`. Sin cambios de IPC, permisos, dependencias
ni comandos de servicios. Ajustes ofrece General, Apariencia, Rendimiento en pista, Atajos,
Actualizaciones, Privacidad y Diagnóstico en la topbar; Cuenta es un destino
propio y Licencias se presenta dentro de Cuenta. Ambas pantallas usan layout C,
tarjetas neo y scroll independiente en contenido y carril.

General conserva los controles y añade grupos Overlays/Canal con preferencias
reales del layout y el mismo consentimiento de uso de Privacidad. Apariencia
presenta los cuatro temas productivos con miniaturas; mantiene guardado atómico,
contraste, opacidad y fuentes. Atajos muestra Ctrl L/K/B del Hub y la referencia
global pendiente. Rendimiento conserva los niveles de referencia; su tabla
anuncia objetivos pendientes y nunca los presenta como una política efectiva.
Actualizaciones conserva lectura local, novedades y reinicio de beta. Diagnóstico
conserva preparación, filtros y copia sanitizada. Cuenta conserva sesión y reset
de dispositivo, anuncia Beta para testers gratuita y Strategy/Engineer Próximamente
incluso con derechos firmados para esos módulos; la regresión cubre ese caso.

Los datos que el servicio no expone permanecen no disponibles. No se inventan
métricas, dispositivos, claves beta ni historial de envíos en producción. Exportar
y eliminar cuenta siguen pendientes de contrato nativo. El banco de capturas
continúa aislado por parity-capture/--capture --demo; no es telemetría LMU real.
Evidencia externa: `C:/tmp/1470-ajustes-evidence/`. Referencias rondas 6/7/8
inspeccionadas; comparaciones HTML/GPUI1920, capturas1440/2560 y DeepSeek1920
conservadas. Correcciones22:46: topbar sin ruta redundante y tabs con scroll
horizontal; buscador visible; hero con tokens del tema; Cuenta sin jerga ni
repetir el título beta. Novedades/aporte omitidos sin datos reales en ese contrato.
Orbit admite ruta vacía sin alterar otras pantallas. Gates del árbol conjunto final,
siempre por cola y -j2: fmt PASS, check PASS10,31s, Clippy PASS22,79s;
Nextest1130/1130,6 skipped existentes (compilación3m30s, ejecución813,607s);
lifecycle5+12 casos PASS. Buildprueba con parity-capture PASS25s; conserva el
warning heredado de analysis/view.rs:989 (cx sin usar, solo con esa feature).
El destino legacy Licencias también se capturó dentro de Cuenta. Cuatro temas y
detalle1440 de fuentes/animaciones/eventos inspeccionados. No se afirma paridad
exacta, runtime de servicios con sesión real ni rendimiento LMU live. No se
corrieron gates Go/frontend porque no se tocaron sus fuentes/contratos.
Siguiente acción: revisión del orquestador y verificación manual de sesión,
consentimiento, diagnóstico y actualizador en una instalación QA aislada.

`docs/roadmap/plan.md` no existe en esta base; coordinación del roadmap a cargo
del orquestador. No hay push, PR, CI remota, merge, promoción ni release. La beta
de Isaac no se ha tocado.

### #1470 · Worker Launcher · Fase 2 (2026-10-05)

Worktree `C:/tmp/vw3-1470-launcher/vantare-v2`, rama
`vantareapp/isa-1470-launcher`, base `46244ea2`. Entrega aislada, sin integración.
Escaparate favorito con tarjetas de apps y portadas de perfiles; al lanzar,
el mismo contenedor muestra línea de tiempo/progreso y el carril derecho refleja
los últimos eventos reales por paso. La barra compartida conserva N de M.
Administración anterior accesible desde «Aplicaciones · Historial» y «Ver todas»;
se conservan editor, detección/rutas, alta manual, estadísticas, diagnóstico,
reintentos, políticas y propiedad de procesos. Selección por teclado y toggles
con Enter/Espacio; dropdown usa el foco/teclado existentes de Orbit.

Opciones guardadas por perfil; durante el lanzamiento se aplican la próxima vez.
No se promete minimizar ventanas ni cerrar apps al cerrar LMU: `exit` significa
salir de Vantare. La transición es básica; animaciones finas siguen pendientes.
API compartida pequeña: `orbit::Choice::compact(width)` y cinco gradientes de app
en `vantare_ui::theme`, con defaults compatibles y validación RGB.
No se añade dependencia ni cambia motor, IPC, auth, permisos o servidor.

Escenas QA nuevas `launcher-reposo`/`launcher-lanzando`, aisladas en
`launcher-r7.json`; bloquean ejecución de procesos y usan detección QA lista.
No cambian `inicio-base` ni datos productivos. Capturas externas HTML|GPUI,
1440/1920/2560 y DeepSeek en `C:/tmp/1470-launcher-evidence/`, inspeccionadas.
Se aplicaron las seis notas 22:25. No se afirma paridad exacta por píxel,
ejecución física LMU/OBS, rendimiento, DPI 125/150 ni animaciones finales.

Verificación manual pendiente de Isaac/orquestador: abrir Launcher, elegir otro
perfil, editar y guardar; variar opciones y comprobar persistencia; lanzar con
apps reales y observar N de M/reintentos/cancelación; volver a administración y
probar búsqueda, rutas, detección y teclado. `docs/roadmap/plan.md` sigue ausente
en esta base, ya comunicado; no se crea una fuente de roadmap alternativa.
Gates finales: fmt/check/clippy PASS; nextest 1137/1137 PASS (834,701 s),
seis skips del filtro existente; lifecycle 5+12 PASS. Build prueba PASS
(32,52 s), con el aviso preexistente cx sin usar en analysis/view.rs:989.
Ocho capturas finales inspeccionadas, HTML|GPUI y ronda-4 antes/después.
Logs closure-* y build-final.log en la carpeta externa; git diff --check PASS.
El commit local queda identificado en el informe del worker. Sin push/PR/CI remota,
merge, promoción ni release; beta de Isaac intacta.

### ISA-1470 - Fase 2, Studio (2026-10-05)

Worker `1470-studio`, worktree `C:/tmp/vw3-1470-studio/vantare-v2`, rama
`vantareapp/isa-1470-studio`, base `46244ea2`. Studio adopta la distribución C:
barra superior de layout/modo/guardado/OBS, lienzo flexible 16:9 con selección y
medidas, tira horizontal de widgets, catálogo existente y barra Probar con.
Inspector Contenido/Apariencia/En pista/Posición y tamaño, con OBS en la última
tarjeta y scroll interno para los ajustes largos. La shell cambia solo su
geometría Studio. Orbit y tokens compartidos; sin renderer ni dependencia nueva.

Se conservan documento, persistencia atómica, historial, añadir/duplicar/eliminar,
orden Z, visibilidad, búsqueda (al abrir el catálogo), ajustes productivos, zoom y
drag de CanvasFrame con commit al soltar/cancelación al perder foco. Las nuevas
regresiones verifican arrastre ajustado, disco/reapertura, undo a tres tamaños,
cobertura de ejemplos y separación de la fuente real.

Notas del orquestador 22:40 aplicadas: nombres legibles en Kind::label sin cambiar
IDs; Checkbox::switch reutiliza el interruptor Orbit y el mismo evento Checked;
Opacidad es slider 0–100 %. Sin caja vacía ni jerga de Snapshot/QA en la UI.
Ejemplo usa las 18 muestras existentes incrustadas, exclusivamente al seleccionarlo;
En vivo utiliza la última foto real, incluso tras recibir datos en modo Ejemplo.
Esta excepción explícita del orquestador prevalece sobre la restricción inicial
del brief a fixtures QA. No se introduce fallback ni se altera el documento.

Límites previos comprobados: no hay dimensiones persistidas/resize libre nativo,
servidor Browser Source/publicación OBS, control del overlay desde Hub, varios
layouts ni escenarios productivos. Esos controles están deshabilitados con motivo
accesible. OBS conserva las instrucciones de captura de ventana. Las posiciones
iniciales de la escena de revisión son solo parity-capture y --capture/--demo.
No se toca la beta de Isaac ni sus datos. No se afirma rendimiento ni LMU live.

Capturas revisadas 1440/1920/2560 y tema DeepSeek Harness. Comparación HTML|GPUI:
`C:/tmp/1470-studio-evidence/studio.png`; antes/después: `ronda-3.png`.
Gates finales PASS: fmt, check, Clippy, Nextest 1132/1132 (6 excluidos por la
configuración existente) y lifecycle sin fallos. Compilación Prueba PASS; aviso
previo de cx sin usar en analysis/view.rs solo bajo parity-capture, fuera del
bloque. El SHA local de esta entrega se registra en el informe del orquestador
y en la issue. Regresiones adicionales de Ejemplo validan datos Fuel/Delta y
la separación de la fuente real. No se ejecutan gates Go/frontend porque no
cambian esos componentes. Prueba física LMU/OBS y escalas Windows 125/150 %
pendientes; la captura QA no las demuestra. plan.md no existe en esta base; límite
registrado por el orquestador, sin crear otra fuente manual de roadmap.
Sin push, PR, CI remota, merge, promoción ni release.


### ISA-1470 - Fase 2, Testing Center (2026-10-05)

Worker `1470-testing`, rama `vantareapp/isa-1470-testing`, base `46244ea2`.
Testing Center usa las tarjetas neo y el layout C de F1: formulario y Mis
informes a la izquierda; recibos de sesión, conversación pendiente y ayuda a
la derecha. Conserva el candado de tester/owner y el mensaje del shell para
otros roles. Las pestañas y las herramientas locales existentes siguen disponibles.

El contrato nativo v1 exige acción, esperado y observado: el título usa acción,
el texto usa observado y se mantienen esperado/contexto. El tipo se codifica
explícitamente en contexto, sin ampliar el protocolo. El editor conserva el
texto al cambiar de tipo. Versión/equipo siguen añadidos por el servicio; la
etiqueta muestra la build/OS actuales. No se habilitan registros: el servicio
rechaza ese adjunto, de modo que la UI dice Próximamente. Capturas JPEG, vista
previa y quitar conservan prepare -> upload -> finalize -> attach, consentimiento
e invalidación de la vista previa ante una edición. No se modifica el backend.

Mis informes contiene exclusivamente recibos reales obtenidos al enviar o
recuperar un intento durante la sesión. Deduplica por report_id, conserva título,
módulo, fecha y estado del servidor; submitted se presenta como Enviado. No
retiene una segunda copia del cuerpo privado ni adjuntos y se vacía al salir.
No hay consulta de historial/cambios posteriores ni conversaciones en este
servicio: se indica el límite y no se fabrican estados, métricas o respuestas.

API genérica mínima añadida a Orbit: Input::with_height mantiene edición,
selección e IME; neo_page_header y neo_context_column alinean las pantallas beta;
neo_accent_card permite un acento de fondo suave con tokens del tema.

Evidencia externa: C:/tmp/1470-testing-evidence/, primeras capturas conservadas,
1440x900/1920x1080/2560x1440 y DeepSeek Harness. Imágenes inspeccionadas; la captura
muestra un formulario real vacío y cero recibos, sin acceso a datos de Isaac.
A 1440 la lista inferior se alcanza por scroll o por la pestaña Mis informes.
Build prueba final, fmt/check/clippy -Dwarnings PASS. Nextest workspace
1132/1132 PASS (6 skips del filtro existente, dos binarios lifecycle separados):
compilación 3m28s y ejecución 718,168 s; corpus ACC 597,771 s, sin reducirlo.
Lifecycle 5+12 PASS. Tres regresiones nuevas PASS: tipo, recibos y calendario.
No es una medición de rendimiento LMU. Build captura tiene el aviso preexistente
de cx sin usar en analysis/view.rs bajo parity-capture, sin cambios en ese archivo.
La incidencia os error 112 quedó resuelta al liberar espacio el orquestador
(nota 23:56). La política rechazó borrar caché propia; el worker no borró nada
ni cambió de método. No push/PR/merge/release. E2E servidor con usuario real,
teclado/IME y DPI físico pendientes: se conserva native-beta intacta.


### ISA-1470 - Fase 2, Calendario (2026-10-06)

Mismo worker/base que Testing Center. Próximas usa el catálogo oficial local,
la recurrencia UTC y el seguimiento persistido existentes. Añade filtros por
clase/nivel, una salida por serie, cuenta atrás de la siguiente serie seguida,
tabla con scroll propio y carril de semana/vigencia/series seguidas. Fecha y hora
se convierten a la zona real del equipo, sin afirmar Europe/Madrid por defecto.
Día/Semana/Mes/Timeline conservan su contenido, navegación y tests; se retiran
las compensaciones geométricas de la cabecera antigua y se usan tarjetas neo.
El reloj productivo notifica cada 30 s y se recoge al desaparecer la entidad.

Seguir guarda la selección local con la detección de conflicto existente; no
promete avisos. Recordatorios, sonido y lanzamiento automático no tienen
servicio nativo: aparecen Próximamente. Actualizar horario conserva la recarga
del archivo oficial local, sin red nueva ni horario fabricado. El seed empaquetado
es de 25 agosto -> 1 septiembre 2026: está caducado para la beta de octubre. La
pantalla lo declara y no muestra sus carreras como salidas actuales. Renovar
el catálogo oficial corresponde al responsable del servicio/calendario.

Escena calendario-beta-archivo detrás de parity-capture: catálogo archivado
real, reloj QA dentro de esa publicación y una selección semanal explícita.
Su carril indica QA / reloj congelado / no es el horario actual. No modifica
el reloj ni los datos productivos. Capturas a 1440/1920/2560 + DeepSeek Harness,
Semana y catálogo caducado inspeccionados. HTML|GPUI en
C:/tmp/1470-testing-evidence/calendario.png; ronda-2.png conserva antes/después.
No certifican paridad pixel exacta, calendario actual ni rendimiento LMU.

Árbol final de ambas pantallas: fmt/check/clippy -Dwarnings, build prueba,
Nextest1132/1132 (6 skips del filtro existente) y lifecycle5+12 PASS. Tres
regresiones nuevas PASS. Compilación test3m28s / ejecución718,168s / ACC597,771s.
Incidencia disco resuelta por el orquestador, sin borrado por el worker.
No se debilita corpus ni expectativas. Logs finales en la carpeta de evidencia.

Verificación manual pendiente del orquestador: rol tester/owner y usuario sin
rol; envío real de un informe con captura/quitar/consentimiento; recuperación
tras reinicio; filtros y seguimiento con catálogo oficial renovado; teclado/IME,
scroll a 1440 y DPI 125/150 %. La beta native-beta de Isaac permanece intacta.
No build Release distribuible, push, PR, CI remota, merge, promoción ni release.
plan.md no existe en la base; la coordinación del roadmap queda en el orquestador.


### ISA-1470 - Fase 2, Roadmap y Notificaciones (worker 1470-roadmap, 2026-10-06)

Bloque entregado localmente en `vantareapp/isa-1470-roadmap`, worktree
`C:/tmp/vw3-1470-roadmap/vantare-v2`, base `46244ea2`.
Roadmap: commit `c8635b58`. Notificaciones: segundo hito local de esta entrega;
los SHAs completos están en el informe externo y la issue1470.
Roadmap para todos los usuarios del Hub, conservando login/política:
fase/fases, tablero Ahora/Siguiente/Más adelante filtrable, áreas y entregas.
JSON manual `native/hub/roadmap/roadmap.json`, esquema y parser/tests estrictos,
incorporado al compilar. Comparte `schemaVersion/items/Localized` con la
publicación del servicio; conserva su acceso, scroll y cabecera correcta.
Textos públicos; porcentajes editoriales provisionales según nota00:10:
fase75, Hub80, Overlays/Launcher75, Módulos25. Isaac los ajusta; no telemetría.
ClickUp no conectado. Esta base no contiene docs/roadmap/plan.md; el
orquestador coordina su actualización antes de integrar. Digest intacto.

Campana sobre Center: contador, filtros, grupos civiles Hoy/Ayer/Esta semana,
con antiguos/sin fecha, acciones cerradas, lectura individual/todas y vacío.
Fechas convertidas por zona local de cada evento, incluido DST. Se conserva
historial local de sesión máximo50, dismiss/foco, navegación y centro completo.
Beta oculta sin acceso tester/owner; todavía sin productor Beta real conectado.
Orbit solo añade geometría opcional Layer::with_popover_size, defaults intactos.
Fixture/reloj QA solo en capturas explícitas con parity-capture; test de frontera
asegura que notificaciones-panel es la única escena que recibe los avisos QA.

Gates del árbol de trabajo completo antes de dividir commits por pantalla:
fmt/check/Clippy PASS; Nextest1137/1137 (598.791s,6 omitidos por configuración
vigente, incluidos casos manuales/live), lifecycle19/19 y JSON Schema PASS.
Ocho tests añadidos; regresiones existentes conservadas/adaptadas a grupos de fecha.
BuildQA prueba/parity PASS; aviso previo analysis/view.rs989, fuera de alcance.
Evidencia `C:/tmp/1470-roadmap-evidence/`: capturas1920/1440/2560/DeepSeek1920
miradas, comparativas HTML/GPUI, mapas, recortes, hashes y verificación manual.
Defecto conocido: manchas del borde/sombra del popover en PNG nativo;
recorte ampliado defecto-sombra-popover.png. Nota00:33 lo acepta para revisión
visual posterior y prohíbe tocar el renderer ahora; causa no confirmada.
No se afirma paridad de datos/píxel, interacción física, escala125/150,
LMU live ni rendimiento. Beta/datos de Isaac intactos. Sin Go/frontend tocados.
Issue1470 actualizada; sin push, PR, CI remota, merge, promoción ni release.
Siguiente: review visual/integración por el orquestador y aceptación de Isaac.

### ISA-1470 — Fase 3, unión local del Hub (1470-union, 2026-10-06)

Base `46244ea28265184f43f92066eadfcd135c088912`; rama
`vantareapp/isa-1470-hub-rediseno`, worktree `C:/tmp/vw3-1470/vantare-v2`.
Uniones locales por orden: Ajustes/Cuenta `00d56019` (fuente `864f8ddb`),
Launcher `a4225388` (`6b21d1b5`), Studio `b41caef1` (`716e563a`),
Testing/Calendario `8527a247` (`e34f10cb`) y Roadmap/Notificaciones
(fuente `564134a6`, autorizada por nota00:38). Cada hito anterior pasó
fmt/check/clippy y Nextest excluyendo solamente el golden ACC según el brief:
1129, 1137, 1140 y 1143 tests PASS, respectivamente; siete skips con ese filtro.

Conflictos resueltos conservando todas las entradas del handoff y escenas QA.
Shell conserva pestañas Ajustes, Testing y Calendario; Studio mantiene sus acciones
en el contenido e inspector condicional. Launcher, Cuenta, Ajustes, Studio y
Roadmap conservan su scroll y carril propios. Retirado el último margen legacy
135 px al unir Roadmap: las demás pantallas ya lo retiraron en sus entregas.
Choice::compact, Checkbox::switch, Input::with_height y geometría opcional del
popover conviven sin renderer duplicado. El primer Clippy de Launcher detectó
ramas idénticas: se agruparon los destinos equivalentes y se repitieron los gates.
No dependencias, contratos IPC, Go, frontend, workflows ni release modificados
por la resolución de unión.

Evidencia exclusivamente externa `C:/tmp/1470-union-evidence/`. Capturas QA
aisladas, no LMU live ni prueba de rendimiento, permisos reales o servicio remoto.
Calendario declara el catálogo oficial caducado; archivo QA explícitamente
rotulado. Workshop/Analysis siguen ocultos y Strategy/Engineer bloqueados en beta.
La sombra exterior de la campana tiene manchas conocidas en la entrega aislada;
nota00:33 del worker Roadmap las acepta para revisión posterior, sin tocar renderer.
Studio conserva el recorte previo dentro de la tarjeta Apariencia.
`docs/roadmap/plan.md` no existe en esta base: el orquestador coordina su actualización
antes de integrar; no se inventó otro roadmap. Checkout principal y native-beta
Isaac intactos. Sin push, PR, CI remota, promoción, merge remoto ni release.

Gates finales del árbol completo: fmt PASS; check13,26s y clippy16,60s
-Dwarnings PASS; Nextest1152/1152 PASS (572,438s de ejecución, seis skips
configurados, sin filtro adicional; golden ACC475,400s PASS); lifecycle5+12
PASS; build prueba/parity-capture23,44s PASS. Compilación siempre por
C:/tmp/fase2/compilar.ps1, target propio, -j2. El build QA conserva el aviso
preexistente unused cx en analysis/view.rs989; Clippy ordinario sin warnings.

Final/: 28 capturas1920x1080 (27 Grafito carmín + Inicio DeepSeek), todas
MIRADAS, junto con resumen-hub.png y ronda-3.png. Ajustes7/Cuenta/Studio,
Testing3/Calendario3 comparables y Roadmap:16 imágenes0px frente a la ronda
anterior o entrega aislada. Launcher2 e Inicio/DeepSeek cambian únicamente las
fechas relativas después de medianoche: su historial usa Local::now existente,
no el reloj congelado del capturador. Campana2 conserva panel interior0px;
el fondo recibe los iconos compartidos de Launcher y el vacío tiene3 píxeles
de variación en sombra externa. detalle-diferencias.png y JSON comparables
conservan evidencia, sin afirmar0px para toda la imagen. Guard Engineer con
franja blanca y Workshop blanco son estados QA de destinos bloqueados/ocultos,
no certificación de sus módulos. strategy-base es una escena retirada: intento
rechazado registrado; no se añadió para forzar la captura.

Standings final: compare.ps1 con binario prueba compilado previamente en cola,
0/292160px, threshold0/maxpercent0/delta0 contra baseline nativa F1;
captura/base/diff MIRADOS. No es comparación Wails ni LMU live.
No frontend/Go/Release/CI remota ejecutados: ajenos al brief/local-only.
Verificación manual pendiente: abrir esta build con datos aislados, recorrer
cada destino y siete pestañas de Ajustes, cambiar tema, abrir/cerrar campana,
scroll por tarjetas, rol no-tester y DPI125/150. Servicio real de Testing y
catálogo renovado requieren campaña propia. Revisar el mosaico y capturas
antes de aceptar o autorizar promoción. Entrega terminada localmente;
revisión del orquestador/Isaac e integración de canal pendientes.

## 2026-10-06 — #1470 contenido de pantallas, entrega aislada

Worker `1470-fix-textos`, worktree `C:/tmp/vw3-1470-fix-textos/vantare-v2`,
rama `vantareapp/isa-1470-fix-textos`, base `e264cf435b5f41af306174c3d8ba7026573ef6ac`.
Contenido del Hub revisado para clientes: mensajes y diagnóstico en español,
sin nombres de componentes ejecutables, identificadores de informes o notas
internas de releases en sus pantallas habituales. Los nombres de producto
Standings, Relative, Fuel y stint, Overlay Studio, Testing Center y los canales
Nightly/Testers se conservan por indicación del orquestador. No se modifican
identificadores persistidos, permisos, contratos IPC ni las notas originales.

Cuenta y Validar llenan las columnas; Ajustes tiene carriles específicos por
subpágina, Atajos utiliza todo el ancho y alto, Rendimiento reserva espacio para
su tabla, y Diagnóstico para el registro. Cada página mantiene el alto completo
y desplaza su propio contenido sobrante, con el mismo control de desplazamiento
del panel, sin reglas especiales por subpágina. La captura de detalle
de Diagnóstico verifica que se alcanza la octava fila a 1920 y 1440.
Equilibrado coincide con la tarjeta y punto seleccionados en el ejemplo QA;
Automático queda sin marcar y anunciado como pendiente. En producto, donde no
hay nivel confirmado, no se inventa una selección activa.

Versión instalada: `product::VERSION` de packaging es la única fuente, presentada
mediante `version_label()`; `0.0.0` se muestra como «Versión local». Las versiones
históricas de las notas y del contenido original de un envío no se sustituyen.
Actualizaciones usa 17 resúmenes para clientes en
`native/hub/src/settings/customer-news.json`, con tipos Nuevo/Mejora/Arreglo.
Las próximas entregas deberán añadir allí su resumen para clientes; nunca se
vuelca automáticamente el cuerpo técnico de una release beta. El documento local
`native/hub/roadmap/roadmap.json` recibe únicamente cuatro correcciones de texto;
no cambian estados, porcentajes ni alcance. `docs/roadmap/plan.md` sigue ausente
en esta base: su actualización queda coordinada por el orquestador al integrar.

La vista previa del informe muestra etiquetas legibles y el contenido privado
original aprobado, también al reintentar. Consentimiento y envío permanecen
intactos. Un formato inesperado conserva el payload real anterior como vista
de revisión, para no ocultar lo que se enviaría. Regresiones para resúmenes de
versiones, búsqueda de errores en español y preservación de ese contenido.

Validación local: fmt/check/clippy -Dwarnings PASS; Nextest workspace
1153/1153 PASS, seis skips configurados, sin filtro adicional (707,676 s de
ejecución; ACC 587,652 s). Después de los últimos ajustes exclusivamente de
presentación se repite Hub: 272/272 PASS. Lifecycle: cinco y doce tests PASS.
Build prueba/parity PASS; conserva únicamente el aviso previo unused cx en
`analysis/view.rs:989`, exclusivo de esa configuración QA. Compilación por
`C:/tmp/fase2/compilar.ps1`, target propio y -j2. El primer test de búsqueda y
Clippy fallaron durante la iteración: se corrigieron sin cambiar tests ni añadir
excepciones a lint, y se repitieron los checks.

Evidencia externa `C:/tmp/1470-fix-textos-evidence/`: primeras capturas,
29 estados finales (18 a 1920x1080 y 11 a 1440x900), galerías MIRADAS,
`ronda-1.png` antes/después, mapas de diferencias visuales, logs y hash del
binario QA. No es prueba de paridad pixel a pixel, LMU live, rendimiento,
permisos reales, servicio remoto ni publicación. La captura «diagnostico-detalle»
es desplazamiento del registro; no simula pulsar Preparar ni certifica ese flujo.
No Go/frontend/release/CI remota ejecutados: ajenos a este cambio local.

Verificación manual pendiente de aceptación: recorrer Cuenta, Validar y las
siete páginas de Ajustes a ambos tamaños; bajar hasta el final de General,
Rendimiento y Diagnóstico, comprobar carriles distintos, versión instalada,
Automático sin seleccionar y textos del informe antes de consentir. Revisar
también Novedades y los nombres de producto conservados. DPI125/150, cuenta
real, preparar/copiar diagnóstico y envío remoto requieren comprobación física.
Checkout principal y native-beta Isaac intactos. Entrega local para revisión,
sin push, PR, CI remota, merge, promoción ni release.
### ISA-1470 — Fase 3, componentes y detalles visuales (1470-fix-componentes, 2026-10-06)

Worker de implementación en `vantareapp/isa-1470-fix-componentes`, worktree
`C:/tmp/vw3-1470-fix-componentes/vantare-v2`, base `e264cf435b5f41af306174c3d8ba7026573ef6ac`.
Alcance cerrado: página Próximamente Strategy/Engineer sin acción y rutas Hub ocultas
Workshop/Analysis; Apariencia crece sin recortar controles (las otras tarjetas conservan sus límites); secundarios pill y chevron SVG;
contador separado en campana (también Studio), selección de Ajustes/Cuenta; conectores
horizontales continuos del Launcher, iconos en baldosa y clases/niveles de Calendario.
No cambia permisos del núcleo, servicios, catálogo ni datos del usuario.
Estado: terminado localmente; revisión e integración pendientes. Primer commit de
componentes/rutas `8ea77958a63bd7d2f1a53034da091663c158baa2`; segundo commit Launcher/Calendario/docs en HEAD
(consultar `git log -2`; SHAs finales en informe externo y comentario de #1470).
Gates del árbol final: check PASS12,10s, clippy -Dwarnings PASS14,50s,
Nextest1153/1153 PASS (6 tests y 2 binarios omitidos por configuración del repo),
lifecycle PASS17/17 (5 Hub + 12 UI); fmt/diff-check y schema del fragmento PASS.
Build prueba/parity-capture PASS36,26s; conserva el warning previo de `cx` no usado
en analysis/view.rs bajo esa feature. No se amplía el alcance para eliminarlo.
24 capturas1920/1440 MIRADAS; antes/después `C:/tmp/1470-fix-componentes-evidence/ronda-1.png`.
Apariencia ya muestra ambos selects completos; conexiones continuas sin verticales,
iconos y chips de clase/nivel legibles. Workshop/Analysis arrancan en Inicio;
regresión de navegación PASS también con permisos concedidos. Escenas QA aisladas,
no evidencia de LMU o servicios reales. No se renueva el catálogo del calendario.
Verificación manual: pulsar Estrategia/Ingeniero; revisar Apariencia y desplegables;
marcar avisos y comprobar contador; entrar en Ajustes/Cuenta; lanzar perfil,
revisar conectores e iconos; filtrar clases/niveles del Calendario a1920 y1440.
Coordinar al unir: settings/view.rs tiene solo dos glifos aprobados por nota01:09;
chrome.rs no modifica la fuente de versión del otro worker. El fragmento ISA-1470.json
contiene solo este bloque y se combinará con la entrega paralela. plan.md ausente en
esta base, ya registrado por 1470-union; no se crea otro roadmap. Sin push, PR,
CI remota, merge, promoción ni release. Siguiente: revisión del diff/capturas por el orquestador/Isaac y unión aislada.

### ISA-1470 — Ronda 2 de componentes (2026-10-06)

Misma rama/worktree `vantareapp/isa-1470-fix-componentes`; entrada `cd763fd1128fbac795c54f1b198dbdd908f38def`.
Corrección solicitada por revisión: Ingeniero/Estrategia ahora heredan el alto disponible,
con cabecera icono/título/estado, tres tarjetas específicas y bloque «Síguelo en el Roadmap»
con navegación real. Textos breves, sin fecha ni compromiso concreto.
Studio conserva scroll para propiedades y fija OBS debajo: texto y botón completos
sin desplazarse a 1920×1080 y 1440×900; no cambia controles, permisos ni persistencia.
Regresión de rutas comprueba Roadmap con acceso verificado y conserva el bloqueo sin verificar.
Ocho capturas MIRADAS (seis de distribución y dos de interacción QA); antes/después
`C:/tmp/1470-fix-componentes-evidence/ronda-2.png`. Clic real en Ver Roadmap y rueda
hasta Posición y tamaño PASS1440. Escenas QA aisladas; sin prueba de LMU/servicios reales.
Gates R2: check PASS9,82s; clippy -Dwarnings PASS13,05s; Nextest1153/1153 PASS670,495s
(6 omitidos por configuración); lifecycle17/17 PASS; fmt/diff-check PASS.
Build prueba/parity PASS18,92s; warning previo de cx en analysis/view.rs solo en parity.
Fragmento ISA-1470 actualizado, schema PASS. No dependencias nuevas ni cambios fuera de estos dos defectos.
Siguiente: revisar el commit R2 y unir la entrega aislada. Sin push, PR, CI remota,
merge, promoción o release. plan.md ausente en esta base; no se crea otro roadmap.

### #1470 — Unión de textos y componentes (1470-union2, 2026-10-06)

Base e264cf43, merge textos 47b420e2 (0830113a) y componentes 1dfef24d.
Handoff combinado conservando las dos entregas, sin duplicar entradas. Código
compartido fusionado automáticamente y revisado; textos conservados junto a
las páginas Próximamente, OBS fijo y controles/componentes. Fragmento ISA-1470
combinado con ambos alcances. Validación final y corrección Roadmap a continuación.
Merges exclusivamente locales autorizados por Isaac; sin push ni promoción.

### #1470 — Roadmap restaurado y validación unión2 (2026-10-06)

Merges locales autorizados: textos 47b420e2 desde 0830113a; componentes
0ddc4a96 desde 1dfef24d. Se conserva TODO el código de textos y la estructura
/componentes; único conflicto en el handoff, conservando ambas entradas.
Fragmento ISA-1470 combinado sin duplicados. El commit posterior restaura
«Roadmap» en Section::label y el título de página; búsqueda/miga consumen esa
misma etiqueta. Actualizaciones conserva «Notas de versión» y sus novedades.
Regresión de búsqueda/miga y navegación beta PASS.

Gates del código final: fmt PASS; check8,48s y clippy13,86s -Dwarnings PASS;
Nextest1155/1155 PASS (610,592s, seis skips configurados; ACC501,262s PASS);
lifecycle5+12 PASS. Compilación SOLO por C:/tmp/fase2/compilar.ps1, -j2 y target
propio native/target/gates. Build prueba/parity-capture35,12s PASS; conserva
aviso previo unused cx analysis/view.rs989 exclusivo de captura. Los gates
ordinarios no tienen warnings. No se repiten gates completos tras documentación:
el código final conserva los hashes de la ejecución validada.

Evidencia externa C:/tmp/1470-union2-evidence/: 35 capturas1920x1080 del tema por
defecto Grafito carmín, todas MIRADAS en galerías1–9 y capturas ampliadas;
resumen-hub.png y ronda-1.png antes/después MIRADOS, mapas1–9 y JSON comparables.
Sin regresiones visuales atribuibles al merge observadas. Launcher2 e Ingeniero
/Estrategia0px frente a componentes; Studio cambia solo el texto OBS de textos.
No se afirma0px para todo el Hub. Rutas beta ocultas (Workshop/Analysis/Licencias
separada) arrancan en Inicio: no certifica sus módulos. Calendario conserva el
catálogo caducado y la escena archivada explícita; no se renueva su horario.

Standings compare.ps1: 0/292160px, threshold0/maxpercent0/delta0 frente a baseline
nativa F1, binario prueba previamente compilado por cola; base/captura/diff
MIRADOS. No es paridad Wails ni prueba LMU live o de rendimiento.
Intento adicional de interacción con helper Hidden falló antes del PNG por no
presentar ventana detectable; cerrado solo el proceso propio y su helper.
Reintento con ventana normal por indicación del orquestador PASS: clic real desde Ingeniero abre Roadmap y rueda del inspector Studio llega a Posición y tamaño con OBS fijo. Ambas capturas1920 MIRADAS; 37 capturas en total. El fallo Hidden queda conservado en la evidencia.

Manual: abrir el Hub con datos aislados; recorrer las siete pestañas de Ajustes,
Launcher2, Cuenta, Testing3, Calendario5, campana y búsqueda; pulsar Ver Roadmap,
confirmar nombre en menú/miga/título y desplazar inspector con OBS fijo.
Pendientes DPI125/150, cuenta/servicios reales y aceptación Isaac/orquestador.
plan.md sigue ausente en esta base; coordinación pública pendiente del orquestador.
Sin frontend/Go/Release/CI remota: fuera del brief. Sin push/PR/promoción/release
ni merges externos. Checkout principal y native-beta Isaac intactos.

### #1470 — Ronda 3 · pantallas (2026-10-06, entrega local)

Worker `1470-r3-pantallas`, rama `vantareapp/isa-1470-r3-pantallas`, base
`13ae6945524b1b33dbd73b8df1ee2ae758707e7b`. Solo la lista de pantallas del brief
`C:/tmp/beta/r3/w15-arreglos-r3.md`; componentes/scroll en otro worktree.

Implementación: identidad de paquete visible en topbar, General y Actualizaciones,
notas sin salto en la versión y pills del kit; Rendimiento sin «Activo ahora»;
Inicio con buscador normal/separado, estados con pills, lanzamientos como actividad,
indicadores sin cifras inventadas y acciones de Overlay de ancho por contenido.
Estrategia/Ingeniero: tarjetas a altura natural con iconos propios y descripción,
póster sobrio inferior que compone el alto. Consentimiento: cuerpo 14 px, dos
columnas y viñetas. Launcher muestra nombres del catálogo/perfiles personalizados,
abre Aplicaciones y titula «Nuevo perfil» cuando todavía no existe el perfil.
Roadmap presenta fechas españolas con año. General explica funciones pendientes.
Calendario: la etiqueta QA está confinada al constructor demo/escena archivada y
`parity-capture`; no hay cambio de catálogo. Según nota 03:01 se conserva el nombre
«DeepSeek Harness» en el selector, sin cambiar ID, tema ni persistencia.

Gates finales PASS: fmt, check (36,63 s), clippy con -D warnings (125,4 s),
nextest (1157 passed, 6 skipped; 993,6 s con compilación) y lifecycle (5 + 12
casos, sin fallos; 32,85 s). QA prueba/parity-capture PASS (36,77 s), identidad
verificada `Vantare Native 0.1.0-beta.1 (testers)` mediante VANTARE_VERSION y
VANTARE_BUILD_CHANNEL, sin modificar Cargo.toml. Único warning heredado del
build parity: analysis/view.rs:989, fuera de alcance; gates ordinarios limpios.
35 pantallas preliminares de 1440 inspeccionadas, además de las 10 modificadas
a 1920. La recaptura completa sobre HEAD y sus hashes se registra en el canal
y manifiesto externos al cerrar la entrega; no es prueba de runtime LMU, DPI
125/150 ni CI remota. Cortes heredados de listas/scroll son del worker común.
Evidencia y canal: `C:/tmp/1470-r3-pantallas-evidence/` y
`C:/tmp/fase2/informe-1470-r3-pantallas.md`. `docs/roadmap/plan.md` sigue ausente en
esta base; su coordinación queda al orquestador, sin inventar otra fuente pública.
Sin dependencias nuevas, frontend, Go, push, PR, merge, promoción o release.

### #1470 — Ronda 3, componentes comunes (1470-r3-comunes, 2026-10-06)

Worker aislado en `vantareapp/isa-1470-r3-comunes`, base `13ae6945524b1b33dbd73b8df1ee2ae758707e7b`.
Alcance: barra/topbar comunes, botones por contenido, desvanecido de scroll,
rótulos sin mayúsculas forzadas, sans para interfaz y display para KPIs.
La barra mantiene las filas de navegación/perfiles a su alto real y desplaza
la lista completa antes del pie fijo; Lanzar es neutro y muestra Ctrl L.
Los contadores de Launcher/Perfiles salen de perfiles guardados, Tester del acceso.
Nota 03:11: Roadmap sin indicador en beta; Testing sin contador sin fuente real.
Sin cambios de textos/contenido del worker paralelo ni de servicios/permisos.
La comprobación con rueda real a 1440 detectó y corrigió también el carril de
Atajos (Ctrl B fuera de tarjeta) y tarjetas finales Canal/Historial de borrado
reducidas al encabezado: se conserva su alto intrínseco, sin cambiar contenido.
Build prueba/parity por cola PASS (11 exe + duckdb.dll); warning heredado de
analysis/view.rs:989 con parity-capture. check/clippy/fmt PASS, Nextest1155 PASS,
6 skips existentes, corpus ACC completo PASS568,646s. Lifecycle final falló una
vez en alive(pid39296) de engineer_restart_budget; repetición completa PASS
(5 Hub + 12 runtime), sin modificar tests. Intermitencia fuera de alcance en
#1476, area:plataforma y Project Vantare; causa no demostrada, logs conservados.
30 capturas (15 pantallas × 1920/1440) y 19 de rueda real a 1440 MIRADAS,
ronda-4.png y detalle-scroll.png MIRADOS; dimensiones/hash PASS. EXE SHA256
33C6A4E02E0A2011258C9B9421C126FC13701E49C1B28A22F853422AC8231266.
QA a DPI96; sin certificación DPI125/150, LMU live ni igualdad total del Hub.
Evidencia externa `C:/tmp/1470-r3-comunes-evidence/`, canal del orquestador
`C:/tmp/fase2/informe-1470-r3-comunes.md`. Aceptación del orquestador pendiente.
No se añaden tests que repitan estilos: se usan los suites existentes y capturas
nativas con rueda real; escenas demo son QA visual, no evidencia LMU live.
Chevrons ya corregidos en base/ronda 2: se verifican sin duplicar implementación.
Los tokens de `vantare_ui::theme` ya separan body/display/mono; se corrigen los
consumidores que usaban mono para texto, sin alterar esquema ni temas de widgets.
`plan.md` ausente en esta base; no se crea otro roadmap. Sin push, PR, CI remota,
merge, promoción ni release. No se toca la beta de Isaac ni el checkout principal.

### #1470 — Unión ronda 3 (1470-union3, 2026-10-06)

Base limpia `13ae6945524b1b33dbd73b8df1ee2ae758707e7b`, misma rama aislada
`vantareapp/isa-1470-hub-rediseno`, worktree `C:/tmp/vw3-1470/vantare-v2`.
Primer merge local `f9a60b92` incorpora pantallas `e4b4f96a`; el segundo merge
incorpora comunes `b305db34` (SHA de entrega en informe externo/issue).
Dos conflictos: handoff combinado conservando ambas entradas; badge de las
notas conserva `orbit::pill` y condición de pantallas. Se mantienen TODO el
contenido/textos y los scroll, rótulos/botones comunes, incluido `self_start`
de Plantillas. Roadmap y DeepSeek Harness intactos; fragmento sin duplicados.

Gates finales por cola, -j2 y target propio: fmt PASS; check12,13s PASS;
clippy -Dwarnings14,62s PASS; Nextest1157/1157 PASS753,040s, seis skips
configurados, golden ACC612,588s PASS; lifecycle5 Hub+12 UI PASS al primer
intento (incluido engineer_restart_budget; sin reintento #1476).
QA prueba/parity-capture sellado0.1.0-beta.1/testers PASS42,11s. Se conserva
warning previo unused cx analysis/view.rs989 solo bajo captura; ordinarios verdes.
Standings0/292160px, threshold0/maxpercent0/delta0 frente a nativa F1; captura,
referencia y mapa MIRADOS. No es prueba Wails ni LMU live/rendimiento.

Evidencia externa `C:/tmp/1470-union3-evidence/`: 35 escenas1920x1080 y35
1440x900, todas MIRADAS; resumen-1920.png/resumen-1440.png y ronda-1.png
antes/después MIRADOS; diez capturas adicionales con rueda real a1440 MIRADAS.
Sin regresiones de unión observadas: perfiles desplazables sin pisar Contraer
barra; últimas filas legibles, primarios/Plantillas por contenido, caso normal,
OBS fijo y Posición y tamaño accesible. Hashes de binarios/capturas/código,
logs completos y scripts reproducibles conservados fuera del repo.
Rutas beta ocultas Workshop/Telemetría/Licencias separada abren Inicio: no
certifican sus módulos. Calendario conserva el archivo QA y catálogo caducado.
Manual: recorrer Hub/Ajustes a1920 y1440, desplazar perfiles/listas/inspector,
revisar badge0.1.0-beta.1, Roadmap/fechas y botones de Plantillas.
Pendientes aceptación del orquestador/Isaac, DPI125/150 y servicios reales.
plan.md ausente en la base, no se crea otro roadmap; coordinación pública del
orquestador pendiente. No Go/frontend/Release/CI remota: fuera del brief.
Solo merges locales autorizados; sin push/PR/promoción/release ni modificación
de native-beta Isaac o checkout principal. Siguiente: revisión aislada de la unión.
### ISA-1470 — Ronda 4, cortes y cabeceras (2026-10-06)

Entrega aislada del worker `1470-r4-cortes`, rama
`vantareapp/isa-1470-r4-cortes`, base `136a90fa`; se retoman los ocho
archivos sin commit dejados por el worker anterior, sin descartar cambios.
Corrige el fit de Standings y los rótulos compactos de Inicio a 1440,
separadores de Estado a todo el ancho (Cuenta y Actividad quedan al otro
worker), dos filas completas de aplicaciones con acceso a «Ver todas»,
flechas y descripción funcional de la cadena, insignias según su estado,
espera atenuada, pósteres arriba y «Probar» oculto durante el lanzamiento.
Studio muestra «Fuel y stint» a 1440, botón de inspector con icono y nombre
accesible, y «Probar con · Próximamente» deshabilitado sin selección ficticia.
Testing y Calendario comparten cabecera hasta el borde derecho; sus columnas
no duplican el espacio de la antigua cabecera.

La primera captura heredada bloqueaba el mutex global en el proceso padre
mientras el helper del Hub esperaba el mismo mutex. La validación usa el
helper de turno `VANTARE_CAPTURE_TURN` del worker estados únicamente en el
binario QA externo; se restaura el script del repo después de compilar y no
se incluye esa adaptación en este commit. El helper posee el mutex global,
el script externo reserva `pantalla-ocupada` con identificador y limita cada
captura a 90 s, cerrando solo su árbol de procesos. Inicio solo termina en
2,8 s: no se reprodujo un cuelgue de layout después de corregir la captura.

Evidencia externa: `C:/tmp/1470-r4-cortes-evidence/`, 20 capturas de diez
pantallas a 1920x1080 y 1440x900, comparaciones antes/después inspeccionadas.
Las 20 recapturas finales y las comparaciones se han inspeccionado;
`ronda-2.png` y `seal.json` conservan la revisión y hashes. Fmt, check y
Clippy `-D warnings` PASS después del último cambio. Nextest 1157/1157 PASS
(754,329 s, seis skips configurados); corpus ACC completo PASS (604,246 s).
Lifecycle PASS (5 escenarios Hub y 12 UI). Build QA PASS (aviso heredado de analysis/view.rs
solo con parity-capture); build ordinario PASS sin avisos. Escaneo UTF8/UTF16
confirma que el binario ordinario no contiene los dos textos exclusivos QA.
Regresión visual con escenas existentes: no se añade un test que compare
constantes de layout. No hay cambios de lógica core, dependencias, Go ni
frontend. Los textos QA del calendario y Notificaciones mantienen sus guards
`parity-capture` y fixtures; no se introducen datos QA en las rutas normales.
La app normal obtiene Cuenta del servicio; la cuenta de ejemplo exige demo.

Manual: recorrer Inicio/Launcher/Studio/Testing/Calendario a ambas resoluciones,
comprobar bordes completos, Fuel visible, inspector conmutado, escenarios
inactivos, y acciones de cabecera a la derecha. A 1440 Fuel pasa a una segunda
línea para conservar su acceso; no se promete una sola línea con cualquier
número de widgets. ETA no se inventa: solo se representa el progreso existente.
`plan.md` está ausente en esta base y no se crea un roadmap paralelo.
Sin push, PR, CI remota, merge, promoción ni release; beta de Isaac intacta.
La aceptación y actualización conjunta de #1470 corresponden al orquestador.

### #1472 — Integración seleccionada de seguridad (2026-10-06)

Worktree aislado `C:/tmp/vw3-1472-integracion`, rama
`vantareapp/isa-1472-seguridad-integracion`, base `136a90fa`.
Manda `C:/tmp/beta/r4/revision-auditoria-1472.md`; no se integran #5 ni #7.
Primer hito: fixtures junto al ejecutable, lista fija del catálogo actual en
packaging y recuperación de selección/escena/cursor inválidos del Taller.
Navegación y derechos conservan el Hub; guardados con lock del SO y temporal
exclusivo. `domain::text` se adelanta desde #2 porque #4 lo consume.
Los tests del Launcher limpian también los locks persistentes en sus temporales.
Evidencia y validación conjunta: `C:/tmp/1472-integracion-evidence/` e informe
`C:/tmp/fase2/informe-1472-integracion.md`. Target propio en E: mediante junction;
Nextest/lifecycle usan su ruta real para mantener la identidad Win32 del proceso.
`docs/roadmap/plan.md` no existe en esta base; no se inventa otro roadmap.
Entrega local para revisión del orquestador; sin push, PR, merge ni promoción.
Segundo hito: Host loopback en Go heredado, checkout fijado, secretos solo en el step y .dockerignore; DEPLOY_SURFACE conservado.
Tercer hito: capacidades del Hub (11), desconocidas ignoradas, cotas y cuarentena solo de JSON/versión/validación; errores de E/S se conservan y screenshots::validate permanece.
Cuarto hito: cotas de identidades/lecturas/tar y pruebas codec/LMU; rights/mod.rs conserva íntegro el Hub y se recolocan CLOCK_WRAP_FROM/read_bounded.
Quinto hito: Reader::text de ACC sanea U+202E, con test unitario; no se incorpora el fuzz de 863 líneas.
Sexto hito (#9+#10 juntos): allowlist solo para enlaces de PUBLIC/ProgramData, los del usuario se confían; DeviceLimit tipado, botón principal y test semántico de cuarentena del roadmap repuesto.

Validación final (cola `compilar.ps1`, Rust `-j 2`): fmt/check/clippy
`-D warnings` PASS (`final5`), Nextest 1181 PASS y 6 omitidos preexistentes,
lifecycle PASS (`final6`), `go test ./...` PASS. Go necesitó el `frontend/dist`
ya construido del checkout principal para el embed; no se modificó frontend.
`packaging/tests.ps1` PASS: 174 comprobaciones en Debug y 174 en Release.
Release público real, con `parity-capture` para QA, compilado/empaquetado con
exit 0; candidato local `0.0.0-local`, `source_sha=136a90fa`, `source_dirty=true`.
No es una release publicada ni un paquete construido desde un commit limpio.
Arranque desde `C:/tmp/1472-paquete` PASS: ventana en 3,81 s, datos propios,
captura `primera-paquete.png` inspeccionada; sin renombrar fuentes del repo.
Standings F1 PASS: 0/292160 píxeles, umbral 0; captura, referencia y diff
inspeccionados: misma cabecera, siete filas, nombres/datos y pie Sebring.
Hash PNG de ambos: `2b63ea4a40309fedd14337073a289c8767bd3f48c450c3fce0945a2ca34ba7df`.
El vector heredado del test de timestamp se adaptó al `MAX_FRAME` del Hub
(128 KiB); conserva la exigencia de superar el marco real, sin debilitarla.
Fallos previos conservados: identidad IPC de la junction, limpieza de locks,
disco lleno, test de timestamp con marco antiguo y enlace de exe aún vivo.
Debug abortó por una aserción de accesibilidad de GPUI antes de abrir; Release
abrió. La primera prueba Release con ventana oculta no midió apertura visible;
la repetición con ventana normal y la misma copia verificada por hash sí pasó.
Queda el warning Release de `analysis/view.rs` (`cx`), fuera del diff.
Por falta de espacio, evidencia voluminosa y paquetes propios están en
`E:/tmp/1472-integracion-evidence/` y `E:/tmp/1472-integracion-package-release/`;
logs/capturas/lista de 51 archivos en `C:/tmp/1472-integracion-evidence/`.
Manual: abrir el Hub copiado con datos aislados, recorrer Taller y guardar una
escena; repetir con selección obsoleta. Un `.lock` residual permite guardar;
un lock activo conserva el rechazo. Verificar enlaces compartidos/usuario y
el botón de DeviceLimit con el flujo real de renovación antes de promoción.
Sin LMU vivo, DPI ni DeviceLimit real; no se acredita rendimiento o servicios
reales. La cuarentena de installation y los hallazgos de voz/radio de la revisión
quedan fuera del alcance seleccionado para el orquestador.
Sin gates frontend (no cambió TS/CSS), CI remota, push, PR, merge, promoción,
release ni acción externa fuera del alcance. Siguiente: revisión aislada del
orquestador; no integrar en nightly sin autorización de Isaac.

### #1470 — Unión ronda 4 y seguridad seleccionada (1470-union4, 2026-10-07)

Worktree `C:/tmp/vw3-1470/vantare-v2`, rama aislada
`vantareapp/isa-1470-hub-rediseno`, base limpia `136a90fa`.
Brief `C:/tmp/beta/r4/brief-1470-union4.md`; notas propias ausentes durante
la ejecución. Merges locales en orden: `84a11584` incorpora `7c2ba572`,
`aebe102f` incorpora `79d0c178`; tercer merge incorpora `d4a4e73a`
(SHA final en informe externo). Único conflicto documental del tercer merge:
se conservan completas las entregas de cortes y seguridad. Ninguna resolución
altera código; los cruces automáticos de calendario/cuenta/Testing se revisan.

Gates completos por cola/-j2/target propio: fmt --all/check/clippy -D warnings
PASS; Nextest1182/1182 PASS810,550s, seis skips configurados, golden
ACC616,975s PASS; lifecycle5Hub+12UI PASS al primer intento.
Go ./... inicial sin frontend/dist; se reutilizan assets reales de1472
con árbol frontend Git idéntico `1abfb3d0`. Un timeout SQLite en la repetición
paralela; suite completa `go test -p 1 ./...` PASS, sin cambios de tests.
Gofmt verificado. Packaging actual contra artefacto Release heredado1472:
PowerShell7 falla por ruta PSHOME/powershell.exe; Windows PowerShell5.1
PASS174 checks. Esto no demuestra un nuevo paquete Release de Unión4.

QA prueba/parity-capture PASS: once binarios0.1.0-beta.1/testers,
DuckDB DLL copiada; warning cx heredado solo bajo captura. No distribuir.
Standings F1:0/292160px, threshold0/maxpercent0/delta0; captura, referencia
y mapa MIRADOS. No es prueba Wails ni LMU live/rendimiento.
70 capturas (35x1920x1080 y35x1440x900), galerías y hojas resumen MIRADAS.
Inicio mantiene fit de Standings/Actividad; Launcher conserva cadena y estados;
Studio envuelve Fuel a1440; cabeceras de Calendario/Testing abarcan las columnas.
Capturas ocultas bloquean Inicio: timeout90s y árbol propio cerrado, visible
PASS. Un cierre de paleta falla tras guardar PNG; repetición PASS, log conservado.
Paquete QA copiado `C:/tmp/1470-union4-paquete`: ventana login en3,72s,
y captura Inicio desde copia con fixtures locales; ambas imágenes MIRADAS.

Evidencia `C:/tmp/1470-union4-evidence/`, informe
`C:/tmp/fase2/informe-1470-union4.md`; diffs/lista65archivos y hashes externos.
Manual: recorrer Hub/Ajustes a1920/1440, desplazar inspector/listas, verificar
canalTesters/versión, cabeceras y estados; ejecutar solo copia QA con datos aislados.
Pendientes aceptación de Isaac/orquestador, DPI125/150, servicios/DeviceLimit
reales y Release de esta unión. Rutas beta ocultas abren Inicio; calendario
conserva catálogo caducado/archivo QA y Roadmap datos demo. No certifican módulos.
plan.md ausente en esta base; no se crea otro roadmap. Sin gates frontend
(sin TS/CSS), CI remota ni LMU vivo. Rama remota ausente verificada.
Solo merges locales autorizados, sin push/PR/promoción/release ni cambios a la
beta de Isaac/checkout principal; siguiente: revisión aislada del orquestador.

### Corte #1470 r5 — LISTA A (render), 2026-10-07

Worker aislado `vantareapp/isa-1470-r5-render`, base `40a4ddc9`, worktree
`C:/tmp/vw3-1470-r5-render`. Sin push, PR, merge, promoción ni release.
Lista B y suciedad del checkout principal preservadas.

B1: fuera halos difusos externos de paleta/popovers/drawer; velo del drawer
del color de superficie. El renderer existente comunica Opaque/Transparent
por padding de GlobalParams (48 bytes), conserva cobertura sin dithering en
ventanas opacas y el render previo de degradados en overlays transparentes.
Mezcla sin división0/0 y cobertura de sombras limitada a[0,1]. Sin dependencia
ni renderer nuevo. Captura RGBA original con checker que rechaza alfa<255:
autotest acepta255/rechaza254/0; paleta r4 rechazada con1058px.
18 capturas finales1920/1440 MIRADAS, todas opacas. B1 antes/después
drawer36484/26754→0/0, paleta1058/849→0/0, notificaciones1619/1056→0/0.
Standings0/292160px, threshold0/maxpercent0/delta0; mapa/referencia MIRADOS.
La retirada global del dithering falló143279px; se descartó, sin relajar gate.

I1 Actividad hasta abajo, vacío centrado, fundido y hasta8 registros existentes.
La escena tiene3; no se inventan6–8 eventos. I6 cadena sin hueco del hero,
historial3filas y Aplicaciones/Historial separados; Opciones conserva controles
mediante scroll a1440, perfiles en lanzamiento mantienen198px. Pills terminales
Bien/Lento/Falló solo para resultado observado de sesión, con regresión de
reintento recuperado; persistencia no guarda resultado histórico. P2 inicial
neutra MoTeC/Pro, P3 tarjetas iguales/subtítulos1línea, P11 Avanzado12/600/tracking0.

Gates finales del código definitivo PASS: fmt/check/clippy por cola,
-j2/target/gates propio; Nextest1183/1183 en622,786s, seis skips configurados,
golden ACC501,372s; lifecycle5Hub+12UI PASS. Logs verified-*.log.
Build QA beta.1/Testers PASS, warning cx previo solo parity-capture.
Evidencia `C:/tmp/1470-r5-render-evidence/`; informe vivo
`C:/tmp/fase2/informe-1470-r5-render.md`. Capturas RGB24 descartadas: ocultaban
el fallo de alfa pero mantenían grano; capturador original preservado.

Pendiente aceptación del orquestador/Isaac, ventana normal SIN captura/DPI125
(intento aislado: Ventana no disponible), pills antiguas sin datos terminales,
6–8 eventos reales, LMU/OBS/Mac/rendimiento. Favorito/Abriendo se solapan en
cubierta compacta durante lanzamiento: hallazgo para revisión #1470.
Manual: CtrlK, Notificaciones y editar perfil a100/125%; revisar halos y bordes;
Aplicaciones/Historial/Volver, tres filas, cadena4pasos y scroll de Opciones.
Go/frontend/CI remota no ejecutados (sin cambios/push). plan.md ausente en esta
base, sin roadmap alternativo. Siguiente: revisar entrega aislada y sus límites.
### #1470 — Ronda 5, LISTA B pantallas (2026-10-07)

Rama `vantareapp/isa-1470-r5-pantallas`, worktree
`C:/tmp/vw3-1470-r5-pantallas/vantare-v2`, base `40a4ddc9`.
Brief `C:/tmp/beta/r4/brief-1470-r5.md`, revisión r4 completa y recortes
aplicables. Solo LISTA B; no delegación ni cambios de la LISTA A.
Actualizaciones muestra la versión instalada y filtra notas por canal; Cuenta
alinea nombre/iniciales de la escena con sidebar, sin ampliar autenticación.
Calendario centra el vacío con icono y recarga, elimina guiones de acento y
zona repetida, y muestra ambos meses en el rango semanal. Rendimiento usa
tarjetas informativas neo, sin radios/selección/Disponibilidad Pendiente;
Cómo elegir ocupa la sexta celda. Acciones a tamaño de contenido, iconos de
sección, mini preview de Apariencia, contador sin leer, cifra/canal de informes
en una línea, lenguaje llano/pills para funciones inertes y área/icono del
Roadmap. Cambios en doce archivos Rust del Hub; sin dependencias ni contratos.

fmt/check/clippy -D warnings PASS por cola `compilar.ps1`, -j2, target propio.
Nextest1183/1183 PASS733,796s, seis skips configurados; golden ACC605,828s.
Lifecycle5Hub+12UI PASS al primer intento. Build ordinario sin parity-capture
PASS40,03s; seis textos exclusivos de avisos QA ausentes UTF8/UTF16, control
positivo en binario QA y fixture ausente de allowlist de empaquetado. No se
generó paquete distribuible. Ambos binarios/hashes conservados externamente.
Tests de filtrado por canal y rango semanal mes/año PASS. QA prueba con
parity-capture 0.1.0-beta.1/testers PASS; warning cx heredado solo en captura.
40 capturas 20 nombres x1920/1440, detalles y hojas MIRADOS, 18 pares antes/
después y mapas MIRADOS. Standings F1 0/292160px, umbral0/delta0, captura/
referencia/mapa MIRADOS. Una captura falló al cerrar ventana tras guardar PNG;
reintento PASS, logs conservados. Clippy inicial unused_self/match_same_arms
corregido; log conservado. Build propio simultáneo cancelado y serializado.

Evidencia `C:/tmp/1470-r5-pantallas-evidence/`, informe
`C:/tmp/fase2/informe-1470-r5-pantallas.md`. Cuenta completa se acredita en
cuenta-base: ruta QA licencias-modulos-dispositivos heredada abre Inicio.
Manual: recorrer pantallas a1440/1920 y desplazar inspectores/listas; comprobar
Instalada/Testers, avatar común, vacío, niveles sin selección, mini preview,
pill/filtro sin leer, informes en línea e iconos/áreas del Roadmap.
Calendario mantiene recarga local y seed caducado; no se añadió descarga ni
horario vigente. Cuenta real no transmite nombre/correo en su IPC actual.
Fixtures de Roadmap/calendario/avisos no acreditan servicios reales. B1 es del
otro worker; no se arreglan sombras/velos aquí. Sin LMU vivo, DPI125/150, OBS,
Mac, gates frontend/Go (sin cambios) ni CI remoto. plan.md ausente en la base.
Entrega local aislada para revisión; sin push, PR, merge, promoción o release.

### #1470 — Unión ronda 5 (1470-union5, 2026-10-07)

Worktree `C:/tmp/vw3-1470/vantare-v2`, rama
`vantareapp/isa-1470-hub-rediseno`, base limpia `40a4ddc9`.
Brief `C:/tmp/beta/r4/brief-1470-union5.md`, notas
`C:/tmp/fase2/notas-1470-union5.md`. Merges locales no squash autorizados:
`24092193` mediante `d9af7965` (render), `918df80e` mediante `c02d7373`
(pantallas). Único conflicto en este handoff, conservando ambas entregas.

Corrección propia: `native/hub/src/launcher/showcase.rs` evita que la fila de
perfiles absorba todo el alto restante; las tarjetas y Nuevo perfil siguen
el alto de contenido, mínimo198px. La columna derecha mantiene Últimas veces
hasta abajo. `native/hub/src/settings/view.rs` elimina la repetición de
«Así funcionarán los niveles» en la tarjeta, conservando el subtítulo.
Cambios exclusivamente visuales, sin nuevos tests que repliquen estilos;
las capturas comprueban ambos tamaños y los tests existentes de resultados
terminales protegen las pills Bien/Lento/Falló.
Últimas veces ya muestra esas pills si existe resultado del perfil en la
sesión actual. El historial persistido solo guarda fecha/contador/media:
las fechas QA no tienen resultado terminal, y no se inventa ninguno.

Build QA `0.1.0-beta.1 (testers)` PASS, perfil prueba/parity-capture,
no distribuible ni apto para demostrar rendimiento. Warning previo
`analysis/view.rs:989` exclusivo de parity-capture conservado.
Fmt/check/clippy-Dwarnings PASS; nextest1184/1184 PASS en712,270s (ACC578,928s, seis skips configurados). Lifecycle5Hub+12UI PASS al primer intento.
72 capturas finales,36 escenas×1920x1080/1440x900, con turno y mutex;
18 hojas detalle,2 resúmenes y principales/diffs MIRADOS. Alfa<255=0 en72/72;
autotest255 aceptado,254/0 rechazados. Standings0/292160px, umbral0/delta0,
referencia/captura/mapa MIRADOS. `source-seal.json` acredita mismo código.
Evidencia externa `C:/tmp/1470-union5-evidence/`, informe
`C:/tmp/fase2/informe-1470-union5.md`.

Ventana normal real a100% capturada con CopyFromScreen en datos aislados:
`runtime-historial-before.png`/`after.png` muestran Comprobando sesión,
no acreditan panel de perfil/paleta/notificaciones ni navegación de pestañas.
Primer intento1920 limitado por el marco normal a1920x1061; repetición1440
produjo screenshots reales, segundo arranque falló «Ventana no disponible».
Logs conservados. DPI125 no tiene override por sesión en renderer Windows;
no se altera configuración global compartida. Esa validación sigue pendiente
porque el binario actual no admite escena QA en ventana Normal.
Alias QA licencias-modulos-dispositivos/telemetria/workshop abren Inicio;
Cuenta se acredita en cuenta-base. Fixtures Calendario/Roadmap no certifican
datos públicos actuales. No LMU live, OBS, Mac, DPI125 ni rendimiento.
`docs/roadmap/plan.md` ausente en esta base, sin roadmap alternativo.
Sin cambios Go/TS ni sus gates; CI remoto no ejecutado, sin push/PR.
Solo merges locales autorizados; sin promoción nightly/testers/master,
release, anuncio ni cambios al checkout principal. #1470 sigue abierta.
Siguiente: revisión aislada del orquestador; después
escena QA en ventana Normal cuando exista soporte aprobado; DPI125 manual de Isaac.

Nota final del orquestador (releída): no construir soporte QA normal ni bypass.
El parser solo selecciona CaptureState mediante --capture; esa ruta abre
WindowKind::PopUp, visible pero distinta de Normal. --demo abre Normal sin
aplicar CaptureState, y --scene solo carga foto de telemetría; no admite
las cuatro escenas pedidas en Normal. Evidencia qa-normal-limit.txt.
Se documenta el límite y se cierra lo posible conforme a la nota; DPI125
queda manual para Isaac, sin cambiar escala global ni exigir sesión para
esta comprobación de DWM.

### #1470 — Zoom del Hub: condición de parada (2026-10-07)

Worktree `C:/tmp/vw3-1470`, rama `vantareapp/isa-1470-hub-rediseno`,
base `dd90b49c9fa2244fb8fa881a44ff094f71bd4b11`, inicialmente limpio.
Brief `C:/tmp/beta/r4/brief-1470-zoom.md`; notas específicas ausentes.
No se implementa zoom parcial: GPUI fijado en `72d28c3` ofrece
`set_rem_size`, pero `AbsoluteLength::Pixels` ignora rem; 40 archivos del Hub
usan `px(...)`. `set_scale_factor` está limitado a tests. Ampliar la solución
a esos consumidores o al backend excede el ajuste pequeño autorizado.
Alternativa propuesta, pendiente de decisión: conversión a rem de la interfaz del Hub,
con canvas/widgets aislados en píxeles y revisión de interacción/responsive.
README de settings actualizado; ningún código, dependencia o renderer cambia.
Informe y evidencia de fuentes: `C:/tmp/fase2/informe-1470-zoom.md` y
`C:/tmp/1470-zoom-evidence/viabilidad.md`. Verificación: diff-check;
gates Rust, capturas y paridad no ejecutados porque no hay cambio de runtime.
`docs/roadmap/plan.md` sigue ausente en esta base; no se crea otro roadmap.
Siguiente: orquestador revisa el límite y decide el lote; no hay push, PR,
merge, promoción, release ni prueba LMU/OBS/Mac/DPI/rendimiento.

### #1470 — Launcher alto, ronda 2 (2026-10-07)

Base local `a6d0bb6f`, worktree `C:/tmp/vw3-1470`, rama
`vantareapp/isa-1470-hub-rediseno`; entrega aislada sin push ni promoción.
`native/hub/src/launcher/showcase.rs`: flechas por páginas en la cabecera
«Tus perfiles», fuera de tarjetas; título/descripción agrupados y aire entre
acciones y cadena. Opciones reserva alto para sus cinco filas a 1440×900 y
1280×900; historial cede alto y conserva scroll. En ventanas bajas, opciones
usa scroll interno con degradado e indicación «Desplaza para ver las 5 opciones».
Capturas antes/después de reposo 1920×1080, 1440×900, 1280×900 y de lanzando/
nuevo perfil 1440×900, inspeccionadas; evidencia externa `C:/tmp/1470-launcher-alto-evidence/r2-*`.
Build QA beta.1/testers y gates por cola: fmt, check, clippy -D warnings,
nextest Hub (285/285), lifecycle y Standings (0/292160 px; referencia/captura/mapa vistos).
Sin cambio del motor ni dependencias; regresión visual validada mediante capturas
más tests existentes. Warning QA previo de analysis/view.rs:989 conservado.
No LMU live, OBS, Mac, DPI125/150, pruebas de rendimiento ni CI remoto.
`docs/roadmap/plan.md` ausente en la base; esta ronda no cambia alcance o fases.
Siguiente: revisión del orquestador; ninguna integración/publicación ejecutada.
### #1473 — Tablas, ronda 2 Head to Head (2026-10-06)

Revisión de Isaac sobre 6f91d8d1: se conserva SIZE 388×110, filas 24/62/24
y letra 14. Solo cambia native/ui/src/head_to_head/mod.rs: rivales con
posición, nombre con elipsis, clase mayúscula, RIVAL y gap disponible a la
derecha; jugador con posición/nombre y una línea «CLASE · H2H · modo».
La VM no expone vueltas ni sectores: hueco derecho central libre, sin cambiar
proyección, telemetría, demanda, settings ni otros widgets.

Evidencia externa C:/tmp/1473-tablas-evidence/: head-to-head-r2.png,
head-to-head-r2-gap.png, head-to-head-r2-long.png y ronda-2-h2h.png MIRADAS
a escala 1×; resumen.png actualizado y MIRADO. Escenas QA reconstruidas,
no prueba LMU live, DPI alternativo ni rendimiento. Regresión protegida por
los tests existentes de límites 24/62/24, ambas direcciones, proyección y
goldens, y por inspección visual con rivales/gap/nombres largos.
Entrega local pendiente de aceptación del orquestador/Isaac; sin push, PR,
merge, CI remota, promoción ni release. plan.md ausente en esta base;
no cambia alcance ni planificación. Informe final externo ≤10 líneas.
Gates ronda 2: fmt/check/Clippy PASS; Nextest 1159/1159 PASS (6 skips
configurados, 787,799 s; ACC 641,974 s PASS); lifecycle 17 escenarios PASS.
Logs externos r2-*.log; build Workshop/parity-capture prueba PASS (9,20 s).
No se añaden tests nuevos para esta redistribución exclusivamente visual:
los tests existentes y las capturas inspeccionadas cubren la regresión.
Manual: abrir head-to-head-middle con rivales y head-to-head-r2.snapshot.json
con gap; comprobar clase/RIVAL en ambas filas, dos líneas centrales y espacio
derecho libre. Aceptación visual final de Isaac/orquestador pendiente.

### #1473 + #1474 — integración sobre Hub unión 4, tablas (2026-10-07)
Rama `vantareapp/isa-1473-integracion`, worktree `C:/tmp/vw3-1473-integracion`, base `40a4ddc9`.
Primer merge `93d0cb1d` incorpora `18fdf07a`; segundo incorpora `1cb6c892`.
Conflictos resueltos conservando dos entradas del handoff y ambos tests independientes en H2H/Relative; no hay conflicto productivo.
Gates segunda ronda por cola/-j2/target propio: fmt/check/clippy PASS; Nextest 1189/1189 PASS (6 skips, ACC 572,170 s); lifecycle PASS.
Pendiente resto `8004af81`, QA Workshop/Studio y Standings 0 px. Evidencia `C:/tmp/1473-integracion-evidence/`.
Sin push, PR, promoción ni release; plan.md ausente en la base; checkout principal y beta de Isaac preservados.

### #1473 — Proporciones de widgets, worker 1473-resto (2026-10-06, entrega local)

Base13ae6945, rama vantareapp/isa-1473-widgets-resto; HEAD de código 52367c31fc835e633d0382f663fbaeebb54017df.
Doce commits por widget (commits.json externo), doce renderizadores modificados;
este handoff es el único archivo adicional. Standings, Eficiencia, workshop.rs,
domain/IPC/persistencia/fixtures y DEMANDA12/12 intactos. Sin dependencias nuevas.
SIZE autorizado por notas: beta nativa no distribuida, sin migración.
Fuel523x272, filas historial34→23px medidos; Input420x110; Flags250x70;
Map554x415, trazo4→10px; daños numéricos164x132, pitch29/29/29 medido.
Pedals valores encima y textos completos; PedalsTelemetry barras14/pitch24,
tres100 separados. Delta barra280x96/cifra27>=24; Radar220x220/tráfico0px diff.
Capturas antes/después y estados/100% MIRADOS en
C:/tmp/1473-resto-evidence/resumen.png y ronda-4.png.14 escenas caben1920x1080.
Gates finales PASS: fmt workspace+módulos, check, Clippy -D warnings,
Nextest1156/1156 (goldens,6 skips previstos), lifecycle5+12, build captura, diffcheck.
Los gates validan el árbol conjunto final; commits intermedios no certificados.
Map live sin geometría/posiciones; InputTrace solo acelerador; Fuel sin datos
AVG/MAX/MIN/pits inventados. Espera Flags/Weather conserva semántica previa.
Preguntas y límites para #1474 en VERIFICACION.md externo; no arreglados aquí.
Manual: Workshop fixtures/default/stale/espera/100%, settings history8/clutch/
tyres/aero/projection/virtual-energy y escalas. Pendientes aceptación Isaac,
DPI/OBS/Mac/LMU real/performance. Frontend/Go no tocados, no gates de esas capas.
plan.md ausente en base: no se crea roadmap alternativo. GitHub#1473 actualizado.
Sin push/PR/CI remota/merge/promoción/release. Siguiente: revisión orquestador.

### #1473 — Ronda 2 reanudada, resto (2026-10-06, revisión local)

Continuación autorizada desde 040f15b2 en vantareapp/isa-1473-widgets-resto;
se preservaron y completaron los cambios sin commit de Weather y Daños.
Weather pasa 240×150→240×164: dos columnas, rótulo11/valor14, celda29+gap7;
Daños pasa150×191→180×201: leyenda en tres filas29, SVG centrado.
Fuel conserva523×272, distribuye datos VM en tabla continua con filas23;
historial de ocho vueltas usa dos columnas. No reproduce la división351/172
ni añade AVG/MAX/MIN, pits o tiempos inexistentes: composición adaptada al VM.
Solo tres renderizadores y este handoff; sin cambios domain/IPC/telemetría,
settings, demanda, Workshop, Standings, dependencias o layouts persistidos.
Gates del árbol final PASS: fmt/check/clippy -D warnings, Nextest1156/1156
(6 skips previstos), lifecycle5+12, build de captura y diffcheck.
Weather b3d105f1fad9456f0ceab4126df4a6ecce64a767, Daños bff49f9f2fd8b009f37b4a75dbc83cdf57367f3c; Fuel en este commit.
SHAs completos y estado final en C:/tmp/fase2/informe-1473-resto.md.
Evidencia: C:/tmp/1473-resto-evidence/ronda-2-reanudada.png, resumen.png,
r2-medidas.json, r2-layout-fit.json, r2-source-hashes.json y logs r2-resume-*.
Antes/después y seis estados stale/espera MIRADOS; turno pantalla con marcador,
mutex y timeout90, marcador propio retirado. Tres escenas default caben1920×1080;
los perfiles de ejemplo no incluyen estos tres widgets. Letras nominales11/14:
glifos medidos8/11, pitch daño29; historial23; Weather36=29+7, gap texto6/11px.
Pruebas existentes de VM/repaint y prueba de ocho vueltas conservadas/adaptadas;
verificación de solapamientos por captura del renderer; no tests visuales complacientes.
Manual: abrir Workshop con fixtures/default, mirar tres PNG a1× y estados antiguos/
espera; seleccionar historyRows8, showProjection y showAero en inspector.
Límites: QA Workshop, no LMU live/rendimiento/DPI alternativo/OBS/Mac;
8 vueltas con test y cálculo de encaje, sin nueva captura de ese ajuste del inspector.
plan.md ausente en base; Notion exceptuado por cabecera-sol del encargo.
Sin push/PR/CI remota/merge/promoción/release; siguiente revisión del orquestador.

### #1473 + #1474 — integración sobre Hub unión 4, widgets completos (2026-10-07)
Rama `vantareapp/isa-1473-integracion`, worktree `C:/tmp/vw3-1473-integracion`, base `40a4ddc9`.
Merges en orden: `93d0cb1d` incorpora `18fdf07a`; `59c5092b` incorpora `1cb6c892`; tercero incorpora `8004af81`.
El tercer conflicto es exclusivamente documental; se conservan completas las entradas del Hub, tablas y resto.
Hub productivo idéntico a la base. Dos conflictos de tests de tablas conservan ambos tests; no se cambia arquitectura ni dependencias.
Gates tercera ronda por cola/-j2/target propio: fmt/check/clippy PASS; Nextest 1190/1190 PASS (6 skips, ACC 536,833 s); lifecycle PASS.
Pendiente QA Workshop/Studio y Standings 0 px; se actualizará esta entrada con resultados inspeccionados.
Evidencia `C:/tmp/1473-integracion-evidence/`, informe `C:/tmp/fase2/informe-1473-integracion.md`.
Sin push, PR, promoción ni release; plan.md ausente en la base, no se crea roadmap paralelo. Beta y checkout principal preservados.

### #1473 + #1474 — integración y QA completadas (2026-10-07)
Base `40a4ddc9`; rama `vantareapp/isa-1473-integracion`, worktree `C:/tmp/vw3-1473-integracion`.
Merges sin squash en orden: `93d0cb1d` (18fdf07a), `59c5092b` (1cb6c892), `3f9232a2` (8004af81).
Hub productivo igual a la base; se conservaron ambas entradas de handoff y ambos tests en los conflictos.
Cada merge pasó fmt/check/clippy -D warnings, Nextest completo (1185/1189/1190 PASS, 6 skips previstos), goldens ACC/LMU y lifecycle, por cola/-j2/target propio.
QA MIRADA: 18 widgets Workshop default/unavailable/stale, 18 espera con datos retenidos, tres escenas H2H y 18 aperturas Studio a 1920x1080.
Default 18/18 idénticos a referencias; H2H extra 3/3 idénticos; Standings 0/292160 píxeles distintos.
Hoja `C:/tmp/1473-integracion-evidence/resumen.png`; paneles Studio y capturas individuales en la misma carpeta.
Studio usó hook temporal exclusivo parity-capture para layout externo por widget, retirado tras build; fuente restaurada con hash idéntico. Binarios solo QA, no distribución.
Informe completo y verificación manual: `C:/tmp/fase2/informe-1473-integracion.md`.
Sin evidencia LMU live/rendimiento/OBS/DPI alternativo/Mac; aceptación del orquestador pendiente. plan.md ausente en esta base: no se inventa roadmap alternativo.
Solo merges locales autorizados por brief; sin push, PR, CI remota, promoción o release. Checkout principal y beta preservados.

### #1470 — R6 sobre candidato beta (2026-10-07)
Rama `vantareapp/isa-1470-r6`, worktree `C:/tmp/vw3-1470-r6`, base `1c26b898907cb3b3b3b4547ff39bd925cdf2fe01`.
I1: navegación y pie fijos; solo Perfiles flexible con scroll/fundido. A altura800, filas36 y márgenes12 dejan visible el primer perfil.
I2: seis controles Sistema no implementados pasan a pills Próximamente; nota limitada a inicio, bandeja y preferencias de avisos.
I3: cinco filtros en una fila; filas/grupos no se comprimen y test excluye filtro vacío. No se alteró el agrupador ni la entrada QA.
P7/P8/P9/P10/P11/P12/P13/P5/P6/P4: separación, pills, iconos, textos de paleta, envío sin play, opciones sin duplicar, historial compacto sin inventar resultados e inspector con scroll de columna. Etiqueta Studio a una línea, separada22px.
Nota del orquestador: mínimo1280x800; hero Inicio crece para Abrir Studio, cadena Launcher completa y columnas centrales con scroll; Testing compacto y contexto sin compresión.
V3: dos fixtures QA nuevos y tests, banderas Quality::Stale con WithData, jugador P2 y rival delante. Renderizadores/VM/domain/IPC/runtime/Standings intactos.
34 capturas Hub finales1920/1440/1280 MIRADAS, alfa255; escenas V3 MIRADAS. Standings0/292160 frente a referencia nativa aprobada `C:/tmp/1470-evidence/f1-standings-parity/standings.png`.
Primero se comparó por error con referencia Wails histórica: fallo conservado, también aparece en candidato base; R6 idéntico a candidato0px.
Scroll adicional con rueda mediante instrumentación temporal solo del capturador QA; `capture.rs` restaurado con hash idéntico, diff y hashes externos. No entra en el commit.
Gates finales PASS: fmt/check/clippy -D warnings, Nextest1207/1207 (6 skips previstos; ACC563.175s), lifecycle5+12. Primer Nextest falló StorageFull112; log conservado y repetición completa verde sin cambiar tests.
Release candidato base abierto sin capture/scene en datos aislados: responde/cierra exit0 pero queda Comprobando sesión. NO acredita panel vacío por navegación ni un Release R6; exclusión QA protegida por cfg/test, verificación autenticada pendiente.
Evidencia `C:/tmp/1470-r6-evidence/`, antes/después `antes-despues.png`; informe `C:/tmp/fase2/informe-1470-r6.md`.
P1/P2/P3 no implementados; sin V1 horario real, V2 DPI125, LMU live/rendimiento/OBS/Mac. plan.md ausente en la base; no se crea roadmap alternativo.
Entrega local en este commit, sin push/PR/CI remota/merge/promoción/release; checkout principal y trabajo ajeno preservados. Pendiente revisión del orquestador.

### #1470 — candidato beta unión 2, primer merge local (2026-10-07)
Base 1c26b898; worktree C:/tmp/vw3-candidato; rama vantareapp/isa-1470-candidato-beta.
Ronda 6 e60d955f combinada sin conflictos. Gates por cola/-j2/target propio: fmt/check/clippy PASS; Nextest 1207/1207 PASS (6 skips; ACC 432,873 s); lifecycle PASS.
Evidencia externa C:/tmp/candidato-evidence/union2-m1-*. Informe C:/tmp/fase2/informe-candidato-union2.md.
Pendientes zoom394720b9, Standings6faa25d4, lifecycle127bf564 y feed810709e7 (5.º merge añadido por nota); luego QA, paridad, alfa, packaging y Release externo.
plan.md ausente en esta base; Notion exceptuado por cabecera-sol. Solo integración local autorizada; sin push/PR/CI remota/promoción/publicación.

### #1470 — Spike de zoom del backend: presupuesto excedido (2026-10-07)

Brief `C:/tmp/beta/r4/brief-1470-zoom-spike.md`; worktree nuevo
`C:/tmp/vw3-1470-zoom`, rama `vantareapp/isa-1470-zoom-backend`, base
`dae60712778a2f44fa0604b155916b279c067eda`, inicialmente limpio.
Parada preventiva por el límite de ~6 archivos: el recorrido identificado
requiere 9 con las fronteras actuales o 7 concentrando persistencia/atajos en
shell.rs. El backend requiere window.rs y events.rs; el Hub necesita acceso
al HWND (hwnd_of existe, pero el módulo overlay de ui es privado), carga/aplicación,
control, persistencia y atajos, además del README vendor y este handoff.
El callback resize actual permite releer escala/viewport/ratón; Direct Manipulation
requiere sincronizar su escala. No se demuestra inviabilidad técnica del zoom.
No se modifica producción, GPUI upstream, dependencias, overlays ni Workshop;
no existe setter nuevo. No se crea un parche parcial ni se integra al candidato.
Informe `C:/tmp/fase2/informe-1470-zoom-spike.md`; evidencia estática
`C:/tmp/1470-zoom-spike-evidence/fuentes.txt`. Diff-check y revisión documental;
sin gates/build/capturas/paridad/ interacción/nitidez porque no hay implementación.
Notas específicas ausentes; #1470 abierta; roadmap plan.md ausente en la base.
Siguiente: orquestador revisa el inventario y decide el presupuesto del experimento.
Sin push, PR, CI remoto, merge, promoción o release; checkout principal preservado.


### #1470 — Zoom backend, ronda 2: parada por resize (2026-10-07)

Presupuesto ampliado explícitamente a los nueve archivos del inventario.
Rama `vantareapp/isa-1470-zoom-backend`, worktree `C:/tmp/vw3-1470-zoom`,
HEAD inicial/final `9f39fa55e3617acd2cefa93fdae295643048aab6`, base original
`dae60712778a2f44fa0604b155916b279c067eda`. Nueve archivos modificados sin commit;
no se considera entrega aceptada ni se integra al candidato.

Implementación experimental: multiplicador por HWND en window/events del vendor,
puente PostMessageW dirigido en ui/lib.rs, carga en shell.rs, atajos en chrome.rs,
persistencia `hub-zoom.json` en appearance.rs y control 90/100/110/125 en view.rs.
README vendor y este handoff completan el inventario. Sin dependencias, global
mutable, GPUI externo, overlays ni Workshop modificados. Búsqueda de llamadas:
solo Hub/restauración/controles; overlays y Workshop no llaman al setter.

Se activa el LÍMITE del usuario: a125, capture-desktop pide cliente1920×1080
mediante MoveWindow y mide2400×1350 aDPI96. GetClientRect independiente confirma
2400×1350, outer2416×1358; PNG real guardado y MIRADO. La escena QA fija su tamaño
pedido como mínimo lógico (shell.rs); WM_GETMINMAXINFO lo escala por el factor
efectivo. El mínimo normal1280×800 también pasaría a1600×1000 a125 según el código
(inferencia, no prueba de ventana Normal). No se concluye inviabilidad del
backend; requiere decisión sobre mínimo físico frente a zoom antes de reanudar.
No se corrigió ni se amplió la implementación tras activar el límite.

PASS fmt workspace y vendor/check completos/build QA por cola y -j2. Clippy
-Dwarnings FAIL: shell_key101/100 líneas y orden del constructor Store.
Nextest/lifecycle no ejecutados: parada y flujo de gates detenido en Clippy.
Los errores iniciales de compilación se corrigieron y conservaron en logs;
el build QA conserva el warning heredado unused cx de analysis/view.rs:989.
No se debilita ningún test ni lint; no hay commit con gates fallidos.

Capturas MIRADAS: seis referencias base a1920/1440 (Inicio/Launcher/General),
General1920 a90 y125, y cliente real2400×1350 tras resize. Atajos Ctrl−/Ctrl+
procesados y preferencias90/125 verificadas. Texto inicial nítido; sin certificación
de toda la matriz18, paridad100/Standings0px, clic, scroll, reset/reapertura física,
ventana Normal, LMU/OBS/Mac/DPI físico/performance o servicios reales.
El clic no llegó a ejecutarse porque la herramienta verifica resize antes de él.
Capturador externo adaptado para enviar atajos antes del PNG; falso fallo previo
por PID reutilizado/carpeta antigua corregido seleccionando la carpeta más reciente.

Informe `C:/tmp/fase2/informe-1470-zoom-spike.md`, patch/logs/fuentes/capturas en
`C:/tmp/1470-zoom-spike-evidence/`. Verificar manualmente resize-failure.txt/PNG y
reproducir con capture.ps1 General1920 a125 e Interactive, seguido de
capture-desktop.ps1 pidiendo1920×1080 al PID propio. Sin tocar escala global.
Roadmap plan.md ausente en esta base; no se crea una fuente alternativa.
#1470 sigue abierta para revisión del orquestador. Sin push, PR, CI remota, merge,
promoción, release ni acción externa fuera del seguimiento autorizado de la issue.
### #1470 — Zoom backend, ronda 3: unidades corregidas y QA completa (2026-10-07)

Reanudación explícita del orquestador; preservados los nueve cambios sin commit de
ronda2. Rama vantareapp/isa-1470-zoom-backend, worktree C:/tmp/vw3-1470-zoom, base
original dae60712 y HEAD inicial9f39fa55. Commit local final en el informe externo.
WM_GETMINMAXINFO y resize usan DPI puro: scale_factor/(zoom/100). La ventana nace
antes de restaurar zoom; el mensaje conserva cliente/swap chain y solo recalcula
contenido. Origen, ratón, viewport y rasterizado siguen usando DPI×zoom.
Sin GPUI externo, dependencias ni archivos productivos nuevos. Solo nueve archivos:
vendor/window.rs y events.rs, ui/lib.rs, hub/shell.rs, shell/chrome.rs,
settings/appearance.rs y view.rs, README vendor y este handoff.
Atajos extraídos a shell_zoom_key, constructor Store ordenado; Clippy sin excepciones.

PASS por cola/-j2/target propio: fmt workspace/vendor, check/all-targets,
clippy-Dwarnings, nextest1186/1186 (6 skips existentes; ACC y neumáticos incluidos),
lifecycle17/17, build QA. Warning QA heredado unused cx analysis/view.rs989 conservado.
Matriz18/18 a1920×1080/1440×900 y90/100/125 MIRADA; tamaño físico posterior al zoom
exacto aDPI96. Inicio/Launcher100=0px; General100 solo3743px de los dos textos
nuevos, fuera de bbox(321,233)-(722,267)=0px. Standings0/292160px a tolerancia0;
referencia, captura y mapa MIRADOS. Solo Hub llama al setter; Workshop/overlays no.
Clic real(850,362) en «−» a125 aplica110 y persiste. Rueda6 pasos en General a125
muestra Overlays. Resize1440→1920→1440 a125 y Ctrl0 conservan tamaño; preferencias
reabren a125 sin enviar atajos, en shell QA aislada con rutas estables.

Arnés externo enlaza las MISMAS librerías QA. WindowKind::Normal, mínimo1280×800:
a90/100/125 rechaza solicitud1000×600 y mide1280×800 físicos; capturas MIRADAS.
La shell comercial sin supervisor muestra acceso, por lo que no se autentica:
reset/reapertura se prueban en PopUp QA y el mínimoNormal en ventana diagnóstica
Normal del backend. No se confunde con validación de cuenta/servicios reales.
Capturador externo de escritorio corregido para alinear cliente y reiniciar POINT
antes de ClientToScreen; se conservan los intentos con8 columnas fuera del monitor.
No es un cambio de producción ni un fallo de escala, hit-testing o nitidez.
Límite visual: Inicio/Launcher1440 a125 envuelven/recortan contenido en tarjetas
con altura fija; no se rediseña fuera del spike. Sin LMUlive, OBS, Mac, DPI125/150
ni rendimiento. Sin Go/frontend por alcance; plan.md ausente en esta base.
Informe C:/tmp/fase2/informe-1470-zoom-spike.md; capturas/logs/scripts/sellos r3-* en
C:/tmp/1470-zoom-spike-evidence. Verificación: r3-matrix.ps1, r3-probe-build.ps1,
r3-normal-shell-control.ps1 y r3-normal-verify.ps1; Native Normal con control/verify
r3-backend-normal-*. Siguiente: revisión del orquestador. Sin push, PR, CI remoto,
merge, promoción, release ni integración al candidato; checkout principal preservado.

### #1470 — Zoom backend, ronda 4: límite de diseño (2026-10-07)

Encargo explícito del orquestador; rama `vantareapp/isa-1470-zoom-backend`,
worktree `C:/tmp/vw3-1470-zoom`, HEAD inicial `12f610d1`, base original `dae60712`.
Se conserva la elección persistida y el DPI separado del zoom efectivo por HWND.
Cada resize limita el zoom a 1280×800 lógicos con suelo 90 % del DPI; solo el Hub
activa ese límite mediante el mensaje existente. A 1440×900/DPI96 limita a 112,5 %;
a 1920×1080 el 125 % elegido queda intacto. Ajustes informa del límite bajo el
control; +/Ctrl+ no aumentan por encima y − busca el paso inferior al zoom efectivo.
Cinco archivos de código: vendor/window.rs, events.rs, ui/lib.rs,
settings/appearance.rs y view.rs. README vendor y este handoff completan siete.
Sin dependencia, global mutable, GPUI externo ni renderer alternativo. Roadmap
plan.md ausente como en rondas anteriores; no se crea otra fuente para el spike.

PASS fmt workspace/vendor, check/all-targets, Clippy -D warnings y build QA,
por cola/-j2/target propio. Nextest 1186/1186 PASS (6 skips existentes;
ACC 598,868 s, neumáticos 151,009 s); lifecycle 17/17 PASS (5 Engineer + 12 supervisor).
Check/Clippy/build QA finales también PASS tras el ajuste cfg no-Windows para evitar
un argumento no usado; ruta Windows intacta, General final 0 px respecto al primer
build r4. Captura final y hoja r4-live-sheet MIRADAS. No se ejecuta gate Mac/DPI físico.
Matriz de 18 capturas MIRADA: a 1920 las nueve combinaciones son 0 px respecto a
r3; a 1440 las seis de 90/100 también. Elegido 125 limita a 112,5 y conserva 125.
Standings 0/292160 px: referencia, captura y mapa MIRADOS. Resize vivo
1920→1440→1920 recupera 125→112,5→125, PNG antes/después 0 px. Ctrl+ y clic+
bloqueados en 110; Ctrl− desde 125 limitado elige 110 y clic− pasa 110→100;
preferencias verificadas y capturas MIRADAS.

**Aceptación visual NO alcanzada:** a 112,5 Inicio aún tapa parte de Abrir Studio
(CTA envuelta bajo el hero); Launcher corta el borde inferior de los pasos.
Recortes r4-crop-* MIRADOS. Diagnóstico 110 también tapa Abrir Studio en Inicio;
Launcher a 110 cabe. El mínimo solicitado 1280×800 no basta para ese layout.
No se amplía a home/launcher ni se cambia la fórmula para ocultar este resultado.
Siguiente: revisión del orquestador del mínimo/layout, sin integrar al candidato.
Informe `C:/tmp/fase2/informe-1470-zoom-spike.md`; evidencia externa r4-* en
`C:/tmp/1470-zoom-spike-evidence`. Sin push, PR, CI remoto, merge, promoción o release.

Commit local de ronda 4: consultar el SHA definitivo en el informe externo.
El commit conserva el spike revisable; no significa aceptación visual ni integración.

### #1470 — candidato beta unión 2, zoom combinado (2026-10-07)
Segundo merge incorpora394720b9 tras43851186. Conflictos: handoff conserva ambas entradas; chrome conserva atajos zoom y rail compacto de r6, sin restaurar el helper antiguo de foco.
Gates por cola/-j2/target propio PASS: fmt/check/clippy -D warnings, Nextest1208/1208 (6 skips; ACC431,878s), lifecycle17 escenarios.
Capturas nuevas con zoom y aceptación visual siguen pendientes. Evidencia union2-m2-*; sin push/PR/promoción/release.

### #1470/#1475 — candidato beta unión 2, Standings (2026-10-07)
Tercer merge incorpora6faa25d4 tras6b7f8ee5 sin conflictos. Regresiones de VM visible por pipe y pista visible/oculta PASS.
Gates por cola/-j2/target propio: fmt/check/clippy PASS, Nextest1210/1210 (6 skips; ACC432,872s), lifecycle17 PASS.
Paridad visual0px nueva todavía pendiente, sin evidencia de rendimiento live. Logs union2-m3-*; sin push/PR/promoción/release.
