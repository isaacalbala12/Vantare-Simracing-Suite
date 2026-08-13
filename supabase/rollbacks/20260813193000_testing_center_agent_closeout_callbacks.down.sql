do $$
begin
  if exists(select 1 from public.testing_center_agent_phase_callbacks) then
    raise exception 'testing_center_agent_phase_callback_history_exists'
      using errcode='55000';
  end if;
end $$;

drop function public.testing_center_get_agent_job_state(text);
drop function public.testing_center_record_agent_phase_callback(text,text,text,text,text,text,bigint,bigint,text);
drop function public.testing_center_record_fenced_agent_callback(text,text,text,text,text,text,bigint);
drop table public.testing_center_agent_phase_callbacks;

alter table public.testing_center_agent_reservations
  drop column closeout_run_id,
  drop column closeout_fencing_token,
  drop column merge_sha,
  drop column reviewed_head_sha,
  drop constraint testing_center_agent_reservations_state_check,
  add constraint testing_center_agent_reservations_state_check
    check (state in ('reserved','confirmed','needs_owner'));

alter table public.testing_center_agent_jobs
  drop column merge_sha,
  drop column candidate_head_sha;
