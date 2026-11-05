# Modelos puros del Hub — ISA-1430 / GitHub #1430

Entrega del worker de datos: ninguna modificación de `render`, vistas GPUI ni
`orbit.rs`. Los módulos nuevos no contienen GPUI, I/O ni dependencia del runtime.
Solo reutilizan `chrono`, `serde_json` y tipos ya disponibles. El orquestador
conecta estos modelos a los propietarios de datos y pinta con el kit Orbit.

## Calendario: `calendar::views`

Entrada: `Schedule` parseado, `Filter { tier, followed_only, followed }`, reloj
UTC y zona `chrono::TimeZone`. `Series` conserva `tier`, `event_kind` y el
offset publicado de la recurrencia. `Schedule::starts` aplica ese offset y la
ventana del catálogo; no añade salidas fuera de ella.

| Proyección | Forma y uso |
| --- | --- |
| `tier_counts` | Contadores por categoría y `all`, antes de filtrar. |
| `starts` / `group_by_day` | `Start { series: &Series, at: DateTime<Utc> }`, orden por instante/nombre; mapa por fecha civil de la zona. |
| `day_rows` | 24 `DayHour { hour, now, events: Vec<Start> }`. Mantiene todos los instantes de los días DST, agrupando la hora repetida como hace el frontend. |
| `week_anchor` / `week_rows` | Lunes civil; una `WeekRow { series, cells }` por serie, siete `WeekCell { day, today, past, slots, more, total }`. Cuatro horas visibles por celda; hoy enseña próximas salidas, o las primeras si ya terminaron. |
| `month_days` | 42 `MonthDay { day, other, today, daily, weekly, special_series }`, desde lunes. Listas `MonthSeries { series, slots }`; celdas de otro mes sin ocurrencias. |
| `timeline_start` / `timeline_rows` | Inicio del tramo horario real, incluso DST de media hora. `TimelineRow { series, starts, block_min: 4 }`; bloque de salida, no duración de carrera. |
| `clamp_zoom` / `fit_zoom` / `px_per_hour` / `tick_every_min` | Zoom 1–4, rangos 6/12/24 h, escala y pasos del eje equivalentes al frontend. Sin persistencia. |
| `specials_by_day` | Eventos explícitos `Event { id, title, source, start, end }` por fecha civil, ordenados. Excluye duplicados generados por identidad Go y catálogo completo, independientemente del filtro de series. Combinar con Día/Mes por fecha. |
| `overlap_lanes` | Recibe intervalos `[start,end)` y devuelve carril por índice original; rechaza intervalos vacíos/invertidos. Las salidas simultáneas pueden usar intervalos de cuatro minutos. |

Las zonas disponibles sin dependencias nuevas son `Utc`, `Local` (SO) y
`FixedOffset`. El modelo acepta cualquier `TimeZone`, pero no incorpora un
selector/base IANA propio. Una medianoche inexistente devuelve error; una
ambigua elige el primer instante real. Los tests usan transiciones explícitas
de Madrid y Lord Howe sin modificar la zona global del proceso.

## Engineer: `engineer::model`

`Model` consume el report nativo v2, verifica heartbeat y conexión, y conserva
las entregas observadas por identidad de proceso/instancia/id. Actualiza el
resultado de audio sin duplicar entregas; retiene hasta 1000 y cuenta descartes.
El parser conserva lectura v1 como evidencia sin acreditar conexión vigente.

`ObservedDelivery` conserva la entrega y el instante de observación del Hub.
`history::Filter { current_cycle_only, family, query }` filtra por época actual,
prefijo del intent y búsqueda sin distinción de mayúsculas; las filas van de
más reciente a más antigua.

`prepare_export(now_ms)` produce una preview JSON v2 congelada del report y
**todo** el historial retenido. Cambios posteriores de polling o
filtros no alteran la cadena. Guardar el archivo pertenece al propietario UI.

Límite contractual: cada report contiene una ventana acotada de entregas;
el historial observado no sustituye al journal durable ni permite deducir
mensajes omitidos entre polls. `observed_at_ms` es hora de observación del Hub.
Consulta [el contrato vigente](engineer/MODEL.md) para frescura y campos ausentes.

## Telemetría: `analysis::model`

El Hub lee resúmenes y muestras de grabaciones nativas mediante el helper
read-only de storage. `Lap` conserva identidad, muestras, calidad y ventana
observada; `Sample` expone números solo para señales Reliable. `project_laps`
exige misma época/sesión/coche y proyecta gráficos de hasta 1024 puntos.
Los huecos separan segmentos; no se inventan cobertura, circuitos ni causas.

La retirada de `analysis::insights`, sin consumidores de producto, se sigue
en el [PR #1979](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1979);
#1974 es la issue del recorrido. La vista usa `model` y conserva su demo
explícita. La grabación de series pendiente se sigue en #1975.

## Verificación e integración

Tests table-driven en `calendar/views/tests.rs` y `engineer/history.rs`:
rejillas/seguidas/categorías, slots de hoy,
clasificación, offsets, DST 23/25/24.5 h, zoom, solapes, exportación congelada,
deduplicación/retención. La lectura y los gráficos de series se prueban en
`analysis/tests.rs`, con huecos e identidad incompatible.

Evidencia histórica de #1430: `C:/tmp/isa-1430-datos-hub-evidence/`.
El seguimiento vigente de este recorrido es #1974 / Plane VANTA-133 y sus PR;
los estados de aquella entrega no describen la rama actual. Los contratos y
los tests no certifican juego físico LMU/OBS, audio ni aceptación visual.
