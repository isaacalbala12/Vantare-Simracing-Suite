# Segunda ronda de señales — #1428 / #1427

Worker Codex; revisión pendiente de Claude Opus 5.5. Rama
`vantareapp/isa-1428-w-senales2`, base de trabajo
`63a59d0762f33b7e20455a0bc14dee073be175a6`.
Notion no disponible; excepción explícita del encargo del 2026-09-30.
No se declara seguimiento Notion completado ni integración remota.

## Contrato y cobertura

- DTO v5 añade `Car.velocity_mps: Quality<[f64; 2]>` y
  `Car.pending_penalties: Quality<u32>`. La sanción del jugador es la del
  coche identificado por `State::player_car`; no hay una copia en Player.
- Velocidad horizontal nativa LMU por scoring, rotada al marco de Pose.
  Calidad propia; no se deriva de posiciones. ACC: vector Unavailable.
- LMU: contador pendiente exacto. ACC: cero declarado o límite inferior
  Estimated(1) para DT/SG; ningún total exacto ni contador de rivales.
  Semántica y fuentes: `runtime/src/adapter/{lmu,acc}/REVIEW.md`.
- Saneado/degradación exhaustivos sin `..` para Car; DTO ida/vuelta conserva
  las cuatro calidades y rechaza campo ausente/versiones incompatibles.
- Spotter entra en la cola de radio existente: posiciones/velocidades/boxes
  fiables, filtros de cierre, izquierda/derecha/tres en paralelo, ACK,
  deduplicación, revalidación y retirada. Sin clips no produce audio.
- Migración mecánica de 22 escenas: 162 fotos / 366 coches. Comparación
  estructural con HEAD prueba que solo cambian versión y dos unavailable.
- No hay widgets, Hub, dependencias, manifests ni lockfiles modificados.

## Evidencia visual

Tres capturas de escritorio serializadas por el mutex de compare.ps1:

| Widget | Frente a referencia (umbral 8) | Antes/después (umbral 0) |
| --- | --- | --- |
| pedals | 3.9323 % | 0 / 19200 píxeles |
| radar | 2.1839 % | 0 / 48400 píxeles |
| standings | 3.6641 % | 0 / 292160 píxeles |

`compare.ps1` fija -j 4. Se copia fuera del repo a
`C:/tmp/senales2-compare.ps1`, cambiando solo a -j 2 y resolviendo el directorio
del script. La captura original se conserva con el binario DTO v4 anterior
y las escenas de HEAD. La comprobación final ejecuta el helper completo,
incluida compilación -j 2, y el diff.py original; son pruebas de píxel,
no medidas de rendimiento. Capturas en `C:/tmp/senales2-{before,final}/`;
log final `C:/tmp/senales2-pixels.log` (exit 0).

Binario original SHA256: `FF557C549694D7EC755B5EEFCBE007E85B27C5FDE9FA8CF20726A6E9DE372CFB`.
Binario v5 final SHA256: `475874DADEE898B5F84F83C8154F9825741E64EA4AEF31D70DDBA4C40583B8B0`.

## Gates

Rust 1.95.0; compilación siempre -j 2. Resultados de esta ronda, que no
sustituyen ni atribuyen a esta entrega los gates históricos de los adaptadores:

| Comando | Resultado |
| --- | --- |
| `cargo fmt --check` | PASS, exit 0; `C:/tmp/senales2-fmt.log`. |
| `cargo clippy --workspace --all-targets -j 2 -- -D warnings` | PASS, exit 0, sin warnings; `C:/tmp/senales2-clippy.log`. |
| `cargo test --workspace -j 2 -- --test-threads=2` | FAIL, exit 101: una aserción de versión ACC fuera de las rutas autorizadas; `C:/tmp/senales2-test.log`. |
| `cargo test --workspace --no-fail-fast -j 2 -- --test-threads=2` | FAIL, exit 101: mismo y único fallo; 639 pruebas pasan (incluidos 11 escenarios del harness de ciclo de vida), 1 falla y 4 físicas ignoradas; `C:/tmp/senales2-test-all.log`. |
| `go test ./tools/native-oracle/...` | PASS, exit 0, `ok ... 0.234s`; `C:/tmp/senales2-go-oracle.log`. |
| `go vet ./tools/native-oracle` | PASS, exit 0; `C:/tmp/senales2-go-vet.log`. |
| `git diff --check` | PASS, exit 0. |

Pasan las nueve pruebas nuevas: cinco Spotter, una LMU, una ACC, una saneado/
degradación y una DTO. Pasan las cinco pruebas Rust contra el oráculo Go
congelado, conformidad LMU (9), conformidad ACC (2), IPC (29 + 8 pipe),
UI (98) y Hub (54). Las cuatro ignoradas requieren LMU REST, LMU SHM en dos
ejecutables y ACC activo; no se iniciaron simuladores.

**Bloqueo del gate global:** `native/runtime/tests/acc/completion.rs:208`
compara la versión emitida con `4`; ahora recibe `5`. Su función en línea 187
se llama `common_core_derives_gaps_keeps_native_fuel_and_roundtrips_dto_v4`.
La ruta pertenece a otro alcance. No se editó, omitió ni debilitó la prueba.
Su propietario debe migrar la aserción a `5`, el nombre a `dto_v5` y el texto
`expect("DTO v4")` a `DTO v5`, y repetir el gate completo. La aceptación queda
pendiente; el hito local conserva este fallo para revisión del orquestador.

Las primeras ejecuciones con paralelismo de tests predeterminado encontraron
además `PermissionDenied` al limpiar un directorio temporal en
`native/hub/src/launcher/tests.rs:31`. Hub no se tocó; su suite final pasó
con dos hilos de test. Logs previos conservados en
`C:/tmp/senales2-test-{initial-failed,hub-repeat-failed}.log`; esa pasada final
no demuestra que la limpieza concurrente sea estable con más hilos.

## Límites y siguiente revisión

No se prueba LMU/ACC live con sanciones ni audio físico/Kokoro/OBS.
El oráculo Go congelado conserva su esquema: protege las señales antiguas,
no certifica las dos nuevas, cubiertas por tests de frontera SDK explícitos.
No se implementan tipos/causas/plazos de sanciones, familia audible de
sanciones, servicio de boxes, limitador ni timings/consultas históricas.
Fuentes candidatas y contratos que faltan: `engineer/README.md`.
No se añade una capability nueva fuera de las rutas autorizadas: Spotter
exige calidad propia de cada campo, nunca deduce disponibilidad del pipe.
Confirmar en revisión que el límite inferior ACC se presenta como estimación
y programar evidencia física y escucha de clips antes de aceptación de fase.
No se declara paridad completa de debounce/avisos clear con Go.

## Comprobación manual

Desde `native/`, recompilar juntos Core/Engineer/overlays para DTO v5.
Arrancar Core con `--live` y `vantare-engineer --pipe --cursor` con una ruta
de checkpoint propia, siguiendo `engineer/README.md`. En LMU, con tráfico real
en paralelo y velocidad >10 m/s, observar intents `spotter.car_left`,
`spotter.car_right` o `spotter.three_wide` en stdout. Al pausar/perder datos se
retira la presentación; sin carpeta de clips la voz permanece desactivada.
Una escucha con clips y sanciones reales en ambos simuladores sigue pendiente.
Para repetir píxeles, comparar las escenas migradas con los PNG antes del
cambio mediante `compare.ps1` con umbral/max-percent cero y compilación -j 2.

## Archivos del cambio

- `native/domain/src/model.rs`
- `native/engineer/README.md`
- `native/engineer/src/main.rs`
- `native/engineer/src/radio.rs`
- `native/engineer/src/spotter.rs`
- `native/engineer/src/worker.rs`
- `native/engineer/tests/lifecycle.rs`
- `native/ipc/src/codec.rs`
- `native/ipc/src/dto.rs`
- `native/ipc/src/lib.rs`
- `native/runtime/src/adapter/acc/REVIEW.md`
- `native/runtime/src/adapter/acc/translate.rs`
- `native/runtime/src/adapter/lmu/REVIEW.md`
- `native/runtime/src/adapter/lmu/frame.rs`
- `native/runtime/src/adapter/lmu/signals_tests.rs`
- `native/runtime/src/adapter/lmu/translate.rs`
- `native/runtime/src/core/merge.rs`
- `native/ui/fixtures/broadcast-tower.snapshot.json`
- `native/ui/fixtures/car-damage-numbers.snapshot.json`
- `native/ui/fixtures/car-damage-visual.snapshot.json`
- `native/ui/fixtures/delta-trace.sequence.json`
- `native/ui/fixtures/delta-trace.snapshot.json`
- `native/ui/fixtures/delta.snapshot.json`
- `native/ui/fixtures/fastest-lap.snapshot.json`
- `native/ui/fixtures/fuel-strategy.snapshot.json`
- `native/ui/fixtures/head-to-head.snapshot.json`
- `native/ui/fixtures/input-telemetry.sequence.json`
- `native/ui/fixtures/input-telemetry.snapshot.json`
- `native/ui/fixtures/lmu47.snapshot.json`
- `native/ui/fixtures/multiclass-relative.snapshot.json`
- `native/ui/fixtures/pedals-telemetry.snapshot.json`
- `native/ui/fixtures/pedals.snapshot.json`
- `native/ui/fixtures/racing-flags.snapshot.json`
- `native/ui/fixtures/radar.snapshot.json`
- `native/ui/fixtures/relative.snapshot.json`
- `native/ui/fixtures/standings-legacy.snapshot.json`
- `native/ui/fixtures/standings.snapshot.json`
- `native/ui/fixtures/track-map.snapshot.json`
- `native/ui/fixtures/track-weather.snapshot.json`
- `native/ipc/REVIEW.md` (este expediente local).
