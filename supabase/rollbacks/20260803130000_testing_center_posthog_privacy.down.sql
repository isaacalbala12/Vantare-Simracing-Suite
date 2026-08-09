-- ISA-253 / TAU-07H1 guarded rollback. Consent and evidence history cannot be
-- removed silently.

begin;

lock table public.testing_center_pauses in share row exclusive mode;

do $$ begin
  if not exists(select 1 from public.testing_center_pauses
    where scope='global' and is_paused) then
    raise exception 'testing_center_posthog_rollback_requires_global_pause'
      using errcode='55000';
  end if;
  if exists(select 1 from public.testing_center_posthog_consent_events)
    or exists(select 1 from public.testing_center_posthog_evidence) then
    raise exception 'testing_center_posthog_rollback_has_history'
      using errcode='55000';
  end if;
end $$;

drop function public.testing_center_expire_posthog_evidence(timestamptz);
drop function public.testing_center_authorize_posthog_linear_link(text,uuid);
drop function public.testing_center_record_posthog_evidence(jsonb,text,text,text,text);
drop function public.testing_center_set_posthog_consent(text,boolean,boolean,text);
drop table public.testing_center_posthog_evidence;
drop table public.testing_center_posthog_consent_events;

commit;
