# ISA-889 — resincronizacion de epochs saltados en Overlay

Fecha: 2026-08-27.

Base: `origin/nightly@2672f21173fdd295c667b44f4903816561f6b3d5`.

Rama: `vantareapp/isa-889-overlay-epoch-resync`.

## Incidente reproducido

LMU seguia produciendo telemetria y el backend de Vantare seguia publicando
status y proyecciones. La ventana Overlay, sin embargo, quedaba congelada y no
volvia a pintar frames hasta recargar su WebView.

La reproduccion real mostro el cambio de epoch 4 a 5 con
`reconnectAttempt=1`. El transporte acotado de ISA-879 es `latest-wins`, por lo
que el primer frame que ve el navegador despues de un cambio de epoch no tiene
por que ser la secuencia 1. `createProjectionTransportStore` rechazaba todo
epoch nuevo salvo `sequence=1`; como conservaba el cursor del epoch anterior,
los frames 2, 3 y siguientes tambien quedaban rechazados. Recargar la ventana
creaba un store sin cursor y recuperaba inmediatamente la misma sesion LMU.

El fallo estaba en la validacion del transporte compartido, no en el driver
LMU, la proyeccion Go ni un widget concreto.

## Corte implementado

Una proyeccion completa de un epoch estrictamente mayor pasa a ser una nueva
base valida aunque su secuencia sea mayor que 1. El store la acepta y registra
`snapshot-resync` con el epoch y la secuencia observados.

Se mantienen las protecciones existentes:

- un epoch menor sigue siendo `snapshot-regression`;
- una secuencia menor dentro del mismo epoch sigue siendo regresion;
- un duplicado contradictorio sigue siendo regresion;
- un salto dentro del mismo epoch sigue aceptandose como snapshot completo y
  queda diagnosticado como `snapshot-resync`;
- el `statusRevision` debe seguir coincidiendo antes de aceptar la proyeccion.

No se anade fallback, estado paralelo, dependencia ni conocimiento de LMU a
los widgets. El cambio pertenece a la frontera neutral al simulador y beneficia
a cualquier driver que publique el mismo contrato versionado.

## Regresion determinista

El test parte de epoch 1 / secuencia 40 y revision de status 1. Despues publica
status revision 2 y entrega directamente epoch 2 / secuencia 7, reproduciendo
el frame inicial que `latest-wins` puede omitir. Antes del cambio fallaba con
`telemetry-transport:snapshot-regression`; despues:

- el snapshot aceptado queda en epoch 2 / secuencia 7;
- el payload nuevo sustituye al anterior;
- aparece el diagnostico `snapshot-resync` con esos cursores.

## Gates locales

- Test rojo previo: 1 fallo esperado y 12 tests verdes en `store.test.ts`.
- `store.test.ts`: PASS, 13/13.
- Suite focal de transporte/proyeccion: PASS, 5 archivos y 26 tests.
- `pnpm --dir frontend test`: PASS, 417 archivos y 3.143 tests. `happy-dom`
  imprimio el `AbortError` conocido durante teardown, pero Vitest termino con
  codigo 0.
- `pnpm --dir frontend typecheck`: PASS.
- `pnpm --dir frontend build`: PASS; conserva el aviso conocido de chunk
  grande.
- ESLint sobre los dos archivos TypeScript modificados: PASS.
- `git diff --check`: PASS.

## Evidencia Wails y LMU real

Se genero una build diagnostica aislada con el frontend productivo y las dos
variables publicas autorizadas cargadas en memoria desde el `.env.local`
canonico. El preflight mostro solo `SET`; `supabase_build.go` se elimino en el
`finally` y no se copio, imprimio ni versiono ningun `.env*`.

La instancia `vantare-isa889-debug.exe` se abrio en HTTP 39263 y CDP 9231 sin
cerrar LMU ni las otras dos aplicaciones Vantare. Desde el Hub se abrio la
ventana Overlay nativa. Su DOM mostro telemetria LMU activa:

- sesion `PRACTICE` con tiempo restante;
- 18 participantes en Standings;
- Relative en estado `ready`, anclado en `Isaac Albala`;
- pedales con freno al 100 % en la muestra;
- backend `/health` en HTTP 200.

Esto acredita build, Wails, pull dirigido, LMU Live y render actual. La prueba
exacta de cambio de epoch sin recargar la ventana queda pendiente de salir y
volver a entrar en sesion mientras esta misma instancia permanece abierta; no
se sustituye esa evidencia por un mock ni por el test unitario.

Commit funcional: `57c7610900fa175979183c1d088a50cf72f69d2c`.

No hay push, PR, CI remoto, merge, promocion ni release en el momento de esta
captura.
