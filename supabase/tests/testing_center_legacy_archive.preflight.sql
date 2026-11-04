-- Exact source-table inventory for Isaac; read-only, including Storage guards.
with recursive walk(relid,path) as (
  select 'public.testing_center_reports'::regclass::oid,
    array['public.testing_center_reports'::regclass::oid]::oid[]
  union all
  select f.conrelid,w.path||f.conrelid
  from walk w join pg_constraint f
    on f.contype='f' and f.confrelid=w.relid
  where not f.conrelid=any(w.path)
), relations as (
  select distinct relid from walk
  union select 'public.testing_center_audit'::regclass::oid
  union select 'public.testing_center_idempotency'::regclass::oid
  union select 'public.testing_center_evidence_batches'::regclass::oid
), names as (
  select format('%I.%I',n.nspname,c.relname) as source_table
  from relations r join pg_class c on c.oid=r.relid
  join pg_namespace n on n.oid=c.relnamespace
)
select source_table,
  case when source_table in (
    'public.testing_center_evidence_batches',
    'public.testing_center_screenshot_evidence',
    'public.testing_center_evidence_outbox')
    then 'abortar si > 0' else 'archivar vinculadas' end as accion,
  ((xpath('/row/n/text()',query_to_xml(
    format('select count(*)::bigint as n from %s',source_table),
    false,true,'')))[1]::text)::bigint as rows_before
from names order by source_table;
