# ACC — revisión y evidencia (ISA-1425)

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
