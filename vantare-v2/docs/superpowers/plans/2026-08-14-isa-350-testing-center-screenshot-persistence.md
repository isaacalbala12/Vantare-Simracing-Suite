# ISA-350 — persistencia privada de capturas

Estado: ejecutado y validado; PR draft #253 abierto con CI remoto en verde.

## Objetivo

Añadir la persistencia Supabase local de lotes y slots de capturas, el bucket
privado y las fronteras idempotentes de preparación, finalización y envío. Este
corte no valida bytes, no añade UI y no despliega nada remoto.

## Decisiones cerradas

- Migración aditiva creada con Supabase CLI:
  `20260814154558_testing_center_screenshot_evidence.sql`.
- Bucket privado `testing-center-evidence`, 10 MiB por objeto y MIME
  `image/png|image/jpeg`.
- El cliente solo recibe `INSERT` en `storage.objects`; no existen policies
  cliente de SELECT, UPDATE o DELETE. La policy exige usuario, bucket y path
  exactos contra un slot server-owned pendiente.
- Tablas privadas para batches, screenshots y outbox durable de
  `validate|delete`, con RLS forzada y administración `service_role`.
- `testing_center_prepare_screenshot_batch` deriva identidad/rol/canal,
  valida un manifiesto cerrado de 1..10 slots y devuelve IDs/paths generados.
  Misma clave y manifiesto reutilizan el lote; cualquier cambio da conflicto.
- `testing_center_finalize_screenshot` exige objeto exacto, ownership y estado
  válido; dos llamadas producen un único trabajo de validación.
- `testing_center_submit_report_with_evidence` bloquea el lote, exige todos
  los slots `ready`, deriva una clave interna de los SHA-256 ordenados y llama
  a la RPC v1 existente dentro de la misma transacción. Después enlaza evidencia
  y marca el lote `attached`. La firma y el comportamiento de
  `testing_center_submit_report` no cambian.
- IDs, paths, reporter y canal son server-owned. No se guardan bytes, nombres
  originales, rutas locales ni URLs.
- No hay dependencia nueva, Edge Function, validador, signed URL o deploy.

## Archivos previstos

- `supabase/migrations/20260814154558_testing_center_screenshot_evidence.sql`
- `supabase/rollbacks/20260814154558_testing_center_screenshot_evidence.down.sql`
- `supabase/tests/testing_center_screenshot_evidence.test.sql`
- `supabase/tests/run-testing-center-screenshot-evidence-postgres.ps1`
- `vantare-v2/docs/runbooks/testing-center-screenshot-evidence.md`
- documentación viva de ISA-350.

## Secuencia TDD

### 1. RED de esquema y seguridad

Crear pgTAP que exija bucket privado/configurado, tablas/constraints/índices,
RLS forzada, privilegios mínimos, ausencia de policies de lectura/mutación y
policy INSERT por path exacto. Ejecutar contra el historial sin la migración y
conservar el RED.

### 2. GREEN de esquema y prepare

Implementar tablas, bucket, policy y RPC prepare. Cubrir autenticación,
membresía/canal, suplantación, shape cerrado, límites, digest, posiciones,
dimensiones, idempotencia y manifiesto cambiado.

### 3. RED/GREEN de finalize y outbox

Probar objeto ausente, bucket/path ajeno, slot ajeno, doble finalize y carrera.
Crear exactamente un trabajo durable de validación y ninguna lectura directa.

### 4. RED/GREEN de submit aditivo

Probar lote parcial/rejected/ajeno/attached, orden de digests, compatibilidad de
la RPC v1, retry exactly-once y fallo transaccional. Enlazar
`testing_center_evidence.kind='screenshot'` sin duplicar metadata mutable.

### 5. Rollback y gates

El runner desechable aplica historial+migración, pgTAP, carrera, rollback,
ausencia exacta, reaplicación y pgTAP. Ejecutar además el harness de report
submission existente, `git diff --check` y revisión completa.

## Stop conditions

- La policy necesita lectura, update, delete o upsert del cliente.
- La RPC v1 debe cambiar de firma o comportamiento.
- Hace falta una dependencia, un servicio nuevo o un deploy remoto.
- El Storage schema real no puede modelarse fielmente en el harness local.
- Un fallo de concurrencia o rollback no puede explicarse.

## Entrega

Rama aislada sincronizada con `nightly@d45d8d8d`, commits RED/GREEN conservados,
runner 80/80 y harness v1 72/56/55 en PASS. Reviews finales `SPEC PASS` y
`QUALITY PASS`. PR draft #253 abierto hacia `nightly`; gates remotos
`31827610539` en verde. Sin merge, bucket remoto ni activación.
