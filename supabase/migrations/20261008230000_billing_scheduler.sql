-- ISA-1514: authorized Supabase scheduler. Inert until explicitly configured.
begin;
create schema if not exists extensions;
create schema if not exists vault;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table private.billing_scheduler (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  last_request_id bigint,
  last_dispatch_at timestamptz
);
insert into private.billing_scheduler(singleton) values(true);
revoke all on private.billing_scheduler from public,anon,authenticated,service_role;

create function private.dispatch_billing_reconciliation()
returns bigint language plpgsql security definer set search_path='' as $$
declare project_url text; server_key text; request_id bigint;
begin
  if not exists(select 1 from private.billing_scheduler where enabled) then return null; end if;
  select decrypted_secret into project_url from vault.decrypted_secrets where name='billing_project_url';
  select decrypted_secret into server_key from vault.decrypted_secrets where name='billing_reconcile_secret';
  if project_url is null or project_url !~ '^https://[a-z0-9]{20}\.supabase\.co$'
    or coalesce(length(server_key),0)<32 then
    -- Never include secret values in an error, cron command or log.
    raise exception 'billing_scheduler_not_configured';
  end if;
  select net.http_post(
    url:=project_url || '/functions/v1/billing-reconcile',
    headers:=jsonb_build_object('Content-Type','application/json','apikey',server_key),
    body:='{}'::jsonb, timeout_milliseconds:=55000
  ) into request_id;
  update private.billing_scheduler set last_request_id=request_id,last_dispatch_at=now();
  return request_id;
end $$;
revoke all on function private.dispatch_billing_reconciliation() from public,anon,authenticated,service_role;
select cron.schedule('vantare-billing-reconcile','* * * * *','select private.dispatch_billing_reconciliation();');
commit;
