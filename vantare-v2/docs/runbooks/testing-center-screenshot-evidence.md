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
  ambos canales.
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

El primer runner crea PostgreSQL desechable, aplica el historial, exige 71/71
aserciones pgTAP, envía evidencia real antes de ejecutar un rollback exacto,
reaplica y repite 71/71, prueba una carrera real de dos procesos sobre
`finalize` y verifica que todo bucket previo, compatible o incompatible, falla
cerrado. El segundo protege la compatibilidad de la RPC v1.

No se necesitan ni deben leerse archivos `.env*` o secretos para estos checks.

## Rollback

En un entorno autorizado, aplicar
`supabase/rollbacks/20260814154558_testing_center_screenshot_evidence.down.sql`
solo después de detener productores y comprobar que no hay datos que deban
preservarse. El rollback falla cerrado si la configuración del bucket ya no
coincide, elimina sus objetos, RPCs, policy, tablas y bucket de ISA-350, borra
únicamente las proyecciones canónicas `kind='screenshot'` creadas por este
corte y restaura exactamente el conjunto anterior de tipos de evidencia.

El runner local prueba esta simetría sobre una base desechable. Este runbook no
autoriza rollback, migración ni mutación en Supabase remoto.

## Criterio de cierre

- runner ISA-350 en GREEN completo;
- harness anterior de report submission en GREEN;
- rollback/reapply y carrera exactamente una vez en GREEN;
- diff limitado a migración, rollback, pgTAP, runner y este runbook;
- sin deploy, push, PR, merge, release ni promoción.
