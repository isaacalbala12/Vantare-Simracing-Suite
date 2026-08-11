# Archivo de planes detallados

Este directorio conserva planes de ejecución y su razonamiento. No es un
backlog ni una fuente de estado. Encontrar un archivo aquí no autoriza
ejecutarlo.

## Estados permitidos

- `Plan status: historical`: snapshot cerrado; nunca autoriza ejecución.
- `Plan status: conditional`: solo puede ejecutarse cuando una issue de Linear
  enlaza ese path exacto.

No existe `active` dentro del repositorio: Linear posee issue, prioridad,
estado, alcance, dependencias, rama, base y destino. Git/GitHub demuestran el
estado observado. Si un plan contradice esas fuentes, la instrucción embebida
queda sustituida aunque aparezca más abajo o parezca más reciente.

Las menciones a `docs/current-plan.md`, `develop` y `refactor` dentro de planes
históricos son procedencia, no instrucciones actuales. El flujo vigente es
`rama de issue -> nightly -> testers -> master`.

## Contrato para planes nuevos

1. Empieza con `Plan status: conditional`.
2. Identifica objetivo, fronteras, dependencias, checks y rollback.
3. No copia estado, rama ni base: enlaza la issue que los posee.
4. Declara el handoff y los contratos aplicables.
5. Al cerrar, conserva el archivo como `historical`; no acumula un tracker.

Consulta [`docs/README.md`](../../README.md) para elegir el proyecto y
[`source-ownership.md`](../../vantare-program/source-ownership.md) para resolver
autoridad.
