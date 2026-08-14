-- ISA-350 / TC-EVIDENCE-03: private screenshot manifests and server-owned
-- Storage paths. Byte validation and every remote effect remain out of scope.

do $$
declare
  v_bucket storage.buckets%rowtype;
begin
  select * into v_bucket from storage.buckets where id = 'testing-center-evidence';
  if found and (
    v_bucket.name is distinct from 'testing-center-evidence'
    or v_bucket.public is distinct from false
    or v_bucket.file_size_limit is distinct from 10485760
    or v_bucket.allowed_mime_types is distinct from array['image/png','image/jpeg']::text[]
  ) then
    raise exception 'testing_center_evidence_bucket_incompatible' using errcode = '55000';
  end if;
  if found then
    raise exception 'testing_center_evidence_bucket_already_exists' using errcode = '55000';
  end if;

  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values (
    'testing-center-evidence','testing-center-evidence',false,10485760,
    array['image/png','image/jpeg']::text[]
  );
end
$$;

create table public.testing_center_evidence_batches (
  contract_version text not null default 'testing-center.screenshot-evidence.v1'
    constraint testing_center_evidence_batches_contract_check
    check (contract_version = 'testing-center.screenshot-evidence.v1'),
  batch_id uuid primary key,
  reporter_user_id uuid not null references auth.users(id) on delete restrict,
  channel text not null
    constraint testing_center_evidence_batches_channel_check
    check (channel in ('nightly','testers')),
  idempotency_key text not null
    constraint testing_center_evidence_batches_key_check
    check (
      idempotency_key <> ''
      and idempotency_key !~ '^[[:space:]]|[[:space:]]$'
      and octet_length(idempotency_key) <= 256
    ),
  manifest_digest text not null
    constraint testing_center_evidence_batches_digest_check
    check (manifest_digest ~ '^[0-9a-f]{64}$'),
  state text not null default 'prepared'
    constraint testing_center_evidence_batches_state_check
    check (state in ('prepared','uploading','validating','ready','attached','expired')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint testing_center_evidence_batches_expiry_check
    check (expires_at = created_at + interval '24 hours'),
  unique(reporter_user_id,idempotency_key)
);

create table public.testing_center_screenshot_evidence (
  contract_version text not null default 'testing-center.screenshot-evidence.v1'
    constraint testing_center_screenshot_evidence_contract_check
    check (contract_version = 'testing-center.screenshot-evidence.v1'),
  evidence_id uuid primary key,
  batch_id uuid not null references public.testing_center_evidence_batches(batch_id) on delete restrict,
  report_id text references public.testing_center_reports(report_id) on delete restrict,
  position smallint not null
    constraint testing_center_screenshot_evidence_position_check check (position between 1 and 10),
  object_path text not null unique
    constraint testing_center_screenshot_evidence_path_check
    check (object_path ~ '^v1/[0-9a-f]{32}/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  media_type text not null
    constraint testing_center_screenshot_evidence_mime_check
    check (media_type in ('image/png','image/jpeg')),
  byte_size integer not null
    constraint testing_center_screenshot_evidence_size_check
    check (byte_size between 1 and 10485760),
  sha256 text not null
    constraint testing_center_screenshot_evidence_sha_check
    check (sha256 ~ '^[0-9a-f]{64}$'),
  width integer not null
    constraint testing_center_screenshot_evidence_width_check check (width between 1 and 16384),
  height integer not null
    constraint testing_center_screenshot_evidence_height_check check (height between 1 and 16384),
  state text not null default 'prepared'
    constraint testing_center_screenshot_evidence_state_check
    check (state in ('prepared','uploading','uploaded','validating','ready','rejected','removed','expired')),
  failure_code text
    constraint testing_center_screenshot_evidence_failure_check
    check (
      (state <> 'rejected' and failure_code is null)
      or (state = 'rejected' and failure_code in (
        'invalid_size','invalid_media_type','digest_mismatch','invalid_signature',
        'invalid_dimensions','object_missing','validation_failed'
      ))
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  validated_at timestamptz,
  constraint testing_center_screenshot_evidence_pixels_check
    check (width::bigint * height::bigint <= 40000000),
  constraint testing_center_screenshot_evidence_validated_check
    check ((state in ('ready','rejected') and validated_at is not null) or (state not in ('ready','rejected') and validated_at is null)),
  unique(batch_id,position)
);

create table public.testing_center_evidence_outbox (
  job_id uuid primary key,
  evidence_id uuid not null references public.testing_center_screenshot_evidence(evidence_id) on delete restrict,
  kind text not null constraint testing_center_evidence_outbox_kind_check check (kind in ('validate','delete')),
  state text not null default 'queued'
    constraint testing_center_evidence_outbox_state_check check (state in ('queued','claimed','completed','failed')),
  attempt_count integer not null default 0
    constraint testing_center_evidence_outbox_attempt_check check (attempt_count between 0 and 100),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  fencing_token bigint not null default 0
    constraint testing_center_evidence_outbox_fencing_check check (fencing_token >= 0),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint testing_center_evidence_outbox_lease_check check (
    (state = 'claimed' and lease_owner is not null and lease_expires_at is not null and fencing_token > 0)
    or (state <> 'claimed' and lease_owner is null and lease_expires_at is null)
  ),
  constraint testing_center_evidence_outbox_evidence_kind_key unique(evidence_id,kind)
);

create index testing_center_evidence_batches_expiry_idx
  on public.testing_center_evidence_batches(state,expires_at);
create index testing_center_screenshot_evidence_batch_idx
  on public.testing_center_screenshot_evidence(batch_id,state,position);
create index testing_center_evidence_outbox_claim_idx
  on public.testing_center_evidence_outbox(state,available_at,lease_expires_at);

alter table public.testing_center_evidence_batches enable row level security;
alter table public.testing_center_evidence_batches force row level security;
alter table public.testing_center_screenshot_evidence enable row level security;
alter table public.testing_center_screenshot_evidence force row level security;
alter table public.testing_center_evidence_outbox enable row level security;
alter table public.testing_center_evidence_outbox force row level security;

revoke all on table public.testing_center_evidence_batches,
  public.testing_center_screenshot_evidence,
  public.testing_center_evidence_outbox
from public,anon,authenticated;
grant select,insert,update,delete on table public.testing_center_evidence_batches,
  public.testing_center_screenshot_evidence,
  public.testing_center_evidence_outbox
to service_role;

alter table public.testing_center_evidence
  drop constraint testing_center_evidence_kind_check,
  add constraint testing_center_evidence_kind_check
  check (kind in ('report_context','diagnostic','reproduction','screenshot'));

create function public.testing_center_can_insert_evidence_object(
  p_bucket_id text,
  p_object_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_bucket_id = 'testing-center-evidence' and exists (
    select 1
    from public.testing_center_screenshot_evidence as evidence
    join public.testing_center_evidence_batches as batch using(batch_id)
    where batch.reporter_user_id = auth.uid()
      and batch.expires_at > pg_catalog.now()
      and batch.state in ('prepared','uploading','validating')
      and evidence.object_path = p_object_path
      and evidence.state = 'prepared'
  )
$$;

revoke all on function public.testing_center_can_insert_evidence_object(text,text)
from public,anon;
grant execute on function public.testing_center_can_insert_evidence_object(text,text)
to authenticated;

create policy testing_center_evidence_insert_own_slot
on storage.objects
for insert
to authenticated
with check (public.testing_center_can_insert_evidence_object(bucket_id,name));

create function public.testing_center_prepare_screenshot_batch(
  p_contract_version text,
  p_channel text,
  p_idempotency_key text,
  p_manifest jsonb
)
returns table(
  batch_id uuid,
  expires_at timestamptz,
  state text,
  slots jsonb,
  idempotent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_manifest_digest text;
  v_batch_hex text;
  v_batch_id uuid;
  v_user_hash text;
  v_existing public.testing_center_evidence_batches%rowtype;
  v_created_at timestamptz := pg_catalog.now();
  v_item record;
  v_evidence_hex text;
  v_evidence_id uuid;
begin
  if v_user_id is null then
    raise exception 'testing_center_auth_required' using errcode='42501';
  end if;
  select membership.role into v_role
  from public.testing_center_memberships as membership
  where membership.user_id=v_user_id and membership.active;
  if not found then
    raise exception 'testing_center_membership_required' using errcode='42501';
  end if;
  if p_contract_version is distinct from 'testing-center.screenshot-evidence.v1' then
    raise exception 'testing_center_evidence_contract_invalid' using errcode='22023';
  end if;
  if p_channel='nightly' then
    if v_role not in ('primary_tester','owner') then
      raise exception 'testing_center_nightly_role_required' using errcode='42501';
    end if;
  elsif p_channel='testers' then
    if v_role not in ('tester','primary_tester','owner') then
      raise exception 'testing_center_testers_role_required' using errcode='42501';
    end if;
  else
    raise exception 'testing_center_channel_invalid' using errcode='22023';
  end if;
  if p_idempotency_key is null or p_idempotency_key=''
    or p_idempotency_key ~ '^[[:space:]]|[[:space:]]$'
    or pg_catalog.octet_length(p_idempotency_key)>256 then
    raise exception 'testing_center_idempotency_key_invalid' using errcode='22023';
  end if;
  if pg_catalog.jsonb_typeof(p_manifest) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_manifest) not between 1 and 10 then
    raise exception 'testing_center_evidence_manifest_invalid' using errcode='22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_manifest) with ordinality as manifest(item,ordinality)
    where pg_catalog.jsonb_typeof(item) <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(item)) <> 6
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(item) as key
        where key not in ('position','mediaType','byteSize','sha256','width','height')
      )
      or pg_catalog.jsonb_typeof(item->'position') <> 'number'
      or item->>'position' !~ '^[1-9][0-9]*$'
      or (item->>'position')::numeric <> ordinality
      or pg_catalog.jsonb_typeof(item->'mediaType') <> 'string'
      or item->>'mediaType' not in ('image/png','image/jpeg')
      or pg_catalog.jsonb_typeof(item->'byteSize') <> 'number'
      or item->>'byteSize' !~ '^[1-9][0-9]*$'
      or (item->>'byteSize')::numeric not between 1 and 10485760
      or pg_catalog.jsonb_typeof(item->'sha256') <> 'string'
      or item->>'sha256' !~ '^[0-9a-f]{64}$'
      or pg_catalog.jsonb_typeof(item->'width') <> 'number'
      or item->>'width' !~ '^[1-9][0-9]*$'
      or (item->>'width')::numeric not between 1 and 16384
      or pg_catalog.jsonb_typeof(item->'height') <> 'number'
      or item->>'height' !~ '^[1-9][0-9]*$'
      or (item->>'height')::numeric not between 1 and 16384
      or (item->>'width')::numeric * (item->>'height')::numeric > 40000000
  ) or (
    select sum((item->>'byteSize')::numeric)
    from pg_catalog.jsonb_array_elements(p_manifest) as manifest(item)
  ) > 104857600 then
    raise exception 'testing_center_evidence_manifest_invalid' using errcode='22023';
  end if;

  v_manifest_digest := pg_catalog.encode(public.digest(
    pg_catalog.convert_to(p_manifest::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || pg_catalog.chr(31) || p_idempotency_key,0));
  select * into v_existing
  from public.testing_center_evidence_batches as batch
  where batch.reporter_user_id=v_user_id and batch.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.contract_version <> p_contract_version
      or v_existing.channel <> p_channel
      or v_existing.manifest_digest <> v_manifest_digest then
      raise exception 'testing_center_evidence_idempotency_conflict' using errcode='23505';
    end if;
    return query
    select v_existing.batch_id,v_existing.expires_at,v_existing.state,
      coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'position',evidence.position,'evidenceId',evidence.evidence_id,
        'objectPath',evidence.object_path,'mediaType',evidence.media_type,
        'byteSize',evidence.byte_size,'sha256',evidence.sha256,
        'width',evidence.width,'height',evidence.height,'state',evidence.state
      ) order by evidence.position),'[]'::jsonb),true
    from public.testing_center_screenshot_evidence as evidence
    where evidence.batch_id=v_existing.batch_id;
    return;
  end if;

  v_batch_hex := pg_catalog.encode(public.digest(pg_catalog.convert_to(
    'batch'||pg_catalog.chr(31)||v_user_id::text||pg_catalog.chr(31)||
    p_idempotency_key||pg_catalog.chr(31)||v_manifest_digest,'UTF8'),'sha256'),'hex');
  v_batch_id := (pg_catalog.substr(v_batch_hex,1,8)||'-'||pg_catalog.substr(v_batch_hex,9,4)||'-'||
    pg_catalog.substr(v_batch_hex,13,4)||'-'||pg_catalog.substr(v_batch_hex,17,4)||'-'||
    pg_catalog.substr(v_batch_hex,21,12))::uuid;
  v_user_hash := pg_catalog.substr(pg_catalog.encode(public.digest(
    pg_catalog.convert_to('reporter'||pg_catalog.chr(31)||v_user_id::text,'UTF8'),'sha256'),'hex'),1,32);
  insert into public.testing_center_evidence_batches(
    contract_version,batch_id,reporter_user_id,channel,idempotency_key,
    manifest_digest,state,expires_at,created_at,updated_at
  ) values (
    p_contract_version,v_batch_id,v_user_id,p_channel,p_idempotency_key,
    v_manifest_digest,'prepared',v_created_at+interval '24 hours',v_created_at,v_created_at
  );
  for v_item in
    select item,ordinality
    from pg_catalog.jsonb_array_elements(p_manifest) with ordinality as manifest(item,ordinality)
    order by ordinality
  loop
    v_evidence_hex := pg_catalog.encode(public.digest(pg_catalog.convert_to(
      'evidence'||pg_catalog.chr(31)||v_batch_id::text||pg_catalog.chr(31)||v_item.ordinality::text,
      'UTF8'),'sha256'),'hex');
    v_evidence_id := (pg_catalog.substr(v_evidence_hex,1,8)||'-'||pg_catalog.substr(v_evidence_hex,9,4)||'-'||
      pg_catalog.substr(v_evidence_hex,13,4)||'-'||pg_catalog.substr(v_evidence_hex,17,4)||'-'||
      pg_catalog.substr(v_evidence_hex,21,12))::uuid;
    insert into public.testing_center_screenshot_evidence(
      contract_version,evidence_id,batch_id,position,object_path,media_type,
      byte_size,sha256,width,height,state,created_at,updated_at
    ) values (
      p_contract_version,v_evidence_id,v_batch_id,v_item.ordinality,
      'v1/'||v_user_hash||'/'||v_batch_id::text||'/'||v_evidence_id::text,
      v_item.item->>'mediaType',(v_item.item->>'byteSize')::integer,
      v_item.item->>'sha256',(v_item.item->>'width')::integer,
      (v_item.item->>'height')::integer,'prepared',v_created_at,v_created_at
    );
  end loop;
  return query
  select batch.batch_id,batch.expires_at,batch.state,
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'position',evidence.position,'evidenceId',evidence.evidence_id,
      'objectPath',evidence.object_path,'mediaType',evidence.media_type,
      'byteSize',evidence.byte_size,'sha256',evidence.sha256,
      'width',evidence.width,'height',evidence.height,'state',evidence.state
    ) order by evidence.position),false
  from public.testing_center_evidence_batches as batch
  join public.testing_center_screenshot_evidence as evidence using(batch_id)
  where batch.batch_id=v_batch_id
  group by batch.batch_id,batch.expires_at,batch.state;
end
$$;

create function public.testing_center_finalize_screenshot(
  p_batch_id uuid,
  p_evidence_id uuid
)
returns table(evidence_id uuid,state text,idempotent boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_evidence public.testing_center_screenshot_evidence%rowtype;
  v_batch public.testing_center_evidence_batches%rowtype;
  v_job_hex text;
  v_job_id uuid;
begin
  if v_user_id is null then
    raise exception 'testing_center_auth_required' using errcode='42501';
  end if;
  select * into v_batch
  from public.testing_center_evidence_batches as batch
  where batch.batch_id=p_batch_id
  for update;
  if not found or v_batch.reporter_user_id <> v_user_id then
    raise exception 'testing_center_evidence_owner_required' using errcode='42501';
  end if;
  select evidence.* into v_evidence
  from public.testing_center_screenshot_evidence as evidence
  where evidence.evidence_id=p_evidence_id and evidence.batch_id=p_batch_id
  for update;
  if not found then
    raise exception 'testing_center_evidence_not_found' using errcode='42501';
  end if;
  if v_evidence.state in ('uploaded','validating') and exists(
    select 1 from public.testing_center_evidence_outbox as job
    where job.evidence_id=p_evidence_id and job.kind='validate'
  ) then
    return query select v_evidence.evidence_id,v_evidence.state,true;
    return;
  end if;
  if v_evidence.state <> 'prepared'
    or v_batch.state not in ('prepared','uploading')
    or v_batch.expires_at <= pg_catalog.now() then
    raise exception 'testing_center_evidence_state_invalid' using errcode='55000';
  end if;
  if not exists(
    select 1 from storage.objects as object
    where object.bucket_id='testing-center-evidence'
      and object.name=v_evidence.object_path
      and object.owner_id::text=v_user_id::text
  ) then
    raise exception 'testing_center_evidence_object_missing' using errcode='55000';
  end if;
  v_job_hex := pg_catalog.encode(public.digest(pg_catalog.convert_to(
    'validate'||pg_catalog.chr(31)||p_evidence_id::text,'UTF8'),'sha256'),'hex');
  v_job_id := (pg_catalog.substr(v_job_hex,1,8)||'-'||pg_catalog.substr(v_job_hex,9,4)||'-'||
    pg_catalog.substr(v_job_hex,13,4)||'-'||pg_catalog.substr(v_job_hex,17,4)||'-'||
    pg_catalog.substr(v_job_hex,21,12))::uuid;
  insert into public.testing_center_evidence_outbox(job_id,evidence_id,kind)
  values(v_job_id,p_evidence_id,'validate')
  on conflict on constraint testing_center_evidence_outbox_evidence_kind_key do nothing;
  update public.testing_center_screenshot_evidence
  set state='uploaded',updated_at=pg_catalog.now()
  where testing_center_screenshot_evidence.evidence_id=p_evidence_id;

  if exists (
    select 1
    from public.testing_center_screenshot_evidence as evidence
    where evidence.batch_id=p_batch_id and evidence.state='prepared'
  ) then
    update public.testing_center_evidence_batches as batch
    set state='uploading',updated_at=pg_catalog.now()
    where batch.batch_id=p_batch_id
      and batch.state in ('prepared','uploading');
    return query select p_evidence_id,'uploaded'::text,false;
    return;
  end if;

  update public.testing_center_screenshot_evidence as evidence
  set state='validating',updated_at=pg_catalog.now()
  where evidence.batch_id=p_batch_id and evidence.state='uploaded';
  update public.testing_center_evidence_batches as batch
  set state='validating',updated_at=pg_catalog.now()
  where batch.batch_id=p_batch_id
    and batch.state in ('prepared','uploading');
  return query select p_evidence_id,'validating'::text,false;
end
$$;

create function public.testing_center_submit_report_with_evidence(
  p_contract_version text,p_channel text,p_action_text text,p_expected_text text,
  p_observed_text text,p_context_text text,p_app_version text,p_os_family text,
  p_os_version text,p_module text,p_include_diagnostic boolean,p_include_logs boolean,
  p_diagnostic_payload text,p_diagnostic_digest text,p_idempotency_key text,p_batch_id uuid
)
returns table(report_id text,report_state text,idempotent boolean,created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_batch public.testing_center_evidence_batches%rowtype;
  v_internal_key text;
  v_digests text;
  v_result record;
  v_slot_count integer;
begin
  if v_user_id is null then
    raise exception 'testing_center_auth_required' using errcode='42501';
  end if;
  select * into v_batch from public.testing_center_evidence_batches as batch
  where batch.batch_id=p_batch_id for update;
  if not found or v_batch.reporter_user_id <> v_user_id then
    raise exception 'testing_center_evidence_owner_required' using errcode='42501';
  end if;
  if v_batch.channel <> p_channel then
    raise exception 'testing_center_evidence_channel_conflict' using errcode='23505';
  end if;
  if v_batch.idempotency_key <> p_idempotency_key then
    raise exception 'testing_center_evidence_idempotency_conflict' using errcode='23505';
  end if;
  select count(*),pg_catalog.string_agg(evidence.sha256,',' order by evidence.position)
  into v_slot_count,v_digests
  from public.testing_center_screenshot_evidence as evidence
  where evidence.batch_id=p_batch_id;
  if v_slot_count not between 1 and 10 or exists(
    select 1 from public.testing_center_screenshot_evidence as evidence
    where evidence.batch_id=p_batch_id and evidence.state <> 'ready'
  ) or v_batch.state not in ('ready','attached') then
    raise exception 'testing_center_evidence_not_ready' using errcode='55000';
  end if;
  v_internal_key := 'evidence:'||pg_catalog.encode(public.digest(pg_catalog.convert_to(
    p_idempotency_key||pg_catalog.chr(31)||v_digests,'UTF8'),'sha256'),'hex');
  select * into strict v_result from public.testing_center_submit_report(
    p_contract_version,p_channel,p_action_text,p_expected_text,p_observed_text,
    p_context_text,p_app_version,p_os_family,p_os_version,p_module,
    p_include_diagnostic,p_include_logs,p_diagnostic_payload,p_diagnostic_digest,
    v_internal_key
  );
  if v_batch.state='attached' then
    if exists(
      select 1 from public.testing_center_screenshot_evidence as evidence
      where evidence.batch_id=p_batch_id and evidence.report_id is distinct from v_result.report_id
    ) then
      raise exception 'testing_center_evidence_attachment_conflict' using errcode='23505';
    end if;
    return query select v_result.report_id,v_result.report_state,true,v_result.created_at;
    return;
  end if;
  insert into public.testing_center_evidence(contract_version,evidence_id,report_id,kind,digest)
  select 'testing-center.v1',
    'screenshot_'||pg_catalog.encode(public.digest(pg_catalog.convert_to(
      v_result.report_id||pg_catalog.chr(31)||evidence.sha256,'UTF8'),'sha256'),'hex'),
    v_result.report_id,'screenshot',evidence.sha256
  from public.testing_center_screenshot_evidence as evidence
  where evidence.batch_id=p_batch_id
  group by evidence.sha256
  on conflict on constraint testing_center_evidence_report_id_kind_digest_key
  do nothing;
  update public.testing_center_screenshot_evidence
  set report_id=v_result.report_id,updated_at=pg_catalog.now()
  where batch_id=p_batch_id;
  update public.testing_center_evidence_batches
  set state='attached',updated_at=pg_catalog.now()
  where batch_id=p_batch_id;
  return query select v_result.report_id,v_result.report_state,v_result.idempotent,v_result.created_at;
end
$$;

revoke all on function public.testing_center_prepare_screenshot_batch(text,text,text,jsonb),
  public.testing_center_finalize_screenshot(uuid,uuid),
  public.testing_center_submit_report_with_evidence(
    text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid
  ) from public,anon;
grant execute on function public.testing_center_prepare_screenshot_batch(text,text,text,jsonb),
  public.testing_center_finalize_screenshot(uuid,uuid),
  public.testing_center_submit_report_with_evidence(
    text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid
  ) to authenticated;

comment on table public.testing_center_evidence_batches is
  'ISA-350 private screenshot batch manifest; no bytes, names, URLs or reporter PII responses.';
comment on table public.testing_center_screenshot_evidence is
  'ISA-350 server-owned screenshot slots and immutable declared metadata.';
comment on table public.testing_center_evidence_outbox is
  'ISA-350 durable validate/delete work for ISA-351 lease and fencing claims.';
