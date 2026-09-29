# Revisión al portar ISA-1403 → `runtime/src/core` (fase 0)

Origen: `C:\tmp\vantare-review-1403\vantare-v2\rust\telemetry\src` (SHA `db524bf7`).
Alcance leído: `quality.rs`, `core.rs` y `derive.rs` completos; `core/session.rs`
(≈300 de 534 líneas de producción), `derive/gaps.rs`, `derive/controls.rs` y
`lmu/freshness.rs` completos; `derive/fuel.rs` y `derive/delta.rs` solo cabeceras,
tipos y firmas; `core/facts.rs` **no** se leyó a fondo (es el log de eventos, fuera
de fase). No se leyó `engine.rs`, donde vivían los contadores de status.

## Qué se portó y cómo

| Original | Aquí |
|---|---|
| `quality.rs` (`Field`, 3×3 procedencia×frescura) | Sustituido por `domain::Quality`. Se conserva la semántica (ausente ≠ 0 ≠ `false`; obsoleto conserva el valor). |
| `core.rs` `Reducer` prepare/commit | `Core::observe`: validar → sanear → derivar → numerar → publicar, con `&mut self`. |
| `core/session.rs` época/sesión | `epoch` fija por núcleo; un `session.id` nuevo dentro de la época es una sesión nueva sin herencia. |
| `lmu/freshness.rs` `FreshnessGate` | `STALL_LIMIT` = 500 ms sobre el reloj de la fuente (`Origin::source_time`), en `Core`. |
| `derive/gaps.rs` | Solo la regla, no la matemática (ver abajo): derivado únicamente desde entradas actuales. Gaps de Standings en `derive.rs`. |

## Defectos y decisiones

1. **Cursor puesto por el adaptador.** El reducer validaba `epoch`/`sequence`
   venidos del lote (`SequenceGap`, `EpochGap`, `InvalidEpochReset`…). Un adaptador
   no puede numerar. Ahora numera el núcleo, una sola vez, y `sequence` cuenta
   *todo* lo publicado (observaciones y bajadas a obsoleto): **una revisión
   única y creciente** por época, sin contador aparte para status. Test:
   `revision_is_one_counter_per_epoch_and_origin_is_kept`.
2. **Candidate/commit con token `Arc<()>`**, revalidado en `prepare` y `commit`.
   Existía para que varios trackers preparasen a la vez; con un escritor y
   `&mut self` sobra. Se valida antes de mutar: un rechazo no deja rastro.
3. **`ChangedRunWithoutEpoch` era error.** El contrato nuevo (`domain::adapter`)
   dice lo contrario: cambiar `session.id` sin cambiar de época es normal.
4. **Tipos de simulador por genéricos** (`VehicleState<S, F, D>`, `impl FuelValue
   for lmu::Fuel` en `fuel.rs:40`): el acoplamiento a LMU asomaba por los
   parámetros. Desaparece con el modelo de `domain`.
5. **Reloj de pared dentro del reducer** (`occurred_utc_ns`, `captured_utc_ns`):
   rompe el replay determinista. Aquí solo hay el `received_at` inyectado.
6. **Valores fabricados**: `invalid()` en `gaps.rs`/`derive.rs` devolvía `0.0` con
   frescura `Invalid`, es decir un cero con cara de dato. Ahora un `NaN` o
   infinito pasa a `Unavailable` (`sanitize`) y ningún derivado se calcula con él.
7. **Invariantes con `expect`/`unreachable!`** (`gaps.rs`, `controls.rs`,
   `delta.rs`) que dependen de comprobaciones lejanas. Aquí no hay ninguno en
   producción; solo el `try_send` sobre un canal recién creado en `publish.rs`.
8. **Validaciones conservadas**: id de coche duplicado. Descartadas por no tener
   equivalente en el modelo: `vehicle_count`, id vacío, `IncompleteIdentity`.
9. **Histéresis de recuperación (2 s)** del `FreshnessGate`: no se porta. Cada
   cruce del límite publica una revisión; si el parpadeo fresco/obsoleto aparece
   en LMU real, se añade en `Core::observe` (ponytail).

## Qué no se portó y por qué

- **`derive/{delta,fuel,controls}.rs`** y la matemática de **`gaps.rs`**
  (`delta − round(delta/periodo)·periodo` sobre `lap_progress_time`): necesitan
  campos que `domain::State` no tiene (distancia de vuelta, tiempo de progreso,
  combustible, historial de mandos, reloj de fuente por coche). Standings, radar
  y pedales de la fase 0 no los usan (son de Relative, Delta, Strategy). Portarlos
  ahora sería código sin sitio donde poner el resultado; entran con su señal en
  `domain` (una pregunta al orquestador, abajo).
- **`derive::session_remaining`**: `Session::remaining_s` lo declara el adaptador.
- **`core/session.rs` hechos, ids de stint, historial por vehículo y
  `core/facts.rs`**: es el flujo de eventos (fase 3). Lugar previsto: módulo
  hermano alimentado desde `Core::observe`, que ya tiene el snapshot previo y el
  nuevo; misma `epoch`/`sequence` como punto de corte. Sin código en esta fase.
- **Arrastre de valores del snapshot previo** cuando un campo llega
  `Unavailable`: inútil hoy, porque los ViewModels solo muestran `current()` y un
  valor `Stale` se ve igual que uno ausente.

## Lo que hace el núcleo hoy

Standings: posición de clase (`Estimated`) y gaps al líder / al de delante
derivados el uno del otro entre posiciones consecutivas, solo con tiempos.
Radar: `domain::radar::project` ya elige los coches cercanos desde las poses; el
núcleo solo garantiza poses finitas. Pedales: telemetría del jugador saneada.
