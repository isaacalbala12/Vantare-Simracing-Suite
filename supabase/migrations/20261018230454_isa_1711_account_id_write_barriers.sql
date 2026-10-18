-- #1711 / VANTA-96 / review #1705 P2-1. These retained commercial ledgers
-- use an account UUID without a FK. Resolve ownership directly from the row,
-- including OLD and NEW, so an erased profile cannot be hidden by a failed join.
begin;
set local lock_timeout='5s';
set local search_path='';
do $guards$
declare relation regclass;
begin
 foreach relation in array array[
  'private.creator_checkout_attributions'::regclass,
  'private.creator_renewal_operations','private.creator_subscription_revocations',
  'private.report_creator_terms','private.report_renewal_candidates',
  'private.billing_payment_incidents']::regclass[]
 loop
  execute format('create trigger a_account_write_barrier before insert or update or delete on %s
   for each row execute function private.guard_account_write(%L,%L)',relation,
   'select array[($1->>''account_id'')::uuid]','select false');
 end loop;
end $guards$;
-- No FK, ACL, shared-function patch, history deletion or post-erasure bypass.
commit;
