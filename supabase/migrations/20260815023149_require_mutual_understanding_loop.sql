-- Require both participants to complete a confirmed listening-and-response loop
-- before AI may produce a shared understanding. The existing dialogue tables and
-- RLS boundaries remain unchanged.

create or replace function public.internal_get_dialogue_context_v2(p_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'sequence', turn.sequence_no,
    'round', turn.round_no,
    'kind', turn.turn_kind,
    'authorRole', participant.role,
    'source', 'DIALOGUE.' || turn.turn_kind || '.' || participant.role || '.' || turn.sequence_no,
    'replyToSequence', replied.sequence_no,
    'payload', turn.payload
  ) order by turn.sequence_no), '[]'::jsonb)
  from private.ai_jobs job
  join public.rooms room on room.id = job.room_id
  join lateral (
    select timeline.*
    from private.dialogue_turns timeline
    where timeline.room_id = job.room_id
      and timeline.generation_no = room.dialogue_generation
    order by timeline.sequence_no desc
    limit 80
  ) turn on true
  left join public.participants participant on participant.id = turn.participant_id
  left join private.dialogue_turns replied on replied.id = turn.reply_to_turn_id
  where job.id = p_job_id
    and turn.turn_kind <> 'AI_SUMMARY';
$$;

create or replace function private.require_dialogue_before_consensus_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_dialogue boolean := false;
  v_a_confirmed boolean := false;
  v_b_confirmed boolean := false;
  v_a_responded boolean := false;
  v_b_responded boolean := false;
begin
  if new.job_type <> 'CONSENSUS' then
    return new;
  end if;

  select
    count(turn.id) > 0,
    coalesce(bool_or(
      turn.turn_kind = 'REFLECTION_CONFIRMATION'
      and participant.role = 'A'
      and turn.payload ->> 'decision' = 'ACCURATE'
    ), false),
    coalesce(bool_or(
      turn.turn_kind = 'REFLECTION_CONFIRMATION'
      and participant.role = 'B'
      and turn.payload ->> 'decision' = 'ACCURATE'
    ), false),
    coalesce(bool_or(turn.turn_kind = 'RESPONSE' and participant.role = 'A'), false),
    coalesce(bool_or(turn.turn_kind = 'RESPONSE' and participant.role = 'B'), false)
  into v_has_dialogue, v_a_confirmed, v_b_confirmed, v_a_responded, v_b_responded
  from public.rooms room
  left join private.dialogue_turns turn
    on turn.room_id = room.id
    and turn.generation_no = room.dialogue_generation
  left join public.participants participant on participant.id = turn.participant_id
  where room.id = new.room_id;

  if v_has_dialogue and not (v_a_confirmed and v_b_confirmed and v_a_responded and v_b_responded) then
    raise exception '双方都需要先完成一次被确认听懂后的回应，才能整理互相理解。'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function public.internal_get_dialogue_context_v2(uuid) from public, anon, authenticated;
revoke all on function private.require_dialogue_before_consensus_v2() from public, anon, authenticated;
grant execute on function public.internal_get_dialogue_context_v2(uuid) to service_role;
