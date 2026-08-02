# STR-03 — Repositorio local y dominio de persistencia

Fecha: 2026-08-02

Issue: ISA-138

Base: `ISA-137@91c16c2`

Formato: `strategy.repository.v1`

## Resultado

Strategy Planner dispone de un único repositorio local para borradores y
revisiones. La API pública es intencionadamente pequeña:

- `Snapshot` devuelve una copia defensiva, su generación y si fue necesario
  recuperar el último backup válido;
- `Commit` aplica un lote completo condicionado por la generación observada;
- `ChangeSet` permite guardar borradores/revisiones y borrar planes en una sola
  transacción local.

STR-15A podrá listar y persistir mediante esta API sin conocer nombres de
archivos, temporales, backups ni migraciones. Este corte no contiene UI,
búsqueda, filtros, import/export, telemetría o cuenta cloud.

## Layout privado

El repositorio utiliza exclusivamente rutas fijas dentro del directorio que la
aplicación le entrega:

```text
strategy-repository.json       estado vigente
strategy-repository.bak        último estado válido anterior
.strategy-repository.lock      lease del sistema operativo
.strategy-repository-*.tmp     temporal efímero de escritura
```

Los identificadores de plan nunca se convierten en paths. Eliminar un plan
reescribe el documento interno y no ejecuta `Remove` sobre rutas incluidas en
el payload. Por ello una referencia a telemetría, vídeo o cualquier archivo
externo permanece intacta.

## Atomicidad y concurrencia

Cada operación adquiere un lease del sistema operativo:

- Windows usa un handle sin sharing; el kernel lo libera al cerrar o terminar
  el proceso.
- Unix usa `flock` no bloqueante sobre el mismo archivo de lease.

Dos procesos o dos instancias no pueden escribir simultáneamente. Además,
`Commit` exige la generación leída por el consumidor. Si otro escritor ya
avanzó el documento, la operación falla con `ErrStaleWrite`; si el lease sigue
ocupado, falla con `ErrWriteInProgress`. Nunca se fusionan silenciosamente dos
borradores.

La escritura crea un temporal privado en el mismo directorio, fuerza sus bytes
a disco y lo reemplaza atómicamente. Windows usa `MoveFileEx` con replace y
write-through; Unix usa rename y sincroniza el directorio. El primer commit
escribe antes un backup de su misma generación; los siguientes rotan el estado
anterior. Por ello el almacenamiento queda acotado y la desaparición del
principal nunca convierte un repositorio inicializado en un gen0 silencioso.

La exclusión está probada entre procesos reales, no solo entre goroutines: un
proceso auxiliar mantiene el lease, el segundo recibe `ErrWriteInProgress`, el
primero termina de forma abrupta y el kernel libera el lease para la reapertura.
Al adquirirlo, el repositorio elimina únicamente temporales regulares con el
patrón privado exacto. No sigue ni elimina symlinks, reparse points, directorios
o nombres ajenos; una regresión con 128 restos demuestra que los temporales de
crash creados por el escritor no crecen sin límite.

Si el reemplazo del estado ya ocurrió pero falla la sincronización final del
directorio, `Commit` devuelve `ErrCommitUncertain` con la generación candidata.
El consumidor debe ejecutar `Snapshot` y reconciliar esa generación; no debe
reintentar ciegamente el mismo cambio. La prueba del fault point demuestra que
el documento reemplazado puede ser válido aun cuando la confirmación durable no
pudo completarse.

## Drafts, revisiones y recovery

- Un `PlanDraft` puede sustituirse únicamente conservando su `DraftID`, plan y
  variante.
- Una `PlanRevision` se vuelve a decodificar y verificar antes de entrar al
  repositorio. La misma identidad con otro hash se rechaza mediante
  `ErrImmutableRevision`; repetir exactamente la misma revisión es idempotente.
- El envelope completo conserva un SHA-256 propio que detecta corrupción
  sintácticamente válida también en drafts; no depende solo de que el JSON se
  pueda decodificar.
- Todos los snapshots devueltos son copias defensivas.
- Un cierre después de un commit recupera el último draft confirmado.
- Ambos archivos ausentes significan gen0 únicamente antes del primer commit.
  Desde la primera generación, el backup existe y permite distinguir y
  recuperar la pérdida del principal. Un commit posterior con versión 0 recibe
  `ErrStaleWrite` y no consolida la pérdida.
- Un temporal incompleto nunca sustituye al estado vigente.
- Si el principal está ausente o se demuestra corrupto, el repositorio valida
  el backup y lo restaura.
  Si ambos fallan, devuelve `ErrCorruptRepository` y no inventa un estado vacío.
- Límites configurados, permisos, I/O y versiones futuras se propagan sin
  restaurar el backup ni modificar el principal. La regresión exacta conserva
  generación 2 con dos drafts ante una reapertura limitada a un draft, aunque
  el backup de generación 1 sí sería aceptable.
- Una versión futura de repositorio o contrato falla cerrada y no se rebaja
  automáticamente al backup, para evitar interpretar documentos nuevos como
  antiguos.

## Migraciones y rollback

`MigrateRepositoryJSON` es la única puerta de versión. Al igual que
`strategy.v1`, `strategy.repository.v1` es la primera versión productiva y no
tiene un predecesor real. Su migración es un no-op byte a byte fijado por:

- `testdata/repository-v1.json`;
- `testdata/repository-v1.golden.json`.

Cada draft atraviesa además `contract.MigrateContractJSON`, la misma puerta
canónica de `strategy.v1` que las revisiones. `draft-v1.json` fija el no-op y
`draft-future.json` fija el rechazo de una versión futura. Una versión futura
embebida en un principal con hash válido se devuelve al consumidor y no activa
rollback ni mutación.

No se inventa una migración desde Product A ni desde un formato que nunca fue
publicado. El fixture de versión futura demuestra el rechazo explícito. Cuando
exista v2, deberá añadirse un paso `from/to`, fixture antes/después y prueba de
rollback antes de aceptar el formato.

El rollback operativo actual es el último backup válido. El test de corrupción
crea dos generaciones, corrompe el principal, conserva un temporal
interrumpido y demuestra que la reapertura restaura exactamente la generación
anterior sin modificar sus revisiones.

La frontera del primer commit queda fijada también ante crash: si el backup
falla antes del replace, ambos archivos siguen ausentes y el repositorio sigue
siendo genuinamente nuevo; si el backup ya fue reemplazado o el principal falla
después, el resultado es `ErrCommitUncertain` y `Snapshot` recupera la primera
generación. No existe marker ni una segunda fuente de verdad adicional.

## Límites

Los defaults protegen el proceso y el disco:

- 64 MiB por repositorio;
- 4 MiB por documento;
- 512 borradores;
- 8.192 revisiones;
- generación máxima compartible `2^53-1`.

Los límites se verifican antes de escribir. Una operación rechazada no cambia
la generación ni el archivo vigente. El JSON persistido y su hash rechazan campos
desconocidos, claves duplicadas, trailing data, revisiones manipuladas y
documentos de contrato inválidos.

## Rollback de código

STR-03 está aislado en `internal/strategy/repository`. Revertir su commit retira
el repositorio sin modificar STR-02 ni Product A. Sus archivos de datos aún no
tienen consumidores productivos; deben conservarse para una reanudación futura
o eliminarse solo mediante una migración/cutover explícitos.

## Verificación

- tests focales de recovery, revisión inmutable, stale/concurrencia, límites,
  migración, corrupción y borrado externo;
- repetición focal x100 y lease cross-process x50;
- race real x10 con CGO/UCRT64;
- `go test` y `go vet` del árbol Strategy;
- compilación Linux del paquete no-Windows;
- frontend build para generar el embed ignorado del worktree;
- suite Go global PASS al excluir únicamente el P3 Windows heredado
  `TestConcurrentSavesDontCorruptFile`. La repetición completa posterior a la
  corrección agotó el límite de cinco minutos sin salida; la primera entrega ya
  había aislado ese test como único fallo Windows y no se atribuye el timeout a
  STR-03;
- vet global conserva tres avisos `unsafe.Pointer` Win32 heredados fuera del
  diff.
