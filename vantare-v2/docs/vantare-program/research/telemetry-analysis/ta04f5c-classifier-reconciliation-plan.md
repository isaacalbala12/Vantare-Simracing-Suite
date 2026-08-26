# TA-04F5C -- cierre de preflight y requisitos futuros de reconciliacion

Estado: **cancelado antes de ejecutar**. Resultado:
**`pipeline_fault(legacy_exact_unavailable)`**. Se confirmo que el helper legacy
exacto TA-04F5 ya no esta disponible y no existe un hash o version ejecutable
que permita demostrar su identidad. Sin ese comparador no se puede distinguir
un bug de implementacion de una diferencia de definicion.

El preflight termino antes de discovery, `Open`, staging, serializacion,
commitments, controles sobre datos existentes o acceso a DuckDB. TA-04F5C no
produjo un nuevo run ni nuevos agregados. TA-04F6 permanece bloqueada.

El cierre hereda dos fallos demostrados de TA-04F5B, sin intentar resolverlos:

1. la poblacion cambio de `6 / 9 / 1` a `7 / 9 / 0`;
2. el protocolo exigia puntuar 76 fronteras internas y 14 exteriores, pero el
   runner reporto 76 predicciones validas y 14 `one_side_invalid`.

A ellos se suma el fallo de preflight propio de TA-04F5C: el legacy exacto no
esta disponible ni tiene hash/version ejecutable. El contador
`internal_candidates=109` permanece no verificado y no se usa para resolver
ninguno de los tres fallos.

## Motivo de cancelacion

La reconciliacion exigia ejecutar el clasificador legacy TA-04F5 exacto y un
clasificador canonico sobre la misma serializacion. Reconstruir el legacy desde
prosa no demuestra el comportamiento historico y podria introducir justamente
la diferencia que se intenta diagnosticar. El gate falla cerrado sin abrir
datos: no se emite `classifier_bug` ni `definition_mismatch_confirmed`.

Las secciones restantes son **requisitos propuestos, no ejecutados**, para una
futura reapertura. No documentan acciones realizadas ni autorizan acceso a
datos.

## Requisitos futuros: referencias y universo

Una futura reapertura debera versionar antes del run:

- la evidencia TA-04F5;
- el plan y la evidencia TA-04F5B;
- este plan.

Solo despues del preflight ejecutable se exigiria discovery fresco de todos los
`ready` y exactamente:

| Digest de grupo | Cardinalidad |
|---|---:|
| `a3bc403d0d95` | 10 |
| `5408e8c63175` | 3 |
| `0fdba66ae60f` | 1 |
| `29df53711ee1` | 1 |
| `a0688419dfb3` | 1 |
| **Total Algarve** | **16** |

La composicion agregada obligatoria es `10 / 3 / 1 / 1 / 1`. No se selecciona
un subconjunto. Una diferencia de composicion impide comparar clasificadores.

## Requisitos futuros: identidad opaca dentro del run

El futuro runner generaria al inicio una `commit_key` aleatoria de 32 bytes,
exclusiva de TA-04F5C. Para cada recording conservaria solo en RAM
`HMAC-SHA256(commit_key, "TA-04F5C/session/v1" || session.ID)` y el SHA-256 de
su serializacion canonica con domain separation. Legacy y canonical deberian
recibir los mismos bytes asociados al mismo commitment; no volverian a leer el
recording entre clasificadores.

La clave, commitments y digests por recording no se versionarian ni se
publicarian; se destruirian al cerrar el helper. La evidencia futura solo
registraria igualdad global y conteos agregados por digest de grupo. Si no se
puede demostrar igualdad de commitment y serializacion en las dos pasadas, el resultado es
`identity_unverifiable_or_changed`.

## Requisitos futuros: tabla literal de poblacion canonica

Las reglas se aplicarian en este orden, exactamente una vez por recording:

| Precondicion | Poblacion canonica |
|---|---|
| numero de eventos `Lap` `< 2` | `low_event` |
| numero de eventos `Lap` `>= 2` y cualquier evento requerido es invalido, no finito, no esta estrictamente ordenado o queda fuera de cobertura | `oracle_invalid` |
| numero de eventos `Lap` `>= 2` y no se cumple ninguna condicion invalida anterior | `oracle_evaluable` |

La primera fila tiene precedencia: un recording con menos de dos eventos es
`low_event`, aunque su unico evento sea defectuoso. El snapshot se identifica
despues de clasificar. Una ausencia, duplicado o discrepancia de snapshot se
registra en contadores post-snapshot, pero **no cambia la poblacion**.

No existe una cuarta poblacion, exclusion silenciosa ni fallback. Debe cumplirse
`low_event + oracle_invalid + oracle_evaluable = recordings Algarve` global y
por digest.

## Requisitos futuros: dos clasificadores sobre una sola serializacion

Un futuro preregistro ejecutable debera:

1. identificar y versionar antes del acceso el helper legacy exacto, su hash,
   version, entrada/salida y procedimiento reproducible;
2. construir una serializacion canonica inmutable por recording con solo los
   campos ya autorizados por TA-04F5/5B para clasificacion y ledger;
3. ejecutar ese clasificador **legacy TA-04F5 exacto**;
4. ejecutar el clasificador **canonical** definido por la tabla literal de este
   plan sobre exactamente los mismos bytes;
5. repetir el par completo una segunda vez, sin mutar ni reordenar la
   serializacion;
6. exigir igualdad byte a byte de las salidas de cada clasificador entre sus
   dos evaluaciones.

Si el helper legacy exacto no existe, una futura reconstruccion minima desde el
protocolo TA-04F5 se etiquetaria `legacy_reconstructed_not_exact`. La
reconstruccion no puede presentarse como comportamiento historico demostrado:
sus diferencias solo podrian documentarse descriptivamente y el preflight
terminaria fail-closed en `pipeline_fault`, sin abrir datos ni decidir entre bug
y diferencia de definicion.

## Requisitos futuros: ledger post-snapshot y scoring

Despues de congelar la poblacion, cada clasificador deberia emitir contadores
separados para `oracle_evaluable`, `oracle_invalid` y `low_event`:

- eventos `Lap` totales;
- snapshots identificados, ausentes, duplicados o discrepantes;
- eventos post-snapshot observados;
- eventos invalidos, no finitos, fuera de orden y fuera de cobertura;
- predicciones validas, matches, mismatches, `one_side_invalid`, predicciones
  no emparejadas, eventos no emparejados y orphans.

Los contadores de una poblacion nunca se transferirian a otra para cuadrar el
total. El scoring usaria **exclusivamente** la poblacion
`oracle_evaluable` del clasificador canonical. Sus denominadores se publican
como fracciones (`matches / valid_predictions` y
`matches / observed_post_snapshot`); un denominador cero es
`zero_denominator` y nunca 100 %.

Los 90 eventos observados de TA-04F5/5B deben explicarse mediante un ledger de
conservacion global y por digest:

`eventos_totales = snapshots_identificados + eventos_post_snapshot + eventos_sin_snapshot_clasificable`

La evidencia futura deberia mostrar, por cada poblacion, cuantos de esos eventos
entran en cada termino. No se acepta inferir el 90 restando solo agregados
globales ni cancelar deficits entre recordings.

## Requisitos futuros: matriz de transiciones y causalidad acotada

Se publicaria una matriz agregada `legacy -> canonical` por digest. Toda
transicion debe llevar exactamente una causa primaria del siguiente vocabulario
cerrado:

- `event_count_rule_precedence`;
- `invalid_value_detection`;
- `nonfinite_detection`;
- `strict_order_detection`;
- `coverage_detection`;
- `snapshot_population_coupling`;
- `implementation_divergence`;
- `unresolved`.

Cada causa incluye los contadores que la demuestran, sin IDs, rutas,
timestamps, coordenadas ni valores de muestra. La suma de transiciones debe
reconciliar exactamente las poblaciones legacy y canonical, incluida la
transicion que explique `6 / 9 / 1 -> 7 / 9 / 0` si la identidad y los datos
permanecen iguales.

## Requisitos futuros: controles sinteticos obligatorios

Antes de abrir o interpretar los 16 Algarve, un futuro corpus sintetico efimero
deberia pasar dos veces y producir bytes canonicos identicos. Cubriria al menos:

1. cero y un evento, incluidos eventos defectuosos, siempre son `low_event`;
2. dos eventos validos y cubiertos son `oracle_evaluable`;
3. con `>= 2`, cada una de invalidez, no finitud, orden no estricto y falta de
   cobertura produce `oracle_invalid`;
4. snapshot ausente, duplicado o discrepante cambia solo contadores
   post-snapshot, nunca la poblacion;
5. los tres ledgers de poblacion conservan exactamente eventos y recordings;
6. el scoring rechaza cualquier denominador procedente de `low_event` o
   `oracle_invalid`;
7. la misma serializacion y commitment llegan a legacy y canonical;
8. alterar un byte o commitment activa
   `identity_unverifiable_or_changed` antes de comparar resultados;
9. una transicion sin causa cerrada termina `pipeline_fault`;
10. cero predicciones o eventos canonical evaluables produce
    `zero_denominator`.

Cualquier control fallido deberia detener el run antes de datos existentes.

## Requisitos futuros: determinismo, budgets y custodia

- discovery fresco de todos los `ready`;
- maximo `min(512, ready_candidate_count)` candidatos intentados;
- maximo acumulado staged `32 GiB`, sumado por `Size` pre-open;
- maximo `120 min` de pared;
- ejecucion secuencial con una sola sesion abierta;
- staging productivo privado y read-only;
- dos evaluaciones completas legacy/canonical sobre la misma serializacion;
- igualdad exacta de commitments, composicion, poblaciones, transiciones,
  contadores, ledgers y bytes canonicos entre ambas evaluaciones;
- PRE/POST, `CloseSession`, `ServiceShutdown`, helper cerrado, `readers=0`,
  `staging=0` y temporales `0`, tambien en error o abort.

Si un budget bindea antes de cubrir todos los `ready`, el resultado es
`pipeline_fault`; no se interpreta una cohorte parcial.

## Outcomes cerrados para una futura reapertura

Una futura reapertura emitiria exactamente uno:

- **`definition_mismatch_confirmed`**: identidad, serializacion, controles y
  determinismo pasan; el legacy exacto demuestra una regla de poblacion
  distinta y esa regla explica completamente las transiciones;
- **`classifier_bug`**: identidad, serializacion, controles y determinismo
  pasan; legacy y canonical pretenden la misma tabla literal, pero una
  divergencia de implementacion reproducible explica completamente las
  transiciones;
- **`identity_unverifiable_or_changed`**: no puede demostrarse que ambos
  clasificadores recibieron exactamente el mismo recording y los mismos bytes,
  o cambia la composicion requerida;
- **`pipeline_fault`**: falla un control, determinismo, ledger, reconciliacion,
  budget o cleanup; hay una transicion `unresolved`; o solo existe una
  reconstruccion no exacta del legacy.

La precedencia propuesta seria: identidad/composicion, controles y
determinismo, exactitud del legacy, reconciliacion completa y, solo entonces,
diagnostico de definicion o bug. Ningun outcome autoriza modificar producto o
contrato.

## Cierre actual y STOP

TA-04F5C no calculo elegibilidad A/B/C, vueltas recuperadas, shape, mapa,
proyeccion, residual TA-04F, jitter, bootstrap ni outcomes TA-04F/TA-04F4. No
toco codigo o tests de producto, UI ni capacidades. TA-04F6 no comienza.

La unica via de reapertura es preregistrar primero un runner ejecutable que
incluya version y hash del legacy exacto, contrato de serializacion, tabla
literal, commitments opacos, controles sinteticos y doble determinismo. Hasta
entonces el resultado permanece
`pipeline_fault(legacy_exact_unavailable)` y no se accede de nuevo a los datos.

En todos los outcomes `local_shape=unknown`, geolocalizacion absoluta
`unknown`, anchura fisica `incompatible` y TA-04B permanece en STOP visual. El
unico cierre permitido es documentar el diagnostico agregado y volver a parar.
