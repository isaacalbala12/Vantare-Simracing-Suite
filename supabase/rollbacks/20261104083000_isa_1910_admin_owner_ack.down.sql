-- VANTA-132: explicit ACK when tester toggle preserves a live owner.
begin;
set local lock_timeout='5s';
do $ack$
declare definition text; before_text text; after_text text;
begin
 definition:=replace(pg_get_functiondef('private.native_admin_execute_v1(uuid,text,text,jsonb,text)'::regprocedure),E'\r\n',E'\n');
 if position('if not private.is_owner(v_account) then' in definition)=0 then
  raise exception 'native_admin_ack_requires_owner_policy' using errcode='55000';
 end if;
 before_text:=$before$v_result := case when private.is_owner(v_account) then
      jsonb_build_object('account_id',v_account,'owner',true,'unchanged',true)
      else jsonb_build_object('account_id',v_account,'enabled',v_enabled) end;$before$;
 after_text:=$after$v_result := jsonb_build_object('account_id', v_account, 'enabled', v_enabled);$after$;
 before_text:=replace(before_text,E'\r\n',E'\n');
 after_text:=replace(after_text,E'\r\n',E'\n');
 if length(definition)-length(replace(definition,before_text,''))<>length(before_text) then
  raise exception 'native_admin_owner_ack_source_drift' using errcode='55000';
 end if;
 execute replace(definition,before_text,after_text);
end $ack$;
commit;
