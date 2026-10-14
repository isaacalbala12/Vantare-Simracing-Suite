# #1594 · correcciones de la re-review #1602 r2

Reanudación CLI del 14/10/2026 sobre `197547a1`, worktree limpio y commits
anteriores preservados. Informe leído completo: `C:/tmp/ola2/review-1602-sol-r2.md`.
Rama `vantareapp/isa-1594-triaje-informes`, base común con `origin/nightly`
`bc89c8b8400a0a7915e7496b6f339d8e8231359b`. Nightly consultado:
`0807fbd0d3d8e354706c580f1bc5f60469b202b4`; no integrado.

| Hallazgo | Commit | Regresión y evidencia RED → GREEN |
|---|---|---|
| F1 P1: identidades/Basic en JSON normal o escapado | `8add5b53` | Python `test_review_r2_f1_json_representations_never_reach_any_sink`; Rust `review_r2_f1_json_representations_are_removed_before_preview`. RED fuga Python y accountId escapado en prepare. GREEN casos del informe, profundidad 0–3, resumen del modelo, T3 y POST mock Intake; idempotencia/contexto/Unicode. Rust 9/9, Python completo 37/37. |
| F2 P2: token Plane bloquea T3/purga | `2f715252` | `test_review_r2_f2_plane_initialization_failure_preserves_t3_purge_and_retry` y `test_review_r2_f2_unit_plane_credential_is_optional`. RED main sale 1 antes de entregar/purgar. GREEN SQLite real y token ausente/vacío/permisos inválidos/denegados; conserva ACK y spool pendiente, recupera intento interrumpido, siguiente pasada entrega solo a Intake sin otro modelo. PASS Windows/POSIX y unidad temporal systemd. |
| F3 P2: redacción expande por encima de SQL | `ac366da0` | `review_r2_f3_expanded_redaction_fits_sql_and_retries_exact_preview`. RED con título `"::1 " * 30`, cuerpo trim `"::1 " * 250`: título final 359. GREEN límites de caracteres 120/1000 tras redactar, sin IP original; POST loopback 500/reintento con bytes idénticos al preview. 4/4 junto a F1, presupuesto HTTP y reintento existentes. |

La normalización solo retira barras de escape de comillas en una pasada.
No decodifica JSON ni Unicode. La limitación de texto ocurre antes del preview,
que muestra el contenido final que se consiente y se reintenta.

El sink configurado conserva su ACK aunque no pueda inicializarse. El token
dedicado se importa por nombre desde credstore; su ausencia no exige que systemd
falle antes de Python. Runbook actualizado; no busca el token personal del
tracker. [Contrato systemd v257](https://github.com/systemd/systemd/blob/v257/man/systemd.exec.xml).
Prueba local Ubuntu/systemd 259: unidad temporal con credencial sintética ausente
y `/bin/true`, `--wait --collect`, termina SUCCESS. No instala el worker.
La prueba local no acredita systemd del servidor .57; repetir este escenario
con una credencial sintética ausente durante el despliegue autorizado.

## Verificación

Evidencia local `E:/tmp/isa1594-r2-evidence/`: `f1-*`, `f2-*`, `f3-*` conservan
RED/GREEN. Python final 39/39 PASS (incluye 7 escenarios de arranque de F2);
F2 POSIX PASS con archivos temporales 0600/0644 reales. Python impide sockets
en los nuevos recorridos; modelo/T3/Plane simulados. Rust usa prepare real sin
hardware y servidor HTTP loopback sintético.

Gates finales completos: fmt/check/Clippy PASS; Nextest 1658/1658 PASS
(1 lento, 7 skips del perfil); lifecycle 18/18 PASS (5 + 13, cero fallos).
El primer Clippy falló por `default_trait_access` en la fixture F3. Se cambió
solo `Default::default()` por `BTreeSet::new()`, sin suprimir lint ni alterar
conducta; repetición completa GREEN. Se conserva `clippy-first-fail.log`.
Timeout 3600 s por comando, `CARGO_BUILD_JOBS=2`, target exclusivo
`E:/tmp/isa1594-native-gates`, cola `native/scripts/compilar.ps1`.
Wrapper de gates heredado verificado idéntico a `native/gates.ps1` salvo cwd y
target de salida; conserva los argumentos/features/checks y DuckDB oficial.

SQL y rollback intactos: SHA256 `0fd573956731e5ebc66b690a9c36bc9f51bf92d59327d0251311cdf0514cf6c9`
y `206dd6353bbb6cfa9d195b29d0c0776127627e0fccb3aea15ca5d51dfcf4e621`.
SQL/pgTAP no repetidos: no cambio SQL; F3 verifica las longitudes finales del
payload frente al CHECK versionado, sin ejecutar PostgreSQL.
Telemetría no repetida: no cambios runtime/domain/ipc/testdata; evidencia previa
25/25 permanece histórica. Sin UI nueva, sesiones físicas, modelos/proveedores,
T3/Intake reales, despliegue ni acciones Supabase de producción.

## Canal

PR [#1602](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1602) a
nightly convertido a draft; auto-merge OFF. VANTA-38/49 Por revisar verificado
al cerrar, GitHub Project Vantare/area:testing-center. Sin milestone nuevo.
Los tres arreglos están publicados en `ac366da095af1c652542bcd2e55844bf7b0b30a2`;
el commit de cierre añade la corrección de lint de la fixture y esta evidencia.
GitGuardian FAILURE y mergeStateStatus DIRTY verificados en remoto sobre
`ac366da0`; pendiente de clasificación/re-review. No se acredita CI verde,
merge, promoción ni release. Isaac coordina la siguiente re-review/integración.
