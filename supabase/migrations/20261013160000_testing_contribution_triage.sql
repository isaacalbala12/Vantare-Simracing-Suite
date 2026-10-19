-- #1594 / VANTA-38, design r2. REVIEW CANDIDATE, not production activation.
-- Requires the reviewed #1535 minimal participation + internal account package.
-- No passwords, identity activation, model execution, webhook or billing effects.
begin;
set local lock_timeout = '5s';

-- Closed shape at every system level; never a process list or arbitrary metadata.
create function private.testing_system_valid(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare v jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 4096
    or p - array['os','cpu','gpu','ram_gb','displays','overlays_active','obs_active'] <> '{}'::jsonb then return false; end if;
  if p ? 'os' then
    v := p->'os';
    if jsonb_typeof(v) is distinct from 'object' or v - array['name','version','build'] <> '{}'::jsonb
      or exists(select 1 from jsonb_each(v) x where jsonb_typeof(x.value) <> 'string' or length(x.value #>> '{}') > 120) then return false; end if;
  end if;
  if p ? 'cpu' then
    v := p->'cpu';
    if jsonb_typeof(v) is distinct from 'object' or v - array['model','cores'] <> '{}'::jsonb then return false; end if;
    if v ? 'model' and (jsonb_typeof(v->'model') <> 'string' or length(v->>'model') > 160) then return false; end if;
    if v ? 'cores' and (jsonb_typeof(v->'cores') <> 'number' or (v->>'cores') !~ '^[0-9]+$') then return false; end if;
    if v ? 'cores' and (v->>'cores')::numeric not between 1 and 1024 then return false; end if;
  end if;
  if p ? 'ram_gb' then
    if jsonb_typeof(p->'ram_gb') <> 'number' then return false; end if;
    if (p->>'ram_gb')::numeric not between 0 and 65536 then return false; end if;
  end if;
  if p ? 'obs_active' and jsonb_typeof(p->'obs_active') <> 'boolean' then return false; end if;
  if p ? 'gpu' then
    if jsonb_typeof(p->'gpu') <> 'array' then return false; end if;
    if jsonb_array_length(p->'gpu') > 8 then return false; end if;
    for v in select value from jsonb_array_elements(p->'gpu') loop
      if jsonb_typeof(v) <> 'object' or v - array['model','driver_version'] <> '{}'::jsonb
        or exists(select 1 from jsonb_each(v) x where jsonb_typeof(x.value) <> 'string' or length(x.value #>> '{}') > 160) then return false; end if;
    end loop;
  end if;
  if p ? 'displays' then
    if jsonb_typeof(p->'displays') <> 'array' then return false; end if;
    if jsonb_array_length(p->'displays') > 16 then return false; end if;
    for v in select value from jsonb_array_elements(p->'displays') loop
      if jsonb_typeof(v) <> 'object' or v - array['width','height','hz','dpi_scale','primary'] <> '{}'::jsonb then return false; end if;
      if exists(select 1 from jsonb_each(v) x where
        (x.key = 'primary' and jsonb_typeof(x.value) <> 'boolean') or
        (x.key <> 'primary' and jsonb_typeof(x.value) <> 'number')) then return false; end if;
      if exists(select 1 from jsonb_each(v) x where x.key <> 'primary' and
        (x.value #>> '{}')::numeric not between 0.01 and 65536) then return false; end if;
    end loop;
  end if;
  if p ? 'overlays_active' then
    if jsonb_typeof(p->'overlays_active') <> 'array' then return false; end if;
    if jsonb_array_length(p->'overlays_active') > 5 or exists(
      select 1 from jsonb_array_elements(p->'overlays_active') x where
      jsonb_typeof(x.value) <> 'string' or x.value #>> '{}' not in ('OBS','Streamlabs','SimHub','CrewChief','Vantare')) then return false; end if;
  end if;
  return true;
end $$;
revoke all on function private.testing_system_valid(jsonb) from public, anon, authenticated, service_role;

create function private.testing_telemetry_valid(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare v jsonb; metric jsonb;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 32768
    or p - array['errors','performance','events'] <> '{}'::jsonb then return false; end if;
  if p ? 'errors' then
    if jsonb_typeof(p->'errors') <> 'array' then return false; end if;
    if jsonb_array_length(p->'errors') > 20 then return false; end if;
    for v in select value from jsonb_array_elements(p->'errors') loop
      if jsonb_typeof(v) <> 'object' or v - array['type','message','first_line','fingerprint'] <> '{}'::jsonb
        or not (v ?& array['type','message','fingerprint'])
        or exists(select 1 from jsonb_each(v) x where jsonb_typeof(x.value) <> 'string' or length(x.value #>> '{}') > 1000) then return false; end if;
    end loop;
  end if;
  if p ? 'events' then
    if jsonb_typeof(p->'events') <> 'array' then return false; end if;
    if jsonb_array_length(p->'events') > 50 then return false; end if;
    for v in select value from jsonb_array_elements(p->'events') loop
      if jsonb_typeof(v) <> 'object' or v - array['name','at'] <> '{}'::jsonb or not (v ?& array['name','at'])
        or exists(select 1 from jsonb_each(v) x where jsonb_typeof(x.value) <> 'string' or length(x.value #>> '{}') > 120) then return false; end if;
    end loop;
  end if;
  if p ? 'performance' then
    v := p->'performance';
    if jsonb_typeof(v) <> 'object' or v - array['overlay_fps','cpu_percent','memory_mb','telemetry_latency_ms'] <> '{}'::jsonb then return false; end if;
    for metric in select value from jsonb_each(v) loop
      if jsonb_typeof(metric) <> 'object' or metric - array['p50','p95'] <> '{}'::jsonb
        or exists(select 1 from jsonb_each(metric) x where jsonb_typeof(x.value) <> 'number') then return false; end if;
    end loop;
  end if;
  return true;
end $$;
revoke all on function private.testing_telemetry_valid(jsonb) from public,anon,authenticated,service_role;

create function private.testing_proposal_valid(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare v jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 8192
    or not (p ?& array['schema','verdict','criteria','duplicate_of','severity','area','evidence_refs',
      'summary','preliminary_fix','confidence','reasons','trazable'])
    or p - array['schema','verdict','criteria','duplicate_of','severity','area','evidence_refs',
      'summary','preliminary_fix','confidence','reasons','trazable'] <> '{}'::jsonb then return false; end if;
  if p->>'schema' is distinct from 'vantare.triage.v2' or p->>'verdict' not in ('valido','dudoso','spam')
    or jsonb_typeof(p->'verdict') <> 'string' or jsonb_typeof(p->'confidence') <> 'number'
    or p->>'trazable' not in ('si','no') or jsonb_typeof(p->'trazable') <> 'string' then return false; end if;
  if (p->>'confidence')::numeric not between 0 and 1 then return false; end if;
  v := p->'criteria';
  if jsonb_typeof(v) <> 'object' or not (v ?& array['contenido_minimo','evidencia','no_duplicado'])
    or v - array['contenido_minimo','evidencia','no_duplicado'] <> '{}'::jsonb
    or v->>'contenido_minimo' not in ('si','no') or v->>'evidencia' not in ('si','debil','no')
    or v->>'no_duplicado' not in ('si','no')
    or exists(select 1 from jsonb_each(v) x where jsonb_typeof(x.value) <> 'string') then return false; end if;
  if jsonb_typeof(p->'duplicate_of') not in ('string','null') then return false; end if;
  if jsonb_typeof(p->'duplicate_of') = 'string' and p->>'duplicate_of' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  if jsonb_typeof(p->'severity') not in ('string','null') then return false; end if;
  if jsonb_typeof(p->'severity') = 'string' and p->>'severity' not in ('critica','alta','media','baja') then return false; end if;
  if jsonb_typeof(p->'area') <> 'string' or p->>'area' not in
    ('overlays','ingeniero','estrategia','launcher','calendario','testing-center','telemetria','plataforma','licencias','studio','otro')
    or jsonb_typeof(p->'summary') <> 'string' or length(p->>'summary') > 200
    or jsonb_typeof(p->'preliminary_fix') not in ('string','null') or length(p->>'preliminary_fix') > 600 then return false; end if;
  if jsonb_typeof(p->'reasons') <> 'array' or jsonb_typeof(p->'evidence_refs') <> 'array' then return false; end if;
  if jsonb_array_length(p->'reasons') > 5 or jsonb_array_length(p->'evidence_refs') > 50
    or exists(select 1 from jsonb_array_elements(p->'reasons') x where jsonb_typeof(x.value) <> 'string' or length(x.value #>> '{}') > 200)
    or exists(select 1 from jsonb_array_elements(p->'evidence_refs') x where jsonb_typeof(x.value) <> 'string' or length(x.value #>> '{}') > 120) then return false; end if;
  return true;
end $$;
revoke all on function private.testing_proposal_valid(jsonb) from public,anon,authenticated,service_role;

create table public.testing_contribution_context (
  contribution_id uuid primary key references public.testing_contributions(id) on delete cascade,
  app_version text not null check (length(app_version) <= 60 and app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.-]+)?$'),
  app_channel text not null check (app_channel in ('stable','testers','nightly')),
  game text not null check (game in ('lmu','acc','none')),
  game_version text check (length(game_version) between 1 and 120),
  system jsonb not null check (private.testing_system_valid(system)),
  telemetry_summary jsonb check (private.testing_telemetry_valid(telemetry_summary)
    and pg_column_size(telemetry_summary) <= 32768),
  posthog_session_id text check (length(posthog_session_id) between 1 and 128 and posthog_session_id ~ '^[a-zA-Z0-9_-]+$'),
  consent jsonb not null check (jsonb_typeof(consent) = 'object' and pg_column_size(consent) <= 2048)
);
create table public.testing_contribution_attachments (
  contribution_id uuid not null references public.testing_contributions(id) on delete cascade,
  kind text not null check (kind in ('app_log','telemetry_fragment')),
  content text not null check (octet_length(content) <= 262144),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'
    and sha256 = encode(sha256(convert_to(content, 'UTF8')), 'hex')),
  primary key (contribution_id, kind)
);
create table public.testing_contribution_reviews (
  contribution_id uuid primary key references public.testing_contributions(id) on delete cascade,
  reviewer uuid references public.profiles(id) on delete set null,
  decision text not null check (decision in ('accepted','declined','spam')),
  note text not null check (length(trim(note)) between 1 and 1000),
  model_verdict text not null check (model_verdict in ('valido','dudoso','spam')),
  model_confidence double precision not null check (model_confidence between 0 and 1),
  model text not null default 'opencode-go/deepseek-v4.1-flash'
    check (model = 'opencode-go/deepseek-v4.1-flash'),
  proposal jsonb not null check (private.testing_proposal_valid(proposal)),
  decided_at timestamptz not null default clock_timestamp()
);
alter table public.testing_contributions drop constraint testing_contributions_state_check;
alter table public.testing_contributions add constraint testing_contributions_state_check
  check (state in ('received','reviewing','accepted','declined','spam'));
create index testing_contributions_triage_queue on public.testing_contributions(created_at, id) where state = 'received';

alter table public.testing_contribution_context enable row level security;
alter table public.testing_contribution_context force row level security;
alter table public.testing_contribution_attachments enable row level security;
alter table public.testing_contribution_attachments force row level security;
alter table public.testing_contribution_reviews enable row level security;
alter table public.testing_contribution_reviews force row level security;
revoke all on public.testing_contribution_context, public.testing_contribution_attachments,
  public.testing_contribution_reviews from public, anon, authenticated, service_role;
grant select on public.testing_contribution_context, public.testing_contribution_attachments,
  public.testing_contribution_reviews to authenticated;
create policy testing_context_self on public.testing_contribution_context for select to authenticated using (
  exists(select 1 from public.testing_contributions c where c.id = contribution_id));
create policy testing_attachments_self on public.testing_contribution_attachments for select to authenticated using (
  exists(select 1 from public.testing_contributions c where c.id = contribution_id));
create policy testing_reviews_self on public.testing_contribution_reviews for select to authenticated using (
  exists(select 1 from public.testing_contributions c where c.id = contribution_id));
-- Owners can inspect the evidence without opening reads to other testers.
create policy testing_contributions_owner on public.testing_contributions for select to authenticated
  using (public.testing_center_current_role() = 'owner');

-- Credential creation is separate. Refuse to reuse a possibly privileged role.
-- CREATE ROLE defaults to no superuser/createdb/createrole/replication/bypassrls.
-- Do not request privileged attribute changes from managed postgres.
-- Roles survive schema rebuilds. Reuse a safe principal without touching
-- its password or privileged attributes; only repair permitted local drift.
do $vantare_triage_role$
declare r pg_catalog.pg_roles%rowtype;
begin
  select * into r from pg_catalog.pg_roles where rolname='vantare_triage';
  if not found then
    create role vantare_triage nologin noinherit connection limit 2;
    select * into strict r from pg_catalog.pg_roles where rolname='vantare_triage';
  end if;
  if r.rolsuper or r.rolbypassrls or r.rolreplication or r.rolcreatedb or r.rolcreaterole then
    raise exception 'unsafe_vantare_triage_attributes' using errcode='42501',
      hint='Review the existing role with its administrator; migrations never demote privileged roles.';
  end if;
  begin
    if r.rolcanlogin then alter role vantare_triage nologin; end if;
    if r.rolinherit then alter role vantare_triage noinherit; end if;
    if r.rolconnlimit <> 2 then alter role vantare_triage connection limit 2; end if;
    if not coalesce(r.rolconfig @> array['default_transaction_read_only=on'],false) then
      alter role vantare_triage set default_transaction_read_only = on;
    end if;
    if not coalesce(r.rolconfig @> array['statement_timeout=10s'],false) then
      alter role vantare_triage set statement_timeout = '10s';
    end if;
  exception when insufficient_privilege then
    raise exception 'vantare_triage_attributes_require_admin' using errcode='42501',
      hint='The role administrator must repair the permitted attributes before retrying.';
  end;
end $vantare_triage_role$;
grant usage on schema public to vantare_triage;
grant select (id,channel,title,body,state,created_at) on public.testing_contributions to vantare_triage;
grant select (contribution_id,app_version,app_channel,game,game_version,system,telemetry_summary,consent)
  on public.testing_contribution_context to vantare_triage;
grant select on public.testing_contribution_attachments to vantare_triage;
create policy triage_read on public.testing_contributions for select to vantare_triage
  using (created_at > statement_timestamp() - interval '30 days');
create policy triage_read on public.testing_contribution_context for select to vantare_triage using (
  exists(select 1 from public.testing_contributions c where c.id = contribution_id
    and c.created_at > statement_timestamp() - interval '30 days'));
create policy triage_read on public.testing_contribution_attachments for select to vantare_triage using (
  exists(select 1 from public.testing_contributions c where c.id = contribution_id
    and c.created_at > statement_timestamp() - interval '30 days'));

-- Follow the existing #1535 public RPC contract: exact EXECUTE grants,
-- explicit server authorization and empty search_path; private ACLs unchanged.
create function public.testing_contribution_submit_v2(p_id uuid, p_channel text, p_title text,
  p_body text, p_context jsonb, p_attachments jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.testing_contribution_context%rowtype; a jsonb; items jsonb; accepted_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'testing_membership_required' using errcode = '42501'; end if;
  perform 1 from public.testing_center_memberships where user_id = auth.uid() and active
    and ((role in ('owner','primary_tester') and p_channel in ('nightly','testers'))
      or (role = 'tester' and p_channel = 'testers')) for share;
  if not found then
    raise exception 'testing_membership_required' using errcode = '42501'; end if;
  if p_context is null or jsonb_typeof(p_context) <> 'object'
    or p_context - array['app_version','app_channel','game','game_version','system','telemetry_summary','posthog_session_id','consent'] <> '{}'::jsonb
    or not (p_context ?& array['app_version','app_channel','game','system','consent'])
    or jsonb_typeof(p_context->'app_version') <> 'string' or jsonb_typeof(p_context->'app_channel') <> 'string'
    or jsonb_typeof(p_context->'game') <> 'string' or p_context->>'app_channel' is distinct from p_channel
    or (p_context ? 'game_version' and jsonb_typeof(p_context->'game_version') not in ('string','null'))
    or (p_context ? 'posthog_session_id' and jsonb_typeof(p_context->'posthog_session_id') not in ('string','null'))
    or jsonb_typeof(p_context->'consent') <> 'object' then
    raise exception 'testing_context_invalid' using errcode = '22023'; end if;
  a := p_context->'consent'; items := a->'items';
  if a - array['version','items','accepted_at'] <> '{}'::jsonb
    or a->>'version' is distinct from 'triage-v2' or jsonb_typeof(items) is distinct from 'array'
    or jsonb_typeof(a->'accepted_at') is distinct from 'string' then
    raise exception 'testing_consent_required' using errcode = '22023'; end if;
  if jsonb_array_length(items) > 5 or exists(select 1 from jsonb_array_elements(items) x where
    jsonb_typeof(x.value) <> 'string' or x.value #>> '{}' not in
    ('system','telemetry_summary','app_log','telemetry_fragment','posthog_session'))
    or (select count(*) <> count(distinct value) from jsonb_array_elements(items)) then
    raise exception 'testing_consent_invalid' using errcode = '22023'; end if;
  accepted_at := (a->>'accepted_at')::timestamptz;
  if not isfinite(accepted_at) or accepted_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'testing_consent_invalid' using errcode = '22023'; end if;
  if (not items ? 'system' and p_context->'system' <> '{}'::jsonb)
    or (not items ? 'telemetry_summary' and coalesce(p_context->'telemetry_summary','null'::jsonb) <> 'null'::jsonb)
    or (not items ? 'posthog_session' and coalesce(p_context->'posthog_session_id','null'::jsonb) <> 'null'::jsonb) then
    raise exception 'testing_unconsented_data' using errcode = '22023'; end if;
  if p_attachments is null or jsonb_typeof(p_attachments) <> 'array' then
    raise exception 'testing_attachments_invalid' using errcode = '22023'; end if;
  if jsonb_array_length(p_attachments) > 2 then raise exception 'testing_attachments_invalid' using errcode = '22023'; end if;
  for a in select value from jsonb_array_elements(p_attachments) loop
    if jsonb_typeof(a) <> 'object' or a - array['kind','content','sha256'] <> '{}'::jsonb
      or not (a ?& array['kind','content','sha256'])
      or exists(select 1 from jsonb_each(a) x where jsonb_typeof(x.value) <> 'string')
      or not items ? (a->>'kind') then
      raise exception 'testing_attachments_invalid' using errcode = '22023'; end if;
  end loop;
  -- Parent lock also serializes retries and review against this upload.
  perform public.testing_contribution_submit(p_id,p_channel,p_title,p_body);
  perform 1 from public.testing_contributions where id = p_id for update;
  select * into v from public.testing_contribution_context where contribution_id = p_id;
  if found then
    if (to_jsonb(v) - 'contribution_id') is distinct from jsonb_build_object(
      'app_version',p_context->'app_version','app_channel',p_context->'app_channel',
      'game',p_context->'game','game_version',p_context->'game_version','system',p_context->'system',
      'telemetry_summary',nullif(p_context->'telemetry_summary','null'::jsonb),
      'posthog_session_id',p_context->'posthog_session_id','consent',p_context->'consent')
      or (select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'content',content,'sha256',sha256) order by kind),'[]'::jsonb)
        from public.testing_contribution_attachments where contribution_id = p_id)
        is distinct from (select coalesce(jsonb_agg(value order by value->>'kind'),'[]'::jsonb) from jsonb_array_elements(p_attachments)) then
      raise exception 'testing_contribution_conflict' using errcode = '23505'; end if;
    return;
  end if;
  if exists(select 1 from public.testing_contribution_reviews where contribution_id = p_id)
    or exists(select 1 from public.testing_contributions where id = p_id and state <> 'received') then
    raise exception 'testing_contribution_conflict' using errcode = '23505'; end if;
  insert into public.testing_contribution_context values (p_id,p_context->>'app_version',p_channel,
    p_context->>'game',p_context->>'game_version',p_context->'system',
    nullif(p_context->'telemetry_summary','null'::jsonb),p_context->>'posthog_session_id',p_context->'consent');
  insert into public.testing_contribution_attachments
    select p_id,value->>'kind',value->>'content',value->>'sha256' from jsonb_array_elements(p_attachments);
end $$;

-- Calling this RPC is the second, authenticated human/orchestrator confirmation.
-- The read-only worker never calls it. No default proposal or automatic acceptance.
create function public.testing_contribution_review(p_id uuid,p_decision text,p_note text,p_proposal jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.testing_contributions%rowtype; r public.testing_contribution_reviews%rowtype; t timestamptz;
begin
  if auth.uid() is null then raise exception 'testing_owner_required' using errcode = '42501'; end if;
  -- Hold membership until commit so revocation cannot race confirmation.
  perform 1 from public.testing_center_memberships
    where user_id = auth.uid() and active and role = 'owner' for share;
  if not found then raise exception 'testing_owner_required' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('accepted','declined','spam')
    or p_note is null or length(trim(p_note)) not between 1 and 1000
    or p_proposal is null or not private.testing_proposal_valid(p_proposal) then
    raise exception 'testing_review_invalid' using errcode = '22023'; end if;
  if p_decision = 'accepted' and current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'testing_review_read_committed_required' using errcode = '25000'; end if;
  select * into c from public.testing_contributions where id = p_id for update;
  if not found then raise exception 'testing_contribution_missing' using errcode = 'P0002'; end if;
  select * into r from public.testing_contribution_reviews where contribution_id = p_id;
  if found then
    if r.reviewer = auth.uid() and r.decision = p_decision and r.note = p_note and r.proposal = p_proposal then return; end if;
    raise exception 'testing_review_conflict' using errcode = '23505'; end if;
  if c.state not in ('received','reviewing') then raise exception 'testing_review_conflict' using errcode = '23505'; end if;
  -- Serializes acceptance for different contributions of one account.
  perform pg_advisory_xact_lock(hashtextextended(c.account_id::text,1594));
  t := c.created_at;
  if p_decision = 'accepted' and (
    exists(select 1 from public.testing_contributions x where x.account_id = c.account_id and x.state = 'accepted'
      and (x.created_at at time zone 'UTC')::date = (t at time zone 'UTC')::date)
    or (select count(*) from public.testing_contributions x where x.account_id = c.account_id and x.state = 'accepted'
      and date_trunc('week',x.created_at at time zone 'UTC') = date_trunc('week',t at time zone 'UTC')) >= 2) then
    raise exception 'testing_acceptance_limit' using errcode = '23514'; end if;
  insert into public.testing_contribution_reviews(contribution_id,reviewer,decision,note,model_verdict,model_confidence,proposal)
    values(p_id,auth.uid(),p_decision,p_note,p_proposal->>'verdict',(p_proposal->>'confidence')::double precision,p_proposal);
  update public.testing_contributions set state = p_decision where id = p_id;
end $$;
revoke all on function public.testing_contribution_submit_v2(uuid,text,text,text,jsonb,jsonb),
  public.testing_contribution_review(uuid,text,text,jsonb) from public,anon,authenticated,service_role,vantare_triage;
grant execute on function public.testing_contribution_submit_v2(uuid,text,text,text,jsonb,jsonb),
  public.testing_contribution_review(uuid,text,text,jsonb) to authenticated;

-- pg_cron registration is a reviewed activation step, not an implicit dependency.
create function private.testing_contribution_purge_evidence() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.testing_contribution_attachments a using public.testing_contributions c
    left join public.testing_contribution_reviews r on r.contribution_id = c.id
    where a.contribution_id = c.id and clock_timestamp() >= least(
      coalesce(r.decided_at + interval '90 days','infinity'::timestamptz),
      case when c.created_at >= timestamptz '2026-10-19 00:00:00+00'
        and c.created_at < timestamptz '2026-12-01 00:00:00+00'
        then timestamptz '2027-01-31 00:00:00+00' else 'infinity'::timestamptz end);
  update public.testing_contribution_context ctx set telemetry_summary = null
    from public.testing_contributions c left join public.testing_contribution_reviews r on r.contribution_id = c.id
    where ctx.contribution_id = c.id and ctx.telemetry_summary is not null and clock_timestamp() >= least(
      coalesce(r.decided_at + interval '90 days','infinity'::timestamptz),
      case when c.created_at >= timestamptz '2026-10-19 00:00:00+00'
        and c.created_at < timestamptz '2026-12-01 00:00:00+00'
        then timestamptz '2027-01-31 00:00:00+00' else 'infinity'::timestamptz end);
end $$;
revoke all on function private.testing_contribution_purge_evidence() from public,anon,authenticated,service_role,vantare_triage;
commit;
