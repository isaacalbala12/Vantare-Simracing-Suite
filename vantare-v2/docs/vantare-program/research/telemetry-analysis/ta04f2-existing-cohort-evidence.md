# TA-04F2 — evidencia sanitizada de agotamiento de budget

Estado: cierre documental local del 2026-08-12. Resultado aceptado:
**`budget_exhausted`** bajo el plan base TA-04F2, sin cohorte congelada, sin
selection manifest y sin outcome causal final. Este corte no reabre TA-04E, no
valida `local_shape` y no desbloquea trabajo visual.

## Referencias congeladas

- plan base TA-04F2:
  `vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f2-existing-cohort-plan.md@fe5faed2d5748736606f52165aa913849e4bd531`;
- matemática y controles TA-04F heredados:
  `vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f-repetition-variance-plan.md@c8e064d1c9add0cc8c807f415531bae225f9924d`.

## Alcance real del run

- solo documentación local;
- sin Linear, código, tests de producto, push, PR, CI remoto, merge,
  promoción ni release;
- sin residuales, sin bootstrap y sin outcome
  `historical_characterization_*`.

## Discovery, budget y recorrido

| Métrica | Resultado sanitizado |
|---|---|
| discovery total | 347 |
| `ready` | 318 |
| base de `ready` | trackers independientes, `2` observaciones |
| candidatos intentados | 64 |
| candidatos inspeccionados | 62 |
| bytes acumulados | 1_169_408_000 |
| tiempo de pared | 51 s |
| elegibles congelables | 0 |
| outcome | `budget_exhausted` |

El recorrido respetó el orden canónico del plan. No hubo cherry-pick, cambio de
orden ni selección guiada por outcomes.

## Fallos observados

| Tipo | Conteo |
|---|---|
| fallos pre-inspect | 2 |
| errores espaciales totales en inspect | 62 |
| `TimeNotAligned` | 42 |
| `InvalidInput` | 15 |
| `TimeCoverage` | 3 |
| `InvalidValue` | 1 |
| `ProgressOrder` | 1 |

Observaciones registradas del mismo run:

- `events=resets+1 only12, less50`;
- calidad de sample en los caminos observados: todos `valid` y finitos;
- no apareció bug de igualdad de `rowcount`.

## Cierre, custodia y límites

- no hubo cohorte congelada de 3 recordings;
- no hubo selection manifest agregado;
- no hubo residuales, jitter, correlaciones, p95/p99 finales ni clasificación
  causal;
- cleanup final: `0` residuos, con `readers=0` y `staging=0`.

## Consecuencias canónicas

- TA-04F2 queda cerrado localmente como `budget_exhausted`.
- `local_shape` permanece `unknown`.
- geolocalización absoluta permanece `unknown`.
- anchura física permanece `incompatible`.
- TA-04B sigue en STOP visual.
- TA-04E no se reetiqueta ni se relaja post hoc.

## Siguiente paso documental

TA-04F3 puede ampliar **solo** el budget de candidatos manteniendo el mismo
orden canónico, la misma matemática y los mismos gates de TA-04F2. Esa
ampliación no convierte retrospectivamente este cierre en fallo de método: el
primer corte agotó honestamente su límite de `64` candidatos y por eso se
documenta como `budget_exhausted`.
