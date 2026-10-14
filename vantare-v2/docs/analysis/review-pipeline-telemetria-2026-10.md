# Revisión del pipeline de telemetría nativo · #1606 / VANTA-46

Base original revisada: `69fa2d650c85df4184d5821ae4c032201789a1c1` (`origin/nightly` al inicio de la sesión T3).
Rama: `vantareapp/isa-1606-review-pipeline-telemetria`. Continuación por Codex CLI el 2026-10-14.
Isaac amplió el alcance: P1/P2 confirmado exige RED → arreglo → GREEN y un commit por hallazgo.

## Resumen de diez líneas para Isaac

1. La revisión cubre lectura LMU/ACC, Core, eventos, series, DuckDB y consumidores.
2. Se confirmaron ocho fallos P2; no se confirmó ningún P1.
3. El cierre podía perder el último evento ya publicado; ahora lo persiste.
4. Las identidades de slots LMU crecían sin cota; ahora respetan el presupuesto.
5. Un reloj ausente tras pausa podía devolver Live; ahora exige reloj válido.
6. LMU admitía posiciones duplicadas; ahora rechaza esa parrilla incoherente.
7. Un reloj de vuelta negativo podía romper la grabación de series; ahora deja un hueco.
8. Saltar o retroceder vueltas fabricaba una tendencia por vuelta; ahora la reinicia.
9. La ventana elegida de 4 s perdía muestras y el replay fallaba en medianoche; ambos tienen arreglo mínimo.
10. La entrega sigue aislada para revisión: pruebas locales y fixtures, sin juego físico, merge ni release.

## Mapa de archivos y flujo

Los únicos adapters nativos registrados son LMU y ACC (`native/runtime/src/adapter/mod.rs`).
No hay adquisición nativa de iRacing, AC, AC EVO ni AMS2 en esta base; los nombres
del contrato de producto no demuestran drivers implementados.

| Etapa | Archivos principales | Flujo y dueño |
| --- | --- | --- |
| LMU live | `runtime/src/adapter/lmu/{live,shm,gate,frame,translate,rest}.rs`, `rest/{poller,http}.rs` | SHM Win32 y REST local → frame validado → traductor → Observation. El plugin externo productor no está implementado aquí. |
| ACC live | `runtime/src/adapter/acc/{live,shm,udp,protocol,translate,velocity}.rs` | Physics/graphics/static SHM y broadcasting UDP → relojes independientes por señal → Observation. |
| Replay y captura | `adapter/lmu/{open,replay}.rs`, `adapter/acc/replay.rs`, `bin/vantare-grabar-{lmu,acc}/` | Lectura acotada de capturas `testdata`, reloj de captura; grabadoras separadas. |
| Contrato y normalización | `domain/src/adapter.rs`, `runtime/src/core/{mod,merge,derive,fuel,delta,stint,trend,situation}.rs` | Un escritor valida/sanea, deriva, vigila frescura y publica Snapshot inmutable con epoch/sequence. |
| Fotos e IPC | `runtime/src/core/publish.rs`, `runtime/src/service.rs`, `ipc/src/{dto,codec}.rs` y transporte | Demand y latest-wins → pipe Core → Hub/overlays; live DTO v10 estricto. |
| Eventos | `runtime/src/flows/{journal,event,recording,host,client,wire}.rs` | Snapshot → hechos/ring acotado → dueño I/O → JSONL opt-in y pipe eventos con cursor/ACK. |
| Series | `runtime/src/flows/{series,series_feed,series_codec,series_worker,analysis}.rs` | Muestras de jugador por vuelta → chunks de 64, cola acotada sin espera → worker externo → ACK durable/análisis puro. |
| DuckDB | `storage/src/{main,lib,inspection}.rs` | Un proceso/conexión secuencial; codec de series v1, transacción append/watermark, finish y páginas read-only. |
| Análisis Hub | `hub/src/analysis/{mod,reader,model,insights,view}.rs` | Helper storage oculto read-only → summaries/plot-page → modelos/gráficos fuera de adquisición. |
| Widgets | `domain/src/{standings,relative,delta,fuel_strategy,input_telemetry,pedals_telemetry,...}.rs`, `ui/src/` y sus hosts/registro | Snapshot neutral → proyecciones/ViewModels puros → pintores GPUI; no leen el simulador. |
| Cierre | `runtime/src/shutdown.rs`, `runtime/src/bin/vantare/`, `flows/{host,series_worker}.rs` | Supervisor/Job y cancelación de transportes/workers; cada dueño debe cerrar su cola/disco. |

Las rutas de la tabla son relativas a `native/`. Journal JSONL y series DuckDB
son contratos distintos. `--recording` del Core activa el journal; no demuestra
que el launcher arranque SeriesWorker o grabe automáticamente una DB de series.

## Método y cobertura

La sesión T3 anterior completó cuatro lotes Muse Spark 1.3 contributor, proveedor `opencode`, solo lectura,
sin delegación adicional: LMU; ACC; Core/flows/storage; Hub/widgets/IPC.
El proveedor rechazó `variant=max` (opciones admitidas hasta `xhigh`); se usó
`xhigh`, sin afirmar que se ejecutó max. La revisión principal verifica cada
candidato con el código y, para P1/P2, reproducción antes del arreglo. La
reanudación CLI no crea subagentes: conserva tres commits recuperados, revisa
todo el diff pendiente y revalida sus regresiones.

No se abre la app ni se miden CPU/RAM/GPU del producto. Builds seriales por
`compilar.ps1`, `CARGO_BUILD_JOBS=2`, target propio del worktree y cola de RAM.
Solo se usan fixtures versionadas y archivos temporales; no ajustes/DB del usuario.

## Hallazgos

Ocho P2 confirmados. Las rutas siguientes son relativas a `native/`;
el número corresponde al código de la entrega. Las mutaciones de fixtures
son fronteras declaradas en tests, no nuevas capturas reales. Los logs están
en `C:/tmp/1606-evidence`. GREEN conjunto final: 18/18 focales PASS
(`focus-green.stderr.log`); incluye las diez regresiones de esta revisión y
ocho protecciones existentes del historial. Gates completos PASS.

| ID | Prioridad / escenario y efecto | Evidencia y RED | Arreglo mínimo / regresión |
| --- | --- | --- | --- |
| F1 | P2 · Cerrar Core inmediatamente después de publish puede perder el último hecho del journal opt-in. | `runtime/src/flows/host.rs:132`; `event-close-red.log`: durable_cursor=None frente a cursor (1,1). | Última réplica antes de salir, comparando también tail del journal. `shutdown_persists_the_last_published_cut_before_owner_exits`; commit `bafe4849`, GREEN previo `event-close-green-2.log`. No promete salvar un proceso matado ni disco que falla. |
| F2 | P2 · Rotación prolongada de slots LMU conserva identidades antiguas sin límite. | `runtime/src/adapter/lmu/translate.rs:302`; `slots-red.log`: 643 entradas con presupuesto 512. `car-counter-red.log`: overflow al forzar el contador máximo. | Recortar ausentes antes de construir la foto y preservar IDs presentes; comprobar next_car antes de sumar. `rotating_scoring_slots_stays_bounded_and_preserves_present_car_ids` y `exhausted_car_counter_rejects_before_assigning_a_wrapped_id`; commit `baf4c861`. El agotamiento u32 es defensa de frontera, no incidencia física observada. |
| F3 | P2 · Una lectura NaN del reloj después de una pausa confirmada rejuvenece la fuente como Live. | `runtime/src/adapter/lmu/translate.rs:122`; `pause-clock-red.log`: Live frente a Stale. | Exigir `Some` nuevo para reanudar. `missing_source_clock_cannot_resume_a_confirmed_pause`; commit `a4d124ab`, GREEN previo `pause-clock-green.log`. |
| F4 | P2 · Dos filas LMU con igual posición se publican como parrilla válida. | `runtime/src/adapter/lmu/frame.rs:174`; `positions-red.log`: frame admitido frente a InvalidActiveGrid al duplicar el byte +199. | Rechazar posiciones duplicadas junto con slots duplicados. `duplicated_native_positions_are_rejected_before_publishing_two_leaders`; GREEN en `focus-mixed.log`. No inventa un orden alternativo. |
| F5 | P2 · mLapProgress negativo finito pasa del adapter LMU a Core y al feed; el codec rechaza el chunk y el worker no puede grabarlo. | `runtime/src/core/merge.rs:228`, `adapter/lmu/frame.rs:289`, `flows/series_worker.rs:145`; `signals-native-red.stderr.log`: falla to_bytes desde frame real con +464=-2. `signals-red.log`: señales neutrales inválidas llegan a muestras. | Saneamiento antes de derivar/grabar: tiempo/distancia/velocidad/RPM no negativos, pedales [0,1], invalidación a Unavailable sin clamp. `negative_native_lmu_lap_clock_does_not_break_the_series_codec` y `invalid_numeric_signals_cannot_poison_the_recording_feed`. Hueco preservado. |
| F6 | P2 · Saltar 5→7 o retroceder 5→3 calcula una diferencia de gaps como si fuera una sola vuelta. | `runtime/src/core/trend.rs:34`; `trend-red.log`: Estimated(-6) frente a Unavailable. | Solo derivar al pasar exactamente a la siguiente vuelta; volver a medir desde esa base. `skipped_or_rewound_laps_do_not_become_a_one_lap_trend`; GREEN en `focus-mixed.log`. |
| F7 | P2 · Elegir 4 s en Input Telemetry a 20 ms conserva solo 120 puntos, unos 2,38 s. | `domain/src/input_telemetry.rs:47`; `focus-mixed.log`: 120 frente a 201 en `selected_windows_retain_the_full_span_at_native_cadence`. El widget llama push_with_window en `ui/src/input_telemetry/mod.rs:100`. | Ventana explícita conserva hasta 401 muestras para 8 s, incluso al elegir 4 s. `push` heredado sigue con 120, preservando su referencia/test. Sin diseño ni pintor nuevo. |
| F8 | P2 · Una captura válida cruzando medianoche UTC deja de reproducirse tras el primer frame. | `runtime/src/adapter/lmu/open.rs:185`; `midnight-red.log`: "el corpus no debe cruzar de día". | Delta de fecha UTC real con chrono ya existente. `captured_lmu_frames_replay_across_utc_midnight`: cambio de día/año y 29 de febrero, frames intactos y manifiesto de frontera. Fechas inválidas siguen rechazadas; GREEN en `focus-mixed.log`. |

El primer intento del test adicional F5 no compiló por usar un módulo privado;
`signals-native-compile-error.log` se conserva y no cuenta como RED de comportamiento.
Tras usar la reexportación pública, el RED se produce en el codec, y se restaura
el saneamiento mínimo para GREEN. La pasada mixta de reanudación dio 8/9:
su único fallo era F7, que aún no estaba arreglado.

## Validación, publicación y pendiente

- Commits por hallazgo: F1 `bafe4849`, F2 `baf4c861`, F3 `a4d124ab`,
  F4 `33f9a87a`, F5 `e53fcf49`, F6 `3172ce9f`, F7 `830e8fad`, F8 `606bcf31`.
- Integridad repetida por CLI: quality/check PASS y retirement 456/456 PASS.
- Gates nativos: fmt/check y Clippy `-D warnings` PASS; Nextest 1656/1656
  PASS (7 skips heredados, 1 slow que termina PASS). Lifecycle 18/18 PASS;
  telemetría (#1498) 25/25 PASS, 0 skips (4 slow). Todo por cola, jobs=2 y
  `native/target/gates` exclusivo de este worktree. Cada comando largo
  de reanudación final tiene límite de 3600 s, sin rebajar el umbral de RAM.
- Código final probado: `830e8fad`, árbol `native/`
  `e8b90f1eb6225804e0866f705d41a33b2c3963dc`. Logs finales
  `{check,clippy,test,lifecycle,telemetria}-full.log` y `gates-status.log`.
  El caso ACC completo tardó 945,009 s; es duración del test, no medición del
  producto. No se cambian oráculos, tolerancias, filtros ni skips para pasar.
- Fragmento `docs/changelog/fragments/ISA-1606.json` validado con el validador
  existente. Diff completo y ausencia de marcadores de conflicto verificados.
- Base original `69fa2d65`; fetch de reanudación observa nightly `0807fbd0`.
  No se incorpora silenciosamente otra entrega ni se cambia de canal.
- Pendiente: revisión del PR draft por el orquestador y QA física LMU/ACC.
  Probar cierre opt-in con evento al final, pausa/reanudar, cambios de parrilla,
  saltos de vueltas y ventanas de historial; comprobar que captura/replay de
  medianoche mantiene tiempos. Usar portable/datos de prueba separados.
- No se ha confirmado otro P1/P2 en ACC, storage, IPC o Hub en esta revisión.
  Los candidatos sin escenario probado están contrastados abajo; no equivalen
  a certificación física ni a ausencia de todos los bugs posibles.

Estado verificado el 2026-10-14: rama publicada, issue #1606 OPEN,
Plane VANTA-46 Por revisar y GitHub Project Vantare In Review.
[PR draft #1616](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1616)
OPEN a nightly `0807fbd0`; comprobación de compatibilidad con `git merge-tree`
sin conflictos, sin modificar ramas ni hacer merge. No había checks remotos
emitidos al crear el draft; HEAD/CI finales quedan releídos en la issue y el
buzón tras el último push. No hay milestone asignado ni compromiso nuevo de release.

### Repetir los checks

Desde `vantare-v2/`, en este worktree (DuckDB de desarrollo ya preparado):

```powershell
$env:CARGO_BUILD_JOBS = '2'
$env:CARGO_TARGET_DIR = 'target/gates'
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo fmt --manifest-path native/Cargo.toml --all -- --check
# Repetir con check, clippy, test, lifecycle y telemetria:
pwsh -NoProfile -File native/scripts/compilar.ps1 pwsh -NoProfile -File native/gates.ps1 -Gate check
# Regresiones específicas de esta revisión:
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo nextest run --manifest-path native/Cargo.toml -p vantare-runtime -p vantare-domain --lib --locked --offline -j 2 -E 'test(shutdown_persists_the_last_published_cut) | test(rotating_scoring_slots) | test(exhausted_car_counter) | test(missing_source_clock) | test(duplicated_native_positions) | test(invalid_numeric_signals) | test(negative_native_lmu_lap_clock) | test(skipped_or_rewound_laps) | test(selected_windows_retain) | test(captured_lmu_frames_replay)'
```

La pasada CLI completa agrupa gates en una sola entrada a la cola; se canceló
solo la espera propia inicial de `check`, antes de iniciar cargo. El `fmt-check`
que ya había terminado se conserva. No se interrumpieron builds de otros workers.

## Contraste de candidatos Muse

No se copian sus prioridades: se clasifican por escenario alcanzable y coste para
el piloto. Un test ausente o una preferencia de producto no es un fallo probado.

| Candidato | Verificación principal / decisión |
| --- | --- |
| ACC reinicio crea otro mapping del mismo nombre mientras el viejo sigue abierto | No confirmado: el handle mantiene vivo el objeto Win32 con nombre; un productor que lo abre/crea con el mismo nombre accede al mismo objeto, no a una segunda identidad simultánea. Falta prueba física del productor ACC. No se cambia SHM por esta hipótesis. |
| ACC un rival obsoleto borra todas las posiciones | `coherent_positions()` mantiene rangos nativos coherentes; solo respalda con tabla anterior vigente cuando la nueva es incoherente. Permitir rangos contradictorios o rejuvenecer un grid viejo inventaría posiciones. Sin reproducción de pérdida indebida no se cuenta P1. |
| ACC ENTRY_LIST nunca reintenta | Los CarUpdate de un coche sin entry vuelven a activar `request_entries`; el envío está limitado a 1 s. El silencio UDP provoca reconexión. La pérdida de una respuesta con feed vigente sí reintenta. |
| ACC velocidad corta al cruzar meta | El reloj por vuelta no es comparable a través del reinicio; cortar hasta nuevas poses compatibles es la decisión documentada. Mantener un vector viejo sin observación comparable no sería evidencia fresca. |
| ACC dirección sin test / protocolo con sufijo desconocido | Ausencia de prueba direccional se registra como límite. Rechazar un layout v4 desconocido es fail-closed; no se acepta un futuro protocolo supuesto. |
| ACC request_track cada segundo | Reintento acotado: una petición de 5 bytes/s no demuestra CPU alta ni fallo P2. |
| Core velocidad replay cero/NaN | CLI valida velocidad finita, positiva y <=1000 antes de llamar al servicio. No hay entrada pública de pausa por speed=0; el ejemplo propuesto no reproduce un fallo del producto. |
| Delta Nordschleife supera 18k a 60 Hz | El tracker muestrea cada 0,1 s, no cada foto: 18k son aproximadamente 30 minutos de vuelta. La cuenta de 600 s ×60 Hz del candidato es incorrecta. |
| Fuel calcula a través de un frame ausente; stint al entrar tarde | No conocer el comienzo impide afirmar consumo completo o duración del stint. La ausencia/Estimated conserva el contrato; no se inventa un inicio en la conexión. |
| Series espera contador tras retroceso | Distancia/tiempo reiniciado puede preceder al contador. Insertar de nuevo bajo la misma vuelta violaría el codec monotónico. Recuperación de un glitch sin evidencia de identidad necesita diseño, no un assert de más muestras. |
| Estimated confirma OnTrack y journal PitEvent | `Unknown` conserva overlays visibles; no los oculta. Los eventos exigen observaciones Reliable para evitar anunciar una entrada inferida como hecho. |
| Reader falla con coches intercalados | El productor actual serializa bloques del jugador, sin vueltas/coches intercalados. El resumen delimita identidad y next_chunk. No se inventa soporte multicoches de otra DB. |
| thin borra huecos y une la curva | Los IDs de segmento crecen al detectar hueco; descartar puntos intermedios no vuelve iguales los segmentos de ambos extremos. Puede perder un tramo pequeño, pero no demuestra la unión falsa alegada. |
| Delta trace vacía al cambiar referencia | Los valores relativos a dos referencias diferentes no son comparables; cortar conserva la semántica. |
| Demanda parcial retiene foto previa 1–2 ticks | La negociación hidrata la demanda antes de ingest; sin demostrar que supera el plazo de frescura no se cuenta un fallo P2. |
| Epoch 0 y resuscripción de series | Contrato de arranque usa época de reloj de pared positiva y feed único configurado antes de adquirir. Resuscribir mitad de stream sin nueva identidad/prefijo viola la recuperación documentada. |
| Recording >256 bytes / resúmenes 255 vs256 | Los eventos actuales son numéricos y acotados; falta un evento productivo sobredimensionado. Storage reserva 255 cerrados +1 activo, tope 256 total; no confundir ese tope con 256 cerrados +1 activo del worker. |

El revisor de flows leyó el test de cierre mientras estaba en RED y lo llamó
"falso positivo". Ese test era nuevo de esta revisión, aún no se había presentado
como PASS; se conserva la evidencia ejecutada antes/después.

## Límites

Los replays prueban el contenido capturado y el código ejercitado, no carreras
físicas de acceso a SHM, latencia del juego, pérdida UDP real, CPU/RSS de una
sesión live, ni plugins externos no incluidos en el repositorio. No hay release,
merge ni promoción autorizados en este encargo.
