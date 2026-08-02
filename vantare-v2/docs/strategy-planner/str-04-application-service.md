# STR-04 — Servicio de aplicación, comandos, dirty y undo/redo

## Resultado

ISA-139 añade la única fachada de aplicación de Strategy sobre el repositorio
de STR-03 y un store frontend transitorio. El corte no añade interfaz, cálculo,
telemetría, acceso a LMU ni una segunda persistencia.

## Ownership

- `internal/strategy/repository` sigue siendo la única autoridad de drafts y
  revisiones persistidos.
- `internal/strategy/application` valida, ordena y ejecuta los comandos contra
  esa autoridad.
- `frontend/src/strategy/strategy-store.ts` posee solo el borrador abierto,
  snapshot guardado, historial undo/redo y observaciones de ejecución.
- Los eventos de ejecución se validan y guardan separados; nunca editan el
  draft, el snapshot guardado o su historial.
- El plan activo de STR-04 es un resultado transitorio y versionado. Su
  persistencia y cutover pertenecen a STR-16.

## Protocolo

`strategy.application.v1` exige en todos los comandos:

- `commandId` válido y correlacionable;
- `operation` explícita;
- `expectedRepositoryVersion` como entero seguro compartido con TypeScript.

Los comandos cubiertos son `create`, `open`, `edit`, `save_revision`,
`duplicate`, `activate`, `deactivate`, `restore` y `close`. Undo y redo son
operaciones locales del store: no generan revisiones ni escrituras.

El bridge JSON rechaza protocolo futuro, campos desconocidos, campos
duplicados, campos obligatorios ausentes y contenido posterior al documento.
También aplica los mismos límites de bytes, profundidad y elementos del
contrato canónico antes de ejecutar efectos. El cliente de eventos correlaciona
por `commandId`, valida el resultado antes de publicarlo y limpia listeners
tanto en éxito como en error, timeout, cancelación, descarte o fallo síncrono
del transporte.

## Invariantes

- Crear, duplicar y guardar son idempotentes por efecto observable.
- Un writer con una generación obsoleta no pisa cambios y recibe
  `stale_command`.
- Un `ErrCommitUncertain` solo se considera éxito tras reconciliar el efecto
  exacto mediante un snapshot nuevo.
- Guardar crea una revisión inmutable y actualiza el `baseRevision` del draft
  dentro del mismo commit transaccional.
- Duplicar admite el contenido local no guardado, pero exige que la identidad
  origen siga existiendo y que la generación del repositorio sea la esperada.
- Dirty se deriva comparando el presente con el snapshot guardado; no existe un
  booleano duplicado que pueda desincronizarse.
- Una edición idéntica no crea historial; una edición tras undo elimina la rama
  redo; el historial tiene límite explícito.
- Cerrar el editor no desactiva el plan ni borra la observación de ejecución.
- Un close con cambios no guardados falla salvo descarte explícito.
- Crear o abrir otro borrador nunca descarta cambios locales: exige primero un
  close con descarte explícito.
- El store serializa comandos de aplicación y conserva el bloqueo hasta aplicar
  su resultado. Edit, undo y redo fallan de forma explícita durante save/close,
  por lo que una respuesta tardía nunca puede sobrescribir una edición local.
  Telemetría puede actualizar su observación mientras hay un comando en curso,
  pero no toca el documento.
- Si el efecto de save pudo persistirse pero se perdió la respuesta, el store
  conserva y reintenta exactamente el mismo `commandId`, `revisionId`, draft y
  timestamp. No crea una segunda identidad hasta reconciliar, restaurar o
  descartar explícitamente.

## Recuperación y errores

`restore` vuelve a cargar el draft persistido y elimina únicamente el historial
transitorio. Si STR-03 recuperó backup, el resultado propaga
`recoveredFromBackup` para que una UI futura pueda informarlo.

Errores estables del corte: `invalid_command`, `stale_command`,
`draft_not_found`, `draft_conflict`, `revision_not_found`,
`active_plan_conflict` y `unsaved_changes`. Errores de I/O no se convierten en
éxitos ni se silencian.

## Corrección tras review independiente

La revisión de ISA-139 detectó dos riesgos P1 de pérdida silenciosa y cuatro
P2 de endurecimiento. El corte los cierra sin ampliar producto:

- bloquea mutaciones locales durante save/close y mantiene `busy` hasta aplicar
  la respuesta;
- prohíbe reemplazar un draft dirty sin descarte explícito;
- reintenta un save incierto con identidad inmutable;
- valida requeridos y semántica antes de atajos idempotentes;
- hace cancelable y descartable el cliente, incluyendo respuestas tardías;
- alinea límites JSON del bridge con el contrato compartido.

Las regresiones usan respuestas diferidas, un commit exitoso cuya respuesta se
pierde, eventos tardíos y documentos en cada frontera de recursos.

## Exclusiones deliberadas

- No se registra todavía el bridge en el composition root de Wails.
- No hay componentes React, navegación ni diseño final.
- No hay solver, stints, Fuel, Virtual Energy o neumáticos.
- No se importa Telemetry Core, Shared Memory, REST, DuckDB ni archivos LMU.
- No se persiste el plan activo antes de STR-16.

## Verificación

La entrega exige como mínimo:

- tests focales Go de servicio, bridge, carreras, idempotencia y recovery;
- tests frontend de cliente, dirty, undo/redo, close y aislamiento de ejecución;
- suite Strategy, suite frontend completa, TypeScript, build y lint focal;
- `go vet`, `go test -race` cuando el toolchain Windows lo permita;
- `git diff --check` y búsqueda de dependencias prohibidas.

## Rollback

El corte es aditivo salvo por exportar dos parsers ya canónicos del contrato
TypeScript. Revertir el commit elimina `internal/strategy/application`, el
cliente/store frontend y este documento sin migrar ni tocar los datos creados
por STR-03.
