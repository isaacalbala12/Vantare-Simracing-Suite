# TA-04F5 -- evidencia sanitizada de sensibilidad de frontera y ancla

Estado: cierre **provisional** del run local del 2026-08-13. Resultado aceptado
por ahora: **`pipeline_fault`**. El runner produjo sustantivamente
`stop_insufficient`, pero ese outcome no se acepta porque el oracle C devolvio
cero matches sin una explicacion compatible con sus propios agregados
temporales. Este corte sigue siendo exploratorio, retrospectivo y contaminado;
no es validacion ni confirmacion independiente.

## Referencias congeladas

- plan preregistrado TA-04F5:
  `vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f5-boundary-anchor-sensitivity-plan.md@92baeb352128db0361f1e8143d7f833dc4011619`;
- evidencia y universo TA-04F4:
  `vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f4-algarve-retrospective-evidence.md@92baeb352128db0361f1e8143d7f833dc4011619`;
- contrato matematico y custodia heredados de TA-04F/TA-04F2 segun las
  referencias del plan congelado.

## Alcance real y custodia

| Metrica | Resultado sanitizado |
|---|---:|
| artifacts descubiertos | 347 |
| candidatos `ready` | 318 |
| candidatos intentados | 318 |
| candidatos inspeccionados | 318 |
| recordings Algarve | 16 |
| bytes staged acumulados | 3,289 GiB |
| tiempo de pared | 235,7 s |
| dos evaluaciones deterministas | PASS |
| composicion agregada | `10 / 3 / 1 / 1 / 1` |
| cleanup | `readers=0`, `staging=0`, temporales eliminados |

El run cubrio todos los `ready`, reconstruyo los cinco digests y aplico A/B/C
a todos los 16 Algarve, sin seleccionar un subconjunto favorable. No hubo
cambio de codigo productivo, tests de producto, Linear, push, PR, CI remoto,
merge, promocion, release ni trabajo visual.

## Resultados A/B/C por digest

`A/B/C` expresa recordings elegibles con `>= 10` vueltas bajo cada brazo.

| Digest de `group key` | Total | A/B/C elegibles | Dispositions agregadas |
|---|---:|---:|---|
| `a3bc403d0d95` | 10 | `1 / 1 / 1` | A: `InvalidInput=3`, `TimeNotAligned=6`; B: `InvalidInput=3`, `TimeNotAligned=5`, `data_failure=1`; C: `InvalidInput=3`, `data_failure=1`, `not_eligible=5`; transicion: `eligible_A=1`, `not_recovered=9` |
| `5408e8c63175` | 3 | `0 / 0 / 0` | `InvalidInput=3` en A, B y C; `not_recovered=3` |
| `0fdba66ae60f` | 1 | `0 / 0 / 0` | `InvalidInput=1` en A, B y C |
| `29df53711ee1` | 1 | `0 / 0 / 0` | `InvalidInput=1` en A, B y C |
| `a0688419dfb3` | 1 | `0 / 0 / 0` | `InvalidInput=1` en A, B y C |

Ningun grupo alcanzo `>= 3` recordings con `>= 10` vueltas bajo A, B o C. La
sensibilidad no recupero ningun recording respecto al baseline productivo.
Por los gates sustantivos preregistrados, esto corresponderia a
`stop_insufficient`.

## Oracle B

Poblaciones:

- `oracle_evaluable=6`;
- `low_event=9`;
- `oracle_invalid=1`.

Scoring agregado B:

| Metrica | Resultado |
|---|---:|
| matches | 70 |
| resets predichos | 115 |
| eventos post-snapshot observados | 90 |
| fronteras huerfanas | 25 |
| precision | 0,6087 |
| recall | 0,7778 |
| residuales puntuados | 70 |
| residual p50 | 0,0525 s |
| residual p95 | 0,0925 s |
| residual max | 0,0925 s |

B no alcanza correspondencia 1:1, precision/recall 100 % ni cero huerfanas.
Por tanto, aunque hubiera recuperado elegibilidad, no justificaria retirar los
eventos del contrato productivo.

## Oracle C y contradiccion diagnostica

C reporto las mismas poblaciones (`6 / 9 / 1`), pero:

| Metrica | Resultado |
|---|---:|
| matches | 0 |
| fronteras predichas | 77 |
| eventos post-snapshot observados | 90 |
| fronteras huerfanas | 90 |
| precision | 0 |
| recall | 0 |

En paralelo, el analisis temporal interno C produjo:

| Metrica | Resultado |
|---|---:|
| recordings temporalmente validos | 10 |
| residuos intra-ventana | 786.657 |
| residual p50 | `5,31e-10 s` |
| residual p95 | `7,51e-10 s` |
| residual max | `1,91e-9 s` |
| dispersion de interceptos: observaciones | 87 |
| dispersion p50 | `0 s` |
| dispersion p95 | `7e-12 s` |
| dispersion max | `2,44e-9 s` |

Los residuos internos diminutos no prueban alineacion con eventos, pero hacen
que un cero absoluto en todas las parejas del oracle C requiera una explicacion
del algoritmo de pairing/scoring. El run no la aporto. Ademas, `orphans=90` no
expresa de forma transparente la diferencia entre 77 predicciones y 90 eventos
por recording. Por eso no se acepta el cierre sustantivo hasta auditar el
off-by-one, la doble representacion de una frontera interna, los denominadores
y el tratamiento del snapshot.

## Subconjunto low-event

De los 9 recordings `low_event`, ninguno alcanzo `>= 10` segmentos interiores
compatibles:

- B: `0 / 9`;
- C: `0 / 9`.

Esto sigue siendo `internal_consistency_only`; no demuestra semantica de vuelta.

## Decision provisional

La lectura sustantiva preregistrada seria `stop_insufficient`: no hay grupo
`>= 3 x >= 10` en A, B o C y el oracle B falla claramente. Sin embargo, el
oracle C es parte del pipeline diagnostico preregistrado y su cero inexplicado
impide afirmar que el run completo es coherente. El resultado canónico
provisional es por ello **`pipeline_fault`**, no `stop_insufficient`.

No hubo shape, mapa, proyeccion espacial, residuales TA-04F, bootstrap, outcome
TA-04F/TA-04F4 ni inicio de F6. `local_shape` permanece `unknown`, la
geolocalizacion absoluta `unknown`, la anchura fisica `incompatible` y TA-04B
continua en STOP visual.

El unico siguiente paso permitido es el rerun minimo TA-04F5B del oracle C,
preregistrado por separado. No reabre la seleccion ni autoriza cambios de
producto.
