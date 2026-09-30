# Revisión del port LMU (ISA-1403 `db524bf7` → `native/runtime`)

Origen: `rust/telemetry/src/{lmu.rs, lmu/*, quality.rs}`. No se porta
`acquisition`, `engine`, `projection`, `ipc`, `assembly`, `delivery`, `core/`
ni `derive/`: el núcleo y las derivaciones son de otra tarea. Se releyó cada
fichero contra el layout, los fixtures y el corpus reales, no solo se copió.

## Defectos y decisiones sobre el original

| # | Hallazgo en el original | Qué se hizo |
| --- | --- | --- |
| 1 | `derive/fuel.rs:40` implementa `FuelValue` para `lmu::Fuel`: `derive` depende de LMU. | No se porta `derive`. Combustible, delta, desgaste y daño tampoco se leen mientras `domain` no los modele (offsets en `lmu.rs:462-534` del original); cuando lleguen serán tipos neutros del dominio, no de LMU. |
| 2 | Builds admitidas fijadas en un `matches!` (`lmu.rs:190`), repetido en `version.rs`. | Una tabla `SUPPORTED_BUILDS` en `frame.rs`; `shm.rs` la reutiliza y un test recorre cada build contra su fixture real. No se hace configurable: sin captura que pruebe el layout de una build nueva, aceptarla sería adivinar. |
| 3 | Las pruebas físicas y el corpus hacían `return` silencioso si faltaba la variable de entorno (`temporal_corpus.rs`, `high_rate_temporal.rs`, `reader.rs`, `process.rs`, `version.rs`, `http.rs`). | El corpus vive en el repo, se verifica su SHA-256 y falta = fallo. Las pruebas con LMU real son `#[ignore = "…"]` (visibles, no silenciosas). |
| 4 | `Poller`: cola de 16 rondas; si el núcleo tarda ~4 s el desbordamiento es fatal (`BacklogOverflow`) y un mutex envenenado hace `expect`/pánico. | Un hueco «última ronda» que se sustituye (la caché solo guarda la última por endpoint, así que nada se pierde) y `PoisonError::into_inner`. Un núcleo lento ya no mata el adaptador. |
| 5 | `TickCadence` usa `Instant` real: no es determinista ni sirve al replay. | Se sustituye por un intervalo mínimo sobre el `now` inyectado (`READ_INTERVAL`). |
| 6 | Un nombre de piloto no UTF-8 rechaza la parrilla entera (`InvalidActiveGrid`), como en Go. | El piloto se lee con pérdida (solo se muestra); circuito, coche y clase siguen siendo estrictos (identidad del REST). |
| 7 | El decodificador REST exigía tipos válidos en campos que nada usa (`position`, `lapsCompleted`, `pitstops`, `numberOfVehicles`, `currentEventTime` ≥ 0): un campo ajeno roto descartaba los números de carrera. | Solo se decodifica lo que se usa (`slotID`, `carNumber`, `vehicleName`, `session`, `trackName`, `yellowFlagState`), con la misma transaccionalidad por cuerpo. |
| 8 | `fuse_player` (posición/vueltas/boxes de REST como respaldo) casi nunca cambia el resultado: la admisión ya rechaza filas sin posición/vueltas válidas, así que solo actuaría con el SHM caducado. `choose_scalar` calcula `conflict` y solo `fusion.rs` lo lee. | No se portan (el frame de SHM caducado se marca así, sin sustituirlo por REST). El SHM manda; el REST solo rellena circuito y tipo de sesión si faltan, y solo si está vigente. |
| 9 | La bandera REST solo cuenta con códigos numéricos 2–5. El corpus real trae `"yellowFlagState":"invalid"`; el vocabulario REST no está verificado y `mYellowFlagState` (SHM, byte 1741) no se consulta. | Se conserva la regla conservadora: amarillo solo con evidencia positiva; si no, `flags` es `Unavailable` y la capacidad `Supported`. |
| 10 | `Field<T>` con procedencia/frescura triple. | Se colapsa en `Quality`: `Invalid` y `Missing` son `Unavailable`. Se pierde solo el matiz de diagnóstico. |
| 11 | `EndpointStatus`/`RestStatus`/`overall_status` (8 estados) que solo el `main` original consumía, más `Unknown`/`Stale` que se ponían a mano. | `fetch` devuelve `Option<Vec<u8>>`; ninguna causa de fallo cambia lo que hace el adaptador (mismo backoff, la caché envejece sola). |
| 12 | `windows-sys` figura en el `Cargo.toml` original pero `reader/process/version` declaran las funciones a mano. | No se añade (ni `time`, ni `serde` derive). Único `unsafe`: `shm.rs`, con `// SAFETY:` en cada bloque; el resto del módulo lo prohíbe (`deny(unsafe_code)`). |

## Cambios de comportamiento que dependen de datos reales

- **Orientación.** `mOri` lleva los ejes locales al mundo **por columnas** (lo dice el
  sidecar; las filas darían una proa girada). Con `lmu-fixture.bin`, la proa `-col2`
  apunta al coche de delante con 0,106 rad de error medio; las otras tres
  convenciones, ≥ 1,25 rad. Plano del dominio: `x = x`, `y = z` (no refleja el mapa) y
  su «derecha» coincide con `-col0`. El corpus de 47 coches no lo valida: están
  todos parados en boxes.
- **`mGamePhase`** (byte 1740) vale 5 en el fixture 1.3.0.0 pero **0 en todos los
  fixtures 1.4.x**, incluso 28 min dentro de una sesión (`lmu-1.4-track`, `et` 1678 s).
  No es fiable: `session.state` queda `Unavailable`. Se implementó y se retiró.
- **`mEndET` < `mCurrentET`** en el corpus (21 605 s frente a 27 172 s): sin tiempo
  restante (`remaining_s` no disponible), regla del original.
- **Pose del jugador y de los rivales** vienen de relojes distintos (telemetría y
  `scoring`): en `lmu-fixture.bin`, el mismo coche está 2,4 m más atrás en `scoring`
  (a 15,6 m/s). Los offsets del radar mezclan ambos. Sin resolver: exige decisión
  del núcleo (extrapolar por velocidad) o del dominio.

## Riesgos aceptados

- `snapshot` copia memoria que otro proceso escribe: formalmente una carrera de datos
  para Rust. Es la práctica habitual y `read_stable` descarta lecturas rasgadas
  (dos copias iguales seguidas), pero no hay garantía formal.
- El mapping se abre por nombre (`LMU_Data`) y el proceso se comprueba aparte
  (un solo `Le Mans Ultimate.exe`, build exacta): no se demuestra que ese proceso sea
  el productor del mapping.
- Una sola fila corrupta rechaza todo el frame (paridad con el original).
- En Windows, un puerto cerrado de loopback tarda más que el plazo de 750 ms en
  rechazarse: con el juego cerrado cada ronda REST bloquea ~1,5 s su hilo (no el
  adaptador) y soltar el `Poller` puede esperar hasta 750 ms.
