-- VANTA-132 step 3: global fixed-minute budget before any Clerk verification.
begin;
create table private.native_admin_gate_rate (
 singleton boolean primary key default true check (singleton),
 window_start timestamptz not null,
 requests integer not null check (requests between 1 and 121)
);
alter table private.native_admin_gate_rate enable row level security;
revoke all on private.native_admin_gate_rate from public,anon,authenticated,service_role;

create function public.native_admin_gate() returns boolean
language plpgsql security definer set search_path='' as $$
declare used integer;
begin
 insert into private.native_admin_gate_rate as budget(singleton,window_start,requests)
 values(true,date_trunc('minute',statement_timestamp()),1)
 on conflict(singleton) do update set
  window_start=greatest(budget.window_start,excluded.window_start),
  requests=case when budget.window_start>=excluded.window_start
   then least(budget.requests+1,121) else 1 end
 returning requests into used;
 return used<=120;
end $$;
revoke all on function public.native_admin_gate() from public,anon,authenticated;
grant execute on function public.native_admin_gate() to service_role;

-- Lookup only: never bootstrap profiles/identities for a JWT caller.
create function public.native_admin_preflight(p_issuer text, p_subject text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 select i.account_id into actor from public.account_identities i
 join private.clerk_issuers c on c.issuer=i.issuer and c.enabled
 where i.issuer=p_issuer and i.subject=p_subject and i.deleted_at is null;
 if actor is null then
  raise exception 'native_admin_forbidden' using errcode='42501';
 end if;
 perform private.native_admin_require_owner(actor);
 return actor;
end $$;
revoke all on function public.native_admin_preflight(text,text) from public,anon,authenticated;
grant execute on function public.native_admin_preflight(text,text) to service_role;
commit;
