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

## Telemetría: `analysis::insights`

Entrada: `Lap` y muestras de la API existente de storage (solo señales
Reliable; las demás llegan como `None`). No hay generadores demo.

| Proyección | Forma y uso |
| --- | --- |
| `session_readouts` | `SessionReadout { key: SessionKey { epoch, session, car }, laps, sealed_laps, gap_laps, samples }`; agrupa vueltas por identidad nativa. |
| `lap_readout` | `LapReadout { key, lap, sealed, gap, samples, observed_span_s, speed_mean_kmh }`. La ventana observada no es duración total. |
| `readout_at` | Cursor normalizado/clamp sobre distancia observada. `Readout { distance_m, elapsed_s, speed_kmh, throttle_percent, brake_percent }`, todos `Option<f64>`. Metros del cursor y canales de la muestra previa, sin atravesar huecos; cero fiable permanece cero. |
| `compare` | `Comparison { selected, reference, charts: Charts, sectors, insights }`; exige misma época/sesión/coche como `project_laps`. |
| Sectores | Entrada `Sector { id, from_m, to_m }` con límites reales, únicos y ordenados, sin solapes. `SectorDelta { sector, delta_s, tone }`; delta A−B al final menos al inicio, solo con cobertura continua. No extrapola. |
| Insights | `Insight { sector_id, from_m, to_m, delta_s, tone }`, ordenados por mayor pérdida. Umbrales productivos `Loss > 0.04`, `Gain < -0.02`, resto `Flat`. Son pérdidas/ganancias por tramo, no causas. |

`model::project_delta` expone el cálculo existente sin submuestreo para validar
cobertura del sector; `model::project` mantiene gráficos acotados a 1024 puntos.
No se puede inferir un circuito ni sus sectores de la API actual: sin límites
reales los sectores/insights quedan vacíos. Tampoco publica nombres de circuito,
vehículo, fechas de sesión, duración completa, consistencia, curvas, volante o
causas. No se copian tercios artificiales, escalas best/session/pro, mapa ni
explicaciones de los tests demo del frontend.

## Verificación e integración

Tests table-driven en `calendar/views/tests.rs`, `engineer/history.rs` y
`analysis/insights/tests.rs`: rejillas/seguidas/categorías, slots de hoy,
clasificación, offsets, DST 23/25/24.5 h, zoom, solapes, exportación congelada,
deduplicación/retención, unidades/cursor, suma/ranking/tonos y ausencia ante
huecos, cobertura parcial e identidad incompatible.

Gates y SHAs concretos se entregan al orquestador; logs completos fuera del repo
en `C:/tmp/isa-1430-datos-hub-evidence/`. No hay validación visual ni prueba LMU,
audio o OBS. Notion no disponible, excepción explícita del encargo para usar
GitHub #1430; seguimiento Notion sin actualizar. Solo commits locales, sin
push, PR, merge, promoción ni release.
