-- VANTA-131 step 9: the published calendar and native parser share a corpus.
begin;

create or replace function public.race_schedule_valid(p_schedule jsonb)
returns boolean language plpgsql stable set search_path = '' as $$
declare
  v_from timestamptz;
  v_until timestamptz;
  v_series jsonb;
  v_recurrence jsonb;
  v_item jsonb;
  v_id text;
  v_ids text[] := array[]::text[];
  v_interval bigint;
  v_time text;
  v_key text;
  v_value jsonb;
  v_number numeric;
begin
  if pg_catalog.jsonb_typeof(p_schedule) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_schedule->'version') is distinct from 'number'
    or p_schedule->>'version' is distinct from '1'
    or p_schedule->>'timezone' is distinct from 'UTC'
    or pg_catalog.jsonb_typeof(p_schedule->'validFrom') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_schedule->'validUntil') is distinct from 'string'
    or p_schedule->>'validFrom' !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
    or p_schedule->>'validUntil' !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
    or pg_catalog.jsonb_typeof(p_schedule->'series') is distinct from 'array' then
    return false;
  end if;
  v_from := (p_schedule->>'validFrom')::timestamptz;
  v_until := (p_schedule->>'validUntil')::timestamptz;
  if v_until <= v_from
    or pg_catalog.jsonb_array_length(p_schedule->'series') not between 1 and 256 then
    return false;
  end if;

  for v_series in select value from pg_catalog.jsonb_array_elements(p_schedule->'series') loop
    if pg_catalog.jsonb_typeof(v_series) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_series->'id') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_series->'name') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_series->'track') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_series->'vehicleClass') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_series->'licenseLabel') is distinct from 'string'
      or pg_catalog.btrim(v_series->>'id') = ''
      or pg_catalog.btrim(v_series->>'name') = '' then
      return false;
    end if;
    v_id := v_series->>'id';
    if v_id = any(v_ids) then return false; end if;
    v_ids := pg_catalog.array_append(v_ids,v_id);
    for v_key,v_value in select key,value from pg_catalog.jsonb_each(v_series) loop
      if v_key in ('tier','eventKind','format','setup','assists',
                   'safetyRating','source') then
        if pg_catalog.jsonb_typeof(v_value) <> 'string' then return false; end if;
      elsif v_key in ('raceDurationMin','eventDurationMin','tyres',
                      'splits','veLimit') and v_value <> 'null'::jsonb then
        if pg_catalog.jsonb_typeof(v_value) <> 'number'
          or v_value #>> '{}' !~ '^[0-9]+$' then return false; end if;
        v_number := (v_value #>> '{}')::numeric;
        if v_number > 4294967295 then return false; end if;
      elsif v_key='startOffsetMinute' then
        if pg_catalog.jsonb_typeof(v_value) <> 'number'
          or v_value #>> '{}' !~ '^-?[0-9]+$' then return false; end if;
        perform (v_value #>> '{}')::bigint;
      elsif v_key='tyreWarmers' then
        if pg_catalog.jsonb_typeof(v_value) <> 'boolean' then return false; end if;
      elsif v_key in ('classes','sessions','notes') then
        if pg_catalog.jsonb_typeof(v_value) <> 'array' then return false; end if;
        for v_item in select value from pg_catalog.jsonb_array_elements(v_value) loop
          if v_key='notes' then
            if pg_catalog.jsonb_typeof(v_item) <> 'string' then return false; end if;
          elsif v_key='classes' then
            if pg_catalog.jsonb_typeof(v_item) <> 'object'
              or pg_catalog.jsonb_typeof(v_item->'name') <> 'string' then
              return false;
            end if;
          else
            if pg_catalog.jsonb_typeof(v_item) <> 'object'
              or pg_catalog.jsonb_typeof(v_item->'name') <> 'string'
              or pg_catalog.jsonb_typeof(v_item->'durationMin') <> 'number'
              or v_item->>'durationMin' !~ '^[0-9]+$' then return false; end if;
            v_number := (v_item->>'durationMin')::numeric;
            if v_number > 4294967295
              or (v_item ? 'estimated'
                and pg_catalog.jsonb_typeof(v_item->'estimated') <> 'boolean') then
              return false;
            end if;
          end if;
        end loop;
      end if;
    end loop;
    v_recurrence := v_series->'recurrence';
    if pg_catalog.jsonb_typeof(v_recurrence) is distinct from 'object' then
      return false;
    end if;
    if v_recurrence ? 'intervalMinutes' then
      if pg_catalog.jsonb_typeof(v_recurrence->'intervalMinutes') <> 'number'
        or v_recurrence->>'intervalMinutes' !~ '^-?[0-9]+$' then return false; end if;
      perform (v_recurrence->>'intervalMinutes')::bigint;
    end if;
    for v_key in select unnest(array['days','timesUTC']) loop
      if v_recurrence ? v_key then
        if pg_catalog.jsonb_typeof(v_recurrence->v_key) <> 'array' then return false; end if;
        for v_item in select value from pg_catalog.jsonb_array_elements(v_recurrence->v_key) loop
          if pg_catalog.jsonb_typeof(v_item) <> 'string' then return false; end if;
        end loop;
      end if;
    end loop;
    if v_recurrence->>'kind' = 'interval' then
      if pg_catalog.jsonb_typeof(v_recurrence->'intervalMinutes') is distinct from 'number'
        or v_recurrence->>'intervalMinutes' !~ '^-?[0-9]+$' then
        return false;
      end if;
      v_interval := (v_recurrence->>'intervalMinutes')::bigint;
      if v_interval not between 1 and 10080 then return false; end if;
    elsif v_recurrence->>'kind' = 'weekly-slots' then
      if pg_catalog.jsonb_typeof(v_recurrence->'days') is distinct from 'array'
        or pg_catalog.jsonb_typeof(v_recurrence->'timesUTC') is distinct from 'array'
        or pg_catalog.jsonb_array_length(v_recurrence->'days') = 0
        or pg_catalog.jsonb_array_length(v_recurrence->'timesUTC') = 0 then
        return false;
      end if;
      for v_item in select value from pg_catalog.jsonb_array_elements(v_recurrence->'days') loop
        if pg_catalog.jsonb_typeof(v_item) is distinct from 'string'
          or v_item #>> '{}' not in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun') then
          return false;
        end if;
      end loop;
      for v_item in select value from pg_catalog.jsonb_array_elements(v_recurrence->'timesUTC') loop
        v_time := v_item #>> '{}';
        if pg_catalog.jsonb_typeof(v_item) is distinct from 'string'
          or v_time !~ '^[0-9]{2}:[0-9]{2}$'
          or pg_catalog.substr(v_time,1,2)::integer > 23
          or pg_catalog.substr(v_time,4,2)::integer > 59 then
          return false;
        end if;
      end loop;
    else
      return false;
    end if;
  end loop;
  return true;
exception when invalid_text_representation or datetime_field_overflow
  or numeric_value_out_of_range then
  return false;
end $$;

revoke all on function public.race_schedule_valid(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.race_schedule_valid(jsonb) to service_role;
commit;
