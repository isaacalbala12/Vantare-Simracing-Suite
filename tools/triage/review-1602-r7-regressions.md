# PR #1602 · ronda 7 · F8/F9

Base bb1d7bb3; nightly e5c90be5 es ancestro. F7=C permanece: texto libre
local, etiquetas fijas, proveedor/T3/Intake/replay sin prosa. Sin P3 nuevos.

## F8 · paquete estructurado por admisión #1610

El cliente conserva JSON/bytes/reintento del preview, usa UUID v4 compatible
con Edge y envía a `testing-report-submit`. El puente ya no admite v2 directa.
La Edge conserva JWT corto firmado, bloqueo/identidad vigentes, IP del gateway
con HMAC y cuotas durables IP/cuenta antes de validar el cuerpo. Mantiene el
envío simple y añade el paquete de seis campos, hasta 64 KiB como el cliente.

El servidor resuelve la cuenta y llama a `testing_contribution_submit_admitted`,
exclusiva service_role. Reutiliza v2 internamente para consentimiento de items,
membresía, contexto, SHA de adjuntos y reintentos exactos. El parent INSERT pasa
las cuotas de filas #1610; followup conserva consentimiento/crédito. No se
reabre EXECUTE directo. Edge/service_role es la autoridad de admisión, como
en #1610; no hay un ticket seleccionable por cliente ni un grant sintético.

Migración candidata `20261014115717_testing_triage_admitted.sql`, posterior a
participación → triaje → followup → IP admission. Down elimina solo el adaptador,
preserva datos/presupuestos y deja v2 cerrada. SQL/rollback original #1594 intactos.

RED: ruta nativa cerrada, ID sin bits UUID, Edge 400 y adaptador SQL inexistente.
GREEN focal: 23 pruebas triaje, 3 r7/retry; Edge 15/15; SQL combinado 27 checks
más F1 17/F1IP 26/F2 6/F3 8, sin grants sintéticos. #1594 aislada 83/83 con
concurrencia/login real/rollback. Evidencia `E:/tmp/isa1594-r7-evidence/`.

`review_r7_f8_real_preview_is_preserved_for_combined_sql_admission` prepara con
notas privadas y eventos de fixture, envía por HTTP loopback y exige bytes
idénticos al preview. Guarda opcionalmente solo ese paquete sintético en
`VANTARE_TRIAGE_TEST_PREVIEW`. La prueba Edge lee ese archivo, pasa por el
handler/despacho RPC productivo y captura el envelope server-only en
`VANTARE_TRIAGE_TEST_ADMITTED`. Identidad/admisión/RPC están inyectadas en Edge:
no es un gateway ni PostgREST remoto. Los tests de firma/claims existentes pasan.

`supabase/tests/run-triage-admission-local.py` recibe `--preview` y `--edge-rpc`,
exige igualdad y aplica bootstrap + migraciones en orden con postgres
NOSUPERUSER, en clúster temporal sin TCP. Compara contexto/adjuntos almacenados
con el preview original. Prueba ACLs reales, consentimiento, SHA, conflictos,
cuenta, membresía revocada, crédito intacto, cuota de filas y down/reapply.
Sin admisión IP/cuenta en Edge no se llama a storage; SQL impide a
anon/authenticated/worker llamar al adaptador y a todos los roles cliente,
incluido service_role, llamar directamente a v2.

Reproducir desde la raíz Git, Deno ya instalado y caché existente:

```powershell
$env:VANTARE_TRIAGE_TEST_PREVIEW='E:/tmp/isa1594-r7-evidence/preview.json'
$env:VANTARE_TRIAGE_TEST_ADMITTED='E:/tmp/isa1594-r7-evidence/edge-admitted.json'
# Primero Nextest por compilar.ps1, target propio, -j 2 y test(review_r7_f8).
deno test --no-config --node-modules-dir=none --cached-only --allow-env --allow-read=E:/tmp/isa1594-r7-evidence/preview.json --allow-write=E:/tmp/isa1594-r7-evidence/edge-admitted.json supabase/functions/testing-report-submit/index.test.ts
```

Después en WSL, con PostgreSQL existente:

```sh
python3 supabase/tests/run-triage-admission-local.py \
  --pg-bin /usr/lib/postgresql/18/bin \
  --preview /mnt/e/tmp/isa1594-r7-evidence/preview.json \
  --edge-rpc /mnt/e/tmp/isa1594-r7-evidence/edge-admitted.json \
  --output /mnt/e/tmp/isa1594-r7-evidence/f8-sql-final-green
```

Cada pasada nativa genera otro UUID: ejecutar Edge después y SQL al final.
La guarda detectó un envelope anterior; se regeneró en ese orden. Primer Deno
falló por node_modules ajeno; --no-config/none usa dependencias ya cacheadas.
`deno check` no acepta --cached-only; repetido sin ese flag, sin cambiar deps.
Fallos iniciales conservados; no se debilitaron tests, ACLs ni gates.

## F9 · fixed más recibo legacy

El mapeo usado por `session_reports_panel` conserva fixed → Arreglado,
declined → No aceptado y desconocido → Estado no disponible. Sin diseño nuevo.
`review_r7_f9_fixed_with_legacy_receipt_never_shows_rejection` usa contribución
fixed con versión/fecha válidas y recibo legacy submitted. RED produjo
[No aceptado, Recibido]; GREEN [Arreglado, Recibido]. Test del texto productivo,
sin afirmar captura visual de GPUI.

## Límites

Sobre código final 890e2473: workspace fmt/check/Clippy PASS; Nextest 1739/1739
(12 skips del perfil, 1 lento PASS) y lifecycle 18/18 (5+13) PASS. Python triaje
57/57 con connect prohibido, followup mocks 4/4, quality/retirement 456,
Deno fmt/lint/check y diff-check PASS. Ambos hallazgos con RED/GREEN y commits
separados: F8 f27df31a, F9 890e2473. Cierre documental posterior sin cambio de
código; HEAD/checks remotos verificados en buzón/issue. Target propio, cola
versionada y jobs=2; sin deps, baselines o lints modificados. Telemetría
dedicada no repetida: sin cambios en
runtime/domain/ipc/testdata. No proveedor, informes reales, SQL/gateway remoto,
sal/tokens, deploy/cron/LOGIN, instalación, QA visual/física, merge o release.
Antes de activar quedan revisión SQL/Edge y prueba de origen del gateway #1610.
No se afirma que este envío esté desplegado o disponible en producción.
