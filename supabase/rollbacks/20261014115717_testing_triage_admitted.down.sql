-- Remove the adapter without deleting any evidence, follow-up or IP budgets.
-- Stop the candidate Edge/native clients first. Direct RPCs stay closed.
begin;
set local lock_timeout='5s';
drop function public.testing_contribution_submit_admitted(uuid,uuid,text,text,text,jsonb,jsonb);
commit;
