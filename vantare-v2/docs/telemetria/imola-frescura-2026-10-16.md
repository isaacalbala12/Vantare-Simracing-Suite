# Imola: causa de `Stale` — VANTA-33 / #1638

**Resultado histórico.** La [pasada íntegra tras el pulido](imola-practica-pulido-2026-10-16.md)
verifica Core y los 18 widgets con dos avances cercanos para recuperar:
**31,6941 % Stale**, 287.495 fotos por widget, cero rechazos. Este diagnóstico
conserva el resultado previo de un solo avance (25,4488 %) y su evidencia causal.

**El 99,9833 % combinaba huecos reales de publicación SHM con un fallo de
recuperación del adaptador.** Tras corregirlo, el mismo archivo completo produce
214.331 fotos Live y 73.164 Stale: **25,4488 % Stale**, sobre las mismas 287.495.
Los huecos reales se siguen mostrando; no se amplía el límite de 500 ms.

## Evidencia del archivo completo

Misma grabación/hash que [el informe por widget](imola-practica-2026-10-16.md):
261.546 lecturas SHM estables, 159.083 respuestas REST, footer y hashes válidos.
Intervalos en milisegundos; publicaciones distintas incluyen la primera.

| Señal | Lecturas/publicaciones | p50 | p99 | Máximo | Intervalos ≥500 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Lectura SHM | 261546 | 17,209 | 17,693 | 395,374 | 0 |
| Scoring `mCurrentET` | 14293 | 205,254 | 1170,535 | 1516,811 | 2245 |
| Jugador `mElapsedTime` | 146742 | 17,206 | 894,036 | 1352,984 | 2233 |
| REST `sessionInfo`, 200 sin error de cuerpo | 12090 | 257,925 | 1183,557 | 1487,191 | 2348 |
| REST `standings`, 200 sin error | 13669 | 258,034 | 774,361 | 1107,329 | 2323 |

- El jugador parado sí tiene reloj: avanza 146.741 veces. Los 146.742 cambios
  de cuerpo SHM coinciden exactamente con esos relojes distintos, sin discrepancias.
  En los huecos no cambia el buffer entero: no es solo un input constante.
- `gameVersion` permanece constante; el SDK instalado define una cola de eventos,
  no un contador monotónico de frames. Ni versión ni eventos repetidos son heartbeat.
- **Cero retrocesos de `at_ns`** en todo el contenedor. Replay y Core reciben los
  instantes grabados; no usan duración de ejecución ni reloj de pared para el TTL.
  Una pasada directa Reader/Gate, sin Replay, reproduce 261.501/261.546 lecturas
  Stale con el algoritmo anterior. Se descarta el ritmo acelerado como causa.
- `sessionInfo`: 12.183 códigos 200, pero 93 con error al leer el cuerpo; 12.090
  utilizables y 1.486 errores de transporte. Su TTL auxiliar de 2 s no gobierna
  el Stale global: lo dispara `mCurrentET`, también vigilado por el núcleo.

## Recuperación corregida y origen de los huecos

La espera heredada exigía **2 s continuos sin otro stall** para salir de Stale.
Los huecos periódicos la reiniciaban y envenenaban datos nuevos. Ahora un avance
del reloj del propio bloque recupera inmediatamente su frescura; leer otra vez,
cambiar otros bytes o recibir REST no rehabilita un reloj detenido.
La regresión usa 582 filas reales saneadas de los primeros 10 s, ambos relojes,
mantiene al menos cuatro stalls por reloj y exige recuperación entre ellos.

Cada uno de los **2.233 huecos del jugador se solapa con exactamente una de las
2.233 peticiones sin respuesta a `/rest/race/car`** del inventario exhaustivo.
Duración mediana del GET: 758,010 ms; hueco: 906,478 ms. El GET empieza, en mediana,
6,738 ms antes del último avance observado. Ejemplo: GET 0,238–1,011 s;
buffer sin avance 0,258–1,130 s. Es una asociación fuerte con la carga del grabador,
no una prueba causal aislada. El adaptador normal no consulta ese endpoint:
solo `standings`/`sessionInfo`. **No se afirma que producción tenga esos huecos.**
Sí compartiría el fallo de recuperación si sufriera interrupciones equivalentes;
Live además puede confirmar Paused con proceso vivo/REST reciente, Replay no.

Falta A/B en el PC de juego: misma práctica, 60 s solo SHM + los dos GET productivos,
y 60 s con inventario completo, sin tocar foco ni sesión. Hasta medirlo no se
certifica continuidad ni se atribuye definitivamente la perturbación a ese GET.
El inventario del grabador queda sin cambios en esta entrega; se conservan las pérdidas.

## Comprobación reproducible

Tests opt-in `adapter::lmu::cadence_tests::recorded_clock_cadence` y
`recorded_replay_freshness`: ambas pasadas completas PASS, 400,18 s en conjunto,
streaming; sondeo del auditor ~24,8 MiB RSS. Informes locales
`C:/VantareServer/logs/1638-cadence-full-before.json`, `1638-cadence-full-after.json`
y `1638-cadence-full-after.replay.json`. El último incluye las 73.164 decisiones
Stale, todas con motivo **núcleo: origin.source_time sin avance >=500ms**.
Código corregido `2264bcd20af0b922213af4b2e66cd0342f0cd2db`.
Clippy workspace/all-targets -D warnings y fmt PASS; Nextest CI workspace
runtime/domain/ipc con corpus de telemetría **674/674 PASS**, 7 skips.
Goldens intactos. Logs `1638-freshness-final-*`; primer fallo de lint del auditor
corregido y conservado. [Comando de diagnóstico](grabacion-completa-lmu.md#diagnóstico-de-cadencia-y-frescura).
No se repite aquí la ingestión UI de los 18 widgets; se comprueba el productor
Replay/Core completo. Conducción y sesiones/carrera/formación siguen pendientes.
