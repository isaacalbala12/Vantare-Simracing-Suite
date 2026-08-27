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
- Contrato de roadmap: PASS, 21 tests.
- Generador/digest de roadmap: PASS, 23 tests.

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

El monitor CDP sobre las respuestas `POST /pull` observo 3.142 entregas y
2.498 proyecciones en 45 segundos. El cursor avanzo de epoch 1 / secuencia
24.140 a epoch 1 / secuencia 26.983, aproximadamente 63 proyecciones por
segundo, mientras el DOM continuo en `ready` con 18 filas.

Esto acredita build, Wails, pull dirigido, LMU Live y render actual.

## Reconnect real sin recargar

La misma ventana Overlay permanecio abierta al cerrar y volver a arrancar LMU.
Antes del reinicio, epoch 1 alcanzo la secuencia 166.097 y el status revision 4
paso a `stale` con `reconnectAttempt=0`. LMU volvio como un proceso nuevo, PID
980, iniciado el 2026-08-28 a las 00:20.

Sin recargar ni reabrir Vantare, el mismo target Overlay empezo a recibir epoch
2. La primera proyeccion observada por CDP fue la secuencia 2.290, no la 1, y en
30 segundos avanzo hasta la 4.203: 1.656 proyecciones dentro de 1.943 entregas
pull. Es exactamente la condicion que el store anterior rechazaba de forma
permanente.

El DOM adopto la nueva sesion y continuo pintando:

- `PRACTICE` con 05:58:40 restantes;
- Relative y Standings en estado `ready`;
- 18 participantes y `Isaac Albala` en P10;
- controles activos, con throttle al 100 % en la muestra.

No se envio ningun reload a la WebView. La prueba acredita el recorrido real
LMU -> Go -> pull Wails -> store -> ViewModels -> widgets despues de un salto
de epoch cuyo primer snapshot visible tenia `sequence > 1`.

Commit funcional: `57c7610900fa175979183c1d088a50cf72f69d2c`.

La rama esta publicada y el PR draft #890 apunta a `nightly`. El run oficial
`33119149474` termino completamente verde sobre `4635ded4`: topologia y
roadmap, frontend build, contrato TypeScript, Go, frontend, lint del diff,
visual gate y build Wails de Windows. No hay merge, promocion ni release.
