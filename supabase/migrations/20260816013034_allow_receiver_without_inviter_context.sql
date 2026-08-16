-- Let recipients continue when an older room has no inviter relationship
-- context, while keeping real membership checks and future revision checks.
create or replace function public.respond_room_relationship_context_v1(
  p_room_id uuid,
  p_expected_private_revision bigint,
  p_seen_shared_revision bigint,
  p_status text,
  p_step smallint,
  p_decision text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.participants := private.require_context_participant_v1(p_room_id);
  v_shared private.room_relationship_contexts;
  v_visible_shared_revision bigint;
  v_mine private.participant_relationship_contexts;
  v_relationship_type text := nullif(p_payload->>'relationshipType','');
  v_relationship_other text := nullif(regexp_replace(btrim(normalize(coalesce(p_payload->>'relationshipOther',''), NFKC)), '[[:space:]]+', ' ', 'g'), '');
begin
  if v_me.role <> 'B' then raise exception '只有受邀者可以确认邀请背景。' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('shuokai-room-context:' || p_room_id::text, 0));
  if p_status not in ('DRAFT','CONFIRMED','DIFFERENT','SKIPPED') or p_step not between 1 and 4 or
    (p_decision is not null and p_decision not in ('CONFIRMED','DIFFERENT','SKIPPED')) or
    (p_status <> 'DRAFT' and p_decision is distinct from p_status) or
    jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 10000 then
    raise exception '关系背景参数无效。' using errcode = '22023';
  end if;

  select * into v_shared from private.room_relationship_contexts where room_id = p_room_id;
  v_visible_shared_revision := case
    when v_shared.status in ('CONFIRMED', 'SKIPPED') then v_shared.revision
    else 0
  end;
  if p_decision = 'CONFIRMED' and v_shared.status is distinct from 'CONFIRMED' then
    raise exception '邀请方没有可确认的关系背景。请选择填写自己的版本或暂不回答。' using errcode = 'P0C02';
  end if;
  if v_visible_shared_revision <> p_seen_shared_revision then
    raise exception '邀请背景刚刚更新，请重新确认。' using errcode = '40001';
  end if;
  if p_status = 'DIFFERENT' and v_relationship_type is null and nullif(p_payload->>'durationRange','') is null and nullif(p_payload->>'interactionMode','') is null then
    raise exception '请至少填写一项自己的版本，或选择暂不回答。' using errcode = '22023';
  end if;
  if v_relationship_type is not null and v_relationship_type not in ('PARTNER','MARRIED','FAMILY','FRIEND','COLLEAGUE','OTHER') or
    (v_relationship_type = 'OTHER' and (v_relationship_other is null or char_length(v_relationship_other) > 30)) then
    raise exception '关系类型无效。' using errcode = '22023';
  end if;

  select * into v_mine from private.participant_relationship_contexts where participant_id = v_me.id for update;
  if v_mine.participant_id is null then
    if p_expected_private_revision <> 0 then raise exception '你的选择刚刚在另一处更新。' using errcode = '40001'; end if;
    insert into private.participant_relationship_contexts (
      participant_id, room_id, owner_user_id, status, draft_step, draft_decision, seen_shared_revision,
      relationship_type, relationship_other, duration_range, interaction_mode,
      communication_pace, response_preference, planning_style, relationship_state,
      observed_difference, cultural_context, use_communication_ai, use_relationship_state_ai,
      use_difference_ai, use_culture_ai, use_inviter_shared_ai
    ) values (
      v_me.id, p_room_id, v_me.user_id, p_status, p_step, p_decision, v_visible_shared_revision,
      case when p_status = 'DIFFERENT' or p_status = 'DRAFT' and p_decision = 'DIFFERENT' then v_relationship_type end,
      case when (p_status = 'DIFFERENT' or p_status = 'DRAFT' and p_decision = 'DIFFERENT') and v_relationship_type = 'OTHER' then v_relationship_other end,
      case when p_status = 'DIFFERENT' or p_status = 'DRAFT' and p_decision = 'DIFFERENT' then nullif(p_payload->>'durationRange','') end,
      case when p_status = 'DIFFERENT' or p_status = 'DRAFT' and p_decision = 'DIFFERENT' then nullif(p_payload->>'interactionMode','') end,
      nullif(p_payload->>'communicationPace',''), nullif(p_payload->>'responsePreference',''),
      nullif(p_payload->>'planningStyle',''), nullif(p_payload->>'relationshipState',''),
      nullif(btrim(p_payload->>'observedDifference'),''), nullif(btrim(p_payload->>'culturalContext'),''),
      coalesce((p_payload->>'useCommunicationAi')::boolean,true),
      coalesce((p_payload->>'useRelationshipStateAi')::boolean,true),
      coalesce((p_payload->>'useDifferenceAi')::boolean,true),
      coalesce((p_payload->>'useCultureAi')::boolean,false),
      case when v_shared.status = 'CONFIRMED' then coalesce((p_payload->>'useInviterSharedAi')::boolean,false) else false end
    ) returning * into v_mine;
  else
    if v_mine.revision <> p_expected_private_revision then raise exception '你的选择刚刚在另一处更新。' using errcode = '40001'; end if;
    update private.participant_relationship_contexts set
      status = p_status, draft_step = p_step, draft_decision = p_decision,
      seen_shared_revision = v_visible_shared_revision,
      relationship_type = case when p_status = 'DIFFERENT' or p_status = 'DRAFT' and p_decision = 'DIFFERENT' then v_relationship_type end,
      relationship_other = case when (p_status = 'DIFFERENT' or p_status = 'DRAFT' and p_decision = 'DIFFERENT') and v_relationship_type = 'OTHER' then v_relationship_other end,
      duration_range = case when p_status = 'DIFFERENT' or p_status = 'DRAFT' and p_decision = 'DIFFERENT' then nullif(p_payload->>'durationRange','') end,
      interaction_mode = case when p_status = 'DIFFERENT' or p_status = 'DRAFT' and p_decision = 'DIFFERENT' then nullif(p_payload->>'interactionMode','') end,
      communication_pace = nullif(p_payload->>'communicationPace',''),
      response_preference = nullif(p_payload->>'responsePreference',''),
      planning_style = nullif(p_payload->>'planningStyle',''),
      relationship_state = nullif(p_payload->>'relationshipState',''),
      observed_difference = nullif(btrim(p_payload->>'observedDifference'),''),
      cultural_context = nullif(btrim(p_payload->>'culturalContext'),''),
      use_communication_ai = coalesce((p_payload->>'useCommunicationAi')::boolean,true),
      use_relationship_state_ai = coalesce((p_payload->>'useRelationshipStateAi')::boolean,true),
      use_difference_ai = coalesce((p_payload->>'useDifferenceAi')::boolean,true),
      use_culture_ai = coalesce((p_payload->>'useCultureAi')::boolean,false),
      use_inviter_shared_ai = case when v_shared.status = 'CONFIRMED' then coalesce((p_payload->>'useInviterSharedAi')::boolean,false) else false end,
      revision = revision + 1, consent_revision = consent_revision + 1
    where participant_id = v_me.id returning * into v_mine;
  end if;
  return public.get_room_relationship_context_v1(p_room_id);
end;
$$;

revoke all on function public.respond_room_relationship_context_v1(uuid, bigint, bigint, text, smallint, text, jsonb)
from public, anon, authenticated;
grant execute on function public.respond_room_relationship_context_v1(uuid, bigint, bigint, text, smallint, text, jsonb)
to authenticated;
