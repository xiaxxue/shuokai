-- Guided, multi-round dialogue. Private drafts stay in participant_workspaces_v2;
-- this table contains only content a participant explicitly shared, plus
-- reviewed AI round summaries.

alter table public.rooms drop constraint rooms_phase_v2_check;
alter table public.rooms add constraint rooms_phase_v2_check check (
  phase_v2 is null or phase_v2 in (
    'SETUP', 'PRIVATE_EXPRESSION', 'DIALOGUE', 'UNDERSTANDING_GENERATING',
    'UNDERSTANDING_CONFIRMING', 'ACTION_GENERATING', 'ACTION_CONFIRMING',
    'PAUSED', 'COMPLETED', 'ENDED'
  )
);

alter table public.rooms drop constraint rooms_resume_phase_v2_check;
alter table public.rooms add constraint rooms_resume_phase_v2_check check (
  resume_phase_v2 is null or resume_phase_v2 in (
    'SETUP', 'PRIVATE_EXPRESSION', 'DIALOGUE', 'UNDERSTANDING_GENERATING',
    'UNDERSTANDING_CONFIRMING', 'ACTION_GENERATING', 'ACTION_CONFIRMING',
    'COMPLETED', 'ENDED'
  )
);

alter table public.rooms
  add column dialogue_revision bigint not null default 0 check (dialogue_revision >= 0),
  add column dialogue_generation integer not null default 0 check (dialogue_generation >= 0),
  add column dialogue_round integer not null default 0 check (dialogue_round >= 0),
  add column dialogue_step text check (
    dialogue_step is null or dialogue_step in (
      'AWAITING_REFLECTION', 'AWAITING_CONFIRMATION', 'AWAITING_RESPONSE'
    )
  ),
  add column dialogue_active_participant_id uuid
    references public.participants(id) on delete set null;

create table private.dialogue_turns (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  generation_no integer not null check (generation_no > 0),
  sequence_no bigint not null check (sequence_no > 0),
  round_no integer not null check (round_no > 0),
  participant_id uuid references public.participants(id) on delete cascade,
  turn_kind text not null check (turn_kind in (
    'OPENING', 'REFLECTION', 'REFLECTION_CONFIRMATION', 'RESPONSE', 'AI_SUMMARY'
  )),
  reply_to_turn_id uuid references private.dialogue_turns(id) on delete restrict,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and octet_length(payload::text) between 2 and 16000
  ),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (room_id, sequence_no)
);

create index dialogue_turns_room_timeline_idx
on private.dialogue_turns (room_id, sequence_no);
create index dialogue_turns_participant_idx
on private.dialogue_turns (participant_id, created_at desc);
create index dialogue_turns_reply_idx
on private.dialogue_turns (reply_to_turn_id);

alter table private.dialogue_turns enable row level security;
revoke all on table private.dialogue_turns from public, anon, authenticated;

alter table public.rooms
  add column dialogue_focus_turn_id uuid
    references private.dialogue_turns(id) on delete set null;

create or replace function private.ensure_dialogue_v2(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_a public.participants;
  v_b public.participants;
  v_expression_a public.expression_versions;
  v_expression_b public.expression_versions;
  v_opening_a_id uuid;
  v_opening_b_id uuid;
  v_generation integer;
  v_sequence bigint;
begin
  select room.* into v_room from public.rooms room
  where room.id = p_room_id and room.workflow_version = 2
  for update;
  if v_room.id is null then
    raise exception '这个房间不支持当前流程。' using errcode = '55000';
  end if;
  if v_room.phase_v2 = 'PAUSED' then
    raise exception '当前沟通已经暂停。' using errcode = '55000';
  end if;
  select participant.* into v_a from public.participants participant
  where participant.room_id = p_room_id and participant.role = 'A';
  select participant.* into v_b from public.participants participant
  where participant.room_id = p_room_id and participant.role = 'B';
  if v_a.current_expression_id is null or v_b.current_expression_id is null then
    raise exception '需要双方先分别确认自己的表达。' using errcode = '55000';
  end if;
  select expression.* into v_expression_a from public.expression_versions expression
  where expression.id = v_a.current_expression_id and expression.room_id = p_room_id;
  select expression.* into v_expression_b from public.expression_versions expression
  where expression.id = v_b.current_expression_id and expression.room_id = p_room_id;
  if v_expression_a.id is null or v_expression_b.id is null then
    raise exception '双方确认的表达版本无效。' using errcode = '55000';
  end if;

  if exists (
    select 1
    from private.dialogue_turns turn
    join public.participants participant on participant.id = turn.participant_id
    where turn.room_id = p_room_id
      and turn.generation_no = v_room.dialogue_generation
      and turn.turn_kind = 'OPENING'
      and (
        (participant.role = 'A' and turn.payload->>'expressionId' = v_expression_a.id::text)
        or (participant.role = 'B' and turn.payload->>'expressionId' = v_expression_b.id::text)
      )
    group by turn.room_id
    having count(*) = 2
  ) then
    if v_room.phase_v2 in ('PRIVATE_EXPRESSION', 'UNDERSTANDING_GENERATING') then
      update public.rooms set phase_v2 = 'DIALOGUE' where id = p_room_id;
    end if;
    return;
  end if;

  v_generation := v_room.dialogue_generation + 1;
  select coalesce(max(turn.sequence_no), 0) + 1 into v_sequence
  from private.dialogue_turns turn where turn.room_id = p_room_id;

  insert into private.dialogue_turns (
    room_id, generation_no, sequence_no, round_no, participant_id, turn_kind, payload, content_hash
  ) values (
    p_room_id, v_generation, v_sequence, 1, v_a.id, 'OPENING',
    jsonb_build_object(
      'mode', v_expression_a.mode,
      'card', v_expression_a.payload,
      'expressionId', v_expression_a.id
    ),
    v_expression_a.content_hash
  ) returning id into v_opening_a_id;

  insert into private.dialogue_turns (
    room_id, generation_no, sequence_no, round_no, participant_id, turn_kind, payload, content_hash
  ) values (
    p_room_id, v_generation, v_sequence + 1, 1, v_b.id, 'OPENING',
    jsonb_build_object(
      'mode', v_expression_b.mode,
      'card', v_expression_b.payload,
      'expressionId', v_expression_b.id
    ),
    v_expression_b.content_hash
  ) returning id into v_opening_b_id;

  update public.rooms set
    phase_v2 = 'DIALOGUE',
    dialogue_revision = 1,
    dialogue_generation = v_generation,
    dialogue_round = 1,
    dialogue_step = 'AWAITING_REFLECTION',
    dialogue_active_participant_id = v_b.id,
    dialogue_focus_turn_id = v_opening_a_id,
    current_understanding_result_id = null,
    current_action_result_id = null
  where id = p_room_id;
end;
$$;

create or replace function private.begin_dialogue_after_both_confirmed_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.workflow_version = 2
     and new.phase_v2 = 'UNDERSTANDING_GENERATING'
     and old.phase_v2 is distinct from 'UNDERSTANDING_GENERATING'
     and (
       old.phase_v2 = 'PRIVATE_EXPRESSION'
       or not exists (
         select 1 from private.dialogue_turns turn
         where turn.room_id = new.id and turn.generation_no = new.dialogue_generation
       )
     ) then
    perform private.ensure_dialogue_v2(new.id);
  end if;
  return new;
end;
$$;

create trigger rooms_begin_dialogue_after_both_confirmed_v2
after update of phase_v2 on public.rooms
for each row execute function private.begin_dialogue_after_both_confirmed_v2();

create or replace function public.start_dialogue_v2(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_phase text;
begin
  if not exists (
    select 1 from public.participants participant
    where participant.room_id = p_room_id and participant.user_id = v_user_id
  ) then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;
  select room.phase_v2 into v_phase from public.rooms room where room.id = p_room_id;
  if v_phase not in ('PRIVATE_EXPRESSION', 'UNDERSTANDING_GENERATING', 'DIALOGUE') then
    return jsonb_build_object('started', false, 'phase', v_phase);
  end if;
  perform private.ensure_dialogue_v2(p_room_id);
  return jsonb_build_object(
    'started', true,
    'phase', (select room.phase_v2 from public.rooms room where room.id = p_room_id)
  );
end;
$$;

create or replace function public.get_dialogue_state_v2(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_me public.participants;
  v_room public.rooms;
begin
  select participant.* into v_me from public.participants participant
  where participant.room_id = p_room_id and participant.user_id = v_user_id;
  if v_me.id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;
  select room.* into v_room from public.rooms room
  where room.id = p_room_id and room.workflow_version = 2;
  if v_room.id is null then
    raise exception '这个房间不支持当前流程。' using errcode = '55000';
  end if;

  return jsonb_build_object(
    'phase', v_room.phase_v2,
    'revision', v_room.dialogue_revision,
    'round', v_room.dialogue_round,
    'step', v_room.dialogue_step,
    'ownRole', v_me.role,
    'activeRole', (
      select participant.role from public.participants participant
      where participant.id = v_room.dialogue_active_participant_id
    ),
    'canAct', v_room.phase_v2 = 'DIALOGUE'
      and v_room.dialogue_active_participant_id = v_me.id,
    'focusTurnId', v_room.dialogue_focus_turn_id,
    'turns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', turn.id,
        'sequence', turn.sequence_no,
        'round', turn.round_no,
        'kind', turn.turn_kind,
        'authorRole', participant.role,
        'replyToTurnId', turn.reply_to_turn_id,
	        'payload', case
	          when turn.turn_kind = 'OPENING' then turn.payload - 'expressionId'
	          else turn.payload
	        end,
        'createdAt', turn.created_at
      ) order by turn.sequence_no)
      from private.dialogue_turns turn
      left join public.participants participant on participant.id = turn.participant_id
      where turn.room_id = p_room_id and turn.generation_no = v_room.dialogue_generation
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.append_dialogue_turn_v2(
  p_room_id uuid,
  p_expected_revision bigint,
  p_turn_kind text,
  p_reply_to_turn_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_me public.participants;
  v_other public.participants;
  v_room public.rooms;
  v_focus private.dialogue_turns;
  v_original private.dialogue_turns;
  v_opening_b private.dialogue_turns;
  v_sequence bigint;
  v_turn_id uuid;
  v_content_hash text;
  v_decision text;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
     or octet_length(p_payload::text) > 16000 then
    raise exception '提交内容格式无效。' using errcode = 'P0001';
  end if;
  select participant.* into v_me from public.participants participant
  where participant.room_id = p_room_id and participant.user_id = v_user_id
  for update;
  if v_me.id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;
  select participant.* into v_other from public.participants participant
  where participant.room_id = p_room_id and participant.id <> v_me.id;
  select room.* into v_room from public.rooms room
  where room.id = p_room_id and room.workflow_version = 2
  for update;
  if v_room.id is null or v_room.phase_v2 <> 'DIALOGUE' then
    raise exception '当前不在多轮沟通阶段。' using errcode = '55000';
  end if;
  if v_room.dialogue_revision <> p_expected_revision then
    raise exception '沟通刚刚有了新进展，请刷新后重试。' using errcode = '40001';
  end if;
  if v_room.dialogue_active_participant_id <> v_me.id then
    raise exception '当前正在等待对方完成这一步。' using errcode = '55000';
  end if;
  if p_reply_to_turn_id is distinct from v_room.dialogue_focus_turn_id then
    raise exception '回应的内容已经发生变化，请刷新后重试。' using errcode = '40001';
  end if;
  select turn.* into v_focus from private.dialogue_turns turn
  where turn.id = v_room.dialogue_focus_turn_id and turn.room_id = p_room_id;
  if v_focus.id is null then
    raise exception '当前需要回应的内容不存在。' using errcode = '55000';
  end if;
  if (select count(*) from private.dialogue_turns turn
      where turn.room_id = p_room_id and turn.generation_no = v_room.dialogue_generation) >= 200 then
    raise exception '这次沟通记录已达到上限，请先整理阶段总结或开启新房间。' using errcode = '55000';
  end if;

  if p_turn_kind in ('REFLECTION', 'RESPONSE') then
    if p_payload - 'text' <> '{}'::jsonb
       or jsonb_typeof(p_payload->'text') is distinct from 'string'
       or char_length(btrim(p_payload->>'text')) not between 1 and 3000 then
      raise exception '请提交 1 到 3000 字的内容。' using errcode = 'P0001';
    end if;
  elsif p_turn_kind = 'REFLECTION_CONFIRMATION' then
    if p_payload - array['decision', 'feedback'] <> '{}'::jsonb
       or p_payload->>'decision' not in ('ACCURATE', 'NEEDS_CORRECTION')
       or jsonb_typeof(p_payload->'feedback') is distinct from 'string'
       or char_length(p_payload->>'feedback') > 1200
       or (p_payload->>'decision' = 'NEEDS_CORRECTION'
         and nullif(btrim(p_payload->>'feedback'), '') is null) then
      raise exception '确认内容格式无效。' using errcode = 'P0001';
    end if;
  else
    raise exception '当前不支持这种沟通内容。' using errcode = 'P0001';
  end if;

  if (v_room.dialogue_step = 'AWAITING_REFLECTION' and p_turn_kind <> 'REFLECTION')
     or (v_room.dialogue_step = 'AWAITING_CONFIRMATION' and p_turn_kind <> 'REFLECTION_CONFIRMATION')
     or (v_room.dialogue_step = 'AWAITING_RESPONSE' and p_turn_kind <> 'RESPONSE') then
    raise exception '提交内容与当前步骤不一致。' using errcode = '55000';
  end if;
  if p_turn_kind = 'REFLECTION' and v_focus.participant_id = v_me.id then
    raise exception '需要先复述对方的表达。' using errcode = '55000';
  end if;
  if p_turn_kind = 'REFLECTION_CONFIRMATION' and v_focus.turn_kind <> 'REFLECTION' then
    raise exception '当前没有等待确认的复述。' using errcode = '55000';
  end if;

  select coalesce(max(turn.sequence_no), 0) + 1 into v_sequence
  from private.dialogue_turns turn where turn.room_id = p_room_id;
  v_content_hash := encode(
    extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex'
  );
  insert into private.dialogue_turns (
    room_id, generation_no, sequence_no, round_no, participant_id, turn_kind,
    reply_to_turn_id, payload, content_hash
  ) values (
    p_room_id, v_room.dialogue_generation, v_sequence, greatest(v_room.dialogue_round, 1), v_me.id,
    p_turn_kind, p_reply_to_turn_id, p_payload, v_content_hash
  ) returning id into v_turn_id;

  if p_turn_kind = 'REFLECTION' then
    update public.rooms set
      dialogue_revision = dialogue_revision + 1,
      dialogue_step = 'AWAITING_CONFIRMATION',
      dialogue_active_participant_id = v_focus.participant_id,
      dialogue_focus_turn_id = v_turn_id
    where id = p_room_id;
  elsif p_turn_kind = 'REFLECTION_CONFIRMATION' then
    select turn.* into v_original from private.dialogue_turns turn
    where turn.id = v_focus.reply_to_turn_id and turn.room_id = p_room_id;
    if v_original.id is null or v_original.participant_id <> v_me.id then
      raise exception '只能由原表达者确认复述。' using errcode = '55000';
    end if;
    v_decision := p_payload->>'decision';
    if v_decision = 'NEEDS_CORRECTION' then
      update public.rooms set
        dialogue_revision = dialogue_revision + 1,
        dialogue_step = 'AWAITING_REFLECTION',
        dialogue_active_participant_id = v_focus.participant_id,
        dialogue_focus_turn_id = v_original.id
      where id = p_room_id;
    elsif v_original.turn_kind = 'OPENING' and v_me.role = 'A' then
      select turn.* into v_opening_b from private.dialogue_turns turn
      join public.participants participant on participant.id = turn.participant_id
      where turn.room_id = p_room_id and turn.turn_kind = 'OPENING'
        and turn.generation_no = v_room.dialogue_generation
        and participant.role = 'B'
      order by turn.sequence_no limit 1;
      update public.rooms set
        dialogue_revision = dialogue_revision + 1,
        dialogue_step = 'AWAITING_REFLECTION',
        dialogue_active_participant_id = v_me.id,
        dialogue_focus_turn_id = v_opening_b.id
      where id = p_room_id;
    else
      update public.rooms set
        dialogue_revision = dialogue_revision + 1,
        dialogue_step = 'AWAITING_RESPONSE',
        dialogue_active_participant_id = v_focus.participant_id,
        dialogue_focus_turn_id = v_original.id
      where id = p_room_id;
    end if;
  else
    update public.rooms set
      dialogue_revision = dialogue_revision + 1,
      dialogue_round = dialogue_round + 1,
      dialogue_step = 'AWAITING_REFLECTION',
      dialogue_active_participant_id = v_other.id,
      dialogue_focus_turn_id = v_turn_id
    where id = p_room_id;
  end if;

  return jsonb_build_object(
    'turnId', v_turn_id,
    'revision', v_room.dialogue_revision + 1
  );
end;
$$;

create or replace function public.append_dialogue_summary_v2(
  p_room_id uuid,
  p_expected_revision bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_sequence bigint;
  v_turn_id uuid;
  v_content_hash text;
begin
  select room.* into v_room from public.rooms room
  where room.id = p_room_id and room.workflow_version = 2
  for update;
  if v_room.id is null or v_room.phase_v2 <> 'DIALOGUE'
     or v_room.dialogue_revision <> p_expected_revision then
    raise exception '沟通状态已经变化。' using errcode = '40001';
  end if;
  if (select count(*) from private.dialogue_turns turn
      where turn.room_id = p_room_id and turn.generation_no = v_room.dialogue_generation) >= 200 then
    raise exception '这次沟通记录已达到上限。' using errcode = '55000';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
	 or not p_payload ?& array['understood', 'different', 'nextQuestion']
     or p_payload - array['understood', 'different', 'nextQuestion'] <> '{}'::jsonb
     or exists (
       select 1 from jsonb_each_text(p_payload) field
       where char_length(field.value) not between 1 and 3000
     ) then
    raise exception '阶段总结格式无效。' using errcode = 'P0001';
  end if;
  select coalesce(max(turn.sequence_no), 0) + 1 into v_sequence
  from private.dialogue_turns turn where turn.room_id = p_room_id;
  v_content_hash := encode(
    extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex'
  );
  insert into private.dialogue_turns (
    room_id, generation_no, sequence_no, round_no, participant_id, turn_kind,
    reply_to_turn_id, payload, content_hash
  ) values (
    p_room_id, v_room.dialogue_generation, v_sequence, greatest(v_room.dialogue_round, 1), null,
    'AI_SUMMARY', v_room.dialogue_focus_turn_id, p_payload, v_content_hash
  ) returning id into v_turn_id;
  update public.rooms set dialogue_revision = dialogue_revision + 1 where id = p_room_id;
  return jsonb_build_object('turnId', v_turn_id, 'revision', v_room.dialogue_revision + 1);
end;
$$;

-- Include the current shared dialogue generation in consensus idempotency. A
-- retry with an unchanged timeline reuses the durable job; a later generation
-- can never receive a result produced from an older conversation.
create or replace function public.request_consensus_job_v2(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.rooms;
  v_requester_id uuid;
  v_expression_a public.expression_versions;
  v_expression_b public.expression_versions;
  v_dialogue_hash text;
  v_input_hash text;
  v_idempotency_key text;
  v_job private.ai_jobs;
begin
  select room.* into v_room
  from public.rooms room
  where room.id = p_room_id and room.workflow_version = 2
  for update;
  if v_room.id is null then
    raise exception '这个房间不支持当前流程。' using errcode = '55000';
  end if;

  select participant.id into v_requester_id
  from public.participants participant
  where participant.room_id = p_room_id and participant.user_id = v_user_id;
  if v_requester_id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;
  if v_room.phase_v2 = 'PAUSED' then
    raise exception '当前沟通已经暂停。' using errcode = '55000';
  end if;

  select expression.* into v_expression_a
  from public.participants participant
  join public.expression_versions expression on expression.id = participant.current_expression_id
  where participant.room_id = p_room_id and participant.role = 'A';
  select expression.* into v_expression_b
  from public.participants participant
  join public.expression_versions expression on expression.id = participant.current_expression_id
  where participant.room_id = p_room_id and participant.role = 'B';
  if v_expression_a.id is null or v_expression_b.id is null then
    raise exception '需要双方先分别确认自己的表达。' using errcode = '55000';
  end if;

  if v_room.current_understanding_result_id is not null and v_room.phase_v2 <> 'DIALOGUE'
     and exists (
       select 1 from public.shared_results result
       where result.id = v_room.current_understanding_result_id
         and result.expression_a_id = v_expression_a.id
         and result.expression_b_id = v_expression_b.id
     ) then
    return jsonb_build_object(
      'status', 'SUCCEEDED',
      'resultId', v_room.current_understanding_result_id
    );
  end if;

  select encode(extensions.digest(convert_to(coalesce(string_agg(
    turn.sequence_no::text || ':' || turn.content_hash,
    '|' order by turn.sequence_no
  ), ''), 'UTF8'), 'sha256'), 'hex') into v_dialogue_hash
  from private.dialogue_turns turn
  where turn.room_id = p_room_id and turn.generation_no = v_room.dialogue_generation;

  v_input_hash := encode(extensions.digest(convert_to(
    'CONSENSUS:' || v_expression_a.id::text || ':' || v_expression_a.content_hash || ':' ||
    v_expression_b.id::text || ':' || v_expression_b.content_hash || ':DIALOGUE:' ||
    v_room.dialogue_generation::text || ':' || v_dialogue_hash,
    'UTF8'
  ), 'sha256'), 'hex');
  v_idempotency_key := encode(extensions.digest(convert_to(
    v_input_hash || ':understanding-v2:consensus-dialogue-v2:0', 'UTF8'
  ), 'sha256'), 'hex');

  if not exists (select 1 from private.ai_jobs where idempotency_key = v_idempotency_key)
     and (
       select count(*) from private.ai_jobs job
       where job.requested_by_participant_id = v_requester_id
         and job.created_at > now() - interval '1 hour'
     ) >= 20 then
    raise exception 'AI 整理请求过于频繁，请稍后再试。' using errcode = 'P0003';
  end if;

  insert into private.ai_jobs (
    room_id, requested_by_participant_id, job_type,
    expression_a_id, expression_b_id, input_hash,
    pipeline_version, prompt_version, semantic_attempt, idempotency_key
  ) values (
    p_room_id, v_requester_id, 'CONSENSUS',
    v_expression_a.id, v_expression_b.id, v_input_hash,
    'understanding-v2', 'consensus-dialogue-v2', 0, v_idempotency_key
  ) on conflict (idempotency_key) do update
  set requested_by_participant_id = excluded.requested_by_participant_id
  returning * into v_job;

  select job.* into v_job
  from private.ai_jobs job
  where job.room_id = p_room_id
    and job.input_hash = v_input_hash
    and job.job_type in ('CONSENSUS', 'REVIEW_UNDERSTANDING')
    and job.status in ('QUEUED', 'PROCESSING', 'FAILED_RETRYABLE')
  order by job.created_at desc
  limit 1;
  if v_job.id is null then
    select job.* into v_job
    from private.ai_jobs job
    where job.room_id = p_room_id and job.input_hash = v_input_hash
      and job.job_type in ('CONSENSUS', 'REVIEW_UNDERSTANDING')
    order by job.created_at desc limit 1;
  end if;

  if v_job.status not in ('QUEUED', 'PROCESSING', 'FAILED_RETRYABLE') then
    return jsonb_build_object('jobId', v_job.id, 'status', v_job.status);
  end if;

  if v_room.state <> 'COMMON_VIEW_READY' then
    perform private.transition_room(
      p_room_id, v_room.state, 'COMMON_VIEW_READY',
      'BOTH_EXPRESSIONS_V2_READY', v_requester_id,
      jsonb_build_object(
        'expressionAId', v_expression_a.id,
        'expressionBId', v_expression_b.id
      )
    );
  end if;

  update public.rooms
  set phase_v2 = 'UNDERSTANDING_GENERATING'
  where id = p_room_id and phase_v2 <> 'PAUSED';

  return jsonb_build_object('jobId', v_job.id, 'status', v_job.status);
end;
$$;

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
	    'payload', turn.payload
  ) order by turn.sequence_no), '[]'::jsonb)
  from private.ai_jobs job
  join public.rooms room on room.id = job.room_id
  join lateral (
    select timeline.* from private.dialogue_turns timeline
    where timeline.room_id = job.room_id
      and timeline.generation_no = room.dialogue_generation
    order by timeline.sequence_no desc limit 80
	  ) turn on true
	  left join public.participants participant on participant.id = turn.participant_id
	  where job.id = p_job_id and turn.turn_kind <> 'AI_SUMMARY';
$$;

create or replace function private.require_dialogue_before_consensus_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.job_type = 'CONSENSUS'
     and exists (
       select 1 from private.dialogue_turns turn
       join public.rooms room on room.id = turn.room_id
       where turn.room_id = new.room_id and turn.generation_no = room.dialogue_generation
     )
     and not exists (
       select 1 from private.dialogue_turns turn
       join public.rooms room on room.id = turn.room_id
       where turn.room_id = new.room_id and turn.generation_no = room.dialogue_generation
         and turn.turn_kind = 'RESPONSE'
     ) then
    raise exception '双方至少完成一轮理解确认和回应后，才能整理阶段性共同理解。' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger ai_jobs_require_dialogue_before_consensus_v2
before insert on private.ai_jobs
for each row execute function private.require_dialogue_before_consensus_v2();

revoke all on function private.ensure_dialogue_v2(uuid) from public, anon, authenticated;
revoke all on function private.begin_dialogue_after_both_confirmed_v2() from public, anon, authenticated;
revoke all on function public.start_dialogue_v2(uuid) from public, anon, authenticated;
revoke all on function public.get_dialogue_state_v2(uuid) from public, anon, authenticated;
revoke all on function public.append_dialogue_turn_v2(uuid, bigint, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.append_dialogue_summary_v2(uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.internal_get_dialogue_context_v2(uuid) from public, anon, authenticated;
revoke all on function private.require_dialogue_before_consensus_v2() from public, anon, authenticated;

grant execute on function public.start_dialogue_v2(uuid) to authenticated;
grant execute on function public.get_dialogue_state_v2(uuid) to authenticated;
grant execute on function public.append_dialogue_turn_v2(uuid, bigint, text, uuid, jsonb) to authenticated;
grant execute on function public.append_dialogue_summary_v2(uuid, bigint, jsonb) to service_role;
grant execute on function public.internal_get_dialogue_context_v2(uuid) to service_role;
