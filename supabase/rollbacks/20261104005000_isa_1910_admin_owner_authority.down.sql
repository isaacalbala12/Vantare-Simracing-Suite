-- Revert this admin companion BEFORE rolling back R6 owner_unification.
-- Restore the exact previous bodies, with no membership or assignment writes.
begin;
set local lock_timeout='5s';
CREATE OR REPLACE FUNCTION private.native_admin_require_owner(p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.lock_accounts_before_rows(array[p_actor]);
  -- The active-role unique index matches normalizeOperationalAssignments.
  perform 1 from public.operational_access_assignments
  where user_id = p_actor and role = 'owner' and status = 'active' and policy_version = 1
    and (expires_at is null or expires_at > now()) for update;
  if not found then raise exception 'native_admin_forbidden' using errcode = '42501'; end if;
end;
$function$
;
create or replace function public.testing_contribution_review(p_id uuid,p_decision text,p_note text,p_proposal jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if private.current_account() is null then raise exception 'testing_owner_required' using errcode='42501'; end if;
 perform 1 from public.testing_center_memberships where user_id=private.current_account() and active and role='owner' for share;
 if not found then raise exception 'testing_owner_required' using errcode='42501'; end if;
 if p_proposal is null then raise exception 'testing_review_invalid' using errcode='22023'; end if;
 perform private.testing_contribution_review_as(private.current_account(),p_id,p_decision,p_note,p_proposal);
end $$;
commit;
