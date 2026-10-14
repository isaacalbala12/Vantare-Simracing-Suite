-- #1594 / PR #1602 F8. Server admission adapter for the exact structured preview.
-- Requires participation -> triage -> followup -> IP admission, in that order.
-- Candidate only; no deployment, new credential or direct EXECUTE reopening.
begin;
set local lock_timeout='5s';

-- The trusted Edge reserves IP/account attempts in separate durable RPC calls
-- before calling this server-only adapter. Account comes from the verified
-- bridge JWT and current identity/block checks, never from the submitted JSON.
create function public.testing_contribution_submit_admitted(p_account uuid,
  p_id uuid,p_channel text,p_title text,p_body text,p_context jsonb,p_attachments jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_account is null then raise exception 'testing_auth_required' using errcode='42501'; end if;
  if p_title is distinct from '[contenido retirado por privacidad]'
    or p_body is distinct from '[contenido retirado por privacidad]' then
    raise exception 'testing_context_invalid' using errcode='22023'; end if;
  perform set_config('request.jwt.claim.sub',p_account::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_account,'role','authenticated')::text,true);
  -- Reuse membership, selected-item consent, attachment SHA and retry validation.
  -- Its parent INSERT also passes #1610's account/row quotas atomically.
  perform public.testing_contribution_submit_v2(p_id,p_channel,p_title,p_body,p_context,p_attachments);
  -- Preserve follow-up/notice/credit semantics; never overwrite credit on retry.
  perform public.testing_report_submit(p_id,p_channel,p_title,p_body,true);
end $$;
revoke all on function public.testing_contribution_submit_admitted(uuid,uuid,text,text,text,jsonb,jsonb)
  from public,anon,authenticated,service_role,vantare_triage;
grant execute on function public.testing_contribution_submit_admitted(uuid,uuid,text,text,text,jsonb,jsonb)
  to service_role;
-- Defense in depth: the adapter owner calls internally; no role needs direct v2.
revoke all on function public.testing_contribution_submit_v2(uuid,text,text,text,jsonb,jsonb)
  from public,anon,authenticated,service_role,vantare_triage;
commit;
