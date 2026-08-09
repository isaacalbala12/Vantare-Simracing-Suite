-- CAL-02: the weekly LMU race schedule, published centrally by the owner.
--
-- LMU publishes the schedule as plain text on Discord. The owner pastes it into
-- Vantare, the desktop app parses it, and the result is stored here so every
-- client picks it up without waiting for a release.
--
-- Two-step by design: a paste lands as a draft that only its author can see,
-- and becomes visible to everyone only when explicitly published. A parser
-- that misreads a changed format is caught by the owner reviewing the draft
-- rather than by users seeing a broken calendar.
--
-- Following the convention of operational_access_assignments: row level
-- security is enabled with no policies, so the table is unreachable from the
-- anon and authenticated roles, and every access goes through a security
-- definer function that states its own authority.

create table if not exists public.race_schedule_publications (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('draft', 'published', 'superseded')),
  -- The parsed OfficialSchedule, exactly as the Go model serialises it.
  schedule jsonb not null,
  -- The pasted original. Kept so a schedule can be re-parsed after a parser
  -- fix without asking the owner to find the message on Discord again.
  source_text text not null check (length(trim(source_text)) > 0),
  valid_from timestamptz not null,
  series_count integer not null check (series_count > 0),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  superseded_at timestamptz,
  check (
    (status = 'draft' and published_at is null and published_by is null)
    or
    (status in ('published', 'superseded') and published_at is not null and published_by is not null)
  ),
  check (status <> 'superseded' or superseded_at is not null)
);

-- At most one published schedule at a time: publishing supersedes the previous.
create unique index if not exists race_schedule_one_published_idx
  on public.race_schedule_publications ((true))
  where status = 'published';

-- One draft per author, so a second paste replaces the first instead of
-- accumulating half-finished attempts.
create unique index if not exists race_schedule_one_draft_per_author_idx
  on public.race_schedule_publications (created_by)
  where status = 'draft';

create index if not exists race_schedule_valid_from_idx
  on public.race_schedule_publications (valid_from desc);

alter table public.race_schedule_publications enable row level security;

-- is_active_owner reports whether a user currently holds the owner role.
-- Expiry is honoured here rather than by a cleanup job, so a lapsed grant stops
-- working the moment it lapses.
create or replace function public.is_active_owner(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.operational_access_assignments a
    where a.user_id = p_user_id
      and a.role = 'owner'
      and a.status = 'active'
      and (a.expires_at is null or a.expires_at > now())
  )
$$;

-- race_schedule_draft_save stores a parsed schedule as the caller's draft,
-- replacing any draft they already had. Owner only.
create or replace function public.race_schedule_draft_save(
  p_source_text text,
  p_schedule jsonb,
  p_valid_from timestamptz,
  p_series_count integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if not public.is_active_owner(v_actor) then
    raise exception 'owner role required to import a race schedule';
  end if;
  if p_series_count is null or p_series_count <= 0 then
    raise exception 'a schedule must contain at least one series';
  end if;

  delete from public.race_schedule_publications
  where created_by = v_actor and status = 'draft';

  insert into public.race_schedule_publications (
    status, schedule, source_text, valid_from, series_count, created_by
  )
  values ('draft', p_schedule, p_source_text, p_valid_from, p_series_count, v_actor)
  returning id into v_id;

  return v_id;
end;
$$;

-- race_schedule_publish promotes a draft to published and supersedes whatever
-- was published before. Owner only, and only for a draft the caller owns.
create or replace function public.race_schedule_publish(p_draft_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if not public.is_active_owner(v_actor) then
    raise exception 'owner role required to publish a race schedule';
  end if;

  if not exists (
    select 1 from public.race_schedule_publications
    where id = p_draft_id and status = 'draft' and created_by = v_actor
  ) then
    raise exception 'no draft schedule with that id belongs to the caller';
  end if;

  update public.race_schedule_publications
  set status = 'superseded', superseded_at = now()
  where status = 'published';

  update public.race_schedule_publications
  set status = 'published', published_at = now(), published_by = v_actor
  where id = p_draft_id;

  return p_draft_id;
end;
$$;

-- race_schedule_current returns the published schedule. Readable by any signed
-- in user: this is the calendar everyone races against.
create or replace function public.race_schedule_current()
returns table(
  id uuid,
  schedule jsonb,
  valid_from timestamptz,
  series_count integer,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.schedule, p.valid_from, p.series_count, p.published_at
  from public.race_schedule_publications p
  where p.status = 'published'
  limit 1
$$;

-- race_schedule_my_draft returns the caller's pending draft, if any.
create or replace function public.race_schedule_my_draft()
returns table(
  id uuid,
  schedule jsonb,
  source_text text,
  valid_from timestamptz,
  series_count integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.schedule, p.source_text, p.valid_from, p.series_count, p.created_at
  from public.race_schedule_publications p
  where p.status = 'draft'
    and p.created_by = auth.uid()
    and public.is_active_owner(auth.uid())
  limit 1
$$;

revoke all on function public.race_schedule_draft_save(text, jsonb, timestamptz, integer) from public;
revoke all on function public.race_schedule_publish(uuid) from public;
grant execute on function public.race_schedule_draft_save(text, jsonb, timestamptz, integer) to authenticated;
grant execute on function public.race_schedule_publish(uuid) to authenticated;
grant execute on function public.race_schedule_current() to authenticated;
grant execute on function public.race_schedule_my_draft() to authenticated;
