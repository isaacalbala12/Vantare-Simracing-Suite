-- ISA-320 / HAF-05: durable v2 agent jobs and fenced external effects.
-- This is additive. Linear v1 remains an optional, separate projection.

create function public.testing_center_agent_job_key(
  p_technical_issue_id text,p_report_digest text,p_nightly_base_sha text,p_policy_version text
)
returns text
language sql immutable security definer set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        p_technical_issue_id || p_report_digest || p_nightly_base_sha || p_policy_version,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

create table public.testing_center_agent_jobs (
  job_key text primary key
    constraint testing_center_agent_jobs_key_check check (job_key ~ '^[0-9a-f]{64}$'),
  technical_issue_id text not null
    references public.testing_center_technical_issues(technical_issue_id) on delete restrict,
  execution_generation smallint not null
    constraint testing_center_agent_jobs_generation_check check (execution_generation = 1),
  policy_version text not null
    constraint testing_center_agent_jobs_policy_check check (policy_version = 'testing-center.autofix-policy.v2'),
  report_digest text not null
    constraint testing_center_agent_jobs_report_digest_check check (report_digest ~ '^[0-9a-f]{64}$'),
  dossier_digest text not null
    constraint testing_center_agent_jobs_dossier_digest_check check (dossier_digest ~ '^[0-9a-f]{64}$'),
  nightly_base_sha text not null
    constraint testing_center_agent_jobs_base_sha_check check (nightly_base_sha ~ '^[0-9a-f]{40}$'),
  state text not null
    constraint testing_center_agent_jobs_state_check check (state in (
      'triage_queued','triaged','duplicate','needs_info','ineligible','eligible',
      'red_running','red_verified','green_running','diff_verified',
      'review_approved','ci_running','merge_queued','merged_nightly',
      'smoke_running','nightly_tagged','completed','smoke_failed',
      'revert_pr_open','reverted','needs_owner','stopped'
    )),
  triage_dispatch_count smallint not null default 0
    constraint testing_center_agent_jobs_triage_count_check check (triage_dispatch_count between 0 and 1),
  fix_dispatch_count smallint not null default 0
    constraint testing_center_agent_jobs_fix_count_check check (fix_dispatch_count between 0 and 1),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (technical_issue_id, execution_generation),
  constraint testing_center_agent_jobs_canonical_key_check check (
    job_key = public.testing_center_agent_job_key(
      technical_issue_id,report_digest,nightly_base_sha,policy_version
    )
  )
);

create table public.testing_center_agent_effect_outbox (
  effect_id text primary key
    constraint testing_center_agent_effects_id_check check (
      effect_id <> '' and effect_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(effect_id) <= 160
    ),
  job_key text not null references public.testing_center_agent_jobs(job_key) on delete restrict,
  effect_kind text not null
    constraint testing_center_agent_effects_kind_check check (effect_kind in (
      'github_dispatch','supabase_callback','nightly_release_reservation','revert_pr'
    )),
  effect_target text not null
    constraint testing_center_agent_effects_target_check check (effect_target in (
      'triage','fix','callback','release','revert'
    )),
  effect_generation smallint not null
    constraint testing_center_agent_effects_generation_check check (effect_generation = 1),
  payload_digest text not null
    constraint testing_center_agent_effects_payload_check check (payload_digest ~ '^[0-9a-f]{64}$'),
  state text not null default 'queued'
    constraint testing_center_agent_effects_state_check check (state in (
      'queued','claimed','reserved','completed','needs_owner'
    )),
  lease_owner text,
  lease_expires_at timestamptz,
  fencing_token bigint not null default 0
    constraint testing_center_agent_effects_fence_check check (fencing_token >= 0),
  dispatch_reserved boolean not null default false,
  outcome_digest text
    constraint testing_center_agent_effects_outcome_check check (
      outcome_digest is null or outcome_digest ~ '^[0-9a-f]{64}$'
    ),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (job_key, effect_kind, effect_target, effect_generation),
  constraint testing_center_agent_effects_pair_check check (
    (effect_kind = 'github_dispatch' and effect_target in ('triage','fix'))
    or (effect_kind = 'supabase_callback' and effect_target = 'callback')
    or (effect_kind = 'nightly_release_reservation' and effect_target = 'release')
    or (effect_kind = 'revert_pr' and effect_target = 'revert')
  ),
  constraint testing_center_agent_effects_lease_check check (
    (state in ('claimed','reserved') and lease_owner ~ '^[a-z0-9][a-z0-9._-]{0,63}$' and lease_expires_at is not null)
    or (state in ('queued','completed','needs_owner') and lease_owner is null and lease_expires_at is null)
  ),
  constraint testing_center_agent_effects_reservation_check check (
    (state in ('reserved','completed','needs_owner') and dispatch_reserved)
    or (state in ('queued','claimed') and not dispatch_reserved)
  )
);

create index testing_center_agent_effects_claim_idx
  on public.testing_center_agent_effect_outbox(state, lease_expires_at, created_at);

create table public.testing_center_agent_callbacks (
  delivery_id text primary key
    constraint testing_center_agent_callbacks_delivery_check check (
      delivery_id <> '' and delivery_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(delivery_id) <= 256
    ),
  job_key text not null references public.testing_center_agent_jobs(job_key) on delete restrict,
  head_sha text not null
    constraint testing_center_agent_callbacks_sha_check check (head_sha ~ '^[0-9a-f]{40}$'),
  callback_kind text not null
    constraint testing_center_agent_callbacks_kind_check check (callback_kind in ('triage','fix')),
  outcome text not null
    constraint testing_center_agent_callbacks_outcome_check check (outcome in (
      'eligible','duplicate','needs_info','ineligible','accepted','ambiguous'
    )),
  payload_digest text not null
    constraint testing_center_agent_callbacks_payload_check check (payload_digest ~ '^[0-9a-f]{64}$'),
  disposition text not null
    constraint testing_center_agent_callbacks_disposition_check check (disposition in ('applied','needs_owner')),
  created_at timestamptz not null default pg_catalog.now(),
  unique (delivery_id, job_key, head_sha),
  constraint testing_center_agent_callbacks_pair_check check (
    (callback_kind='triage' and outcome in ('eligible','duplicate','needs_info','ineligible','ambiguous'))
    or (callback_kind='fix' and outcome in ('accepted','ambiguous'))
  )
);

create table public.testing_center_agent_reservations (
  reservation_key text primary key
    constraint testing_center_agent_reservations_key_check check (
      reservation_key <> '' and reservation_key !~ '^[[:space:]]|[[:space:]]$' and octet_length(reservation_key) <= 256
    ),
  job_key text not null references public.testing_center_agent_jobs(job_key) on delete restrict,
  reservation_kind text not null
    constraint testing_center_agent_reservations_kind_check check (reservation_kind in ('branch','pull_request','nightly_release')),
  binding_digest text not null
    constraint testing_center_agent_reservations_digest_check check (binding_digest ~ '^[0-9a-f]{64}$'),
  state text not null default 'reserved'
    constraint testing_center_agent_reservations_state_check check (state in ('reserved','confirmed','needs_owner')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (job_key, reservation_kind)
);

create table public.testing_center_agent_audit (
  audit_id bigint generated always as identity primary key,
  job_key text not null references public.testing_center_agent_jobs(job_key) on delete restrict,
  execution_generation smallint not null
    constraint testing_center_agent_audit_generation_check check (execution_generation = 1),
  policy_version text not null
    constraint testing_center_agent_audit_policy_check check (policy_version = 'testing-center.autofix-policy.v2'),
  from_state text not null,
  to_state text not null,
  actor text not null
    constraint testing_center_agent_audit_actor_check check (actor ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  operation_digest text not null
    constraint testing_center_agent_audit_digest_check check (operation_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.now(),
  constraint testing_center_agent_audit_transition_check check (from_state <> to_state)
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'testing_center_agent_jobs','testing_center_agent_effect_outbox',
    'testing_center_agent_callbacks','testing_center_agent_reservations',
    'testing_center_agent_audit'
  ] loop
    execute 'alter table public.' || pg_catalog.quote_ident(table_name) || ' enable row level security';
    execute 'alter table public.' || pg_catalog.quote_ident(table_name) || ' force row level security';
    execute 'revoke all on table public.' || pg_catalog.quote_ident(table_name) || ' from public, anon, authenticated, service_role';
    execute 'grant select on table public.' || pg_catalog.quote_ident(table_name) || ' to service_role';
  end loop;
end $$;

revoke all on sequence public.testing_center_agent_audit_audit_id_seq from public, anon, authenticated, service_role;

create function public.testing_center_agent_transition_allowed(p_from text, p_to text)
returns boolean
language sql immutable security definer set search_path = ''
as $$
  select exists (
    select 1 from (values
      ('triage_queued','triaged'),
      ('triaged','duplicate'),('triaged','needs_info'),('triaged','ineligible'),('triaged','eligible'),
      ('eligible','red_running'),('red_running','red_verified'),
      ('red_verified','green_running'),('green_running','diff_verified'),
      ('diff_verified','review_approved'),('review_approved','ci_running'),
      ('ci_running','merge_queued'),('merge_queued','merged_nightly'),
      ('merged_nightly','smoke_running'),('merged_nightly','smoke_failed'),
      ('smoke_running','nightly_tagged'),('smoke_running','smoke_failed'),
      ('nightly_tagged','completed'),('smoke_failed','revert_pr_open'),
      ('revert_pr_open','reverted')
    ) as allowed(from_state,to_state)
    where allowed.from_state = p_from and allowed.to_state = p_to
  ) or (
    p_to in ('needs_owner','stopped')
    and p_from in (
      'triage_queued','triaged','eligible','red_running','red_verified','green_running',
      'diff_verified','review_approved','ci_running','merge_queued','merged_nightly',
      'smoke_running','nightly_tagged','smoke_failed','revert_pr_open'
    )
  )
$$;

create function public.testing_center_transition_agent_job(
  p_job_key text,
  p_expected_state text,
  p_to_state text,
  p_actor text,
  p_operation_digest text
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare v_job public.testing_center_agent_jobs%rowtype;
begin
  if p_job_key !~ '^[0-9a-f]{64}$'
    or p_actor !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    or p_operation_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'testing_center_agent_transition_invalid' using errcode = '22023';
  end if;
  select * into v_job from public.testing_center_agent_jobs where job_key=p_job_key for update;
  if not found then raise exception 'testing_center_agent_job_not_found' using errcode='P0002'; end if;
  if v_job.state = p_to_state then return v_job.state; end if;
  if v_job.state <> p_expected_state then
    raise exception 'testing_center_agent_job_state_stale' using errcode='55000';
  end if;
  if not public.testing_center_agent_transition_allowed(v_job.state,p_to_state) then
    raise exception 'testing_center_agent_job_transition_illegal' using errcode='55000';
  end if;
  update public.testing_center_agent_jobs
    set state=p_to_state,updated_at=pg_catalog.now() where job_key=p_job_key;
  insert into public.testing_center_agent_audit(
    job_key,execution_generation,policy_version,from_state,to_state,actor,operation_digest
  ) values (
    v_job.job_key,v_job.execution_generation,v_job.policy_version,v_job.state,p_to_state,p_actor,p_operation_digest
  );
  return p_to_state;
end $$;

create function public.testing_center_queue_agent_effect(
  p_job_key text,
  p_effect_kind text,
  p_effect_target text,
  p_payload_digest text
)
returns table(queue_status text,effect_id text)
language plpgsql security definer set search_path = ''
as $$
declare v_job public.testing_center_agent_jobs%rowtype; v_existing public.testing_center_agent_effect_outbox%rowtype;
begin
  if p_payload_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'testing_center_agent_effect_invalid' using errcode='22023';
  end if;
  select * into v_job from public.testing_center_agent_jobs where job_key=p_job_key for update;
  if not found then raise exception 'testing_center_agent_job_not_found' using errcode='P0002'; end if;
  effect_id := p_job_key || ':' || p_effect_target || ':1';
  select * into v_existing from public.testing_center_agent_effect_outbox
    where job_key=p_job_key and effect_kind=p_effect_kind and effect_target=p_effect_target and effect_generation=1;
  if found then
    if v_existing.payload_digest <> p_payload_digest then
      raise exception 'testing_center_agent_effect_conflict' using errcode='23505';
    end if;
    queue_status := 'existing'; effect_id := v_existing.effect_id; return next; return;
  end if;
  if (p_effect_target='triage' and v_job.state<>'triage_queued')
    or (p_effect_target='fix' and v_job.state<>'eligible') then
    raise exception 'testing_center_agent_effect_phase_invalid' using errcode='55000';
  end if;
  insert into public.testing_center_agent_effect_outbox(
    effect_id,job_key,effect_kind,effect_target,effect_generation,payload_digest
  ) values (effect_id,p_job_key,p_effect_kind,p_effect_target,1,p_payload_digest);
  queue_status := 'queued'; return next;
end $$;

create function public.testing_center_queue_agent_job(
  p_job_key text,
  p_technical_issue_id text,
  p_execution_generation integer,
  p_policy_version text,
  p_report_digest text,
  p_dossier_digest text,
  p_nightly_base_sha text
)
returns table(queue_status text,job_key text)
language plpgsql security definer set search_path = ''
as $$
declare v_existing public.testing_center_agent_jobs%rowtype;
begin
  if p_job_key !~ '^[0-9a-f]{64}$' or p_execution_generation <> 1
    or p_policy_version <> 'testing-center.autofix-policy.v2'
    or p_report_digest !~ '^[0-9a-f]{64}$' or p_dossier_digest !~ '^[0-9a-f]{64}$'
    or p_nightly_base_sha !~ '^[0-9a-f]{40}$' then
    raise exception 'testing_center_agent_job_invalid' using errcode='22023';
  end if;
  if p_job_key <> public.testing_center_agent_job_key(
    p_technical_issue_id,p_report_digest,p_nightly_base_sha,p_policy_version
  ) then
    raise exception 'testing_center_agent_job_key_mismatch' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.testing_center_technical_issues
    where technical_issue_id=p_technical_issue_id and state='open' and flow_state not in ('needs_owner','stopped')
  ) then raise exception 'testing_center_agent_issue_not_ready' using errcode='55000'; end if;
  select * into v_existing from public.testing_center_agent_jobs
    where technical_issue_id=p_technical_issue_id and execution_generation=1 for update;
  if found then
    if v_existing.job_key<>p_job_key or v_existing.policy_version<>p_policy_version
      or v_existing.report_digest<>p_report_digest or v_existing.dossier_digest<>p_dossier_digest
      or v_existing.nightly_base_sha<>p_nightly_base_sha then
      raise exception 'testing_center_agent_job_conflict' using errcode='23505';
    end if;
    queue_status := 'existing'; job_key := v_existing.job_key; return next; return;
  end if;
  insert into public.testing_center_agent_jobs(
    job_key,technical_issue_id,execution_generation,policy_version,
    report_digest,dossier_digest,nightly_base_sha,state
  ) values (
    p_job_key,p_technical_issue_id,1,p_policy_version,
    p_report_digest,p_dossier_digest,p_nightly_base_sha,'triage_queued'
  );
  perform * from public.testing_center_queue_agent_effect(
    p_job_key,'github_dispatch','triage',p_dossier_digest
  );
  queue_status := 'queued'; job_key := p_job_key; return next;
end $$;

create function public.testing_center_claim_agent_effect(
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns table(
  effect_id text,job_key text,effect_kind text,effect_target text,
  payload_digest text,fencing_token bigint,lease_expires_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare v_effect public.testing_center_agent_effect_outbox%rowtype;
begin
  if p_worker_id !~ '^[a-z0-9][a-z0-9._-]{0,63}$' or p_lease_seconds not between 10 and 300 then
    raise exception 'testing_center_agent_claim_invalid' using errcode='22023';
  end if;
  lock table public.testing_center_pauses in share mode;
  select effect.* into v_effect
  from public.testing_center_agent_effect_outbox effect
  join public.testing_center_agent_jobs job on job.job_key=effect.job_key
  where (
      effect.state='queued'
      or (effect.state='claimed' and not effect.dispatch_reserved and effect.lease_expires_at<=pg_catalog.now())
    )
    and job.state not in ('duplicate','needs_info','ineligible','completed','reverted','needs_owner','stopped')
    and not exists (
      select 1 from public.testing_center_pauses pause
      where pause.is_paused and (
        pause.scope='global' or (pause.scope='flow' and pause.technical_issue_id=job.technical_issue_id)
      )
    )
  order by effect.created_at,effect.effect_id
  for update of effect skip locked limit 1;
  if not found then return; end if;
  update public.testing_center_agent_effect_outbox outbox
    set state='claimed',lease_owner=p_worker_id,
      lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>p_lease_seconds),
      fencing_token=outbox.fencing_token+1,updated_at=pg_catalog.now()
    where outbox.effect_id=v_effect.effect_id returning * into v_effect;
  effect_id:=v_effect.effect_id; job_key:=v_effect.job_key; effect_kind:=v_effect.effect_kind;
  effect_target:=v_effect.effect_target; payload_digest:=v_effect.payload_digest;
  fencing_token:=v_effect.fencing_token; lease_expires_at:=v_effect.lease_expires_at;
  return next;
end $$;

create function public.testing_center_reserve_agent_effect(
  p_effect_id text,p_worker_id text,p_fencing_token bigint
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_effect public.testing_center_agent_effect_outbox%rowtype;
  v_issue text;
  v_job_state text;
begin
  lock table public.testing_center_pauses in share mode;
  select effect.* into v_effect
  from public.testing_center_agent_effect_outbox effect
  where effect.effect_id=p_effect_id for update;
  if not found or v_effect.state<>'claimed' or v_effect.lease_owner<>p_worker_id
    or v_effect.fencing_token<>p_fencing_token or v_effect.lease_expires_at<=pg_catalog.now() then
    raise exception 'testing_center_agent_effect_fencing_stale' using errcode='55000';
  end if;
  select job.technical_issue_id,job.state into strict v_issue,v_job_state
  from public.testing_center_agent_jobs job where job.job_key=v_effect.job_key for update;
  if v_job_state in (
    'duplicate','needs_info','ineligible','completed','reverted','needs_owner','stopped'
  ) then
    raise exception 'testing_center_agent_job_not_executable' using errcode='55000';
  end if;
  if exists (
    select 1 from public.testing_center_pauses pause where pause.is_paused
      and (pause.scope='global' or (pause.scope='flow' and pause.technical_issue_id=v_issue))
  ) then raise exception 'testing_center_paused' using errcode='55000'; end if;
  if v_effect.effect_target='triage' then
    update public.testing_center_agent_jobs set triage_dispatch_count=triage_dispatch_count+1,updated_at=pg_catalog.now()
      where job_key=v_effect.job_key and triage_dispatch_count=0;
    if not found then raise exception 'testing_center_agent_dispatch_already_reserved' using errcode='55000'; end if;
  elsif v_effect.effect_target='fix' then
    update public.testing_center_agent_jobs set fix_dispatch_count=fix_dispatch_count+1,updated_at=pg_catalog.now()
      where job_key=v_effect.job_key and fix_dispatch_count=0;
    if not found then raise exception 'testing_center_agent_dispatch_already_reserved' using errcode='55000'; end if;
  end if;
  update public.testing_center_agent_effect_outbox
    set state='reserved',dispatch_reserved=true,updated_at=pg_catalog.now()
    where effect_id=p_effect_id;
  return 'reserved';
end $$;

create function public.testing_center_complete_agent_effect(
  p_effect_id text,p_worker_id text,p_fencing_token bigint,
  p_outcome text,p_outcome_digest text
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare v_effect public.testing_center_agent_effect_outbox%rowtype; v_state text; v_job_state text;
begin
  if p_outcome not in ('delivered','ambiguous') or p_outcome_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'testing_center_agent_effect_outcome_invalid' using errcode='22023';
  end if;
  select * into v_effect from public.testing_center_agent_effect_outbox where effect_id=p_effect_id for update;
  if not found then raise exception 'testing_center_agent_effect_not_found' using errcode='P0002'; end if;
  if v_effect.state in ('completed','needs_owner') and v_effect.outcome_digest=p_outcome_digest then
    return v_effect.state;
  end if;
  if v_effect.state<>'reserved' or v_effect.lease_owner<>p_worker_id
    or v_effect.fencing_token<>p_fencing_token or v_effect.lease_expires_at<=pg_catalog.now() then
    raise exception 'testing_center_agent_effect_fencing_stale' using errcode='55000';
  end if;
  v_state := case when p_outcome='delivered' then 'completed' else 'needs_owner' end;
  update public.testing_center_agent_effect_outbox
    set state=v_state,lease_owner=null,lease_expires_at=null,outcome_digest=p_outcome_digest,updated_at=pg_catalog.now()
    where effect_id=p_effect_id;
  if p_outcome='ambiguous' then
    select state into strict v_job_state from public.testing_center_agent_jobs where job_key=v_effect.job_key;
    if public.testing_center_agent_transition_allowed(v_job_state,'needs_owner') then
      perform public.testing_center_transition_agent_job(
        v_effect.job_key,v_job_state,'needs_owner','effect-worker',p_outcome_digest
      );
    end if;
  end if;
  return v_state;
end $$;

create function public.testing_center_expire_reserved_agent_effect(
  p_effect_id text,p_now timestamptz default pg_catalog.now()
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare v_effect public.testing_center_agent_effect_outbox%rowtype; v_job_state text;
begin
  if p_effect_id='' or p_now is null then
    raise exception 'testing_center_agent_effect_expiry_invalid' using errcode='22023';
  end if;
  select * into v_effect from public.testing_center_agent_effect_outbox
    where effect_id=p_effect_id for update;
  if not found then raise exception 'testing_center_agent_effect_not_found' using errcode='P0002'; end if;
  if v_effect.state='needs_owner' then return 'needs_owner'; end if;
  if v_effect.state<>'reserved' then return v_effect.state; end if;
  if v_effect.lease_expires_at>p_now then return 'busy'; end if;
  update public.testing_center_agent_effect_outbox
    set state='needs_owner',lease_owner=null,lease_expires_at=null,updated_at=pg_catalog.now()
    where effect_id=p_effect_id;
  select state into strict v_job_state from public.testing_center_agent_jobs where job_key=v_effect.job_key;
  if public.testing_center_agent_transition_allowed(v_job_state,'needs_owner') then
    perform public.testing_center_transition_agent_job(
      v_effect.job_key,v_job_state,'needs_owner','effect-reconciler',v_effect.payload_digest
    );
  end if;
  return 'needs_owner';
end $$;

create function public.testing_center_record_agent_callback(
  p_delivery_id text,p_job_key text,p_head_sha text,p_callback_kind text,
  p_outcome text,p_payload_digest text
)
returns table(callback_status text,job_state text)
language plpgsql security definer set search_path = ''
as $$
declare v_job public.testing_center_agent_jobs%rowtype; v_callback public.testing_center_agent_callbacks%rowtype; v_target text;
begin
  if p_delivery_id='' or octet_length(p_delivery_id)>256 or p_delivery_id~'^[[:space:]]|[[:space:]]$'
    or p_head_sha!~'^[0-9a-f]{40}$' or p_callback_kind not in ('triage','fix')
    or p_outcome not in ('eligible','duplicate','needs_info','ineligible','accepted','ambiguous')
    or (p_callback_kind='triage' and p_outcome not in ('eligible','duplicate','needs_info','ineligible','ambiguous'))
    or (p_callback_kind='fix' and p_outcome not in ('accepted','ambiguous'))
    or p_payload_digest!~'^[0-9a-f]{64}$' then
    raise exception 'testing_center_agent_callback_invalid' using errcode='22023';
  end if;
  select * into v_job from public.testing_center_agent_jobs where job_key=p_job_key for update;
  if not found then raise exception 'testing_center_agent_job_not_found' using errcode='P0002'; end if;
  select * into v_callback from public.testing_center_agent_callbacks where delivery_id=p_delivery_id;
  if found then
    if v_callback.job_key=p_job_key and v_callback.head_sha=p_head_sha
      and v_callback.callback_kind=p_callback_kind and v_callback.outcome=p_outcome
      and v_callback.payload_digest=p_payload_digest then
      callback_status:='duplicate'; job_state:=v_job.state; return next; return;
    end if;
    if public.testing_center_agent_transition_allowed(v_job.state,'needs_owner') then
      perform public.testing_center_transition_agent_job(p_job_key,v_job.state,'needs_owner','callback-worker',p_payload_digest);
      v_job.state:='needs_owner';
    end if;
    callback_status:='needs_owner'; job_state:=v_job.state; return next; return;
  end if;
  if p_head_sha<>v_job.nightly_base_sha or p_outcome='ambiguous'
    or (p_callback_kind='triage' and v_job.state<>'triage_queued')
    or (p_callback_kind='fix' and v_job.state<>'eligible') then
    insert into public.testing_center_agent_callbacks(
      delivery_id,job_key,head_sha,callback_kind,outcome,payload_digest,disposition
    ) values (p_delivery_id,p_job_key,p_head_sha,p_callback_kind,p_outcome,p_payload_digest,'needs_owner');
    if public.testing_center_agent_transition_allowed(v_job.state,'needs_owner') then
      perform public.testing_center_transition_agent_job(p_job_key,v_job.state,'needs_owner','callback-worker',p_payload_digest);
      v_job.state:='needs_owner';
    end if;
    callback_status:='needs_owner'; job_state:=v_job.state; return next; return;
  end if;
  insert into public.testing_center_agent_callbacks(
    delivery_id,job_key,head_sha,callback_kind,outcome,payload_digest,disposition
  ) values (p_delivery_id,p_job_key,p_head_sha,p_callback_kind,p_outcome,p_payload_digest,'applied');
  if p_callback_kind='triage' then
    perform public.testing_center_transition_agent_job(p_job_key,'triage_queued','triaged','triage-callback',p_payload_digest);
    v_target:=p_outcome;
    perform public.testing_center_transition_agent_job(p_job_key,'triaged',v_target,'triage-callback',p_payload_digest);
    if v_target='eligible' then
      perform * from public.testing_center_queue_agent_effect(p_job_key,'github_dispatch','fix',v_job.dossier_digest);
    end if;
  else
    perform public.testing_center_transition_agent_job(p_job_key,'eligible','red_running','fix-callback',p_payload_digest);
  end if;
  callback_status:='applied'; job_state:=(select state from public.testing_center_agent_jobs where job_key=p_job_key);
  return next;
end $$;

create function public.testing_center_reserve_agent_resource(
  p_job_key text,p_reservation_kind text,p_reservation_key text,p_binding_digest text
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare v_existing public.testing_center_agent_reservations%rowtype; v_job public.testing_center_agent_jobs%rowtype;
begin
  if p_reservation_kind not in ('branch','pull_request','nightly_release')
    or p_reservation_key='' or octet_length(p_reservation_key)>256
    or p_binding_digest!~'^[0-9a-f]{64}$' then
    raise exception 'testing_center_agent_reservation_invalid' using errcode='22023';
  end if;
  select * into v_job from public.testing_center_agent_jobs where job_key=p_job_key for update;
  if not found then raise exception 'testing_center_agent_job_not_found' using errcode='P0002'; end if;
  select * into v_existing from public.testing_center_agent_reservations
    where job_key=p_job_key and reservation_kind=p_reservation_kind for update;
  if found then
    if v_existing.reservation_key<>p_reservation_key or v_existing.binding_digest<>p_binding_digest then
      if public.testing_center_agent_transition_allowed(v_job.state,'needs_owner') then
        perform public.testing_center_transition_agent_job(
          p_job_key,v_job.state,'needs_owner','reservation-worker',p_binding_digest
        );
        return 'needs_owner';
      end if;
      return v_job.state;
    end if;
    return 'existing';
  end if;
  insert into public.testing_center_agent_reservations(reservation_key,job_key,reservation_kind,binding_digest)
    values(p_reservation_key,p_job_key,p_reservation_kind,p_binding_digest);
  return 'reserved';
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'testing_center_agent_job_key(text,text,text,text)',
    'testing_center_agent_transition_allowed(text,text)',
    'testing_center_transition_agent_job(text,text,text,text,text)',
    'testing_center_queue_agent_effect(text,text,text,text)',
    'testing_center_queue_agent_job(text,text,integer,text,text,text,text)',
    'testing_center_claim_agent_effect(text,integer)',
    'testing_center_reserve_agent_effect(text,text,bigint)',
    'testing_center_complete_agent_effect(text,text,bigint,text,text)',
    'testing_center_expire_reserved_agent_effect(text,timestamptz)',
    'testing_center_record_agent_callback(text,text,text,text,text,text)',
    'testing_center_reserve_agent_resource(text,text,text,text)'
  ] loop
    execute 'revoke all on function public.' || fn || ' from public, anon, authenticated';
  end loop;
end $$;

grant execute on function public.testing_center_transition_agent_job(text,text,text,text,text) to service_role;
grant execute on function public.testing_center_queue_agent_effect(text,text,text,text) to service_role;
grant execute on function public.testing_center_queue_agent_job(text,text,integer,text,text,text,text) to service_role;
grant execute on function public.testing_center_claim_agent_effect(text,integer) to service_role;
grant execute on function public.testing_center_reserve_agent_effect(text,text,bigint) to service_role;
grant execute on function public.testing_center_complete_agent_effect(text,text,bigint,text,text) to service_role;
grant execute on function public.testing_center_expire_reserved_agent_effect(text,timestamptz) to service_role;
grant execute on function public.testing_center_record_agent_callback(text,text,text,text,text,text) to service_role;
grant execute on function public.testing_center_reserve_agent_resource(text,text,text,text) to service_role;

comment on table public.testing_center_agent_jobs is
  'HAF-05 one immutable generation-one autofix job per Testing Center technical issue.';
comment on table public.testing_center_agent_effect_outbox is
  'HAF-05 per-phase external effects with lease, fencing and no retry after reservation ambiguity.';
