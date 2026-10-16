# Imola: verificación offline de práctica — VANTA-33 / #1638

**Resultado histórico.** La [pasada íntegra posterior al pulido](imola-practica-pulido-2026-10-16.md)
repite los 18 widgets con dos avances para recuperar: 196.376 Live y 91.119 Stale
(31,6941 %), 287.495 fotos por widget y cero rechazos. Conserva este informe
los números originales, sin reescribir la evidencia que motivó el arreglo.

**Actualización de frescura:** [investigación y corrección posteriores](imola-frescura-2026-10-16.md)
demuestran huecos reales SHM y un bloqueo de recuperación de 2 s. Tras el arreglo,
Replay/Core completo da 25,4488 % Stale. Los resultados por widget y hashes de
este documento conservan la ejecución original, anterior a esa corrección.

## Fuente y alcance

Grabación privada `C:/VantareServer/evidence/grabacion-lmu-imola/sesion.lmu.gz`,
LMU **1.4.2.0**, Imola, práctica configurada a 6 h, **77 min 18 s** grabados,
38 coches totales. El Alpine #35 del jugador estuvo fuera del garaje pero
parado, sin vueltas ni inputs, según el worker de grabación y el orquestador.
La IA sí rodó. No hubo clasificación, carrera ni vuelta de formación.

Contenedor de **3.006.324.579 bytes**, SHA-256 del worker, cotejado de nuevo en streaming en el servidor:
`8cdca1dfe915e9a6d93300662a52279daf5cd54db83e245959904e33fa3527c1`.
`estado.json`: 261.547 muestras de cada mapping, 159.083 respuestas REST,
una lectura SHM inestable, cierre `complete`. Datos crudos con nombres y paths
privados: no se versionan, extraen íntegros a disco ni publican.

## Resultado del arnés

**Recorrido completo evaluado; cobertura todavía parcial.** Productor y consumidor
terminan con código **0**, **287.495 fotos por cada uno de los 18 widgets**,
**0 rechazos** del adaptador/Core y **261.546 frames LMU_Data estables**.
La lectura inestable se conserva en el archivo y no alimenta el parser.
Inventario: **61 endpoints**, **159.083 respuestas**, **51 con respuestas 200**;
los demás errores/ausencias siguen visibles en `telemetry.json`.

Artefactos: `C:/VantareServer/logs/1638-imola-final-01/` contiene `summary.json`,
`telemetry.json`, `widgets.json`, `report.md` y `verification.log`.
Código Rust evaluado: `acf7d09dcd5559bd855c70863dfd3070ae38961c`.
Verificador release SHA-256:
`f92ef716491c174d552e442eacde0515576a8a95a194c3888564527a3ccd9d2e`.
Test UI SHA-256:
`6c4a803d9ba9cb6cea253e8ee05066dbc0ecfdf7a0618588ca80e68bbc2fed97`.
Hashes y tamaños en `C:/VantareServer/logs/1638-imola-artifacts.json`,
comprobados 16-oct-2026 02:03 UTC.
La evaluación preliminar de 41.555 fotos se canceló para recompilar y no se usa
como resultado. La clasificación Markdown final se regenera desde los JSON
íntegros tras reconocer ruido numérico de velocidad; no se modifican datos ni
calidades y no hace falta reproducir otra vez para cambiar esa presentación.

**Frescura:** 48 fotos `Live` y **287.447 `Stale` (99,9833 %)**. Solo aparece
práctica, sesión id 1: las claves Reliable/Stale del informe son calidades
distintas de esa misma sesión. El recorrido correcto no acredita funcionamiento
continuo ni las 18 funciones completas. No se emiten récords con datos caducados.

**Movimiento real admitido:** 26 identidades de rivales superan 0,1 m/s con
velocidad `Reliable`; 1.248 observaciones, máximo **82,706517 m/s (297,74 km/h)**.
Las 38 filas incluyen al jugador; no son 38 IA. No se afirma movimiento fiable
para todos los rivales durante toda la captura.

**Jugador, solo estructura:** 53 fotos con velocidad fiable entre
`1.0941064948567774e-7` y `1.8003685388777887e-7` m/s, ruido compatible con parado.
Acelerador, freno, embrague y volante: mínimo/máximo **0**, 53 fotos fiables cada
uno. Vueltas: **0**, 48 fotos fiables. Se conservan los números originales;
el umbral de clasificación no cambia telemetría ni relaja frescura.

**RAM:** sondeo a >=240.000 fotos: productor 11.857.920 bytes RSS y consumidor
15.659.008 bytes RSS, **26,24 MiB sumados**. Picos acumulados observados por
proceso en ese punto: 13.414.400 / 16.302.080 bytes. Son medidas puntuales,
no un benchmark. Test UI headless: 4.360,19 s, incluyendo espera al preflight;
no mide el rendimiento del producto.

El recorrido es `Reader → Replay → Translator → Core → DTO → 18 Widget::ingest`,
sin LMU, ventanas, capturas de app ni HTTP. Se verifican hashes por cuerpo,
CRC gzip y footer. Dos pasadas streaming con caché por fuente acotada; nunca
se cargan los 86,92 GB descomprimidos ni el contenedor completo en memoria.

## Qué puede acreditar cada widget

Recibir/proyectar una foto no certifica todas las opciones del widget.
Los valores caducados y ausentes se mantienen como tales.

| Widget | Fotos / cambios solicitados | Evidencia permitida | Sigue pendiente |
| --- | ---: | --- | --- |
| standings | 287495 / 48 | Parrilla/IA: posición, clase, vueltas y tiempos presentes | Orden/gaps de carrera y toda opción sin señal |
| relative | 287495 / 7 | Rivales en movimiento respecto al jugador parado | Referencia del jugador conduciendo, gaps de carrera |
| radar | 287495 / 4 | Poses/velocidades IA frente a referencia estática | Jugador móvil, proximidad/incidentes controlados |
| pedals | 287495 / 5 | Estructura y ceros explícitos del jugador | Accionar pedales/volante en conducción |
| delta | 287495 / 4 | Recepción y ausencia sin vuelta del jugador | Vuelta completa, referencia y delta real |
| car-damage-visual | 287495 / 4 | Estructura y desgaste presente en foto | Golpes, reparación y daño por componente validado |
| car-damage-numbers | 287495 / 4 | Estructura y desgaste presente en foto | Evolución y porcentajes de carrocería/aero/suspensión |
| input-telemetry | 287495 / 33 | Estructura y ceros del jugador | Trazas reales con inputs variables, ABS/TC/FFB |
| multiclass-relative | 287495 / 38 | Clases y rivales IA | Referencia móvil del jugador y orden de carrera |
| broadcast-tower | 287495 / 5 | Clasificación y tiempos de IA | Salida, carrera y cambios de posición de carrera |
| delta-trace | 287495 / 4 | Recepción con jugador sin vuelta | Trazas de vueltas reales del jugador |
| track-map | 287495 / 1 | Poses reales disponibles | Geometría productiva verificada del circuito |
| track-weather | 287495 / 5 | Temperaturas, lluvia y ceros explícitos de calma/seco | Dirección geográfica, presión y pronóstico |
| head-to-head | 287495 / 6 | Datos de los rivales que existan en las fotos | Comparación competitiva del jugador en marcha |
| fuel-strategy | 287495 / 8 | Nivel/capacidad/energía presentes; jugador estático | Consumo por vuelta, autonomía, servicio y estrategia dinámica |
| pedals-telemetry | 287495 / 12 | Estructura y ceros del jugador | Serie de conducción con inputs variables |
| racing-flags | 287495 / 1 | Solo códigos/banderas efectivamente presentes | Transiciones de bandera y fases no observadas |
| fastest-lap | 287495 / 0 | Vueltas/tiempos presentes de IA | Vuelta válida del jugador y situaciones de carrera |

Cambios solicitados cuenta retornos `true` de `Widget::ingest`, no todas las
mutaciones del ViewModel ni frames pintados. `fastest-lap=0` significa que no
se observó un aviso nuevo: el primer dato establece referencia silenciosa y
las fotos posteriores caducadas no permiten anunciar récords. No es una
validación positiva de notificación de vuelta rápida. Banderas tiene 46 fotos
fiables, 287.447 caducadas y 2 ausentes: no acredita transiciones ni todas las
variantes. Tiempos IA presentes no validan todos los avisos del widget.

La geometría no se inventa a partir de coches: el widget de mapa necesita un
pack de pista. Poses disponibles no demuestran que el mapa se pinte.

## Avisos de sesión

`started_at_s`, `finished_at_s`, `start_phase`, `next_kind` y `next_starts_at_s`
siguen sin productor demostrado. El REST de agenda solo contiene PRACTICE;
no anuncia una sesión siguiente con hora fiable. `gamePhase=5` durante esta
práctica no valida una equivalencia de fase de carrera.

`scheduled_end_s` es el fin **programado** SHM; no es el instante real de fin.
La primera foto tiene SHM `mEndET=21605`, frente a REST `endEventTime=86400`
y `maxTime=21600`: no se intercambian estos relojes. Los metros longitudinales
estimados hasta meta en práctica tampoco representan la casilla de parrilla
ni el punto de activación de una salida lanzada. Detener esta grabación parcial
no permite emitir «fin de sesión».

| Campo de Avisos | Reliable / Estimated | Stale | Unavailable |
| --- | ---: | ---: | ---: |
| `distance_to_start_line_m` | 0 / 48 | 287447 | 0 |
| `finished_at_s` | 0 / 0 | 0 | 287495 |
| `next_kind` | 0 / 0 | 0 | 287495 |
| `next_starts_at_s` | 0 / 0 | 0 | 287495 |
| `scheduled_end_s` | 48 / 0 | 287447 | 0 |
| `start_phase` | 0 / 0 | 0 | 287495 |
| `started_at_s` | 0 / 0 | 0 | 287495 |

## Cambios admitidos y límites

El REST real confirma `windSpeed.{velocity,x,y,z}=0` y `averagePathWetness=0`.
El adaptador admite calma/seco cuando SHM no ofrece el valor y la respuesta es
actual, posterior al cambio de sesión y del mismo circuito/tipo. Conserva
`Stale` si SHM caduca. No deduce unidades de viento positivo ni rellena presión,
rumbo o previsión. Fixture REST saneada y regresiones de ausencia/identidad/TTL.
En el archivo real, viento y humedad tienen **45 fotos Reliable con cero**,
287.447 Stale y 3 Unavailable cada uno: el respaldo se demuestra en el recorrido
real, sin convertir la ausencia inicial en cero.

Garaje devuelve `vehicleDamage=1.2112407684326172`; la UI del juego lo multiplica
por 100 para una barra, pero no demuestra una integridad normalizada 0–1.
No se transforma en 121 % ni se recorta a 100 %. Tampoco se enlaza estrategia
por nombre de piloto: no es identidad estable. Estos endpoints se conservan
como evidencia privada, sin convertirlos en productores arbitrarios.

En los primeros 10 s se observan pausas de aproximadamente un segundo entre
avances SHM. La preliminar contiene muchas fotos caducadas. No se relajan los
500 ms ni los 2 s de recuperación para obtener un informe verde. El resultado
final cuantifica esas fuentes/valores fiables y caducados por separado.
Replay no confirma un proceso de juego vivo: no declara la pausa confirmada
que sí puede declarar el adaptador live. Sus estados caducados no equivalen
por sí solos a demostrar cómo se comportaría una pausa confirmada en vivo.

## Checks y trazabilidad

**Tras sincronizar nightly (`6db5879f5`):** Clippy workspace/all-targets
-D warnings PASS; Nextest `--workspace --profile ci` para runtime/domain/ipc,
incluyendo todos los corpus de telemetría: **673/673 PASS**, 5 skips,
109,76 s de tests. Fmt PASS. Logs `C:/VantareServer/logs/1638-postsync-*`.
Los siguientes resultados corresponden al código y binarios del replay original:


- Clippy workspace/all-targets -D warnings: PASS.
- Nextest runtime/domain/ipc con workspace: **646/646 PASS**, 5 skips;
  los cuatro tests de proceso Services pasan al incluir su binario.
- Telemetría: **32/32 PASS**, 1 skip (incluye oráculos reales LMU/ACC).
- Regresión UI de separación IA/jugador: **1/1 PASS**; arnés completo: **1/1 PASS**.
- Python: **7/7 PASS**, con ruido real de velocidad, falta de datos y casos
  de movimiento/vueltas/inputs que impiden clasificar como jugador parado.
- Gates en serie por la cola con `VANTARE_CARGO_MIN_GB=0`, target propio.
  Logs `C:/VantareServer/logs/1638-imola-final-*`.
- UI completa y lifecycle omitidos por alcance/RAM: UI solo cambia instrumentación
  cfg(test), sin renderer; no cambia supervisión de procesos. No hay capturas
  de app (#1655), integración de canales ni release.

Se conservan los fallos intermedios: Clippy detectó un literal raw innecesario
en el test, ya corregido. La primera telemetría detectó que el oráculo v9 no
incluía los ceros de clima recién admitidos; se canceló su test ACC aún activo
porque era una ejecución ya fallida, y se repitió completo tras corregir la vista
de compatibilidad. No se cambian goldens, hashes ni tolerancias. Solo los ceros
exactos de viento/humedad añadidos por REST se muestran como ausencia en esa
vista histórica; el test con REST real verifica su semántica positiva aparte.

T3 declara este turno con razonamiento `medium`; no se relanzan workers ni se
asume que el encargo se haya invocado con `high`. No hay delegación.

## Entrega y canal

Rama `vantareapp/isa-1638-telemetria-lanzamiento`, base ya fusionada
`nightly@354c207aa2dddbccee2c8d899d632d4c39b55449`, sincronización local
`6db5879f5` tras detectar conflicto remoto en README. Se conserva DTO v11,
Services v10 y derechos v5. El encargo original autorizaba merge de nightly
y resolución de conflictos. Código Rust del replay evaluado: `acf7d09dc`.

La sincronización no cambia adapter/Core/codec LMU, domain, DTO de fotos,
registro, instrumentación ni proyecciones de los widgets; `git diff dd029a9be`
confirma esos blobs intactos. Los cambios de derechos/control y perfiles de
compilación se comprueban con gates nuevos; no se repite el replay completo
para una ruta de datos que no ha cambiado. La evidencia conserva SHA de los
binarios realmente utilizados, anteriores a la sincronización.
[PR draft #1664](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1664)
a nightly. VANTA-33, proyecto Vantare, sigue **En curso**: la fase B es parcial.
No se ha integrado ni publicado una release. El fichero bruto permanece local;
solo se versiona la fixture REST saneada y esta evidencia agregada.

## Siguiente evidencia necesaria

Captura con el jugador conduciendo: inputs, varias vueltas completas válidas,
consumo y parada/servicio. Después, captura de transiciones práctica → qualy →
carrera, formación y salida, y final real/cambio de sesión. Mantener tiempos
de captura anteriores y posteriores a cada transición. No abrir LMU en el
servidor. No se modifica la rama #1653/#1660 ni se certifica aún la fase B.
