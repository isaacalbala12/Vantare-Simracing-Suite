# TA-04F — evidencia sanitizada de STOP insuficiente

Estado: cierre documental local del 2026-08-12. Resultado: **`STOP insuficiente`**
porque el discovery productivo metadata-only no encontró ningún recording
estrictamente posterior al freeze marker. No hubo holdout, `Open/Inspect`,
lectura de contenido, copia temporal ni superficie visual. TA-04E permanece
`NO-GO`, `local_shape=unknown` y TA-04B sigue bloqueada.

## Freeze marker y alcance

- commit de freeze: `c8e064d1c9add0cc8c807f415531bae225f9924d`;
- freeze UTC: `2026-08-12T19:48:35Z`;
- rama local: `work/ta04f-repetition-variance`;
- alcance: solo documentación local, sin Linear, código, tests de producto,
  push, PR, CI remoto, merge, promoción ni release.

## Discovery y clasificación por freeze

El recorrido usó exclusivamente discovery autorizado y metadata-only. No se
abrió ningún artifact ni se inspeccionó contenido.

| Métrica | Resultado sanitizado |
|---|---|
| artifacts visibles totales | 347 |
| `active` | 29 |
| `stabilizing` | 318 |
| visibles pre-freeze | 347 |
| visibles post-freeze estrictos | 0 |

Todos los artifacts visibles en el recorrido quedaron clasificados como
`training/exploratory` por ser pre-freeze. No se llamó `ready` al estado
`stabilizing`.

## Decisión

El protocolo TA-04F exige, al final del recorrido completo, un grupo con:

- `>= 3` recordings nuevos y compatibles;
- `>= 10` vueltas completas por recording;
- cobertura exacta de `GPS Latitude`, `GPS Longitude`, `GPS Time`, `Lap Dist`
  y `Total Dist`;
- guards productivos TA-02/TA-03E/TA-03F en `PASS`.

Como el conteo estricto post-freeze fue `0`, no existió ningún candidato nuevo
que pudiera abrir un holdout ni un grupo que alcanzara el mínimo `>= 3`.
Resultado canónico: **`STOP insuficiente`** por insuficiencia muestral
(`0 < 3`).

## Custodia, privacidad y cleanup

- `Open/Inspect`: 0
- recordings abiertos: 0
- readers activos al cierre: 0
- staging temporal persistente al cierre: 0
- helper TA-04F al cierre del gate metadata-only: eliminado
- estado del gate metadata-only: helper/runtime/staging limpios
- estado Git posterior: 4 cambios documentales locales sin commit

No se conservaron ni versionaron rutas, identificadores, timestamps crudos,
coordenadas, valores por muestra, nombres, metadata sensible ni hashes de
contenido. Tampoco hubo copia read-only porque no se abrió ningún artifact.

## Consecuencias canónicas

- TA-04E mantiene su `NO-GO` sin relajación post hoc.
- `local_shape` sigue `unknown`.
- geolocalización absoluta sigue `unknown`.
- anchura física sigue `incompatible`.
- `Path Lateral` y `Track Edge` no ganan nueva semántica confirmatoria.
- TA-04B y cualquier trabajo visual continúan bloqueados.
- Un recording no equivale a una sesión demostrada; esa equivalencia no quedó
  probada en TA-04F y aquí no se abrió contenido alguno.

## Próximo paso manual exacto

Antes de reintentar TA-04F, Isaac debe:

1. grabar 3 recordings nuevos del mismo track/layout/car;
2. asegurar que cada recording tenga `>= 10` vueltas completas;
3. crear esos recordings después del freeze marker
   `2026-08-12T19:48:35Z`;
4. no copiar, renombrar ni reciclar archivos viejos;
5. no abrirlos con herramientas humanas o ad hoc fuera del helper TA-04F;
6. cerrar LMU y la grabación de forma normal y dejar que el artifact
   estabilice;
7. avisar al orquestador sin adjuntar archivos, rutas ni coordenadas.

## Verificación documental

- freeze marker y timestamp cotejados contra el expediente: PASS;
- conteos discovery total/pre-freeze/post-freeze cotejados: PASS;
- ausencia de `Open/Inspect` y de contenido leído: PASS;
- consistencia con `STOP insuficiente` por `< 3`: PASS;
- coherencia con TA-04E `NO-GO`, `local_shape=unknown` y STOP visual TA-04B:
  PASS.
