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

Los commits `68ae7eae`, `e1069c7f`, `dee06f34` y `21af8511` realizan un
cambio local en esa frontera:

1. `TelemetryCoreRuntime` deja de arrancar los bridges Wails globales de
   Overlay v1 y v2. Strategy conserva su adapter explicito sin cambios.
2. La ventana Overlay abre una sesion de demanda/acuse por el asset server
   interno. Go devuelve el JSON solo en la respuesta HTTP de esa ventana; no
   usa `Event.Emit`, `DispatchWailsEvent` ni `ExecuteScript` para los frames.
3. El siguiente request nace despues de recibir y procesar el cuerpo anterior.
   Por tanto solo puede existir una peticion/entrega pendiente.
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
- una sola respuesta HTTP a la ventana solicitante;
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

## Prueba nativa con LMU y correccion de la frontera restante

Con LMU 1.4130 abierto en practica y una ventana Overlay nativa, la primera
version dirigida demostro que el aislamiento entre ventanas era correcto pero
que `ExecuteScript` seguia siendo una frontera inadecuada para los payloads:

- durante 106,65 s, Overlay recibio 6.590 frames v1 y 6.591 v2; la secuencia v1
  avanzo de 8.907 a 15.725;
- v1 midio 61.689--62.000 bytes y v2 9.422--9.607 bytes; Hub recibio cero
  frames Overlay, cero respuestas pull y cero ecos globales;
- en un renderer Overlay nuevo y sin instrumentacion, memoria privada paso de
  538,3 MiB a 2.370,1 MiB en 2 min, mientras browser fue 51,6 -> 58,1 MiB y Hub
  81,6 -> 82,0 MiB;
- descartando v2 antes de sus consumidores, el renderer aun paso de 390,9 a
  2.142,9 MiB en 2 min: el shadow no era la causa principal;
- descartando todos los eventos justo antes de los listeners, pero dejando que
  Wails construyera el mismo `ExecuteScript`, el heap usado alcanzo 734,2 MiB.
  `HeapProfiler.collectGarbage` lo redujo a 7,2 MiB y el proceso a 70,6 MiB.

No era una retencion permanente de React: era presion extrema de asignacion al
compilar y materializar el JSON grande como JavaScript; WebView2 aplazaba el GC
hasta que el proceso ya ocupaba gigabytes. El ack evitaba la cola asincrona,
pero no eliminaba esa conversion.

El commit `21af8511` mantiene el mismo endpoint, ack, `single-in-flight`,
`latest-wins` y cierre por ventana, pero devuelve `OverlayPullResponse` en el
cuerpo JSON del `POST /pull`. El cliente espera `fetch` y procesa ese cuerpo
antes de pedir el siguiente turno. Ya no existe evento
`telemetry:overlay:pulled`, `DispatchWailsEvent` ni `ExecuteScript` para frames.

Una build diagnostica nueva, con frontend recompilado y la configuracion
publica autorizada embebida, mantuvo una ventana Overlay nativa durante 10 min
01 s, 21 muestras a intervalos de 30 s, sin wrapper ni GC forzado:

| Proceso | PID | Inicial | Minimo | Maximo | Final |
| --- | ---: | ---: | ---: | ---: | ---: |
| Browser WebView2 | 22788 | 50,4 MiB | 50,4 MiB | 69,8 MiB | 64,1 MiB |
| Renderer Overlay | 22584 | 101,5 MiB | 101,5 MiB | 111,1 MiB | 109,4 MiB |
| Renderer Hub | 13796 | 61,1 MiB | 60,3 MiB | 62,7 MiB | 61,1 MiB |

Los dos targets nativos permanecieron activos y LMU siguio abierto en todas
las muestras. Al pulsar `Detener overlay`, el target `/` desaparecio, el
renderer 22584 termino y LMU siguio abierto; el contrato automatizado confirma
ademas que el cierre libera la sesion y el publisher v2.

El gate opt-in del reader LMU paso con `runtime state="live"` y
`player-present=true`, y Strategy observo fuente `live`, fuel 98/115. La
proyeccion de la ventana Overlay permanecio honestamente `stale` porque el
fast frame de la practica estaba detenido/pausado. Por tanto esta prueba
acredita LMU real, jugador presente, payload completo y memoria acotada, pero
no se presenta como una sesion Overlay en fase `live` sostenida.

Gates frescos del commit HTTP:

- `go test -p 1 ./... -count=1 -timeout=180s`: PASS;
- `pnpm --dir frontend test`: PASS, 415 archivos y 3.139 tests; conserva el
  `AbortError` conocido de teardown y termina con codigo 0;
- 26 tests frontend focales, typecheck, build y ESLint del diff: PASS;
- gates opt-in LMU reader y Strategy: PASS con fuente real y jugador presente.

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
3. Overlay nativo con LMU real y payload completo: memoria acotada durante
   10 min 01 s. Falta repetir con el fast frame sin pausar para que la propia
   proyeccion Overlay permanezca en fase `live`.
4. ~~Cierre de la ventana Overlay nativa: publisher v2 y sesion liberados.~~
   PASS observable para target/renderer y PASS automatizado para
   sesion/publisher.

La rama esta publicada y el PR draft #883 apunta a `nightly`. El commit local
`21af8511` contiene la correccion HTTP final y aun debe publicarse con esta
evidencia. El primer HEAD
publicado `65f26ad0` termino `CLEAN` con `Validate promotion path`, `Validate
Vantare blocking gates` y GitGuardian en verde (run `33071928618`). No hay
merge, promocion ni release; la aceptacion sigue condicionada a la prueba LMU
`live` descrita arriba.
