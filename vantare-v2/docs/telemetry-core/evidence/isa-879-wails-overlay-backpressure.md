# ISA-879 — transporte Overlay acotado en la frontera Wails/WebView2

Fecha: 2026-08-27.

Base vigente: `origin/nightly@c1d4dfa4bcd233df3ea4e15aaa5cc23aeef31e9b`.
El diagnostico original se realizo en su ancestro
`a02a1463de59c64389c6815c859425af08133833`.

Rama: `vantareapp/isa-879-wails-telemetry-bounded`.

## Incidente reproducido

Con LMU en practica y Vantare mostrando solo Hub, el proceso browser de
WebView2 crecio de aproximadamente 9,3 a 11,4 GB privados durante el
diagnostico. El renderer React se mantuvo en aproximadamente 197 MB.

La medicion del flujo global fue:

- Overlay v1: aproximadamente 2,68 MiB/s, con payloads cercanos a 62 KB.
- Overlay v2 shadow: aproximadamente 0,56 MiB/s, con payloads cercanos a 9 KB.
- Total: aproximadamente 3,24 MiB/s, compatible con unos 10 GB acumulados en
  50 minutos.

La proteccion `latest-wins` existente estaba antes de Wails. Los bridges v1 y
v2 se suscribian al arrancar la aplicacion aunque no hubiera Overlay, llamaban
al `Event.Emit` global y cada frame terminaba en un `ExecuteScript` asincrono
por ventana. La cola sin limite quedaba despues de la ultima proteccion.

## Corte implementado

Los commits `68ae7eae` y `e1069c7f` realizan un cambio local en esa frontera:

1. `TelemetryCoreRuntime` deja de arrancar los bridges Wails globales de
   Overlay v1 y v2. Strategy conserva su adapter explicito sin cambios.
2. La ventana Overlay abre una sesion de demanda/acuse. Go solo responde a la
   ventana que hizo la peticion mediante `DispatchWailsEvent`, sin pasar la
   respuesta por `Event.Emit`.
3. El siguiente request nace en JavaScript despues de ejecutar y procesar la
   respuesta anterior. Por tanto solo puede existir una entrega pendiente.
4. Durante la espera, Go no encola frames: lee el ultimo status/snapshot
   retenido por v1/v2 y omite payloads que no cambiaron.
5. V1 y v2 viajan juntos en una unica respuesta. El publisher v2 solo existe
   mientras haya una sesion Overlay y se libera al desmontar o cerrar la
   ventana.
6. Se eliminan el bridge publisher Wails y el request de replay v2 ya sin
   consumidores productivos; no queda un camino global de compatibilidad.

No se ha anadido dependencia, bus alternativo, fork de Wails ni cambio en el
driver LMU o en los contratos de producto.

## Regresion determinista

`TestOverlayPullSlowConsumerKeepsOneDeliveryInFlightAndLatestWins` mantiene sin
acusar la entrega 1, publica secuencias/revisiones 2 a 100 y comprueba que:

- las peticiones duplicadas no producen otra entrega;
- al acusar la entrega 1 solo se recibe la secuencia/revision 100;
- no aparecen los estados 99;
- el publisher v2 esta inactivo antes de la sesion y se libera al cerrarla.

La integracion cubre ademas:

- cero eventos y cero suscriptores Overlay en el emisor Wails global;
- una sola llamada dirigida a la ventana solicitante;
- cierre nativo como fallback de cleanup;
- paridad byte a byte entre SSE y los eventos v1 obtenidos por pull;
- nombres del protocolo compartidos por la fixture Go/TypeScript;
- CompositeApp sin listeners directos a los cinco eventos de telemetria.

## Gates del corte funcional

- `go test -p 1 ./... -count=1 -timeout=180s`: PASS. Dos pasadas previas con
  concurrencia maxima agotaron timeouts fijos en `voiceinput` y en una
  integracion LMU mientras Solver consumia CPU; ambos pasaron aislados y la
  suite serial completa confirma el arbol verde sin cambiar esos tests.
- `pnpm --dir frontend test`: PASS, 411 archivos y 3095 tests.
- `pnpm --dir frontend exec vitest run src/telemetry-transport/overlay-wails-pull.test.ts src/telemetry-transport/contracts.test.ts src/overlay/CompositeApp.test.tsx`: PASS, 26 tests focales.
- `pnpm --dir frontend typecheck`: PASS.
- `pnpm --dir frontend build`: PASS previo, necesario para materializar el
  `frontend/dist` embebido; conserva el aviso conocido de tamano de chunk.
- ESLint sobre los cinco archivos frontend modificados: PASS. `pnpm --dir
  frontend lint` global conserva un unico error ajeno a ISA-879 en
  `car-damage-numbers-view-model-v2.ts:93` (`_damage` sin usar).
- `git diff --check`: PASS.

## Evidencia real pendiente

Los tests anteriores demuestran el protocolo y su limite logico, pero no
demuestran el comportamiento de memoria del proceso WebView2. Antes de aceptar
la correccion hay que ejecutar una build Wails aislada con LMU real y registrar:

1. Hub sin Overlay: cero payloads Overlay hacia WebView2 y memoria privada
   estable.
2. Overlay activo: una entrega maxima en vuelo y crecimiento de memoria
   acotado bajo carga real.
3. Cierre del Overlay: publisher v2 y sesion liberados.

No se ha cerrado ni modificado la instancia de Vantare o LMU usada para el
diagnostico. No hay todavia push, PR, CI remoto, merge, promocion o release.
