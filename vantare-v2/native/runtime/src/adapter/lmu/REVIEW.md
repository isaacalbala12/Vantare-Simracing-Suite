# Revisión del port LMU (ISA-1403 `db524bf7` → `native/runtime`)

## Segunda ronda — #1428 / #1427 (2026-09-30)

Semántica comprobada en el [header del SDK InternalsPlugin](https://github.com/cosimo/rFactor2-DeltaBest/blob/master/Include/InternalsPlugin.hpp)
(copia del header de ISI), y offsets contra `internal/telemetry/drivers/lmu/layout.go`
y `format.go`. El SDK describe `mNumPenalties` como sanciones pendientes y la
matriz como transformación de vectores locales al mundo mediante sus filas.

`Car.velocity_mps` es `[x, y]` en m/s del plano de `Pose`, no velocidad
escalar ni derivada de posiciones. Scoring `mLocalVel` @288 y `mOri` @336
(fila de 584 bytes) se transforman con la función existente `world_velocity`:
columnas locales al mundo, dominio x = LMU x e y = LMU z. Cada coche, incluido
el jugador, usa el par de scoring y su reloj/frescura. No se mezcla una
orientación de telemetría con velocidad de scoring. Matriz no ortonormal,
vector no finito o resultado no finito → `Unavailable` (núcleo sanea resultado).
La pose del jugador sigue usando telemetría y la alineación de poses rivales
se conserva. No se añade ninguna derivación de velocidad ni lector paralelo.

`mNumPenalties` @194, int16 no negativo, es el **número de sanciones pendientes**
por coche, incluido el jugador (`State::player_car`). Cero es dato presente.
El SDK/mapper Go expone contador, no tipos, causas, plazos ni número histórico
de sanciones recibidas o cumplidas; estos datos no se infieren. Negativo rechaza
la fila/frame conforme al validador existente. Ambas señales caducan con
scoring y con el silencio del núcleo, sin recuperar valores de fotos anteriores.

Pruebas: fixture real admitido con mutaciones explícitas para vector local,
rotación de 90 grados, contador 3/negativo, NaN/matriz inválida y 500 ms de
silencio. Son vectores de frontera, no capturas físicas con sanciones.

Origen: `rust/telemetry/src/{lmu.rs, lmu/*, quality.rs}`. No se porta
`acquisition`, `engine`, `projection`, `ipc`, `assembly`, `delivery`, `core/`
ni `derive/`: el núcleo y las derivaciones son de otra tarea. Se releyó cada
fichero contra el layout, los fixtures y el corpus reales, no solo se copió.

## Defectos y decisiones sobre el original

| # | Hallazgo en el original | Qué se hizo |
| --- | --- | --- |
| 1 | `derive/fuel.rs:40` implementa `FuelValue` para `lmu::Fuel`: `derive` depende de LMU. | No se porta `derive`. El adaptador ya lee combustible y delta nativo, y el núcleo deriva `per_lap_l`/`laps_left` (ISA-1425). ISA-1427 incorpora clima y goma restante al modelo neutral ya existente; las integridades sin equivalencia fiable permanecen ausentes (ver entrega de fase 2 abajo). |
| 2 | Builds admitidas fijadas en un `matches!` (`lmu.rs:190`), repetido en `version.rs`. | Una tabla `SUPPORTED_BUILDS` en `frame.rs`; `shm.rs` la reutiliza y un test recorre cada build contra su fixture real. No se hace configurable: sin captura que pruebe el layout de una build nueva, aceptarla sería adivinar. |
| 3 | Las pruebas físicas y el corpus hacían `return` silencioso si faltaba la variable de entorno (`temporal_corpus.rs`, `high_rate_temporal.rs`, `reader.rs`, `process.rs`, `version.rs`, `http.rs`). | El corpus vive en el repo, se verifica su SHA-256 y falta = fallo. Las pruebas con LMU real son `#[ignore = "…"]` (visibles, no silenciosas). |
| 4 | `Poller`: cola de 16 rondas; si el núcleo tarda ~4 s el desbordamiento es fatal (`BacklogOverflow`) y un mutex envenenado hace `expect`/pánico. | Un hueco «última ronda» que se sustituye (la caché solo guarda la última por endpoint, así que nada se pierde) y `PoisonError::into_inner`. Un núcleo lento ya no mata el adaptador. |
| 5 | `TickCadence` usa `Instant` real: no es determinista ni sirve al replay. | Se sustituye por un intervalo mínimo sobre el `now` inyectado (`READ_INTERVAL`). |
| 6 | Un nombre de piloto no UTF-8 rechaza la parrilla entera (`InvalidActiveGrid`), como en Go. | El piloto se lee con pérdida (solo se muestra); circuito, coche y clase siguen siendo estrictos (identidad del REST). |
| 7 | El decodificador REST exigía tipos válidos en campos que nada usa (`position`, `lapsCompleted`, `pitstops`, `numberOfVehicles`, `currentEventTime` ≥ 0): un campo ajeno roto descartaba los números de carrera. | Solo se decodifica lo que se usa (`slotID`, `carNumber`, `vehicleName`, `session`, `trackName`, `yellowFlagState`), con la misma transaccionalidad por cuerpo. |
| 8 | `fuse_player` (posición/vueltas/boxes de REST como respaldo) casi nunca cambia el resultado: la admisión ya rechaza filas sin posición/vueltas válidas, así que solo actuaría con el SHM caducado. `choose_scalar` calcula `conflict` y solo `fusion.rs` lo lee. | No se portan (el frame de SHM caducado se marca así, sin sustituirlo por REST). El SHM manda; el REST solo rellena circuito y tipo de sesión si faltan, y solo si está vigente. |
| 9 | El corpus real trae `"yellowFlagState":"invalid"`; la equivalencia REST/SDK no está verificada y `mYellowFlagState` (SHM, byte 1741) no se consulta. El port aceptaba fracciones entre 2 y 5, a diferencia de Go. | ISA-1425 corrige el contrato candidato: solo valores numéricos exactamente 2, 3, 4 o 5 afirman amarillo global. Sin esa evidencia, `flags` es `Unavailable` y la capacidad `Supported`; sigue pendiente certificar la fuente con una captura positiva. |
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
- **Pose del jugador y de los rivales** venían de relojes distintos (telemetría y
  `scoring`): en `lmu-fixture.bin`, el mismo coche está 2,4 m más atrás en `scoring`
  (a 15,6 m/s). Resuelto dentro del adaptador (ISA-1425): con el jugador, presente
  en ambos flujos, se estima `Δt = dot(pos_tel − pos_scoring, v_mundo) / |v_mundo|²`
  (0 si va a menos de 1 m/s) y cada rival se extrapola `pos += v_rival_mundo · Δt`.
  En el fixture Δt = 0,1813 s y el jugador queda a 0,00014 m de su pose rápida.

## Señales de la fase 1 (ISA-1425)

Pendientes de fase 0 que quedan cerrados: la lectura de combustible, delta,
sector, distancia de vuelta, tiempo de vuelta, vueltas totales y longitud del
circuito (antes descartadas), y la alineación de relojes entre `scoring` y
telemetría. Criterios de validez, medidos contra los fixtures reales:

- **Combustible del jugador** (telemetría +524/+608): litros y capacidad; el par
  vale solo si ambos son finitos, la capacidad > 0 y 0 ≤ nivel ≤ capacidad. Un
  par inválido deja ambas señales `Unavailable`.
- **Delta nativo** (+696): vale si es finito y |delta| < 10 000 s; un delta
  negativo (más rápido) es válido.
- **Sector en curso** (`scoring` +102): `mSector` 0 = último sector, 1 = S1,
  2 = S2, y se publica como índice desde 0 (1 → 0, 2 → 1, 0 → 2). El sidecar del
  fixture etiqueta el byte como `SECTOR{byte+1}`, que no es la convención del SDK.
- **Distancia de vuelta** (`scoring` +104): una distancia negativa (posición
  anterior a la línea de meta) queda `Unavailable`; el resto viaja en metros.
- **Tiempo de la vuelta en curso** (`scoring` +464): vale si es finito; si todos
  los coches lo traen exactamente a 0 y las distancias de vuelta difieren, es un
  marcador del simulador y se descarta (si no, se publicaría 0,00 s a mitad de
  vuelta). `last_sectors_s` sigue vacío: el layout no trae tiempos de sector.
- **Vueltas totales** (`mMaximumLaps` @1716): 0 (sesión por tiempo) y `i32::MAX`
  (sin límite) quedan `Unavailable`, igual que un negativo; cota de cordura 10 000.
- **Longitud del circuito** (@1720): > 0 y finita; los fixtures 1.4.x sin
  longitud (`0.0`) la dejan `Unavailable`.

Capacidades `fuel`, `delta`, `sectors` y `lap_progress` con el criterio habitual
(`Fresh` con dato fresco, `WithData` con dato caducado, `Supported` sin dato; en
los menús, `Supported`). Valores reales: el corpus de 47 coches trae 50/75 L,
delta 0,0, S1, 269,02 m, 4,236 s y 13 623,97 m de circuito; `lmu-fixture.bin`
99,59/100 L, delta 0,0, S1, 1068,23 m y 4655,11 m con el cronómetro sin dato.

## ISA-1425 — investigación de fase y banderas LMU 1.4 (2026-09-29)

Worker Codex, rama `vantareapp/isa-1425-f1-lmu-sesion`, base
`f0254e1f354970c06130775c92edc0a4e21cd9e6`. Referencia técnica:
[#1425](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1425),
ADR 0099 y plan de arquitectura Rust nativa. Notion no disponible según el
encargo; Isaac autoriza trabajar solo con GitHub en esta entrega. No se declara
actualización de Notion ni aceptación de la fase 1. La revisión e integración
corresponden al orquestador; este worker no hace push, PR ni merge.

**Resultado: no se encontró una fuente fiable de fase en LMU 1.4.** El bloqueo
es de evidencia, no se resuelve convirtiendo un cero en una sesión en marcha:

| Fuente comprobada | Evidencia y consecuencia |
| --- | --- |
| Driver Go productivo | `internal/telemetry/drivers/lmu/layout_test.go:232-238,276-285` excluye `game_phase`, `yellow_flag_state`, `sector_flags` y `vehicle_flag` de la allowlist. `rest.go:252-259,638-678` ignora `gamePhase` y `sectorFlag` en cualquier forma; solo admite el contrato candidato de amarillo global con códigos exactos 2, 3, 4, 5. |
| Monitores Go | `internal/engineer/flags/monitor.go:63-67,261-318` consume fase 3/4 (preparación), 5 (verde), 6 (FCY) y sectores ya traducidos a strings; `sessionend/monitor.go:21-27,104-105` considera 7 y 8 fin de sesión. Son consumidores, no lectores ni evidencia de que esas señales lleguen. |
| Entrada productiva de Engineer | `internal/engineer/projectioninput/adapter.go:74` declara la familia flags deshabilitada porque fase y banderas no están disponibles. `adaptSession` (`:351-376`) no rellena `GamePhase` ni `SectorFlags`; el modelo legacy y los tests de los monitores no certifican una fuente LMU 1.4. |
| Diez fixtures SHM 1.4.x | Pista, menú, outlap, pre-pit, pit y garage 1.4.0.0; pista/menú 1.4.1.3 y 1.4.2.0: @1740 y @1741 son 0; +504 de cada fila activa es 0. El cero no permite distinguir formación, verde, FCY, parada o fin, ni afirmar verde/ausencia de banderas. |
| Seis JSON `testdata/lmu-*-rest-*-fixture.json` | Son snapshots procesados `vantare.lmu-rest-overlap.v1`, no cuerpos crudos del endpoint. Solo conservan circuito, tipo, reloj y número de coches; no contienen fase ni banderas. No se deben alimentar al decoder de `sessionInfo` como si fueran respuestas REST. |
| Corpus `testdata/rust-port/lmu47-high-rate-60s.tar.gz` | Sus 239 cuerpos crudos `sessionInfo` traen `yellowFlagState: "invalid"` y ninguno trae `gamePhase`, `sectorFlag` o `sectorFlags`; las filas de standings solo traen identidad, dorsal, posición, vueltas, jugador y paradas. No aporta una captura positiva de estas señales. SHA-256 fijado por `lmu_conformance.rs`: `c5b827ce1cfa558e732da934f11eb0f83f5dfb9e8a3c793f4d3f65ef8ca2a01c`. |

También se leyó el SDK instalado en
`C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\Support\SharedMemoryInterface\InternalsPlugin.hpp`,
SHA-256 `9b6ee8cf610fa5049b18df580a9a9bc9ebb91346fc466584d576a6442abcf68f`:
`:507-530` documenta las fases y el enum de amarillo; `:467` solo documenta
`mFlag` como 0=verde o 6=azul; `:532` reconoce que el orden de `mSectorFlag[3]`
necesita probarse. Esto documenta candidatos del protocolo, no demuestra que
LMU 1.4 publique esos bytes ni su equivalencia con REST. Por tanto **no se
admiten `sector_flags` ni `vehicle_flag` todavía**; tampoco `gamePhase` REST,
ni una deducción de fase por reloj, movimiento, boxes, tiempo restante o
estado de llegada de un coche. `session.state` permanece `Unavailable`.

Corrección implementada: `rest.rs` replica la comprobación exacta de Go para
el amarillo candidato. `2.5`, `3.001` y `4.999` ya no afirman amarillo;
ausente/null, strings, booleanos, objetos, arrays y códigos ambiguos permanecen
sin evidencia. El TTL de 2 s, el dato `Stale` y el descarte de consultas previas
al cambio de sesión se conservan. Un amarillo global no se convierte en fase
FCY, porque su equivalencia tampoco está certificada.

Pruebas: la regresión `only_exact_full_course_codes_assert_yellow` falla antes
de corregir (`2.5`) y pasa después. Los casos REST de contrato son entradas
controladas, **no capturas físicas**. El nuevo test de conformidad recorre los
diez `.bin` reales sin modificar bytes y exige fase/banderas `Unavailable` y
capacidad `Supported`; el corpus exige la misma ausencia de fase en sus 3839
observaciones y comprueba los campos ausentes en las 239 respuestas crudas.
Una consulta de solo lectura a `127.0.0.1:6397/rest/watch/sessionInfo` en esta
ejecución agotó su plazo de 2 s: no se obtuvo evidencia live ni se declara
validación física de fase/banderas.

Gates locales del hito, ejecutados desde `native/` antes del commit:

| Comando | Salida final |
| --- | --- |
| `cargo fmt --check` | Exit 0, sin diferencias. |
| `cargo clippy -j 4 --workspace --all-targets -- -D warnings` | Exit 0, `Finished dev profile`; sin warnings. La primera pasada señaló longitud excesiva en dos tests; se corrigió sin suprimir el lint y se repitió el gate. |
| `cargo test -j 4 --workspace` | Exit 0. Conformidad LMU: `9 passed; 0 failed; 0 ignored`. Workspace sin fallos; quedan los 2 tests live heredados explícitamente ignorados (REST y SHM requieren LMU en marcha). |
| `git diff --check` | Exit 0. |

No hay dependencias nuevas, cambios Go/frontend ni validación física; tampoco
push, PR, CI remoto, merge, release o promoción de canal.

**Pendiente para la grabadora y el revisor:** capturar con build, tiempos,
bytes SHM y cuerpos crudos de los dos endpoints existentes
(`/rest/watch/sessionInfo` y `/rest/watch/standings`) las transiciones
formación/countdown → verde → FCY → verde, parada y fin de sesión. Añadir
amarillo local por cada sector (para fijar orden y códigos) y azul de un coche
identificable (slot y etiqueta), con un tramo sin bandera antes/después;
correlacionar cada transición con lo visto en el juego. Incluir consultas
fallidas/REST caducado y cambio de sesión para verificar TTL y descarte de
datos previos. Solo entonces admitir los campos demostrados y decidir el
mapeo neutral de parada frente a sesión terminada. No hay pregunta que bloquee
el cambio local; queda esta validación para el siguiente hito.

## ISA-1427 — clima y daños, fase 2 (2026-09-30)

Worker Codex, rama `vantareapp/isa-1427-w-adapt-lmu`, base
`6973c81f29574a573d76f3fae48e128d6964960a`. Encargo acotado de Isaac al
adaptador LMU; revisión del diff e integración a cargo de Claude Opus 5.5.
Referencia: [#1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427),
ADR 0099 y plan de arquitectura Rust nativa. Notion no está disponible y el
encargo autoriza explícitamente trabajar solo con GitHub. No se declara
actualización de Notion, cierre de la fase 2 ni integración de canal.

### Contrato implementado y diferencias respecto a Go

| Señal | Fuente, unidad y calidad |
| --- | --- |
| Temperaturas | `ScoringInfoV01.mAmbientTemp/mTrackTemp` @1860/@1868, Celsius + 273,15 = Kelvin. Cotas de Go REST: aire -30..60 C, pista -20..80 C. El par literal 0/0 de los fixtures sanitizados queda ausente; un cero aislado con otra temperatura válida es admisible. |
| Lluvia | `mRaining` @1852, fracción 0..1 incluida la lluvia cero. Coincide con `layout.go`/`native_rain_test.go` de Go y su sanitizador actual. No se deduce de nubes ni humedad. |
| Viento | `mWind` @1876, módulo del vector 3D en m/s. Componentes finitos y módulo finito positivo; cero es ambiguo en estas capturas. Dirección ausente: el SDK no fija norte geográfico ni procedencia meteorológica. |
| Humedad de pista | `mAvgPathWetness` @1964, fracción media 0..1 positiva. No es humedad relativa del aire (no hay ese campo en el modelo), ni se promedia `mMin/MaxPathWetness`. Cero es ambiguo por sanitización y queda ausente. |
| Presión atmosférica | Ausente: el SDK no la ofrece. La presión por rueda es presión del neumático, no una fuente atmosférica. |
| Goma restante | `mWheel[4]` +848, stride 260, `mWear` +152: +1000/+1260/+1520/+1780, FL/FR/RL/RR, fracción 0..1 sin invertir. Cada rueda valida por separado. Con `mElapsedTime` +12 positivo se admite cero; sin ese reloj, cero puede ser borrado por el sanitizador y se omite. |
| Aero/carrocería/suspensión | Ausentes: `mDentSeverity[8]` +544 son niveles ordinales (SDK: 0=ninguno, 1=algo, 2=más) en ocho ubicaciones, sin una escala de integridad ni correspondencia de componentes. No se divide por 2/255 ni se inventa integridad 1 a partir de ceros. `mDetached`, ruedas desprendidas, sobrecalentamiento y deflexión de suspensión tampoco dan esas fracciones. |

Go productivo (`internal/telemetry/drivers/lmu/format.go:472-489,582-624`)
mantiene dents/desprendimientos como señales crudas, sin integridades. Su
desgaste admite ceros y rechaza las cuatro ruedas si falla una; este modelo
común permite calidad individual y conserva las otras tres. El monitor
legacy `internal/engineer/damage/monitor.go:8-14` aproxima dents a componentes;
esa aproximación no demuestra una medición de integridad y no se porta.

Go excluye temperaturas SHM de su allowlist (`layout_test.go:234-235,281-282`)
y las obtiene por REST en Celsius (`rest.go:562-565,577-579,624-635`); también
obtiene la humedad media por REST. Aquí se leen sus offsets documentados en
SHM, con ausencia conservadora para capturas borradas; no se añadió fusión
REST de clima. Go no publica viento en el modelo canónico observado.

### Frescura y límites deliberados

Clima envejece con el reloj de scoring existente. Daño tiene un `Gate` propio
con `mElapsedTime` de telemetría: scoring avanzando no rejuvenece un bloque
telemetría congelado, ni telemetría avanzando rejuvenece clima congelado.
Sin reloj (los fixtures lo borran), se vigilan cambios en los inputs admitidos.
El umbral heredado es 500 ms y recuperación sostenida de 2 s. Esta vigilancia
sin reloj puede marcar obsoletas señales de un coche perfectamente estático;
es un límite de evidencia, no una prueba de que LMU esté colgado. La calidad
de las señales anteriores de pedales, combustible y delta no se cambia.
`needs_refresh` incluye esta caducidad aunque no cambie el buffer.

Capacidades: `Fresh` con alguna señal fiable de su familia, `WithData` con
datos caducados, `Supported` sin datos, también en menú. `damage: Fresh`
puede significar únicamente goma restante; no certifica aero/suspensión.
No se usa `Estimated` para fabricar integridad de componentes.

No hay un bitmap de presencia del SDK: el par de temperaturas 0/0, calma,
humedad cero y goma cero sin reloj quedan conservadoramente ausentes incluso
si pudieran ser mediciones reales. Para certificarlas hace falta procedencia
del bloque completo conservada por la grabadora/replay; no se codifican hashes
de fixtures ni excepciones por build en el adaptador. Lluvia cero sí tiene el
contrato de admisión existente de Go; los ceros legacy por sí solos no prueban
el clima físico de aquella captura.

### Evidencia de pruebas

`signals_tests.rs` recorre los doce `.bin` existentes sin alterar sus bytes:
aire 16 C = 289,15 K, pista 23,299214394865544 C = 296,44921439486554 K
(sidecar legacy), goma FL 0,9996036887168884 (no invertida) y cuatro ruedas
1,0 en la captura 1.4.2.0. Los ceros de las restantes ruedas legacy y todos
los slots de temperatura/viento/humedad borrados permanecen sin dato.
La prueba falla si falta un fixture; no se genera ni se cambia ningún `.bin`.

Las mutaciones explícitas de test verifican límites NaN/Inf/fuera de rango,
independencia por rueda, Kelvin a 0 C, vector (3,0,4) = 5 m/s, lluvia 0,25,
humedad media 0,4, goma agotada con reloj, congelación independiente y
recuperación. Son pruebas de contrato, no capturas físicas de lluvia, viento,
desgaste completo o daños. Las pruebas físicas siguen pendientes según el
plan; no se arrancó ni se cerró el juego ni el producto Wails. Los tests E2E
y de ciclo de vida sí ejecutaron procesos nativos de prueba, sin sesión live.

### Gates locales antes del commit

Ejecutados desde `native/` con `CARGO_BUILD_JOBS=2`,
`CARGO_PROFILE_DEV_DEBUG=0`, `CARGO_PROFILE_TEST_DEBUG=0` y
`RUST_TEST_THREADS=2` (sin modificar la configuración versionada):

| Comando | Resultado final |
| --- | --- |
| `cargo fmt --check` | Exit 0, sin diferencias. |
| `cargo clippy -j 2 --workspace --all-targets -- -D warnings` | Exit 0, `Finished dev profile [unoptimized]`, sin warnings. |
| `cargo test -j 2 --workspace` | Exit 0, sin fallos. Runtime: 137 passed / 2 live ignored, incluidas las 8 regresiones nuevas. Conformidad LMU: 9 passed; oráculo Go: 5; E2E: 4; ciclo de vida: 7. Cuatro entradas live ignoradas en todo el workspace (REST LMU, SHM LMU en dos ejecutables y ACC). |
| `git diff --check` | Exit 0. |

Regresión sobre la base anterior: las 8 pruebas nuevas compilaron y fallaron
por señales/capacidades ausentes y caducidad sin implementar (log
`lmu-regression-before.log`). Con el cambio, las 8 pasan en la suite completa.
Las primeras pasadas de Clippy señalaron una actualización redundante de
`Player` y dos literales de test con precisión excesiva; se corrigieron sin
suprimir lints ni relajar tolerancias. La ejecución anterior al reinicio
falló en `regex` con `STATUS_DLL_INIT_FAILED` durante la falta de memoria
comunicada por Isaac: no se contabiliza como gate pasado. Se conservaron esos
logs y se repitieron los gates completos con depuración desactivada.

No se ejecutaron Go/frontend ni pruebas físicas (sin cambios en esas rutas y
capturas físicas aplazadas por el plan). Sin widget modificado ni capturas
visuales: `compare.ps1` no aplica a este diff. Para reproducir solo esta
entrega: configurar las mismas variables y ejecutar
`cargo test -j 2 -p vantare-runtime signals_tests --lib` desde `native/`.

No hay dependencias nuevas, cambios fuera del adaptador, push, PR, CI remoto,
merge, release ni promoción de canal. Gates y SHA del commit en la entrega
del worker; logs locales en `native/target/lmu-*.log`.

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
