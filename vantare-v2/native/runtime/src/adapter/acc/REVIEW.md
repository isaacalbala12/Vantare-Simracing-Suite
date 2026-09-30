# ACC — revisión y evidencia (ISA-1425)

## Fase 6 — ISA-1431 (2026-09-30)

Microplan: `docs/superpowers/plans/2026-09-30-fase-6-acc-completo.md`.
Worker Codex, revisión de diff pendiente de Opus 5.5. Base `e172eb3f`;
solo commits locales, sin push/PR/merge. Notion indisponible con excepción
expresa del encargo; no se declara seguimiento remoto completado.

El corte de fusión mantiene UDP actual frente a SHM obsoleta o inválida del
jugador (posición, vueltas, tiempos, boxes, sector, pose y progreso).
`live::poll` ahora conserva el avance de recepción UDP aunque sus valores no
cambien; antes podía declarar silencio de una fuente que seguía publicando.
Temperaturas UDP (bytes °C +273.15) completan physics ausente/obsoleta; nunca
refrescan viento ni las entradas del jugador. SHM tiene prioridad cuando actual.
Gap de 0 ms válido para posición >1; Int32::MAX/negativos siguen ausentes.

**Corrección de la tabla histórica de fuel de abajo:** el PDF Kunos 1.8.12
documenta physics.fuel @12 en kg y no da unidad de static.maxFuel @416.
Hasta resolver físicamente la discrepancia, ambos quedan `Unavailable` en el
modelo de litros. No se usa densidad inventada ni `Estimated` para disfrazar
una unidad desconocida. Graphics.fuelXLap @1284 sí declara litros por vuelta:
positivo y finito → Reliable; fuelEstimatedLaps @1412 → Estimated.
Ambos caducan con graphics (500 ms/pausa). El núcleo respeta el dato nativo y
no deriva consumo histórico sin un nivel en litros. `numberOfLaps` @172 está
documentado como completadas, no duración: `laps_total` sigue ausente.

Regresiones: tres tests rojos antes de fusión (`acc-f6-cut1-red.log`) y uno de
UDP sin cambios (`acc-f6-live-red.log`); 26 tests ACC pasan después.
Workspace test PASS en corte 1; fmt workspace falla en `ui/src/app.rs:385`
(ajeno). Primer clippy global: E0425 en UI; se comprueba tras regenerar solo
los artefactos domain: clippy workspace PASS tras limpiar únicamente ese
paquete del target propio, sin editar fuentes ajenas. Runtime clippy PASS.
Logs en `C:/tmp/acc-f6-*.log`.
El corpus real y su hash no se alteran; los nuevos vectores no son capturas.

La aceptación completa sigue pendiente de capturas físicas y resolución de
las unidades del nivel/capacidad; no se declara ACC completo en producto.

### Grabadora (corte 2)

Antes del arreglo, dos tests FAIL demuestran packet de blob distinto y
renovación tras tres segundos sin feed; tras el arreglo, 17 tests PASS.
Se exige packet antes/blob/después coincidente y se leen mappings volátiles.
ACK fijo de nueve bytes + texto acotado sustituye el cursor propio; 0 = readonly,
UTF-8 inválido/truncamiento/trailing se rechazan. El texto del servidor no se
guarda ni muestra. Config UTF-16 inválida/truncada y puerto cero se rechazan.
Registro sin commandPassword; requests conservan ID y UNREGISTER solo `[9]`,
según el SDK. Renovación después de 10 s de silencio con retirada previa;
reintento de handshake 2 s en el mismo puerto, envío no cuenta como recepción.
Un nuevo ACK no cancela la suscripción recién admitida. Máximo 256 datagramas
por vuelta y solo desde el endpoint configurado; SHM puede seguir capturándose.
Formato del corpus intacto. El umbral 10 s es tolerancia de reconexión, no
frescura: las señales ya caducan a 500 ms/1 s en el adaptador.
No se afirma haber demostrado la causa de silencios periódicos de ACC ni cero
pérdida UDP del sistema operativo. Nueva captura física >5 min pendiente.

## Clima y daños — fase 2 (ISA-1427)

Alcance del worker: solo adaptador ACC y tests ACC; sin dependencias nuevas.
Base del encargo `6973c81f`, rama `vantareapp/isa-1427-w-adapt-acc`.
Notion no disponible: excepción expresa de Isaac; el orquestador mantiene el
handoff y seguimiento al revisar. Sin push, PR, merge ni promoción.

Fuentes: SDK Kunos v4 (`C:/tmp/fase1/acc-sdk.cs`, solo Broadcasting) y
[documentación SHM Kunos 1.8.12, espejo PDF](https://github.com/rrennoir/PyAccSharedMemory/blob/main/ACCSharedMemoryDocumentationV1.8.12.pdf).
Los offsets corresponden al layout SHM 1.9 ya admitido por el adaptador.

| Campo común | Fuente / conversión | Calidad |
|---|---|---|
| Temperaturas aire/pista | physics `airTemp` @288 / `roadTemp` @292, °C + 273.15 = K | Reliable; Stale a 500 ms sin cambio de packet o physics cero/pausa |
| Velocidad del viento | graphics `windSpeed` @1248, ya m/s | Reliable; Stale con graphics congelada/pausa |
| Lluvia | SDK UDP `RainLevel`: byte / 10 | Reliable; Stale a 1 s sin actualización de sesión/pausa |
| Lluvia sin UDP fresco | graphics `rainIntensity` @1560, solo NO_RAIN = 0 tiene equivalencia exacta | Reliable/Stale según graphics; categorías 1..5 sin fracción quedan Unavailable |
| Humedad de pista | SDK UDP `Wetness`: byte / 10 | Reliable/Stale según UDP; no inferida del grip |
| Dirección del viento | graphics @1252 declara radianes, sin norte/sentido/procedencia documentados | Unavailable; falta demostrar equivalencia con el contrato común |
| Presión | No expuesta; `airDensity` no usada | Unavailable |
| Aero / carrocería | `carDamage[5]` @224: zonas front/rear/left/right/centre, sin escala normalizada ni división aero/body | Unavailable; falta contrato de conversión, tampoco interpretar ceros como coche intacto |
| Suspensión / goma restante | SDK marca `suspensionDamage[4]` @664 y `tyreWear[4]` @120 como no usados | Unavailable incluso si contienen valores no cero |

`trackGripStatus` @1556 mezcla goma/grip y humedad; no permite una fracción
de pista mojada. Los pronósticos de lluvia no son lluvia actual. Static no
expone clima actual ni integridad: tasas de ayudas/desgaste no son medidas.
No se interpola el enum de lluvia /5 ni el de grip /6. Temperaturas inferiores
a cero absoluto, NaN/infinito, viento negativo y fracciones fuera de 0–1
se rechazan por señal. OFF retira el clima; UDP/rivales no refrescan SHM.

Capacidad `weather`: Supported / WithData / Fresh según señales disponibles.
`damage`: Unsupported para este contrato; no se declara soporte a través de
campos heredados sin semántica utilizable.

Tests nuevos en `runtime/tests/acc/weather.rs`: unidades y exclusiones,
fracciones UDP no cero y fuera de rango, congelación independiente, packet
repetido, pausa/physics cero/OFF, enum de lluvia y corpus real obligatorio.
La primera physics del corpus contiene 30.9055118560791 °C y
39.66082000732422 °C: se esperan 304.0555118560791 K y
312.8108200073242 K, calculados desde los bytes crudos y la conversión SI.
La primera REALTIME_UPDATE UDP está en 11.8011902 s: la prueba recorre hasta
12 s y exige también las fracciones reales de lluvia/humedad (ambas 0).
El corpus sigue intacto y no prueba viento/lluvia/daño en marcha; esos límites
se prueban con vectores explícitos, sin presentarlos como capturas físicas.

Verificación manual: reproducir el corpus con el comando de la sección
«Reproducir», comprobar clima en la foto común; después probar ACC con lluvia,
pausa y vuelta al menú. Una captura con daños y una especificación de su
escala son necesarias antes de habilitar integridad. No hay referencia Go ACC.
Revisión de diff y decisión sobre estas señales pendientes del orquestador.

Gates finales (2026-09-30, antes del commit local): `cargo fmt --check` PASS,
`cargo clippy --workspace --all-targets -j 2 -- -D warnings` PASS,
`cargo test --workspace -j 2` PASS. Los 21 resúmenes estándar suman 284 tests
pasados y 4 ignored físicos; el harness lifecycle ejecuta otros 7 escenarios.
Los seis tests nuevos y los dos de conformidad ACC pasan. Sin prueba física
de ACC/LMU ni CI remota. Logs locales: `C:/tmp/acc-phase2-fmt.log`,
`C:/tmp/acc-phase2-clippy-final.log`, `C:/tmp/acc-phase2-test-final.log`.
Se conserva el primer clippy con tres avisos de estilo corregidos y la primera
suite que reprodujo la ventana insuficiente del test (1 s antes del UDP).

[GitHub #1425](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1425).
Worker Codex; revisión del diff completo pendiente de Opus 5.5.
Base `aef0bbf7`, rama `vantareapp/isa-1425-fase1-accad`. Solo commits locales;
Notion indisponible y sustituido por GitHub por instrucción expresa de Isaac.

## Decisiones

- Un traductor privado para replay/live. Modelo y proyecciones existentes;
  en `domain` solo se añade `acc` a `SIMULATORS`. Sin dependencias nuevas.
- Broadcasting según [SDK Kunos v4](https://github.com/nicholasxuu/ACC_broadcasting/blob/master/ksBroadcastingNetwork/BroadcastingNetworkProtocol.cs).
  Socket loopback no bloqueante, registro sin contraseña de comandos,
  reintentos con el mismo puerto hasta ACK; lista ante coche/piloto desconocido
  (máximo 1/s), pista hasta respuesta, UNREGISTER antes de reconectar/cerrar.
  `broadcasting.json` admite UTF-16LE con/sin BOM, UTF-8 y ambas grafías del puerto;
  carpeta Documentos del shell (también redirigida). No se imprimen contraseñas.
- SHM 800/1588/820 B, `smVersion=1.9` inicializada; Win32 solo en `shm.rs`,
  con SAFETY y handles/vistas RAII. Packet antes/copia/después, incluida
  concordancia del packet copiado; static por dos copias iguales. Contadores
  independientes. Frescura SHM 500 ms, UDP por coche/reloj 1 s; OFF retira
  señales, pausa/physics a cero conservan el último valor como obsoleto.
- `carIndex == carID`, buscando el hueco real del jugador (no indexando por ID).
  CarId nativo por sesión, DriverId asignado por nombre sin colisiones de hash.
  Clase = cupCategory, posición de clase = cupPosition; no equivale a GT3/GT4.
  Sesión nueva por pista/tipo/índices o retroceso del reloj; descarta las cachés.
- Relojes en segundos: graphics.sessionTimeLeft y UDP están en ms;
  `sessionEndTime` UDP contiene **tiempo restante** en el corpus (elapsed +
  end = 3600 s). `source_time=None`; `clock` no es un reloj monotónico de sesión.
- Mejor/última vuelta y contador se congelan entre spline 0.93–0.07, para
  UDP y jugador. Primera muestra como base; se confirma al salir de la ventana.
  Int32::MAX no es un tiempo. `lastSectorTime` SHM no se convierte en sectores
  de la última vuelta: UDP aporta esos splits; el modelo no tiene validez de vuelta.
- Replay verifica SHA de ambos miembros, checksum tar y CRC gzip antes de
  publicar. Dos lectores gzip en streaming, sin extracción ni corpus en RAM;
  desempate SHM antes de UDP. `received_at` es el instante grabado, no el de poll.
  Da error ante truncamiento/esquema/UDP roto; nunca oculta un error como EOF.

## Corpus real y calidad

`acc-sesion-udp-20260929.tar.gz`, hash congelado
`422481dc88b1e7f9cb9ebaf025cc615d08453bea8fded36ca881b996ba386071`.
Declara acVersion 1.7 / smVersion 1.9; Monza, práctica, 120 s con IA.
47 651 physics, 7 917 graphics, 1 static, 134 901 UDP. Player parado en pit lane.
Tres physics tienen packet de cabecera/blob distintos (+1), en 86.9540221,
88.281471 y 90.8264293 s: **descartados y contados**, corpus intacto.
La grabadora queda fuera del alcance; revisar allí la estabilidad de su copia.

| Señal | Fuente | Resultado real |
|---|---|---|
| Jugador, inputs, marcha, velocidad, rpm | SHM | Reliable; CarId 0, gas/freno 0, N, casi 0 m/s, 1982 rpm traducidos a rad/s |
| Combustible / delta propio | SHM | Reliable 62/120 L y delta 0; no demuestra consumo ni signo en marcha |
| Banderas / boxes | SHM jugador, UDP rivales | Reliable verde de sesión; jugador en pit lane, rivales en pista/boxes |
| Posiciones, cup, pilotos, números | UDP | Reliable, 32 identidades estables; clasificación global y por cup coherentes |
| Vueltas, tiempos, splits | UDP / SHM jugador | Reliable cuando presentes; best/last del jugador ausentes (Int32::MAX) |
| Pose | SHM jugador, UDP rivales | Reliable; plano x/z y yaw = π/2 + heading/yaw; error medio 0.017006 rad frente al movimiento en 41 879 muestras de rivales |
| Distancia de vuelta | spline × TRACK_DATA | Estimated; longitud Reliable 5793 m |
| Reloj / estado | SHM + UDP phase | Frescos; fase 5 = Running; inferencias de SHM son Estimated |
| Gaps / duración en vueltas | Sin dato válido | Gaps Supported, derivados por núcleo común; laps_total ausente, numberOfLaps ambiguo |

Conformidad: **190 308 observaciones**, 32 coches/identidades, 133 muestras de
Standings/radar/pedales con rivales cercanos; relabelar solo Source a LMU no cambia
ningún ViewModel. El DTO común conserva `acc` y las proyecciones sin tocar IPC/UI.
Replay a dos ritmos compara 80 000 eventos con sus tiempos reales, incluyendo
registro, lista y pista. Las pruebas de regresión están en `runtime/tests/acc/`;
sus vectores y el servidor loopback no son capturas del juego.

## Límites y dudas para revisión

- Sin ACC activo en el PC durante esta entrega: Win32 y loopback sí probados;
  prueba física `acc_live` visible como ignored. Ejecutarla en sesión con UDP.
- Sin MP/IDs ≥1000, relevos, OFF/pausa, cambios de sesión/pista, amarillas/roja ni
  delta no cero en este corpus. Cubiertos con regresiones, pendientes de captura real.
- Fuel se interpreta en litros como los lectores de ACC; el PDF lo llama kg.
  Player parado no permite validar esa unidad ni consumo. ¿Confirmar con repostaje?
- No interpretar numberOfLaps como total sin nueva evidencia; no inferir modelo
  GT3/GT4 desde cupCategory ni inventar flags a partir de eventos puntuales.
- La estabilidad convencional de shared memory externa no es una garantía formal
  de atomicidad entre páginas. Orientación física del jugador en marcha pendiente.

## Reproducir

Desde `native/`: `cargo test -p vantare-runtime --test acc_conformance -- --nocapture`.
Gates por hito: `cargo fmt --check`,
`cargo clippy --workspace --all-targets -j 4 -- -D warnings`,
`cargo test --workspace -j 4`. Logs locales en `C:/tmp/fase1/acc-m1-*.log`
y `acc-m2-*.log`; también se conserva la reproducción de fallos antes de arreglarlos.
Ambos hitos PASS en los tres gates. Primer hito: 224 tests pasados, 2 ignored;
segundo: 238 pasados, 3 ignored (dos físicos de LMU y uno de ACC).
Manual: `cargo run -p vantare-runtime --bin vantare-core -- --simulator acc --replay ../testdata/acc/acc-sesion-udp-20260929.tar.gz`;
en sesión real, sustituir replay por `--live`, o ejecutar
`cargo test -p vantare-runtime --test acc_live -- --ignored --nocapture`.
