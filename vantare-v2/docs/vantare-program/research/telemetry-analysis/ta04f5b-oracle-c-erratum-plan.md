# TA-04F5B -- erratum preregistrado del oracle C

Estado: plan local anterior al rerun. TA-04F5B es un diagnóstico mínimo,
retrospectivo y contaminado para resolver el `pipeline_fault` provisional de
TA-04F5. No reabre A/B, no cambia producto, no valida shape y no inicia F6.

## Objetivo único

Determinar si el cero del oracle C de TA-04F5 procede de un fallo de
pairing/scoring y producir agregados internamente coherentes bajo una convención
inequívoca. TA-04F5B no intenta mejorar elegibilidad ni buscar un resultado
favorable.

## Base y universo inmutables

El rerun referencia:

- TA-04F5 plan@`92baeb352128db0361f1e8143d7f833dc4011619`;
- evidencia provisional TA-04F5 versionada antes de reabrir datos;
- algoritmo C, tolerancias, custodia y privacidad del mismo plan, salvo los
  errata exactos definidos aqui.

Se exige discovery fresco all-ready y la misma composicion agregada:

| Digest | Cardinalidad |
|---|---:|
| `a3bc403d0d95` | 10 |
| `5408e8c63175` | 3 |
| `0fdba66ae60f` | 1 |
| `29df53711ee1` | 1 |
| `a0688419dfb3` | 1 |

Total obligatorio: 16 Algarve. Si cambia cualquier digest o cardinalidad, el
resultado es `pipeline_fault`. No se elige un subconjunto y no se publican IDs,
rutas, timestamps, coordenadas, muestras ni identidades de recording.

## Baseline A/B congelado

A y B **no se recalculan** como análisis. Solo se copian como baseline de la
evidencia TA-04F5:

- elegibles globales y por digest;
- clases de fallo agregadas;
- oracle B agregado.

Una comprobacion de composición/discovery no constituye recalcular A/B. Si el
runner necesita leer los canales para C, no puede volver a emitir o sustituir
dispositions A/B observadas. Cualquier contradiccion con ese baseline termina
`pipeline_fault` y no se resuelve ajustando A/B.

## Poblacion y scoring C

Se puntuan **todos** los recordings `oracle_evaluable`, no solo recordings C
elegibles. La definición `oracle_evaluable` no cambia: `>= 2` eventos `Lap`
validos, finitos, estrictamente ordenados y dentro de cobertura. Las poblaciones
esperadas son `oracle_evaluable=6`, `low_event=9`, `oracle_invalid=1`; cualquier
cambio se reporta y termina `pipeline_fault`.

El snapshot se **excluye** por completo del oracle C. No es una predicción, no
es un match, mismatch ni huerfano y no entra en ningún denominador. Todos los
conteos observados y denominadores se denominan explicitamente
`post_snapshot`.

## Convencion exacta de fronteras C

Para cada recording `oracle_evaluable`:

1. Detectar resets de `Lap Dist` igual que TA-04F5.
2. Construir ventanas con la convención `[start,end)` congelada; el sample del
   reset pertenece a la ventana derecha.
3. Calcular los interceptos fixed-slope solo de ventanas C validas, sin cambiar
   tolerancias, cobertura ni pendiente.
4. Cada frontera cuenta **exactamente una vez**. La frontera exterior inicial
   usa solo el intercepto de la primera ventana interior valida; la exterior
   final usa solo el de la ultima ventana interior valida. Una frontera interna
   entre `w_left` y `w_right` usa ambos lados.
5. La prediccion interna es evaluable solo si ambos lados son validos; una
   exterior exige su unica ventana interior correspondiente. Si falta o falla
   cualquier lado exigible, la frontera se clasifica `one_side_invalid`; no se
   escoge el lado favorable ni se cuenta como prediccion valida.
6. Para una frontera interna, calcular contra el mismo timestamp observado dos
   residuos, usando `b_left` y `b_right`; para una frontera exterior calcular
   solo el residual de su unica ventana interior exigible.
7. El residual unico interno es
   `max(abs(residual_left), abs(residual_right))`; en un exterior es el valor
   absoluto del unico residual exigible.
8. La frontera hace match solo si ese máximo es
   `<= SpatialTolerance.BoundaryResidualSeconds`.

Los extremos exteriores se puntuan con su unica ventana interior para mantener
todos los eventos post-snapshot en el denominador. No hay nearest-neighbor,
reordenacion, rebasing, seleccion de lado ni ajuste de pendiente.

## Pairing ordinal exacto

El pairing se congela como:

- reset ordinal `k` -> evento ordinal `k+1`, incluidos los dos resets
  exteriores;
- índices ordinales base cero;
- evento `0` = snapshot excluido;
- cada reset y cada evento post-snapshot pueden participar como máximo en una
  pareja ordinal;
- una pareja ordinal con ambos miembros pero residual fuera de tolerancia es
  `mismatch`, no orphan;
- una frontera `one_side_invalid` conserva su posición ordinal pero no puede
  hacer match; se reporta separadamente y como predicción no valida.

No se desplazan ordinales para saltar una frontera inválida. Esto evita que un
fallo temprano realinee favorablemente el resto.

## Huerfanas y denominadores

Los orphans se calculan **por recording** y luego se suman:

`orphans_total = sum_r(abs(valid_predictions_r - observed_post_snapshot_r))`

Se reportan ademas, por separado:

- `unpaired_predictions = sum_r(max(valid_predictions_r - observed_r, 0))`;
- `unpaired_events = sum_r(max(observed_r - valid_predictions_r, 0))`;
- `one_side_invalid`;
- `paired_mismatches`.

Scoring agregado sobre todos los `oracle_evaluable`:

- `precision = matches / valid_predictions`;
- `recall = matches / observed_post_snapshot`;
- denominador cero en cualquier recording o agregado es fallo explícito
  `zero_denominator`, nunca 100 % ni omision silenciosa.

La suma agregada debe reconciliarse con el ledger por digest. Un agregado no
puede inferirse solo restando totales globales si la composición por recording
produce otra suma de valores absolutos.

## Ledger agregado versionable

El ledger efimero puede mantener filas opacas en RAM, pero la evidencia solo
versiona por digest:

- recordings totales y `oracle_evaluable`;
- ventanas intentadas/validas;
- fronteras internas candidatas;
- `valid_predictions`, `observed_post_snapshot`, `matches`, mismatches,
  `one_side_invalid`, `unpaired_predictions`, `unpaired_events` y orphans;
- residual de frontera p50/p95/p99/max sobre la métrica
  `max(left,right)` de parejas validas;
- precision y recall con numerador/denominador explícitos;
- clases de fallo y cleanup.

Debe incluir una fila total que sea suma exacta de los cinco digests. No se
versionan métricas por recording.

## Controles sintéticos obligatorios

Antes de puntuar datos existentes deben pasar dos evaluaciones idénticas de un
corpus sintético temporal del helper que cubra:

1. `>= 12` ventanas completas, `>= 11` fronteras internas y eventos ordinales
   coincidentes: full match, precision/recall 100 %, cero huerfanas;
2. regresión off-by-one: emparejar `reset[k]` con `event[k]` debe fallar el
   control, mientras `event[k+1]` pasa;
3. snapshot excluido: añadir o mover solo el snapshot no cambia denominadores
   post-snapshot ni pairing;
4. denominador cero: cero predicciones o cero eventos produce
   `zero_denominator`;
5. en una frontera interna, un solo lado valido produce `one_side_invalid`,
   nunca match ni seleccion del lado favorable;
6. dos lados validos con uno fuera de tolerancia usan el máximo y producen
   mismatch;
7. discontinuidad de índices GPS, gap de cobertura, orden temporal inválido o
   pendiente distinta de `1/gps_hz` invalidan la ventana correspondiente;
8. un evento o reset extra produce exactamente el orphan por recording
   esperado, sin cancelarse contra otro recording;
9. repetir el cálculo completo dos veces sobre la misma serialización produce
   bytes canónicos y agregados idénticos.

Cualquier control fallido termina `pipeline_fault` antes de abrir o interpretar
los 16 Algarve.

## Ejecucion, determinismo y custodia

- discovery fresco de todos los `ready`;
- budgets heredados: `min(512, ready_count)`, `32 GiB`, `120 min`;
- una sola sesión abierta, staging productivo privado read-only;
- dos evaluaciones C completas sobre la misma serialización canónica;
- igualdad exacta de composicion, populations, ledger por digest, pairing,
  conteos y estadísticos entre ambas evaluaciones;
- PRE/POST, `CloseSession`, `ServiceShutdown`, helper cerrado, `readers=0`,
  `staging=0` y temporales eliminados, tambien en abort.

No se calcula shape, mapa, residual TA-04F, jitter, bootstrap, A/B nuevo ni F6.
No se toca producto, tests de producto, UI o capacidades.

## Resultado permitido

TA-04F5B tiene solo dos outcomes:

- **`diagnostic_pipeline_pass`**: controles sintéticos, dos evaluaciones,
  pairing, denominadores, ledger por digest, composición y cleanup son
  coherentes y exactos;
- **`pipeline_fault`**: falla cualquiera de esos requisitos.

`diagnostic_pipeline_pass` solo permite sustituir el estado provisional de
TA-04F5 por la lectura sustantiva que ya resulte de A/B/C congelados. No cambia
por sí mismo ese resultado, no valida el oracle como contrato productivo y no
autoriza F6. Si el oracle corregido contradice los agregados sustantivos o
descubre otra ambigüedad, se conserva `pipeline_fault` y se detiene.

En todos los outcomes `local_shape=unknown`, geolocalizacion absoluta
`unknown`, anchura fisica `incompatible` y TA-04B permanece en STOP visual.
