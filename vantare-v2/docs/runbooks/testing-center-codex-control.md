# Testing Center — control durable de Codex

Estado: TAU-06F / ISA-231 implementado como adapter y dry-run. No existe
endpoint desplegable, credencial, llamada a Codex, checkout, comando, red,
write, rama, PR, workflow o promoción.

## Evidencia server-only

`testing_center_load_codex_evidence(...)` solo puede ejecutarse con
`service_role`. Carga la issue, el reporte, el payload y el registro de
evidencia persistidos; exige una issue abierta en `queued`, consentimiento,
digest y tamaño de transporte, y vuelve a validar el shape antes de proyectar.

La proyección canónica conserva exclusivamente canal, SO, arquitectura,
módulo, presencia de error y offset/source/level de logs consentidos. Acción,
esperado, observado, contexto, mensajes, códigos y demás strings libres no
salen. El digest de transporte original se conserva como procedencia; el
digest de evidencia cubre los bytes canónicos derivados en PostgreSQL.

PostgreSQL `jsonb` no conserva los bytes originales. Por eso este corte añade
`diagnostic_transport_size` y envuelve la RPC de envío para guardarlo desde el
string exacto recibido. Las filas antiguas sin tamaño no se reconstruyen ni se
adivinan: fallan cerradas hasta una nueva entrega idempotente del payload
original o una decisión del owner.

## Base exacta

El servicio recibe de un puerto confiable un snapshot cerrado con el head de
`nightly` y sus SHAs ancestros. El propio servicio valida formato, unicidad,
pertenencia del head y pertenencia del SHA solicitado; después genera y liga
el proof digest al request durable. Un booleano aportado por el adapter no es
aceptado.

Este corte no implementa el adapter que consulta Git/GitHub porque el acceso a
repo y red continúa prohibido. TAU-07 solo podrá conectarlo mediante una
implementación server-owned que devuelva el grafo real; datos de app, tester o
GitHub Issue no son autoridad.

## Claim, lease y fencing

Existe una única fila automática por issue y solo el intento 1. El claim toma
un advisory lock global, comprueba pausa global/flow y concede un lease de
10–300 segundos. Dos workers concurrentes convergen en un `claimed` y un
`global_busy`; recuperar un lease expirado incrementa el fencing token. Claim
y permiso vuelven a exigir que la issue permanezca `open/queued`.

Antes del futuro efecto externo, `testing_center_authorize_codex_dispatch(...)`
revalida lease, worker, fence y pausa dentro de la misma transacción. Un lock
de tabla ordena esa lectura respecto a inserts/updates concurrentes de pausa.
Al
autorizar incrementa `dispatch_count` a uno y deja el estado `dispatching`.
Ese estado nunca se reclama automáticamente.

- respuesta cerrada: `completed` y digest de respuesta;
- respuesta ambigua: `needs_owner`, sin retry;
- fallo antes de dispatch: `failed`, cero dispatches;
- caída después del permiso: permanece `dispatching` hasta reconciliación
  humana futura.

Esta elección prioriza no duplicar una ejecución sobre disponibilidad. Una
pausa tardía detiene el flujo mientras aún no se haya emitido el permiso; no
puede deshacer un efecto ya iniciado.

## Gates

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  supabase/tests/run-testing-center-codex-control-postgres.ps1

deno test --no-lock `
  supabase/functions/_shared/testing-center-codex-evidence.test.ts `
  supabase/functions/_shared/testing-center-codex-control.test.ts `
  supabase/functions/_shared/testing-center-codex-dry-run.test.ts
```

El gate PostgreSQL ejecuta 61 pruebas, rollback, reaplicación y una carrera
real de dos procesos. Rollback: aplicar
`20260802180000_testing_center_codex_control.down.sql`; los estados nuevos se
conservan como `failed` antes de restaurar el contrato anterior.

Siguiente gate: TAU-06G reaudita de forma independiente privacidad, scope,
base, lease, fencing, pausa, restart y ambigüedad. TAU-07 sigue en NO-GO hasta
un veredicto explícito favorable.
