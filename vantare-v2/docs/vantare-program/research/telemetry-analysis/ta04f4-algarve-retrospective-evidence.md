# TA-04F4 -- evidencia sanitizada del barrido retrospectivo Algarve

Estado: cierre documental local del 2026-08-13. Resultado:
**`stop_insufficient`**. Isaac autorizo reutilizar los DuckDB existentes, pero
este corte fue retrospectivo, de sensibilidad y con probable `training reuse`;
no fue un holdout ni una confirmacion independiente.

## Referencias congeladas

- plan TA-04F4:
  `vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f4-algarve-retrospective-plan.md@e45b0cd0c005c7aa6d55054d611eb7cbb822180a`;
- seleccion, custodia y commitments heredados de TA-04F2:
  `vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f2-existing-cohort-plan.md@fe5faed2d5748736606f52165aa913849e4bd531`;
- matematica base TA-04F:
  `vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f-repetition-variance-plan.md@c8e064d1c9add0cc8c807f415531bae225f9924d`.

## Alcance real

- el run fue fresco y uso la pila productiva de discovery, autorizacion,
  staging privado read-only, reader e inspeccion;
- se recorrieron todos los candidatos `ready` en orden canonico y se aplicaron
  los aliases Algarve/Portimao congelados;
- TA-04E y TA-04G no se excluyeron, por lo que la reutilizacion/contaminacion
  previa sigue siendo probable;
- la seleccion permanecio anterior a cualquier residual, proxy u outcome
  analitico;
- no hubo codigo, tests de producto, Linear, push, PR, CI remoto, merge,
  promocion, release, UI, mapa ni trabajo visual.

## Discovery y resultado agregado

| Metrica | Resultado sanitizado |
|---|---:|
| artifacts visibles | 347 |
| candidatos `ready` | 318 |
| recordings Algarve inspeccionados | 16 |
| recordings elegibles | 1 |
| bytes staged acumulados | 3,289 GiB |
| tiempo de pared | 183,7 s |
| recordings congelados | 0 |
| resultado | `stop_insufficient` |

Solo uno de los 16 recordings Algarve supero los guards pre-freeze. Ningun
`group key` exacto alcanzo el minimo de `>= 3` recordings elegibles, cada uno
con `>= 10` vueltas completas. Por tanto no existio cohorte que congelar.

## Distribucion por `group key` pseudonimizado

Los digests siguientes son prefijos sanitizados del digest con separacion de
dominio del `group key` normalizado. No publican el nombre de pista, layout,
coche, clase, recording, ruta, sesion ni candidato.

| Digest | Total | Elegibles | `sample_invalid` | `spatial_guard` |
|---|---:|---:|---:|---:|
| `a3bc403d0d95` | 10 | 1 | 3 | 6 |
| `5408e8c63175` | 3 | 0 | 3 | 0 |
| `0fdba66ae60f` | 1 | 0 | 1 | 0 |
| `29df53711ee1` | 1 | 0 | 1 | 0 |
| `a0688419dfb3` | 1 | 0 | 1 | 0 |

El primer grupo por orden de aparicion fue tambien el unico con un recording
elegible, pero `1 < 3`. No se eligio ningun subconjunto ni se cambio el orden
por resultados.

## Motivos de exclusion pre-freeze

- `9` recordings quedaron en `sample_invalid`, todos con la clasificacion
  diagnostica del runner `Lap:too_few_events`; no es un error tipado del
  producto: el contrato productivo devuelve `ErrSpatialInvalidInput` cuando
  recibe menos de dos eventos;
- esos 9 no presentaron fallos de `Present`, `Quality`, finitud, indice, orden
  ni ausencia de alguno de los cinco canales requeridos;
- `6` recordings llegaron al guard espacial y fueron rechazados con
  `ErrSpatialTimeNotAligned`;
- agregado sanitizado de esos 6: `events_total=40`, `resets_total=177`,
  `segments_total=183`, `complete_estimate_total=171`.

Estos conteos muestran dos fronteras concretas del contrato productivo actual:
dependencia de eventos `Lap` suficientes y ancla temporal global dentro de su
tolerancia. No demuestran que relajar ninguna frontera sea correcto.

## Freeze, analitica y custodia

- no se escribio selection manifest;
- no se genero `commit_key` ni commitments por recording;
- no hubo freeze de cohorte, reopen, reread analitico ni
  `selection_changed`;
- no se calcularon shape, residuales, jitter, correlaciones, bootstrap,
  p95/p99 ni outcomes `retrospective_*`;
- cleanup final: `0` residuos, `readers=0` y `staging=0`.

## Consecuencias

- TA-04F4 queda cerrado como `stop_insufficient`.
- Este resultado no valida ni invalida por si solo un cambio del contrato
  espacial productivo.
- `local_shape` permanece `unknown`.
- geolocalizacion absoluta permanece `unknown`.
- anchura fisica permanece `incompatible`.
- TA-04E conserva su `NO-GO` y no se relaja post hoc.
- TA-04B y cualquier trabajo visual continuan bloqueados.

El siguiente corte permitido es un diagnostico exploratorio preregistrado de
sensibilidad sobre fronteras y alineacion. Tampoco puede producir un `GO` ni
modificar capacidades de producto.
