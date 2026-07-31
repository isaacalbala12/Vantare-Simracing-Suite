# ISA-129 / TC-07A.1 — Procedencia de señales LMU para Overlay

Estado: contrato documental D0 pendiente de review independiente.

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

## Bloqueadores P0

1. Producción puede seleccionar `createMockSource()`. Su buffer sintético pasa
   por el normalizador legacy como `Connected=true` y puede llegar a
   Studio/Desktop/OBS.
2. No existe un adaptador productivo de `lmu.Observation` a `core.Batch`.
   Los replays canónicos actuales construyen `core.Batch` directamente y no
   demuestran el recorrido desde LMU.
3. La observación modular LMU solo contiene campos del jugador. No publica una
   parrilla multivehículo ni una identidad estable por vehículo.

Ningún código de comportamiento posterior puede iniciarse hasta que este D0
pase review independiente sin P0/P1/P2 ni P3 razonable abierto.

## Evidencia real fijada

| Fixture | Estado | Evidencia | SHA-256 |
|---|---|---|---|
| `testdata/lmu-fixture.bin` | LMU 1.3 en pista, 44 vehículos | captura real sanitizada, 324820 bytes | `959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff` |
| `testdata/lmu-menu-fixture.bin` | LMU 1.3 en menú | captura real sanitizada, 324820 bytes | `8fc09829441e11a466bc9ff92e1a667b819eb6cf83cdf16891d7ed756d887f1a` |

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

La ejecución local observada para el plan corresponde a LMU `1.4.0.0`, pero
todavía no existe una captura 1.4 sanitizada, correlacionada y hash-pinned.
Por tanto, la allowlist productiva continúa limitada a la evidencia 1.3. D4B
debe demostrar 1.4 antes de habilitarla; la similitud estructural no sustituye
esa prueba.

La evidencia REST modular actual es sintética y player-only. No demuestra
semántica de parrilla completa, equipo, número ni campos no decodificados.

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
| Session type | `mSession`, abs. `1696`, `int32` | `0` test, `1..4` practice, `5..8` qualifying, `9` warmup, `10..13` race | Admitir mediante enum cerrado; código desconocido es invalid. |
| Source/current time | `mCurrentET`, abs. `1700`, `float64` | segundos del reloj de sesión, finito y `>=0` | Admitir; fixture `112.6`. |
| Session end time | `mEndET`, abs. `1708`, `float64` | mismo reloj; finito y `>= current` | Admitir; fixture `3605`. |
| Maximum laps | `mMaxLaps`, abs. `1716`, `int32` | count `>=0`; cero válido en sesión por tiempo | Admitir; fixture cero. |
| Vehicle count | `mNumVehicles`, abs. `1736`, `int32` | count `0..104` | Admitir; fixture real de 44 filas y exigir coincidencia exacta. |
| Vehicle source slot | scoring `mID`, fila `+0`, `int32` | slot opaco no negativo; no posición; reutilizable tras quedar libre | Admitir solo con generaciones y transiciones del plan. |
| Driver label | `mDriverName`, fila `+4`, `char[32]` | texto de display | Admitir; prohibido en IDs y evidencia diagnóstica. |
| Vehicle label | `mVehicleName`, fila `+36`, `char[64]` | texto de display | Admitir; fixture sanitizada. |
| Completed laps | `mTotalLaps`, fila `+100`, `int16` | count `>=0`; cero válido | Admitir. |
| Scoring sector | `mSector`, fila `+102`, `int8` | `0=sector3`, `1=sector1`, `2=sector2` | Admitir únicamente este mapping. |
| Lap distance | `mLapDist`, fila `+104`, `float64` | metros, finito y `>=0` | Admitir; máximo exacto de fixture `3982.366455078125` (`3982.37` a dos decimales). |
| Best lap | `mBestLapTime`, fila `+144`, `float64` | segundos; present solo si finito y `>0` | Admitir; `-1` real se normaliza a missing. |
| Last lap | `mLastLapTime`, fila `+168`, `float64` | segundos; present solo si finito y `>0` | Admitir; cero real se normaliza a missing. |
| Pit-stop count | `mNumPitstops`, fila `+192`, `int16` | count `>=0`; cero válido | Admitir. |
| Penalty count | `mNumPenalties`, fila `+194`, `int16` | count pendiente `>=0`; cero válido | Admitir. |
| Player marker | `mIsPlayer`, fila `+196`, C++ `bool` de un byte | byte exacto `0/1`; máximo un jugador | Admitir; byte inválido o varios jugadores rechazan el frame. |
| In pits | `mInPits`, fila `+198`, C++ `bool` de un byte | entre entrada y salida de pit; `0/1` | Admitir como observado, no como garage/box; hereda stale del frame. |
| Position | `mPlace`, fila `+199`, `uint8` | one-based `1..104` | Admitir; nunca identidad. |
| Vehicle class | `mVehicleClass`, fila `+200`, `char[32]` | texto de display/agrupación | Admitir; fixture sanitizada. |
| Time behind next | `mTimeBehindNext`, fila `+232`, `float64` | segundos detrás del puesto anterior; finito y `>=0` | Admitir; fixture `0..17.88`. |
| Laps behind next | `mLapsBehindNext`, fila `+240`, `int32` | count `>=0` | Admitir. |
| Time behind leader | `mTimeBehindLeader`, fila `+244`, `float64` | segundos detrás del líder; finito y `>=0` | Admitir; fixture `0..85.08`. |
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
| Player delta | derivado de muestras de vuelta completada | positivo más lento, negativo más rápido; referencia explícita | Admitir solo tras la traza real obligatoria de D6. |

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
- native `mDeltaBest`.

La temperatura ambiente/pista, aunque existe en código legacy, tampoco entra
en D3–D7 porque el corte no dispone de procedencia LMU admitida completa para
weather.

## Gate para continuar

D0 se considera cerrado únicamente cuando:

- plan, este documento, matriz Overlay y `current-plan.md` coinciden;
- los hashes 1.3 permanecen exactos;
- LMU 1.4 figura como pendiente de D4B;
- mock productivo, bridge ausente y grid player-only siguen registrados como
  P0;
- las exclusiones anteriores son missing explícito;
- baseline D0 y `git diff --check` pasan;
- review independiente no deja P0/P1/P2 ni P3 razonable abierto.

No se inicia D1 antes de ese review. Este documento no autoriza cutover,
promoción, CSS, renderizadores, canvas, Wails/SSE ni una segunda adquisición
LMU.
