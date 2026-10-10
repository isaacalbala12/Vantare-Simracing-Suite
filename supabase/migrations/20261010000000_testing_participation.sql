-- #1535. Prepared only: review before applying. UUID identity comes from the
-- existing verified account bridge, never from email, Clerk metadata or UI.
begin;
create table public.testing_questionnaires (
  id uuid primary key default gen_random_uuid(),
  version text not null check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.-]+)?$' and length(version) <= 60),
  channel text not null check (channel in ('nightly','testers')),
  title text not null check (length(trim(title)) between 1 and 120),
  question text not null check (length(trim(question)) between 1 and 500),
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.testing_answers (
  questionnaire_id uuid not null references public.testing_questionnaires(id) on delete cascade,
  account_id uuid not null references public.profiles(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  note text not null default '' check (length(note) <= 1000),
  updated_at timestamptz not null default now(),
  primary key (questionnaire_id, account_id)
);
create table public.testing_contributions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('nightly','testers')),
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null check (length(trim(body)) between 1 and 1000),
  state text not null default 'received' check (state in ('received','reviewing','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (account_id, id)
);
alter table public.testing_questionnaires enable row level security;
alter table public.testing_questionnaires force row level security;
alter table public.testing_answers enable row level security;
alter table public.testing_answers force row level security;
alter table public.testing_contributions enable row level security;
alter table public.testing_contributions force row level security;
revoke all on public.testing_questionnaires, public.testing_answers, public.testing_contributions from public, anon, authenticated;
grant select on public.testing_questionnaires, public.testing_answers, public.testing_contributions to authenticated;
grant all on public.testing_questionnaires, public.testing_answers, public.testing_contributions to service_role;
create policy testing_questionnaires_read on public.testing_questionnaires for select to authenticated
  using (published and public.testing_center_can_view_channel(channel));
create policy testing_answers_read on public.testing_answers for select to authenticated
  using (account_id = auth.uid() and exists (select 1 from public.testing_questionnaires q where q.id = questionnaire_id));
create policy testing_contributions_read on public.testing_contributions for select to authenticated
  using (account_id = auth.uid() and public.testing_center_can_view_channel(channel));

create function public.testing_participation_current(p_channel text) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not public.testing_center_can_view_channel(p_channel) then
    raise exception 'testing_membership_required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'questionnaires', coalesce((select jsonb_agg(to_jsonb(t)) from (
      select q.id, q.version, q.title, q.question, a.score, coalesce(a.note, '') as note
      from public.testing_questionnaires q left join public.testing_answers a
        on a.questionnaire_id = q.id and a.account_id = auth.uid()
      where q.channel = p_channel order by q.created_at desc, q.id limit 10
    ) t), '[]'::jsonb),
    'contributions', coalesce((select jsonb_agg(to_jsonb(t)) from (
      select id, title, body, state from public.testing_contributions
      where channel = p_channel order by created_at desc, id limit 20
    ) t), '[]'::jsonb)
  );
end $$;

create function public.testing_answer_save(p_id uuid, p_score smallint, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_channel text;
begin
  -- Lock catalog row so unpublishing cannot race with accepting an answer.
  select channel into v_channel from public.testing_questionnaires where id = p_id and published for share;
  if auth.uid() is null or v_channel is null or not public.testing_center_can_view_channel(v_channel) then
    raise exception 'testing_membership_required' using errcode = '42501';
  end if;
  insert into public.testing_answers(questionnaire_id,account_id,score,note)
    values(p_id,auth.uid(),p_score,p_note)
    on conflict(questionnaire_id,account_id) do update set score = excluded.score, note = excluded.note, updated_at = now();
end $$;

create function public.testing_contribution_submit(p_id uuid, p_channel text, p_title text, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.testing_center_can_view_channel(p_channel) then
    raise exception 'testing_membership_required' using errcode = '42501';
  end if;
  insert into public.testing_contributions(id,account_id,channel,title,body)
    values(p_id,auth.uid(),p_channel,p_title,p_body) on conflict(id) do nothing;
  -- A retry with the same UUID must represent the same payload and account.
  if not exists(select 1 from public.testing_contributions where id = p_id and account_id = auth.uid()
    and channel = p_channel and title = p_title and body = p_body) then
    raise exception 'testing_contribution_conflict' using errcode = '23505';
  end if;
end $$;
revoke all on function public.testing_participation_current(text), public.testing_answer_save(uuid,smallint,text),
  public.testing_contribution_submit(uuid,text,text,text) from public, anon;
grant execute on function public.testing_participation_current(text), public.testing_answer_save(uuid,smallint,text),
  public.testing_contribution_submit(uuid,text,text,text) to authenticated;
commit;
