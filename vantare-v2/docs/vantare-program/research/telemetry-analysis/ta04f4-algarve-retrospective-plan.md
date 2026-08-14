# TA-04F4 -- plan retrospectivo Algarve sobre cohorte existente

Estado: suplemento documental local y acotado posterior al cierre TA-04F3
`stop_insufficient`. Isaac autorizo explicitamente reutilizar los DuckDB ya
existentes para este corte. TA-04F4 es un corte **retrospectivo**, de
**sensibilidad** y de **training reuse**; no es holdout virgen, no es
confirmacion independiente y no reabre TA-04E como evidencia confirmatoria.
TA-04B continua en STOP visual.

## Referencias congeladas y herencia exacta

TA-04F4 hereda sin cambios:

- el plan exacto TA-04F2 versionado en
  `vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f2-existing-cohort-plan.md@fe5faed2d5748736606f52165aa913849e4bd531`;
- la matematica, proyeccion local, alineacion, proxies, controles sinteticos,
  rereads, guards de custodia y logica de decision de
  `vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f-repetition-variance-plan.md@c8e064d1c9add0cc8c807f415531bae225f9924d`;
- el cierre TA-04F3 como evidencia de que no aparecio ningun grupo
  no-Algarve congelable en el barrido completo.

Todo lo no reescrito explicitamente aqui queda congelado exactamente como en
TA-04F2 y TA-04F.

## Naturaleza de este corte

TA-04F4 no busca un resultado independiente. Busca una caracterizacion
retrospectiva sobre la subcohorte Algarve ya visible y probablemente
contaminada por exploracion/training previa. Por tanto:

- no existe exclusion de TA-04E ni TA-04G;
- la contaminacion y la reutilizacion son explicitas y probables;
- `local_shape` permanece `unknown` en todos los resultados;
- ningun outcome de TA-04F4 autoriza mapa, UI o trabajo visual;
- cualquier lectura causal o confirmatoria queda prohibida.

## Universo permitido y filtro Algarve

Fuente permitida: unicamente los DuckDB ya existentes y explicitamente
autorizados para este corte. Este plan no abre ninguno ahora.

TA-04F4 selecciona solo recordings Algarve definidos por los aliases exactos
ya congelados en TA-04F2. `Discover` no expone `TrackName` ni `TrackLayout`,
por lo que un run fresco debe abrir e inspeccionar todos los candidatos
`ready` en orden canonico para identificar el circuito sin reutilizar IDs ni
identidades de TA-04F3. Despues de aplicar la misma normalizacion exacta de
TA-04F2 (`TrimSpace`, `Fields`, espacio ASCII unico, `ToLower`), un recording
entra en el universo analitico de TA-04F4 solo si `TrackName` o `TrackLayout`
contiene alguna de estas phrases exactas:

- `algarve international circuit`
- `autodromo internacional do algarve`
- `autódromo internacional do algarve`
- `portimao`
- `portimão`

## `group key` exacto y compatibilidad

TA-04F4 conserva exactamente el mismo `group key` publico de TA-04F2:

- `TrackName`
- `TrackLayout`
- `CarName`
- `CarClass`

Los cuatro campos son obligatorios, publicos, `Present=true` y `valid`. La
normalizacion es exactamente la de TA-04F2 y no se permiten heuristicas
adicionales.

Como la cohorte Algarve puede dividirse por `CarName` o `CarClass`, TA-04F4 no
mezcla grupos compatibles "a ojo". El grupo final debe ser el **primer exacto
`group key` por orden de primera aparicion** que alcance `>= 3` recordings
elegibles. Una vez elegido ese `group key`, la cohorte congelada incluye
**todos** sus recordings elegibles en orden de aceptacion. No se permite
elegir un subconjunto favorable ni congelar solo 3 si habia mas elegibles del
mismo `group key`.

## Seleccion ciega a outcomes

La seleccion permanece ciega a shape, jitter, residuales, p95/p99,
correlaciones y outcomes finales.

Antes del freeze solo se permite `Open/Inspect` secuencial para:

- elegibilidad del artifact Algarve;
- metadata publica allowlisted para derivar `group key`;
- cobertura estricta de los 5 canales requeridos;
- conteo de `>= 10` vueltas completas;
- deteccion de duplicados por `session.ID`;
- ejecucion de `BuildSpatialEvidence` solo para los guards espaciales
  heredados, nunca para producir residuales u outcomes.

Antes del freeze esta prohibido:

- calcular shape local;
- calcular cualquier residual tangencial, lateral o de magnitud;
- calcular `pace_jitter`, `speed_jitter` o `gps_high_freq_residual`;
- comparar grupos por desempeno;
- repriorizar recordings o grupos por resultados observados.

La deduplicacion sigue siendo solo en memoria por `session.ID`.

## Algoritmo congelado de discovery y seleccion

TA-04F4 reaprovecha el lifecycle de TA-04F2, pero restringido a candidatos
Algarve:

1. Ejecutar `Discover` por la API autorizada y reordenar explicitamente todos
   los candidatos por `ModifiedAt` ascendente, `Size` ascendente y
   `CandidateID` ascendente. Nunca se confia en el orden del servicio.
2. Empezar un run fresco desde el primer candidato de ese orden. No se continua
   desde un checkpoint parcial de TA-04F2 o TA-04F3.
3. Abrir e inspeccionar secuencialmente todos los candidatos `ready` del run
   fresco para recuperar la metadata publica allowlisted. Cerrar y limpiar de
   inmediato cada candidato no-Algarve; preservar el orden canonico de primera
   aparicion de los recordings Algarve.
4. Antes del freeze, `ReadPage` solo puede usarse sobre `GPS Latitude`,
   `GPS Longitude`, `GPS Time`, `Lap Dist` y `Total Dist` para validar
   cobertura exacta, finitud, `Quality=valid`, `Present=true`, `>= 10` vueltas
   completas y los guards heredados via `BuildSpatialEvidence`.
5. Un recording es elegible solo si:
   - pertenece al universo Algarve definido arriba;
   - no duplica por `session.ID`;
   - tiene `>= 10` vueltas completas;
   - tiene cobertura exacta de los 5 canales requeridos;
   - pasa los guards productivos heredados.
6. No se excluyen candidatos por pertenecer a TA-04E o TA-04G. Esa posible
   reutilizacion se declara explicitamente en la evidencia final.
7. Tras agotar el barrido Algarve dentro de budget, elegir el primer exacto
   `group key` por orden de primera aparicion que alcance `>= 3` recordings
   elegibles.
8. Si ningun `group key` Algarve alcanza ese minimo, el outcome de seleccion es
   **`stop_insufficient`**.
9. Si si lo alcanza, congelar **todos** los recordings elegibles de ese
   `group key` en orden de aceptacion. Solo despues de ese freeze pueden
   empezar residuales, proxies y outcomes retrospectivos.

## Budgets duros

TA-04F4 usa el budget ampliado ya ejecutado por TA-04F3, aplicado al barrido
identificador completo porque el filtro Algarve solo existe post-`Inspect`:

- maximo `min(512, ready_candidate_count)` candidatos intentados;
- base observada no normativa: `318` candidatos `ready`, de los que `16`
  resultaron Algarve en TA-04F3;
- maximo acumulado staged `32 GiB`, sumado con `Size` pre-open de cada
  candidato intentado;
- maximo de tiempo de pared `120 min`;
- ejecucion secuencial de una sola sesion abierta.

Si alguno de esos budgets bindea antes de agotar todos los candidatos `ready`
del run fresco, el resultado de seleccion es `budget_exhausted`. Si el barrido
completo se agota sin un `group key` Algarve con `>= 3`, el resultado correcto
es `stop_insufficient`.

## Freeze exacto de cohorte y manifest agregado

TA-04F4 conserva el mismo lifecycle aprobado en TA-04F2:

1. terminar la seleccion ciega;
2. ejecutar `CloseSession`;
3. ejecutar `ServiceShutdown`;
4. verificar `staging = 0`;
5. verificar `readers = 0`;
6. pausar el coordinador externo esperando sentinel explicito;
7. escribir un ledger temporal canonico de seleccion;
8. versionar el manifest agregado y verificar que el commit de freeze existe
   y precede cualquier residual;
9. reanudar solo despues de esa verificacion y mediante el sentinel explicito;
10. crear una **nueva** instancia `ready` de `TelemetryAnalysisService`;
11. repetir `Discover`, reordenar igual y reconstruir la cohorte solo por
    commitments exactos;
12. si falta un candidato esperado, cambia o no coincide su commitment,
    terminar en `selection_changed`;
13. calcular residuales y outcomes solo despues de reconstruir exactamente la
    cohorte congelada.

La unica adaptacion necesaria para TA-04F4 es la cardinalidad variable de la
cohorte congelada. Como este corte debe incluir **todos** los elegibles del
`group key` elegido, el ledger y el manifest usan `slot_1..slot_n` en orden de
aceptacion, con `n >= 3`, en lugar de limitarse a tres slots. Fuera de esa
generalizacion de cardinalidad, la estructura de commitments, digests,
privacidad, pausa, reopen y `selection_changed` se hereda exactamente de
TA-04F2.

## Outcomes permitidos en este corte

TA-04F4 hereda exactamente la matematica y la logica de decision de TA-04F,
pero reetiqueta los outcomes sustantivos para dejar claro que este corte es
retrospectivo y contaminado:

- `pipeline_fault`
- `retrospective_measurement_compatible`
- `retrospective_trajectory_compatible`
- `retrospective_mixed_or_indeterminate`
- `budget_exhausted`
- `selection_changed`
- `stop_insufficient`

Mapeo obligatorio respecto a `c8e064d`:

- `measurement_limited` -> `retrospective_measurement_compatible`
- `trajectory_limited` -> `retrospective_trajectory_compatible`
- `mixed/indeterminate` -> `retrospective_mixed_or_indeterminate`

TA-04F se prerregistro para exactamente 3 recordings, mientras TA-04F4 incluye
todos los elegibles del `group key` elegido. La unica generalizacion de la
decision final es explicita y se congela aqui antes de outcomes: para una
cohorte de `n >= 3`, la mayoria conservadora es `floor(n/2) + 1` recordings.
`retrospective_measurement_compatible` exige al menos esa mayoria etiquetada
`measurement` y cero recordings `trajectory`;
`retrospective_trajectory_compatible` exige al menos esa mayoria etiquetada
`trajectory` y cero recordings `measurement`. Cualquier otro reparto, incluido
cualquier `mixed`, se etiqueta
`retrospective_mixed_or_indeterminate`. Las etiquetas por recording, LORO,
bootstrap y el resto de la matematica de `c8e064d` no cambian.

Interpretacion obligatoria:

- ningun outcome valida `local_shape`;
- ningun outcome produce geolocalizacion absoluta;
- ningun outcome vuelve compatible la anchura fisica;
- ningun outcome constituye evidencia independiente;
- ningun outcome desbloquea TA-04B.

## Reporting y privacidad

La evidencia final de TA-04F4 debe incluir:

- la autorizacion explicita de Isaac para reutilizar DuckDB ya existentes;
- referencia exacta a TA-04F2 y TA-04F `c8e064d` como base heredada;
- declaracion explicita de que TA-04F4 es retrospectivo, de sensibilidad y de
  training reuse;
- declaracion explicita de que TA-04E y TA-04G no se excluyen y que la
  contaminacion/reutilizacion es probable;
- conteos agregados del subconjunto Algarve, elegibilidad y freeze;
- digest del `group key` normalizado elegido;
- commitments pseudonimos versionados del cohort freeze;
- outcome final en vocabulario `retrospective_*` cuando haya analisis;
- confirmacion de que se incluyeron **todos** los elegibles del `group key`
  elegido, sin favorable subset.

La evidencia final no debe publicar rutas, IDs, timestamps crudos,
coordenadas, valores por muestra ni nombres de recording.

## Checks documentales de este plan

Antes de ejecutar TA-04F4 debe comprobarse:

1. que Isaac autorizo explicitamente reutilizar DuckDB ya existentes para este
   corte;
2. que este corte se presenta como retrospectivo/sensibilidad/training reuse y
   no como holdout o confirmacion independiente;
3. que el universo de seleccion se restringe a los aliases exactos Algarve ya
   congelados en TA-04F2;
4. que el `group key` sigue siendo exactamente
   `TrackName + TrackLayout + CarName + CarClass` con la normalizacion de
   TA-04F2;
5. que no se excluyen TA-04E ni TA-04G y que esa contaminacion se declara como
   probable;
6. que la seleccion sigue siendo ciega a residuales y outcomes hasta el freeze;
7. que antes del freeze solo se usan los 5 canales requeridos y
   `BuildSpatialEvidence` para gates, nunca para analitica final;
8. que la deduplicacion sigue siendo solo en memoria por `session.ID`;
9. que el minimo sigue siendo `>= 3` recordings elegibles con `>= 10` vueltas
   completas;
10. que el grupo final es el primer exacto `group key` por orden de aparicion
    que alcanza `>= 3`;
11. que la cohorte congelada incluye todos sus elegibles y no un subconjunto
    favorable;
12. que el lifecycle de freeze/reopen/manifest/commitments sigue el de TA-04F2
    y solo generaliza `slot_1..slot_n`;
13. que el barrido identificador cubre todos los `ready`, filtra Algarve solo
    post-`Inspect` y usa budgets `min(512, ready_candidate_count)`, `32 GiB` y
    `120 min`;
14. que no existe residual, proxy ni outcome final antes del freeze;
15. que la mayoria para `n >= 3` es `floor(n/2)+1`, con cero evidencia opuesta,
    y que el resto de la matematica heredada no cambia;
16. que `local_shape` sigue `unknown` y TA-04B permanece en STOP visual.
