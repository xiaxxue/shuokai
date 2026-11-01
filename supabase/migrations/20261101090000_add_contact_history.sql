-- Keep the old interaction_mode untouched: it cannot describe distance, meeting
-- frequency, and a change over time without inventing facts about old answers.
alter table private.room_relationship_contexts add column contact_history jsonb;
alter table private.participant_relationship_contexts add column contact_history jsonb;

create function private.valid_contact_history_v1(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case when value is null then true when jsonb_typeof(value) <> 'object' then false else (
    value ?& array['currentProximity', 'currentFrequency', 'changed',
      'previousProximity', 'previousFrequency', 'changeTime']
    and (select count(*) from jsonb_object_keys(value)) = 6
    and (value->>'currentProximity' is null or value->>'currentProximity' in
      ('TOGETHER','NEARBY','DISTANT','VARIABLE','UNSURE'))
    and (value->>'previousProximity' is null or value->>'previousProximity' in
      ('TOGETHER','NEARBY','DISTANT','VARIABLE','UNSURE'))
    and (value->>'currentFrequency' is null or value->>'currentFrequency' in
      ('DAILY','WEEKLY','MONTHLY_OR_LESS','NONE','VARIABLE','UNSURE'))
    and (value->>'previousFrequency' is null or value->>'previousFrequency' in
      ('DAILY','WEEKLY','MONTHLY_OR_LESS','NONE','VARIABLE','UNSURE'))
    and (value->>'changed' is null or value->>'changed' in ('YES','NO'))
    and (value->>'changeTime' is null or value->>'changeTime' in
      ('LT_1M','M1_6','M6_12','Y1_PLUS','UNSURE'))
    and (value->>'changed' = 'YES' or
      (value->>'previousProximity' is null and value->>'previousFrequency' is null
       and value->>'changeTime' is null))
  ) end;
$$;

alter table private.room_relationship_contexts add constraint room_contact_history_valid
  check (private.valid_contact_history_v1(contact_history));
alter table private.participant_relationship_contexts add constraint participant_contact_history_valid
  check (private.valid_contact_history_v1(contact_history));

create function public.get_room_relationship_context_v2(p_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb := public.get_room_relationship_context_v1(p_room_id);
  v_shared jsonb;
  v_mine jsonb;
  v_recipient jsonb;
begin
  select contact_history into v_shared from private.room_relationship_contexts
    where room_id = p_room_id and (v_result->>'role' = 'A' or status = 'CONFIRMED');
  select contact_history into v_mine from private.participant_relationship_contexts
    where room_id = p_room_id and owner_user_id = (select auth.uid());
  v_result := jsonb_set(v_result, '{shared,contactHistory}', coalesce(v_shared, 'null'::jsonb), true);
  v_result := jsonb_set(v_result, '{mine,contactHistory}', coalesce(v_mine, 'null'::jsonb), true);
  if v_result->'recipientResponse' is not null and v_result->'recipientResponse' <> 'null'::jsonb then
    select context.contact_history into v_recipient
      from private.participant_relationship_contexts context
      join public.participants participant on participant.id = context.participant_id
      where context.room_id = p_room_id and participant.role = 'B' and context.status = 'DIFFERENT';
    v_result := jsonb_set(v_result, '{recipientResponse,contactHistory}', coalesce(v_recipient, 'null'::jsonb), true);
  end if;
  return v_result;
end;
$$;

create function public.save_room_relationship_context_v2(
  p_room_id uuid, p_expected_shared_revision bigint, p_expected_private_revision bigint,
  p_status text, p_step smallint, p_shared jsonb, p_private jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_history jsonb := p_shared->'contactHistory';
begin
  if not private.valid_contact_history_v1(v_history) then
    raise exception '见面情况无效。' using errcode = '22023';
  end if;
  perform public.save_room_relationship_context_v1(p_room_id, p_expected_shared_revision,
    p_expected_private_revision, p_status, p_step, p_shared, p_private);
  update private.room_relationship_contexts set
    contact_history = v_history,
    revision = revision + case when contact_history is distinct from v_history then 1 else 0 end
  where room_id = p_room_id;
  update private.participant_relationship_contexts mine set
    seen_shared_revision = shared.revision
  from private.room_relationship_contexts shared
  where mine.room_id = p_room_id and mine.owner_user_id = (select auth.uid())
    and shared.room_id = p_room_id;
  return public.get_room_relationship_context_v2(p_room_id);
end;
$$;

create function public.respond_room_relationship_context_v2(
  p_room_id uuid, p_expected_private_revision bigint, p_seen_shared_revision bigint,
  p_status text, p_step smallint, p_decision text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_history jsonb := p_payload->'contactHistory';
  v_contact_only boolean := p_status = 'DIFFERENT' and
    p_payload->>'relationshipType' is null and p_payload->>'durationRange' is null and
    p_payload->>'interactionMode' is null;
begin
  if not private.valid_contact_history_v1(v_history) then
    raise exception '见面情况无效。' using errcode = '22023';
  end if;
  if v_contact_only and (v_history is null or
    (v_history->>'currentProximity' is null and v_history->>'currentFrequency' is null)) then
    raise exception '请至少填写一项自己的版本。' using errcode = '22023';
  end if;
  -- The v1 validator requires one legacy field for a different version. The
  -- temporary marker is removed in this same transaction before any response.
  perform public.respond_room_relationship_context_v1(p_room_id, p_expected_private_revision,
    p_seen_shared_revision, p_status, p_step, p_decision,
    case when v_contact_only then p_payload || '{"interactionMode":"NA"}'::jsonb else p_payload end);
  update private.participant_relationship_contexts set
    contact_history = case when p_decision = 'DIFFERENT' then v_history end,
    interaction_mode = case when v_contact_only then null else interaction_mode end
  where room_id = p_room_id and owner_user_id = (select auth.uid());
  return public.get_room_relationship_context_v2(p_room_id);
end;
$$;

create function public.get_ai_memory_context_v2(p_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb := public.get_ai_memory_context_v1(p_room_id);
  v_history jsonb;
begin
  -- v1 already decides whether this person's private AI may read the inviter
  -- version. Preserve that consent boundary before adding the new fields.
  if v_result #> '{onboarding,sharedContext}' = '{}'::jsonb then return v_result; end if;
  select contact_history into v_history from private.room_relationship_contexts
    where room_id = p_room_id and status = 'CONFIRMED';
  if v_history is null then return v_result; end if;
  return jsonb_set(v_result, '{onboarding,sharedContext}',
    (v_result #> '{onboarding,sharedContext}') || jsonb_strip_nulls(jsonb_build_object(
      'currentProximity', v_history->>'currentProximity',
      'currentFrequency', v_history->>'currentFrequency',
      'changed', v_history->>'changed',
      'previousProximity', v_history->>'previousProximity',
      'previousFrequency', v_history->>'previousFrequency',
      'changeTime', v_history->>'changeTime'
    )), true);
end;
$$;

revoke all on function private.valid_contact_history_v1(jsonb) from public, anon, authenticated;
revoke all on function public.get_room_relationship_context_v2(uuid) from public, anon;
revoke all on function public.save_room_relationship_context_v2(uuid,bigint,bigint,text,smallint,jsonb,jsonb) from public, anon;
revoke all on function public.respond_room_relationship_context_v2(uuid,bigint,bigint,text,smallint,text,jsonb) from public, anon;
revoke all on function public.get_ai_memory_context_v2(uuid) from public, anon;
grant execute on function public.get_room_relationship_context_v2(uuid) to authenticated;
grant execute on function public.save_room_relationship_context_v2(uuid,bigint,bigint,text,smallint,jsonb,jsonb) to authenticated;
grant execute on function public.respond_room_relationship_context_v2(uuid,bigint,bigint,text,smallint,text,jsonb) to authenticated;
grant execute on function public.get_ai_memory_context_v2(uuid) to authenticated;
