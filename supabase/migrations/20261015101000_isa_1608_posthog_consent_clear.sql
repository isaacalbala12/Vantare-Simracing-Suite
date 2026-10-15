-- R9 full-suite regression: revocation clears optional authorizer provenance.
-- The report FK remains immutable; both old and new UUIDs still get locked and
-- checked for tombstones. No exemption from the deleted-account write barrier.
begin;
set local lock_timeout='5s';
do $$
declare definition text; pattern text := $pattern$if tg_op='UPDATE' and not coalesce(previous,'{}'::uuid[]) <@ coalesce(accounts,'{}'::uuid[]) then$pattern$;
begin
 definition:=pg_get_functiondef('private.guard_account_write()'::regprocedure);
 if position(pattern in definition)=0 then raise exception 'consent_guard_source_changed'; end if;
 definition:=replace(definition,pattern,$replacement$if tg_op='UPDATE' and not coalesce(previous,'{}'::uuid[]) <@ coalesce(accounts,'{}'::uuid[])
    and not (tg_table_schema='public' and tg_table_name='testing_center_posthog_evidence'
      and to_jsonb(new)->>'report_id' is not distinct from to_jsonb(old)->>'report_id'
      and to_jsonb(old)->>'linear_link_authorized_by' is not null
      and to_jsonb(new)->>'linear_link_authorized_by' is null
      and to_jsonb(new)->>'linear_link_authorized'='false'
      and to_jsonb(new)->>'replay_consent'='false'
      and to_jsonb(new)->>'replay_available'='false'
      and to_jsonb(new)->>'replay_session_id' is null
      and to_jsonb(new)->>'restricted_replay_url' is null
      and to_jsonb(new)->>'replay_expires_at' is null
      and to_jsonb(new)->>'linear_link_authorized_at' is null) then$replacement$);
 execute definition;
end $$;
commit;
