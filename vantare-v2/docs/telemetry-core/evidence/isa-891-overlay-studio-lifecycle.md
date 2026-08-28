# ISA-891 — transporte dirigido de Studio y lifecycle Overlay V2

Fecha: 2026-08-28.

Base: `origin/nightly@741d31bf76740a469b4d91ff21da6817e912db30`.

Rama: `vantareapp/isa-891-overlay-v2-studio-lifecycle`.

## Problemas confirmados

La auditoría previa a retirar Overlay V1 encontró cinco huecos concretos:

- Desktop consumía V1 y V2 mediante el pull HTTP acotado de ISA-879, pero
  Studio seguía registrando la proyección V1 en el bus global de Wails.
- Overlay V2 solo publicaba desde `WriteBatch`. Una transición de lifecycle sin
  un frame posterior no llegaba y una ventana que se registraba tarde no podía
  recuperar el estado actual.
- Un pull sin cambios respondía inmediatamente con `events: []`. Studio volvía
  a pedir en el siguiente turno y alcanzó 1.744 requests en 15 segundos cuando
  la fuente estaba stale, aunque seguía existiendo una única petición en vuelo.
- Al cambiar Mock -> Live sin remontar Studio, el store conservaba la revisión
  alta de la sesión anterior. El primer status retenido de la sesión nueva
  podía tener una revisión menor y era rechazado como contrato regresivo.
- Si una respuesta HTTP se perdía después de preparar el delivery, el retry con
  el ack anterior recibía 204 indefinidamente: el servidor ya había avanzado su
  cursor pero no conservaba la entrega pendiente para retransmitirla.
- Una generación Studio retirada podía enviar tarde otro `ack:0`, sustituir la
  sesión actual y dejarla recibiendo 204; status y snapshot V2 también podían
  reservar revisiones en un orden y publicarlas en el contrario.
- JSON inválido, una excepción síncrona o un fetch local que nunca resolvía
  dejaban `awaiting=true` sin retry. Studio además observaba el store V2 a toda
  cadencia aunque todas las flags V2 siguieran apagadas.

El segundo hueco también permitía cualquier string como `source.state` en la
frontera TypeScript. Al cerrarla aparecieron dos literales inválidos que el
typecheck anterior no podía detectar: `detected` y `missing`.

## Corte implementado

El registry V2 retiene exclusivamente el último status JSON y su revisión. No
crea un publisher sin consumidor, no retiene frames y exige revisiones
monótonas. Al registrarse el primer consumidor, el publisher recibe ese status
antes de empezar a entregar snapshots. El runtime publica cada cambio canónico
`stopped/detecting/connecting/live/degraded/stale/error/stopping` como un
`OverlayUpdateV2` sin frame.

Go declara y valida el conjunto cerrado; el generador produce
`OverlaySourceStateV2` y el decoder frontend rechaza cualquier otro valor.

Studio registra V2 y el adapter V1 sobre una misma fuente local, y solo después
inicia una única sesión `/_vantare/overlay-telemetry/pull`. Parar la preview
cierra la sesión, detiene V1 y retira los listeners V2 de forma idempotente. El
estado V2 cruza el provider de Studio como `WidgetRuntimeInput` puro hasta el
`WidgetVisualHost` compartido. Las flags V2 siguen apagadas por defecto: este
corte no cambia la autoridad visual ni retira V1.

Cuando no hay eventos, Go responde sin crear una entrega ni avanzar el ack. El
cliente mantiene `single-in-flight`, espera 16 ms durante actividad, pasa a
100 ms tras tres respuestas vacías y reintenta errores a 250 ms. Se probó y
descartó mantener abierta la petición hasta un cambio: el asset server Wails
serializa esa ruta con otras llamadas de la ventana, por lo que el corte final
no añade goroutines, channels ni requests retenidas.

Cada nueva sesión dirigida de Studio reinicia exclusivamente el cursor y los
diagnósticos del store V2 antes de registrar listeners. Así una revisión de una
sesión anterior no contamina la siguiente; el store y el contrato siguen siendo
los mismos y no aparece una segunda fuente de verdad.

El transporte conserva además una sola respuesta pendiente hasta recibir su
ack. Un retry con el ack anterior reproduce exactamente ese delivery; al
confirmarlo, las observaciones intermedias siguen colapsándose al último estado.
No se introduce una cola ni se duplica la revisión lógica.

La revisión adversarial final cerró los cuatro huecos anteriores sin ampliar la
arquitectura. Cada sender recuerda como máximo 32 ids retirados, de modo que una
petición tardía no puede tomar la sesión actual y la memoria sigue fija. La
proyección pesada queda fuera del lock, pero refresh de source, asignación de
revisión y publicación se hacen en la misma frontera crítica. El cliente
reintenta respuestas inválidas y excepciones a 250 ms y aborta un fetch local a
los cinco segundos. Con flags V2 vacías, Studio sigue ingiriendo para el corte
shadow pero no se suscribe al store ni propaga sus paints a React.

## Regresiones deterministas

- status V2 sin consumidor no activa el publisher de frames;
- un consumidor tardío recupera el último status, sin snapshot inventado;
- una revisión regresiva es rechazada;
- el pull entrega el status retenido aunque nunca haya existido `WriteBatch`;
- un estado desconocido falla en proyección Go y en el decoder TypeScript;
- V1 y V2 se registran antes de abrir la única sesión pull de Studio;
- start/stop repetidos y reinicio no duplican sesión ni listeners;
- un fallo al arrancar V1 revierte todos los listeners;
- bajo StrictMode y una respuesta pull que nunca termina hay exactamente una
  petición en vuelo, un solo cierre y cero eventos globales de proyección;
- una respuesta sin eventos no crea delivery ni avanza el ack, y el siguiente
  cambio se recoge con el mismo cursor;
- el cliente aplica pacing activo, backoff idle y retry de error sin abrir una
  segunda petición;
- una respuesta HTTP perdida se retransmite con el mismo delivery y, tras el
  ack, el siguiente delivery contiene solo los snapshots más recientes;
- una sesión retirada no puede sustituir ni cerrar la generación actual;
- una transición de lifecycle durante una proyección bloqueada se publica antes
  que el snapshot, y este recibe una revisión posterior y el source vigente;
- respuesta inválida, excepción síncrona y fetch colgado recuperan el pull con
  pacing y sin una segunda petición en vuelo;
- Studio no se suscribe a paints V2 mientras su lista de features está vacía;
- una sesión Studio nueva acepta su primera revisión aunque la anterior hubiese
  terminado con una revisión superior;
- el runtime V2 puro llega al único `WidgetVisualHost` de Studio.

## Evidencia local del corte

- Commits funcionales: `6bd72d37398dfb6eaed80fbfdfdbe57bc61ff47e`,
  `f6269aaf1a6b71b0ac3c17589d00ec0ea1b4e5c2` y
  `274b632d5e0ae4476a45059971599cb79cc977e3`; recuperación de
  respuestas perdidas: `0966f44c29783eadb0e0ee2013ea80c41500b864`;
  cierre de carreras final: `f652e67f`; sincronizaciones de la base Nightly:
  `e0b6a18f` sobre `d9909aef` y `ad1397d8` sobre
  `origin/nightly@1c45cc82`; estabilización de la espera asíncrona del test
  Studio: `9eb2535b`.
- Paquetes Go `overlayv2`, `telemetrytransport` y `internal/app`: PASS.
- Tests frontend enfocados: PASS, 6 archivos y 78 tests.
- `go test ./...`: PASS.
- Suite frontend completa final: PASS, 421 archivos y 3.184 tests. `happy-dom`
  imprimió el `AbortError` conocido durante teardown; Vitest terminó con código
  0.
- `pnpm --dir frontend typecheck`: PASS.
- `pnpm --dir frontend build`: PASS.
- ESLint sobre todos los TS/TSX del diff: PASS. El lint global conserva una
  deuda ajena al diff (`_damage` sin usar en
  `car-damage-numbers-view-model-v2.ts`, commit `a1785c8ea`).
- `go run ./tools/telemetry-contract-gen -check`: PASS.
- `go test -race ./internal/app/telemetrytransport`: PASS.
- Tests de roadmap: PASS, 23.
- Tests de comunicaciones/changelog: PASS, 64; release notes: PASS, 26.
- `wails3 task windows:build` con canal `nightly`: PASS. El generador temporal
  de configuración se ejecutó en la tarea canónica y eliminó
  `cmd/vantare/supabase_build.go` al finalizar; no quedó diff generado.
- `git diff --check`: PASS.
- CI remoto del HEAD revisado `df629d3a`: PASS, run `33134533397`; gate
  bloqueante Vantare, ruta de promoción y GitGuardian terminaron verdes.

## Revisiones previas al PR

1. **Concurrencia y rendimiento:** `OverlayPullTransport` mantiene un mapa
   acotado por ventana, una única respuesta pendiente por sesión y no crea
   goroutines. El orden de locks es transporte -> Hub/registry/publisher y no se
   encontró un camino inverso. El race detector, pérdida/retry/ack,
   latest-wins, cierre tardío y límite single-in-flight pasan.
2. **Arquitectura y autoridad:** Studio, Desktop y OBS comparten el mismo
   transporte dirigido; Studio entrega `WidgetRuntimeInput` puro al único
   `WidgetVisualHost`. No hay acceso a Wails, persistencia ni tipos LMU en los
   widgets añadidos. V1 sigue siendo la autoridad explícita detrás de las flags;
   este PR no adelanta el cutover de #893.
3. **Preparación para retirar V1:** la búsqueda estática confirma consumidores
   V1 en visibilidad, layout, histories y varios view-models. Están dentro del
   alcance ya registrado en #893 y no pueden borrarse aún. La revisión descubrió
   además el cleanup irreversible de StrictMode/remount en Desktop, OBS y
   Studio, registrado en #896. #892, #893 y #896 deben cerrarse antes del gate
   real y la retirada de #894.
4. **Revisión independiente Fable 5:** thread T3 Code
   `556f9ac3-513c-4bd7-a194-6064baaa615d`, modelo
   `claude-fable-5`, veredicto `ACCEPT WITH FINDINGS`, sin P0/P1. Los cuatro P2
   fueron reproducidos y corregidos; los P3 se repartieron entre los gates ya
   existentes #893, #894 y #896. La revisión confirmó que este corte no está
   sobreingenierado: no añade goroutines, channels, colas ni dependencias.

## Prueba LMU/Wails real

La build aislada `vantare-isa891-debug5.exe`, generada por la tarea canónica
con canal Nightly y configuración pública embebida solo en memoria, se abrió en
Studio Live contra LMU Practice. Pintó `PRACTICE`, 18 participantes, Isaac
Albala P18 en boxes, Standings completo y el player en Relative. Delta se
mantuvo explícitamente no disponible porque LMU no aportaba una referencia
válida en ese momento; no se inventó un fallback.

La ventana usó una sola fuente pull para V1 y V2. Una muestra Live de cinco
segundos recibió 190 respuestas, todas con la proyección V1 y el snapshot V2,
`source.state=live` y frame presente. Un ciclo Mock -> Live posterior recibió
103 respuestas en tres segundos, siempre con máximo una petición en vuelo, sin
`invalid-contract:revision` ni errores de consola. En Mock hubo cero requests
pull, acreditando que el consumidor se cerró.

En una observación continua de 30 segundos hubo 1.080 requests y 1.079
respuestas, siempre `maxInFlight=1`. Los Private Bytes del proceso browser
WebView2 se mantuvieron aproximadamente entre 39,6 y 41,5 MiB; el renderer
osciló entre 146,6 y 226 MiB y volvió a ~154 MiB tras GC. Es una comprobación
corta de acotación y continuidad, no el soak prolongado requerido para borrar
V1.

## Límites de esta evidencia

La prueba real acredita este corte y elimina el bloqueo de validación de
ISA-891, pero dura 30 segundos y no acredita por sí sola estabilidad prolongada
ni la retirada de V1. ISA-894 mantiene cinco sesiones LMU de al menos 20 minutos
(una con más de 40 coches), memoria acotada y cero consumidores V1 como puertas
de borrado. Promover V2 a autoridad y corregir Relative pertenecen a ISA-893 e
ISA-892. La revisión también abrió ISA-896: Desktop, OBS y Studio deben corregir
su lifecycle irreversible bajo StrictMode/remount antes del cutover y de
retirar V1; el PR parcial #857 no está integrado en Nightly.
