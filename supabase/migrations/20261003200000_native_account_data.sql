-- #1452: reuse #909 identity bootstrap, without claiming a license device.
begin;
create function public.native_resolve_account(issuer text, subject text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if issuer is null or issuer !~ '^https://' or issuer ~ '/auth/v1/?$'
    or subject is null or subject !~ '^user_[A-Za-z0-9_]{27}$' then
    raise exception 'invalid_identity';
  end if;
  return private.resolve_account_identity(issuer, subject);
end;
$$;
alter function public.native_resolve_account(text, text) owner to postgres;
revoke all on function public.native_resolve_account(text, text) from public, anon, authenticated, service_role;
grant execute on function public.native_resolve_account(text, text) to service_role;

-- Only the report submission + screenshot path migrates to internal accounts.
-- Existing Supabase users already have profiles; validate FKs, never fabricate users.
do $$
declare
  item record;
  constraint_name text;
  delete_action text;
begin
  for item in select * from (values
    ('testing_center_memberships', 'user_id', 'cascade'),
    ('testing_center_reports', 'reporter_user_id', 'restrict'),
    ('testing_center_report_submission_keys', 'reporter_user_id', 'restrict'),
    ('testing_center_report_events', 'actor_user_id', 'restrict'),
    ('testing_center_evidence_batches', 'reporter_user_id', 'restrict')
  ) as changes(table_name, column_name, on_delete) loop
    select c.conname into strict constraint_name
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = ('public.' || item.table_name)::regclass
      and c.confrelid = 'auth.users'::regclass and c.contype = 'f' and a.attname = item.column_name;
    delete_action := item.on_delete;
    execute format('alter table public.%I drop constraint %I', item.table_name, constraint_name);
    execute format('alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete %s',
      item.table_name, constraint_name, item.column_name, delete_action);
  end loop;
end;
$$;
commit;
