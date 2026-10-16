-- #1608 R4-P2-1: Storage persists JWT sub as text, not necessarily a UUID.
begin;
set local search_path='';
create index account_identities_by_subject on public.account_identities(subject);
create function private.storage_owner_accounts(p_row jsonb)
returns setof uuid language plpgsql stable security definer set search_path='' as $$
declare owner_text text:=nullif(p_row->>'owner_id',''); owners uuid[]; v_issuer text;
begin
  if owner_text is not null then
    if owner_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return next owner_text::uuid;
    else
      -- Clerk service writes may lack JWT claims. In that case only one durable
      -- UUID across issuers is acceptable; a bare, ambiguous sub is never linked.
      if auth.jwt()->>'sub'=owner_text and auth.jwt()->>'role'='authenticated' then
        v_issuer:=auth.jwt()->>'iss';
      end if;
      select array_agg(distinct i.account_id) into owners from public.account_identities i
        where i.subject=owner_text ;
      if coalesce(cardinality(owners),0)<>1 then
        raise sqlstate '23503' using message='storage_owner_unresolved';
      end if;
      if v_issuer is not null and not exists(select 1 from public.account_identities i
        where i.subject=owner_text and i.issuer=v_issuer and i.account_id=owners[1]) then
        raise sqlstate '23503' using message='storage_owner_unresolved';
      end if;
      return next owners[1];
    end if;
  end if;
  -- Deprecated owner may still be present in historical Storage rows.
  if nullif(p_row->>'owner','') is not null then return next (p_row->>'owner')::uuid; end if;
  return query select b.reporter_user_id from public.testing_center_screenshot_evidence e
    join public.testing_center_evidence_batches b using(batch_id)
    where p_row->>'bucket_id'='testing-center-evidence'
      and e.object_path=coalesce(p_row->>'name',p_row->>'key');
end $$;
revoke all on function private.storage_owner_accounts(jsonb) from public,anon,authenticated,service_role;
create or replace trigger a_account_write_barrier before insert or update or delete on storage.objects
for each row execute function private.guard_account_write(
  'select array_agg(distinct account order by account) from private.storage_owner_accounts($1) account',
  'select false');
-- Keep Storage bytes behind its API; the queue now includes textual owners.
do $$
declare definition text; old text:='where o.owner_id::text=account::text';
begin
  definition:=pg_get_functiondef('public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure);
  if position(old in definition)=0 then raise exception 'storage_cleanup_body_changed'; end if;
  definition:=replace(definition,old,$replacement$where o.owner_id::text=account::text
        or o.owner=account
        or (exists(select 1 from public.account_identities a where a.account_id=account and a.subject=o.owner_id)
          and not exists(select 1 from public.account_identities a where a.account_id<>account and a.subject=o.owner_id))$replacement$);
  execute definition;
end $$;
commit;
