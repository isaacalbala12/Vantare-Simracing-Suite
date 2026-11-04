# VANTA-131 · 7b2: archivo y vaciado legacy

La migración `20261104014000_isa_1896_legacy_archive.sql` requiere el cierre
de escritores de #1926. Isaac puede ejecutar esta **consulta de solo lectura**
antes de desplegar. Devuelve recuentos, nunca contenido de informes:

```sql
with reports as (
  select r.report_id,r.reporter_user_id,r.report_id ~ '^report_[0-9a-f]{64}$'
    and p.id is not null
    and not exists(select 1 from public.account_identities i
      where i.account_id=r.reporter_user_id and i.deleted_at is not null)
    as mappable
  from public.testing_center_reports r
  left join public.profiles p on p.id=r.reporter_user_id
)
select count(*) as reports_before,
  count(*) filter (where mappable) as maps_to_v2,
  count(*) filter (where not mappable) as archive_only,
  (select count(*) from public.testing_center_report_payloads) as payloads,
  (select count(*) from public.testing_center_evidence) as evidence,
  (select count(*) from public.testing_center_technical_issues
    where report_id is not null) as report_issues,
  (select count(*) from public.testing_center_screenshot_evidence
    where report_id is not null) as linked_screenshots,
  (select count(*) from public.testing_center_evidence_batches) as batches_total
from reports;
```

La migración bloquea el padre y todas sus tablas descendientes por clave
foránea en una transacción. Incluye los ledgers de auditoría e idempotencia
enlazados por `aggregate_id` al issue. Archiva `to_jsonb` de cada fila completa
en `private.testing_center_legacy_archive` con SHA-256, compara recuentos y
hashes con el origen, crea las contribuciones admisibles y vacía los hijos
antes del padre. El aviso SQL final da los recuentos reales de filas archivadas,
padres, mapeadas y conservadas solo en archivo. Cualquier discrepancia aborta
la transacción.

`legacy_source_id` en la contribución conserva el identificador `report_<hash>`.
Título y cuerpo se ajustan a los límites v2; `app_version`, `os_family`,
`os_version` y `module` caben en `report_metadata`. El archivo conserva los
campos largos y la evidencia original. No se infiere consentimiento nuevo.
Los informes sin cuenta v2 viva o sin ID admisible quedan solo en el archivo.
El archivo no concede acceso a roles API.

El `.down.sql` restaura primero el padre y después los hijos, verifica hashes
y deja el archivo intacto. Se aplica antes del PR de admin #1924 y antes de
retirar tablas/RPC. El archivo se elimina solo en ese paso final. No hay
despliegue automático ni llamada de este trabajo a producción.

Antes de integrar #1924, VANTA-132 debe mover su migración
`20261103224121_isa_1910_admin_report_root.sql` a un timestamp posterior a
`20261104014000`: el guard de admin se ejecuta después del vaciado y
`supabase db push` exige que esa migración tenga un orden posterior. Este PR
no cambia SQL admin.
