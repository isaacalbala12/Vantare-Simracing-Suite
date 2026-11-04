begin;
create table private.admin_payment_sync_budget (
 environment text primary key check(environment='sandbox'),
 window_start timestamptz not null
);
alter table private.admin_payment_sync_budget enable row level security;
alter table private.admin_payment_sync_budget force row level security;
revoke all on table private.admin_payment_sync_budget from public,anon,authenticated,service_role;

create or replace function public.native_admin_payment_sync_budget(p_actor uuid,p_environment text)
returns boolean language plpgsql security definer set search_path='' as $$
declare claimed text; stamp timestamptz;
begin
 if p_actor is null or private.lock_account_write(p_actor) then raise exception 'native_admin_forbidden' using errcode='42501'; end if;
 perform private.native_admin_require_owner(p_actor);
 if p_environment is distinct from 'sandbox' then raise exception 'native_admin_forbidden' using errcode='42501'; end if;
 stamp:=clock_timestamp();
 -- One expensive import per rolling minute, shared by owner sessions.
 insert into private.admin_payment_sync_budget as budget(environment,window_start) values(p_environment,stamp)
 on conflict(environment) do update set window_start=excluded.window_start
 where budget.window_start<=excluded.window_start-interval '1 minute'
 returning environment into claimed;
 return claimed is not null;
end $$;
revoke all on function public.native_admin_payment_sync_budget(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.native_admin_payment_sync_budget(uuid,text) to service_role;
commit;
