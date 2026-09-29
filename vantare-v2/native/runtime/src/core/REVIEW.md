# Revisión al portar ISA-1403 → `runtime/src/core` (fases 0 y 1)

Origen: `C:\tmp\vantare-review-1403\vantare-v2\rust\telemetry\src` (SHA `db524bf7`).
Alcance leído en la fase 0: `quality.rs`, `core.rs` y `derive.rs` completos;
`core/session.rs` (≈300 de 534 líneas de producción), `derive/gaps.rs`,
`derive/controls.rs` y `lmu/freshness.rs` completos; `derive/fuel.rs` y
`derive/delta.rs` solo cabeceras, tipos y firmas (completos en la fase 1, ver
abajo); `core/facts.rs` **no** se leyó a fondo (es el log de eventos, fuera de
fase). No se leyó `engine.rs`, donde vivían los contadores de status.

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

- **`derive/{delta,fuel}.rs`** y la matemática de **`gaps.rs`**: no entraron en
  la fase 0 porque `domain::State` no tenía sus señales (distancia de vuelta,
  combustible, delta). `fuel` y `delta` ya están portados en la fase 1 (ver
  abajo); la matemática de `gaps.rs` (vueltas relativas y gap temporal modular
  sobre `lap_progress_time`) sigue pendiente: el modelo expone los gaps nativos.
- **`derive/controls.rs`**: historial de mandos sin campo en el modelo; es de
  la fase de telemetría, no de esta.
- **`derive::session_remaining`**: `Session::remaining_s` lo declara el adaptador.
- **`core/session.rs` hechos, ids de stint, historial por vehículo y
  `core/facts.rs`**: es el flujo de eventos (fase 3). Lugar previsto: módulo
  hermano alimentado desde `Core::observe`, que ya tiene el snapshot previo y el
  nuevo; misma `epoch`/`sequence` como punto de corte. Sin código en esta fase.
- **Arrastre de valores del snapshot previo** cuando un campo llega
  `Unavailable`: inútil hoy, porque los ViewModels solo muestran `current()` y un
  valor `Stale` se ve igual que uno ausente.

## Lo que hace el núcleo hoy (fase 0 + fase 1)

Standings: posición de clase (`Estimated`), gaps al líder / al de delante
derivados el uno del otro entre posiciones consecutivas (solo tiempos), gaps de
clase (fase 1) y vueltas restantes (`Estimated`). Radar: `domain::radar::project`
ya elige los coches cercanos desde las poses; el núcleo solo garantiza poses
finitas. Pedales: telemetría del jugador saneada. Jugador: combustible (consumo
medio y autonomía) y delta de respaldo (`Estimated`), con memoria entre fotos en
el `Core`.

## Fase 1: derivaciones de señales (ISA-1425)

Origen leído completo: `derive/fuel.rs` (494 líneas), `derive/delta.rs` (1024
líneas) y `derive/gaps.rs` (414 líneas) de
`C:\tmp\vantare-review-1403\vantare-v2\rust\telemetry\src` (SHA `db524bf7`).
Alcance: `native/runtime/src/core/{derive,fuel,delta,merge,mod}.rs`.

### Qué se portó y cómo

| Original | Aquí |
|---|---|
| `fuel.rs` | `core/fuel.rs`: consumo por vuelta `nivel al abrir − nivel al cerrar`, media móvil de 3 (el original la configuraba hasta 10), invalidación por repostaje >0,05 L o boxes en cualquier foto de la vuelta, y salto de vueltas que reinicia sin medir. Salida: `fuel.per_lap_l` y `fuel.laps_left = level_l / per_lap_l`. |
| `delta.rs` | `core/delta.rs`: referencia = mejor vuelta completada, muestreada cada 100 ms de **tiempo de vuelta**; delta = `lap_elapsed_s` actual − interpolación lineal de la referencia por distancia. |
| No existía | Gaps de clase en `derive.rs::class_gaps`: la clase como vecindad, restando los gaps **generales** contra el líder de clase y contra el de delante, con el encadenado de `gaps` como respaldo. El líder de clase queda a 0 s. |
| `derive.rs::session_remaining` (tiempo) | No portado (lo declara el adaptador). Nuevo: `laps_remaining = laps_total − vueltas completadas por el líder` (posición 1), solo con `laps_total` actual. |

El estado entre fotos (ventana de consumo, vuelta candidata y referencia) vive
en `Core.trackers` (`merge.rs::Trackers`), fuera de `domain`, y se reinicia al
cambiar `session.id` o el coche del jugador. Sin reloj de pared.

### Defectos del original evitados

1. **Acoplamiento al simulador** (`impl FuelValue for crate::lmu::Fuel` y los
   genéricos `VehicleState<S, F, D>`): aquí los tipos son de `domain`.
2. **Reloj de pared** (`captured_utc_ns`, `source_time_ns` por coche): la
   matemática usa `lap_distance_m` y `lap_elapsed_s`, y la cadencia de muestreo
   pasa a ser tiempo de vuelta. Replay determinista.
3. **`expect`/`unreachable!`** de `fuel.rs`/`delta.rs`: ninguno; un caso
   imposible devuelve `None` y no se escribe nada.
4. **Ceros fabricados** (`invalid()` devolvía `0.0`): aquí no se emite derivado
   sin medida.
5. **Frescura paralela** (`FuelFreshness`, `DeltaFreshness`, `Field`): sustituida
   por `domain::Quality`; lo obsoleto o ausente se re-deriva y la bajada a
   obsoleto la hace `Core`/`degrade`.
6. **Historial sin consumidor** (`history` ≤64/≤120, `window_laps`,
   `last_lap_liters`, `previous_lap`, `personal_best`, `session_best`): no se
   porta; el modelo no tiene campo donde ponerlo.
7. **Máquina de estados candidato/referencia** (ownership, `pending_wrap`,
   `pending_reset`, ~500 líneas): reducida a lo necesario porque
   `lap_elapsed_s` ya es el tiempo desde el inicio de vuelta (el `candidate_at`
   del original). Desviaciones documentadas: el tope de muestras deja de
   muestrear en vez de invalidar la vuelta; el cruce de meta se detecta por
   caída ≥100 m y se completa cuando sube el contador; el delta se emite
   también en la foto del cruce si la referencia interpola.

### Tests

`fuel.rs`, `delta.rs` y `derive.rs` cubren con datos sintéticos el consumo y la
ventana de 3 vueltas, la invalidación por repostaje y boxes, las vueltas
restantes, la referencia de la mejor vuelta, la interpolación, el cruce de meta
sin contador, el hueco de datos y que **un dato nativo actual gana** en las
cuatro derivaciones (`laps_remaining`, gaps de clase, `per_lap_l`/`laps_left` y
`delta_best_s`). En `mod.rs` y `merge.rs` se prueba que la memoria sobrevive
entre fotos dentro del mismo `Core` y se descarta al cambiar de sesión o de
coche.


## Fase 2 — señales comunes / DTO v4 (#1427, 2026-09-30)

Esta sección actualiza las decisiones de fase 1 anteriores; no cambia widgets.

- `Car.relative_s` y `relative_laps`: derivación sin memoria. Vueltas = truncado
  hacia cero del progreso relativo; las distancias deben estar en [0, longitud).
  Segundos = diferencia de cronómetros, envuelta con `round` al periodo del
  jugador (mejor vuelta actual válida, o última); positivo = rival delante.
  Go (`internal/telemetry/derive/gaps.go`) usa `EstimatedLapTime`: best/last es
  aquí una aproximación, siempre `Estimated`. Boxes Reliable true anula solo
  los segundos. Sin jugador no se conserva ninguna señal relativa anterior.
- Combustible: esperar al primer incremento consecutivo del contador antes
  de abrir una medida. Diez medidas históricas `(vuelta completada, litros)`,
  de antigua a reciente; media de las tres últimas. Boxes/repostaje/huecos
  conservan la historia pero invalidan la medida abierta. El dominio usa
  `[Option<(u32, f64)>; 10]` para conservar `Player: Copy` sin modificar las
  proyecciones de otros workers; el DTO es una lista compacta (`[]` al empezar),
  y rechaza más de diez medidas. La degradación conserva las medidas históricas.
- Volante: LMU `mUnfilteredSteering` en +404 de la fila telem (no +436 filtrado);
  ACC `physics.steerAngle` f32 en +24. Ambos -1 izquierda/+1 derecha; fuera de
  rango o no finito = `Unavailable`, sin clamp. Vectores explícitos prueban
  extremos, centro, signo, offset y valores inválidos; no prueban conducción
  física. Capacidad `driver_inputs`, sin señal ni renderer propios por simulador.
- Delta: solo una candidata abierta tras cruce observado puede ser referencia,
  y debe cerrar con otro cruce y muestras dentro del 2 % inicial/final de la
  longitud de pista. Un inicio parcial, salto del contador sin cobertura o
  buffer de 18 000 muestras truncado no gana. Sin longitud actual no se deriva
  delta de respaldo. Cobertura no certifica validez deportiva ni continuidad de
  la trazada; el tiempo final sigue siendo el último punto medido (aproximación).
- `State.source_state`: núcleo Waiting (antes de observar), Live y Stale
  (silencio/reloj congelado/desconexión). `Lost` solo lo marca overlays: una
  copia degradada tras cinco segundos sin mensajes válidos del pipe, conservando
  origen, época y secuencia. Los latidos cuentan como actividad: un núcleo
  vivo sin fotos nuevas no se confunde con un pipe perdido. La siguiente foto
  real rearma el watchdog. `degrade` vive en dominio, sin alterar su semántica;
  `degrade` y `sanitize` desestructuran las señales sin `..`.
- Cola de overlays: cuatro fotos, desaloja las antiguas sin bloquear al lector;
  su receptor de desalojo no impide terminar al cerrarse la última ventana.
  El subscriber reintenta una versión incompatible y registra el motivo una
  sola vez por instancia; tres handshakes con v3 verifican un único diagnóstico.
- DTO v4, veinte escenas migradas: valores anteriores conservados, nuevas
  señales ausentes y vínculo Live. `domain/src/lib.rs` solo añade las
  reexportaciones necesarias de `SourceState` y `degrade` definidos en model.
  No hay dependencias nuevas, cambios de widgets, capture ni Workshop.

### Bloqueo de integración fuera de las rutas del worker

Los gates workspace necesitan migrar cuatro literales exhaustivos **solo de
tests**, en módulos de widgets excluidos del encargo. Se dejan intactos:

| Archivo de domain/src | Línea en la base | Añadir al literal |
| --- | ---: | --- |
| `fuel_strategy.rs` | 113 | `history: [None; 10]` en Fuel |
| `pedals.rs` | 68 | `steering: Quality::Unavailable` en Telemetry |
| `pedals_telemetry.rs` | 135 | `steering: Quality::Unavailable` en Telemetry |
| `standings.rs` | 189 | `source_state: crate::SourceState::Live` en State |

No se debilitan ni se excluyen estos tests del gate: `cargo clippy --workspace
--all-targets -j 2 -- -D warnings` y `cargo test --workspace -j 2` quedan
bloqueados por E0063 hasta la migración del orquestador. Los checks acotados no
sustituyen esos gates. Notion no se ha leído/escrito, por la excepción expresa
de Isaac en el encargo; GitHub #1427 se leyó, sin cambiar su estado. Sin push,
PR, merge, promoción ni release.

### Verificación del worker

- `cargo fmt --check`: pasa.
- `cargo clippy --workspace --all-targets -j 2 -- -D warnings` y
  `cargo test --workspace -j 2`: exit 101, los cuatro E0063 anteriores.
- `cargo clippy --workspace --exclude vantare-domain --all-targets -j 2 --
  -D warnings` y `cargo clippy -p vantare-domain --lib -j 2 -- -D warnings`:
  pasan. Son checks acotados, no un workspace verde.
- `cargo test -p vantare-runtime -p vantare-ipc -p vantare-ui -j 2`: pasa;
  runtime 153 unitarios, IPC 28 unitarios/8 pipe, UI 82 unitarios. Además pasan
  los binarios e integraciones, incluido `lmu_oracle` (5 tests), ACC (2) y LMU
  (9) de conformidad. Cuatro pruebas preexistentes requieren simulador o
  ejecución manual y siguen ignoradas; no se afirma runtime físico.
- `cargo test -p vantare-domain --test architecture -j 2`: pasa (1 test).
- `go test -p 2 ./tools/native-oracle` y `go vet -p 2 ./tools/native-oracle`,
  con `GOMAXPROCS=2`: pasan. El oráculo congelado no exporta relative, volante
  ni historia de combustible; no se cambian sus campos, corpus ni goldens.
- Las regresiones de combustible iniciado a mitad de vuelta y delta parcial
  se reprodujeron antes de corregirlas (fallaban); ahora pasan.
- Las veinte escenas mantienen todos sus valores anteriores al eliminar los
  nuevos campos y restaurar `version` para la comparación estructural.

`compare.ps1` se ejecutó antes/después sobre ventanas productivas, interceptando
solo el argumento Cargo `-j 4` del script para limitarlo a `-j 2`, sin editarlo.
Umbral por canal 8, máximo 4 %; no se modificaron referencias:

| Escena | Diferencia con referencia antes | Después | Cambio RGBA antes/después |
| --- | ---: | ---: | ---: |
| radar | 1057/48400 (2,1839 %) | 1057/48400 (2,1839 %) | 0 píxeles |
| delta | 1005/26880 (3,7388 %) | 1005/26880 (3,7388 %) | 0 píxeles |
| standings-44 (legacy) | 6341/172536 (3,6752 %) | 6341/172536 (3,6752 %) | 0 píxeles |

Para standings legacy se usaron `ui/fixtures/standings-44.snapshot.json` y la
referencia Wails congelada existente en
`C:/tmp/vantare-parity-wails/vantare-v2/tools/native-ui/parity/reference/standings-44.png`.
La pareja `standings.snapshot.json`/`ui/reference/standings.png` de fase 2 tiene
otra geometría y no sirve como referencia del renderer legacy de esta base.
Los logs y capturas locales quedan en `C:/tmp/vw2-senales-evidence/`.

Pendiente del orquestador: migrar esos cuatro literales en sus rutas y volver
a ejecutar los gates completos antes de integrar. Validar físicamente el signo
del volante con LMU/ACC y el watchdog cerrando el núcleo; los vectores de SDK,
las pruebas de pipe y las capturas fijas no sustituyen esa validación.
