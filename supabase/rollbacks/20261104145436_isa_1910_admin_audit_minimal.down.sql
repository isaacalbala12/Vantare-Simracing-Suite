begin;
set local lock_timeout='5s';
select pg_advisory_xact_lock(1910,10);
lock table private.admin_audit,private.admin_audit_policy,public.account_identities,
 public.admin_audit_log,private.mail_audit,private.admin_effects in access exclusive mode nowait;
drop trigger admin_audit_account_erasure on public.account_identities;
drop trigger b_minimize_admin_audit on public.admin_audit_log;
drop trigger b_minimize_mail_audit on private.mail_audit;
drop view private.admin_audit;
drop function public.native_admin_prune_audit(uuid);
drop trigger mail_audit_append_only on private.mail_audit;
CREATE TRIGGER mail_audit_append_only BEFORE DELETE OR UPDATE ON private.mail_audit FOR EACH ROW EXECUTE FUNCTION operational_access_reject_audit_mutation();
drop trigger a_account_write_barrier on public.admin_audit_log;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.admin_audit_log FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select case when $1->>''action'' in (''search_accounts'',''get_account'',''get_rollout'',''list_reports'',''get_report'')
     then array[($1->>''actor_account_id'')::uuid] else (select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''actor_account_id'')::uuid union
        select p.id from public.profiles p where p.id=case when $1->>''target'' ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then ($1->>''target'')::uuid end
        union select r.account_id from public.testing_contributions r where r.id=case when $1->>''target'' ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then ($1->>''target'')::uuid end
        union select (v#>>''{}'')::uuid from jsonb_path_query($1,''$.**.account_id'') v
        where v#>>''{}'' ~ ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'') owners(account)) end', 'select ($1->>''actor_account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''actor_account_id'')::uuid))');
drop trigger admin_audit_append_only on public.admin_audit_log;
CREATE TRIGGER admin_audit_append_only BEFORE DELETE OR UPDATE ON public.admin_audit_log FOR EACH ROW EXECUTE FUNCTION operational_access_reject_audit_mutation();
drop trigger admin_effects_append_only on private.admin_effects;
CREATE TRIGGER admin_effects_append_only BEFORE DELETE OR UPDATE ON private.admin_effects FOR EACH ROW EXECUTE FUNCTION operational_access_reject_audit_mutation();
drop index if exists public.admin_audit_target_lookup;
drop index if exists private.mail_audit_target_lookup;
drop function private.redact_deleted_account_audit();
drop function private.minimize_admin_audit();
drop function private.admin_audit_target(text);
drop function private.admin_audit_fields(jsonb,text);
drop function private.admin_audit_maintenance();
drop table private.admin_audit_policy;
commit;
