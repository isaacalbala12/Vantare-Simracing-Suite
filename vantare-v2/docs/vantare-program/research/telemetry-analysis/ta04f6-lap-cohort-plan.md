# TA-04F6 -- plan preregistrado del selector canónico de cohorte por vuelta

Estado: plan local anterior a implementar el runner y anterior a cualquier
nueva lectura de DuckDB para TA-04F6. Isaac autorizó reutilizar los DuckDB ya
existentes. Este corte sigue siendo **retrospectivo**, está contaminado por los
análisis TA-04E--TA-04F5 y no constituye holdout ni confirmación independiente.

TA-04F5 y TA-04F5B terminaron en `pipeline_fault`; TA-04F5C se canceló porque
el helper legacy exacto no existe ni tiene una versión o hash ejecutable. Sus
helpers temporales no son una base reproducible. TA-04F6 no reconstruye ni
atribuye comportamiento a esos helpers: crea primero un único runner canónico,
versionado, sintético y fail-closed. Ningún dato existente se abre durante la
redacción, implementación, prueba, review o commit de ese runner.

## Decisión de autoridad para abrir TA-04F6

El orquestador toma aquí una decisión nueva y explícita dentro de la autoridad
vigente concedida por Isaac mediante «continúa» y «usa los DuckDB ya
existentes, son muchísimos y suficientes»: TA-04F6 puede sustituir **solo** el
bloqueo procedimental que impedía iniciarlo, mediante una definición canónica
versionada desde cero y aprobada antes de datos.

Esta decisión no reabre ni reconcilia TA-04F5C, no reconstruye el legacy y no
atribuye a sus helpers ningún comportamiento. TA-04F5, TA-04F5B y TA-04F5C
conservan `pipeline_fault`; sus cifras, poblaciones y contadores no son baseline,
expected output, fixture ni criterio de aceptación de F6. La autorización
permite una ejecución real posterior sobre los DuckDB existentes únicamente
después de los gates sintéticos, review y commit definidos aquí; no amplía el
alcance a shape, producto o visual.

## Objetivo acotado

Construir y congelar un selector reproducible que responda una sola pregunta:
¿existe, entre los recordings existentes autorizados, un mismo `group key` con
al menos 3 recordings y al menos 10 vueltas válidas por recording bajo una
definición canónica de vuelta, reloj, calidad y longitud?

El selector solo produce una cohorte congelable o un cierre insuficiente/fallo.
No calcula forma, proyección, residuales espaciales, jitter, bootstrap, mapa ni
outcomes sustantivos TA-04F. En todos los resultados `local_shape=unknown`, la
geolocalización absoluta permanece `unknown`, la anchura física permanece
`incompatible` y continúa el **STOP visual**. TA-04B no se inicia.

## Supuestos congelados

1. El código vive solo en `tools/ta04f6-cohort-selector` y usa la biblioteca
   estándar y la pila productiva de discovery, autorización, staging, reader y
   parser ya existente.
2. No se añade dependencia, registro Wails, ruta de producto, capability ni UI.
3. La población es el universo Algarve existente y autorizado, con los aliases,
   normalización, orden, budgets y cinco digests de TA-04F4/TA-04F5.
4. Los eventos `Lap` son el único oracle permitido para validar los resets de
   `Lap Dist`; un reset sin evento ordinal compatible no delimita una vuelta
   válida.
5. La selección es ciega a cualquier métrica de forma o outcome posterior.

Una contradicción con estos supuestos detiene TA-04F6 antes de ejecutar datos
reales y exige actualizar y volver a versionar este plan.

## Referencias congeladas

- custodia, discovery y privacidad: TA-04F2@`fe5faed2d5748736606f52165aa913849e4bd531`;
- universo Algarve y `group key`: TA-04F4@`e45b0cd0c005c7aa6d55054d611eb7cbb822180a`;
- sensibilidad y convenciones de ventanas: TA-04F5@`92baeb352128db0361f1e8143d7f833dc4011619`;
- erratum de pairing: TA-04F5B@`b2c0928`;
- cierre de reconciliación: TA-04F5C@`c71db3ce898a0b45f2297283790b5666fe60f6e8`;
- tolerancias productivas de tiempo y distancia: contrato TA-04A heredado por
  TA-04F@`c8e064d1c9add0cc8c807f415531bae225f9924d`.

Los agregados defectuosos de F5/F5B son contexto histórico, no fixtures de
éxito ni baselines que el nuevo runner deba reproducir.

## Entrega y estructura prevista

```text
tools/ta04f6-cohort-selector/
  main.go                 CLI, preflight y máquina de estados
  selector.go             población, oracle, vueltas, longitud y cohorte
  serialization.go        serialización canónica y commitments v1
  synthetic.go            corpus sintético efímero
  *_test.go               tests unitarios y de integración local
```

La distribución exacta puede reducirse si mejora claridad, pero ningún archivo
sale de ese directorio salvo este plan y, en fases posteriores, el manifest y
la evidencia sanitizados. El runner importa APIs Go existentes; no copia ni
duplica el parser DuckDB y no admite SQL libre.

## CLI y modos de autoridad

Comandos previstos desde la raíz del proyecto:

```powershell
go test ./tools/ta04f6-cohort-selector/...
go test -race ./tools/ta04f6-cohort-selector/...
go run ./tools/ta04f6-cohort-selector -mode=synthetic
go run ./tools/ta04f6-cohort-selector -mode=existing-authorized -protocol-sha <SHA_DEL_COMMIT_DEL_PLAN> -runner-sha <SHA_DEL_COMMIT_DEL_RUNNER> -output "<WORKTREE_ABSOLUTO>\vantare-v2\docs\vantare-program\research\telemetry-analysis\ta04f6-selection-freeze.md"
```

Reglas de flags:

- `-mode=synthetic` es el default y no ejecuta discovery, staging, `Open`,
  parser ni acceso a DuckDB;
- el único otro valor permitido es `-mode=existing-authorized`; no existen
  flags booleanos de modo, aliases ni combinación ambigua;
- el modo real exige `-protocol-sha`, `-runner-sha`, el `-output` absoluto
  exacto mostrado arriba y que el binario contenga el mismo `protocolSHA`
  preregistrado;
- el modo sintético rechaza `-protocol-sha`, `-runner-sha` y `-output` para que
  ningún flag sobrante active o simule estado real;
- flags desconocidos, combinación ambigua, ruta de salida ausente o intento de
  sobrescritura terminan antes de discovery;
- no existe modo interactivo, fallback, `--force`, relajación de thresholds ni
  opción para elegir recordings, grupos o vueltas.

El runner real debe negarse a iniciar si:

1. la rama no es `work/ta04f-repetition-variance`;
2. el worktree no está limpio;
3. el commit que introdujo este protocolo no coincide con el
   `protocolSHA` compilado y el `-protocol-sha` proporcionado, o el blob actual
   del plan difiere del blob de ese commit;
4. `HEAD` no coincide exactamente con `-runner-sha`;
5. el commit `runner-sha` es merge, su padre único no es `protocol-sha`, o su
   diff toca algo fuera de `tools/ta04f6-cohort-selector/**`;
6. los controles sintéticos del mismo binario no pasan inmediatamente antes
   del modo real.

El runner **no** intenta auto-incrustar su propio SHA, porque un commit no puede
contener de forma estable su identidad futura. Solo incrusta `protocolSHA`; el
SHA del runner se proporciona después del commit y debe ser igual a `HEAD`. El
preflight inspecciona el commit y su scope con Git antes de discovery.

Los fallos de preflight no abren datos y emiten solo causa tipada sanitizada.

## Único output real y publicación atómica

El modo real no acepta un directorio temporal privado, una ruta elegida por el
usuario ni una nueva política ACL. El único output permitido es exactamente:

```text
<WORKTREE_ABSOLUTO>\vantare-v2\docs\vantare-program\research\telemetry-analysis\ta04f6-selection-freeze.md
```

Ese manifest sanitizado ya está autorizado para review y commit local por este
plan. Antes de discovery, el runner debe:

1. exigir ruta absoluta y comparación ordinal exacta con el path anterior;
2. resolver el worktree y el directorio esperado de docs sin seguir un destino
   fuera de ellos;
3. recorrer con `Lstat` cada componente desde la raíz del worktree hasta el
   parent y rechazar symlink, junction u otro reparse point;
4. exigir que el parent resuelto quede dentro del directorio exacto esperado;
5. exigir que target y nombre temporal no existan.

Después del cleanup global y solo para `cohort_frozen` o
`stop_insufficient`, crea mediante `O_CREATE|O_EXCL` un temporal impredecible
en **el mismo directorio**, escribe exclusivamente el manifest sanitizado,
ejecuta `Sync`, comprueba error de `Close` y hace rename atómico al target que
sigue sin existir. Un target/reparse aparecido durante la carrera, overwrite,
fallo de sync/close/rename o temporal residual produce `pipeline_fault`; el
runner intenta eliminar solo su temporal exacto. stdout/stderr conservan solo
estado agregado sanitizado y nunca sustituyen el manifest. No se crea ni
modifica ACL alguna.

## Pila productiva low-level y lifecycle exacto

El runner no usa, construye ni registra `TelemetryAnalysisService`. Opera
explícitamente sobre la pila Go low-level ya existente, en este orden:

1. `telemetryanalysis.Discover` con `OSMetadataSource` y la raíz LMU
   autorizada;
2. un `StabilityTracker` independiente por locator, nunca compartido entre
   candidatos, y dos observaciones reales compatibles separadas por la ventana
   requerida para obtener el candidato autorizado;
3. `BuildAuthorizedHistoricalArtifact` con `OSContentSource`, acceso
   `user_approved`, storage de referencia, `ProvenanceUser` con evidence ID
   sanitizado, parser `lmu-duckdb@1` y límites congelados;
4. `StageAuthorizedHistoricalArtifact` en la raíz privada exclusiva del run;
5. `duckdbadapter.LoadRuntime(duckdbadapter.ProductionTrust(applicationDir))`;
6. `duckdbadapter.NewReader`, `reader.Handshake` y
   `telemetryanalysis.NewLMUDuckDBParser`;
7. `parser.Inspect` y `parser.ReadPage` únicamente para los campos permitidos;
8. `reader.Close` **antes** de `staged.Cleanup` para cada candidato, incluido
   cualquier error o cancelación.

El siguiente candidato no comienza hasta que ambos cierres del anterior han
terminado. El coordinator mantiene contadores propios y al final exige
`open_readers=0`, `staging_entries=0` y `staging_roots=0`; no existe un
`ServiceShutdown` ficticio. Si `reader.Close` falla, aun así se intenta
`staged.Cleanup`, se conservan ambos errores de forma tipada/sanitizada y el run
termina `pipeline_fault`. El runtime confiado puede cargarse una sola vez por
run, pero todo reader y staging son estrictamente por candidato.

La raíz privada del run se crea nueva bajo el staging autorizado y su ruta
absoluta se conserva internamente desde la creación, sin globs ni variables de
entorno. Tras limpiar todos los directorios de candidatos, el coordinator
elimina solo esa raíz exacta y verifica su ausencia; eso define
`staging_roots=0`. No se ejecuta borrado recursivo sobre una ruta reconstruida,
vacía, padre o raíz del workspace.

## API interna propuesta

Las firmas concretas pueden adoptar tipos equivalentes, pero el contrato
observable queda congelado así:

```go
type RunMode string
const (
    ModeSynthetic RunMode = "synthetic_only"
    ModeExisting  RunMode = "execute_existing_authorized"
)

type CoordinateDigestV1 [32]byte
type CanonicalRecordingV1 struct { /* incluye CoordinateDigestV1 ya calculado */ }
type RecordingResultV1 struct { /* población y vueltas, identidad opaca */ }
type CohortFreezeV1 struct { /* grupo y commitments agregables */ }

func SerializeV1(CanonicalRecordingV1) ([]byte, error)
func ClassifyV1(CanonicalRecordingV1) (RecordingResultV1, error)
func SelectCohortV1([]RecordingResultV1) (CohortFreezeV1, error)
func RunSyntheticV1() ([]byte, error)
func RunExistingAuthorized(context.Context, Config) (AggregateV1, error)
```

`ClassifyV1` es pura: no abre archivos, no conoce rutas, no ejecuta SQL, no
consulta Wails y no muta la entrada. `SelectCohortV1` recibe resultados ya
ordenados, nunca puntuaciones de shape. Los errores son tipados; no se decide
por comparación de strings.

## Máquina de estados fail-closed

La transición válida es única:

```text
start
  -> preflight
  -> synthetic_controls_passed
  -> discovery_ready                 [solo modo real]
  -> population_serialized
  -> oracle_classified
  -> cohort_selected | stop_insufficient
  -> all_readers_closed
  -> all_staging_cleaned
  -> global_roots_zero
  -> aggregate_written
  -> complete
```

En modo sintético, `synthetic_controls_passed -> aggregate_written -> complete`
sin instanciar la pila productiva. Todo error o cancelación desde el primer
estado con recursos abiertos transita a `closing_reader -> cleaning_staging ->
checking_global_roots -> aborted`; no se escribe un resultado sustantivo si el
cleanup no termina. Una transición omitida, repetida o fuera de orden es
`pipeline_fault`.

## Serialización canónica `ta04f6/recording/v1`

La entrada de clasificación se materializa una sola vez por recording después
de pasar la autorización productiva. `SerializeV1` usa un formato binario
propio mínimo, no JSON ni mapas:

1. bytes ASCII fijos `ta04f6/recording/v1\x00`;
2. enteros `uint64` little-endian y booleanos de un byte `0` o `1`;
3. strings UTF-8 como `uint64(length) || bytes`, sin normalización implícita;
4. floats como bits IEEE-754 `float64` little-endian, rechazando NaN e
   infinitos antes de serializar;
5. slices como `uint64(count)` seguido de elementos en orden, sin sorting
   interno;
6. campos en el orden literal siguiente, sin extensiones opcionales: versión
   de schema; cuatro campos públicos ya normalizados del `group key`; para el
   par `GPS Latitude`/`GPS Longitude`, nombres, `Present`, `Quality`, frecuencia
   común, count común, primer/último índice y un `CoordinateDigestV1`; para
   `GPS Time`, `Lap Dist`
   y `Total Dist`, nombre, `Present`, `Quality`, frecuencia y pares
   `(index,value)`; después, eventos `Lap` en orden de lectura con `Present`,
   `Quality`, índice, timestamp y exactamente un valor numérico.

Las coordenadas crudas solo se recorren durante materialización para validarlas
y calcular un único `CoordinateDigestV1` keyed. Ese digest se almacena en
`CanonicalRecordingV1`; `SerializeV1` es pura, no recibe una clave, no vuelve a
leer muestras y solo copia los 32 bytes ya calculados.

El framing HMAC queda congelado byte a byte:

1. clave: `commit_key` de 32 bytes del run;
2. domain ASCII exacto `TA-04F6/CoordinateDigestV1\x00`;
3. `uint64(2)` little-endian para el número fijo de channels;
4. `uint64(pair_count)` little-endian para el número común de pares;
5. dos bloques, en orden obligatorio `GPS Latitude`, `GPS Longitude`;
6. cada bloque contiene `uint64(name_length)` little-endian, bytes ASCII del
   nombre, `Present` como un byte `0/1`, `uint64(sample_count)` little-endian y,
   por cada sample en orden, `uint64(index)` little-endian,
   `uint64(math.Float64bits(value))` little-endian,
   `uint64(quality_length)` little-endian y bytes ASCII exactos de `quality`.

Índices negativos, `Present` distinto de `0/1`, quality no ASCII, orden de
channels distinto o count diferente invalidan la entrada antes del HMAC. No se
incluye padding, separador adicional ni normalización de strings. Un vector
dorado fija clave, 27 pares por channel, framing completo y digest hexadecimal
esperado para impedir que productor y consumidor compartan el mismo error.

El selector no necesita las magnitudes de coordenadas y las descarta en cuanto
termina el digest; la serialización conserva únicamente ese HMAC y el resumen
común de índices. Esto vincula cambios sin retener ni emitir coordenadas. No se serializan ruta,
`CandidateID`, `session.ID`, nombre de archivo, mtime, coordenadas crudas, SQL,
errores crudos ni metadata no allowlisted. Los demás bytes existen solo en
memoria y se destruyen al cerrar. Dos serializaciones con la misma entrada y
`commit_key` deben ser idénticas byte a byte; un decoder v1 rechaza trailing
bytes, contadores imposibles, bools fuera de `0/1`, strings no UTF-8 y orden de
canales diferente.

## Materialización paginada exacta

Todos los canales y eventos se leen con tamaño fijo `4096`, por debajo de
`MaxLMUDuckDBPageRows=16384`. Para cada channel ID, la primera petición es
`ReadPage(id, 0, 4096)`. Cada respuesta debe tener `page.Start` exactamente
igual al `start` solicitado y cada sample debe tener índice global
`start + offset`, sin huecos, duplicados ni reinicio entre páginas.

Si la página contiene exactamente 4096 muestras, la siguiente petición usa
`start += 4096`. Una página corta (`0 < n < 4096`) o vacía (`n=0`) es EOF y no
se vuelve a pedir ese canal. Una respuesta con más de 4096, start distinto o
índice discontinuo es `data_invalid`; EOF no se infiere de metadata ni de una
excepción del reader.

Cada muestra continua contiene exactamente un `HistoricalValue` numérico,
no-null y con calidad `valid`; cada evento `Lap` contiene timestamp presente,
finito y exactamente un valor numérico no-null `valid`. La validación cruza
páginas: continuidad de índices, orden de timestamps y pairing no se reinician
en el borde. Los tests fuerzan resets, eventos y ventanas justo antes, en y
después de los offsets 4095/4096 y 8191/8192.

Los límites de recursos se congelan antes de cualquier lectura real:
`maxNumericChannelSamples=2_000_000` para cada uno de `GPS Time`, `Lap Dist` y
`Total Dist`; `maxLapEvents=100_000`; y `maxSerializedBytes=256 MiB` para una
entrada completa del decoder. El máximo histórico observado previamente para
un canal GPS fue aproximadamente `685.492` muestras, por lo que el cap numérico
conserva casi tres veces esa escala sin permitir asignaciones no acotadas. La
paginación pura recibe `context.Context`, `maxRows=2_000_000` y el callback de
lectura, mantiene páginas de `4096`, comprueba cancelación antes y después del
callback y rechaza counts, bytes restantes o aritmética de índices imposibles
antes de reservar memoria. Alcanzar un cap es `data_invalid` y hace fallar el
pipeline sin devolver ni publicar un resultado parcial; no se trunca.

## Identidad y commitments

Al iniciar el run real se genera una `commit_key` aleatoria de 32 bytes. Hasta
el freeze se mantiene en RAM y se usa para calcular:

- `recording_commitment = HMAC-SHA256(commit_key,
  "TA-04F6/recording/v1" || session.ID)`;
- `serialization_commitment = HMAC-SHA256(commit_key,
  "TA-04F6/serialization/v1" || SerializeV1(recording))`;
- para cada vuelta válida, `lap_commitment = HMAC-SHA256(commit_key,
  "TA-04F6/lap/v1" || recording_commitment || ordinal_reset_inicial ||
  ordinal_reset_final)` usando ordinales `uint64` little-endian.

El manifest de freeze versiona la `commit_key` pública y los commitments
pseudónimos completos para que una nueva instancia pueda recomputarlos. Esta
es una identidad pseudónima limitada, no anónima: quien ya posea un
`session.ID` podría correlacionarlo localmente. Se acepta solo en esta rama y
corte locales; no se autoriza push, PR ni publicación sin una revisión
explícita posterior de Isaac. Fuera del manifest, la clave se elimina de RAM al
cerrar. No se versionan IDs, rutas, tiempos, coordenadas o valores de muestra.
Los commitments prueban consistencia dentro de esta corrida y su reapertura;
no prueban identidad entre estudios con claves distintas.

## Población canónica del oracle

Cada recording Algarve entra exactamente en una población, aplicada antes de
buscar resets o vueltas y con esta precedencia:

| Condición | Población |
|---|---|
| número de eventos `Lap` `< 2` | `low_event` |
| `>= 2` y algún evento requerido tiene `Present=false`, `Quality!=valid`, índice o valores no finitos/no válidos, orden de índice o tiempo no estrictamente creciente, o timestamp fuera de la cobertura observada de `GPS Time` | `oracle_invalid` |
| `>= 2` y no se cumple ninguna invalidez anterior | `oracle_evaluable` |

La regla `< 2` tiene precedencia incluso si el único evento está corrupto. La
población se congela antes de usar el snapshot en el pairing. La validez
estructural de todas las filas requeridas sí pertenece a la tabla anterior.
El modelo disponible no contiene una señal independiente que permita distinguir
de forma demostrable snapshot ausente, duplicado o semánticamente discrepante;
TA-04F6 retira esos tres contadores diagnósticos y no inventa heurísticas. La
única regla observable es que el evento ordinal `0` se excluye siempre del
pairing y de sus denominadores. No hay cuarta población,
exclusión silenciosa ni fallback: por digest y globalmente debe cumplirse
`low_event + oracle_invalid + oracle_evaluable = recordings Algarve`.

Los tres límites numéricos usan comparaciones IEEE-754 directas:
`residual <= 0.0125`, `boundary <= 0.113` y discrepancia `<= 0.003`. No se
añade epsilon oculto. El valor exacto pasa y
`math.Nextafter(limit, +Inf)` falla usando fixtures con copia profunda.

Solo `oracle_evaluable` puede aportar vueltas válidas. `low_event` y
`oracle_invalid` se cuentan y reportan, pero nunca cruzan elegibilidad aunque
sus resets internos parezcan consistentes.

El pairing post-snapshot no usa el snapshot como predicción, match, mismatch,
frontera ni denominador. Conserva el offset ordinal congelado y empieza en
`evento[1]`; no se intenta clasificar semánticamente el evento ordinal `0` ni
se emiten contadores de snapshot no demostrables.

## Guards de canal y progreso

Un recording `oracle_evaluable` se procesa únicamente si los cinco canales
requeridos tienen `Present=true`, `Quality=valid`, una columna numérica, todas
las muestras finitas e índices estrictamente crecientes y consecutivos. Cada
frecuencia declarada es finita y positiva.

Además:

- `GPS Latitude` y `GPS Longitude` declaran exactamente la misma frecuencia,
  el mismo count y la misma secuencia de índices globales; forman pares solo
  por igualdad exacta de índice;
- esa frecuencia de coordenadas es independiente de `GPS Time`: no se exige ni
  se espera igualdad entre ambas (el schema canónico observado permite
  coordenadas a 10 Hz y `GPS Time` a 100 Hz);
- `Total Dist` declara exactamente la misma frecuencia que `Lap Dist` y tiene
  exactamente el mismo count y la misma secuencia de índices globales; ninguna
  interpolación o alineación por proximidad está permitida;
- `Lap Dist >= 0` en cada muestra;
- un reset existe solo ante descenso **estricto** entre muestras consecutivas;
- dentro de cada tramo entre resets `Lap Dist` nunca desciende;
- cada ventana candidata contiene al menos dos muestras de `Lap Dist`;
- `Total Dist` es finito, no negativo y monótono no decreciente;
- en cada ventana, los incrementos de `Total Dist` y `Lap Dist` definidos por
  la regla exacta de longitud deben ser positivos y coherentes;
- ninguna interpolación cruza un gap, índice ausente o cobertura no observada.

Un fallo es `data_invalid` para ese recording; no se corrige, rellena, reordena
ni convierte en cero.

## Oracle ordinal y fronteras

Los resets físicos se numeran `R[0]..R[m-1]` desde cero en orden observado y
conservan siempre esos ordinales. El pairing único es:

```text
reset ordinal k -> evento Lap ordinal k+1
```

El evento `0` es snapshot excluido. No hay nearest-neighbor, búsqueda por
proximidad, desplazamiento tras un fallo ni reutilización. Reset y evento
participan como máximo una vez. Un miembro ausente queda no emparejado.

Cada lap candidata original `W[k]` usa índices de `Lap Dist`
`[start,end) = [R[k],R[k+1])`. El sample `R[k]` que materializa el reset
pertenece a la vuelta derecha y el sample `R[k+1]` queda excluido y pertenece a
la siguiente. Ninguna ventana inválida se elimina o compacta.

Sus fronteras temporales son `t_start=start/lap_dist_hz` y
`t_end=end/lap_dist_hz`. Se seleccionan muestras de `GPS Time` por la coordenada original
`gps_index/gps_hz` en el intervalo **cerrado**
`t_start <= gps_index/gps_hz <= t_end`, sin rebasing ni extrapolación. Debe
haber al menos dos muestras GPS consecutivas. La cobertura es direccional: la
primera no puede preceder `t_start` y debe cumplir
`first_time-t_start <= 0.0125 s`; la última no puede superar `t_end` y debe
cumplir `t_end-last_time <= 0.0125 s`.

Independientemente, se seleccionan pares Latitude/Longitude por
`coord_index/coord_hz` en el mismo intervalo cerrado. Deben existir al menos 2
pares con índices consecutivos y sin gap. La cobertura también es direccional:
`coord_first >= t_start`, `coord_last <= t_end`,
`coord_first-t_start <= 1/coord_hz` y
`t_end-coord_last <= 1/coord_hz`. Se usan comparaciones sobre los cocientes
exactos definidos por los enteros y la frecuencia declarada; no se remuestrea,
interpola ni exige que un índice de coordenadas coincida con un índice de
`GPS Time`. Una ventana que falla la cobertura GPS Time o la cobertura del par
de coordenadas no es preliminar.

Se ajusta solo el intercepto fixed-slope de esa ventana:

```text
b_w = mean(gps_time[i] - gps_index[i] / gps_hz)
predicted_time(index) = index / source_hz + b_w
```

La pendiente nunca es libre. Cada residual de muestra GPS debe ser
`<= 0.0125 s`; de lo contrario la ventana y sus predicciones son inválidas.

El grafo ordinal se construye sobre **todos** los resets físicos, no sobre una
subsecuencia de ventanas válidas. Solo `R[0]` y `R[m-1]` son fronteras
exteriores: `R[0]` exige `W[0]` y `R[m-1]` exige `W[m-2]`. Cada `R[k]` interno,
`0 < k < m-1`, exige simultáneamente `W[k-1]` y `W[k]`; su residual es el máximo
de los dos residuos absolutos. Si cualquier ventana adyacente requerida es
inválida, la frontera es `one_side_invalid`. Una ventana inválida en medio nunca
convierte sus vecinas en nuevos exteriores ni permite realinear ordinales.

La ecuación exacta usa el índice raw del reset y el timestamp observado del
evento ordinal:

```text
predicted_left(k)  = R[k] / lap_dist_hz + b_left
predicted_right(k) = R[k] / lap_dist_hz + b_right
internal_residual(k) = max(
    abs(event[k+1].timestamp - predicted_left(k)),
    abs(event[k+1].timestamp - predicted_right(k)),
)
exterior_residual(0)     = abs(event[1].timestamp - predicted_right(0))
exterior_residual(m - 1) = abs(event[m].timestamp - predicted_left(m - 1))
```

Para una frontera interna, `b_left` pertenece a `W[k-1]` y `b_right` a
`W[k]`. En el exterior inicial solo existe el lado derecho y en el final solo
el izquierdo. No se usa `gps_index`, índice compactado, start relativo ni
timestamp predicho de otra frontera en estas ecuaciones.

La frontera física `R[k]` hace match solo si tiene su pareja `evento[k+1]` y
su residual único es `<= 0.113 s`. Un miembro ausente queda unpaired; una
pareja presente fuera de tolerancia es mismatch.

Una vuelta válida es exclusivamente la ventana original `W[k]` entre los resets
físicos consecutivos `R[k]` y `R[k+1]` cuando:

1. su ventana fixed-slope es válida;
2. las fronteras físicas `R[k]` y `R[k+1]` hacen match, respectivamente con los
   eventos `k+1` y `k+2`, dentro de `0.113 s`;
3. pasa todos los guards de canal, progreso, `Total Dist` y longitud.

Una frontera inválida rompe las vueltas de ambos lados que dependan de ella.
No existe selección del lado favorable. Las ventanas parciales antes del
primer reset y después del último no son vueltas.

## Regla exacta de longitud

Para cada ventana original `[start,end)` que haya pasado los gates anteriores,
con `end-start >= 2`, se calculan sobre los mismos índices:

```text
total_length = TotalDist[end-1] - TotalDist[start]
lap_length   = LapDist[end-1] - LapDist[start]
```

Se usa la diferencia y no `max(LapDist)` porque el sample de reset `start`
pertenece a la vuelta derecha y puede comenzar en un valor pequeño distinto de
cero; restarlo compara exactamente el mismo intervalo de muestras que
`TotalDist`. El sample de reset `end` está excluido y no puede contaminar la
longitud con el comienzo de la siguiente vuelta. Ambas longitudes deben ser
finitas y estrictamente positivas. Su discrepancia relativa es:

```text
abs(total_length - lap_length) / max(total_length, lap_length) <= 0.003
```

Si pasa, la longitud canónica de esa vuelta es `total_length`; esa es la única
serie usada para las medianas siguientes.

Después se aplica este procedimiento determinista, sin iteración ni poda:

1. formar vueltas preliminares que pasan todos los gates salvo el filtro de
   centro de grupo;
2. solo un recording con `>= 10` vueltas preliminares aporta su mediana;
3. ordenar ascendentemente una copia de sus longitudes con desempate estable;
   para cardinalidad impar usar el centro y para cardinalidad par el promedio
   aritmético `a+(b-a)/2` de los dos centrales, rechazando overflow/no finitud;
4. ordenar y calcular con la misma regla, **una sola vez**, la mediana de esas
   medianas de recording para el `group key`;
5. aceptar una vuelta solo si su discrepancia relativa respecto a esa mediana
   global es `<= 0.003`;
6. no recalcular la mediana de recording ni el centro de grupo tras rechazar
   vueltas por el paso anterior.

Esta es la regla **median-of-recording-medians no iterativa**. Cada recording
contribuye una sola mediana al centro de grupo, independientemente de cuántas
vueltas tenga. Un recording con menos de 10 preliminares nunca influye en el
centro. Si quedan menos de 3 recordings contribuyentes, no existe centro y el
grupo no califica. Si una mediana no existe o no es positiva/finita, el
recording no es elegible. El runner conserva conteos preliminares, centro
congelado y conteos postfiltro para demostrar que no hubo poda iterativa.

## Orden, grupos y selección sin subconjunto favorable

El modo real ejecuta discovery fresco de todos los `ready` y reordena con tres
claves exactas: `ModifiedAt.UTC().UnixNano()` ascendente, `Size` ascendente y
`Locator` ascendente por comparación lexicográfica de sus bytes UTF-8, sin
normalización de locale. `CandidateID` no participa. `Locator` se mantiene solo
en RAM para sort/autorización y nunca aparece en stdout, stderr, agregado o
manifest. Un test con empate exacto de tiempo/tamaño y locators con prefijo,
mayúsculas y bytes UTF-8 fija el orden esperado literal. El filtro Algarve y la
normalización son exactamente los de TA-04F4. El `group key` es, en orden:

1. `TrackName`;
2. `TrackLayout`;
3. `CarName`;
4. `CarClass`.

Cada campo es público, presente y válido; normalización exacta: `TrimSpace`,
`Fields` unido con un espacio ASCII y `ToLower`, sin accent folding. Dedupe por
`session.ID` ocurre solo en RAM.

Un grupo califica solo si tiene `>= 3` recordings distintos y **cada uno**
conserva `>= 10` vueltas válidas tras todos los gates. Se selecciona el primer
`group key` que califique por orden de primera aparición en el discovery
canónico. Una vez elegido, se incluyen:

- todos los recordings elegibles de ese grupo, no solo los tres primeros;
- todas las vueltas válidas de cada recording, no solo diez;
- en el orden canónico de recording y ordinal de vuelta.

No se comparan grupos por número de vueltas, tasa de match o favorabilidad. No
se elimina un recording o vuelta por efecto sobre un resultado posterior.

## Budgets y custodia

- máximo `min(512, ready_candidate_count)` candidatos intentados;
- máximo acumulado staged `32 GiB`, sumado por `Size` antes de abrir;
- máximo `120 min` de pared;
- ejecución secuencial y una sola sesión abierta;
- staging productivo privado y read-only;
- PRE/POST, WAL ausente y revalidación de identidad productiva;
- `reader.Close` y después `staged.Cleanup` antes del siguiente candidato;
- al finalizar o abortar: helper cerrado, `open_readers=0`,
  `staging_entries=0`, `staging_roots=0` y temporales `0`.

Si un budget bindea antes de cubrir todos los `ready`, no se acepta una cohorte
parcial: `pipeline_fault(budget_exhausted)`. Una composición distinta de los
cinco digests Algarve `10 / 3 / 1 / 1 / 1` es
`pipeline_fault(group_composition_changed)`.

## Freeze antes de cualquier análisis posterior

Tras seleccionar la cohorte, el runner debe cerrar el último reader, limpiar su
staging, comprobar los tres ceros globales y emitir un manifest canónico
sanitizado con:

- versión de protocolo y SHA;
- SHA del commit revisado del runner;
- digest del `group key`;
- `commit_key` pública de 32 bytes, limitada a esta rama local;
- número de recordings y vueltas;
- commitments de recording, serialización y vuelta en orden canónico;
- conteos agregados de población, guards, matches y rechazos;
- confirmaciones `open_readers=0`, `staging_entries=0`, `staging_roots=0` y
  temporales `0`.

El manifest se revisa y se versiona en un commit dedicado. Hasta verificar que
ese commit existe y precede al análisis, está prohibido calcular shape,
residuales espaciales, jitter, bootstrap o outcomes TA-04F. Una reapertura
posterior repetirá desde cero la pila low-level, con trackers, artifacts,
staging y readers nuevos, y solo reconstruirá la cohorte mediante los
commitments. Cambio, ausencia o exceso produce `selection_changed` y detiene el
análisis.

TA-04F6 termina en este freeze. El análisis de shape no forma parte de esta
tarea ni puede añadirse al runner.

## Salida y privacidad

### Erratum del manifest de freeze

La evidencia por grupo es privada y verificable sin publicar una huella de su
metadata. Los grupos se enumeran por orden canonico de primera aparicion como
`group_1`, `group_2`, etc. El digest determinista del `group key` puede usarse
solo en RAM para agrupar y componer; nunca aparece en stdout ni en el manifest.
Cada grupo publica `recordings`, su poblacion, rechazos de guard/data,
`contributors_preliminary_ge10`, `eligible_postfilter_ge10` y dos histogramas
ordenados de conteos por recording (preliminar y postfiltro), sin IDs ni
asociacion de cada conteo a un recording. El framing JSON estable usa arrays de
objetos en orden ordinal, claves JSON fijas y histogramas como pares
`{"count":N,"recordings":M}` ordenados por `count` ascendente.

Si hay menos de tres contributors con al menos diez vueltas preliminares,
`center_present=false`: no se calcula centro ni se ejecuta postfiltro,
`eligible_postfilter_ge10=0` y el histograma postfiltro es `[]`. Con tres o mas,
el centro se calcula exactamente una vez y `center_present=true`. Un
`ProcessedCandidate` con `Reject` nunca es elegible aunque contenga un recording
o vueltas fabricadas; se conserva solamente en ledger y poblacion.

El contador global `valid_laps` suma exclusivamente vueltas que atravesaron el
postfiltro de un grupo con centro presente. Por tanto, un grupo sin centro
aporta cero aunque conserve vueltas preliminares. La evaluacion canonica de
grupo calcula centro y postfiltro una sola vez; seleccion, `valid_laps` y
evidencia del manifest proyectan ese mismo resultado y nunca lo recalculan.

Para `stop_insufficient`, el JSON omite `commit_key` y los tres arrays de
commitments. Para `cohort_frozen` los conserva. El manifest tampoco publica
`group_digest` ni ningun digest determinista de metadata de grupo.

El ledger de cleanup publicado contiene solo `open_readers`,
`staging_entries` y `staging_roots`, medidos antes de escribir. Se retira el
claim `temporaries=0`, porque el temporal de output nace despues de esa
medicion. La evidencia humana debe verificar externamente, tras terminar el
proceso, que no quedan temporales. El filename protocolario de stop, los
thresholds, la seleccion, el golden y la composicion permanecen sin cambios.

El stdout y el archivo agregado permiten únicamente:

- versión/SHA de protocolo y runner;
- estado y outcome tipados;
- conteos globales y por digest de grupo;
- cardinalidades de población y razones cerradas de rechazo;
- cardinalidad de cohorte y vueltas;
- comprobaciones booleanas de determinismo, integridad y cleanup;
- la `commit_key` pública limitada al freeze local;
- digests/commitments pseudónimos previstos para el manifest.

Queda prohibido emitir rutas, IDs crudos, nombres de archivo, timestamps
absolutos, coordenadas, muestras, metadata privada, valores por vuelta o
mensajes de error sin sanitizar. Los logs siguen la misma restricción. Una
prueba automática inspecciona stdout, stderr y salida serializada.

## Outcomes de selección

El runner emite exactamente uno:

- `cohort_frozen`: existe un primer grupo calificable y se produjo un manifest
  completo pendiente de commit/revisión;
- `stop_insufficient`: el barrido completo y válido terminó sin grupo
  `>= 3 x >= 10`;
- `selection_changed`: una reapertura posterior no reproduce commitments;
- `pipeline_fault`: preflight, sintéticos, serialización, población, ledger,
  composición, budget, determinismo, integridad, escritura o cleanup fallan.

Ningún outcome cambia capabilities, valida shape o autoriza trabajo visual.

## Golden integral independiente congelado antes de implementación

Estas constantes se calcularon durante la redacción con una rutina de
referencia efímera que solo escribió primitives little-endian y aplicó
HMAC/SHA-256 de la plataforma; no importó ni llamó código de Vantare. Se
congelan aquí **antes** de implementar el runner. Los tests deben copiar los
expected como literales y está prohibido generarlos con `SerializeV1`,
`ClassifyV1`, `SelectCohortV1` o cualquier helper productivo bajo prueba.

Fixture de señal base por recording:

- `commit_key` son los bytes `00 01 ... 1f`;
- group key normalizado del recording cuyo digest se fija:
  `track`, `layout`, `car`, `class`;
- `lap_dist_hz=1`, `coord_hz=1`, `gps_hz=2`;
- 27 samples `Lap Dist`/`Total Dist`, índices `0..26`;
- `LapDist[0]=1`; para `i>=1`, impares `0` y pares `1`;
- `TotalDist[i]=i`;
- 13 resets raw `R[k]=1+2*k`, `k=0..12`, y 12 ventanas
  `W[k]=[R[k],R[k+1])`;
- 53 samples `GPS Time`, índices `0..52`, valor `i/2+0.25`;
- 27 pares de coordenadas, índices `0..26`: latitude `40+i/1000` y
  longitude `-8-i/1000`, ambos `Present=1`, quality ASCII `valid`;
- 14 eventos: evento `0` snapshot en `0.25`; evento `k+1` tiene timestamp
  `R[k]+0.25`; índices de evento `0..13`, valor numérico igual al índice y
  quality ASCII `valid`;
- todos los campos/channel quality son `valid` y todos los Present son `1`.

Para el `CoordinateDigestV1`, el framing exacto ya congelado mide 1668 bytes y
debe producir:

```text
022cb559b684bea022fff3318b20871d6dfb11a8bc23896f69cc02f73984cd81
```

Para fijar completamente el golden de `SerializeV1`, este fixture usa, tras el
domain, este orden literal adicional: schema `uint64(1)`; cuatro strings de
group; strings Latitude/Longitude; dos Present; dos quality; frecuencia/count/
first/last comunes; 32 bytes de `CoordinateDigestV1`; después bloques
`GPS Time`, `Lap Dist`, `Total Dist`, cada uno como nombre, Present, channel
quality, frecuencia, count y pares index/floatbits; finalmente `Lap` como
nombre, Present, channel quality, count y tuplas
index/timestamp-floatbits/value-floatbits/sample-quality. Longitudes y enteros
son `uint64` LE. El resultado mide 2615 bytes y su SHA-256 esperado es:

```text
bfee54cc815eb3fccfc8fec9ed59894d98d2e2fde81996d734aa4348e64f7534
```

Una review independiente recalculó desde el framing publicado, mediante
PowerShell/.NET y sin importar ni ejecutar código Vantare, ambos resultados:
payload de coordenadas `1668` bytes y HMAC `022cb559...cd81`, serialización
`2615` bytes y SHA-256 `bfee54cc...7534`. Resultado: **MATCH**.

Expected por recording de señal base:

| Métrica | Expected |
|---|---:|
| población | `oracle_evaluable` |
| resets / boundaries | `13 / 13` |
| ventanas intentadas/válidas | `12 / 12` |
| matches/mismatches/one-side/unpaired | `13 / 0 / 0 / 0` |
| residual de cada boundary | `0 s` |
| `lap_length` / `total_length` por ventana | `1 / 1` |
| vueltas preliminares/postfiltro | `12 / 12` |
| mediana de recording | `1` |

El vector integral de selección contiene 8 recordings consecutivos con esa
misma señal e IDs internos distintos: slot 0 pertenece a un grupo A distinto;
slots 1--3 al group key `track/layout/car/class`; slots 4--7 a un grupo C
distinto. Los tres grupos tienen respectivamente cardinalidad `1 / 3 / 4` y
orden de primera aparición `A / B / C`. Expected agregado global:

```text
recordings=8
oracle_evaluable=8 low_event=0 oracle_invalid=0
resets=104 boundaries=104 matches=104 mismatches=0 one_side_invalid=0
preliminary_windows=96 valid_laps=96
```

Expected selección: A no califica, B es el primer grupo calificable, C no lo
desplaza; se incluyen exactamente los 3 recordings de B y sus 36 vueltas, con
centro de grupo `1`, outcome `cohort_frozen`. Este golden prueba en una sola
ruta serialización, población, 13 boundaries, 12 ventanas, fórmulas, longitud,
mínimo `3 x 10`, orden y ausencia de subconjunto favorable.

## Estrategia TDD obligatoria

Antes de implementar comportamiento, añadir tests RED y hacerlos pasar con el
menor código posible. El corpus es sintético, local, determinista y efímero.
Debe cubrir como mínimo:

1. default `-mode=synthetic` no instancia discovery/readers; solo acepta
   `synthetic` o `existing-authorized`, y el modo real exige todos sus flags;
2. rechazo de worktree sucio, rama incorrecta, protocol SHA incorrecto, blob de
   plan cambiado, `HEAD != runner-sha`, runner merge, parent incorrecto y scope
   fuera del tool, todo antes de datos;
3. serialización v1 determinista, round-trip exacto y rechazo de trailing
   bytes, NaN, infinito, UTF-8 inválido, canales reordenados y contadores
   imposibles; `CoordinateDigestV1` usa además un vector dorado con framing y
   hex esperados independientes de `SerializeV1`;
4. cero y un evento, incluso defectuoso, son `low_event`; con `>= 2`, cada
   defecto de presencia, calidad, finitud, orden y cobertura produce
   `oracle_invalid`; el resto es `oracle_evaluable`;
5. conservación exacta de poblaciones global y por digest;
6. resets solo por descenso estricto y ausencia de resets por igualdad;
7. regresión off-by-one: `reset[k] -> event[k+1]` pasa y
   `reset[k] -> event[k]` falla;
8. evento ordinal `0` excluido de pairing y denominadores, sin heurísticas ni
   contadores semánticos de snapshot;
9. solo el primer y último reset físico son exteriores; una ventana inválida
   interna conserva su slot, no crea exteriores nuevos y vuelve
   `one_side_invalid` las fronteras que la requieren;
10. las ecuaciones usan `R[k]/lap_dist_hz+b_side`; residual exactamente
    `0.113 s` pasa, uno mayor falla y una frontera interna con lado izquierdo
    dentro pero derecho fuera falla por el máximo (y viceversa), sin escoger el
    favorable;
11. una vuelta requiere dos boundaries consecutivas matched; fallo inicial,
    interno o final rechaza exactamente las vueltas adyacentes;
12. casos low-event con muchos resets nunca aportan vueltas elegibles;
13. fixed-slope por ventana: residual exactamente `0.0125 s` pasa; residual
    mayor, pendiente libre disfrazada, gap, índice discontinuo o cobertura
    incompleta de `GPS Time` fallan; cobertura de coordenadas prueba intervalo
    cerrado, dirección, tolerancia `1/coord_hz`, mínimo 2 pares y ausencia de
    gaps;
14. guards de los cinco canales, calidad, finitud, índice, progreso y
    `Total Dist`, incluido frecuencia/count/índices distintos de `Lap Dist`,
    descenso, cero y discrepancia; Latitude/Longitude fallan separadamente por
    frecuencia, count, start, end o gap distintos, mientras un caso válido
    exige explícitamente frecuencia de `GPS Time` distinta de la frecuencia de
    coordenadas;
15. `[start,end)` excluye el reset derecho y calcula exactamente
    `TD[end-1]-TD[start]` y `LD[end-1]-LD[start]`; límite `0.003` exacto pasa y
    mayor falla;
16. mediana impar y par (promedio estable de centrales), recording con muchas
    vueltas con el mismo peso, exclusión de recordings con menos de 10
    preliminares, centro calculado una vez y sin recomputar tras postfiltro;
17. un grupo requiere `>= 3` recordings con `>= 10` vueltas cada uno; 2x10,
    3x9 y mezcla de recordings fallan;
18. primer grupo calificable por orden de aparición, incluyendo todos sus
    recordings y vueltas aunque un grupo posterior sea más favorable;
19. sort exacto `UTC UnixNano/Size/Locator bytes` con empate total salvo
    locator; dedupe por recording y determinismo ante repetición completa;
20. commitments cambian por recording, serialización y ordinal de vuelta, y
    son idénticos dentro del mismo run con la misma clave;
21. salida agregada no contiene sentinels sintéticos que representen IDs,
    rutas, timestamps, coordenadas o muestras;
22. cancelación/error en cada estado demuestra orden `reader.Close` antes de
    `staged.Cleanup`, continuación del cleanup si Close falla,
    `open_readers=0`, `staging_entries=0`, `staging_roots=0`, temporales `0` y
    ausencia de resultado parcial;
23. output real rechaza path relativo/alternativo, parent o target reparse y
    target existente; `O_EXCL -> Sync -> Close -> rename` en el mismo
    directorio es atómico y cada fallo elimina solo el temporal exacto;
24. paginación 4096 exige start exacto, EOF corto/vacío, continuidad global,
    un valor numérico exacto y cruces 4095/4096 y 8191/8192 sin duplicar ni
    perder resets/eventos;
25. GPS lat/lon crudos no sobreviven la validación;
    `CoordinateDigestV1` ya calculado queda dentro de `CanonicalRecordingV1`,
    cambia con nombre/present/count/índice/valor/calidad de cualquiera de los
    dos channels ordenados, y `SerializeV1` permanece pura sin clave ni lectura;
26. dos ejecuciones sintéticas producen bytes agregados idénticos salvo campos
    de commitment cuando deliberadamente cambia la clave.
27. golden integral independiente comprueba literalmente los dos digests,
    12 ventanas/13 boundaries, 13 matches, longitudes 1, agregado de 8
    recordings y selección B `3 recordings / 36 laps`; ningún expected se
    obtiene invocando funciones productivas.

Checks de la fase de implementación:

```powershell
gofmt -w tools/ta04f6-cohort-selector/*.go
go test ./tools/ta04f6-cohort-selector/...
go test -race ./tools/ta04f6-cohort-selector/...
go vet ./tools/ta04f6-cohort-selector/...
go run ./tools/ta04f6-cohort-selector -mode=synthetic
git diff --check
```

La suite global `go test ./...` se ejecuta porque el runner importa contratos
compartidos, aunque no cambie producto. Si una limitación de toolchain impide
`-race`, se registra literalmente; no se sustituye por una afirmación.

## Gates secuenciales

### Gate 1 -- protocolo

1. revisar este plan;
2. corregir cualquier ambigüedad;
3. versionarlo en un commit dedicado;
4. registrar su SHA exacto en el runner.

No se implementa antes de este commit.

### Gate 2 -- runner sintético versionado

1. implementar por TDD solo `tools/ta04f6-cohort-selector`;
2. ejecutar checks focales, race, vet, sintéticos, suite global y diff-check;
3. review independiente de especificación y calidad;
4. revisar personalmente el diff y la evidencia;
5. corregir y repetir checks;
6. commit dedicado del runner limpio.

Durante todo Gate 2, `-mode=synthetic` es el único modo ejecutado. No hay
discovery, DuckDB, staging ni `Open`.

### Gate 3 -- autorización ejecutable y run real separado

Solo después del commit del runner y de verificar worktree limpio se ejecuta,
en una acción separada, `-mode=existing-authorized` con los SHA exactos de
protocolo y runner. Debe cumplirse `HEAD == runner-sha`, commit no-merge, padre
único igual a `protocol-sha`, scope limitado al tool y `protocolSHA` compilado
igual al commit del plan. El run usa los DuckDB existentes ya autorizados,
completa cleanup y produce únicamente el agregado/manifest sanitizado pendiente
de review.

### Gate 4 -- freeze documental

1. revisar agregado, privacidad, ledger, commitments y cleanup;
2. versionar el manifest en commit dedicado;
3. verificar que su commit precede cualquier análisis posterior;
4. detener TA-04F6.

No existe Gate 5 de shape en esta tarea.

## Límites de autoridad

Siempre: cambio pequeño, stdlib/pila productiva, tests antes de commit,
privacidad fail-closed, cleanup completo y documentación honesta.

Requiere parar: dependencia nueva, cambio arquitectónico, modificación de
producto/Wails/capabilities, contradicción de SHA/base, fallo de tests no
entendido, necesidad de más archivos fuera del alcance o imposibilidad de
verificar cleanup.

Nunca: leer `.env`, persistir datos crudos, elegir subconjunto favorable,
relajar thresholds, reconstruir el legacy como si fuera exacto, calcular
shape, iniciar UI/mapa/capturas o delegar trabajo visual. No se crea Linear
ahora por la excepción expresa de Isaac; se documentará al final. No hay push,
PR, CI remoto, merge, promoción ni release.

## Criterios de éxito del plan

- el protocolo define de forma ejecutable población, oracle, ventanas,
  fronteras, vuelta, longitud, selección, serialización y privacidad;
- el runner seguro por defecto puede implementarse sin decidir nada mirando
  datos existentes;
- implementación sintética y ejecución real quedan separadas por review y
  commit;
- una cohorte solo puede congelarse incluyendo todos los recordings y vueltas
  válidos del primer grupo que alcance el mínimo;
- el freeze por commitments ocurre en un commit anterior a cualquier análisis;
- TA-04F6 termina sin shape y conserva el STOP visual.
