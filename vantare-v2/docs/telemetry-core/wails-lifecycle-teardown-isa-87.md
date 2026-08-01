# ISA-87 / TC-09E — Wails, lifecycle y teardown

Fecha: 2026-08-01

Rama: `vantareapp/isa-87-tc-09e-harness-wails-lifecycle-y-teardown-completo`

Base exacta: ISA-116 `b53078707d45db7b7c9adcd77306a4f9d8a4f703`

Estado: implementación cerrada técnicamente; sin merge ni promoción.

## Objetivo

Cerrar el hueco observado en ISA-24: demostrar dinámicamente el payload que
atraviesa Wails, correlacionarlo con SSE y probar el cierre de los owners del
runtime sin aceptar `process exited` como evidencia suficiente.

No se cambia el contrato de telemetría, el diseño de Overlay, los monitores de
Engineer ni la persistencia histórica. El harness es no productivo.

## Resultado

### Paridad Wails / SSE

`TestTelemetryLifecycleHarness` crea una aplicación Wails real con un
transporte de captura no productivo que implementa la frontera oficial
`WailsEventListener`. El recorrido probado es:

1. `TelemetryCoreRuntime` publica status y Overlay Projection v1 en su `Hub`.
2. `ServeWails` entrega el evento mediante el `wailsEmitter` productivo y el
   procesador de eventos real de Wails.
3. El servidor HTTP productivo expone el mismo Hub mediante SSE loopback.
4. El harness captura ambos lados y exige igualdad byte a byte para status y
   proyección.

El cursor verificado es `projectionVersion=1`, `epoch=2`, `sequence=8` y
`statusRevision=1`; el producto es `overlay`. La muestra procede del golden
versionado de Overlay, no de un payload inventado dentro del test.

El transporte de captura sustituye únicamente el envío a una ventana WebView,
porque abrir una ventana gráfica dentro de `go test` convertiría el test en un
smoke perceptual e inestable. El evento sí atraviesa la aplicación, el
procesador y la interfaz de transporte reales de Wails. El lifecycle del
frontend Studio/Desktop/OBS se cubre por separado con Playwright.

### Teardown productivo

El composition root ejecuta una secuencia explícita e idempotente:

1. Overlay.
2. Telemetry Core y su driver/REST/Hub.
3. HTTP/SSE.
4. Ops.
5. Hotkeys globales.
6. Hotkeys de perfiles.
7. Bridge Engineer.
8. Cadenas Launcher.
9. Diagnósticos.
10. Engineer.
11. Contexto general de la aplicación.

Cada paso se registra con nombre, duración y error. Un error o un contexto ya
cancelado no omite los pasos posteriores. El contexto general se cancela al
final para que los owners con flush —incluido un futuro wiring del recorder—
puedan cerrar antes de recibir cancelación.

`EngineerService` deja de depender de un `defer` posterior a `Run`: forma
parte del mismo owner de shutdown que Wails invoca. Los hotkeys de perfiles
disponen ahora de `Stop` idempotente.

### Regresión del loop de hotkeys

La causa del timeout histórico era `PostQuitMessage`: se ejecutaba desde el
hilo de shutdown y publicaba `WM_QUIT` en la cola equivocada. El manager ahora:

- bloquea la goroutine al mismo hilo de sistema operativo;
- crea la message queue y publica su thread ID antes de que `Start` retorne;
- recibe `WM_QUIT` mediante `PostThreadMessageW` en el hilo propietario;
- desregistra los hotkeys en ese mismo hilo;
- espera su finalización de forma acotada e idempotente.

Cambiar los atajos reemplaza el manager completo. Ya no se re-registran
hotkeys desde el callback Wails, que no posee la cola Win32. Un mutex pequeño
serializa el reemplazo con el shutdown.

## Recursos demostrados

El harness levanta conjuntamente:

- aplicación y transporte Wails;
- `TelemetryCoreRuntime` y Hub de Overlay;
- servidor HTTP y suscripción SSE loopback;
- `EngineerService` y `EngineerBridge`;
- `OpsBridge`;
- hotkeys globales y de perfiles;
- escritura SQLite real, append, complete y close.

Tras `runShutdown` se exige:

- SQLite completa y cierra sin error;
- cero suscriptores del Hub;
- Engineer detenido, desconectado y con cero suscriptores;
- transporte Wails detenido;
- puerto HTTP no conectable;
- total de goroutines igual al baseline, con tolerancia de dos goroutines del
  runtime de tests;
- cada owner devuelve de su `Stop` y los hotkeys globales terminan muy por
  debajo del antiguo timeout de dos segundos.

El contador global de handles del proceso se registra como diagnóstico, no
como igualdad absoluta: Go y Wails crean hilos y handles internos de forma
perezosa que permanecen reutilizables hasta que termina el proceso. Usarlo como
gate produciría falsos leaks. Los handles propios se prueban por su owner:
`SessionWriter.Close`, fin del hilo Win32, cierre del Hub, cierre del body SSE y
rechazo de conexión al puerto cerrado.

## Cobertura de error y cancelación

`TestRunShutdownContinuesAfterErrorAndCancellation` prueba que:

- el error del primer owner se conserva;
- un paso puede cancelar el contexto;
- el paso siguiente todavía se ejecuta y registra `context.Canceled`;
- el orden permanece determinista.

Las suites existentes mantienen la cobertura específica de cancelación,
doble stop y fallo para DriverManager, LMU reader/REST, Hub, recording,
Engineer, bridges y servidor. TC-09E no duplica esos fakes dentro del harness
integrado.

## Checks

- `go test ./cmd/vantare -run TestTelemetryLifecycleHarness -count=5`: PASS.
- Suites focales de app, launcher, transport, server, Engineer y recording:
  PASS.
- Suite frontend: PASS, 298 archivos y 2.016 tests. Happy DOM imprime sus dos
  `AbortError` heredados después del resultado verde.
- Build frontend: PASS.
- Playwright cutover Studio/Desktop/OBS, wide y compact: PASS.
- Suite Go global: todos los paquetes pasan salvo el P3 heredado
  `TestConcurrentSavesDontCorruptFile`, reproducido también aislado por la
  contención de `app-settings.json.tmp` en Windows. Los paquetes tocados y sus
  dependencias pasan completos; TC-09E no cambia Settings.
- `go vet` focal conserva el aviso heredado de `unsafe.Pointer` en la extracción
  COM de iconos Launcher; no pertenece a Telemetry Core.
- `-race`: no ejecutable en este entorno mientras CGO/GCC no estén
  disponibles; se documentará sin ocultarlo.

## Riesgo residual y siguiente corte

No queda un segundo runtime ni una ruta legacy. El harness no abre una ventana
WebView real; esa capa se valida mediante Playwright y el renderer compartido,
mientras esta prueba cubre el payload Wails anterior a la ventana.

ISA-117 / TC-09F debe ejecutar el gate final completo, consolidar toda la
evidencia, revisar deuda residual y entregar el checklist manual a Isaac. Esta
rama no hace merge ni promoción.
