# TA-04F5B -- evidencia sanitizada del erratum del oracle C

Estado: cierre local del rerun diagnostico del 2026-08-13. Resultado canonico:
**`pipeline_fault`**. Este documento registra los conteos obtenidos; no ofrece
una interpretacion sustantiva de los datos y no autoriza TA-04F6.

## Referencias congeladas

- plan TA-04F5 y evidencia provisional versionados antes del rerun;
- plan preregistrado TA-04F5B:
  `docs/vantare-program/research/telemetry-analysis/ta04f5b-oracle-c-erratum-plan.md`;
- universo, custodia, thresholds y privacidad heredados de esos planes.

## Universo y baseline inmutable

El discovery fresco reprodujo exactamente:

| Metrica | Resultado |
|---|---:|
| artifacts descubiertos | 347 |
| candidatos `ready` | 318 |
| recordings Algarve | 16 |
| composicion por digest | `10 / 3 / 1 / 1 / 1` |

El grupo dominante mantuvo `A elegibles=1` y `B elegibles=1`; A/B no se
recalcularon como analisis. El baseline congelado del oracle B fue:

| Metrica B | Resultado |
|---|---:|
| `oracle_evaluable` | 6 |
| `low_event` | 9 |
| `oracle_invalid` | 1 |
| matches | 70 |
| predicciones validas | 115 |
| eventos observados post-snapshot | 90 |
| orphans | 25 |

## Oracle C corregido

En el grupo dominante de 10 recordings, la ejecucion corregida produjo:

| Metrica C | Resultado |
|---|---:|
| `oracle_evaluable` | 7 |
| ventanas intentadas / validas | `83 / 83` |
| contador runner `internal_candidates` | 109, no verificado |
| matches | 70 |
| predicciones validas | 76 |
| eventos observados post-snapshot | 90 |
| mismatches emparejados | 6 |
| `one_side_invalid` | 14 |
| predicciones no emparejadas | 0 |
| eventos no emparejados | 14 |
| orphans | 14 |
| residual p50 | 0,0525 s |
| residual p95 | 0,0925 s |
| residual p99 | 0,0925 s |
| residual max | 0,0925 s |
| precision retenida del runner | `70 / 76 = 0,9211` |
| recall retenido del runner | `70 / 90 = 0,7778` |

El valor `internal_candidates=109` procede del runner, pero su universo no fue
definido ni reconciliado. Con 83 ventanas validas repartidas entre 7 recordings,
el maximo de fronteras internas consecutivas seria 76; ademas,
`matches + mismatches = 70 + 6 = 76`. Por tanto, 109 se conserva como contador
crudo del runner, queda **no verificado** y se excluye de cualquier conclusion.

Existe un segundo `pipeline_fault` independiente. El protocolo TA-04F5B
puntuaba dos fronteras exteriores por recording. Con 83 ventanas validas en 7
recordings, el ledger esperado es `83 - 7 = 76` fronteras internas mas
`2 * 7 = 14` exteriores: 90 predicciones validas y
`one_side_invalid=0`. El runner reporto 76 predicciones validas y
`one_side_invalid=14`, por lo que trato las exteriores como no puntuables y no
aplico la convencion congelada. La precision `70/76` y el recall `70/90`
anteriores son datos retenidos del runner defectuoso, no un outcome valido.

Los otros cuatro grupos tuvieron `oracle_evaluable=0`. Los totales corregidos
de poblacion sobre los 16 recordings fueron por tanto
`oracle_evaluable=7`, `low_event=9`, `oracle_invalid=0`.

## Contradiccion que cierra el rerun

TA-04F5B exigia conservar la poblacion esperada `6 / 9 / 1`. El rerun produjo
`7 / 9 / 0`: el recording antes clasificado `oracle_invalid` paso a
`oracle_evaluable`. Los 90 eventos observados se conservaron, pero la poblacion
de scoring cambio. Por ello los agregados corregidos no son comparables bajo
la precondicion congelada y el outcome obligatorio es **`pipeline_fault`**.

No se interpreta si la diferencia procede de una definicion distinta o de un
bug del clasificador. TA-04F5C quedo cancelada en preflight y conserva solo los
requisitos para una futura reapertura ejecutable.
No se calcula ni reabre elegibilidad A/B/C, shape, mapa, jitter, bootstrap,
residual TA-04F u outcome TA-04F/TA-04F4. TA-04F6 no se inicia.

## Custodia y cierre

- controles sinteticos TA-04F5B: PASS;
- doble evaluacion: assertion `deterministic=true` reportada por el runner, no
  verificable desde un ledger retenido;
- composicion `10 / 3 / 1 / 1 / 1`, total 16: PASS;
- `readers=0`;
- `staging=0`;
- temporales residuales `0`;
- Git limpio al cierre del runner: PASS;
- PRE/POST no se reporto por separado en la salida retenida y, por tanto, no
  queda demostrado de manera independiente en esta evidencia;
- el ledger por digest exigido por el plan no fue retenido y no queda
  demostrado;
- sin cambios de producto, tests de producto, UI o capacidades;
- sin Linear, push, PR, CI remoto, merge, promocion, release ni trabajo
  visual.

`local_shape` permanece `unknown`, la geolocalizacion absoluta permanece
`unknown`, la anchura fisica permanece `incompatible` y TA-04B continua en
STOP visual.

Tras este cierre se confirmo que el helper legacy exacto de TA-04F5 ya no esta
disponible y no existe hash/version ejecutable que permita demostrar su
identidad. TA-04F5C se cancela en preflight sin discovery, `Open`, staging,
serializacion, commitments, controles sobre datos existentes ni acceso a
DuckDB. Esta confirmacion no altera el outcome `pipeline_fault`.
