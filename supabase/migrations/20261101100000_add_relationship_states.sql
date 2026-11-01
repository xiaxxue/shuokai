-- Keep the old scalar for legacy clients; new clients store all selected states separately.
create function private.valid_relationship_states_v1(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if value is null or jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) > 6 then return false; end if;
  if exists (
    select 1 from jsonb_array_elements(value) item
    where jsonb_typeof(item) <> 'string' or item #>> '{}' not in
      ('REPAIR','REPEATING','DECISION','BOUNDARY','UNCERTAIN','PAUSE_END')
  ) then return false; end if;
  return (select count(*) = count(distinct state)
    from jsonb_array_elements_text(value) as states(state));
end;
$$;

alter table private.participant_relationship_contexts
  add column relationship_states jsonb not null default '[]'::jsonb
  constraint participant_relationship_states_valid check (private.valid_relationship_states_v1(relationship_states));

create function public.get_room_relationship_context_v3(p_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb := public.get_room_relationship_context_v2(p_room_id);
  v_states jsonb;
begin
  select case when relationship_states <> '[]'::jsonb then relationship_states
    when relationship_state is not null then jsonb_build_array(relationship_state)
    else '[]'::jsonb end into v_states
  from private.participant_relationship_contexts
  where room_id = p_room_id and owner_user_id = (select auth.uid());
  return jsonb_set(v_result, '{mine,relationshipStates}', coalesce(v_states, '[]'::jsonb), true);
end;
$$;

create function public.save_room_relationship_context_v3(
  p_room_id uuid, p_expected_shared_revision bigint, p_expected_private_revision bigint,
  p_status text, p_step smallint, p_shared jsonb, p_private jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_states jsonb := p_private->'relationshipStates';
begin
  if not private.valid_relationship_states_v1(v_states) or p_private->>'relationshipState' is not null then
    raise exception '当前关系状态无效。' using errcode = '22023';
  end if;
  perform public.save_room_relationship_context_v2(p_room_id, p_expected_shared_revision,
    p_expected_private_revision, p_status, p_step, p_shared, p_private);
  update private.participant_relationship_contexts set relationship_states = v_states
  where room_id = p_room_id and owner_user_id = (select auth.uid());
  return public.get_room_relationship_context_v3(p_room_id);
end;
$$;

create function public.respond_room_relationship_context_v3(
  p_room_id uuid, p_expected_private_revision bigint, p_seen_shared_revision bigint,
  p_status text, p_step smallint, p_decision text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_states jsonb := p_payload->'relationshipStates';
begin
  if not private.valid_relationship_states_v1(v_states) or p_payload->>'relationshipState' is not null then
    raise exception '当前关系状态无效。' using errcode = '22023';
  end if;
  perform public.respond_room_relationship_context_v2(p_room_id, p_expected_private_revision,
    p_seen_shared_revision, p_status, p_step, p_decision, p_payload);
  update private.participant_relationship_contexts set relationship_states = v_states
  where room_id = p_room_id and owner_user_id = (select auth.uid());
  return public.get_room_relationship_context_v3(p_room_id);
end;
$$;

create function public.get_ai_memory_context_v3(p_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb := public.get_ai_memory_context_v2(p_room_id);
  v_states jsonb;
  v_state_list text;
begin
  select case when relationship_states <> '[]'::jsonb then relationship_states
    when relationship_state is not null then jsonb_build_array(relationship_state)
    else '[]'::jsonb end into v_states
  from private.participant_relationship_contexts
  where room_id = p_room_id and owner_user_id = (select auth.uid())
    and status <> 'DRAFT' and use_relationship_state_ai;
  if v_states is null or v_states = '[]'::jsonb then return v_result; end if;
  select string_agg(item, ',' order by ordinal) into v_state_list
  from jsonb_array_elements_text(v_states) with ordinality as states(item, ordinal);
  return jsonb_set(v_result, '{onboarding,myContext}',
    (v_result #> '{onboarding,myContext}') || jsonb_build_object('relationshipStates', v_state_list), true);
end;
$$;

revoke all on function private.valid_relationship_states_v1(jsonb) from public, anon, authenticated;
revoke all on function public.get_room_relationship_context_v3(uuid) from public, anon;
revoke all on function public.save_room_relationship_context_v3(uuid,bigint,bigint,text,smallint,jsonb,jsonb) from public, anon;
revoke all on function public.respond_room_relationship_context_v3(uuid,bigint,bigint,text,smallint,text,jsonb) from public, anon;
revoke all on function public.get_ai_memory_context_v3(uuid) from public, anon;
grant execute on function public.get_room_relationship_context_v3(uuid) to authenticated;
grant execute on function public.save_room_relationship_context_v3(uuid,bigint,bigint,text,smallint,jsonb,jsonb) to authenticated;
grant execute on function public.respond_room_relationship_context_v3(uuid,bigint,bigint,text,smallint,text,jsonb) to authenticated;
grant execute on function public.get_ai_memory_context_v3(uuid) to authenticated;
