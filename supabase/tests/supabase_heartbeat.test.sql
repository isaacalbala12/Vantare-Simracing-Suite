-- Run ONLY in an empty disposable PostgreSQL database, as its owner.
\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role;
\ir ../migrations/20261008230000_supabase_heartbeat.sql
\ir ../migrations/20261008230000_supabase_heartbeat.sql
do $$ begin
  if (select count(*) from public.supabase_heartbeat) <> 1 then
    raise exception 'Migration must keep exactly one health row';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.supabase_heartbeat'::regclass) then
    raise exception 'RLS must be enabled';
  end if;
  if has_table_privilege('authenticated', 'public.supabase_heartbeat', 'SELECT')
    or has_table_privilege('service_role', 'public.supabase_heartbeat', 'INSERT') then
    raise exception 'Health table must not grant other roles access';
  end if;
  begin
    insert into public.supabase_heartbeat values (false);
    raise exception 'A false health row must be rejected';
  exception when check_violation then null;
  end;
end $$;
set role anon;
do $$ begin
  if (select count(*) from public.supabase_heartbeat where id) <> 1 then
    raise exception 'Anon must read the singleton through RLS';
  end if;
  begin
    insert into public.supabase_heartbeat values (true);
    raise exception 'Anon INSERT must be denied';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.supabase_heartbeat set id = false;
    raise exception 'Anon UPDATE must be denied';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.supabase_heartbeat;
    raise exception 'Anon DELETE must be denied';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\ir ../rollbacks/20261008230000_supabase_heartbeat.down.sql
\ir ../rollbacks/20261008230000_supabase_heartbeat.down.sql
do $$ begin
  if to_regclass('public.supabase_heartbeat') is not null then
    raise exception 'Rollback must remove the health table';
  end if;
end $$;
\ir ../migrations/20261008230000_supabase_heartbeat.sql
select 'PASS: idempotency, anon read-only, RLS, rollback and reapply';
