# #1629 / VANTA-8 — revisión Windows R3

15 de octubre de 2026. PR borrador [#1641](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1641), proyecto Vantare, `area:ui`. Rama `vantareapp/isa-1629-widgets-diseno`; base aprobada `origin/nightly@88051556054a5e1b27f8233d78f05579b72f96b6`. Continuación de `cd2608a14` y nueve archivos heredados, publicados en `02c273f20` tras verificarlos. Sin merge, promoción ni release.

## Orden vigente sobre capturas

Isaac ha prohibido nuevas capturas y cualquier apertura de Workshop, Hub u overlays, también fuera de pantalla. Se detuvieron los lotes y se comprobó que no quedaban procesos propios de captura. El lanzador local del banco quedó bloqueado con un error explícito. Esta entrega continúa solo con código y gates.

Las comprobaciones anteriores de rectángulo y foco solo observaban sus ventanas de prueba; **no acreditan que no hubiera aperturas visibles transitorias**. Isaac informó de ventanas en primer plano. No se declara resuelto el problema del capturador, ni se volverá a ejecutar para demostrarlo. Hace falta una herramienta nueva y una sesión posterior autorizada. No usar `widget-workshop`, `vantare-workshop --captura` ni los scripts históricos de esta evidencia para continuar capturas.

## Cambios que recibe el usuario

- Los 17 widgets tienen pintores GPUI del diseño aprobado y ejemplos del Workshop; Daños reúne Coche y Cifras, conservando los identificadores guardados antiguos y los derechos del catálogo.
- Standings y Relative identifican la sesión y mantienen sus cabeceras legibles durante avisos. Qualy usa diferencias de mejor vuelta con tres decimales; Standings ampliado ofrece sectores numéricos y 900 px. El reloj, los sectores y los cambios de vueltas/boxes invalidan las cachés correspondientes.
- Delta separa barra, píldora y ampliado; el sector en curso exige datos completos. Fuel identifica carrera/qualy/práctica; el compacto pasa de 128 a 137 px para conservar el pie de espera.
- Pedales conserva pico de frenada y transparencia. Radar conserva frases opcionales. Tiempo tiene tarjeta horizontal y columna vertical, con viento y reloj de sesión medidos. Se corrigió el nombre de familia Rajdhani registrado por Windows.
- Torre y Cara a cara usan mejores vueltas fuera de carrera. Cara a cara compara contra la pole medida de la clase, conserva el ritmo de carrera y no inventa una predicción de alcance en qualy. Vuelta rápida distingue carrera, pole provisional y práctica.
- Banderas tiene espera explícita, sector amarillo, textos de qualy y llegada con posición/clase disponible; azul y cuadros se ajustan a la referencia conservada. No se presenta una ausencia de señal como verde.
- El mapa conserva proporciones, pide el reloj de sesión y reconoce únicamente escenas espaciales cerradas. La recepción de una nueva muestra y el filtrado de señales ajenas al mapa no eliminan su geometría de demostración. Fuente live, época ajena o poses distintas siguen rechazadas. La secuencia de ejemplo tiene orden creciente.

## Evidencia conservada y parecido por widget

Raíz local: `C:/VantareServer/evidence/1629-r3/`. Diseño aprobado: `C:/VantareServer/refs/design-system/`. Las comparaciones colocan diseño a la izquierda y Windows a la derecha, sin reescalar el contenido; se añade espacio alrededor cuando el tamaño de la ventana estable difiere. No comparar los montajes antiguos `_tools/m-*.png` ni los intentos `f*.png`: algunos preceden a las escenas equivalentes y a las correcciones.

Cada fila enlaza un directorio relativo a esa raíz. `diseno/NN.png` conserva las placas HTML, `real/pNN.png` la imagen de Windows y `comparacion/pNN.png` el par. `comparacion/race.png`, `qualifying.png`, `practice.png`, `nodata.png` conservan la matriz de cuatro estados. `evidence-inventory-close.json` inventaría los 168 pares y 68 pares de estado con sus hashes actuales. Los hashes se tomaron al cierre: no sustituyen un registro inmutable de todos los inputs al crear cada imagen. `canonical-manifest.json` distingue variantes HTML existentes de estados derivados: cuando el HTML no ofrece Q/P, se conserva la misma tarjeta con una escena de esa sesión y se indica expresamente. No es una referencia de diseño independiente.

Hay 168 placas inventariadas y 68 entradas de la matriz. El último binario de las imágenes tiene SHA-256 `b5ad74e9f586f9d838523b5a481ea3d2ca876ad3b1578fc2558aa3cfe191887a`, anterior al cierre de Banderas y mapa. **Ninguna captura certifica el HEAD final.** `No` en C/Q/P/S significa parecido completo del código final no certificado; los pintores están implementados. C=carrera, Q=qualy, P=práctica, S=sin datos. Quedan pendientes los cuatro estados de los 17 widgets y las 168 variantes con la herramienta nueva; prioridad gratis → Fuel → resto.

| Widget / directorio | Placas | C | Q | P | S | Diferencias y límites que debe revisar la siguiente sesión |
|---|---:|---|---|---|---|---|
| Standings · `standings/` | 14 | No | No | No | No | Tipografía y pies; vuelta lanzada/salida/garaje no tipados, sin inventar etiquetas. Sectores y gap qualy corregidos; recapturar ampliado. |
| Relative · `relative/` | 9 | No | No | No | No | Texto, alineación y banda/pie durante FCY/boxes. El nombre de sesión está implementado; no se inventa predicción de vuelta. |
| Delta · `delta/` | 14 | No | No | No | No | Referencias de pole/óptima ausentes; se mantiene referencia personal explícita. Ventana estable y panel visible tienen distinta altura. Recapturar píldora perdiendo y transparencias. |
| Pedales · `pedals/` | 14 | No | No | No | No | ABS/TC/FFB ausentes: no hay cuarta columna ficticia. Pico, limitador y valores de pedales equivalentes sí están representados. HTML sin variantes Q/P propias. |
| Fuel y stint · `fuel-strategy/` | 13 | No | No | No | No | Objetivos de salida/lanzadas, carga mínima y ahorro de peso ausentes. Parada calculada puede diferir del número decorativo HTML. Panel estándar estable 204 px y ampliado 440 frente a etiqueta HTML 460. |
| Relative multiclase · `multiclass-relative/` | 5 | No | No | No | No | Proximidad temporal, sin distancias disponibles en curvas. Revisar separación de clases y ±4; HTML sin práctica propia. |
| Radar · `radar/` | 10 | No | No | No | No | Sin tiempo de cierre/hueco libre entre carrocerías; distancia entre centros no lo sustituye. Autoocultar no tiene ajuste equivalente. HTML sin Q/P propias. |
| Telemetría · `input-telemetry/` | 5 | No | No | No | No | Traza con 90 muestras equivalentes; ABS/TC y RPM máxima para luces ausentes. HTML sin Q/P propias. |
| Historial Delta · `delta-trace/` | 7 | No | No | No | No | Sin traza de pole/óptima. Tamaño fijo 760×192; compacto HTML 420×90 sin preset equivalente. Ausencia/invalidez conserva ciclo del widget. |
| Pedales con telemetría · `pedals-telemetry/` | 5 | No | No | No | No | Sin ABS; limitador, velocidad, RPM y volante usan datos equivalentes. HTML sin Q/P propias. |
| Mapa · `track-map/` | 9 | No | No | No | No | Geometría solo de la demo, nunca fallback live. Sector amarillo/pit exit y compacto 220×180 sin contrato disponible. Q/P y correcciones de demanda/identidad necesitan recaptura. |
| Tiempo · `track-weather/` | 13 | No | No | No | No | Sin previsión futura, tendencia térmica, hora del día ni número de práctica; guiones en lugar de inventarlos. Revisar ambas orientaciones y alineación tipográfica. |
| Banderas · `racing-flags/` | 20 | No | No | No | No | Doble amarilla, FCY, Safety Car, límites/avería y duración de sanción requieren señales #1638. DT/SG solo en demo cerrada. Textos de sesión/posición y símbolos finales aún sin captura. |
| Vuelta rápida · `fastest-lap/` | 8 | No | No | No | No | Clase activa, sin selector absoluto/clase separado. Sin datos se oculta según ciclo de alerta, frente a tarjeta fija HTML. Revisar mejora medida y fuente. |
| Cara a cara · `head-to-head/` | 6 | No | No | No | No | Carrera calcula 0,286 s/vuelta → 0,29 y 5 vueltas; HTML 0,21/~6 no coincide con sus tiempos. Se conserva cálculo coherente. HTML sin práctica propia. |
| Torre · `broadcast-tower/` | 6 | No | No | No | No | Sin estado de vuelta lanzada; revisar FCY/última vuelta, separadores, reloj y mejores vueltas por sesión. |
| Daños · `car-damage-visual/` | 10 | No | No | No | No | Solo integridad agregada y desgaste de cuatro neumáticos: no zonas, suspensión por rueda, pinchazo ni reparación. Vista Cifras y tecla implementadas; prueba física pendiente. HTML sin Q/P propias. |

Carmín/Limpio del HTML no son los Looks Neo/Neutro disponibles: siguen siendo diferencias de producto, no imposibilidades técnicas. Añadir esos ajustes o tamaños exige concretar su contrato; no se sustituye silenciosamente una opción por otra. El suavizado del texto difiere entre Chromium y Windows GPUI; no se ha medido una equivalencia píxel a píxel del cierre. Las diferencias de señales no se solventan con datos decorativos; el seguimiento de telemetría corresponde a #1638.

## Gates y errores conservados

Todos los gates pasan por `native/scripts/compilar.ps1`, target `C:/VantareServer/targets/1629`, `CARGO_BUILD_JOBS=2`; una compilación nuestra a la vez. Nextest compila con un job y ejecuta un test a la vez. DuckDB oficial de desarrollo 1.5.5, sin cambiar dependencias. Las exclusiones del perfil canónico separan lifecycle y los cuatro bancos de telemetría; se ejecutan aparte. El timeout/reintento añadido al banco externo solo afecta a los dos tests ya conocidos del launcher y no los omite.

Estado de cierre: **código publicado para revisión; gates finales bloqueados por RAM, sin aprobar**. La espera local del 15/10, 19:51–20:10 CEST, nunca arrancó Cargo: RAM libre 3,5 → menos de 2 GB, por debajo del umbral de 4 GB de la cola. No se rebajó la guardia ni se pararon procesos ajenos. Se canceló únicamente el proceso propio que esperaba hueco, sin dejar compilaciones/capturas en segundo plano. El orquestador debe reanudar los gates cuando haya RAM.

| Comprobación | Resultado y alcance real |
|---|---|
| fmt + rustfmt de todos los Rust de la rama | PASS sobre `48d7b8898`; también `git diff --check`. |
| check / Clippy workspace `-D warnings` con parity-capture | PASS antes de las últimas correcciones de mapa. Clippy con los textos finales de Banderas PASS (`clippy-flags-final.log`). Repetición de cierre no ejecutada por RAM. |
| Regresiones de la tanda anterior | 18/18 PASS (`regressions-r3.log`); el intento dirigido del mapa del cierre no llegó a compilar (`map-regressions-final.log` vacío). |
| Nextest workspace con parity-capture | Último run 1785/1790 PASS, 5 FAIL y 12 exclusiones del perfil canónico (`nextest-r3.log`). Cinco correcciones publicadas, todavía sin verificar por falta de RAM. No se declara verde. |
| Lifecycle | Run anterior PASS: Engineer 5/5 + 13 escenarios runtime (`lifecycle-final.log`). Repetición del cierre pendiente por RAM; usa procesos falsos sin interfaz. |
| Telemetría | Run anterior 25/25 PASS (`telemetria-final.log`); el golden ACC tardó 1278,885 s. Repetición tras los cambios finales de domain pendiente por RAM. |
| Retirada / calidad | PASS sobre el cierre (`retirement-close.log`, `quality-close.log`), 456 huellas conservadas. |
| Ventanas y capturas | Suspendidas por Isaac. 168 pares + 68 pares de estado existentes, con hashes en `evidence-inventory-close.json`; sin certificación del código final. |

Receta pendiente, sin abrir ventanas: `C:/VantareServer/evidence/1629-r3/_tools/gates-close.ps1` ejecuta fmt, check, clippy, Nextest, lifecycle y telemetría en serie por la cola. No ejecuta binarios de captura. Usar el worktree/target propios y jobs=2; conservar los logs y revisar el SHA antes de retomarla. T3 rechazó `watch_pull_request` porque este hilo es un subagente: no hay seguimiento automático; lo gestiona el orquestador.

Se conservan los fallos previos: 1778/1780 y 1785/1790, además de los OOM y diagnósticos de Clippy intermedios. Los dos primeros fallos de gap/altura Fuel se corrigieron. Los cinco siguientes son el orden de la escena de mapa, dos pruebas de demanda, repintado por recepción y la expectativa de idioma de una cabecera ahora visible; no se elimina ninguna comprobación espacial ni se reduce el conjunto de tests.

Launcher: `native/launcher` no difiere de origin/nightly en la comparación de este trabajo. Los últimos runs completos anteriores pasaron sus tests. Reproducir el cuelgue histórico en un target frío de nightly no era barato, por lo que se omite y se anota en el buzón para issue aparte; no se atribuye demostrado su origen ni se modifica aquí.

CI de `48d7b8898`, consultado el 15/10 a las 20:07 CEST: política de ramas, ratchet y GitGuardian PASS; gates de Windows y native-linux en curso. No se presupone su resultado. CI de `a83935a44` falló en Linux y Windows por la secuencia del mapa (fallo propio, corregido en el cierre). El CI previo `6429c4aa2` falló en un test de Triage del merge sintético con nightly, ausente de esta rama/base; se conserva `ci-6429-blocking.log` y no se corrige Triage aquí. Los checks remotos del último push se deben consultar en el PR; los gates locales no los sustituyen.

## Revisión pendiente

Revisión del orquestador y de Isaac sobre código y tabla. VANTA-8 se entrega Por revisar con gates pendientes por RAM explícitos; esto no acredita aceptación ni integración. Primero reanudar los gates y comprobar CI; después verificar las correcciones antes de aceptar la entrega. Recaptura completa con herramienta nueva que no moleste a su pantalla; no está autorizada en esta sesión. Después, LMU/ACC/OBS reales, DPI, tecla física de Daños y permisos reales. Los snapshots de ejemplo no acreditan esas pruebas. No se ha instalado ni publicado una versión y solo se ha actualizado la rama aislada y sus trackers autorizados.
