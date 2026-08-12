do $$
begin
  if exists(select 1 from public.testing_center_agent_callbacks) then
    raise exception 'testing_center_agent_jobs_v2_history_exists' using errcode='55000',detail='testing_center_agent_callbacks';
  elsif exists(select 1 from public.testing_center_agent_reservations) then
    raise exception 'testing_center_agent_jobs_v2_history_exists' using errcode='55000',detail='testing_center_agent_reservations';
  elsif exists(select 1 from public.testing_center_agent_audit) then
    raise exception 'testing_center_agent_jobs_v2_history_exists' using errcode='55000',detail='testing_center_agent_audit';
  elsif exists(select 1 from public.testing_center_agent_effect_outbox) then
    raise exception 'testing_center_agent_jobs_v2_history_exists' using errcode='55000',detail='testing_center_agent_effect_outbox';
  elsif exists(select 1 from public.testing_center_agent_jobs) then
    raise exception 'testing_center_agent_jobs_v2_history_exists' using errcode='55000',detail='testing_center_agent_jobs';
  end if;
end $$;

drop function if exists public.testing_center_reserve_agent_resource(text,text,text,text);
drop function if exists public.testing_center_record_agent_callback(text,text,text,text,text,text);
drop function if exists public.testing_center_expire_reserved_agent_effect(text,timestamptz);
drop function if exists public.testing_center_complete_agent_effect(text,text,bigint,text,text);
drop function if exists public.testing_center_reserve_agent_effect(text,text,bigint);
drop function if exists public.testing_center_claim_agent_effect(text,integer);
drop function if exists public.testing_center_queue_agent_job(text,text,integer,text,text,text,text);
drop function if exists public.testing_center_queue_agent_effect(text,text,text,text);
drop function if exists public.testing_center_transition_agent_job(text,text,text,text,text);
drop function if exists public.testing_center_agent_transition_allowed(text,text);

drop table public.testing_center_agent_callbacks;
drop table public.testing_center_agent_reservations;
drop table public.testing_center_agent_audit;
drop table public.testing_center_agent_effect_outbox;
drop table public.testing_center_agent_jobs;
drop function if exists public.testing_center_agent_job_key(text,text,text,text);
