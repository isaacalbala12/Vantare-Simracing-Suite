-- VANTA-132: companion to R6/#1925, installed after owner_unification.
-- No role/membership writes. Keep the existing locks and public error contract.
begin;
set local lock_timeout='5s';
do $$begin
 if to_regprocedure('private.is_owner(uuid)') is null then
  raise exception 'native_admin_requires_r6_owner_authority' using errcode='55000';
 end if;
end$$;
CREATE OR REPLACE FUNCTION private.native_admin_require_owner(p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.lock_accounts_before_rows(array[p_actor]);
  -- Preserve the UUID and assignment locks; only is_owner decides authority.
  perform 1 from public.operational_access_assignments
  where user_id = p_actor and role = 'owner' and status = 'active' and policy_version = 1
    and (expires_at is null or expires_at > now()) for update;
  if not private.is_owner(p_actor) then raise exception 'native_admin_forbidden' using errcode = '42501'; end if;
end;
$function$
;
create or replace function public.testing_contribution_review(p_id uuid,p_decision text,p_note text,p_proposal jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare reviewer uuid:=private.current_account(); target_account uuid;
begin
 if reviewer is null then raise exception 'testing_owner_required' using errcode='42501'; end if;
 if not private.is_owner(reviewer) then raise exception 'testing_owner_required' using errcode='42501'; end if;
 select account_id into target_account from public.testing_contributions where id=p_id;
 -- Collect actor and report owner before any assignment/contribution row lock.
 perform private.lock_accounts_before_rows(array[reviewer,target_account]);
 if target_account is distinct from (select account_id from public.testing_contributions where id=p_id) then
  raise exception 'testing_report_owner_changed' using errcode='40001';
 end if;
 -- Reuse the admin's UUID-before-assignment locks and shared owner authority.
 begin
  perform private.native_admin_require_owner(reviewer);
 exception when insufficient_privilege then
  raise exception 'testing_owner_required' using errcode='42501';
 end;
 if p_proposal is null then raise exception 'testing_review_invalid' using errcode='22023'; end if;
 perform private.testing_contribution_review_as(reviewer,p_id,p_decision,p_note,p_proposal);
end $$;
commit;
