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
  'private.billing_payment_incidents','private.lifetime_order_admissions']::regclass[]
 loop
  execute format('create trigger a_account_write_barrier before insert or update or delete on %s
   for each row execute function private.guard_account_write(%L,%L)',relation,
   'select array[($1->>''account_id'')::uuid]','select false');
 end loop;
end $guards$;
-- The expanded inventory also finds the web cleanup stream: its event is
-- inserted by the canonical identity tombstone trigger AFTER deleted_at.
-- It is a post-erasure duty, not a live-account writer. Keep its closed ACL,
-- serialized event IDs, bounded pull and independently proven ACK unchanged.
comment on table private.web_purchase_erasure_events is
 'Post-erasure web cleanup duty, enqueued after the identity tombstone. No direct API grants; bounded pull and proven idempotent ACK remain available after account deletion.';
-- A cancellation sent while live can finish after erasure. The closed backend
-- completion RPC changes only pending -> completed and updated_at, fenced by
-- the remote revision. New transitions already require a live account/UUID lock.
comment on table private.founders_subscription_transitions is
 'Retained cancellation duty. New transitions require a live account; closed revision-fenced completion may acknowledge an in-flight cancellation after erasure without restoring account data or rights.';
-- No FK, ACL, shared-function patch, history deletion or caller bypass.
commit;
