# TA-04F3 — preregistro acotado de barrido completo sobre cohorte existente

Estado: suplemento documental local y estrecho posterior al cierre TA-04F2
`budget_exhausted`. Este documento preserva intactos los contratos de TA-04F2 y
TA-04F salvo un único cambio: ampliar el budget de candidatos para recorrer la
cohorte `ready` completa en el mismo orden canónico.

## Referencias congeladas y herencia exacta

TA-04F3 hereda **sin cambios**:

- el plan exacto TA-04F2 versionado en
  `vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f2-existing-cohort-plan.md@fe5faed2d5748736606f52165aa913849e4bd531`;
- la matemática, proyección local, alineación, proxies, controles sintéticos,
  rereads, guards de custodia, outcomes permitidos y límites canónicos de
  `local_shape` heredados desde
  `vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f-repetition-variance-plan.md@c8e064d1c9add0cc8c807f415531bae225f9924d`.

Todo lo no reescrito explícitamente aquí queda congelado exactamente como en
TA-04F2.

## Motivación post hoc, declarada sin ocultación

TA-04F2 agotó honestamente su budget de `64` candidatos sin obtener cohorte
congelable:

- discovery `347`;
- `ready=318`;
- intentados `64`;
- inspeccionados `62`;
- elegibles `0`;
- outcome aceptado: `budget_exhausted`.

La motivación de TA-04F3 es **solo** descartar que ese límite de `64` fuera
demasiado estrecho para una cohorte histórica grande. No se autoriza:

- cherry-pick de candidatos;
- cambio del orden canónico;
- reanudar desde el candidato `65` ni desde ningún checkpoint parcial;
- reutilizar elegibilidad, outcomes, commitments o `session.ID` derivados de
  TA-04F2;
- cambio de exclusiones;
- cambio de gates;
- cambio de outcomes;
- reinterpretación de TA-04E o validación de `local_shape`.

## Único cambio respecto de TA-04F2

En TA-04F2, el paso de budgets duros de selección ciega fijaba:

- máximo `64` candidatos post-sort intentados;
- máximo acumulado staged `32 GiB`;
- máximo de tiempo de pared `120 min`;
- ejecución secuencial de una sola sesión abierta.

TA-04F3 reemplaza **solo** el primer bullet por este:

- máximo `512` candidatos post-sort intentados, o todos los candidatos en
  estado `ready` si fueran menos de `512`, siempre en el mismo orden canónico
  post-sort heredado de TA-04F2.

Los otros budgets quedan exactamente iguales:

- máximo acumulado staged `32 GiB`;
- máximo de tiempo de pared `120 min`;
- ejecución secuencial de una sola sesión abierta.

## Interpretación operacional exacta

Para TA-04F3:

1. El run empieza fresco desde el primer candidato del orden canónico. No
   continúa el recorrido previo de TA-04F2.
2. `Discover` se ejecuta de nuevo por la misma API autorizada.
3. El estado `ready` debe volver a confirmarse con el mismo esquema heredado de
   trackers independientes y `2` observaciones frescas del nuevo run.
4. Con ese discovery fresco, todos los candidatos se reordenan exactamente por
   `ModifiedAt` ascendente, `Size` ascendente y `CandidateID` ascendente.
5. El recorrido reinspecciona secuencialmente desde el primer candidato de ese
   orden, sin saltos ni repriorización.
6. La elegibilidad, deduplicación, exclusión, aceptación y eventual freeze se
   recalculan desde cero dentro de TA-04F3. No se importan resultados de
   elegibilidad ni outcomes parciales de TA-04F2.
7. El run puede intentar hasta `min(512, ready_count)` candidatos que sigan
   siendo `ready` en ese orden. Bajo el inventario observado al cierre TA-04F2,
   el cap de candidatos no debería bindear porque `ready_count=318`, pero la
   semántica general queda congelada para cualquier reejecución futura.
8. Si se congela una cohorte válida de `3` recordings, el outcome de esta fase
   es **`selection_frozen`** y solo entonces pueden empezar los cálculos
   residuales y outcomes causales heredados de TA-04F2/TA-04F.
9. Si el run agota todos los candidatos `ready` del discovery fresco sin lograr
   cohorte válida de `3`, el outcome de esta fase es **`stop_insufficient`**.
10. `budget_exhausted` solo es válido si, antes de agotar toda la cohorte
    `ready` del discovery fresco, bindea alguno de estos límites duros:
    `32 GiB`, `120 min` o `min(512, ready_count)`.

## No cambios reafirmados

Siguen exactamente iguales:

- la selección ciega a residuales y outcomes;
- el `group key` exacto `TrackName + TrackLayout + CarName + CarClass`
  normalizados;
- la exclusión Algarve / Portimão;
- la exclusión determinista o explícitamente incierta de TA-04E / TA-04G;
- la deduplicación solo en memoria por `session.ID`;
- el requisito de `>= 10` vueltas completas;
- la cobertura exacta de `GPS Latitude`, `GPS Longitude`, `GPS Time`,
  `Lap Dist` y `Total Dist`;
- el freeze con `CloseSession`, `ServiceShutdown`, `staging = 0`,
  `readers = 0`, ledger, manifest y reopen sobre nueva instancia;
- los commitments pseudónimos versionados;
- los outcomes permitidos y su interpretación;
- la prohibición de derivar datum, geolocalización absoluta, anchura física o
  `GO` de `local_shape`;
- TA-04B en STOP visual.

## Checks documentales adicionales de TA-04F3

Antes de ejecutar TA-04F3 debe comprobarse además:

1. que la única diferencia material frente a TA-04F2 sea el budget de
   candidatos `64 -> min(512, ready_count)`;
2. que el run empiece fresco desde el primer candidato del orden canónico y no
   continúe desde el candidato `65` ni desde un checkpoint parcial;
3. que `Discover`, trackers, `2` observaciones, confirmación de `ready` y sort
   se rehagan por completo en el nuevo run;
4. que el estado `ready` no se use para reordenar ni priorizar fuera del sort
   canónico heredado;
5. que la elegibilidad, exclusión, dedupe y aceptación se recalculen desde
   cero, sin reutilizar IDs, commitments ni outcomes de TA-04F2;
6. que el run siga siendo secuencial, con una sola sesión abierta;
7. que `32 GiB` y `120 min` no cambian;
8. que `budget_exhausted` solo pueda declararse si uno de los límites duros
   bindea antes de agotar todos los `ready` del discovery fresco;
9. que `stop_insufficient` sea el outcome correcto si se agota toda la cohorte
   `ready` del discovery fresco sin freeze de `3` recordings;
10. que `selection_frozen` sea el outcome correcto cuando sí se congela esa
    cohorte y antes de cualquier residual;
11. que ningún resultado de TA-04F3 pueda presentarse como validación
    independiente ni como autorización visual.
