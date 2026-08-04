begin;

do $$ begin
  if exists (select 1 from public.testing_center_linear_issue_bindings
    where external_identifier is not null) then
    raise exception 'testing_center_linear_pilot_rollback_requires_empty_bindings';
  end if;
end $$;

drop function public.testing_center_complete_linear_pilot(
  text,text,bigint,text,uuid,uuid,text,text,text
);
drop function public.testing_center_retry_linear_pilot_token(text,text,bigint,text);
drop function public.testing_center_assert_linear_dispatch(
  text,text,bigint,text,jsonb,text,text
);

create or replace function public.testing_center_claim_linear_effect(
  p_effect_id text,
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns table(
  claim_status text,
  technical_issue_id text,
  fencing_token bigint,
  lease_expires_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare v_effect public.testing_center_effect_outbox%rowtype;
begin
  if p_worker_id is null
    or p_worker_id !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    or p_lease_seconds not between 10 and 300 then
    raise exception 'testing_center_linear_claim_invalid' using errcode = '22023';
  end if;
  lock table public.testing_center_pauses in share mode;
  select * into v_effect from public.testing_center_effect_outbox
  where effect_id = p_effect_id for update;
  if not found or v_effect.effect_type <> 'linear_issue_create' then
    raise exception 'testing_center_linear_effect_not_found' using errcode = 'P0002';
  end if;
  if v_effect.state = 'dry_run_completed' then claim_status := 'dry_run_completed';
  elsif v_effect.state = 'needs_owner' then claim_status := 'needs_owner';
  elsif v_effect.state = 'superseded' or not exists (
    select 1 from public.testing_center_issue_destinations as destination
    where destination.technical_issue_id = v_effect.technical_issue_id
      and destination.destination = 'linear'
      and destination.active_effect_id = v_effect.effect_id
  ) then claim_status := 'not_selected';
  elsif not exists (
    select 1 from public.testing_center_linear_projection_snapshots
    where effect_id = v_effect.effect_id
  ) then claim_status := 'not_prepared';
  elsif exists (
    select 1 from public.testing_center_pauses pause
    where pause.is_paused and (pause.scope = 'global'
      or (pause.scope = 'flow' and pause.technical_issue_id = v_effect.technical_issue_id))
  ) then claim_status := 'paused';
  elsif v_effect.state = 'claimed' and v_effect.lease_expires_at > now()
    then claim_status := 'busy';
  elsif v_effect.state = 'failed' and v_effect.next_attempt_at > now()
    then claim_status := 'retry_scheduled';
  elsif v_effect.attempt_count >= 5 then claim_status := 'exhausted';
  else
    update public.testing_center_effect_outbox effect
    set state = 'claimed', attempt_count = effect.attempt_count + 1,
      lease_token = public.gen_random_uuid(), lease_owner = p_worker_id,
      lease_expires_at = now() + pg_catalog.make_interval(secs => p_lease_seconds),
      fencing_token = effect.fencing_token + 1,
      next_attempt_at = null, last_error_code = null, updated_at = now()
    where effect.effect_id = p_effect_id returning effect.* into v_effect;
    claim_status := 'claimed';
  end if;
  technical_issue_id := v_effect.technical_issue_id;
  fencing_token := v_effect.fencing_token;
  lease_expires_at := v_effect.lease_expires_at;
  return next;
end $$;

alter table public.testing_center_linear_issue_bindings
  drop constraint testing_center_linear_binding_public_metadata,
  drop column projection_digest,
  drop column external_url,
  drop column external_identifier;

alter table public.testing_center_effect_outbox
  drop constraint testing_center_effect_outbox_external_shape_check,
  add constraint testing_center_effect_outbox_external_shape_check check (
    (state = 'completed' and external_issue_number > 0
      and external_issue_node_id is not null)
    or (state <> 'completed'
      and external_issue_number is null and external_issue_node_id is null)
  );

commit;
