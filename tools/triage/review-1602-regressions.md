# Regresiones de la review #1602

STOP al merge de Isaac. Auto-merge desactivado; el orquestador encarga re-review
y merge. Ningún informe real enviado a Intake, proveedor o webhook. Worker
inerte y despliegue pendiente de un OK separado. Token propio de Plane se
creará al desplegar con autorización, sin bloquear el código.

Cada hallazgo se reprodujo antes de corregir producción, en su commit separado.
Solo datos sintéticos. Evidencia local RED/GREEN y manifiesto de hashes:
E:/tmp/isa1594-review-evidence/. Los logs no se versionan.

| Hallazgo | Commit | RegresiÃ³n RED -> GREEN |
|---|---|---|
| P1-1 Basic / sk- | b8a2289a | Rust `review_p1_1_basic_and_sk_hyphen_are_removed_before_preview`; Python `test_review_p1_1_basic_and_sk_hyphen_never_reach_model_or_delivery` |
| P1-2 variantes accountId | 92f88d5c | Rust `review_p1_2_account_label_variants_are_removed_before_preview`; Python `test_review_p1_2_account_label_variants_never_reach_model_or_delivery` |
| P1-3 UNC ajeno | ae18c39f | Rust `review_p1_3_foreign_unc_profile_is_removed_before_preview`; Python `test_review_p1_3_foreign_unc_profile_never_reaches_model_or_delivery` |
| P2-4 HTTP 64 KiB | 9bf5cd69 | Rust `review_p2_4_full_escaped_preview_fits_http_and_sends_exact_hashed_tail`: preview real, transporte DataRequest/Http loopback, SHA/bytes exactos, escape/Unicode |
| P2-5 spool / polling | 3a5112dc | Python `test_review_p2_5_main_drains_and_purges_spool_before_failed_poll`: main + State real, ACK y purga pese a OSError de polling |
| P2-6 intento interrumpido | fdb891a3 | Python `test_review_p2_6_restart_recovers_interrupted_attempts_without_a_fourth_call`; `test_review_p2_6_restart_reuses_spool_persisted_before_sqlite_result`: SQLite cerrada/reabierta, intentos 1/2/3 y legacy |
| P2-7 cursor / commit fuera de orden | b580ed6b | Python `test_review_p2_7_late_visible_report_behind_persisted_cursor_is_discovered_once`; `test_review_p2_7_seen_first_page_does_not_starve_later_unseen_reports`: psql mock + State real |

Adicional 9e6a352a: `windows_capture_without_hardware_emits_the_typed_document` RED -> GREEN por stdout vacÃ­o de PowerShell; amplÃ­a P1 al prepare/RPC real.

## Validación final local

- Rust fmt/check/Clippy PASS, sin suprimir lints. Nextest 1656/1656 PASS,
  7 skips del perfil, incluido el test lento go_physical_tyre_parity completo.
- Lifecycle 18/18 PASS (0 failed).
- Python 36/36 PASS: 16 originales, 12 mock Plane, 8 regresiones review.
- Ejemplo disabled: salida 1 esperada antes de credenciales/red/modelo.
- Quality: 456 huellas PASS. git diff --check PASS.
- Sin cambios runtime/domain/ipc/testdata en esta revisión: telemetría previa
  25/25 mantiene su ámbito; no se atribuye nueva ejecución a estos commits.
- Compilaciones por C:/tmp/fase2/compilar.ps1; gates.ps1 conserva hash
  4bf059b610403c65dd592ca6c9a3e936aa4b2318351a6cee4d758bcaec0fb29d.
  Wrapper local cambia solo cwd/output a E, conservando args/features/checks.
- No Go/frontend ni dependencias nuevas. No prueba proveedor/CLI instalado,
  JWT/PostgREST/UI de producción, sesiones físicas ni webhook/Intake reales.

Clippy detectó labeled_secrets 105/100 líneas tras ampliar Authorization;
se extrajo el consumo del esquema a un helper sin cambiar su comportamiento.
Los gates completos posteriores, incluidas las regresiones P1, pasan.

## Reproducción sin servicios externos

Python: `python -B -m unittest discover -s tools/triage -p 'test_*.py'`.
Rust, desde native: `pwsh -NoProfile -File C:/tmp/fase2/compilar.ps1 cargo nextest run -p vantare-services --locked --offline -j 2 -E 'test(review_p1_) | test(review_p2_4_) | test(windows_capture_without_)'`.
Para gates completos, ejecutar native/gates.ps1 con check/clippy/test/lifecycle
mediante compilar.ps1 y DuckDB oficial, además de cargo fmt --all --check.
No se debe habilitar enabled/privacy_approved ni probar contra un servicio real.

## Migración

Aplicada anteriormente con autorización del orquestador. Ninguna acción SQL en
producción durante esta revisión. Archivos SQL/rollback sin cambios, hashes
verificados de nuevo: 0fd573956731e5ebc66b690a9c36bc9f51bf92d59327d0251311cdf0514cf6c9
/ 206dd6353bbb6cfa9d195b29d0c0776127627e0fccb3aea15ca5d51dfcf4e621.
Se conserva el postcheck original ACL/RLS 25/25; no hay cron, LOGIN/password,
activación del proveedor ni despliegue nuevos.

## Estado de CI remoto al entregar

GitGuardian Security Checks: FAILURE, seis apariciones de las fixtures sintéticas
Basic/PostgreSQL de esta suite; reporte vinculado a b8a2289a y b580ed6b en
los archivos de tests Rust/Python. No son credenciales reales. Los gates locales
anteriores siguen PASS; CI remoto no se declara verde. Incidentes pendientes de
clasificación durante la re-review de Isaac. STOP merge/auto-merge apagado.
