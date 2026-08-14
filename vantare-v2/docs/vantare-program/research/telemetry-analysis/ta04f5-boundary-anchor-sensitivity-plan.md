# TA-04F5 -- plan preregistrado de sensibilidad de frontera y ancla

Estado: plan documental local anterior a cualquier reapertura de datos para
TA-04F5. Este corte es **exploratorio**, retrospectivo y contaminado por
analisis previos. No es validacion, holdout, confirmacion independiente ni
base para cambiar capacidades. `local_shape` permanece `unknown` y el STOP
visual sigue vigente.

## Pregunta acotada

TA-04F4 observo 16 recordings Algarve: 9 fueron rechazados por
la clasificacion del runner `Lap:too_few_events` (el producto los expresa como
`ErrSpatialInvalidInput`), 6 por `ErrSpatialTimeNotAligned` y solo 1 fue
elegible.
TA-04F5 pregunta si ese `stop_insufficient` se explica mejor por:

1. datos que siguen siendo insuficientes aun bajo sensibilidades acotadas; o
2. sensibilidad a dos supuestos concretos del contrato productivo actual:
   exigir eventos `Lap` para cada reset y exigir una unica ancla temporal
   fixed-slope sobre toda la cobertura.

Responder esa pregunta no prueba que una alternativa sea correcta. Una
recuperacion solo justifica abrir una issue futura, con contrato, tests y
review propios.

## Fuentes congeladas y alcance

Antes de ejecutar se deben versionar este plan y la evidencia TA-04F4. El run
referenciara sus SHA exactos y heredara:

- universo Algarve, aliases, normalizacion y `group key` exacto de
  TA-04F4@`e45b0cd0c005c7aa6d55054d611eb7cbb822180a`;
- orden de discovery, custodia, privacidad, dedupe y lifecycle productivo de
  TA-04F2@`fe5faed2d5748736606f52165aa913849e4bd531`;
- tolerancias productivas y definiciones de muestras validas de
  TA-04F@`c8e064d1c9add0cc8c807f415531bae225f9924d`;
- comportamiento A del contrato implementado por `BuildSpatialEvidence` en el
  HEAD congelado de este plan.

TA-04F5 usa **todos los 16 recordings Algarve existentes** que reaparezcan en
un discovery fresco. No selecciona tres, no elige solo los recuperables y no
descarta un `group key` por un resultado desfavorable.

Fuera de alcance:

- cambiar codigo, tolerancias o capacidades productivas;
- calcular mapa, shape, proyeccion espacial, residuales de shape, jitter,
  bootstrap o outcomes TA-04F/TA-04F4;
- usar `Path Lateral`, `Track Edge`, `Speed` o canales distintos de los cinco
  requeridos;
- UI, capturas, visual, Linear, push, PR, CI remoto, merge, promocion o release.

## Identidad, grupos y ausencia de cherry-pick

El `group key` sigue siendo exactamente la concatenacion ordenada y
normalizada de:

1. `TrackName`;
2. `TrackLayout`;
3. `CarName`;
4. `CarClass`.

La normalizacion sigue siendo `TrimSpace`, `Fields` unido con un espacio ASCII
y `ToLower`, sin accent folding ni heuristicas. La salida solo publica un
digest SHA-256 con separacion de dominio y prefijo sanitizado por grupo.

El run debe:

- recorrer todos los `ready` por `ModifiedAt`, `Size`, `CandidateID`;
- inspeccionar todos los candidatos para reproducir la composicion agregada de
  16 Algarve, o terminar `group_composition_changed` si cambia;
- deduplicar solo en memoria por `session.ID`;
- aplicar A, B y C a cada recording Algarve, siempre en ese orden y sin mirar
  resultados de grupo para decidir si continuar;
- reportar todos los grupos y todos los dispositions, incluidos ceros.

Los prefijos de digest esperados, congelados por TA-04F4, son exactamente:
`a3bc403d0d95`, `5408e8c63175`, `0fdba66ae60f`, `29df53711ee1` y
`a0688419dfb3`. Sus cardinalidades esperadas son respectivamente
`10, 3, 1, 1, 1`. Cualquier diferencia termina en
`group_composition_changed` antes de interpretar A/B/C. Estos prefijos y
cardinalidades prueban solo composicion agregada por grupo, no identidad
criptografica de los mismos recordings. TA-04F4 no congelo commitments por
recording y TA-04F5 no fingira esa identidad.

No se versionan `session.ID`, `CandidateID`, rutas, timestamps crudos,
coordenadas, muestras, nombres de recording ni hashes directos del artifact.

## Entrada comun y guards que nunca se relajan

Los tres brazos exigen sin cambios:

- los cinco canales `GPS Latitude`, `GPS Longitude`, `GPS Time`, `Lap Dist` y
  `Total Dist` con `Present=true`, `Quality=valid`, una columna numerica y todas
  sus muestras finitas;
- indices estrictamente crecientes y consecutivos dentro de cada canal;
- `Lap Dist >= 0`, resets definidos unicamente por descenso estricto y
  progreso monotono dentro de cada segmento;
- al menos dos muestras por segmento contado;
- longitudes positivas y compatibilidad relativa bajo la tolerancia v1
  productiva, sin cambiar thresholds;
- cobertura temporal realmente observada; no se extrapola fuera del primer y
  ultimo sample valido de la ventana usada;
- PRE/POST identicos, WAL ausente, runtime confiado, staging privado read-only,
  una sola sesion abierta y cleanup completo.

Un fallo en esos guards comunes se clasifica como fallo de datos en los tres
brazos. B y C no pueden recuperarlo.

## Brazos congelados

### A -- contrato productivo actual

Ejecutar `BuildSpatialEvidence` sin modificar inputs, tolerancias ni codigo.
Este brazo conserva, entre otros, estos requisitos:

- al menos dos eventos `Lap` validos y ordenados;
- cardinalidad exacta de snapshot/eventos respecto a resets;
- evento inicial alineado al inicio observado;
- cada evento posterior alineado 1:1 con cada reset;
- una ancla `GPS Time` fixed-slope global, con intercepto
  `b = mean(gps_time[i] - index[i] / gps_hz)` sobre toda la serie;
- todo residual global dentro de `TimeResidualSeconds`;
- cobertura completa de eventos y `Lap Dist` dentro de `GPS Time`.

La salida A registra el error tipado productivo exacto y el numero de vueltas
completas productivas, sin derivar nuevas capabilities.

### B -- fronteras solo por resets de `Lap Dist`

B es una sensibilidad exclusiva al supuesto de eventos. Ignora completamente
el canal/evento `Lap`: no usa su presencia, numero, timestamp ni valor para
crear o rechazar fronteras.

Algoritmo B:

1. detectar todos los resets por descenso estricto de `Lap Dist`;
2. formar segmentos `0..reset_1`, `reset_1..reset_2`, ..., `reset_n..fin` con
   la misma convencion de indices que A;
3. tratar primero y ultimo como parciales, siempre;
4. contar como completas solo las ventanas interiores entre dos resets;
5. aplicar sin cambios los guards comunes de orden, longitud y compatibilidad;
6. exigir `>= 10` ventanas interiores completas para recuperar elegibilidad.

B conserva la ancla temporal global de A. Por tanto, un recording que falla
tambien esa ancla no queda recuperado por B. Este brazo mide solo cuanto cambia
el conteo al retirar la dependencia de eventos; no declara que un reset sea
una frontera semantica oficial.

La pertenencia al subconjunto oracle se decide sin mirar resets ni resultados:
un recording es `oracle_evaluable` si contiene `>= 2` eventos `Lap`, todos con
`Present=true`, `Quality=valid`, indice estrictamente creciente, timestamp y
valor finitos, orden temporal estricto y cobertura dentro del primer/ultimo
sample valido de `GPS Time`. Cualquier evento invalido o fuera de cobertura
clasifica el recording como `oracle_invalid`, no lo excluye silenciosamente.

En `oracle_evaluable`, B permanece ciego a eventos durante toda la prediccion y
los revela despues solo para scoring. El evento ordinal `0` se puntua como
snapshot contra el inicio de cobertura; luego el reset ordinal `k` se empareja
solo con el evento ordinal `k+1`. No hay nearest-neighbor, reordenacion ni
optimizacion. Cada pareja cuenta como match solo si su residual es
`<= SpatialTolerance.BoundaryResidualSeconds`. Precision es
`matches / resets_predichos`; recall es
`matches / eventos_post_snapshot`. Denominador cero es fallo del gate, no 100 %.
Conteos distintos producen fronteras huerfanas por la diferencia absoluta;
parejas ordinales fuera de tolerancia se reportan como mismatches. El snapshot
inicial desalineado tambien falla el oracle.

Los recordings `oracle_invalid` o con menos de dos eventos nunca pueden superar
este oracle: en ellos B solo mide consistencia interna y numero de segmentos,
no semantica de vuelta.

### C -- ancla fixed-slope por ventanas observadas

C conserva las fronteras de B para no volver a introducir el evento que se
esta diagnosticando y cambia solo el alcance de la ancla temporal. No ajusta
pendiente libre, no corrige drift, no interpola gaps y no extrapola cobertura.

Convencion exacta, igual a A: los starts son `[0, reset_1, ..., reset_n]`, los
ends son `[reset_1, ..., reset_n, len(LapDist)]`, cada segmento de muestras es
`[start,end)` y el sample del reset pertenece al segmento siguiente. Para una
ventana interior, sus fronteras temporales originales son
`start_index / lap_dist_hz` y `end_index / lap_dist_hz`, usando indices
originales sin rebasing y `end_index` igual al indice del siguiente reset.

Para cada ventana interior completa de B:

1. derivar su intervalo relativo observado desde indices de `Lap Dist` y su
   frecuencia declarada;
2. definir para cada sample GPS la coordenada relativa
   `gps_index / gps_hz`, tambien con indice original sin rebasing, y seleccionar
   los samples cuya coordenada cae en el intervalo cerrado entre las dos
   fronteras originales;
3. exigir al menos dos samples GPS consecutivos; la primera coordenada
   seleccionada debe quedar a no mas de `TimeResidualSeconds` despues de la
   frontera inicial y la ultima a no mas de `TimeResidualSeconds` antes de la
   frontera final. No se recortan ni redefinen los extremos originales;
4. ajustar solo el intercepto fixed-slope
   `b_w = mean(gps_time[i] - index[i] / gps_hz)` dentro de la ventana;
5. exigir para **cada** sample de la ventana
   `abs(gps_time[i] - (index[i] / gps_hz + b_w)) <= TimeResidualSeconds`;
6. contar la ventana solo si tambien pasan los guards comunes de distancia y
   longitud;
7. exigir `>= 10` ventanas completas validas para recuperar elegibilidad.

Los cuantiles intra-ventana usan todos los residuos absolutos de todos los
samples GPS seleccionados en ventanas validas; la dispersion de interceptos usa
un `b_w` por ventana valida. Para scoring oracle de un reset interno, C produce
dos timestamps, uno con el intercepto de la ventana anterior y otro con el de
la posterior: ambos se emparejan con el mismo evento ordinal y ambos deben
quedar dentro de `SpatialTolerance.BoundaryResidualSeconds`. En un extremo con
una sola ventana valida se usa su unico intercepto. Nunca se escoge el lado
favorable de un salto.

La diferencia exacta respecto a `BuildSpatialEvidence` es doble y deliberada:
A calcula un unico intercepto sobre todo `GPS Time` y exige eventos alineados
con inicio/resets; C calcula un intercepto independiente por ventana interior
observada y no usa eventos. La pendiente sigue fijada en `1/gps_hz` y la
tolerancia no cambia. C puede ocultar saltos de intercepto entre ventanas; por
eso es sensibilidad exploratoria y nunca sustituto silencioso del contrato.

En C se aplica el mismo oracle post-prediccion que en B cuando existen eventos
suficientes. En recordings low-event, C solo puede demostrar consistencia
temporal interna por ventanas; no puede demostrar que sus resets sean vueltas.

## Matriz de resultados por recording

El ledger temporal local mantiene una fila por recording, identificada solo en
RAM, con:

- digest de `group key`;
- disposition A y error tipado;
- `resets`, segmentos y vueltas completas A;
- disposition B y vueltas completas por resets;
- disposition C, ventanas intentadas/validas y vueltas completas;
- para C: residual absoluto p50/p95/max dentro de ventanas y dispersion
  p50/p95/max de los interceptos `b_w` respecto a su mediana;
- flags de integridad PRE/POST y cleanup.

La evidencia versionable agrega esas columnas por digest; nunca publica filas
individuales ni valores de tiempo absolutos.

## Metricas agregadas preregistradas

Por brazo A/B/C y por digest de grupo se reportan:

- recordings totales, evaluables, elegibles (`>= 10`) y no elegibles;
- recordings por clase primaria de fallo;
- suma de resets, segmentos, ventanas completas estimadas y validas;
- distribucion sanitizada de vueltas completas por recording:
  minimo, mediana, p95 y maximo;
- para C, p50/p95/max agregados de residual absoluto intra-ventana y de
  dispersion de interceptos entre ventanas;
- matriz de transicion `A -> B -> C`: no recuperado, recuperado por B,
  recuperado solo por C y elegible ya en A.

Para el subconjunto oracle se reportan ademas precision y recall agregados de
reset frente a evento, fronteras huerfanas y residual p50/p95/p99/max de las
parejas. Para el subconjunto low-event se reporta por separado la fraccion con
`>= 10` segmentos interiores compatibles, siempre etiquetada
`internal_consistency_only`.

Tambien se reportan totales globales Algarve y se comprueba que la suma de los
digests es exactamente 16. No se comparan ni ordenan grupos por favorabilidad.

## Gates diagnosticos congelados

Un grupo cruza el minimo de sensibilidad cuando contiene `>= 3` recordings
del mismo `group key`, cada uno con `>= 10` vueltas completas bajo el brazo
correspondiente. Se incluyen todos los recordings del grupo en los agregados.

Clasificacion final, mutuamente excluyente y evaluada en este orden:

1. `pipeline_fault`: falla custodia, integridad, determinismo, suma de cohorte,
   cleanup o una implementacion del diagnostico no respeta este plan.
2. `group_composition_changed`: el discovery fresco no reproduce la
   composicion agregada de 16 Algarve y sus cinco digests; no afirma identidad
   por recording.
3. `baseline_changed`: la composicion agregada coincide, pero A contradice el
   baseline TA-04F4 y algun grupo cruza ya el minimo productivo. Esto puede
   deberse a contenido/identidad no congelada o a una discrepancia de baseline;
   no se interpreta como sensibilidad ni como cambio de composicion.
4. `budget_exhausted`: un budget duro bindea antes de completar todos los
   candidatos `ready`.
5. `boundary_assumption_sensitive`: ningun grupo cruza en A; alguno cruza en B.
   Esta es la primera frontera que logra el minimo, aunque C tambien lo haga.
6. `boundary_and_anchor_sensitive`: ninguno cruza en A o B; B recupera al
   menos un recording respecto
   a A, C recupera al menos otro respecto a B y algun grupo cruza solo en C.
7. `anchor_window_assumption_sensitive`: ninguno cruza en A o B, ningun
   recording se recupera en B respecto a A y algun grupo cruza solo en C.
8. `stop_insufficient`: ningun grupo alcanza `>= 3 x >= 10` en A, B o C.

Si, contra la evidencia previa, un grupo cruza ya en A, se registra
`baseline_changed` y no se interpreta sensibilidad. Si varios grupos cruzan
un brazo, se reportan todos; no se elige uno.

Lectura permitida de los gates:

- `stop_insufficient` favorece la explicacion de datos insuficientes bajo las
  sensibilidades acotadas, sin demostrar una causa universal;
- cualquier outcome `*_sensitive` identifica dependencia del resultado a un
  supuesto contractual, pero no demuestra que el supuesto alternativo sea
  correcto ni que los datos validen shape;
- fallos de canales, calidad, finitud, indices, progreso o longitud siguen
  siendo `data_failure` aunque otro recording del grupo se recupere.

Los gates `*_sensitive` describen un resultado diagnostico incluso si el grupo
cruza gracias a recordings low-event. Para justificar una issue que proponga
retirar eventos del contrato se exige adicionalmente que **todo** el subconjunto
oracle evaluable tenga correspondencia 1:1, precision y recall 100 %, cero
fronteras huerfanas y todos los residuales dentro de
`SpatialTolerance.BoundaryResidualSeconds`. Ademas debe contener como minimo
`3` recordings evaluables, `30` eventos post-snapshot en total y `2` digests de
grupo. Si cualquier minimo no se alcanza, el gate falla explicitamente. Sin ese
gate oracle completo solo se permite una issue de investigacion/datos, no una
propuesta de cambio productivo.

## Determinismo y controles

Antes de interpretar el resultado deben pasar:

1. dos evaluaciones A/B/C sobre la misma serializacion canonica producen
   exactamente las mismas dispositions y conteos;
2. los casos sinteticos locales del runner diagnostico comprueban:
   - A acepta un caso productivo valido;
   - eventos insuficientes hacen fallar A pero B recupera exactamente las
     vueltas interiores por resets;
   - un salto de intercepto entre ventanas hace fallar A, deja B fallando y
     permite C solo si cada ventana cumple la tolerancia fixed-slope;
   - pendiente distinta de `1/gps_hz`, residual intra-ventana excesivo, gap o
     cobertura incompleta hacen fallar C;
   - menos de 10 vueltas nunca cruza elegibilidad;
   - el predictor no consume eventos antes del scoring y un evento o reset
     huerfano hace fallar el gate oracle;
3. la suma por los cinco digests esperados coincide con el total Algarve;
4. PRE/POST, `readers=0`, `staging=0` y residuos `0` pasan al cierre, tambien
   en abort.

Estos controles pertenecen al helper diagnostico temporal. No se añaden ni
modifican tests de producto en TA-04F5.

## Budgets y lifecycle

- discovery fresco de todos los `ready`;
- maximo `min(512, ready_candidate_count)` candidatos intentados;
- maximo acumulado staged `32 GiB`, sumado por `Size` pre-open;
- maximo `120 min` de pared;
- ejecucion secuencial, una sola sesion abierta;
- `CloseSession` antes del siguiente candidato;
- `ServiceShutdown`, helper cerrado, `readers=0`, `staging=0` y residuos `0`
  antes de escribir evidencia final.

Si un budget bindea antes de completar todos los `ready`, el run termina
`budget_exhausted` y no se interpreta ningun gate. En cualquier error o abort
se ejecuta cleanup completo.

## STOP posterior y siguiente accion

Si A, B o C recupera un grupo con `>= 3` recordings y `>= 10` vueltas por
recording, TA-04F5 se detiene tras documentar los agregados. La siguiente
accion obligatoria es crear una **issue futura de investigacion contractual**.
Solo si tambien pasa el gate oracle completo anterior puede proponerse en ella
un cambio de contrato; de lo contrario debe pedir datos/oracle nuevos. La issue:

- declare exactamente el supuesto candidato y su riesgo;
- defina comportamiento fail-closed y migracion de capability;
- añada tests unitarios, regresion, fuzz y evidencia sobre datos nuevos;
- reciba review independiente y aprobacion antes de tocar producto.

TA-04F5 no modifica silenciosamente `BuildSpatialEvidence`, thresholds,
capabilities ni UI. Si ningun brazo recupera el minimo, el resultado es
`stop_insufficient` y se requieren datos nuevos o autoridad oficial.

En todos los casos, el analisis confirmatorio continua bloqueado,
`local_shape=unknown`, geolocalizacion absoluta `unknown`, anchura fisica
`incompatible` y TA-04B permanece en STOP visual.

## Checklist previa a reapertura

1. evidencia TA-04F4 y este plan versionados por commit;
2. HEAD y rama exactos registrados;
3. universe all-ready, cinco digests y total 16 congelados;
4. brazos A/B/C y orden de aplicacion congelados;
5. thresholds, guards comunes, metricas y outcomes congelados;
6. cero lectura previa de DuckDB para TA-04F5;
7. runner temporal sin persistir identidades ni muestras;
8. lifecycle productivo, budgets y cleanup preparados;
9. confirmacion de que no se calcularan shape, residuales TA-04F ni visual;
10. STOP posterior y issue futura obligatoria entendidos.
