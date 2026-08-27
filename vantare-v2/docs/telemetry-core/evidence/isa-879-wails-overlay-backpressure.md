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
- `pnpm --dir frontend test`: PASS, 415 archivos y 3139 tests. `happy-dom`
  imprimio un `AbortError` durante teardown, pero Vitest termino en codigo 0;
  los 26 tests focales no reproducen ese aviso.
- `pnpm --dir frontend exec vitest run src/telemetry-transport/overlay-wails-pull.test.ts src/telemetry-transport/contracts.test.ts src/overlay/CompositeApp.test.tsx`: PASS, 26 tests focales.
- `pnpm --dir frontend typecheck`: PASS.
- `pnpm --dir frontend build`: PASS, necesario para materializar el
  `frontend/dist` embebido; conserva el aviso conocido de tamano de chunk.
- ESLint sobre los cinco archivos frontend modificados: PASS. `pnpm --dir
  frontend lint` global conserva un unico error ajeno a ISA-879 en
  `car-damage-numbers-view-model-v2.ts:93` (`_damage` sin usar).
- `git diff --check`: PASS.
- La guardia `TestExportedSymbolsHaveProductionCaller` detecto primero dos
  rutas HTTP exportadas que solo usaba el fixture. `688ce4e0` las hizo privadas;
  la guardia focal y la suite Go serial completa pasan despues del cambio.

## Evidencia Wails real

Se construyo `bin/vantare-isa879.exe` con el frontend productivo y los dos
nombres publicos de Supabase cargados en memoria desde el `.env.local`
autorizado. El preflight mostro solo `SET`; `supabase_build.go` se genero para
el build y se elimino siempre al terminar. No se copio, imprimio ni versiono
ningun `.env*`.

Con LMU abierto y ambas aplicaciones mostrando `Vantare Hub`, se tomaron 21
muestras cada 30 segundos durante 10 min 12 s:

| Build | PID app | PID browser | Privada inicial | Minimo | Maximo | Privada final |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Nightly instalada, cola ya acumulada | 1408 | 5844 | 13.952,3 MiB | 13.952,3 MiB | 13.952,8 MiB | 13.952,8 MiB |
| ISA-879 production, perfil WebView propio | 21080 | 33944 | 38,7 MiB | 37,4 MiB | 38,9 MiB | 37,9 MiB |

El browser ISA-879 no presenta pendiente ascendente. A la tasa del incidente
de 3,24 MiB/s, la ruta anterior habria anadido aproximadamente 1,9 GiB en el
mismo intervalo. Esta medicion acredita **Hub sin consumidor**; no acredita
todavia carga con Overlay activo porque durante la ventana tampoco crecio la
Nightly instalada.

Para inspeccionar sin clics ciegos se construyo ademas
`vantare-isa879-debug.exe` con el gancho canonico
`VANTARE_WEBVIEW_DEBUG_PORT=9229`. Desde el DOM de Hub se abrio el Overlay del
perfil activo: WebView2 expuso dos targets (`#/hub` y `/`) y CompositeApp monto
su diagnostico. Un pull de comprobacion desde la ventana Overlay devolvio HTTP
200 y una sola respuesta dirigida `telemetry:overlay:pulled`, con la ruta
`telemetry:overlay:status`. El status real era `stale`, revision 3 y sin
snapshot; por eso no existe todavia una medicion honesta de payloads bajo
carga. Los procesos de prueba propios se cerraron y relanzaron normalmente;
Vantare instalada y LMU no se cerraron ni modificaron.

La instrumentacion del cliente normal revelo una segunda frontera: en unos 21
s se recibieron 719 respuestas `telemetry:overlay:pulled`, pero tambien 720
ecos globales de la solicitud `telemetry:overlay:pull`. El payload de control
era pequeno, pero `Events.Emit` seguia convirtiendo cada solicitud en
`ExecuteScript` para todas las ventanas, incluido Hub. Por tanto la primera
version acotaba los frames, pero todavia no aislaba por completo el transporte.

El commit `dee06f34` mueve solo solicitud y cierre a `POST` sobre el asset
server interno de Wails (`/_vantare/overlay-telemetry/{pull,close}`). Wails
inyecta el nombre de la ventana solicitante; el backend conserva la respuesta
dirigida, el ack y `latest-wins`. Los tests Go y frontend enfocados, typecheck y
ESLint del diff pasan.

Tras el reinicio de la sesion, una recompilacion productiva se abrio con CDP y
se navego su WebView de Hub a `/`, que monta `CompositeApp`. Es la ruta Wails
real, aunque no sustituye una prueba de ventana Overlay nativa. La sesion de
usuario ya no estaba autenticada y LMU tampoco estaba abierto, por lo que el
status permanecio `stale`. La medicion observable fue:

- 10 s a 120 Hz: 1.200 respuestas dirigidas
  `telemetry:overlay:pulled`, cero ecos globales
  `telemetry:overlay:pull` y cero errores de consola.
- Browser WebView2 PID 21372 durante 2 min: 42,7 MiB privados iniciales,
  49,6 MiB maximos y 47,5 MiB finales. La ruta antigua habria acumulado unos
  389 MiB a 3,24 MiB/s en ese intervalo.
- `POST /close` con la sesion activa: HTTP 204 y cero respuestas posteriores
  durante 1 s.

La build propia oculta PID 984 se cerro al terminar. Como no exponia ventana
principal, `CloseMainWindow` no pudo solicitar cierre normal y se termino solo
ese PID exacto. No habia procesos de Vantare instalada ni LMU despues del
reinicio del usuario.

## Evidencia real pendiente

Los tests anteriores demuestran el protocolo y su limite logico, pero no
demuestran el comportamiento de memoria del proceso WebView2. Antes de aceptar
la correccion hay que ejecutar una build Wails aislada con LMU real y registrar:

1. ~~Hub sin Overlay: memoria privada estable.~~ PASS en production durante
   10 min 12 s. El cero broadcast queda probado por codigo/tests; WebView2 no
   expone un contador directo de `ExecuteScript` en production.
2. ~~Composite Wails activo: cero solicitudes de control por el bus global,
   memoria acotada a 120 Hz y cierre HTTP de la sesion.~~ PASS con status
   `stale`; no equivale a payload LMU real ni a ventana Overlay nativa.
3. Overlay nativo con LMU nuevamente `live`: una entrega maxima en vuelo y
   crecimiento de memoria acotado bajo carga real.
4. Cierre de la ventana Overlay nativa: publisher v2 y sesion liberados. El
   contrato automatizado y el cierre HTTP real pasan; falta observar la ventana.

No hay todavia push, PR, CI remoto, merge, promocion o release.
