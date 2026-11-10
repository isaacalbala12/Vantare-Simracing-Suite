# Evidencia histórica de compilación (#1465 / #1654)

Conservada al actualizar el flujo en #1993. Estas cifras y decisiones son
históricas; no describen la configuración ni las mediciones de #1993.

### Medidas en el servidor (4 núcleos/8 hilos, 16 GB)

Un worker con el servidor libre, comandos de gates con DuckDB oficial. «Antes»:
nightly 79a1ace66 sin sccache (`-j 2` de nextest = 2 hilos de test y compilación
con los 8 hilos). «Después»: esta configuración, caché sccache ya llena por otro
worktree y `CARGO_BUILD_JOBS=4`.

Tabla de #1465/#1642 (15-oct, **antes de #1651 y #1654**): las filas de la suite,
`telemetria` y `CARGO_BUILD_JOBS` quedaron desfasadas al retirar los tests de
triage con PowerShell (#1651) y al pasar la máquina a 2 jobs con la cola por RAM
(#1654 r3). Pendientes de re-medir con la configuración actual; el cuaderno de
#1654 guarda el protocolo y los números de CI.

| Medida | Antes | Después |
| --- | --- | --- |
| Worktree nuevo → `check --workspace --all-targets` | 272 s | 129 s |
| `clippy` tras ese check | 79 s | 55 s |
| Worktree nuevo → nextest en verde | 765 s | 614 s |
| … de ellos, ejecutar la suite | 461–482 s | 343 s |
| Gate `telemetria` (ejecución) | 1190 s | 531 s |
| Editar `ui` → `check` incremental | 16 s | 11 s |
| Editar `ui` → recompilar tests | 44 s | 30 s |
| `vantare-hub`, perfil `prueba`, worktree nuevo | 626 s | 351 s |
| Dos workers a la vez, build de tests en frío (sin caché) | 842 s | 625 s |
| Disco: check + clippy + nextest | 7,6 GB | 7,6 GB |

Lo que más pesa, medido en los logs de CI de la r1 (#1654, 2 hilos de test): la
suite (137 s Windows / 83 s Linux) la dominan `go_physical_tyre_parity` (27 s), los
seis `strategy::state_tests::isa1544_*` de hub (6–9 s cada uno, y cada uno ejecuta
el solver completo), `mutated_and_truncated_real_frames_never_panic` (8+8 s),
`actual_lnk_is_read_without_modification_or_execution` (10 s) y
`golden_corpora_reach_every_widget_through_the_pipe_without_hiding_current_values`
(6–8 s). En `telemetria` manda un solo test, `acc_real_corpus_matches_frozen_dtos`
(208 s Windows / 160 s Linux), que es un replay secuencial con hash acumulado y
comparación frame a frame: **no se puede paralelizar** sin cambiar la evidencia.
Los tests de triage ya no lanzan `powershell.exe` (#1651).

Medido y no aplicado: `[profile.test] incremental = false` ahorra 2,2 GB y 20 s
en frío pero recompilar tests tras editar pasa de 48 s a 78 s; `debug = 0` en los
crates propios ahorra 0,9 GB y 5 s pero quita fichero/línea de las trazas.
`cargo build -p vantare-hub` recompilaba ~25 crates frente a `--workspace` porque
cambiaban las features unificadas (`resolver.feature-unification` aún es inestable);
desde #1654 r3 hub declara `network` explícito, así que `-p vantare-hub` compila solo
y ya no recompila services y sus dependientes al alternar (quedan las diferencias de
`--all-targets` y `test-support`).
