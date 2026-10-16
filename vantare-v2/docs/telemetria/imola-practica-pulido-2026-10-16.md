# Imola tras el pulido de #1638 — M-6

Código evaluado `8d53d2cf14fa8af343cf434e2ba1d2e192eef510` (worktree limpio), PR #1679, base `nightly@bcaa0e3f2`.
La grabación es la misma práctica de Imola, LMU 1.4.2.0, 77 min 18 s, 38 coches totales.
Jugador Alpine #35 fuera del garaje y parado, sin vueltas/inputs; la IA sí rodó.
No contiene clasificación, carrera, formación, salida ni cambios de sesión.

## Resultado completo

**287.495 fotos por cada uno de los 18 widgets; 0 rechazos; productor y consumidor exit 0.**
261.546 SHM estables; hashes por cuerpo, CRC gzip y footer íntegros.
Inventario completo: 61 endpoints, 159.083 respuestas REST; 51 endpoints con respuestas correctas.
Recorrido `Reader → Replay → Translator → Core → DTO → 18 Widget::ingest`, sin HTTP, juego, ventanas ni capturas.
Dos pasadas streaming; no se carga el contenedor ni su descompresión completa en RAM.

| Ejecución | Live | Stale | Stale % | Alcance |
| --- | ---: | ---: | ---: | --- |
| Original, recuperación de 2 s | 48 | 287447 | 99,9833 | Core y 18 widgets |
| Fix previo, un avance | 214331 | 73164 | 25,4488 | Core completo, no nueva ingestión de widgets |
| Pulido, dos avances cercanos | 196376 | 91119 | 31,6941 | Core y 18 widgets |

El segundo avance evita rehabilitar un tick aislado: mantiene 17.955 fotos más caducadas
que el fix previo (+6,2453 puntos porcentuales), hasta confirmar el segundo avance.
No se amplía el umbral de 500 ms ni se ocultan los congelamientos reales del archivo.
La asociación de huecos con `/rest/race/car` sigue pendiente del A/B causal; el adaptador productivo solo consulta standings/sessionInfo.
Estas fotos no certifican continuidad en vivo ni todas las funciones de cada widget.

## Evidencia con movimiento y estructura estática

IA/rivales: **37 identidades** con velocidad Reliable >0,1 m/s, 6.489.107 observaciones y máximo **83,664659 m/s**.
Jugador: 213.749 fotos con velocidad Reliable, entre `2.1425238927657403e-9`
y `0.00011338652365921552` m/s. Vueltas Reliable: **0** en 196.376 fotos.
Acelerador, freno, embrague y volante: mínimo/máximo **0**, 213.749 fotos fiables cada uno.
Los números originales se conservan. El ruido numérico del coche parado no demuestra conducción.
Solo Reliable cuenta para acreditar movimiento; las fotos no son muestras independientes del simulador.
Scoring y telemetry conservan relojes independientes: 196.376 fotos Live no
implican que cada campo del jugador sea fiable; tampoco Stale del scoring
invalida automáticamente un bloque telemetry que sigue publicando. De ahí
los conteos diferentes. Calma/seco REST: 196.373 fotos fiables, 91.119 caducadas
y tres ausentes; banderas: 196.374 fiables, 91.119 caducadas y dos ausentes.

| Widget | Fotos / cambios solicitados | Qué verifica esta captura | Pendiente |
| --- | ---: | --- | --- |
| standings | 287495 / 7746 | Parrilla/IA en movimiento; sin certificar todas las opciones | Orden/gaps de carrera y opciones sin señal. |
| radar | 287495 / 8322 | Parrilla/IA en movimiento; sin certificar todas las opciones | Jugador móvil y proximidad/incidentes controlados. |
| pedals | 287495 / 6718 | Solo estructura del jugador parado | Accionar pedales y volante en conducción. |
| delta | 287495 / 4481 | Solo estructura del jugador parado | Vuelta completa, referencia y delta real. |
| car-damage-visual | 287495 / 4481 | Solo estructura del jugador parado | Golpes, reparación y daño por componente. |
| input-telemetry | 287495 / 91593 | Solo estructura del jugador parado | Inputs variables, ABS/TC/FFB. |
| multiclass-relative | 287495 / 14483 | Parrilla/IA en movimiento; sin certificar todas las opciones | Referencia móvil del jugador y carrera. |
| broadcast-tower | 287495 / 4489 | Parrilla/IA en movimiento; sin certificar todas las opciones | Salida y cambios de posición en carrera. |
| delta-trace | 287495 / 4481 | Solo estructura del jugador parado | Vueltas y trazas reales del jugador. |
| track-map | 287495 / 1 | Poses reales disponibles; mapa no acreditado | Pack/geometría productiva del circuito; poses no acreditan mapa. |
| track-weather | 287495 / 4489 | Clima real observado; sin dinámica de conducción | Presión, rumbo geográfico y pronóstico. |
| car-damage-numbers | 287495 / 4481 | Solo estructura del jugador parado | Evolución de carrocería, aero y suspensión. |
| head-to-head | 287495 / 14289 | Parrilla/IA en movimiento; sin certificar todas las opciones | Comparación competitiva del jugador conduciendo. |
| fuel-strategy | 287495 / 16522 | Solo estructura del jugador parado | Consumo por vuelta, autonomía, servicio y estrategia dinámica. |
| pedals-telemetry | 287495 / 4488 | Solo estructura del jugador parado | Serie de conducción con inputs variables. |
| relative | 287495 / 14290 | Parrilla/IA en movimiento; sin certificar todas las opciones | Jugador conduciendo y gaps de carrera. |
| racing-flags | 287495 / 1 | Solo códigos de bandera efectivamente observados | Transiciones no observadas, formación y salida. |
| fastest-lap | 287495 / 0 | Recepción de tiempos de IA; aviso no cubierto, sin cambios de ingest | Aviso nuevo, vuelta válida del jugador y situaciones de carrera. |

Cambios solicitados son retornos true de ingest, no frames pintados ni una prueba de cada aviso.

## Avisos de sesión y señales ausentes

| Campo | Calidades del archivo completo | Qué acredita |
| --- | --- | --- |
| distance_to_start_line_m | `{'estimated': 196376, 'stale': 91119}` | Distancia longitudinal estimada en práctica, no formación ni posición de salida. |
| finished_at_s | `{'unavailable': 287495}` | No cubierto: falta captura de clasificación/carrera y transiciones reales. |
| next_kind | `{'unavailable': 287495}` | No cubierto: falta captura de clasificación/carrera y transiciones reales. |
| next_starts_at_s | `{'unavailable': 287495}` | No cubierto: falta captura de clasificación/carrera y transiciones reales. |
| scheduled_end_s | `{'reliable': 196376, 'stale': 91119}` | Fin programado de práctica, no final real. |
| start_phase | `{'unavailable': 287495}` | No cubierto: falta captura de clasificación/carrera y transiciones reales. |
| started_at_s | `{'unavailable': 287495}` | No cubierto: falta captura de clasificación/carrera y transiciones reales. |

El footer prueba cierre del archivo, no fin de sesión. No se infiere inicio/fin ni próxima sesión.
Conducción del jugador, evolución de consumo/daño, qualy/carrera, formación y salida continúan pendientes en VANTA-118.
No se certifica fase B ni se cambia VANTA-33 de En curso.

Campos exclusivamente Unavailable en esta pasada (ausencia conservada, no valores cero inventados):

- `/state/cars[]/gap_ahead`.
- `/state/cars[]/gap_class_ahead`.
- `/state/player/damage_aero`.
- `/state/player/damage_body`.
- `/state/player/damage_suspension`.
- `/state/player/delta_best_s`.
- `/state/player/fuel_laps_left`.
- `/state/player/fuel_per_lap_l`.
- `/state/session/finished_at_s`.
- `/state/session/laps_remaining`.
- `/state/session/laps_total`.
- `/state/session/next_kind`.
- `/state/session/next_starts_at_s`.
- `/state/session/start_phase`.
- `/state/session/started_at_s`.
- `/state/session/state`.
- `/state/session/weather_pressure_pa`.
- `/state/session/weather_wind_direction_rad`.

## Reproducción y artefactos

Fuente privada `C:/VantareServer/evidence/grabacion-lmu-imola/sesion.lmu.gz`, 3.006.324.579 bytes.
SHA-256: `8cdca1dfe915e9a6d93300662a52279daf5cd54db83e245959904e33fa3527c1`.
Productor release SHA-256 `10df753370bfd9c6b90b513baec10f315ccdd5d8c7428ddfd395054916c90358`.
Consumidor UI SHA-256 `7acc9d35f1f2211f868089d819f18a73a69150dbe60781a6f7c45292e4b8f9d2`.
Inicio `2026-10-16T15:06:19.0266838+02:00`; fin `2026-10-16T16:06:43.3155238+02:00`. Incluye preflight e ingestión; la compilación release es anterior. No es benchmark.
Artefactos privados `C:/VantareServer/logs/1638-imola-pulido-01/`: summary.json, telemetry.json, widgets.json, report.md y verification.log.
Manifiesto de binarios/estado limpio: `C:/VantareServer/logs/1638-pulido-m6-binaries.json`; cierre: `1638-pulido-m6-end.json`.
Las calidades completas por campo/sesión siguen en widgets.json; el inventario y los errores REST en telemetry.json.
No se versionan cuerpos crudos, nombres de parrilla ni rutas personales.

Sondeo tras 200.000 fotos: RSS combinado **26,76 MiB**; suma de picos acumulados por proceso **29,21 MiB**.
Evidencia `1638-pulido-m6-memory-200k.json`; son medidas puntuales, no cota de RSS ni benchmark.
