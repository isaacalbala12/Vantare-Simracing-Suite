# TA-04F3 -- evidencia sanitizada de barrido completo sobre cohorte existente

Estado: cierre documental local del 2026-08-12. Resultado aceptado:
**`stop_insufficient`** tras agotar el barrido completo de la cohorte `ready`
heredada por TA-04F3, sin cohorte congelada, sin selection manifest y sin
outcome analitico final. Este corte no reabre TA-04E, no valida
`local_shape` y no desbloquea trabajo visual.

## Referencias congeladas

- plan base TA-04F3:
  `vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f3-full-existing-cohort-plan.md@e73c42c5966a9e3988d3d2ac17834f9c9bf1bda3`;
- plan base TA-04F2:
  `vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f2-existing-cohort-plan.md@fe5faed2d5748736606f52165aa913849e4bd531`;
- matematica y controles TA-04F heredados:
  `vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f-repetition-variance-plan.md@c8e064d1c9add0cc8c807f415531bae225f9924d`.

## Alcance real del run

- el unico artefacto versionado es documentacion local;
- el run si ejecuto discovery, autorizacion, staging privado read-only,
  inspeccion y cleanup mediante la pila productiva sobre 318 candidatos;
- sin Linear, codigo, tests de producto, push, PR, CI remoto, merge,
  promocion ni release;
- sin residuales, sin bootstrap y sin outcomes
  `historical_characterization_*`.

## Discovery y barrido completo

| Metrica | Resultado sanitizado |
|---|---|
| visibles totales | 347 |
| `ready` | 318 |
| candidatos intentados | 318 |
| candidatos inspeccionados | 318 |
| bytes acumulados | 3_532_005_376 |
| tiempo de pared | 223 s |
| excluidos Algarve / Portimao | 16 |
| invalidos o rechazados por guards | 302 |
| elegibles no-Algarve congelables | 0 |
| outcome | `stop_insufficient` |

El recorrido respeto el orden canonico heredado de TA-04F2/TA-04F3. No hubo
cherry-pick, cambio de orden ni seleccion guiada por outcomes. El barrido
agoto la cohorte `ready` completa y no encontro ningun grupo no-Algarve que
pudiera congelar `>= 3` recordings elegibles.

## Cierre, custodia y limites

- no hubo cohorte congelada de 3 recordings;
- no hubo selection manifest agregado;
- no hubo residuales, jitter, correlaciones, p95/p99 finales ni outcome
  `historical_characterization_*`;
- cleanup final: `0` residuos, con `readers=0` y `staging=0`.

## Consecuencias canonicas

- TA-04F3 queda cerrado localmente como `stop_insufficient`.
- `local_shape` permanece `unknown`.
- geolocalizacion absoluta permanece `unknown`.
- anchura fisica permanece `incompatible`.
- TA-04B sigue en STOP visual.
- TA-04E no se reetiqueta ni se relaja post hoc.

## Siguiente paso documental

Si se decide seguir, el siguiente corte debe declararse explicitamente como
retrospectivo y de sensibilidad sobre la cohorte Algarve ya conocida, con
reutilizacion/training reuse admitida y sin venderlo como holdout ni
confirmacion independiente.
