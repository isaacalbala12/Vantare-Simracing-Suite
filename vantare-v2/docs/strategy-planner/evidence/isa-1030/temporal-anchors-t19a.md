# T19a — Auditoría de anclas temporales para correcciones de límite de stint

Estado: auditoría completada localmente. No se implementó `set_stint_boundary`
ni se modificó comportamiento productivo, tests, SDD o roadmap.
Fecha de trabajo: 2026-09-14. Rama `vantareapp/isa-1030-strategy-temporal-semantics`,
base/HEAD `c53b8a19abe7871b3e41bc6de9369d2b317d95a8`, worktree aislado
`C:/tmp/vantare-isa1030-t19a`. El worktree partió limpio; `.devin/` es metadata
local del ejecutor y no forma parte de la entrega.

## 1. Alcance y pregunta

La decisión que habilita este informe: **¿existen en la telemetría LMU/DuckDB
autorizada anclas temporales deterministas y seguras para que una futura
operación `set_stint_boundary` (operación 3 del contrato #1033) pueda
reubicar el límite de un stint con anclaje verificable?**

Sólo se auditó y documentó. El banco real, los originales y el runtime se
usaron en modo exclusivamente de lectura. Nada de este documento afirma
precisión física: los relojes del simulador y sus deriva son propios del
artefacto y el producto los trata como ejes opacos.

## 2. Fuentes, entorno y autorización

Carreras reales autorizadas y verificadas contra el manifiesto congelado
(`split-manifest.json`, reserva #1030). Sin `.wal` en ninguna; hashes
idénticos antes y después de toda la inspección.

| Alias | Fuente (nombre sanitizado por convención) | SHA-256 |
|---|---|---|
| S125 | `Autodromo Enzo e Dino Ferrari_R_2026-06-06T19_28_21Z.duckdb` | `35438326ecddd6ab660ed3aad70b076a73e3290236c0292f30657594c38c1eb0` |
| S266 | `Algarve International Circuit_R_2026-07-11T12_10_37Z.duckdb` | `6b912640e5b68da087fbe86ce70401101edbdc89cb89cb93df30c9ef396d9362` |
| S026 | `Autodromo Nazionale Monza_R_2026-05-02T18_05_21Z.duckdb` | `08a1e626d7154becd493aa84addbf146cc7f0f229c8a7aa39664766813495538` |

Runtime DuckDB autorizado: `runtime/telemetry/duckdb-v1`, manifest
`700201f90266ae6b829372d9989408c6b0efd86725a50980d46fc05adfc24869`,
coincidente con `runtime_trust_generated.go` (DuckDB v1.5.5, protocolo 1,
schema 1, windows/amd64). Toda lectura de los originales se hizo sobre
copia privada fuera del directorio LMU o mediante el banco nativo, que
verifica hash del original antes y después en su propio código.

## 3. Método

1. Revisión estática de `internal/telemetryanalysis` (contract, reader,
   lapvalidity, consumptionpace, derivedcurves, pitobserved, corrections,
   correction_input, historical), `internal/strategyprojection` (contratos
   temporales) y `internal/app/strategy_recorded_real_integration_test.go`.
2. Inspección read-only de los tres DuckDB (catalogo `information_schema`,
   agregados por tabla, joins por `rowid`/índice, ventanas alrededor de
   pits/resets). Scripts privados en `C:\tmp\t19a-audit\`, fuera del repo.
3. Banco nativo autorizado `TestRecordedStrategyRealDuckDB` (opt-in por
   variables de entorno): S125+S026 (19.73 s), S266+S026 (29.46 s),
   S266+S026 con `ISA1088_EXPORT_CATALOG` (31.03 s, modelo S266) y
   S125+S266 con exportación (19.84 s, modelo S125).
4. Simulación privada en Python de `inferStintBoundaries`/`observedStints`
   sobre las tres carreras, contrastada con el modelo exportado real.

Los hashes de las tres fuentes tras todas las lecturas y los cuatro pases
del banco: **sin cambio** (ver §9).

## 4. Modelo de relojes hallado en datos reales

Cada archivo tiene dos ejes temporales con **orígenes distintos**:

- **Eje de eventos (`ts`)**: columna `ts` (DOUBLE, segundos) en las 42
  tablas de eventos. Monótono no decreciente y sin duplicados en las tres
  carreras. El origen no es el inicio de la grabación: S266 arranca en
  ts≈10104.66 (~2.8 h) y S026 en ts≈6144.02 (~1.7 h), coherentes con un
  reloj de sesión LMU que ya corría. La primera fila de cada tabla de
  eventos es el **estado vigente al iniciar la grabación**, no una
  transición.
- **Eje continuo**: posición de muestra `rowid`/frecuencia nominal
  (`SamplingContinuousImplicitFrequency`). El origen es el inicio de la
  grabación (t=0). Los canales continuos **no** declaran relación con `ts`
  (`TimeOriginUnknown` en producción).
- **Puente empírico `GPS Time`**: canal continuo a 100 Hz cuyo valor por
  muestra sigue el reloj de eventos. Empíricamente `GPS_Time[i] ≈
  ts(i/freq)`; usando esa lectura, los resets de `Lap Dist` quedan a
  <0.1 s de su evento `Lap` correspondiente en las tres carreras. El
  desfase deriva: +0.9375 s (S125), +0.0125 s (S266), +0.035 s (S026) —
  es decir, **la frecuencia nominal no coincide con la tasa real del reloj
  de eventos** y el error depende del archivo. `GPS Time` no lo lee hoy
  ninguna familia (`RequiredHistoricalPageChannels` no lo incluye); es
  evidencia de que el puente existe en la fuente, no de que esté
  autorizado su uso.

Conclusión de relojes: el eje de eventos es un dominio de anclaje
determinista. El eje continuo no lo es: su conversión `index/freq` tiene
deriva real distinta por archivo (hasta ~0.94 s en 3772 s) y no existe
canal declarativo de alineación en el modelo productivo.

## 5. Matriz de anclas

Leyenda de capacidad: **usable** = ancla determinista sobre el eje de
eventos; **ambiguo** = señal real pero sin identidad temporal inequívoca;
**discontinuo** = observado con saltos que rompen la correspondencia;
**desconocido** = señal presente sin semántica verificable;
**no soportado** = no existe señal en la fuente.

| Campo | Tabla/columna LMU | Unidad | Reloj | Regla observada en datos | Riesgo | Capacidad |
|---|---|---|---|---|---|---|
| Instante de evento | `ts` en toda tabla de eventos | s | Eventos | Monótono, sin duplicados, compartido entre las 42 tablas | Ninguno observado; origen desconocido pero consistente | usable |
| Identidad de vuelta | `Lap`: (ts, value) | — | Eventos | Una fila por cruce de línea detectado + fila inicial de estado (contador en curso). Valores son el contador de sesión LMU (0..38 / 101..171 / 60..120), sin huecos ni duplicados | La fila inicial no es un cruce; el número solo no identifica la vuelta (ya cubierto por `LapCorrectionTarget`) | usable |
| Duración oficial de vuelta | `Lap Time`: (ts, value) | s | Eventos | Una fila por evento `Lap` en el mismo ts. `0` = vuelta sin tiempo válido (7 laps S125, 5 S266, 3 S026). Fila inicial = tiempo de la última vuelta completada antes de la grabación (95.29 s en S266; 0 en S125) | `0` no distingue invalidación de hueco de grabación; la fila inicial pertenece a una vuelta anterior | usable con cautela (no es ancla de límite) |
| Tiempo de vuelta en curso | `Current LapTime` | s | Eventos | Acompaña cada evento | No es un límite | usable solo como dato |
| Reseteo de distancia | `Lap Dist` (continuo, 10 Hz, m) | m | Continuo | 39/70/60 drops >500 m. Empíricamente un reset por cruce real, pero S125 tiene un cruce extra (vuelta parcial previa a la grabación) sin evento `Lap` | Correspondencia con eventos sólo por orden+fase; la fase varía por archivo (§7.2); sin canal declarativo de alineación | discontinuo → no es ancla de producto |
| Límite de stint | derivado (`TemporalSegmentsV1.StintBoundaries`) | — | Eventos | `Timestamp` siempre = `laps[i].End` (eje de eventos); causa pit/tyre_change/fuel_jump; `StintNumber` = ordinal+2 | Causa fuel_jump usa join ordinal resets↔vueltas → desfase de una vuelta en ambos sentidos (§7.2) | ambiguo en causa fuel_jump; usable en causa pit |
| Entrada/salida a boxes | `In Pits`: (ts, value bool) | — | Eventos | Transiciones limpias; estado inicial puede ser 1 (S266 y S026 arrancan en box/parada); la última entrada puede quedar abierta si la grabación termina en boxes (S266, S026) | Intervalo abierto al final = "sigue en boxes al cortar", no dato faltante; entry/exit no coinciden con bordes de vuelta | usable (intervalo); exit abierto = ambiguo |
| Box vs. garaje | — | — | — | `In Pits` no distingue pit lane, box ni garaje; no hay canal de garaje | No se puede anclar "entrada a garaje" | no soportado |
| Subida de combustible | `Fuel Level` (continuo, 20 Hz, L) | L | Continuo | Subidas reales observadas (+25.58 L S125; +74.59 L S266) dentro de ventanas de pit | Cruzar con `In Pits` exige puente de relojes que el producto no declara; el producto lo resuelve como `resource_clock_unaligned` | ambiguo (volumen medible, instante no anclable) |
| Subida de energía virtual | `Virtual Energy` (20 Hz, %) | % | Continuo | Ídem fuel | Ídem | ambiguo |
| Desgaste de neumáticos | `Tyres Wear` (10 Hz, %, 4 ruedas) | % | Continuo | Presente en las tres; usado por familia pit para subidas | Mismo problema de reloj | ambiguo |
| Compuesto de neumático | `TyresCompound`: (ts, 4 valores) | — | Eventos | Una sola fila por archivo con [0,0,0,0] | Sin cambios observables; el `0` no se sabe si es "desconocido" o un código | desconocido → cambio de neumáticos no detectable |
| Cambio de piloto | — | — | — | No existe canal; metadata `DriverName` es un valor estático sensible (no leído) | — | no soportado |
| Estado de fin de carrera | `Finish Status`: (ts, value) | — | Eventos | S125: 0→1 en el último ts; S266/S026: sólo la fila inicial 0 | Ausencia de 1 no equivale a "no terminó": la grabación puede cortar antes | ambiguo (transición usable, ausencia no concluyente) |
| Impacto | `LastImpactMagnitude`: (ts, value) | — | Eventos | 6 filas true en S125 (incluida la de arranque), clusters en S266, ninguna en S026 | Un impacto no prueba incidente off-track; un lap lento tampoco | ambiguo → señal de etiqueta, nunca ancla |
| Sector / banderas | `Current Sector`, `Sector* Flag`, `Yellow Flag State` | — | Eventos | `Current Sector` avanza con cada vuelta; `Yellow Flag State` tiene una sola fila (estado inicial) | Banderas sin transiciones no prueban ausencia de amarillas | usable como contexto, no como ancla |
| Cobertura | derivado (`Segments`/`Gaps`) | s | **Mezclado** | `coveredEnd = min(fin continuo, último ts de vuelta)` compara ejes distintos (§7.3) | El "gap" publicado puede ser artefacto de desfase de relojes, no pérdida real | ambiguo |
| Reloj absoluto (pared) | — | — | — | Ningún canal lleva hora civil; `GPS Time` es reloj de sesión, no epoch real | Un límite no puede anclarse a hora de carrera real | no soportado |
| Precisión | `ts` DOUBLE → `time.Time` vía `UnixMilli` | s→ms | — | Producto cuantiza a milisegundos (`secondsTimestamp`) | Los `ts` reales traen ~2.5–10 ms de granularidad; el round-trip es seguro a ms | usable a resolución ms |

## 6. Caso determinista válido (positivo)

**S026 — límite de stint por entrada a boxes.**

- `In Pits` transición 0→1 en ts=9144.62, 1→0 en ts=9214.18: intervalo
  cerrado de 69.56 s sobre el eje de eventos.
- `lapEventIndexAtOrAfter(9144.62)` resuelve al evento `Lap` nº 30
  (lapNumber 90, ts=9149.8): la entrada cae dentro de la vuelta 90, cuyo
  fin es el ancla del límite. Stint 1 = vueltas 60–90, stint 2 = 91–120.
- El fuel jump ordinal coincide en el mismo lapIndex (la fase
  resets↔eventos de S026 lo permite) y `addStintCandidate` fusiona por
  prioridad `pit > fuel_jump`: un único límite `pit` en ts=9149.8.
- Resultado producto: 2 stints, correcto. Es el caso de referencia de que
  un límite de stint **sí** es anclable de forma determinista cuando la
  causa es una entrada a boxes sobre el eje de eventos.

También determinista: cada `LapBoundary` individual de las tres carreras
(ts único, monótono, eje de eventos, calidad declarada aparte) es un ancla
válida para "vuelta N termina en el instante T".

## 7. Casos rechazables por discontinuidad o ambigüedad

### 7.1 Reset de `Lap Dist` sin evento `Lap` (S125, índice 1012)

S125: `Lap Dist` pasa de 4772.84 m a 0.001 m en el índice 1012
(t_continuo≈101.2 s, ≈ts 126.68 vía `GPS Time`) y recorre después una
vuelta completa de ~102.1 s hasta el siguiente reset. Es un cruce real de
línea que **termina la vuelta parcial previa a la grabación** — LMU no
emite evento `Lap` para ella porque la vuelta empezó antes del archivo.
Consecuencia: 39 resets frente a 39 eventos pero con fase desplazada
(resets[0] no empareja ningún evento; resets[k]↔evento k para k≥1).
La igualdad de conteos hace que `reconcileLapBoundaries` declare
`quality=valid`/`source=reconciled` sin haber emparejado nada: el empleo
de "igual número → reconciliado" es un **falso positivo de reconciliación**
en este archivo.

Regla de rechazo: un reset de `Lap Dist` no es un ancla de límite. En el
eje continuo no se puede referenciar a un evento `Lap` salvo join ordinal
con la fase correcta, y la fase no es verificable desde la base (§7.2).

### 7.2 Join ordinal resets↔vueltas: misma regla, dos sentidos de error

`inferStintBoundaries` muestrea `Fuel Level` en cada reset (`fuelByLap[i]`
= fuel en resets[i], más el último sample) y atribuye el salto
`delta_i>3 L` a `laps[i].End`. Como resets[i] y laps[i] no son la misma
frontera salvo fase perfecta:

- **S125** (fase resets[k]↔evento k): el repostaje ocurrió en la vuelta 30
  (out-lap, salida de boxes en 2928.24 dentro de [2893.76, 3022.54]) y el
  candidato fuel_jump cayó en `laps[30].End` = 3022.54 — **una vuelta
  tarde** del límite real (fin de la in-lap 29, 2893.76).
- **S266** (fase resets[k]↔evento k+1): el repostaje ocurrió dentro de la
  in-lap 137 (parada 13513.52–13588.52 que cruza el fin de vuelta
  13580.36); el candidato fuel_jump cayó en `laps[35].End` = 13421.12 —
  **una vuelta antes** del límite real.
- **S026** (fase k+1, parada contenida en la out-lap): el desfase
  compensa y el candidato coincide con el pit en la vuelta correcta —
  correcto por coincidencia de fase, no por corrección del método.

Salida producto real (modelo exportado por el banco autorizado):

| Carrera | Límites publicados en `Temporal.StintBoundaries` | Stints derivados | Artefacto |
|---|---|---|---|
| S125 | pit@2893.76 (valid), fuel_jump@3022.54 (unknown) | (0–29), (30–30), (31–38) | stint fantasma de 1 vuelta = out-lap |
| S266 | fuel_jump@13421.12 (unknown), pit@13580.36 (valid), fuel_jump@16840.14 (unknown) | (101–136), (137–137), (138–171) | stint fantasma = in-lap 137 + límite de cierre artificial en la última vuelta |
| S026 | pit@9149.8 (valid), pit@12158.9 (valid) | (60–90), (91–120) | correcto por fase afortunada |

Efecto aguas abajo demostrado en código: `stintLapIndices` reinicia el
contador `lapInStint` en cada límite, por lo que el stint fantasma
renumera las edades de vuelta del resto del stint real (curvas de
degradación/ritmo y el gate de identificabilidad cuentan un stint extra).

Regla de rechazo: una causa `fuel_jump` con presence `unknown` derivada
del join ordinal **no es un ancla verificable**; cualquier corrección que
la use como identidad debe poder contrastarla con el evento `In Pits`/`Lap`
vecino o rechazarse.

### 7.3 Cobertura publicada mezcla los dos ejes

`addCoverage` computa `coveredEnd = min(fin_continuo, último_ts_vuelta)` y
`timelineEnd = max(...)`, comparando magnitudes de relojes distintos:

- S266: fin continuo 6854.9 vs último evento 16840.14 → declara un hueco
  `no_coverage` [6855, 16840.14] de ~10078 s que es **íntegramente el
  desfase de orígenes**, no una pérdida de cobertura. Como
  `lapSegmentPresence` exige la vuelta dentro del segmento, **0/71 vueltas
  obtienen métricas de fuel/VE/ritmo** — degradación honesta pero causada
  por el modelo, no por los datos.
- S125: hueco publicado [3772, 3796.82] = 24.8 s (la deriva acumulada del
  reloj de eventos sobre la frecuencia nominal). Las vueltas que "caben"
  en [0, 3772] se evalúan con `continuousValueAt(fuel, ts_vuelta)`, que
  muestrea la serie continua ~25 s después del límite real (offset
  creciente): **25/39 vueltas reciben métricas computadas sobre ventanas
  desplazadas**, sin que nada lo marque. Desplazamiento pequeño ⇒ error
  silencioso; desplazamiento grande ⇒ ausencia honesta. La frontera entre
  "correcto" y "no calculable" no es una propiedad del dato.

### 7.4 Otros rechazos observados

- **Fila inicial de evento** (`Lap`, `Lap Time`, `In Pits`, `Finish
  Status`, …): es el estado al iniciar la grabación, no una transición.
  S266: lap 101 recibe `complete=true` porque el `Lap Time` inicial
  (95.29 s) es el de la vuelta anterior, y un intervalo de boxes que
  "empieza" en 10104.66 es en realidad "ya estábamos en boxes al grabar".
- **`Finish Status` sin transición a 1** (S266, S026): la grabación
  terminó durante la última parada; ausencia ≠ carrera no terminada.
- **`LapTime=0`** (15 filas entre las tres carreras): vuelta sin tiempo
  oficial; no distingue invalidación, tráfico, ni hueco de grabación.
  **Nunca** es prueba de incidente o spin — para `set_stint_boundary`
  queda prohibido inferir cualquier ancla desde lentitud/invalidación.
- **`TyresCompound` constante [0,0,0,0]**: sin cambios de compuesto
  observables; `tyre_change` como causa es indetectable en estos datos.
- **Intervalo `In Pits` abierto al final** (S266 desde 16933.28, S026
  desde 12153.72): el coche seguía en boxes al cortar la grabación; el
  intervalo no tiene `end` verificable.
- **`StintNumber` = ordinal+2**: la identidad del límite en el contrato es
  (ordinal, timestamp, causa) de la base, no un número de stint estable
  tras reordenar.

## 8. Propuesta T13a — `set_stint_boundary` (sin implementar)

Propuesta de microplan; todo lo siguiente es diseño pendiente de cierre en
la issue, no código.

### 8.1 Operación

`set_stint_boundary(target, anchor, cause?, reason)` dentro de la mecánica
de revisiones ya implementada (snapshot → revisión → vista efectiva →
recálculo acotado):

- `target`: identidad del límite en la base = (posición ordinal en
  `TemporalSegmentsV1.StintBoundaries` tras orden por timestamp,
  `Timestamp`, `Cause`, `StintNumber`) — verificación literal contra la
  base, no re-derivación.
- `anchor`: referencia a un `LapBoundary` de la misma base
  (`lapNumber` + `timestamp` canónicos), o al instante de un evento `Lap`
  resoluble a un único `LapBoundary`. El límite corregido queda en
  `laps[k].End` correspondiente.
- `cause`: opcional; si se omite conserva la causa original. Valores
  permitidos: los del contrato vigente (`pit`, `tyre_change`, `fuel_jump`,
  futuros explícitos). Una corrección puede también *retirar* un límite
  espurio (semántica de "mover a" / "eliminar" a decidir en T13a contra el
  contrato: hoy el contrato sólo nombra reemplazo; un cierre explícito de
  stint requiere decisión documentada).
- `reason`: motivo no vacío (mecánica vigente).

### 8.2 Precondiciones

1. Base `SourceAnalysisRef` exacta (contenido + interpretación), revisión
   padre `expectedRevision`, `commandId`, autorización vigente — igual que
   las operaciones ya implementadas.
2. El `target` existe en la base con `Timestamp`/`Cause`/`StintNumber`
   idénticos; cualquier divergencia ⇒ `original_mismatch`.
3. El `anchor` resuelve a **exactamente un** `LapBoundary` de la base.
   Cero o más de uno ⇒ `unresolved_target`.
4. El ancla pertenece al eje de eventos (todos los `LapBoundary` con
   `source` ∈ {lap_event, reconciled} lo están; un límite con
   `source=lap_dist_reset` tiene timestamp en el eje continuo y se
   rechaza como `anchor_wrong_clock`).
5. El ancla no cae en un `CoverageGap` publicado ni fuera del segmento
   cubierto (con la salvedad de §7.3: hasta que la cobertura no separe
   ejes, este check sólo puede aplicarse sobre gaps derivados del propio
   eje de eventos).
6. Resultado ordenado: el nuevo instante queda estrictamente entre los
   límites vecinos; no admite empates (dos límites en el mismo borde de
   vuelta ⇒ `boundary_ordering_violation`). No se crean stints de cero
   vueltas.
7. El límite corregido no deja una entrada `In Pits` "huérfana" de stint
   — regla blanda documentable: se advierte, no se rechaza, salvo que la
   issue decida endurecerla.
8. Una vuelta lenta, inválida (`LapTime=0`), con `pace_outlier` o con
   `LastImpactMagnitude` **no aporta** ancla ni causa. Está prohibido
   convertir ritmo o impacto en evidencia de incidente/spin o en
   justificación del límite; el motivo es textual del usuario y la ancla
   es el `LapBoundary`.

### 8.3 Invariantes post-operación

- `len(StintBoundaries)` se conserva (sustitución) y la ordenación por
  timestamp es estricta.
- Cada `StintBoundary.Timestamp` sigue siendo el `End` de alguna vuelta
  de la base (dominio cerrado: sólo bordes de vuelta del eje de eventos).
- La segmentación resultante vuelve a pasar `TemporalSegmentsV1.Validate`
  y el digest de segmentación cambia ⇒ `segmentationDigest` de la revisión
  nueva difiere del padre (los selectores de otras correcciones activas se
  revalidan contra la base original, nunca contra la segmentación
  modificada — regla ya fijada por el contrato).
- Se recalculan sólo las familias afectadas: asignación stint/edad de
  vuelta (curvas), observed_strategy si se habilita, y cualquier derivado
  que lea `StintBoundaries`. `lap_validity` (laps, boundaries) no cambia:
  la corrección opera sobre la segmentación de stints, no sobre vueltas.
- La corrección persiste {target, anchor, cause, reason, base}; el
  original queda intacto en la revisión padre (deshacer = revisión nueva
  con el conjunto anterior).

### 8.4 Errores tipados propuestos (vocabulario del contrato + nuevos)

| Condición | Error propuesto |
|---|---|
| Ancla resuelve a 0 o >1 `LapBoundary` | `unresolved_target` (existente) |
| Ancla en eje continuo / canal sin reloj de eventos | `anchor_wrong_clock` (nuevo) |
| Ancla dentro de un gap de cobertura del mismo eje | `anchor_outside_coverage` (nuevo) |
| Nuevo instante no estrictamente ordenado / stint vacío | `boundary_ordering_violation` (nuevo) |
| Precondición de original distinta | `original_mismatch` (existente) |
| Solape con otra corrección activa sobre el mismo límite | `overlapping_corrections` (existente) |
| Fuente/interpretación cambiada | `source_changed` / `interpretation_changed` (existentes) |
| Causa fuera del enumerado | `unsupported_cause` (nuevo o `invalid_correction`) |

### 8.5 Limitaciones declaradas de v1

- **Sin anclas en eje continuo**: ningún límite puede anclarse a un
  instante entre dos eventos `Lap` (p.ej. "a mitad de vuelta"). El dominio
  es discreto: bordes de vuelta. `Lap Dist`, fuel, VE y wear no aportan
  instantes.
- **Sin puente `GPS Time` en v1**: la correlación empírica documentada es
  evidencia para una decisión futura (autorizar el canal y declarar
  alineación por fuente con control de deriva), no una capacidad.
- **`tyre_change` indetectable**: `TyresCompound` no varía en los datos
  auditados; la causa queda disponible pero sin señal que la sugiera.
- **Sin driver swap ni garaje**: no existen señales.
- **Sin reloj absoluto**: imposible afirmar orden entre sesiones por hora
  civil ni anclar a tiempo real.
- **Cobertura**: hasta separar los ejes en `addCoverage`, la presencia de
  un gap grande no es prueba de datos ausentes (puede ser el artefacto de
  §7.3); el check 5 debe implementarse sobre el eje de eventos.

### 8.6 Rollback, compatibilidad y fuente obsoleta

- Deshacer/rehacer: revisión nueva con el conjunto activo anterior
  (mecánica vigente); ninguna corrección reescribe la historia.
- Revisión v1–v4 guardada: se conserva como está; una base nueva
  (`source_changed`/`interpretation_changed`) invalida el `target`
  automáticamente vía `original_mismatch`/`unresolved_target` — no hay
  migración de correcciones de stints entre segmentaciones.
- Proyección: `sourceRevisions` (#1078) ya viaja con la selección; la
  revisión que contiene `set_stint_boundary` debe producir derivados
  recalculados, no un `TemporalSegmentsV1` parcheado sin recomputación.
- Independencia de T16: T13a sólo documenta la operación sobre la
  segmentación observada; el consumo por el editor (T16/T17) es posterior
  y fuera de alcance.

## 9. Reproducibilidad y checks ejecutados

Comandos (PowerShell, desde el worktree, con el runtime autorizado):

```powershell
# Banco nativo opt-in (tres pases: S125+S026, S266+S026, S125+S266+export)
$env:ISA1088_REAL_SOURCE='<path fuente primaria>'
$env:ISA1104_REAL_TARGET_SOURCE='<path fuente objetivo>'
$env:ISA1088_RUNTIME_APP='C:\tmp\isa1088-runtime-app'
$env:ISA1088_EXPORT_CATALOG='C:\tmp\t19a-audit\export-sessions-<sid>.json'  # opcional
go test ./internal/app -run '^TestRecordedStrategyRealDuckDB$' -count=1 -v

# Hashes de originales antes/después
Get-FileHash '<fuente>' -Algorithm SHA256
```

Resultados:

| Check | Resultado |
|---|---|
| Banco real S125+S026 | PASS 19.73 s; 98 canales; hashes intactos |
| Banco real S266+S026 | PASS 29.46 s; hashes intactos |
| Banco real S266+S026 + `ISA1088_EXPORT_CATALOG` | PASS 31.03 s; modelo S266 exportado y auditado; hashes intactos |
| Banco real S125+S266 + `ISA1088_EXPORT_CATALOG` | PASS 19.84 s; modelo S125 exportado y auditado; hashes intactos |
| Hash post-inspección S125 | `35438326…1eb0` — sin cambio |
| Hash post-inspección S266 | `6b912640…9362` — sin cambio |
| Hash post-inspección S026 | `08a1e626…5538` — sin cambio |
| `.wal` en las tres fuentes | ausente antes y después |
| Suite Go completa / frontend / Wails / LMU | no ejecutados: no se tocó código productivo |

Artefacto sanitizado complementario: `t19a-temporal-audit.json` (métricas
agregadas por sesión, sin rutas ni metadata sensible). Scripts de
inspección en `C:\tmp\t19a-audit\` (privados, fuera del repo): consultas
SQL read-only sobre copias locales y el volcado del modelo exportado.

## 10. Riesgos restantes y no verificado

- La semántica exacta del contador `Lap` (¿"vuelta completada" o "vuelta
  en curso"?) queda parcialmente indeterminada: ambas lecturas son
  coherentes con los datos y ninguna cambia las reglas de anclaje (el
  límite es el instante del evento, no la interpretación del contador).
- `GPS Time` como puente: correlación empírica en 3 archivos; decidir su
  autorización requiere un corte propio con control de deriva y calidad.
- El comportamiento de `addCoverage` (§7.3) y la reconciliación por
  igualdad de conteos (§7.1) son hallazgos de código existente: se
  documentan aquí, no se corrigen en esta tarea; cualquier corrección de
  contrato/código necesita su propia issue.
- Una sola combinación de carrera no prueba todas las fases
  resets↔eventos posibles; la regla de rechazo no depende de la fase.
