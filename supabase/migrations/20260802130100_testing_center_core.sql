-- ISA-209 / TAU-02B: structural, server-only persistence for testing-center.v1.
-- Workflow transitions remain owned by the Go/orchestrator contract. This
-- migration only rejects structurally invalid snapshots and references.

create table public.testing_center_reports (
  contract_version text not null default 'testing-center.v1'
    constraint testing_center_reports_version_check check (contract_version = 'testing-center.v1'),
  report_id text primary key
    constraint testing_center_reports_id_check check (report_id <> '' and report_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(report_id) <= 256),
  reporter_id text not null
    constraint testing_center_reports_reporter_check check (reporter_id <> '' and reporter_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(reporter_id) <= 256),
  reporter_user_id uuid not null references auth.users(id) on delete restrict,
  reporter_role text not null
    constraint testing_center_reports_role_check check (reporter_role in ('tester', 'primary_tester', 'owner')),
  channel text not null
    constraint testing_center_reports_channel_check check (channel in ('nightly', 'testers')),
  state text not null
    constraint testing_center_reports_state_check check (state in ('draft', 'submitted', 'validated', 'duplicate_linked', 'incomplete', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.testing_center_evidence (
  contract_version text not null default 'testing-center.v1'
    constraint testing_center_evidence_version_check check (contract_version = 'testing-center.v1'),
  evidence_id text primary key
    constraint testing_center_evidence_id_check check (evidence_id <> '' and evidence_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(evidence_id) <= 256),
  report_id text not null references public.testing_center_reports(report_id) on delete restrict,
  kind text not null
    constraint testing_center_evidence_kind_check check (kind in ('report_context', 'diagnostic', 'reproduction')),
  digest text not null
    constraint testing_center_evidence_digest_check check (digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (report_id, kind, digest)
);

create table public.testing_center_technical_issues (
  contract_version text not null default 'testing-center.v1'
    constraint testing_center_issues_version_check check (contract_version = 'testing-center.v1'),
  technical_issue_id text primary key
    constraint testing_center_issues_id_check check (technical_issue_id <> '' and technical_issue_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(technical_issue_id) <= 256),
  report_id text not null unique references public.testing_center_reports(report_id) on delete restrict,
  state text not null
    constraint testing_center_issues_state_check check (state in ('open', 'needs_owner', 'closed')),
  flow_state text not null
    constraint testing_center_issues_flow_state_check check (flow_state in (
      'reported', 'needs_info', 'queued', 'codex_working', 'owner_review',
      'nightly_candidate', 'nightly_accepted', 'nightly_rejected',
      'testers_candidate', 'testers_accepted', 'testers_rejected',
      'master_review', 'released', 'needs_owner', 'stopped'
    )),
  origin text not null
    constraint testing_center_issues_origin_check check (origin in ('testing_center', 'orchestrator', 'codex', 'github_actions')),
  retry_count smallint not null default 0
    constraint testing_center_issues_retry_check check (retry_count between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.testing_center_codex_runs (
  contract_version text not null default 'testing-center.v1'
    constraint testing_center_codex_runs_version_check check (contract_version = 'testing-center.v1'),
  run_id text primary key
    constraint testing_center_codex_runs_id_check check (run_id <> '' and run_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(run_id) <= 256),
  technical_issue_id text not null references public.testing_center_technical_issues(technical_issue_id) on delete restrict,
  attempt smallint not null constraint testing_center_codex_runs_attempt_check check (attempt between 1 and 2),
  state text not null constraint testing_center_codex_runs_state_check check (state in ('queued', 'running', 'pr_open', 'failed')),
  origin text not null constraint testing_center_codex_runs_origin_check check (origin in ('orchestrator', 'codex', 'github_actions')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (technical_issue_id, attempt)
);

create table public.testing_center_candidate_builds (
  contract_version text not null default 'testing-center.v1'
    constraint testing_center_candidates_version_check check (contract_version = 'testing-center.v1'),
  candidate_id text primary key
    constraint testing_center_candidates_id_check check (candidate_id <> '' and candidate_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(candidate_id) <= 256),
  technical_issue_id text not null references public.testing_center_technical_issues(technical_issue_id) on delete restrict,
  channel text not null constraint testing_center_candidates_channel_check check (channel in ('nightly', 'testers')),
  build_version text not null
    constraint testing_center_candidates_build_check check (build_version <> '' and build_version !~ '^[[:space:]]|[[:space:]]$' and octet_length(build_version) <= 256),
  exact_sha text not null constraint testing_center_candidates_sha_check check (exact_sha ~ '^(?:[0-9a-f]{40}|[0-9a-f]{64})$'),
  author_id text not null
    constraint testing_center_candidates_author_check check (author_id <> '' and author_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(author_id) <= 256),
  author_origin text not null default 'codex'
    constraint testing_center_candidates_origin_check check (author_origin = 'codex'),
  state text not null constraint testing_center_candidates_state_check check (state in ('pending', 'accepted', 'rejected', 'stale')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, channel, exact_sha),
  unique (candidate_id, channel, exact_sha, author_id),
  unique (technical_issue_id, channel, exact_sha)
);

create table public.testing_center_validations (
  contract_version text not null default 'testing-center.v1'
    constraint testing_center_validations_version_check check (contract_version = 'testing-center.v1'),
  validation_id text primary key
    constraint testing_center_validations_id_check check (validation_id <> '' and validation_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(validation_id) <= 256),
  candidate_id text not null,
  channel text not null constraint testing_center_validations_channel_check check (channel in ('nightly', 'testers')),
  exact_sha text not null constraint testing_center_validations_sha_check check (exact_sha ~ '^(?:[0-9a-f]{40}|[0-9a-f]{64})$'),
  candidate_author_id text not null
    constraint testing_center_validations_author_check check (candidate_author_id <> '' and candidate_author_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(candidate_author_id) <= 256),
  decision text not null constraint testing_center_validations_decision_check check (decision in ('accepted', 'rejected')),
  actor_id text not null
    constraint testing_center_validations_actor_check check (actor_id <> '' and actor_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(actor_id) <= 256),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null constraint testing_center_validations_role_check check (actor_role in ('tester', 'primary_tester', 'owner')),
  actor_origin text not null default 'testing_center'
    constraint testing_center_validations_origin_check check (actor_origin = 'testing_center'),
  rejection_reason text,
  created_at timestamptz not null default now(),
  constraint testing_center_validations_candidate_fk
    foreign key (candidate_id, channel, exact_sha, candidate_author_id)
    references public.testing_center_candidate_builds(candidate_id, channel, exact_sha, author_id) on delete restrict,
  constraint testing_center_validations_self_check check (actor_id <> candidate_author_id),
  constraint testing_center_validations_channel_role_check check (
    (channel = 'nightly' and actor_role in ('primary_tester', 'owner'))
    or (channel = 'testers' and actor_role in ('tester', 'primary_tester', 'owner'))
  ),
  constraint testing_center_validations_reason_check check (
    (decision = 'accepted' and rejection_reason is null)
    or (
      decision = 'rejected'
      and rejection_reason is not null
      and rejection_reason in ('still_fails', 'regression', 'incomplete_fix', 'new_failure', 'other')
    )
  ),
  unique (candidate_id, channel, exact_sha, actor_id),
  unique (validation_id, candidate_id, channel, exact_sha, decision)
);

create table public.testing_center_promotions (
  contract_version text not null default 'testing-center.v1'
    constraint testing_center_promotions_version_check check (contract_version = 'testing-center.v1'),
  promotion_id text primary key
    constraint testing_center_promotions_id_check check (promotion_id <> '' and promotion_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(promotion_id) <= 256),
  candidate_id text not null,
  validation_id text not null,
  validation_decision text not null default 'accepted'
    constraint testing_center_promotions_validation_check check (validation_decision = 'accepted'),
  from_channel text not null constraint testing_center_promotions_from_check check (from_channel in ('nightly', 'testers')),
  to_channel text not null constraint testing_center_promotions_to_check check (to_channel in ('testers', 'master')),
  exact_sha text not null constraint testing_center_promotions_sha_check check (exact_sha ~ '^(?:[0-9a-f]{40}|[0-9a-f]{64})$'),
  validated_sha text not null constraint testing_center_promotions_validated_sha_check check (validated_sha ~ '^(?:[0-9a-f]{40}|[0-9a-f]{64})$'),
  state text not null constraint testing_center_promotions_state_check check (state in ('pending', 'authorized', 'completed', 'blocked')),
  authorized_by_id text,
  authorized_by_user_id uuid references auth.users(id) on delete restrict,
  authorized_by_role text constraint testing_center_promotions_role_value_check check (authorized_by_role is null or authorized_by_role in ('primary_tester', 'owner')),
  authorized_origin text constraint testing_center_promotions_origin_check check (authorized_origin is null or authorized_origin = 'testing_center'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint testing_center_promotions_candidate_fk
    foreign key (candidate_id, from_channel, exact_sha)
    references public.testing_center_candidate_builds(candidate_id, channel, exact_sha) on delete restrict,
  constraint testing_center_promotions_validation_fk
    foreign key (validation_id, candidate_id, from_channel, validated_sha, validation_decision)
    references public.testing_center_validations(validation_id, candidate_id, channel, exact_sha, decision) on delete restrict,
  constraint testing_center_promotions_route_check check (
    (from_channel = 'nightly' and to_channel = 'testers')
    or (from_channel = 'testers' and to_channel = 'master')
  ),
  constraint testing_center_promotions_sha_match_check check (exact_sha = validated_sha),
  constraint testing_center_promotions_authorization_check check (
    (state in ('pending', 'blocked') and authorized_by_id is null and authorized_by_user_id is null and authorized_by_role is null and authorized_origin is null)
    or (
      state in ('authorized', 'completed')
      and authorized_by_id is not null
      and authorized_by_id <> '' and authorized_by_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(authorized_by_id) <= 256
      and authorized_by_user_id is not null and authorized_origin = 'testing_center'
      and (
        (from_channel = 'nightly' and to_channel = 'testers' and authorized_by_role in ('primary_tester', 'owner'))
        or (from_channel = 'testers' and to_channel = 'master' and authorized_by_role = 'owner')
      )
    )
  ),
  unique (candidate_id, from_channel, to_channel, exact_sha)
);

create table public.testing_center_audit (
  contract_version text not null default 'testing-center.v1'
    constraint testing_center_audit_version_check check (contract_version = 'testing-center.v1'),
  audit_id text primary key
    constraint testing_center_audit_id_check check (audit_id <> '' and audit_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(audit_id) <= 256),
  aggregate_id text not null
    constraint testing_center_audit_aggregate_check check (aggregate_id <> '' and aggregate_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(aggregate_id) <= 256),
  from_state text not null,
  to_state text not null,
  origin text not null constraint testing_center_audit_origin_check check (origin in ('testing_center', 'orchestrator', 'codex', 'github_actions')),
  actor_id text not null
    constraint testing_center_audit_actor_check check (actor_id <> '' and actor_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(actor_id) <= 256),
  actor_user_id uuid references auth.users(id) on delete restrict,
  actor_role text constraint testing_center_audit_role_check check (actor_role is null or actor_role in ('tester', 'primary_tester', 'owner')),
  exact_sha text constraint testing_center_audit_sha_check check (exact_sha is null or exact_sha ~ '^(?:[0-9a-f]{40}|[0-9a-f]{64})$'),
  operation_digest text not null constraint testing_center_audit_digest_check check (operation_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint testing_center_audit_states_check check (
    from_state in ('reported', 'needs_info', 'queued', 'codex_working', 'owner_review', 'nightly_candidate', 'nightly_accepted', 'nightly_rejected', 'testers_candidate', 'testers_accepted', 'testers_rejected', 'master_review', 'released', 'needs_owner', 'stopped')
    and to_state in ('reported', 'needs_info', 'queued', 'codex_working', 'owner_review', 'nightly_candidate', 'nightly_accepted', 'nightly_rejected', 'testers_candidate', 'testers_accepted', 'testers_rejected', 'master_review', 'released', 'needs_owner', 'stopped')
    and from_state <> to_state
  ),
  constraint testing_center_audit_actor_origin_check check (
    (origin = 'testing_center' and actor_user_id is not null and actor_role is not null)
    or (origin in ('orchestrator', 'codex', 'github_actions') and actor_user_id is null and actor_role is null)
  )
);

create table public.testing_center_idempotency (
  contract_version text not null default 'testing-center.v1'
    constraint testing_center_idempotency_version_check check (contract_version = 'testing-center.v1'),
  idempotency_key text not null
    constraint testing_center_idempotency_key_check check (idempotency_key <> '' and idempotency_key !~ '^[[:space:]]|[[:space:]]$' and octet_length(idempotency_key) <= 256),
  payload_digest text not null constraint testing_center_idempotency_digest_check check (payload_digest ~ '^[0-9a-f]{64}$'),
  aggregate_id text not null
    constraint testing_center_idempotency_aggregate_check check (aggregate_id <> '' and aggregate_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(aggregate_id) <= 256),
  from_state text not null,
  to_state text not null,
  exact_sha text constraint testing_center_idempotency_sha_check check (exact_sha is null or exact_sha ~ '^(?:[0-9a-f]{40}|[0-9a-f]{64})$'),
  origin text not null constraint testing_center_idempotency_origin_check check (origin in ('testing_center', 'orchestrator', 'codex', 'github_actions')),
  created_at timestamptz not null default now(),
  constraint testing_center_idempotency_pk primary key (aggregate_id, idempotency_key),
  constraint testing_center_idempotency_states_check check (
    from_state in ('reported', 'needs_info', 'queued', 'codex_working', 'owner_review', 'nightly_candidate', 'nightly_accepted', 'nightly_rejected', 'testers_candidate', 'testers_accepted', 'testers_rejected', 'master_review', 'released', 'needs_owner', 'stopped')
    and to_state in ('reported', 'needs_info', 'queued', 'codex_working', 'owner_review', 'nightly_candidate', 'nightly_accepted', 'nightly_rejected', 'testers_candidate', 'testers_accepted', 'testers_rejected', 'master_review', 'released', 'needs_owner', 'stopped')
    and from_state <> to_state
  ),
  constraint testing_center_idempotency_sha_requirement_check check (
    to_state in ('stopped', 'needs_owner')
    or (
      from_state not in (
        'owner_review', 'nightly_candidate', 'nightly_accepted', 'nightly_rejected',
        'testers_candidate', 'testers_accepted', 'testers_rejected', 'master_review'
      )
      and to_state <> 'nightly_candidate'
    )
    or exact_sha is not null
  )
);

create table public.testing_center_pauses (
  contract_version text not null default 'testing-center.v1'
    constraint testing_center_pauses_version_check check (contract_version = 'testing-center.v1'),
  pause_id text primary key
    constraint testing_center_pauses_id_check check (pause_id <> '' and pause_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(pause_id) <= 256),
  scope text not null constraint testing_center_pauses_scope_check check (scope in ('global', 'flow')),
  technical_issue_id text references public.testing_center_technical_issues(technical_issue_id) on delete restrict,
  is_paused boolean not null default true,
  reason_code text not null
    constraint testing_center_pauses_reason_check check (reason_code <> '' and reason_code !~ '^[[:space:]]|[[:space:]]$' and octet_length(reason_code) <= 256),
  requested_by_id text not null
    constraint testing_center_pauses_actor_check check (requested_by_id <> '' and requested_by_id !~ '^[[:space:]]|[[:space:]]$' and octet_length(requested_by_id) <= 256),
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  requested_by_role text not null default 'owner'
    constraint testing_center_pauses_role_check check (requested_by_role = 'owner'),
  origin text not null default 'testing_center'
    constraint testing_center_pauses_origin_check check (origin = 'testing_center'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint testing_center_pauses_target_check check (
    (scope = 'global' and technical_issue_id is null)
    or (scope = 'flow' and technical_issue_id is not null)
  ),
  unique nulls not distinct (scope, technical_issue_id)
);

create index testing_center_reports_reporter_idx on public.testing_center_reports(reporter_user_id, created_at desc);
create index testing_center_evidence_report_idx on public.testing_center_evidence(report_id, created_at);
create index testing_center_issues_flow_idx on public.testing_center_technical_issues(flow_state, updated_at);
create index testing_center_codex_runs_issue_idx on public.testing_center_codex_runs(technical_issue_id, state);
create index testing_center_candidates_issue_idx on public.testing_center_candidate_builds(technical_issue_id, channel, state);
create index testing_center_validations_candidate_idx on public.testing_center_validations(candidate_id, channel, exact_sha);
create index testing_center_validations_actor_idx on public.testing_center_validations(actor_user_id, created_at desc);
create index testing_center_promotions_candidate_idx on public.testing_center_promotions(candidate_id, state);
create index testing_center_audit_aggregate_idx on public.testing_center_audit(aggregate_id, created_at);
create index testing_center_idempotency_aggregate_idx on public.testing_center_idempotency(aggregate_id, created_at);

alter table public.testing_center_reports enable row level security;
alter table public.testing_center_reports force row level security;
alter table public.testing_center_evidence enable row level security;
alter table public.testing_center_evidence force row level security;
alter table public.testing_center_technical_issues enable row level security;
alter table public.testing_center_technical_issues force row level security;
alter table public.testing_center_codex_runs enable row level security;
alter table public.testing_center_codex_runs force row level security;
alter table public.testing_center_candidate_builds enable row level security;
alter table public.testing_center_candidate_builds force row level security;
alter table public.testing_center_validations enable row level security;
alter table public.testing_center_validations force row level security;
alter table public.testing_center_promotions enable row level security;
alter table public.testing_center_promotions force row level security;
alter table public.testing_center_audit enable row level security;
alter table public.testing_center_audit force row level security;
alter table public.testing_center_idempotency enable row level security;
alter table public.testing_center_idempotency force row level security;
alter table public.testing_center_pauses enable row level security;
alter table public.testing_center_pauses force row level security;

revoke all on table public.testing_center_reports, public.testing_center_evidence,
  public.testing_center_technical_issues, public.testing_center_codex_runs,
  public.testing_center_candidate_builds, public.testing_center_validations,
  public.testing_center_promotions, public.testing_center_audit,
  public.testing_center_idempotency, public.testing_center_pauses
from public, anon, authenticated;

grant select, insert, update, delete on table public.testing_center_reports,
  public.testing_center_evidence, public.testing_center_technical_issues,
  public.testing_center_codex_runs, public.testing_center_candidate_builds,
  public.testing_center_validations, public.testing_center_promotions,
  public.testing_center_audit, public.testing_center_idempotency,
  public.testing_center_pauses
to service_role;

comment on table public.testing_center_reports is 'TAU-02B server-only report snapshots for testing-center.v1.';
comment on table public.testing_center_audit is 'TAU-02B append-oriented audit snapshots; transition authorization remains outside SQL.';
