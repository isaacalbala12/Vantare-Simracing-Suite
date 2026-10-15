-- R10: revoking replay removes provenance; it does not write the old Owner's data.
-- Keep all UUID locks and reject a deleted reporter or any change beyond clearing.
begin;
set local lock_timeout='5s';
do $$
declare definition text; start_at integer; end_at integer;
begin
 definition:=pg_get_functiondef('private.guard_account_write()'::regprocedure);
 definition:=replace(definition,'deleted boolean:=false;',
   'deleted boolean:=false; privacy_clear boolean:=false;');
 start_at:=strpos(definition,$pattern$  if tg_op='UPDATE' and not coalesce(previous,'{}'::uuid[]) <@ coalesce(accounts,'{}'::uuid[]) then$pattern$);
 -- R9 added a narrow immutability exception to this condition.
 if start_at=0 then
   start_at:=strpos(definition,$pattern$  if tg_op='UPDATE' and not coalesce(previous,'{}'::uuid[]) <@ coalesce(accounts,'{}'::uuid[])$pattern$);
 end if;
 end_at:=strpos(definition,$pattern$    raise sqlstate '28000' using message='account_owner_is_immutable';$pattern$);
 if start_at=0 or end_at<=start_at then raise exception 'consent_guard_source_changed'; end if;
 definition:=substr(definition,1,start_at-1)||$replacement$  if tg_op='UPDATE' and tg_table_schema='public'
    and tg_table_name='testing_center_posthog_evidence' then
    privacy_clear:=to_jsonb(new)->>'linear_link_authorized_by' is null
      and to_jsonb(new)->>'linear_link_authorized'='false'
      and to_jsonb(new)->>'replay_consent'='false'
      and to_jsonb(new)->>'replay_available'='false'
      and to_jsonb(new)->>'replay_session_id' is null
      and to_jsonb(new)->>'restricted_replay_url' is null
      and to_jsonb(new)->>'replay_expires_at' is null
      and to_jsonb(new)->>'linear_link_authorized_at' is null
      and (to_jsonb(new)-array['linear_link_authorized_by','linear_link_authorized',
        'replay_consent','replay_available','replay_session_id','restricted_replay_url',
        'replay_expires_at','linear_link_authorized_at'])
        = (to_jsonb(old)-array['linear_link_authorized_by','linear_link_authorized',
        'replay_consent','replay_available','replay_session_id','restricted_replay_url',
        'replay_expires_at','linear_link_authorized_at']);
  end if;
  if tg_op='UPDATE' and not coalesce(previous,'{}'::uuid[]) <@ coalesce(accounts,'{}'::uuid[])
    and not privacy_clear then
$replacement$||substr(definition,end_at);
 if strpos(definition,'if private.lock_account_row_write(account) then deleted:=true; end if;')=0 then
   raise exception 'consent_lock_source_changed';
 end if;
 definition:=replace(definition,'if private.lock_account_row_write(account) then deleted:=true; end if;',
   'if private.lock_account_row_write(account) and (not privacy_clear or account=any(accounts)) then deleted:=true; end if;');
 execute definition;
end $$;
commit;
