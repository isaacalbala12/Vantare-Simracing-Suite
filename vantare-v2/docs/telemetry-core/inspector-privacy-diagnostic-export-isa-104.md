# ISA-104 / TC-06D — Contrato backend de diagnóstico e inspector

Estado: implementación completa, gates D7 cerrados y reviews integradas
`ACCEPT`; pendiente únicamente de entrega Git/Linear apilada, sin promoción.

Este documento describe D1–D6: informe allowlisted, catálogo/inspector,
export exacto, UI de Ajustes, captura raw limitada y sanitizador/tap LMU. La
captura continúa deliberadamente sin wiring productivo.

## Fronteras

- El informe general se construye desde cero mediante una allowlist. No se
  serializan `AppSettings`, perfiles, entradas de Launcher ni logs y después se
  intentan borrar campos.
- El catálogo recibe desde composición una raíz absoluta canónica. Instalación
  usa `LocalAppData/Vantare/telemetry/sessions`; portable/desarrollo usa
  `<root>/data/telemetry/sessions`. El frontend no puede enviar rutas.
- Una sesión se representa fuera del backend con un handle aleatorio y efímero.
  No se exponen `SessionID`, `SessionRef.Root`, `ActiveDatabase`, WAL/SHM ni
  nombres de archivos.
- El paquete exportable es el string JSON exacto mostrado al usuario. El
  SHA-256 y el tamaño se calculan sobre esos mismos bytes.
- No existe escritura de export en backend, red, HTTP, SSE o upload.
- La captura raw diagnóstica es independiente del histórico SQLite y no cambia
  manifest ni schema v1.
- No hay wiring productivo de captura. Activarlo requiere el corte posterior de
  composición y consentimiento.

## Diagnóstico general permitido

El payload v1 puede contener:

- versión cerrada de la aplicación;
- OS, arquitectura, versión de Go y número de CPU;
- fuente de telemetría como enum cerrado y flags live/available;
- versión de settings, modo de delta cerrado y flags/contadores;
- existencia del perfil, display mode cerrado, cantidad de widgets y tipos de
  widget reconocidos;
- cantidades de aplicaciones/perfiles Launcher y agregados por categorías y
  métodos cerrados.

Se excluyen nombres, IDs, emails, Steam IDs, rutas Windows/UNC/POSIX, URLs,
tokens, argumentos, notas, hotkeys, roles, identidad del perfil, telemetría,
voz, estrategias y logs generales. Un enum desconocido se convierte en
`unknown` o se omite; nunca cruza como texto libre.

Las peticiones correlacionadas aceptan únicamente IDs técnicos limitados. La
correlación no altera el payload ni su hash.

Prepare, List e Inspect heredan el contexto de aplicación, comparten un máximo
de dos operaciones simultáneas y aceptan cancelación correlacionada. Una
cancelación que Wails entregue antes de la petición se conserva durante 30
segundos en un registro de máximo 64 entradas, sin timer ni goroutine, y se
consume antes de abrir el catálogo.

## Catálogo e inspector

- Límite por defecto: 100 sesiones; máximo: 500.
- `List` solo lee metadata acotada a 32 KiB: no abre SQLite ni recorre
  históricos y devuelve una señal `truncated` si alcanza el límite.
- `Inspect(handle)` es la única operación que abre el histórico.
- Orden: `startedAtUtc` descendente.
- Máximo de inspección profunda: 16 páginas de 256 registros, es decir, 4.096
  registros por sesión.
- Manifests futuros: metadata-only. No se abre SQLite.
- Manifests corruptos o sesiones indisponibles: motivo cerrado y sanitizado.
- Cancelar el contexto cancela también el resumen histórico.
- Toda la cadena de la raíz rechaza symlinks, junctions y reparse points antes
  y después de crear/abrir el catálogo.
- Los handles solo sirven para la generación vigente y caducan a los cinco
  minutos. El manifest queda ligado por identidad, ruta, tamaño, fecha y
  SHA-256 exacto; se revalida antes y después de cada operación.
- La base SQLite queda ligada por identidad y ruta, no por una revisión exacta
  de sus bytes. Una sesión activa puede modificarla legítimamente y `Store`
  valida su contenido, snapshots e invariantes. El catálogo no lee ni hashea
  la base completa.

El schema histórico v1 persiste presencia por campo y una calidad agregada por
vehículo/facto. Por eso el inspector informa esos dos ejes por separado; no
afirma una calidad independiente para `speed`, `brake`, `gear`, etc. La tabla
por vuelta/muestra pertenece a Telemetry Analysis y queda fuera de este corte.

## Captura diagnóstica interna

Contrato:

- desactivada por defecto y con consentimiento explícito en la composición
  futura;
- una captura activa;
- 60 s por defecto, 120 s máximo;
- 64 MiB por defecto, 128 MiB máximo;
- 5 Hz máximo por defecto;
- 2 MiB máximo por frame sanitizado;
- retención temporal máxima por defecto de siete días;
- cola acotada, `Offer` no bloqueante y drops contados;
- estados `completed`, `canceled`, `size-limit`, `time-limit` y `error`;
- metadata reemplazada atómicamente por plataforma —`MoveFileEx` con replace y
  write-through en Windows— y frames escritos primero como `frames.part`;
- procedencia obligatoria y cerrada: simulador, build, fingerprint SHA-256,
  schema/version del payload, versión del sanitizador y framing;
- hash SHA-256 final e integridad explícita de `frames.bin`;
- una captura interrumpida permanece reconocible y nunca se reanuda;
- la limpieza renombra primero a un tombstone dentro de la raíz y solo después
  elimina; las capturas corruptas y huérfanos antiguos tampoco quedan retenidos
  indefinidamente.

En sistemas POSIX se solicitan permisos `0700/0600`. Windows expone bits POSIX
sintéticos; la privacidad depende del ACL heredado del directorio local del
usuario y no se afirma que `chmod` endurezca el ACL. Un endurecimiento explícito
de ACL requeriría una implementación Windows específica y su propia revisión.

La raíz histórica productiva ya queda seleccionada exclusivamente por
composición backend; nunca procede del frontend. La raíz separada de capturas
raw deberá derivarse con la misma autoridad cuando se active. Esta capa rechaza
enlaces estáticos y revalida identidades antes y después de operar. Las carreras
provocadas por el mismo usuario controlando simultáneamente su almacenamiento
local quedan fuera de su modelo de amenaza; no se presenta el handle como una
frontera frente al propietario del equipo.

La captura raw no forma parte del JSON sanitizado y no se comparte
automáticamente.

## Tap LMU y alcance real

El driver conserva una sola apertura de `LMU_Data`. Tras `readStable` y antes de
parsear, un tap opcional:

1. reserva capacidad en la cola y aplica un límite privado de 5 Hz;
2. si no hay capacidad, descarta sin construir el buffer de ~325 KiB;
3. reconstruye un buffer nuevo inicializado a cero;
4. copia únicamente offsets consumidos por el parser auditado;
5. sustituye track/vehículo por aliases;
6. remapea IDs de forma estable dentro de la captura;
7. transfiere el frame a la reserva sin una segunda copia;
8. contabiliza frames ofrecidos, saltados y descartados;
9. se cierra durante el teardown del driver.

El parser Shared Memory actual publica solo datos globales y del jugador. Los
datos de grid/oponentes que hoy consumen proyecciones llegan por REST/fusión; no
existen offsets de grid publicados por este parser que puedan conservarse de
forma demostrable. Los tests exigen equivalencia de todos los campos
global/player que sí publica y exigen que no se inventen
`PlayerPosition`, `CompletedLaps` o `PitStopCount`.

Por tanto, esta captura es válida para replay de la superficie Shared Memory
auditada actual, pero **no debe anunciarse todavía como reproducción completa
de Spotter/grid**. Si TC-07/TC-08 amplía el parser Shared Memory con evidencia
real de oponentes, el sanitizador deberá ampliar su matriz de offsets, aliases y
regresiones antes de activar esa capacidad.

## UI, contrato Wails y export local

- Ajustes monta un panel aislado desde
  `frontend/src/hub/settings/diagnostics/`.
- `SettingsPage` solo realiza el montaje. Estado y efectos permanecen en
  `DiagnosticsPanel`; conexión, sesiones, detalle y paquete son vistas puras.
- Los eventos cerrados son `diagnostics:prepare`,
  `diagnostics:sessions:list`, `diagnostics:sessions:inspect` y
  `diagnostics:cancel`, con respuestas correlacionadas por `requestId`.
- Solo `current+ready` invoca Inspect. Future, corrupt y current no disponible
  se representan directamente desde metadata de List.
- El cliente recalcula SHA-256 con Web Crypto y comprueba el tamaño UTF-8 antes
  de exponer el payload. Preview, Clipboard y Blob usan exactamente el mismo
  string.
- No existe backend de export, upload, fetch, HTTP, SSE ni escritura remota.
- Textos completos en español, inglés, italiano y portugués brasileño.
- Los campos comunican presencia de forma accesible y los labels del panel
  usan contraste AA.
- El harness solo termina el proceso Vite que él mismo lanzó. Un puerto
  ocupado por otro proceso hace fallar el gate sin terminarlo.

Evidencia visual versionada:
`docs/telemetry-core/evidence/isa-104-inspector/`.

## Activación pendiente

TC-07/TC-08 deberá:

- derivar la raíz de capturas raw desde la misma autoridad backend;
- verificar y probar el ACL privado de esa raíz en Windows antes del wiring;
- pedir consentimiento antes de capturar;
- adaptar `CaptureTap.Frames()` a `Capture.Offer`;
- mantener una sola apertura de Shared Memory;
- exponer drops/estado sin incluir raw en el export sanitizado.

No se debe activar ninguna parte de captura mediante un fallback, mock o
segundo reader.

## Evidencia del corte

Pasaron antes de los gates globales D7:

- diagnóstico app focal `-count=20`;
- catálogo/captura diagnóstica `-count=20`;
- sanitizador/tap/driver focal `-count=100`;
- suite `./internal/telemetry/...`;
- suite `./internal/app`;
- arquitectura Telemetry Core;
- `go vet` de diagnostics/app;
- `go vet -unsafeptr=false` de LMU;
- fuzz acotado del sanitizador; la pasada de review final registró 10.511
  ejecuciones;
- bridge/cancelación/concurrencia focal hasta `-count=100`;
- race focal ejecutado con `C:\msys64\ucrt64\bin`; la review final repitió diez
  ejecuciones sin carreras detectadas;
- frontend focal 64/64;
- build y lint focal frontend;
- Playwright wide/medium/compact con consola y overflow en cero;
- dos reviews backend y una review UI finales `ACCEPT`,
  P0/P1/P2/P3 = 0;
- `git diff --check`.

Benchmark local Windows/amd64, Ryzen 7 3700X del camino post-`readStable`
—captura y parseo; no incluye el acceso al mapping del sistema—:

| Camino | Tiempo | Memoria |
|---|---:|---:|
| tap ausente + parseo | ~3,7 µs/op | 600 B/op |
| tap activo + sanitización + parseo | ~0,6–1,2 ms/op | ~329 KiB/op |
| tap saturado + parseo | ~2,7–4,4 µs/op | 600 B/op |

La reconstrucción solo se solicita a 5 Hz, no a los 60 Hz del driver. La rama
saturada no añade asignaciones al camino normal: las 14 asignaciones y 600
bytes observados son también los del parseo con tap ausente.

El `go vet` LMU normal conserva dos advertencias heredadas de
`unsafe.Pointer` en los adapters Windows; el análisis focal con
`-unsafeptr=false` pasa. `frontend/dist` se generó desde el lockfile para los
checks de embed; frontend y `cmd/vantare` compilan.

## Gates integrados D7

La pasada integrada del 31 de julio de 2026 confirmó:

- `gofmt` limpio sobre todo el Go modificado;
- `git diff --check`: PASS;
- `go test ./internal/telemetry/... -count=1`: PASS;
- `go test ./internal/app/... -count=1`: PASS;
- `go test -p 1 ./... -count=1`: PASS;
- `go vet ./internal/app ./cmd/vantare ./internal/telemetry/diagnostics`: PASS;
- `go vet -unsafeptr=false ./internal/telemetry/drivers/lmu`: PASS;
- `pnpm --dir frontend test`: 292 archivos y 1.923 tests, PASS;
- `pnpm --dir frontend build`: PASS;
- lint focal de todos los archivos TypeScript de ISA-104: PASS;
- `pnpm --dir frontend e2e:diagnostics`: PASS en wide, medium y compact;
- `CGO_ENABLED=0 wails3 build DEV=true`: PASS;
- escaneo de secretos de los 76 archivos del corte completo contra la base:
  cero coincidencias;
- las seis capturas PNG no contienen chunks de texto o metadata textual;
- `TelemetryPage.tsx` no cambia, los lockfiles no cambian y no se añade ninguna
  dependencia;
- el frontend productivo del inspector no contiene red, upload ni tipos/rutas
  SQLite;
- la captura raw no está conectada a composición productiva;
- `LMU_Data` conserva una sola apertura dentro del reader Windows.

El lint global conserva 33 errores y dos warnings heredados fuera del corte,
principalmente en Overlay Studio y Calendar. No se modificaron ni silenciaron.
El build Wails conserva avisos no bloqueantes ya conocidos: generación de
bindings sin servicios desde la raíz y chunk frontend superior a 500 KiB.

Las coincidencias de identidad usadas en tests son fixtures adversariales
deliberados (`example.invalid`, `SyntheticUser` y tokens falsos) que demuestran
la redacción y el rechazo. No aparecen en el paquete exportado ni en las
capturas versionadas.

Las reviews integradas iniciales encontraron y cerraron antes de la entrega:

- rechazo pre/post de symlinks, junctions y reparse points en toda la cadena de
  la raíz raw, con el target externo intacto;
- snapshots profundos de Settings/Launcher, incluido `LastLaunchedAt`, sin
  referencias internas mutables;
- selección top-K global y determinista aunque existan más de 500 entradas;
- `—` para vueltas/vehículos desconocidos en sesiones metadata-only,
  conservando cero cuando procede de una inspección real;
- contraste local de texto normal elevado de 4,466:1 a 4,592:1.

Las re-reviews finales backend y UI fueron `ACCEPT`, con
P0/P1/P2/P3 = 0.
