# Testing Center — persistencia privada de capturas

Estado: contrato local de ISA-350 / TC-EVIDENCE-03. No autoriza despliegue ni
activación remota.

## Objetivo y alcance

Este corte persiste manifiestos de 1 a 10 capturas PNG/JPEG sin guardar bytes,
nombres originales, rutas locales ni URLs. Añade:

- bucket privado `testing-center-evidence`, con 10 MiB por objeto;
- batches, slots y outbox durable `validate|delete` bajo RLS forzada;
- upload cliente únicamente mediante `INSERT` al path exacto server-owned;
- RPCs idempotentes de preparación, finalización y submit con evidencia;
- submit aditivo sin cambiar la firma de `testing_center_submit_report` v1.

Quedan fuera el validador de bytes, UI, signed URLs, acceso de agentes,
limpieza efectiva, Supabase remoto y promoción de canales.

## Orden operativo

1. Aplicar el historial y
   `supabase/migrations/20260814154558_testing_center_screenshot_evidence.sql`.
2. El cliente llama `testing_center_prepare_screenshot_batch` con el contrato
   `testing-center.screenshot-evidence.v1` y un manifiesto cerrado y ordenado.
3. Subir cada objeto al bucket y path devueltos, usando `INSERT` sin `upsert`.
4. Llamar `testing_center_finalize_screenshot` por cada slot. La RPC comprueba
   ownership, objeto exacto y estado, y reserva una sola validación durable por
   slot. Mientras queden slots `prepared`, el finalizado queda `uploaded` y el
   batch `uploading`; al finalizar el último, todos los `uploaded` pasan a
   `validating` junto con el batch.
5. Un validador futuro server-owned procesa el outbox y marca cada slot
   `ready` o `rejected`; ISA-350 no implementa ese worker.
6. Llamar `testing_center_submit_report_with_evidence` solo cuando todo el lote
   esté `ready`. La RPC bloquea el lote, usa digests ordenados, llama la RPC v1
   en la misma transacción y enlaza el lote como `attached`.

Un retry con la misma clave y manifiesto converge. Cambiar contrato, canal o
manifiesto bajo la misma clave falla con conflicto. Un objeto existente nunca
se sobrescribe.

## Seguridad y privacidad

- El bucket es privado y acepta solo `image/png` y `image/jpeg`.
- La migración crea su propio bucket y falla cerrado ante cualquier bucket
  preexistente con el mismo ID, aunque parezca compatible.
- `authenticated` no tiene acceso directo a las tablas privadas.
- Storage expone una única policy cliente: `INSERT` autenticado al bucket,
  usuario, slot pendiente y path exactos.
- No hay policies cliente de `SELECT`, `UPDATE` o `DELETE`; tampoco se concede
  `upsert`.
- Identidad, rol, canal autorizado, IDs y paths se derivan o persisten
  server-side. `p_channel` es una solicitud no confiable: la RPC aplica el
  contrato de acceso existente y `owner` y `primary_tester` pueden solicitar
  ambos canales; `tester` solo puede usar `testers`.
- Upload y finalize vuelven a consultar la membresía activa y el rol autorizado
  para el canal persistido del batch. Preparar un lote no conserva autoridad:
  una revocación o degradación posterior impide subir, finalizar y crear outbox.
- Los logs operativos no deben incluir JWT, URLs firmadas, paths completos,
  email, nombres de archivos ni contenido visual.
- El contenido de una imagen es entrada hostil y nunca concede autoridad.

## Verificación local

Requiere Docker disponible. Desde la raíz Git:

```powershell
& .\supabase\tests\run-testing-center-screenshot-evidence-postgres.ps1
& .\supabase\tests\run-testing-center-report-submission-postgres.ps1
git diff --check
```

El primer runner crea PostgreSQL desechable, aplica el historial, exige 80/80
aserciones pgTAP y envía evidencia simulada antes del rollback. Incluye el
índice de la FK `report_id` y regresiones post-prepare para membresía inactiva
y degradación de `primary_tester` a `tester` en un batch Nightly. Primero exige
que el down falle cerrado, sin mutación parcial, mientras exista metadata de un
objeto; después simula que una Storage API autorizada ya eliminó el objeto
borrando únicamente la fila metadata del stub. Un trigger fuerza después un
fallo tardío del down: el runner comprueba dinámicamente que toda mutación SQL
se revierte y que un `INSERT` concurrente en `storage.objects` queda bloqueado
por el lock hasta abortar la transacción. Finalmente ejecuta el rollback
exacto, reaplica y repite 80/80. También prueba una carrera real de dos procesos
sobre `finalize` y verifica que todo bucket previo, compatible o incompatible,
falla cerrado. El runner no almacena bytes reales: esa eliminación de metadata
solo prueba la precondición SQL y no acredita que los bytes físicos hayan sido
eliminados de Supabase Storage. El segundo runner protege la compatibilidad de
la RPC v1. No se añadieron carreras independientes de prepare/submit: prepare
ya usa advisory lock transaccional, submit bloquea el batch y delega la
exactly-once del reporte a la RPC v1 cubierta por el harness histórico.

No se necesitan ni deben leerse archivos `.env*` o secretos para estos checks.

## Rollback

En un entorno autorizado, aplicar
`supabase/rollbacks/20260814154558_testing_center_screenshot_evidence.down.sql`
solo después de:

1. detener todos los productores y uploads al bucket;
2. eliminar cada objeto mediante la Storage API o interfaz S3 autorizada, de
   modo que se borren tanto los bytes físicos como su metadata;
3. listar el bucket mediante esa misma frontera autorizada y comprobar que está
   vacío antes de ejecutar el down.

El down se ejecuta como una única transacción PostgreSQL. Al inicio toma un
lock `SHARE` de tabla sobre `storage.objects`, que bloquea inserts concurrentes,
y un lock de fila sobre el bucket antes de comprobar que está vacío. El
rollback no borra filas de `storage.objects`. Falla cerrado con
`testing_center_evidence_rollback_bucket_not_empty` si queda cualquier objeto
del bucket, y esta precondición se evalúa antes de revocar o eliminar funciones,
policies, tablas o datos. Solo elimina el bucket cuando ya está vacío. También
falla cerrado si la configuración del bucket no coincide, borra las RPCs,
policy y tablas de ISA-350, elimina únicamente las proyecciones canónicas
`kind='screenshot'` creadas por este corte y restaura exactamente el conjunto
anterior de tipos de evidencia. La eliminación final debe afectar exactamente
una fila del bucket; cero o más de una abortan y revierten toda la transacción.

El runner local prueba esta simetría sobre una base desechable y un stub de
metadata; no demuestra la eliminación física de bytes. Este runbook no autoriza
rollback, migración ni mutación en Supabase remoto.

## Criterio de cierre

- runner ISA-350 en GREEN completo;
- harness anterior de report submission en GREEN;
- rollback/reapply y carrera exactamente una vez en GREEN;
- diff limitado a migración, rollback, pgTAP, runner y este runbook;
- sin deploy, push, PR, merge, release ni promoción.
