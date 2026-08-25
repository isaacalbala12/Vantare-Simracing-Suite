# ADR 0093 — Guardado automático e historial productivo de Overlay Studio

- Estado: aceptada para ISA-842
- Fecha: 2026-08-25
- Sustituye, solo para persistencia del editor, el guardado explícito de ADR 0003
- Issue: ISA-842

## Contexto

Overlay Studio V3 ya mantenía un historial documental acotado y separaba los
cambios confirmados de las previews transitorias del canvas, pero la ruta Orbit
solo persistía al pulsar «Guardar». Sus atajos de undo/redo tampoco estaban
montados en la ruta productiva. Esto permitía cerrar o cambiar de perfil con un
borrador pendiente y hacía que el comportamiento visible no se pareciera al de
un editor creativo moderno.

El guardado automático aumenta además el riesgo de carreras: dos peticiones con
la misma revisión pueden entrar a la vez, un resultado antiguo puede resolver
después de una edición nueva y el servicio global puede haber cambiado de
perfil entre load y save.

## Decisión

### 1. Cada cambio confirmado se guarda automáticamente

La ruta productiva observa el documento del `StudioProvider`. Un comando que
crea una entrada real de historial programa un save con 300 ms de debounce. Las
previews de drag/resize, zoom, fondo, área segura y fuente de telemetría no
pertenecen al documento y no disparan persistencia. Drag y resize siguen
haciendo un único commit en `pointerup` según el contrato de preview imperativa.

### 2. Un solo save en vuelo

`StudioProvider` es la única autoridad de persistencia. Si el documento B
cambia mientras A está en vuelo, A confirma primero su revisión y B se guarda a
continuación con esa revisión. Todos los callers comparten la misma promesa de
drenaje; no se lanzan saves concurrentes y la promesa resuelve cuando el
documento más reciente ya quedó persistido.

Una excepción o timeout se convierte en estado `error`, conserva documento e
historial y permite reintentar desde el control visible o con un cambio
posterior. Un conflicto de revisión pausa el autosave hasta recargar la sesión;
nunca se reintenta a ciegas una revisión stale.

### 3. El archivo pertenece a la sesión del editor

Cada petición de Studio incluye el `file` que cargó esa instancia. Go resuelve
y guarda ese archivo exacto. Si el perfil activo global cambió entretanto, no
se sustituye su documento runtime ni se escribe sobre él. El modo in-place
conserva su evento propio y su autosave existente.

### 4. Historial tipo Photoshop

El historial existente conserva hasta 100 cambios confirmados y no se vacía al
guardar. `Ctrl+Z` deshace; `Ctrl+Shift+Z` y `Ctrl+Y` rehacen. Los atajos viven en
la ruta productiva, no secuestran teclas dentro de `input`, `textarea`, `select`
o contenido editable, y cada undo/redo se vuelve a guardar automáticamente.

`Ctrl+S` y el control superior se mantienen como flush/reintento manual. La UI
muestra estados honestos: pendiente, guardando, guardado automáticamente o
reintento.

## Consecuencias

- Cerrar o cambiar de vista sigue protegido por los guards existentes mientras
  hay debounce, save en vuelo, error o conflicto.
- El snapshot `saved` avanza sin borrar `past`/`future`; deshacer un estado ya
  guardado crea un documento dirty que autosave persiste como estado vigente.
- Recovery y discard deben actualizar tanto React state como `historyRef`, ya
  que el save serializado lee esa referencia.
- No aparece un segundo store, renderer, DSL ni dependencia.

## Verificación requerida

- Ráfaga de comandos: un save tras el debounce con el documento más reciente.
- Edición B durante save A: máximo una petición simultánea y revisión B basada
  en la respuesta de A.
- Error lanzado, error de dominio y conflicto: documento recuperable y estado
  visible; sin `saving` permanente.
- `Ctrl+Z`, `Ctrl+Shift+Z` y `Ctrl+Y` en la ruta productiva, incluidos los saves
  de la reversión y la reaplicación.
- Inputs editables conservan su undo nativo.
- Cambio de perfil durante un save: solo cambia el archivo ligado a la sesión.
