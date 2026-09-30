# ISA-1265 · T15a2a inputs recorded exactos

## Resultado local

El nuevo comando `get_revision_planning_inputs` recibe una combinación, un
instante y referencias completas de Analysis. Es una consulta: obtiene la
versión actual para correlación, reutiliza `ProjectStrategyRevisionInputs` y
devuelve `PlanningInputs` sin crear o editar un Event.

La validación compartida exige que la proyección sea válida y conserve el
instante canónico, la combinación y el conjunto exacto de revisiones. El
cliente TypeScript vuelve a comprobar la respuesta contra la selección
congelada. Una respuesta ausente, parcial, duplicada o sustituida no produce
inputs utilizables.

## Límites

- No se calcula ni cancela una estrategia y la pestaña Plan sigue intacta.
- El delta estimado entre pilotos aún queda anulado por la precedencia actual
  del ritmo proyectado; T15a2b debe resolverlo en Go.
- El modo libre temporal sigue bloqueado hasta que T15a2c lleve la condición de
  finalización al solver.
- No se abrió la app ni se ejecutaron Wails, LMU o DuckDB.

## Verificación

El RED inicial no compilaba porque no existían operación, comando ni servicio.
Los tests focales cubren transporte, selección exacta, ausencia de Event,
respuesta parcial/sustituida, duplicados y cero escrituras: el paquete Go de
aplicación y 3 archivos/90 tests frontend pasan. También pasan frontend
completo (450 archivos, 3.870 tests), typecheck, lint, auditoría i18n, build,
Go global y 259 checks documentales. El build conserva el aviso heredado de
chunks superiores a 500 kB.
