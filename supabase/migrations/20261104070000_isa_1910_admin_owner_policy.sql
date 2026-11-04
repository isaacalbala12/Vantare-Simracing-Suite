-- VANTA-132 / step 4. Keep the existing dispatch layers and all UUID locks.
begin;
set local lock_timeout='5s';
do $policy$
declare patch record; definition text;
begin
 if to_regprocedure('private.is_owner(uuid)') is null then
  raise exception 'native_admin_requires_r6_owner_authority' using errcode='55000';
 end if;
 for patch in select * from (values
  ('private.native_admin_execute_v1(uuid,text,text,jsonb,text)',$old$    -- operational_access_set replaces active roles: never call grant on an owner.
    if not (v_enabled and exists(select 1 from public.operational_access_assignments
      where user_id = v_account and role = 'owner' and status = 'active')) then
      perform public.operational_access_set(v_account, 'tester', case when v_enabled then 'grant' else 'revoke' end,
        'native-admin:' || p_actor::text, 'Beta tester administration', v_corr, null);
    end if;
    select case when role = 'owner' then 'owner' when role = 'nightly_tester' then 'primary_tester' else 'tester' end
    into v_role from public.operational_access_assignments where user_id = v_account
      and status = 'active' and policy_version = 1 and (expires_at is null or expires_at > now());
    insert into public.testing_center_memberships(user_id, actor_id, role, active)
    values(v_account, 'account:' || v_account::text, coalesce(v_role, 'tester'), v_role is not null)
    on conflict(user_id) do update set role = excluded.role, active = excluded.active, updated_at = now();
$old$,$new$    -- Tester toggles never rewrite a live owner's membership or assignment.
    if not private.is_owner(v_account) then
      perform public.operational_access_set(v_account, 'tester', case when v_enabled then 'grant' else 'revoke' end,
        'native-admin:' || p_actor::text, 'Beta tester administration', v_corr, null);
      select case when role = 'nightly_tester' then 'primary_tester' else 'tester' end
      into v_role from public.operational_access_assignments where user_id = v_account
        and role <> 'owner' and status = 'active' and policy_version = 1
        and (expires_at is null or expires_at > now());
      insert into public.testing_center_memberships(user_id, actor_id, role, active)
      values(v_account, 'account:' || v_account::text, coalesce(v_role, 'tester'), v_role is not null)
      on conflict(user_id) do update set role = excluded.role, active = excluded.active, updated_at = now();
    end if;
$new$),
  ('private.native_admin_account_summary(uuid,text,text)',$old$'owner',exists(select 1 from public.operational_access_assignments a where a.user_id=p_account and a.role='owner' and a.status='active')$old$,$new$'owner',private.is_owner(p_account)$new$),
  ('private.native_admin_execute_before_creator_coupon(uuid,text,text,jsonb,text)',$old$exists(select 1 from public.operational_access_assignments where user_id=v_account and role='owner' and status='active') or v_account=p_actor$old$,$new$private.is_owner(v_account) or v_account=p_actor$new$),
  ('private.native_admin_account_deletion(uuid,uuid,text,text,text)',$old$p_account=p_actor or exists(select 1 from public.operational_access_assignments where user_id=p_account and role='owner' and status='active')$old$,$new$p_account=p_actor or private.is_owner(p_account)$new$)
 ) edits(signature,before_text,after_text) loop
  patch.before_text:=replace(patch.before_text,E'\r\n',E'\n');
  patch.after_text:=replace(patch.after_text,E'\r\n',E'\n');
  definition:=replace(pg_get_functiondef(patch.signature::regprocedure),E'\r\n',E'\n');
  if (length(definition)-length(replace(definition,patch.before_text,'')))<>length(patch.before_text) then
   raise exception 'native_admin_owner_policy_source_drift'
    using errcode='55000',detail=patch.signature;
  end if;
  execute replace(definition,patch.before_text,patch.after_text);
 end loop;
end $policy$;
commit;
