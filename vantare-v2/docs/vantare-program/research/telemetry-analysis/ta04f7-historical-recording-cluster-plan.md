# TA-04F7 — protocolo preregistrado existing-only de forma por cluster de recording

Estado: Gate 1, plan documental previo al runner y a cualquier nueva apertura de
datos para TA-04F7. Este protocolo sustituye la próxima acción de «crear nuevas
grabaciones»: **no se grabarán datos nuevos**. Todo dato analítico procederá de
telemetrías finalizadas ya existentes y previamente autorizadas. El estudio es
retrospectivo y no constituye holdout independiente.

## Objetivo y pregunta

Determinar, para cada `group key` existente por separado, si las vueltas
completas de cada recording permiten estimar una forma local repetible y qué
nivel de confianza existe entre recordings. La unidad primaria es el
**recording**; las vueltas de un recording son observaciones correlacionadas y
nunca votan como si fueran sesiones independientes.

TA-04F7 vuelve a descubrir, deduplicar y calcular desde cero. Las cifras y
selecciones de TA-04E o TA-04F2--F6 no se suman, importan ni usan como expected.
Sus planes solo aportan contratos, tolerancias y caps ya aprobados.

## Autoridad, alcance y prohibiciones

- Rama: `work/ta04f-repetition-variance`.
- Base de Gate 1: `da84afc601e9f1b008927e4df219174b3ac73f61`.
- Excepción de Isaac: sin Linear durante este corte; issues pendientes al final.
- Permitido después de Gate 2: discovery exhaustivo y una ejecución sobre todos
  los DuckDB existentes autorizados, mediante la pila productiva low-level.
- Este commit solo crea el plan. No implementa runner ni abre DuckDB.
- No se añaden dependencias, Wails, persistencia, capability de producto, UI,
  mapa, captura, renderer ni código visual.
- No se mezclan `Path Lateral` y `Track Edge`: ambos quedan fuera del runner.
  Datum/CRS, bordes y anchura siguen bloqueados por TA-04C/TA-04D.
- Sin rutas, IDs, nombres de archivo, timestamps absolutos, coordenadas, muestras
  o metadata privada en outputs, logs o commits.
- Sin push, PR, CI remoto, merge, promoción o release.

## Fuentes normativas congeladas

- custody, oracle de vuelta, gates de calidad y lifecycle:
  `ta04f6-lap-cohort-plan.md@7a8dc1bc97a6005db362916810f8417d527b40f8`;
- malla, proyección local, interpolación y alineación:
  `ta04f-repetition-variance-plan.md@c8e064d1c9add0cc8c807f415531bae225f9924d`;
- decisión rígida, heredada literalmente de TA-04E:
  p95 `<= 5 m`, p99 `<= 10 m`, y `>= 80 %`;
- freeze F6 `229a8b51c97d2177bcd862693d8e8d36f4efea04`
  es antecedente `stop_insufficient`, no población ni baseline de TA-04F7.

Una contradicción entre implementación y estas reglas termina antes de datos y
exige nuevo plan versionado.

## Población existing-only y discovery exhaustivo

1. Ejecutar un discovery fresco sobre todos los candidatos `ready` existentes y
   autorizados. Orden canónico: `ModifiedAt` UTC ascendente, `Size` ascendente y
   `CandidateID` bytes ascendente. El orden solo controla reproducibilidad.
2. Abrir secuencialmente cada candidato mediante autorización, staging privado,
   reader y parser productivos. Revalidar PRE/POST, WAL ausente, identidad y
   cleanup. Un solo reader puede estar abierto.
3. Derivar el `group key` exacto con los cuatro campos públicos obligatorios,
   presentes y `Quality=valid`: `TrackName`, `TrackLayout`, `CarName`,
   `CarClass`. Normalización exacta: `TrimSpace`, `Fields`, unión con un espacio
   ASCII y `ToLower`; sin aliases ni heurísticas.
4. Deduplicar en RAM por `session.ID`. Ante duplicado se conserva solo el primer
   candidato del orden canónico; el resto cuenta como `duplicate`, no se mezcla.
5. Aplicar de nuevo el oracle y todos los guards F6. Un recording es elegible si
   tiene **al menos 2 vueltas completas** después del oracle/gates F6 y cobertura
   válida de `GPS Latitude`, `GPS Longitude`, `GPS Time`, `Lap Dist` y
   `Total Dist`. No se exige el antiguo `>=10`.
6. Agotar todos los candidatos dentro de budget. Evaluar **todos** los group keys
   por separado y publicarlos por ordinal de primera aparición. No existe grupo
   ganador, primer calificable, ranking, pooling entre grupos ni subset favorable.
7. Si un budget vence antes de cubrir todos los `ready`, outcome global
   `pipeline_fault`; ningún resultado parcial autoriza shape.

Cada grupo incluye todos sus recordings elegibles y todas sus vueltas completas.
Un recording nunca se excluye por empeorar el resultado.

Un artifact único con group key válido, cinco canales materializados finitos y
guards estructurales válidos, pero cuyo oracle produce 0 o 1 vuelta completa, es
un recording canónico `insufficient_laps`, no `data_invalid`. Permanece en la
población de su grupo, pero no es elegible, contributor ni entrada de shape.
`low_event` es solo el detalle de oracle agregado cuando hay 0/1 eventos; el
`closed_reason` uniforme sigue siendo `insufficient_laps`, también cuando hay
eventos suficientes pero solo 0/1 ventanas completas.

### Inventario metadata-only PRE/POST del run

Antes del primer `Open`, el discovery completo produce `InventoryV1`. Por cada
candidato `ready`, en orden canónico, conserva solo
`CandidateID`, `ModifiedAt.UTC().UnixNano()`, `Size`, estado `ready` y booleanos
de archivo regular, WAL ausente y estable. No incluye path, nombre, group key ni
contenido. Una clave CSPRNG efímera calcula un digest interno por candidato y
del vector ordenado; no se publica ni persiste.

Framing interno exacto: ASCII `TA-04F7/inventory/v1\x00`, `U64LE(count)` y por
candidato `U64LE(len(CandidateID UTF-8)) || CandidateID ||
I64LE(ModifiedAt.UTC().UnixNano()) || U64LE(Size) || Bool(regular) ||
Bool(wal_absent) || Bool(stable)`, donde Bool es un byte 0/1. No hay padding ni
otros campos. Digest = HMAC-SHA256(key, framing completo). Synthetic usa key
bytes `00..1f`; vector vacío (`count=0`) esperado:
`e85655a91956ad430844d4196c3d64e15556022e2ba0bd4efb3900b0a0ef7570`.
El test lo recalcula sin helpers productivos. Real usa CSPRNG 32 bytes.

Después de cerrar el último reader y completar cleanup se repite discovery,
orden y digest con la misma clave. Adición,
eliminación, cambio de bytes, cardinalidad o cambio del orden **canónico** produce
`pipeline_fault(inventory_changed)`, incluso si el candidato no era elegible.
Un orden distinto devuelto por discovery que se normaliza al mismo orden
canónico es estable y debe pasar.
La comparación es total; no acepta subset. PRE/POST
de identidad y contenido de cada artifact abierto sigue siendo obligatorio y no
queda sustituido por este inventario metadata-only. El manifest publica solo
`inventory_stable=true` y cardinalidad, nunca claves, digests o bytes.

## Materialización, tolerancias y recursos

- Página fija `4096`, `page.Start` exacto, índices globales continuos y EOF solo
  por página corta/vacía, igual que F6.
- Los canales son multirrate. `GPS Latitude`, `GPS Longitude`, `Lap Dist` y
  `Total Dist` deben compartir frecuencia, índices y cardinalidad porque forman
  la malla geométrica observada. `GPS Time` conserva su frecuencia, índices y
  cardinalidad independientes; solo debe cubrir temporalmente esa malla según
  el oracle F6. En el schema LMU observado son respectivamente 10 Hz y 100 Hz.
  Nunca se igualan ni se recortan sus slices por posición.
- Caps por recording heredados: `2_000_000` muestras por cada canal numérico,
  `100_000` eventos Lap y `256 MiB` de input canónico materializado. Alcanzar un cap no trunca:
  clasifica `data_invalid`.
- Budgets de run, fijados a priori desde F6: máximo
  `min(512, ready_candidate_count)` candidatos, `32 GiB` staged acumulados y
  `120 min` de pared; ejecución secuencial.
- Procesamiento streaming, un recording a la vez: leer/materializar, evaluar,
  conservar solo su centerline de `1000 × 2 × 8 bytes` y agregados, liberar
  referencias a input/canales/vueltas/arrays antes del siguiente recording.
  Nunca se retienen todas las vueltas del run.
- Presupuesto `logical_live_bytes <= 512 MiB`; no afirma medir el heap del
  runtime. Suma simultáneamente: capacidades de bytes/strings (`cap`), slices
  (`cap*element_width + 24`), mapas (`64 + entries*(key_width+value_width+32)`),
  input canónico, páginas, folds, arrays `x/y/tau/nu/r`, centerlines retenidas y
  buffer JSON. Strings/bytes añaden 16 bytes fijos por elemento; structs añaden
  32 bytes conservadores además de sus campos. Antes de reservar se aplican
  `checkedMul(cap,stride)` y `checkedAdd(live,bytes)`; overflow o total >512 MiB
  es `pipeline_fault(resource_cap)` antes de allocation.
- Máximo `20_000` vueltas elegibles globales. Máximo `512` recordings y `512`
  grupos retenidos; sus centerlines ocupan como máximo `512*1000*2*8 =
  8.192.000 bytes`, más structs acotados. Rebasar un cap no muestrea.
- Tolerancias: `R=6_371_000 m`, `N_GRID=1000`, `epsilon_geom=1e-6 m`,
  `epsilon_const=1e-12`; aritmética `float64` finita. Comparaciones de thresholds
  son inclusivas, sin redondeo previo.

## Geometría ejecutable y centerline

Para cada vuelta, `lap_length` y validez se obtienen exactamente de F6. Se usa
`u=LapDist/lap_length` en `[0,1)`, malla cíclica de 1.000 centros
`u_i=(i+0.5)/1000`, e interpolación lineal cíclica. Un bin no interpolable hace
inválida la vuelta completa; no se rellenan huecos.

Dentro de cada recording:

1. ancla fija `lat0/lon0` = media de todas las coordenadas interpoladas de todas
   sus vueltas elegibles; convertir grados a radianes;
2. proyectar `x=R*cos(lat0)*(lon-lon0)`, `y=R*(lat-lat0)`;
3. elegir como plantilla inicial la vuelta con ordinal menor;
4. alinear cada vuelta a esa plantilla mediante la solución rígida 2D exacta
   definida abajo;
5. obtener centerline provisional como mediana coordenada a coordenada de las
   vueltas alineadas en cada bin;
6. realinear una vez las vueltas originales proyectadas a la provisional con el
   mismo Kabsch; la centerline final del recording es la mediana por coordenada
   de esas vueltas realineadas. No se itera otra vez.

Esta centerline descriptiva exige las `L_original` vueltas. Si una sola no puede
interpolarse/proyectarse/alinearse, la centerline RAM de ese recording queda
`unavailable`; no se recalcula con las supervivientes. La centerline de grupo
exige a su vez centerline disponible de todos los recordings elegibles; si falta
una, queda `unavailable`, sin excluir ese recording.

La centerline de grupo solo existe para describir el grupo: alinear las
centerlines de recording a la del recording de menor ordinal, calcular una
provisional por mediana de recordings, realinear una vez a ella y calcular la
final por mediana. Cada recording aporta exactamente un voto por bin, con peso
igual, independientemente de sus vueltas. El agregado global no mezcla grupos.

Tangente, normal y residual siguen TA-04F: diferencia central cíclica,
`n=(-t_y,t_x)` y distancia euclídea después de alineación rígida. Los
percentiles usan nearest-rank sobre valores ordenados:
`p_q = sorted[ceil(q*N)-1]`.

### Solución rígida 2D exacta

Para pares en orden ascendente de bin, `q_i` es target y `p_i` referencia. Con
`N=1000`, calcular centroides mediante suma secuencial `float64` en ese orden y
`q'_i=q_i-q_bar`, `p'_i=p_i-p_bar`. Definir:

```text
Sqq = sum(qx'^2 + qy'^2)
Spp = sum(px'^2 + py'^2)
a   = sum(qx'*px' + qy'*py')
b   = sum(qx'*py' - qy'*px')
```

Es degenerado si `min(Sqq,Spp) <= N*epsilon_geom^2` o
`a^2+b^2 <= (N*epsilon_geom^2)^2`; las unidades son respectivamente `m²` y
`m⁴`. No hay fallback. En otro caso `theta=atan2(b,a)`, con rango `[-pi,pi]`;
`R=[[cos(theta),-sin(theta)],[sin(theta),cos(theta)]]` y
`t=p_bar-R*q_bar`. El resultado es `R*q_i+t`. Esto fuerza `det(R)=+1`: no
admite reflexión, escala ni shear. `atan2(±0,a>0)` se canonicaliza a `theta=0`;
cualquier no finito falla. El tie se decide solo por estos guards; no hay SVD
ni elección de vector singular.

Todas las medianas validan finitud y ordenan `float64` por valor numérico
ascendente. Cardinalidad impar toma índice `n/2`. Para cardinalidad par, si
`signbit(lo) != signbit(hi)` usa `(lo+hi)/2`; si tienen el mismo signbit
usa `lo+(hi-lo)/2`. El resultado debe ser finito. Esto evita overflow tanto en
`(-MaxFloat,+MaxFloat)` como en `(MaxFloatPrev,MaxFloat)`. Los recordings se
suministran en orden canónico y las vueltas por ordinal; sort estable conserva
el orden de empates.

## Cross-fit determinista par/impar sin leakage

La evaluación fija primero `L_original` y los ordinales
`0..L_original-1` inmediatamente después del oracle/gates F6 y antes de
proyección, geometría o alineación. Ese es el denominador inmutable del 80 %;
ninguna vuelta puede desaparecer después, sin reordenar por calidad:

- fold A entrena con ordinales pares y evalúa impares;
- fold B entrena con ordinales impares y evalúa pares.

La centerline de training se calcula solo con vueltas del fold de training,
incluidas su ancla, plantilla, alineaciones y medianas. Cada vuelta de evaluación
se proyecta usando **la ancla del training**, se alinea rígidamente a esa
centerline y produce p95/p99. Ningún sample, ancla, template o estadístico de la
vuelta evaluada entra en training.

- `L=2`: cada fold tiene `1 train / 1 eval`; ambos son válidos si pasan
  geometría.
- `L=3`: A tiene `2 train / 1 eval`; B `1 train / 2 eval`; ambos válidos.
- `L>=4`: partición natural par/impar.
- Si cualquier vuelta de training falla interpolación, geometría, degeneración
  o alineación, ese fold es `training_invalid`; todas sus vueltas de evaluation
  cuentan `FAIL`, sin reconstruir training con un subset.
- Una vuelta de evaluation que falla cualquier paso cuenta `FAIL` en su slot.
- Si cualquier fold queda con `0` training o `0` evaluation, el recording es
  `crossfit_insufficient`; todos sus `L_original` slots cuentan FAIL para el
  gate de grupo. No se mueve ni descarta una vuelta entre folds.

Cada ordinal termina exactamente en uno de `pass_thresholds`,
`fail_thresholds`, `fail_eval_geometry` o `fail_training_fold`; el ledger exige
que su suma sea `L_original`. El recording pasa solo si ambos folds son
estructuralmente válidos y `pass_thresholds/L_original >= 0.80`, cumpliendo
conjuntamente p95 `<=5 m` y p99 `<=10 m`. Ese 80 % nunca usa supervivientes.
Por tanto, con 2 vueltas se requieren 2 PASS y con 3 se requieren 3 PASS; en
general el mínimo entero es `ceil(0.80*L_original)`. Los tests fijan además
4/5=80 % PASS, 3/5=60 % FAIL, p95 exacto 5 PASS, p99 exacto 10 PASS y el
siguiente `float64` representable por encima de cada límite como FAIL.

## Decisión equilibrada por recording y desempates

Cada group key aplica esta matriz total en orden, sin condiciones solapadas:

1. si `eligible_recordings=0`: `stop_insufficient`;
2. si `failing_recordings>=1`:
   `technical_no_go_local_shape`, aunque además haya insuficientes;
3. si `failing_recordings=0` pero `crossfit_insufficient_recordings>=1`:
   `stop_insufficient`;
4. en el único caso restante, `eligible_recordings>=1`,
   `passing_recordings=contributing_recordings=eligible_recordings`:
   `technical_go_local_shape` (etiqueta
   local-only cuando hay exactamente uno).

`pipeline_fault` no es una quinta decisión estadística de grupo: es el outcome
global dominante ante integridad, determinismo, budget, privacidad o cleanup y
anula toda la matriz.

No hay mayoría de vueltas. En el único empate posible —recordings con evidencia
mixta y otros insuficientes— un recording suficiente que falle determina
`technical_no_go_local_shape`; si todos los suficientes pasan pero alguno es
insuficiente, el grupo queda `stop_insufficient`, no GO. Los valores exactamente
5 m, 10 m y 80 % pasan. El orden ordinal desempata solo referencias geométricas;
jamás el outcome.

## Forma estimada y confianza entre recordings

La centerline es un intermedio RAM y **nunca** aparece en manifest, stdout o
stderr; tampoco se emite `shape_available`. La decisión ya expresa si hubo
evidencia técnica suficiente. `cross_recording_confidence` depende solo de
contributors cross-fit válidos: `none` para 0 o 1, `limited` para 2 y
`provisional` para >=3. Los insuficientes se excluyen del contributor count y se
publican por separado; no existe intervalo inferencial en v1.

El manifest publica por grupo `discovered_recordings`, `eligible_recordings`,
`contributing_recordings` e `insufficient_recordings`; los dos últimos suman
exactamente los elegibles. Esto cubre 0/1/2/3+ sin estado vacío. Un recording
contribuye solo si ambos folds son válidos; contribuir no implica pasar los
thresholds. La confianza nunca sube por muchas vueltas.

Aquí `discovered_recordings` significa recordings canónicos asignables al group
key, y conserva exactamente
`discovered_recordings = insufficient_laps_recordings + eligible_recordings`.
`insufficient_recordings` en la frase anterior significa insuficiencia de
cross-fit **dentro de elegibles** y no incluye `insufficient_laps_recordings`.

Con un solo recording puede existir `technical_go_local_shape`, pero se etiqueta
obligatoriamente `technical_go_local_shape_local_only`: experimental, ligado al
group key, `cross_recording_confidence=none`, `inter_session_demonstrated=false`
y `product_map_authorization=false`. No cambia la capability general:
`local_shape=unknown`. Con cualquier cardinalidad, TA-04F7 por sí solo mantiene
`product_map_authorization=false`; una autorización de producto requiere review
y decisión humana posterior.

Bootstrap, PRNG, resampling e intervalos quedan fuera de TA-04F7 v1.

## Outcomes globales y outputs sanitizados

Outcome global exacto, mutuamente exclusivo y evaluado en este orden:

1. `pipeline_fault` si falla cualquier preflight, budget, inventario, lectura,
   integridad, determinismo, privacidad, escritura o cleanup; domina aunque ya
   existan decisiones de grupo y no se interpreta ningún resultado parcial.
2. `analysis_complete` solo si el barrido completo y cleanup pasan y al menos un
   grupo termina en `technical_go_local_shape`,
   `technical_go_local_shape_local_only` o `technical_no_go_local_shape`.
3. `stop_insufficient` solo si el barrido completo y cleanup pasan y **ningún**
   grupo produce una de esas tres decisiones; todos quedan insuficientes.

En una mezcla de grupos GO, NO-GO e insuficientes, el global es
`analysis_complete`; el manifest conserva cada outcome de grupo sin colapsarlo.

### Schema JSON agregado exacto

El manifest contiene solo estas claves top-level, en orden:
`version`, `protocol_sha`, `runner_sha`, `outcome`, `inventory_stable`,
`population`, `groups`, `cleanup`, `local_shape`,
`product_map_authorization`. `population` contiene, en orden:
`inventory_candidates`, `duplicates`, `authorization_rejected`,
`stability_rejected`, `artifact_guard_rejected`, `data_invalid`,
`canonical_recordings`, `insufficient_laps_recordings`, `eligible_recordings`.

Cada elemento de `groups`, por ordinal, contiene exactamente:
`group_ordinal`, `discovered_recordings`, `insufficient_laps_recordings`,
`eligible_recordings`, `contributing_recordings`,
`passing_recordings`, `failing_recordings`, `crossfit_insufficient_recordings`,
`evaluated_slots`, `passed_slots`,
`failed_threshold_slots`, `failed_eval_geometry_slots`,
`failed_training_fold_slots`, `decision`, `cross_recording_confidence`.
No hay pass rate, valores por recording ni
resúmenes p95/p99. Grupos pequeños usan exactamente el mismo schema; no se
suprimen selectivamente porque sus keys/IDs nunca se publican.
Los slot counts son diagnósticos de conservación, no unidades inferenciales ni
votos; la decisión usa solo conteos de recordings.

`cleanup` contiene solo `open_readers`, `staging_entries`, `staging_roots`.
`local_shape="unknown"` y `product_map_authorization=false` siempre. Números son
enteros JSON. Strings usan vocabularios cerrados. Se
rechazan claves extra, ausentes, orden distinto, números no finitos o negativos.

Conservación obligatoria:

```text
inventory_candidates = duplicates + authorization_rejected +
  stability_rejected + artifact_guard_rejected + data_invalid + canonical_recordings
canonical_recordings = sum(groups.discovered_recordings)
insufficient_laps_recordings = sum(groups.insufficient_laps_recordings)
eligible_recordings = sum(groups.eligible_recordings)
per group: discovered_recordings = insufficient_laps_recordings + eligible_recordings
per group: eligible_recordings = contributing_recordings + crossfit_insufficient_recordings
per group: contributing_recordings = passing_recordings + failing_recordings
per group: evaluated_slots = passed_slots + failed_threshold_slots +
  failed_eval_geometry_slots + failed_training_fold_slots
```

Toda ruptura es `pipeline_fault`. Duplicados/rechazos no reciben grupo. El
vocabulario interno total por candidato sigue siendo `duplicate`,
`authorization`, `stability`, `artifact_guard`, `data_invalid`,
`insufficient_laps`, `accepted`; 0/1 vueltas válidas son `insufficient_laps`,
`accepted` exige >=2.

### Snapshot efímero y publicación terminal sin overwrite

No existe commitment público, ledger binario persistido ni decoder. La clave y
digests del inventario son internos al run y solo prueban igualdad PRE/POST. El
runner suelta referencias y sobrescribe best-effort los buffers propios antes
de soltarlos; no afirma destruir memoria administrada por GC.

El temporal determinista es `<final>.ta04f7-<protocol_sha_12>-<runner_sha_12>.tmp`;
no contiene secretos. Antes de datos, tras resolver parent y comprobar cada
ancestro con `Lstat` e identidad, el único estado permitido es ausencia de
**final y temp**. Si existe cualquiera, solos o juntos, terminar
`pipeline_fault(output_state_preexisting)` antes de discovery/datos. La
invocación no valida, acepta, elimina ni repara output previo y jamás reejecuta
los mismos SHA.

Inmediatamente antes de crear temp y antes/después de `os.Link`, repetir Lstat e
identidad de cada ancestro y parent; cualquier swap/reparse observado invalida
el run. Con
target ausente: crear temp `O_CREATE|O_EXCL`, escribir el JSON, `Sync`, comprobar
`Close`, reabrir y verificar bytes. Publicar con
`os.Link(temp, final)`: en NTFS local el hardlink es atómico y falla si `final`
existe, por lo que nunca sobrescribe. Abrir/verificar bytes de `final`, eliminar
solo el temporal exacto y comprobar su ausencia. Link unsupported, target
aparecido, mismatch o fallo de cleanup = `pipeline_fault`; si el link existe y
la verificación final falla, conservar final para diagnóstico y no afirmar
freeze válido. Nunca usar rename/replace. El parent es controlado y las
revalidaciones detectan swaps observables, pero la stdlib no elimina TOCTOU
handle-relative ni permite afirmar que una ruta absoluta nunca siga reparse;
el manifest sanitizado limita la consecuencia. No se afirma
durabilidad de directorio ante power loss porque Go/Windows no ofrece aquí
`fsync` portable del directorio.

Todo crash deja un estado terminal para esos SHA. Recuperar o intentar de nuevo
requiere **nuevo commit de protocolo y nuevo runner SHA**, más un plan explícito
que decida custodia/archivo/eliminación del output anterior; este runner no lo
borra. Como la ruta final es la misma, esa decisión queda fuera de v1.

## TDD y golden sintético preregistrado

Gate 2 debe empezar RED y cubrir como mínimo:

1. synthetic no instancia discovery/readers; existing exige SHA, rama, HEAD
   limpio y output exactos; dos synthetic producen JSON idéntico;
2. inventory PRE/POST detecta adición, eliminación o cambio; raw reorder que
   normaliza igual pasa; PRE/POST por artifact y Close→Cleanup pasan/fallan;
3. oracle 0/1/2/3: 0/1 válidas son `insufficient_laps`, 2/3 `accepted`; NaN es
   `data_invalid`; vocabulario interno total y exclusivo;
4. paginación 4096, caps de samples/eventos/vueltas, cancelación, checked
   add/mul y combinación máxima de todos los buffers antes de allocation;
   `logical_live_bytes` 512 MiB falla cerrado; tras cada
   recording solo quedan centerline/agregados y buffers propios se limpian
   best-effort sin afirmaciones sobre GC;
5. malla, proyección, Kabsch, medianas odd/even con `±MaxFloat`, centerline de
   dos pasadas y peso igual por recording;
6. cross-fit 2/3 sin leakage, denominador fijo, fallos geometry/training, bordes
   inclusivos 5 m/10 m/80 % y ledger de slots exhaustivo;
7. matriz de decisión/confianza y conteos passing/failing/insufficient para
   0/1/2/3+ contributors, sin bootstrap ni intervalos;
8. schema JSON exacto rechaza claves/campos/orden inválidos y verifica todas las
   ecuaciones globales, por grupo y de slots, incluidos grupos solo 0/1;
   mutation tests incrementan/decrementan por separado global insufficient,
   global eligible y cada sumando de grupo y exigen `pipeline_fault`;
9. privacidad inspecciona JSON/stdout/stderr; no hay IDs, keys, paths,
   coordenadas, valores por vuelta, p95/p99 ni commitments;
10. preflight prueba final, temp y ambos como `output_state_preexisting` antes
    de datos y sin cleanup; live path prueba sync/close, hardlink no-overwrite,
    bytes finales y hardlink no soportado; swaps reparse antes/entre/después de
    Link invalidan el run sin afirmar prevención TOCTOU.

### Golden matemático integral independiente

El generador de referencia se implementa en el test como bucles y fórmulas
literales, sin importar helpers productivos. Constantes: `N=1000`, `hz=100`,
`R=6_371_000`, `r=100`, `C=2*pi*r`. Los group keys literales son
`A=(track-a,layout-a,car-a,class-a)` y
`B=(track-b,layout-b,car-b,class-b)`. A contiene `A1` con `L=2` y rotaciones de
sus vueltas evaluadas `[0, pi/2]`, y `A2` con `L=3`, rotaciones
`[pi, -pi/2, 0]`; B contiene `B1`, `L=2`, rotaciones `[pi/2, pi]`. Toda
traslación es literalmente `(0,0)`; el test unitario Kabsch separado aplica
`(17,-23)`.

Para cada recording de `L` vueltas se generan bloques `k=0..L+1` (los extremos
son padding del oracle) y samples `j=0..999`, con índice global `i=k*N+j`.
Los extremos `u=0` y `u=1` representan el mismo punto cíclico; esta duplicación
intencional hace que la longitud F6 sobre `[start,end)` sea exactamente `C` y
permite interpolar los centros de bin sin reestimar longitud:

```text
u             = j/(N-1)
GPS Time[i]   = i/hz
Lap Dist[i]   = C*u
Total Dist[i] = C*k + C*u
angle         = 2*pi*u + phi[max(0,min(L-1,k-1))]
x[i]          = r*cos(angle)
y[i]          = r*sin(angle)
Latitude[i]   = (y[i]/R) * 180/pi
Longitude[i]  = (x[i]/R) * 180/pi
```

Los cinco canales son `Present=true`, `Quality=valid`, finitos, `hz=100`, con
índices `0..(L+2)*N-1`. Hay un evento snapshot ordinal 0 en timestamp `0` y
eventos boundary ordinal `m=1..L+1` en timestamp `(m*N)/hz`, valor numérico
`m`, presentes y valid. Los descensos físicos de `Lap Dist` están exactamente
en índices `m*N`; las ventanas evaluables son `[m*N,(m+1)*N)` para `m=1..L`.
Así quedan especificados canales, índices, eventos, coordenadas, padding y
transformaciones sin fixture implícito.

Expected numérico literal, con tolerancia absoluta `1e-9 m`: Kabsch recupera
las rotaciones opuestas y traslación cero; cada residual, p95 y p99 es `0`; los
ledgers son A1 `2/2`, A2 `3/3`, B1 `2/2`; denominadores A `5` y B `2`; cada
recording logra `100 %`. A conserva 2 recordings/5 vueltas,
`technical_go_local_shape`, confidence `limited`; B conserva 1/2,
`technical_go_local_shape_local_only`, confidence `none`;
`local_shape=unknown` y `product_map_authorization=false`.

Negativo rígidamente no eliminable: sustituir **solo** la vuelta evaluada de
ordinal 1 de A1 por `u_i=(i+0.5)/N`, `radius_i=100+11*(-1)^i` y
`x_i=radius_i*cos(2*pi*u_i)`, `y_i=radius_i*sin(2*pi*u_i)`, conservando todos
los demás canales/índices. Por simetría par, centroides son cero, `b=0`, `a>0`,
la solución es identidad y los 1.000 residuales son exactamente `11 m` salvo
tolerancia `1e-9`; p95=p99=`11 m`, slot FAIL. Cuando esa vuelta entrena el fold
opuesto, su evaluación pristine también queda a 11 m; A1 ledger esperado
`0 pass / 2 fail / L_original=2`, nunca `0/0` ni denominador reducido.

Un negativo adicional sustituye las coordenadas de la vuelta ordinal 1 —el
único training impar— de un
recording de 3 vueltas por valores **finitos y cubiertos** constantes
`Latitude=0`, `Longitude=0`, manteniendo índices, hz, quality, Lap Dist,
Total Dist, GPS Time y eventos válidos. `coordinate_coverage` comprueba
presencia/índices/cobertura, no varianza geométrica; por ello el contrato
sintético de guards confirma que llega a cross-fit. En fold A, pares 0/2 entrenan
y ordinal 1 evalúa: su `Sqq=0` cuenta `fail_eval_geometry`. En fold B, ordinal 1
es el único training: `Sqq=0` vuelve el fold `training_invalid` y sus
evaluaciones ordinales 0/2 cuentan `fail_training_fold`.
Expected exacto: ledger `0 pass / 0 fail_thresholds / 1 fail_eval_geometry /
2 fail_training_fold`, suma `L_original=3`. No se descarta. NaN/Inf se prueban
por separado como `data_invalid` **antes** de elegibilidad/cross-fit y nunca
forman un caso `L_original`.

Añadir A3 pristine con L=2 cambia la confianza de A a `provisional`, sin
intervalo ni inferencia. No se fija hash del golden geométrico porque su
contrato es numérico `float64`, no una serialización; los expected numéricos
son literales. La review recalcula estas fórmulas con una rutina independiente
y no llama código productivo.

Checks Gate 2 previstos:

```powershell
gofmt -w tools/ta04f7-historical-cluster/*.go
go test ./tools/ta04f7-historical-cluster/...
go test -race ./tools/ta04f7-historical-cluster/...
go vet ./tools/ta04f7-historical-cluster/...
go run ./tools/ta04f7-historical-cluster -mode=synthetic
go test ./...
git diff --check
```

## Gates y freeze

### Gate 1 — plan

Versionar solo este protocolo en un commit dedicado. No implementar ni abrir
datos. El SHA del commit se incrusta en el runner.

### Gate 2 — runner sintético y reviews

Implementar por TDD únicamente `tools/ta04f7-historical-cluster/**`; ejecutar
solo synthetic, todos los checks anteriores y reviews independientes de spec,
calidad, privacidad y estadística. Commit dedicado, padre único Gate 1, scope
limitado al tool. El runner congela SHA del plan y el digest keyed efímero
del inventario para verificar la población dentro del run; no publica
clave, digest, ledger ni commitment.

### Gate 3 — una ejecución existing-only

Con worktree limpio y `HEAD` igual al SHA revisado del runner, ejecutar una sola
vez `existing-authorized`. Re-descubrir todo, deduplicar y evaluar todos los
grupos. No reutilizar cifras ni selección F6. Cualquier repetición requiere un
nuevo commit de protocolo, nuevo runner SHA y plan explícito de custodia del
output terminal anterior; no ejecución silenciosa con estos SHA.

Erratum de ejecución Windows: el intento único del runner
`e61e3eabd26fc37d943b18ac1a22e4151f939a19` terminó antes de discovery porque
el preflight comparaba la raíz con separadores `/` de Git for Windows contra
separadores `\` nativos. No produjo final, temp, staging ni manifest y dejó el
worktree limpio. Este commit no cambia población, matemática, umbrales ni
privacidad; autoriza exactamente una ejecución con un runner hijo que normalice
ambas representaciones antes de comparar. Final o temp preexistente siguen
siendo terminales y no se permite reusar el runner fallido.

Erratum multirrate y custodia: la ejecución única del runner
`a4c395e04aa8365dd2cb41ee538ce02479141a2e` produjo un JSON canónico pero
inválido como evidencia estadística: `319/319 data_invalid`, porque exigía las
cinco frecuencias y cardinalidades iguales. El archivo se conserva byte a byte
como `ta04f7-historical-cluster-rejected-a4c395e.json`, SHA-256
`b9c17f8b79c39a7f140477d7974d06276787726146e045504c1c8e2144236c65`, y no es
freeze ni `stop_insufficient` aceptado. Este commit autoriza exactamente una
ejecución con un runner hijo que aplique la regla multirrate anterior y use el
output distinto `ta04f7-historical-cluster-freeze-v2.json`. No cambia oracle,
grupos, thresholds, decisiones ni privacidad; el runner rechazado no se reusa.

### Gate 4 — freeze

Después de que el proceso Gate 3 haya terminado, una revisión externa/humana
reabre final, verifica schema, SHAs y bytes canónicos, confirma temp=0, revisa
privacidad, budgets y cleanup, y versiona el manifest en commit dedicado. Gate 4
no es otra invocación Gate 3 y no abre datos. No cambiar F6. TA-04F7 termina aquí.

**STOP visual exacto:** solo si Gate 3 produce `technical_go_local_shape` en al
menos un grupo, las reviews aplicables lo aprueban y existe autorización humana
explícita, se detiene este flujo y se entrega el siguiente corte visual a
T3/Claude Opus 5 con razonamiento low. TA-04F7 no inicia ni implementa visual.

## Criterio de cierre y verificación manual

El protocolo queda cerrado cuando sus cuatro gates están separados por commits,
el run existing-only es único, todos los grupos fueron incluidos, no se grabó
nada nuevo, el manifest está sanitizado, cleanup pasó y no se alteró ninguna
capability de producto. Para verificar manualmente: revisar historia lineal y
scopes de commits, ejecutar synthetic, comprobar el manifest contra su schema y
confirmar ausencia de archivos fuera del plan/tool/freeze previstos.

## Issues pendientes (no crear ahora)

- Crear/recuperar TA-04C, TA-04D, TA-04E, TA-04F/TA-04F6 y TA-04F7 con sus
  dependencias y evidencia local.
- Issue separada para Gate 2 (runner sintético/reviews).
- Issue separada para Gate 3/4 (run existing-only y freeze).
- Solo tras GO + review + autorización humana: issue visual TA-04B/T3 Claude.
- TA-04D sigue pendiente para datum/CRS y semántica oficial de ambos bordes;
  TA-04F7 no lo resuelve.
