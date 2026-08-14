-- ISA-324 / HAF-09: fenced, replay-safe phase callbacks and Nightly closeout identity.

alter table public.testing_center_agent_jobs
  add column candidate_head_sha text
    constraint testing_center_agent_jobs_candidate_sha_check check (
      candidate_head_sha is null or candidate_head_sha ~ '^[0-9a-f]{40}$'
    ),
  add column merge_sha text
    constraint testing_center_agent_jobs_merge_sha_check check (
      merge_sha is null or merge_sha ~ '^[0-9a-f]{40}$'
    );

alter table public.testing_center_agent_reservations
  drop constraint testing_center_agent_reservations_state_check,
  add constraint testing_center_agent_reservations_state_check
    check (state in ('reserved','confirmed','annulled','needs_owner')),
  add column reviewed_head_sha text
    constraint testing_center_agent_reservations_reviewed_sha_check check (
      reviewed_head_sha is null or reviewed_head_sha ~ '^[0-9a-f]{40}$'
    ),
  add column merge_sha text
    constraint testing_center_agent_reservations_merge_sha_check check (
      merge_sha is null or merge_sha ~ '^[0-9a-f]{40}$'
    ),
  add column closeout_fencing_token bigint not null default 0
    constraint testing_center_agent_reservations_fence_check check (closeout_fencing_token >= 0),
  add column closeout_run_id bigint
    constraint testing_center_agent_reservations_run_check check (
      closeout_run_id is null or closeout_run_id > 0
    );

create table public.testing_center_agent_phase_callbacks (
  delivery_id text primary key
    constraint testing_center_agent_phase_callbacks_delivery_check check (
      delivery_id <> '' and delivery_id !~ '^[[:space:]]|[[:space:]]$'
      and octet_length(delivery_id) <= 256
    ),
  job_key text not null references public.testing_center_agent_jobs(job_key) on delete restrict,
  head_sha text not null
    constraint testing_center_agent_phase_callbacks_head_check check (head_sha ~ '^[0-9a-f]{40}$'),
  reviewed_head_sha text
    constraint testing_center_agent_phase_callbacks_reviewed_check check (
      reviewed_head_sha is null or reviewed_head_sha ~ '^[0-9a-f]{40}$'
    ),
  release_tag text
    constraint testing_center_agent_phase_callbacks_release_tag_check check (
      release_tag is null or release_tag ~ '^v[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+-nightly\.[1-9][0-9]*$'
    ),
  phase text not null
    constraint testing_center_agent_phase_callbacks_phase_check check (phase in (
      'red_verified','green_running','diff_verified','review_approved','ci_running','merge_queued',
      'merged_nightly','smoke_running','nightly_tagged','completed','smoke_failed',
      'revert_pr_open','reverted','closeout_failed'
    )),
  payload_digest text not null
    constraint testing_center_agent_phase_callbacks_digest_check check (payload_digest ~ '^[0-9a-f]{64}$'),
  fencing_token bigint not null
    constraint testing_center_agent_phase_callbacks_fence_check check (fencing_token > 0),
  run_id bigint not null
    constraint testing_center_agent_phase_callbacks_run_check check (run_id > 0),
  disposition text not null
    constraint testing_center_agent_phase_callbacks_disposition_check check (
      disposition in ('applied','needs_owner')
    ),
  created_at timestamptz not null default pg_catalog.now(),
  unique (delivery_id,job_key,head_sha)
);

alter table public.testing_center_agent_phase_callbacks enable row level security;
alter table public.testing_center_agent_phase_callbacks force row level security;
revoke all on table public.testing_center_agent_phase_callbacks from public,anon,authenticated,service_role;
grant select on table public.testing_center_agent_phase_callbacks to service_role;

create function public.testing_center_record_fenced_agent_callback(
  p_delivery_id text,p_job_key text,p_head_sha text,p_callback_kind text,
  p_outcome text,p_payload_digest text,p_fencing_token bigint
)
returns table(callback_status text,job_state text)
language plpgsql security definer set search_path = ''
as $$
declare v_job public.testing_center_agent_jobs%rowtype; v_target text; v_effect public.testing_center_agent_effect_outbox%rowtype;
begin
  v_target := case p_callback_kind when 'triage' then 'triage' when 'fix' then 'fix' else null end;
  if v_target is null or p_fencing_token < 1 then
    raise exception 'testing_center_agent_fenced_callback_invalid' using errcode='22023';
  end if;
  select * into v_job from public.testing_center_agent_jobs where job_key=p_job_key for update;
  if not found then raise exception 'testing_center_agent_job_not_found' using errcode='P0002'; end if;
  select * into v_effect from public.testing_center_agent_effect_outbox
    where job_key=p_job_key and effect_kind='github_dispatch' and effect_target=v_target
      and effect_generation=1 for update;
  if not found or v_effect.fencing_token<>p_fencing_token or v_effect.state<>'completed' then
    if public.testing_center_agent_transition_allowed(v_job.state,'needs_owner') then
      perform public.testing_center_transition_agent_job(
        p_job_key,v_job.state,'needs_owner','fenced-callback',p_payload_digest
      );
      v_job.state:='needs_owner';
    end if;
    callback_status:='needs_owner'; job_state:=v_job.state; return next; return;
  end if;
  return query select * from public.testing_center_record_agent_callback(
    p_delivery_id,p_job_key,
    case when p_callback_kind='fix' then v_job.nightly_base_sha else p_head_sha end,
    p_callback_kind,p_outcome,p_payload_digest
  );
end $$;

create function public.testing_center_record_agent_phase_callback(
  p_delivery_id text,p_job_key text,p_head_sha text,p_reviewed_head_sha text,
  p_phase text,p_payload_digest text,p_fencing_token bigint,p_run_id bigint,
  p_release_tag text default null
)
returns table(callback_status text,job_state text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_job public.testing_center_agent_jobs%rowtype;
  v_callback public.testing_center_agent_phase_callbacks%rowtype;
  v_effect public.testing_center_agent_effect_outbox%rowtype;
  v_reservation public.testing_center_agent_reservations%rowtype;
  v_expected text;
  v_disposition text := 'applied';
  v_is_closeout boolean;
begin
  v_is_closeout := p_phase in (
    'merged_nightly','smoke_running','nightly_tagged','completed','smoke_failed',
    'revert_pr_open','reverted','closeout_failed'
  );
  if p_delivery_id='' or octet_length(p_delivery_id)>256 or p_delivery_id~'^[[:space:]]|[[:space:]]$'
    or p_head_sha!~'^[0-9a-f]{40}$'
    or (p_reviewed_head_sha is not null and p_reviewed_head_sha!~'^[0-9a-f]{40}$')
    or p_payload_digest!~'^[0-9a-f]{64}$' or p_fencing_token<1 or p_run_id<1
    or (v_is_closeout and (p_release_tag is null or p_release_tag!~'^v[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+-nightly\.[1-9][0-9]*$'))
    or (not v_is_closeout and p_release_tag is not null) then
    raise exception 'testing_center_agent_phase_callback_invalid' using errcode='22023';
  end if;
  v_expected := case p_phase
    when 'red_verified' then 'red_running'
    when 'green_running' then 'red_verified'
    when 'diff_verified' then 'green_running'
    when 'review_approved' then 'diff_verified'
    when 'ci_running' then 'review_approved'
    when 'merge_queued' then 'ci_running'
    when 'merged_nightly' then 'merge_queued'
    when 'smoke_running' then 'merged_nightly'
    when 'nightly_tagged' then 'smoke_running'
    when 'completed' then 'nightly_tagged'
    when 'smoke_failed' then 'smoke_running'
    when 'revert_pr_open' then 'smoke_failed'
    when 'reverted' then 'revert_pr_open'
    when 'closeout_failed' then '__current__'
    else null end;
  if v_expected is null then
    raise exception 'testing_center_agent_phase_callback_invalid' using errcode='22023';
  end if;
  select * into v_job from public.testing_center_agent_jobs where job_key=p_job_key for update;
  if not found then raise exception 'testing_center_agent_job_not_found' using errcode='P0002'; end if;
  select * into v_callback from public.testing_center_agent_phase_callbacks
    where delivery_id=p_delivery_id;
  if found then
    if v_callback.job_key=p_job_key and v_callback.head_sha=p_head_sha
      and v_callback.reviewed_head_sha is not distinct from p_reviewed_head_sha
      and v_callback.release_tag is not distinct from p_release_tag
      and v_callback.phase=p_phase and v_callback.payload_digest=p_payload_digest
      and v_callback.fencing_token=p_fencing_token and v_callback.run_id=p_run_id then
      callback_status:='duplicate'; job_state:=v_job.state; return next; return;
    end if;
    if public.testing_center_agent_transition_allowed(v_job.state,'needs_owner') then
      perform public.testing_center_transition_agent_job(
        p_job_key,v_job.state,'needs_owner','phase-callback',p_payload_digest
      );
      v_job.state:='needs_owner';
    end if;
    callback_status:='needs_owner'; job_state:=v_job.state; return next; return;
  end if;

  if v_is_closeout then
    select * into v_reservation from public.testing_center_agent_reservations
      where job_key=p_job_key and reservation_kind='nightly_release' for update;
    if not found or p_reviewed_head_sha is null
      or v_reservation.reviewed_head_sha is distinct from p_reviewed_head_sha
      or v_reservation.reservation_key is distinct from p_release_tag then
      v_disposition:='needs_owner';
    elsif (p_phase in ('merged_nightly','smoke_running','nightly_tagged','completed','smoke_failed')
        and v_reservation.state<>'reserved')
      or (p_phase in ('revert_pr_open','reverted') and v_reservation.state<>'annulled')
      or (p_phase='closeout_failed' and (
        v_reservation.state not in ('reserved','annulled')
        or v_job.state not in ('merged_nightly','smoke_running','nightly_tagged','smoke_failed','revert_pr_open')
      )) then
      v_disposition:='needs_owner';
    elsif p_phase='merged_nightly' then
      if p_fencing_token<>p_run_id or p_fencing_token<v_reservation.closeout_fencing_token then
        v_disposition:='needs_owner';
      elsif v_reservation.merge_sha is not null and v_reservation.merge_sha<>p_head_sha then
        v_disposition:='needs_owner';
      else
        update public.testing_center_agent_reservations set
          merge_sha=p_head_sha,closeout_fencing_token=p_fencing_token,
          closeout_run_id=p_run_id,updated_at=pg_catalog.now()
          where reservation_key=v_reservation.reservation_key;
        update public.testing_center_agent_jobs set merge_sha=p_head_sha,updated_at=pg_catalog.now()
          where job_key=p_job_key and (merge_sha is null or merge_sha=p_head_sha);
        if not found then v_disposition:='needs_owner'; end if;
      end if;
    elsif v_reservation.closeout_fencing_token<>p_fencing_token
      or (p_phase not in ('reverted','closeout_failed') and v_reservation.closeout_run_id<>p_run_id)
      or v_reservation.merge_sha is distinct from p_head_sha then
      v_disposition:='needs_owner';
    end if;
  else
    select * into v_effect from public.testing_center_agent_effect_outbox
      where job_key=p_job_key and effect_kind='github_dispatch' and effect_target='fix'
        and effect_generation=1 for update;
    if not found or v_effect.fencing_token<>p_fencing_token or v_effect.state<>'completed' then
      v_disposition:='needs_owner';
    elsif p_phase='red_verified' then
      if v_job.candidate_head_sha is null then
        update public.testing_center_agent_jobs set candidate_head_sha=p_head_sha,updated_at=pg_catalog.now()
          where job_key=p_job_key;
        v_job.candidate_head_sha:=p_head_sha;
      elsif v_job.candidate_head_sha is distinct from p_head_sha then
        v_disposition:='needs_owner';
      end if;
    elsif p_phase='green_running' and v_job.candidate_head_sha is distinct from p_head_sha then
      v_disposition:='needs_owner';
    elsif p_phase='diff_verified' then
      update public.testing_center_agent_jobs set candidate_head_sha=p_head_sha,updated_at=pg_catalog.now()
        where job_key=p_job_key;
      v_job.candidate_head_sha:=p_head_sha;
    elsif v_job.candidate_head_sha is distinct from p_head_sha then
      v_disposition:='needs_owner';
    end if;
  end if;

  if v_disposition='applied' and p_phase<>'closeout_failed' and v_job.state<>v_expected then
    v_disposition:='needs_owner';
  end if;
  insert into public.testing_center_agent_phase_callbacks(
    delivery_id,job_key,head_sha,reviewed_head_sha,release_tag,phase,payload_digest,
    fencing_token,run_id,disposition
  ) values (
    p_delivery_id,p_job_key,p_head_sha,p_reviewed_head_sha,p_release_tag,p_phase,p_payload_digest,
    p_fencing_token,p_run_id,v_disposition
  );
  if v_disposition='needs_owner' then
    if public.testing_center_agent_transition_allowed(v_job.state,'needs_owner') then
      perform public.testing_center_transition_agent_job(
        p_job_key,v_job.state,'needs_owner','phase-callback',p_payload_digest
      );
      v_job.state:='needs_owner';
    end if;
    callback_status:='needs_owner'; job_state:=v_job.state; return next; return;
  end if;

  if p_phase='closeout_failed' then
    perform public.testing_center_transition_agent_job(
      p_job_key,v_job.state,'needs_owner','phase-callback',p_payload_digest
    );
    update public.testing_center_agent_reservations set state='needs_owner',updated_at=pg_catalog.now()
      where job_key=p_job_key and reservation_kind='nightly_release'
        and state in ('reserved','annulled');
    if not found then
      raise exception 'testing_center_agent_nightly_reservation_not_escalatable' using errcode='55000';
    end if;
    callback_status:='applied'; job_state:='needs_owner'; return next; return;
  end if;

  perform public.testing_center_transition_agent_job(
    p_job_key,v_expected,p_phase,'phase-callback',p_payload_digest
  );
  if p_phase='merge_queued' then
    update public.testing_center_agent_reservations set
      reviewed_head_sha=p_head_sha,updated_at=pg_catalog.now()
      where job_key=p_job_key and reservation_kind='nightly_release'
        and state='reserved' and (reviewed_head_sha is null or reviewed_head_sha=p_head_sha);
    if not found then raise exception 'testing_center_agent_nightly_reservation_unbound' using errcode='55000'; end if;
  elsif p_phase='smoke_failed' then
    update public.testing_center_agent_reservations set state='annulled',updated_at=pg_catalog.now()
      where job_key=p_job_key and reservation_kind='nightly_release' and state='reserved';
    if not found then raise exception 'testing_center_agent_nightly_reservation_not_annullable' using errcode='55000'; end if;
  elsif p_phase='completed' then
    update public.testing_center_agent_reservations set state='confirmed',updated_at=pg_catalog.now()
      where job_key=p_job_key and reservation_kind='nightly_release' and state='reserved'
        and reservation_key=p_release_tag;
    if not found then raise exception 'testing_center_agent_nightly_reservation_not_confirmable' using errcode='55000'; end if;
  end if;
  callback_status:='applied'; job_state:=p_phase; return next;
end $$;

create function public.testing_center_get_agent_job_state(p_report_id text)
returns table(state text,updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select job.state,job.updated_at
  from public.testing_center_reports report
  join public.testing_center_technical_issues issue on issue.report_id=report.report_id
  join public.testing_center_agent_jobs job on job.technical_issue_id=issue.technical_issue_id
  where report.report_id=p_report_id
    and (report.reporter_user_id=auth.uid() or public.testing_center_current_role()='owner')
$$;

revoke all on function public.testing_center_record_fenced_agent_callback(text,text,text,text,text,text,bigint)
  from public,anon,authenticated;
revoke all on function public.testing_center_record_agent_phase_callback(text,text,text,text,text,text,bigint,bigint,text)
  from public,anon,authenticated;
revoke all on function public.testing_center_get_agent_job_state(text) from public,anon;
grant execute on function public.testing_center_record_fenced_agent_callback(text,text,text,text,text,text,bigint)
  to service_role;
grant execute on function public.testing_center_record_agent_phase_callback(text,text,text,text,text,text,bigint,bigint,text)
  to service_role;
grant execute on function public.testing_center_get_agent_job_state(text) to authenticated;

comment on table public.testing_center_agent_phase_callbacks is
  'HAF-09 one replay-safe, fenced ledger row per non-triage agent phase callback.';
