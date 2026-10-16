-- #1636 R3-4: late PUT must drain before provider DELETE.
begin;
create or replace function private.mail_queue_contact_erasure() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(1636,300);
 -- A PUT can start at the very end of the lease. Allow its 4s timeout plus 6s margin.
 -- New sync leases cannot start after the contact is deleted locally.
 insert into private.mail_contact_erasures(email,account_id,next_attempt_at)
 values(old.email,coalesce(old.erasure_account,old.account_id),greatest(clock_timestamp(),old.sync_lease_until+interval '10 seconds'))
 on conflict(email) where email is not null do nothing;
 insert into private.mail_audit(action,target,detail) values('erasure_queued','contact','{}');
 return old;
end $$;
commit;
