# Studio nativo: mapa de archivos

Studio es el editor de layout del Hub. Edita **un único documento**
(`crate::document::Editor`, en `hub/src/document.rs`) y pinta los widgets con
el renderer compartido de `vantare-ui`. Este README dice qué vive en cada
archivo y dónde tocar. Léelo antes de abrir los archivos grandes.

## Reglas que no se rompen

- **El documento solo cambia a través de `Editor`.** Guardar, deshacer/rehacer
  y la selección viven en `Editor`. Studio no escribe el layout por su cuenta.
- **No hay un renderer propio.** La preview usa los mismos `frame()` de
  `vantare-ui` que Desktop y Workshop.
- **Las capas están separadas.**
  - El canvas solo gestiona la interacción espacial.
  - El inspector edita el documento.
  - Las escenas solo dan `Snapshot`s.
- **Tamaño máximo.** Ningún archivo pasa de 2000 líneas. Lo comprueba
  `hub/tests/architecture.rs::hub_source_files_stay_within_their_line_budgets`.
  Si un archivo crece, pártelo; no subas el techo.

## Archivos

| Archivo | Qué contiene | Tócalo para… |
|---|---|---|
| `../studio.rs` | `Studio` (estado completo), `Prepared` y `StudioSidebar`, que es la columna que enlaza la shell. Constructor `new`, `ingest` (frames en vivo), `render` raíz (ratón y teclado globales), barra superior (`topbar_actions`), estado de guardado y «Mostrar en pista» cacheado (#1567). | Añadir estado nuevo a `Studio`, cambiar la API que usa la shell (`set_access`, `handle_shell_key`, preferencias, rendimiento) o la barra superior. |
| `canvas.rs` | Escenario y gestos: `CanvasFrame` (cada widget en el canvas, con tiradores de resize), `Drag`/`Resize`, zoom, escala que encaja, resolución del canvas, anclas, nudge con teclado (`held_nudge_distance`, `keyboard_nudge`), opacidad en vivo y `editor_workspace`, que monta canvas + inspector + tira. | Arrastrar, redimensionar, zoom, teclado del canvas o el pie de la preview. **Antes**, lee `docs/overlays-studio/canvas-drag-imperative-preview.md`. |
| `inspector_panel.rs` | Panel derecho para el widget seleccionado: pestañas (`tab_settings`), color, columnas, posición (rejilla de anclas y pad de nudge), rendimiento por widget, «Fuera de pista» (#1562), OBS, y la creación y sincronización de controles (`init_controls`, `reset_fields`, `sync_size_fields`). | Añadir o cambiar un control del inspector. Patrón: crear el control en `init_controls`, pintarlo en `setting_control`/`tab_settings` y aplicar el cambio vía `Editor`. |
| `catalog.rs` | Carga (`Prepared::load`), catálogo «Añadir widget», tira de widgets (`widget_strip` con fila y acciones), fotos y ejemplos para la preview (`preview_snapshot`, `example_snapshots`), selector de escena y controles de navegación. También los ajustes de demo y captura (`parity-capture`). | Catálogo, lista de widgets, elegir qué `Snapshot` ve la preview o las capturas de paridad. |
| `sessions.rs` | Widgets por tipo de sesión (#1564): pestañas práctica/qualy/carrera de las columnas de Standings y «Mostrar en» de cualquier instancia. | Reglas o controles por tipo de sesión. |
| `scenes.rs` | Fotos reales (`Scenario`: Salida, Carrera, Boxes, Lluvia, Noche), cargadas de `ui/fixtures/telemetry-real`. Conserva el `Snapshot` completo, sin alterar señales. | Añadir o cambiar una foto real. |
| `examples.rs` | Escenas sintéticas de «Ejemplo» (30 pilotos por clase, ±8 rivales) para probar límites. Son muestras rotuladas, no sesión real. | Datos de ejemplo de un widget. |
| `tests.rs` | Tests unitarios de Studio: gestos, escala, nudge, catálogo, capturas e inspector. | Añadir el test de tu cambio aquí, salvo que sea de sesiones. |
| `session_acceptance.rs` | Test de aceptación de #1564: presets por sesión y preview por pestaña. Se monta con `#[path]` desde `studio.rs`. | Solo cambios de sesiones. |

Todos los submódulos usan `use super::*` y amplían `impl Studio`. Lo que se
comparte entre archivos es `pub(super)`. No lo subas a `pub` sin necesidad.

## Flujos típicos

- **Se selecciona un widget:**
  1. `select` (en `studio.rs`) actualiza `Editor`.
  2. En el siguiente render, `init_controls` reconstruye los controles del
     inspector, solo si cambió la selección (`inspector_selection`).
- **Se cambia un ajuste:** el control emite su evento y `edit` aplica el cambio
  en `Editor`. Se guarda solo («Guardado») y entra en el historial.
- **Se arrastra un widget:**
  1. `CanvasFrame` emite `Started`.
  2. `move_drag` mueve solo la preview, sin tocar el documento.
  3. `finish_drag` confirma la posición en `Editor`.
- **Llega telemetría en vivo:** `ingest` cambia `snapshot`, salvo en modo
  «Ejemplo» o con una foto fija.

## Verificar

- Gates: `pwsh -NoProfile -File C:/tmp/fase2/compilar.ps1`, que pasa fmt,
  clippy `-D warnings`, nextest y lifecycle.
- Captura aislada: `--capture studio-base --demo --size 1440x900 --out <PNG>`,
  solo con la feature `parity-capture`. El detalle está en `../../README.md`.
