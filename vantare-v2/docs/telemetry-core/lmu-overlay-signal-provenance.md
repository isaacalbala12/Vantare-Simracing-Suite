# ISA-129 / TC-07A.1 — Procedencia de señales LMU para Overlay

Estado: D0-D6 aceptados. D7 es el siguiente microcorte.
D4B probó y habilitó exclusivamente el layout LMU `1.4.0.0`; D6 añade evidencia
real sanitizada de vueltas completas. El cutover de producto permanece fuera de
este corte.

Este documento cierra qué señales pueden entrar en los microcortes D1–D7 de
ISA-129. No habilita compatibilidad nueva, no conecta el runtime modular a
producción y no convierte campos legacy en autoridad canónica.

## Contexto exacto

- Base: ISA-105 / TC-07A,
  `c9acee24cf4c4d80922b380b12f7367c2a60c937`.
- Rama:
  `vantareapp/isa-129-tc-07a1-senales-canonicas-overlay-y-retirada-del-mock`.
- Worktree: `C:\tmp\vantare-isa129\vantare-v2`.
- Plan ejecutable:
  `docs/superpowers/plans/2026-07-31-isa-129-tc-07a1-canonical-overlay-signals.md`.
- Orden: ISA-129 bloquea ISA-106.

## Estado del programa al cerrar D6

1. D1 retiró el mock conectado productivo (`470d6a6`). La preview explícita de
   Studio y los harnesses siguen permitidos.
2. D2 y D3 cerraron la allowlist binaria, el catálogo de señales y la matriz de
   autoridad que D4A implementa sin ampliaciones.
3. D4A publica la parrilla multivehículo owned y correlaciona el jugador por ID
   activo. D5 materializa la identidad canónica con generaciones y el mapper
   `Observation -> Batch`.
4. D4B demuestra el layout 1.4 con cuatro artefactos reales hash-pinned y pasa
   el lector productivo opt-in.
5. D6 deriva remaining, gaps relativos y self-delta con contratos de calidad,
   signo, reset y memoria acotada. D7 sigue siendo el gate de proyección y wiring
   productivo.

No queda activo ningún gate histórico de D0-D5. El gate actual es la revisión
independiente de D6 antes de continuar con D7.

Nota vigente (2026-08-14): el contrato posterior admite `mDeltaBest` en el
offset telemetry `+696` como `session.native_delta_best`. Los apartados D0-D7
que lo enumeran como excluido describen la decisión histórica anterior a esta
corrección y no el runtime actual. El parser exige finitud/rango, conserva signo
y calidad. La proyección conserva además, como campos independientes, la mejor
vuelta válida de sesión y la vuelta anterior reconstruidas por Vantare; ninguna
referencia ausente se disfraza con el valor de otra.

## Evidencia real fijada

| Fixture | Estado | Evidencia | SHA-256 |
|---|---|---|---|
| `testdata/lmu-fixture.bin` | LMU 1.3 en pista, 44 vehículos | captura real sanitizada, 324820 bytes | `959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff` |
| `testdata/lmu-menu-fixture.bin` | LMU 1.3 en menú | captura real sanitizada, 324820 bytes | `8fc09829441e11a466bc9ff92e1a667b819eb6cf83cdf16891d7ed756d887f1a` |
| `testdata/lmu-1.4-menu-fixture.bin` | LMU 1.4 en menú | captura real zero-rebuild, 324820 bytes | `0567b69abf96ecf4c63594293e29151bd802d6e52f30b5d5ccfb68c36e8aa4e0` |
| `testdata/lmu-1.4-rest-menu-fixture.json` | REST LMU 1.4 en menú | estado `empty`; ocho solapamientos missing | `325d40882d718e7cb36837b0d3f77575eca72008ecef9bdb436325af1a285312` |
| `testdata/lmu-1.4-track-fixture.bin` | LMU 1.4 en pista, práctica, 38 vehículos y jugador | captura real zero-rebuild, 324820 bytes | `c2e005362419f1db33df96aab70e9e0d56b627ce4aee02d11b8b9ea49707b0e5` |
| `testdata/lmu-1.4-rest-track-fixture.json` | REST LMU 1.4 correlacionado en pista | estado `live`, 38 vehículos y jugador | `bb89380fb672387b97735b2d318c0c8d0a246eaf2f34adbe799f17daa6f0fa36` |
| `derive/testdata/lmu-1.4-self-delta-trace-v1.jsonl` | LMU 1.4, 1.846 muestras a 10 Hz, tres wraps y dos vueltas comparables | allowlist sin identidad: reloj, vuelta, distancia, velocidad, InPit y calidad | `d8f01beee1380d771e5e29de5dfa9e5de72517e1bf447bc14881ee44df7fe938` |

Layout demostrado:

- scoring: offset absoluto `2192`, stride `584`, máximo `104` filas;
- telemetría: offset absoluto `128468`, stride `1888`;
- declaración primaria fijada:
  [`InternalsPlugin.hpp@48aa12d`](https://github.com/TheIronWolfModding/rF2SharedMemoryMapPlugin/blob/48aa12dbb68849923870acd8e68044c46c3d83eb/Include/InternalsPlugin.hpp);
- `long` de Windows se interpreta como 32 bits.

La fixture de pista declara `mNumVehicles=44`. Sus primeras 44 filas scoring y
sus primeras 44 filas telemetry contienen IDs no negativos, únicos en cada
lado y forman exactamente el mismo conjunto. El jugador es la fila scoring 43,
ID `0`, y solo correlaciona con la fila telemetry activa 43. Las 60 filas
telemetry inactivas restantes están a cero y también exponen ID `0`; por ello
nunca se busca por ID en las 104 filas completas.

La ejecución real corresponde a LMU `1.4.0.0`. El par de pista fue recapturado
después de exigir correlación exacta de circuito, sesión, vehículos, presencia,
posición, vueltas y paradas, más una tolerancia de `500 ms` para el reloj de
sesión. El circuito original solo se compara mediante un SHA-256 privado en
memoria: ambos artefactos persistidos usan `Track-01`. Esta prueba no amplía
REST a parrilla completa, equipo, número ni campos no decodificados.

## Contrato ejecutable de layout LMU 1.3 — D2

`internal/telemetry/drivers/lmu/layout.go` materializa la matriz de admisión
como una allowlist cerrada y tipada. El contrato fija explícitamente:

- objeto `LMU_Data` de `324820` bytes;
- scoring en base `2192`, stride `584` y máximo `104` filas;
- telemetry en base `128468`, stride `1888` y máximo `104` filas;
- tipos fuente Windows `int32`, `int16`, `int8`, `uint8`, `bool` de un byte,
  `float64` y arrays acotados de `char`;
- seis campos de sesión, diecinueve campos scoring y diez campos telemetry;
- rechazo de cualquier índice de fila fuera de `[0,104)`.

Los tests leen los dos fixtures hash-pinned y comprueban en sus bytes reales
cada offset y tipo admitido, incluida la fila player scoring/telemetry 43. La
región de scoring termina en `62928`, no alcanza telemetry, y la fila telemetry
104 termina exactamente en `ObjectOutSize`. Cada ventana de campo queda dentro
de su objeto o stride y las ventanas admitidas de un mismo scope no se solapan.

La API de layout no contiene accesores para los campos excluidos de este
documento: fases/banderas, pit-state labels, remaining raw, temperaturas,
`FuelFraction`, equipo, número, compuesto, Virtual Energy,
daños o weather. Conocer que ciertos bytes existen no los vuelve admisibles.

D4A consume este contrato sin ampliar la allowlist productiva. La versión
permanece fijada literalmente a `1.3.0.0`; LMU 1.4 continúa bloqueado hasta la
evidencia D4B.

## Reglas canónicas

- Cero, `false` y texto vacío presente no significan missing.
- `fresh`, `stale`, `missing` e `invalid` son estados distintos.
- Todo valor observado conserva procedencia; todo cálculo se marca derived o
  estimated según corresponda.
- Shared Memory usa freshness de frame de `500 ms`; REST usa TTL de `2 s`.
- Nombres de piloto/equipo, rutas, IDs externos y posición nunca forman IDs
  canónicos.
- El ID fuente es el slot numérico LMU mientras esté ocupado continuamente.
  Tras vaciarse, su reutilización crea una generación nueva.
- Solo participan las filas `[0,mNumVehicles)` de scoring y telemetry. Los IDs
  activos de ambos lados deben ser no negativos, únicos y formar una biyección
  exacta; cualquier fallo rechaza el frame completo. La cola inactiva se ignora.
- El jugador se selecciona exclusivamente por el único `mIsPlayer` activo de
  scoring y se une a la fila telemetry activa con el mismo ID. Ni
  `mPlayerVehicleIdx` ni `mPlayerHasVehicle` son autoridades de selección; no se
  permiten fallbacks por posición, orden o búsqueda en las 104 filas.
- Velocidad canónica: m/s. El borde TypeScript convierte a km/h con
  `valor * 3.6`.
- Gap relativo en la misma vuelta:
  `player.timeBehindLeader - vehicle.timeBehindLeader`. Positivo significa que
  el otro coche está delante; negativo, detrás. Coches doblados usan lap delta
  y no reciben segundos inventados.
- Delta: referencia `best-completed-player-lap`; positivo significa más lento,
  negativo más rápido. No se admite una referencia sintética a velocidad
  constante ni un `mDeltaBest` cero como evidencia.
- Fuel se admite como litros solo si fuel y capacidad son finitos,
  `capacity > 0` y `0 <= fuel <= capacity`. `FuelFraction` no lo sustituye.

## Matriz cerrada de admisión

Esta tabla es una allowlist. D3–D7 no pueden incorporar señales fuera de ella.

| Señal canónica | Fuente y offset/tipo | Unidad, referencia, signo o rango | Decisión y evidencia |
|---|---|---|---|
| Track name | `ScoringInfoV01.mTrackName`, abs. `1632`, `char[64]` | texto acotado; nunca identidad | Admitir; declaración primaria y fixtures 1.3 menú/pista. Sanitizar al almacenar evidencia. |
| Session type | `mSession`, abs. `1696`, `int32` | la fuente define `0=test`, pero D3 no tiene un enum canónico Test: D4A lo publica invalid; `1..4` practice, `5..8` qualifying, `9` warmup, `10..13` race | Admitir los códigos representables mediante enum cerrado; código desconocido o sin representación canónica es invalid. |
| Source/current time | `mCurrentET`, abs. `1700`, `float64` | segundos del reloj de sesión, finito y `>=0` | Admitir; fixture `112.6`. |
| Session end time | `mEndET`, abs. `1708`, `float64` | mismo reloj; finito y `>= current` | Admitir; fixture `3605`. |
| Maximum laps | `mMaxLaps`, abs. `1716`, `int32` | count `>=0`; cero válido en sesión por tiempo | Admitir; fixture cero. |
| Vehicle count | `mNumVehicles`, abs. `1736`, `int32` | count `0..104` | Admitir; fixture real de 44 filas y exigir coincidencia exacta. |
| Vehicle source slot | scoring `mID`, fila `+0`, `int32` | slot opaco no negativo; no posición; reutilizable tras quedar libre | Admitir solo con generaciones y transiciones del plan. |
| Driver label | `mDriverName`, fila `+4`, `char[32]` | texto de display | Admitir; prohibido en IDs y evidencia diagnóstica. |
| Vehicle label | `mVehicleName`, fila `+36`, `char[64]` | texto de display | Admitir; fixture sanitizada. |
| Completed laps | `mTotalLaps`, fila `+100`, `int16` | count `>=0`; cero válido | Admitir. |
| Scoring sector | `mSector`, fila `+102`, `int8` | `0=sector3`, `1=sector1`, `2=sector2` | Admitir únicamente este mapping. |
| Lap distance | `mLapDist`, fila `+104`, `float64` | metros; un valor finito `>=0` está presente y cualquier sentinel finito negativo se normaliza a `missing` | Admitir; máximo 1.3 exacto `3982.366455078125` y probe live 1.4 D4B con sentinel negativo, nunca convertido a cero. |
| Best lap | `mBestLapTime`, fila `+144`, `float64` | segundos; present solo si finito y `>0` | Admitir; `-1` real se normaliza a missing. |
| Last lap | `mLastLapTime`, fila `+168`, `float64` | segundos; present solo si finito y `>0` | Admitir; cero real se normaliza a missing. |
| Pit-stop count | `mNumPitstops`, fila `+192`, `int16` | count `>=0`; cero válido | Admitir. |
| Penalty count | `mNumPenalties`, fila `+194`, `int16` | count pendiente `>=0`; cero válido | Admitir. |
| Player marker | `mIsPlayer`, fila `+196`, C++ `bool` de un byte | byte exacto `0/1`; máximo un jugador | Admitir; byte inválido o varios jugadores rechazan el frame. |
| In pits | `mInPits`, fila `+198`, C++ `bool` de un byte | entre entrada y salida de pit; `0/1` | Admitir como observado, no como garage/box; hereda stale del frame. |
| Position | `mPlace`, fila `+199`, `uint8` | one-based `1..104` | Admitir; nunca identidad. |
| Vehicle class | `mVehicleClass`, fila `+200`, `char[32]` | texto de display/agrupación | Admitir; fixture sanitizada. |
| Time behind next | `mTimeBehindNext`, fila `+232`, `float64` | segundos detrás del puesto anterior; un valor finito `>=0` está presente y cualquier sentinel finito negativo se normaliza a `missing` | Admitir; fixture 1.3 `0..17.88` y probe live 1.4 D4B con sentinel negativo, nunca convertido a cero. |
| Laps behind next | `mLapsBehindNext`, fila `+240`, `int32` | count `>=0` | Admitir. |
| Time behind leader | `mTimeBehindLeader`, fila `+244`, `float64` | segundos detrás del líder; un valor finito `>=0` está presente y cualquier sentinel finito negativo se normaliza a `missing` | Admitir; fixture 1.3 `0..85.08` y probe live 1.4 D4B con sentinel negativo, nunca convertido a cero. |
| Laps behind leader | `mLapsBehindLeader`, fila `+252`, `int32` | count `>=0` | Admitir. |
| Estimated lap | `mEstimatedLapTime`, fila `+472`, `float64` | segundos; present solo si finito y `>0` | Admitir como estimación observada con procedencia explícita. |
| Active telemetry grid correlation | telemetry `mID`, fila `+0`, `int32`, solo `[0,mNumVehicles)` | IDs activos no negativos y únicos; biyección exacta con scoring; cola inactiva ignorada | Admitir; fixture 44/44 y 60 IDs cero fuera del rango activo. Mismatch, duplicado o negativo activo rechaza el frame. |
| Player correlation | scoring `mIsPlayer` y telemetry activa con igual `mID` | cero o un jugador scoring; si existe, único match telemetry activo | Admitir; fixture row 43, ID `0`. Sin jugador, fast fields missing. No usar bytes header, posición ni cola inactiva. |
| Player lap number | telemetry `mLapNumber`, fila `+20`, `int32` | count `>=0` | Admitir. |
| Player local velocity | telemetry `mLocalVel`, `+184/+192/+200`, `3×float64` | componentes m/s; magnitud finita y `>=0` | Admitir. |
| Gear / RPM | telemetry `mGear` `+352` `int32`; `mEngineRPM` `+356` `float64` | gear entero fuente; RPM finito y `>=0` | Admitir sin etiquetas de marcha inventadas. |
| Player controls | telemetry `mFilteredThrottle/Brake/Clutch`, `+420/+428/+444`, `3×float64` | ratio cerrado `0..1`; cero válido | Admitir. |
| Fuel / capacity | telemetry `mFuel/+524`, `mFuelCapacity/+608`, `2×float64` | litros; invariantes de fuel/capacidad | Admitir solo para jugador; fixture `99.586.../100`. |
| Session remaining | derivado `end-current` | segundos; inputs fresh, finitos y ordenados; cero válido | Admitir derivado. `mSessionTimeRemaining` no es autoridad. |
| Relative gap | derivado de leader/lap | signo documentado arriba; segundos solo en misma vuelta | Admitir derivado; doblados solo lap delta. |
| Player delta | derivado de muestras de vuelta completada | positivo más lento, negativo más rápido; referencia explícita | Admitido por D6 con traza LMU 1.4 real hash-pinned y oráculo independiente por distancia. |

## Matriz de autoridad Shared Memory / REST

No existe autoridad global por fuente. Shared Memory define el frame atómico y
la parrilla; REST solo complementa campos equivalentes de jugador/sesión.

| Señal/familia | Preferida | Alternativa | Regla de equivalencia y conflicto |
|---|---|---|---|
| Current/source time | SHM sesión | REST `currentEventTime` | Comparar proyectando ambos a la decisión mediante edad monotónica. Conflicto si difieren `>500 ms`; SHM fresh gana. |
| Track name | SHM sesión | REST `trackName` | Igualdad tras el mismo trim; REST solo rellena SHM no usable. |
| Session type | SHM sesión | REST enum cerrado | Igualdad exacta; REST desconocido nunca sustituye SHM válido. |
| Vehicle count | SHM grid | REST session count | Igualdad `0..104`; REST nunca crea filas. |
| Player present | SHM jugador único | REST fila `player=true` única | Igualdad booleana; REST nunca crea identidad sin slot SHM. |
| Player position | SHM fila player | REST fila player | Igualdad one-based; REST solo fallback para jugador ya identificado por SHM. |
| Player completed laps | SHM fila player | REST fila player | Igualdad count no negativo; nunca se aplica a rivales. |
| Player pit-stop count | SHM fila player | REST fila player | Igualdad count no negativo; nunca se aplica a rivales. |
| Rival position/laps/pit stops | SHM filas | ninguna | Missing/stale explícito; nunca replicar datos REST del jugador. |
| Session end/max laps | SHM | ninguna | Invariantes de la matriz de admisión. |
| Driver/vehicle/class/sector/distance/laps/gaps/penalties/InPit | SHM fila | ninguna | Calidad por slot ocupado; missing/stale se conserva. |
| Player lap/gear/RPM/speed/controls/fuel/capacity | SHM telemetry tras validar la biyección activa | ninguna | Seleccionar scoring `mIsPlayer` y unir por ID activo único. Sin jugador produce missing; biyección rota rechaza el frame. Nunca usar índice header, posición, orden REST ni cola inactiva. |
| Remaining/gaps/delta | derivación canónica | ninguna | Hereda el input menos fresh y no se calcula con inputs incompatibles. |

Política común:

- SHM fresh prevalece sobre REST fresh equivalente.
- Una discrepancia fresh se registra como diagnóstico acotado y no cambia la
  fuente preferida.
- REST fresh solo sustituye un campo SHM no usable dentro de las filas
  equivalentes declaradas.
- Dos valores stale conservan orden preferido y estado stale.
- `0`/`false` participan normalmente en equivalencia y conflicto.

## Exclusiones obligatorias

Los siguientes campos permanecen `missing`, nunca zero-values simulando un
dato observado:

- equipo y número de coche;
- compuesto de neumático;
- Virtual Energy;
- daños;
- lluvia, wetness, viento, presión y demás clima sin fuente admitida;
- `mGamePhase`, yellow/sector/vehicle flags y pit-state labels;
- `mSessionTimeRemaining`;
- `mFuelFraction`;

La temperatura ambiente/pista, aunque existe en código legacy, tampoco entra
en D3–D7 porque el corte no dispone de procedencia LMU admitida completa para
weather.

## Evidencia real D9 — pit y reconexión

El 2026-08-01 se capturó con el sanitizer zero-rebuild una secuencia LMU 1.4
de una sola sesión y una sola identidad de jugador:

| Estado | Source time | `InPit` | SHA-256 |
|---|---:|---:|---|
| Pista antes de pit | 216,8 s | `false` | `eb79ec2a7806e217d4ef16dd2a93f3795b98234adbcb0dddba984651a5fd6fcc` |
| Estado in-pit observado | 337,4 s | `true` | `262700e53e722b46e1b03940e13be83cf4aa73bf9f5ebdd8b9814b7161c9ede1` |
| Outlap | 418,2 s | `false` | `c495da06882b2ab8addef5778151201e8b7daf46e8b5ca15f6f2c86a6715e4a6` |

`mInPits` queda demostrado únicamente como booleano observado. Estas capturas
no autorizan a inferir etiquetas más específicas de garaje, box, pit lane o
fase de pit. El nombre de archivo `lmu-1.4-garage-fixture` se conserva por el
contrato de entrega, pero su rol semántico es únicamente `reconnected-in-pit`.

Después de cerrar LMU por completo, el proceso desapareció y el probe falló
cerrado al leer build evidence: no hubo frame ni payload. Al reabrir LMU, un
mapping nuevo produjo source time 35,8 s y SHA-256
`a31a149597b14b291ffea4ef1a7e7e86e736e3ac553b53c90f1fcd7c9c1aa707`.
El replay interpreta el retroceso como sesión/epoch nuevos y conserva la
identidad del vehículo únicamente porque durante la desconexión no se aceptó
un grid vacío. El evento disconnected del golden contiene estado y código
cerrado, nunca telemetría.

## Implementación D4A — parser, fusión y evidencia sanitizada

El parser productivo 1.3 ahora:

- lee exactamente las primeras `mNumVehicles` filas scoring y telemetry;
- exige IDs activos no negativos, únicos y con biyección exacta;
- ignora las 60 filas inactivas de la fixture, por lo que el ID activo `0` es
  válido;
- conserva el orden scoring y no usa posición como identidad;
- selecciona cero o un jugador únicamente desde scoring `mIsPlayer` y une sus
  señales rápidas por el mismo ID telemetry activo;
- ignora `mPlayerVehicleIdx`, `mPlayerHasVehicle`, orden REST y cola inactiva;
- rechaza el frame completo ante ambigüedad estructural, sin publicar una
  parrilla parcial;
- conserva cero/false presentes y normaliza únicamente los sentinels de tiempo
  de vuelta no positivos a missing;
- publica end time, maximum laps, grid scoring completo y fuel/capacity del
  jugador bajo las invariantes cerradas de este documento.

`FrameSanitizer` valida primero el frame y después lo reconstruye desde un
buffer completamente a cero. Solo copia ventanas numéricas admitidas, sustituye
track, driver, vehicle y class por aliases estables y cambia todos los IDs. Un
alias no puede coincidir con ningún ID activo del frame. Solo conserva telemetry
rápida de la fila player; la telemetry de rivales mantiene únicamente el ID
necesario para revalidar la biyección. Canarios en todos los rangos excluidos
demuestran que ningún byte desconocido sobrevive. El golden
`internal/telemetry/drivers/lmu/testdata/grid_v1.golden.json` fija 44 filas,
orden, aliases e identificación del jugador sin incluir PII.

La fusión utiliza la matriz v3 documentada en
`docs/telemetry-core/lmu-authority-matrix.md`: 33 señales, ocho solapamientos,
SHM-first y REST player-only. `source_time` se compara después de proyectar
ambas muestras al instante monotónico de decisión, con conflicto por encima de
`500 ms`. Un frame SHM congelado vuelve stale todo el grid, incluido
`InPit=false`.

Este corte no crea `VehicleID` canónico, generaciones, `core.Batch`,
derivaciones ni wiring productivo. Esas responsabilidades continúan en D5-D7.
Tampoco habilita LMU 1.4: D4B requiere fixtures sanitizadas y hash-pinned de
menú y pista antes de tocar la allowlist.

## D4B — prueba diagnóstica y allowlist LMU 1.4

D4B añade una ruta diagnóstica separada del runtime productivo y la usa para
demostrar el layout antes de habilitarlo:

- el perfil candidato admite solo un par coherente file/product `1.4.0.0`; no
  acepta una versión parcial, contradictoria, desconocida ni seleccionable por
  flag;
- el probe live 1.4 demostró que `mLapDist`, `mTimeBehindNext` y
  `mTimeBehindLeader` pueden usar sentinels finitos negativos cuando la señal
  no está disponible. El parser conserva el frame y normaliza únicamente esas
  señales a `missing`; no publica el sentinel, no inventa cero y mantiene no
  finitos como frame inválido;
- la captura Shared Memory abre una sola vez el mapping modular existente,
  exige un snapshot estable de tamaño exacto y aplica el mismo zero-rebuild de
  D4A antes de devolver un byte persistible;
- la captura REST decodifica primero los endpoints loopback y serializa solo
  los ocho solapamientos de sesión/jugador, sus estados y timestamps; nombres,
  IDs, rutas, campos extra y el body original no forman parte del artefacto;
- un frame Shared Memory válido de menú, sin jugador, puede acompañarse de un
  artefacto REST de estado `unavailable`, `empty` o `unsupported`: sus ocho
  solapamientos quedan obligatoriamente `missing`. Cualquier REST live/complete
  junto a un frame de menú se rechaza, aunque sus campos parezcan correlacionar;
  una respuesta malformada también se rechaza siempre;
- una captura de pista, con jugador, exige REST live y correlacionado con Shared
  Memory en circuito, sesión, vehículos, presencia, posición, vueltas, paradas
  y tiempo. El circuito se compara antes de sustituirlo por alias y solo queda
  una huella SHA-256 privada en memoria. Si falla una equivalencia, no se
  persiste ninguno de los dos artefactos;
- ambos artefactos incluyen SHA-256, resumen sanitizado y escritura exclusiva:
  un fichero existente nunca se reemplaza, un payload alterado se rechaza y la
  reserva del par es fail-closed para evitar dejar una captura parcial;
- `lmu-debug -once -capture-sanitized <path>` y
  `-capture-rest-sanitized <path>` no aceptan `-mock`, no exponen un flag de
  versión/layout y no pueden promocionar el candidato a producción.

La secuencia real capturó primero el menú y después pista con 38 vehículos y
jugador. Los cuatro hashes se compilan en la allowlist, que exige además acuerdo
exacto de file/product version para 1.4. El opt-in productivo confirmó runtime
`live`, jugador presente, compatibilidad conocida y fingerprint 1.4.

## D6 — derivaciones y traza real de self-delta

La captura diagnóstica `lmu-debug -capture-delta-trace` usa el Driver canónico,
muestrea como máximo a 10 Hz, mantiene todo en memoria y solo escribe de forma
exclusiva después de cerrar dos vueltas comparables. Un error o una captura
incompleta no deja artefacto parcial. La allowlist JSONL no contiene nombres,
circuito, IDs, rutas, reloj de pared ni bytes raw.

La sesión real fue preservada por LMU en su grabación DuckDB. La fixture se
recuperó de esa grabación de manera read-only después de que la captura directa
no pudiera cerrarse; se seleccionaron exactamente los mismos canales de la
allowlist y el replay demuestra que el collector produce byte por byte el mismo
artefacto y hash. El archivo original, sus metadatos personales y sus canales
no admitidos no forman parte del repositorio.

La evidencia también cerró comportamiento no visible en fixtures estáticas:

- frames idénticos pueden repetirse con el mismo source time;
- el reset de `Lap Dist` puede preceder al cambio de `LapNumber` unos `200 ms`;
- existen oscilaciones normales de `Lap Dist` de hasta varios metros dentro de
  una vuelta. El high-water mark impide incorporarlas a la referencia; una
  caída de `100 m` o más solo se acepta como wrap si el contador de vuelta la
  confirma dentro de `500 ms`.

## Estado de revisión y siguiente corte

D0-D6 permanecen aceptados tras review final `APPROVE`, P0/P1/P2/P3 = 0. D7 debe
conservar:

- la allowlist cerrada y los hashes de LMU 1.3/1.4;
- el rechazo atómico de frames estructuralmente ambiguos;
- la parrilla completa, la correlación player por ID activo y la fusión
  SHM-first/REST player-only;
- las exclusiones como missing explícito;
- los tests del parser, fusión, sanitizer, replay y golden;
- el mapper D5 y la cadena D6 determinista, acotada y sin I/O;
- la traza D6 sanitizada y su oráculo independiente de signo por distancia;
- la ausencia de proyección Overlay, cutover y wiring productivo.

El siguiente corte es D7, contrato Overlay v1 y adaptador TypeScript. D6 no
autoriza cutover, promoción, CSS, renderizadores, canvas, Wails/SSE ni una
segunda adquisición LMU.
