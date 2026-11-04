-- VANTA-131 / ADR 0106. Restate four ACLs without changing their relacl.
begin;
create temporary table vanta_acl_before on commit drop as
select c.oid, c.relacl
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where (n.nspname, c.relname) in (
  ('private', 'admin_effects'),
  ('public', 'testing_center_technical_issues'),
  ('public', 'testing_center_effect_outbox'),
  ('public', 'testing_center_linear_projection_snapshots'));

do $$ begin
  if (select count(*) from pg_temp.vanta_acl_before) <> 4 then
    raise exception 'acl_restatement_missing_table' using errcode = '55000';
  end if;
end $$;

revoke all on table private.admin_effects,
  public.testing_center_technical_issues,
  public.testing_center_effect_outbox,
  public.testing_center_linear_projection_snapshots
  from public, anon, authenticated, service_role;
grant select on table private.admin_effects,
  public.testing_center_technical_issues,
  public.testing_center_effect_outbox,
  public.testing_center_linear_projection_snapshots to service_role;
grant select on table public.testing_center_technical_issues to authenticated;

do $$ begin
  if exists (
    select 1 from pg_temp.vanta_acl_before b
    join pg_catalog.pg_class c on c.oid = b.oid
    where c.relacl is distinct from b.relacl
  ) then
    raise exception 'acl_restatement_changed_relacl' using errcode = '55000';
  end if;
end $$;
commit;
