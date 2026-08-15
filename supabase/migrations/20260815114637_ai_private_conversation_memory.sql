-- Durable private AI conversations and consent-based memory.
-- Raw private messages stay in the private schema. Authenticated clients only
-- receive their own bounded data through security-definer RPCs.

create table private.ai_private_conversations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid not null unique references public.participants(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  source_text text not null default '' check (char_length(source_text) <= 12000),
  current_question text not null default '' check (char_length(current_question) <= 500),
  ready boolean not null default false,
  understanding jsonb not null default '{}'::jsonb check (jsonb_typeof(understanding) = 'object'),
  safety_disposition text not null default 'ALLOW' check (
    safety_disposition in ('ALLOW', 'WARN', 'BLOCK_SHARE', 'PAUSE')
  ),
  safety_message text not null default '' check (char_length(safety_message) <= 1000),
  summary text not null default '' check (char_length(summary) <= 600),
  last_request_hash text check (last_request_hash is null or last_request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_private_conversations_owner_timeline_idx
on private.ai_private_conversations (owner_user_id, updated_at desc);
create index ai_private_conversations_room_id_idx
on private.ai_private_conversations (room_id);

create trigger ai_private_conversations_set_updated_at
before update on private.ai_private_conversations
for each row execute function private.set_updated_at();

create table private.ai_private_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references private.ai_private_conversations(id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  author text not null check (author in ('USER', 'AI')),
  message_kind text not null check (message_kind in ('SOURCE', 'ANSWER', 'QUESTION', 'READY')),
  content text not null check (char_length(content) between 1 and 12000),
  created_at timestamptz not null default now(),
  unique (conversation_id, sequence_no)
);

create index ai_private_messages_conversation_timeline_idx
on private.ai_private_messages (conversation_id, sequence_no);

create table private.ai_personal_memories (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('NEED', 'TRIGGER', 'PREFERENCE', 'BOUNDARY', 'REPAIR_PATTERN')),
  content text not null check (char_length(content) between 1 and 600),
  reason text not null default '' check (char_length(reason) <= 600),
  source_conversation_id uuid references private.ai_private_conversations(id) on delete set null,
  status text not null default 'PROPOSED' check (
    status in ('PROPOSED', 'CONFIRMED', 'REJECTED', 'FORGOTTEN')
  ),
  dedupe_hash text not null check (dedupe_hash ~ '^[a-f0-9]{64}$'),
  confirmed_at timestamptz,
  forgotten_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, dedupe_hash)
);

create index ai_personal_memories_owner_status_idx
on private.ai_personal_memories (owner_user_id, status, updated_at desc);
create index ai_personal_memories_source_conversation_idx
on private.ai_personal_memories (source_conversation_id)
where source_conversation_id is not null;

create trigger ai_personal_memories_set_updated_at
before update on private.ai_personal_memories
for each row execute function private.set_updated_at();

create table private.ai_relationship_memories (
  id uuid primary key default gen_random_uuid(),
  source_room_id uuid not null references public.rooms(id) on delete cascade,
  source_result_id uuid not null references public.shared_results(id) on delete cascade,
  party_low_user_id uuid not null references auth.users(id) on delete cascade,
  party_high_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('NEW_UNDERSTANDING', 'RECURRING_ISSUE', 'OPEN_ISSUE')),
  content text not null check (char_length(content) between 1 and 1200),
  status text not null default 'PROPOSED' check (status in ('PROPOSED', 'ACTIVE', 'REVOKED')),
  dedupe_hash text not null check (dedupe_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (party_low_user_id::text < party_high_user_id::text),
  unique (source_result_id, dedupe_hash)
);

create index ai_relationship_memories_party_idx
on private.ai_relationship_memories (party_low_user_id, party_high_user_id, status, updated_at desc);
create index ai_relationship_memories_low_timeline_idx
on private.ai_relationship_memories (party_low_user_id, status, updated_at desc);
create index ai_relationship_memories_high_timeline_idx
on private.ai_relationship_memories (party_high_user_id, status, updated_at desc);
create index ai_relationship_memories_source_room_idx
on private.ai_relationship_memories (source_room_id);

create trigger ai_relationship_memories_set_updated_at
before update on private.ai_relationship_memories
for each row execute function private.set_updated_at();

create table private.ai_relationship_memory_decisions (
  memory_id uuid not null references private.ai_relationship_memories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null check (decision in ('REMEMBER', 'DECLINE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (memory_id, user_id)
);

create index ai_relationship_memory_decisions_user_idx
on private.ai_relationship_memory_decisions (user_id, updated_at desc);

create trigger ai_relationship_memory_decisions_set_updated_at
before update on private.ai_relationship_memory_decisions
for each row execute function private.set_updated_at();

alter table private.ai_private_conversations enable row level security;
alter table private.ai_private_messages enable row level security;
alter table private.ai_personal_memories enable row level security;
alter table private.ai_relationship_memories enable row level security;
alter table private.ai_relationship_memory_decisions enable row level security;

revoke all on table private.ai_private_conversations from public, anon, authenticated;
revoke all on table private.ai_private_messages from public, anon, authenticated;
revoke all on table private.ai_personal_memories from public, anon, authenticated;
revoke all on table private.ai_relationship_memories from public, anon, authenticated;
revoke all on table private.ai_relationship_memory_decisions from public, anon, authenticated;

create or replace function public.internal_save_ai_private_conversation_v1(
  p_room_id uuid,
  p_owner_user_id uuid,
  p_expected_revision bigint,
  p_source_text text,
  p_turns jsonb,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant_id uuid;
  v_conversation private.ai_private_conversations;
  v_source_text text := nullif(btrim(left(coalesce(p_source_text, ''), 12000)), '');
  v_turn jsonb;
  v_candidate jsonb;
  v_sequence integer := 1;
  v_request_hash text;
  v_question text;
  v_ready boolean;
  v_safety text;
  v_safety_message text;
  v_summary text;
  v_kind text;
  v_content text;
  v_reason text;
  v_memory_ids jsonb := '[]'::jsonb;
begin
  if v_source_text is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception '私人对话参数无效。';
  end if;
  if jsonb_typeof(p_turns) <> 'array' or jsonb_typeof(p_result) <> 'object' then
    raise exception '私人对话格式无效。';
  end if;

  v_ready := coalesce((p_result->>'ready')::boolean, false);
  v_question := btrim(left(coalesce(p_result->>'question', ''), 500));
  v_safety := coalesce(p_result->>'safetyDisposition', '');
  v_safety_message := btrim(left(coalesce(p_result->>'safetyMessage', ''), 1000));
  v_summary := btrim(left(coalesce(p_result->>'conversationSummary', ''), 600));
  if v_safety not in ('ALLOW', 'WARN', 'BLOCK_SHARE', 'PAUSE') or
     jsonb_typeof(coalesce(p_result->'understanding', '{}'::jsonb)) <> 'object' or
     jsonb_typeof(coalesce(p_result->'memoryCandidates', '[]'::jsonb)) <> 'array' or
     jsonb_array_length(coalesce(p_result->'memoryCandidates', '[]'::jsonb)) > 3 or
     (v_ready and v_question <> '') or
     (not v_ready and v_safety not in ('BLOCK_SHARE', 'PAUSE') and v_question = '') then
    raise exception 'AI 私人对话结果无效。';
  end if;

  for v_turn in select value from jsonb_array_elements(p_turns)
  loop
    if jsonb_typeof(v_turn) <> 'object' or
       nullif(btrim(left(coalesce(v_turn->>'question', ''), 500)), '') is null or
       nullif(btrim(left(coalesce(v_turn->>'answer', ''), 1200)), '') is null then
      raise exception '私人对话轮次无效。';
    end if;
  end loop;

  select participant.id into v_participant_id
  from public.participants participant
  join public.rooms room on room.id = participant.room_id
  where participant.room_id = p_room_id
    and participant.user_id = p_owner_user_id
    and room.workflow_version = 2;
  if v_participant_id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;

  v_request_hash := encode(extensions.digest(
    convert_to(v_source_text || E'\n' || p_turns::text || E'\n' || p_result::text, 'UTF8'),
    'sha256'
  ), 'hex');

  select * into v_conversation
  from private.ai_private_conversations
  where participant_id = v_participant_id
  for update;

  if v_conversation.id is null then
    if p_expected_revision <> 0 then
      raise exception '私人对话刚刚发生了变化，请重新读取。' using errcode = '40001';
    end if;
    insert into private.ai_private_conversations (
      room_id, participant_id, owner_user_id, revision, source_text,
      current_question, ready, understanding, safety_disposition,
      safety_message, summary, last_request_hash
    ) values (
      p_room_id, v_participant_id, p_owner_user_id, 1, v_source_text,
      v_question, v_ready, coalesce(p_result->'understanding', '{}'::jsonb), v_safety,
      v_safety_message, v_summary, v_request_hash
    ) returning * into v_conversation;
  elsif v_conversation.revision <> p_expected_revision then
    if v_conversation.last_request_hash = v_request_hash then
      return jsonb_build_object('revision', v_conversation.revision, 'memoryProposalIds', '[]'::jsonb);
    end if;
    raise exception '私人对话刚刚发生了变化，请重新读取。' using errcode = '40001';
  else
    update private.ai_private_conversations
    set revision = revision + 1,
        source_text = v_source_text,
        current_question = v_question,
        ready = v_ready,
        understanding = coalesce(p_result->'understanding', '{}'::jsonb),
        safety_disposition = v_safety,
        safety_message = v_safety_message,
        summary = v_summary,
        last_request_hash = v_request_hash
    where id = v_conversation.id
    returning * into v_conversation;
  end if;

  delete from private.ai_private_messages where conversation_id = v_conversation.id;
  insert into private.ai_private_messages (
    conversation_id, sequence_no, author, message_kind, content
  ) values (v_conversation.id, v_sequence, 'USER', 'SOURCE', v_source_text);

  for v_turn in select value from jsonb_array_elements(p_turns)
  loop
    v_sequence := v_sequence + 1;
    insert into private.ai_private_messages values (
      default, v_conversation.id, v_sequence, 'AI', 'QUESTION',
      btrim(left(v_turn->>'question', 500)), now()
    );
    v_sequence := v_sequence + 1;
    insert into private.ai_private_messages values (
      default, v_conversation.id, v_sequence, 'USER', 'ANSWER',
      btrim(left(v_turn->>'answer', 1200)), now()
    );
  end loop;
  v_sequence := v_sequence + 1;
  insert into private.ai_private_messages values (
    default, v_conversation.id, v_sequence, 'AI',
    case when v_ready then 'READY' else 'QUESTION' end,
    case when v_ready
      then '我已经理解到足够开始整理的程度了。'
      else v_question
    end,
    now()
  );

  if v_ready then
    for v_candidate in
      select value from jsonb_array_elements(coalesce(p_result->'memoryCandidates', '[]'::jsonb))
    loop
      v_kind := coalesce(v_candidate->>'kind', '');
      v_content := nullif(btrim(left(coalesce(v_candidate->>'content', ''), 600)), '');
      v_reason := btrim(left(coalesce(v_candidate->>'reason', ''), 600));
      if v_kind not in ('NEED', 'TRIGGER', 'PREFERENCE', 'BOUNDARY', 'REPAIR_PATTERN') or
         v_content is null then
        raise exception 'AI 记忆候选无效。';
      end if;
      insert into private.ai_personal_memories (
        owner_user_id, kind, content, reason, source_conversation_id, dedupe_hash
      ) values (
        p_owner_user_id, v_kind, v_content, v_reason, v_conversation.id,
        encode(extensions.digest(convert_to(v_kind || E'\n' || v_content, 'UTF8'), 'sha256'), 'hex')
      ) on conflict (owner_user_id, dedupe_hash) do nothing;
    end loop;
  end if;

  select coalesce(jsonb_agg(memory.id order by memory.created_at), '[]'::jsonb)
  into v_memory_ids
  from private.ai_personal_memories memory
  where memory.source_conversation_id = v_conversation.id
    and memory.owner_user_id = p_owner_user_id
    and memory.status = 'PROPOSED';

  return jsonb_build_object(
    'revision', v_conversation.revision,
    'memoryProposalIds', v_memory_ids
  );
end;
$$;

create or replace function public.get_ai_private_conversation_v1(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant_id uuid;
  v_conversation private.ai_private_conversations;
begin
  select participant.id into v_participant_id
  from public.participants participant
  where participant.room_id = p_room_id and participant.user_id = v_user_id;
  if v_participant_id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;

  select * into v_conversation
  from private.ai_private_conversations conversation
  where conversation.participant_id = v_participant_id
    and conversation.owner_user_id = v_user_id;
  if v_conversation.id is null then
    return jsonb_build_object(
      'revision', 0, 'sourceText', '', 'turns', '[]'::jsonb,
      'question', '', 'ready', false, 'understanding', null,
      'safetyDisposition', 'ALLOW', 'safetyMessage', '', 'summary', '',
      'memoryProposals', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'revision', v_conversation.revision,
    'sourceText', v_conversation.source_text,
    'turns', coalesce((
      select jsonb_agg(jsonb_build_object('question', question.content, 'answer', answer.content)
        order by question.sequence_no)
      from private.ai_private_messages question
      join private.ai_private_messages answer
        on answer.conversation_id = question.conversation_id
       and answer.sequence_no = question.sequence_no + 1
       and answer.message_kind = 'ANSWER'
      where question.conversation_id = v_conversation.id
        and question.message_kind = 'QUESTION'
    ), '[]'::jsonb),
    'question', v_conversation.current_question,
    'ready', v_conversation.ready,
    'understanding', v_conversation.understanding,
    'safetyDisposition', v_conversation.safety_disposition,
    'safetyMessage', v_conversation.safety_message,
    'summary', v_conversation.summary,
    'updatedAt', v_conversation.updated_at,
    'memoryProposals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', memory.id, 'kind', memory.kind, 'content', memory.content,
        'reason', memory.reason, 'status', memory.status
      ) order by memory.created_at)
      from private.ai_personal_memories memory
      where memory.source_conversation_id = v_conversation.id
        and memory.owner_user_id = v_user_id
        and memory.status = 'PROPOSED'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.list_my_ai_private_conversations_v1(p_limit integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(item.payload order by item.updated_at desc), '[]'::jsonb)
  from (
    select conversation.updated_at, jsonb_build_object(
      'roomId', conversation.room_id,
      'roomCode', room.code,
      'role', participant.role,
      'state', room.state,
      'workflowVersion', room.workflow_version,
      'phaseV2', room.phase_v2,
      'topic', coalesce(
        nullif(left(regexp_replace(btrim(case topic_expression.mode
          when 'NVC' then topic_expression.payload->>'observation'
          when 'FACT_DISPUTE' then topic_expression.payload->>'claim'
          when 'BOUNDARY' then topic_expression.payload->>'boundary'
          else null
        end), '[[:space:]]+', ' ', 'g'), 180), ''),
        nullif(left(conversation.summary, 180), ''),
        nullif(left(conversation.source_text, 180), ''),
        '还没有填写沟通主题'
      ),
      'summary', coalesce(nullif(conversation.summary, ''), left(conversation.source_text, 160)),
      'ready', conversation.ready,
      'updatedAt', conversation.updated_at
    ) payload
    from private.ai_private_conversations conversation
    join public.rooms room on room.id = conversation.room_id
    join public.participants participant on participant.id = conversation.participant_id
    left join lateral (
      select expression.mode, expression.payload
      from public.participants topic_participant
      join public.expression_versions expression on expression.id = topic_participant.current_expression_id
      where topic_participant.room_id = conversation.room_id
      order by case topic_participant.role when 'A' then 0 else 1 end
      limit 1
    ) topic_expression on true
    where conversation.owner_user_id = (select auth.uid())
      and participant.user_id = (select auth.uid())
    order by conversation.updated_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) item;
$$;

create or replace function public.list_my_ai_memories_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'personal', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', memory.id,
        'kind', memory.kind,
        'content', memory.content,
        'reason', memory.reason,
        'status', memory.status,
        'roomId', conversation.room_id,
        'roomCode', room.code,
        'topic', coalesce(
          nullif(left(conversation.summary, 180), ''),
          nullif(left(conversation.source_text, 180), ''),
          '未命名沟通'
        ),
        'updatedAt', memory.updated_at
      ) order by memory.updated_at desc)
      from (
        select * from private.ai_personal_memories
        where owner_user_id = (select auth.uid())
          and status in ('PROPOSED', 'CONFIRMED')
        order by updated_at desc
        limit 100
      ) memory
      left join private.ai_private_conversations conversation on conversation.id = memory.source_conversation_id
      left join public.rooms room on room.id = conversation.room_id
    ), '[]'::jsonb),
    'relationship', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', memory.id,
        'kind', memory.kind,
        'content', memory.content,
        'status', memory.status,
        'sourceValid', memory.source_valid,
        'myDecision', (
          select decision.decision
          from private.ai_relationship_memory_decisions decision
          where decision.memory_id = memory.id
            and decision.user_id = (select auth.uid())
        ),
        'partnerDecision', (
          select decision.decision
          from private.ai_relationship_memory_decisions decision
          where decision.memory_id = memory.id
            and decision.user_id <> (select auth.uid())
          limit 1
        ),
        'roomId', memory.source_room_id,
        'roomCode', room.code,
        'topic', coalesce(nullif(left(memory.content, 180), ''), '未命名沟通'),
        'updatedAt', memory.updated_at
      ) order by memory.updated_at desc)
      from (
        select stored_memory.*, (
          select count(distinct participant.user_id) = 2
          from public.result_confirmations confirmation
          join public.participants participant
            on participant.id = confirmation.participant_id
           and participant.room_id = stored_memory.source_room_id
          where confirmation.result_id = stored_memory.source_result_id
            and confirmation.decision = 'ACCURATE'
            and confirmation.invalidated_at is null
        ) source_valid
        from private.ai_relationship_memories stored_memory
        where (stored_memory.party_low_user_id = (select auth.uid())
            or stored_memory.party_high_user_id = (select auth.uid()))
        order by updated_at desc
        limit 100
      ) memory
      join public.rooms room on room.id = memory.source_room_id
    ), '[]'::jsonb)
  );
$$;

create or replace function public.decide_ai_personal_memory_v1(
  p_memory_id uuid,
  p_decision text,
  p_content text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_memory private.ai_personal_memories;
  v_content text;
  v_dedupe_hash text;
  v_existing_id uuid;
  v_return_id uuid;
begin
  if p_decision not in ('CONFIRM', 'REJECT', 'FORGET') then
    raise exception '请选择有效的记忆操作。';
  end if;
  select * into v_memory
  from private.ai_personal_memories memory
  where memory.id = p_memory_id and memory.owner_user_id = v_user_id
  for update;
  if v_memory.id is null then
    raise exception '这条记忆不存在或不属于你。' using errcode = '42501';
  end if;
  v_return_id := v_memory.id;

  if p_decision = 'CONFIRM' then
    if v_memory.status not in ('PROPOSED', 'CONFIRMED') then
      raise exception '这条记忆不能再确认。' using errcode = '55000';
    end if;
    v_content := nullif(btrim(left(coalesce(p_content, v_memory.content), 600)), '');
    if v_content is null then raise exception '记忆内容不能为空。'; end if;
    v_dedupe_hash := encode(extensions.digest(
      convert_to(v_memory.kind || E'\n' || v_content, 'UTF8'), 'sha256'
    ), 'hex');
    select memory.id into v_existing_id
    from private.ai_personal_memories memory
    where memory.owner_user_id = v_user_id
      and memory.dedupe_hash = v_dedupe_hash
      and memory.id <> v_memory.id
    for update;
    if v_existing_id is not null then
      update private.ai_personal_memories
      set content = v_content, status = 'CONFIRMED',
          confirmed_at = coalesce(confirmed_at, now()), forgotten_at = null
      where id = v_existing_id;
      update private.ai_personal_memories set status = 'REJECTED' where id = v_memory.id;
      v_return_id := v_existing_id;
    else
      update private.ai_personal_memories
      set content = v_content, dedupe_hash = v_dedupe_hash,
          status = 'CONFIRMED', confirmed_at = coalesce(confirmed_at, now()), forgotten_at = null
      where id = v_memory.id;
    end if;
  elsif p_decision = 'REJECT' then
    if v_memory.status <> 'PROPOSED' then
      raise exception '只有待确认的记忆可以仅用于本次。' using errcode = '55000';
    end if;
    update private.ai_personal_memories set status = 'REJECTED' where id = v_memory.id;
  else
    update private.ai_personal_memories
    set status = 'FORGOTTEN', forgotten_at = now()
    where id = v_memory.id;
  end if;

  return (
    select jsonb_build_object(
      'id', memory.id, 'kind', memory.kind, 'content', memory.content,
      'reason', memory.reason, 'status', memory.status, 'updatedAt', memory.updated_at
    ) from private.ai_personal_memories memory where memory.id = v_return_id
  );
end;
$$;

create or replace function public.decide_ai_relationship_memory_v1(
  p_memory_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_memory private.ai_relationship_memories;
  v_remember_count integer;
  v_decline_count integer;
  v_source_confirmation_count integer;
begin
  if p_decision not in ('REMEMBER', 'DECLINE', 'STOP') then
    raise exception '请选择有效的共同记忆操作。';
  end if;
  select * into v_memory
  from private.ai_relationship_memories memory
  where memory.id = p_memory_id
    and (memory.party_low_user_id = v_user_id or memory.party_high_user_id = v_user_id)
  for update;
  if v_memory.id is null then
    raise exception '这条共同记忆不存在或不属于你。' using errcode = '42501';
  end if;
  select count(distinct participant.user_id) into v_source_confirmation_count
  from public.result_confirmations confirmation
  join public.participants participant
    on participant.id = confirmation.participant_id
   and participant.room_id = v_memory.source_room_id
  where confirmation.result_id = v_memory.source_result_id
    and confirmation.decision = 'ACCURATE'
    and confirmation.invalidated_at is null;
  if v_source_confirmation_count <> 2 then
    raise exception '这条共同理解已经失效，不能再作为长期记忆。' using errcode = '55000';
  end if;

  insert into private.ai_relationship_memory_decisions (memory_id, user_id, decision)
  values (
    v_memory.id,
    v_user_id,
    case when p_decision = 'REMEMBER' then 'REMEMBER' else 'DECLINE' end
  )
  on conflict (memory_id, user_id) do update
  set decision = excluded.decision;

  select count(*) into v_remember_count
  from private.ai_relationship_memory_decisions decision
  where decision.memory_id = v_memory.id
    and decision.decision = 'REMEMBER';
  select count(*) into v_decline_count
  from private.ai_relationship_memory_decisions decision
  where decision.memory_id = v_memory.id
    and decision.decision = 'DECLINE';

  update private.ai_relationship_memories
  set status = case
    when v_decline_count > 0 then 'REVOKED'
    when v_remember_count = 2 then 'ACTIVE'
    else 'PROPOSED'
  end
  where id = v_memory.id
  returning * into v_memory;

  return jsonb_build_object(
    'id', v_memory.id,
    'kind', v_memory.kind,
    'content', v_memory.content,
    'status', v_memory.status,
    'myDecision', case when p_decision = 'REMEMBER' then 'REMEMBER' else 'DECLINE' end,
    'updatedAt', v_memory.updated_at
  );
end;
$$;

create or replace function public.get_ai_memory_context_v1(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_other_user_id uuid;
begin
  if not exists (
    select 1 from public.participants
    where room_id = p_room_id and user_id = v_user_id
  ) then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;
  select participant.user_id into v_other_user_id
  from public.participants participant
  where participant.room_id = p_room_id and participant.user_id is distinct from v_user_id
  limit 1;

  return jsonb_build_object(
    'personal', coalesce((
      select jsonb_agg(jsonb_build_object('kind', memory.kind, 'content', memory.content)
        order by memory.updated_at desc)
      from (select * from private.ai_personal_memories
        where owner_user_id = v_user_id and status = 'CONFIRMED'
        order by updated_at desc limit 20) memory
    ), '[]'::jsonb),
    'relationship', coalesce((
      select jsonb_agg(jsonb_build_object('kind', memory.kind, 'content', memory.content)
        order by memory.updated_at desc)
      from (select * from private.ai_relationship_memories
        where status = 'ACTIVE' and v_other_user_id is not null
          and party_low_user_id = least(v_user_id::text, v_other_user_id::text)::uuid
          and party_high_user_id = greatest(v_user_id::text, v_other_user_id::text)::uuid
        order by updated_at desc limit 20) memory
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function private.sync_confirmed_relationship_memories_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.shared_results;
  v_user_a uuid;
  v_user_b uuid;
  v_low uuid;
  v_high uuid;
  v_count integer;
  v_item record;
  v_kind text;
  v_content text;
  v_hash text;
begin
  select * into v_result from public.shared_results where id = new.result_id;
  if v_result.id is null or v_result.result_type <> 'UNDERSTANDING' then return new; end if;
  select user_id into v_user_a from public.participants where room_id = v_result.room_id and role = 'A';
  select user_id into v_user_b from public.participants where room_id = v_result.room_id and role = 'B';
  if v_user_a is null or v_user_b is null then return new; end if;
  v_low := least(v_user_a::text, v_user_b::text)::uuid;
  v_high := greatest(v_user_a::text, v_user_b::text)::uuid;

  select count(distinct participant.user_id) into v_count
  from public.result_confirmations confirmation
  join public.participants participant
    on participant.id = confirmation.participant_id
   and participant.room_id = v_result.room_id
  where confirmation.result_id = new.result_id
    and confirmation.decision = 'ACCURATE'
    and confirmation.invalidated_at is null;
  if v_count < 2 then
    update private.ai_relationship_memories
    set status = 'REVOKED'
    where source_result_id = new.result_id;
    delete from private.ai_relationship_memory_decisions decision
    using private.ai_relationship_memories memory
    where decision.memory_id = memory.id
      and memory.source_result_id = new.result_id;
    return new;
  end if;

  for v_item in
    select * from (
      select 'NEW_UNDERSTANDING'::text kind, v_result.payload#>>'{newUnderstanding,text}' content
      union all
      select 'RECURRING_ISSUE', concat_ws('；', item->>'topic', item->>'sideA', item->>'sideB')
      from jsonb_array_elements(coalesce(v_result.payload->'differences', '[]'::jsonb)) item
      union all
      select 'OPEN_ISSUE', v_result.payload#>>'{nextQuestion,text}'
    ) candidate
    where nullif(btrim(candidate.content), '') is not null
  loop
    v_kind := v_item.kind;
    v_content := left(v_item.content, 1200);
    v_hash := encode(extensions.digest(convert_to(v_kind || E'\n' || v_content, 'UTF8'), 'sha256'), 'hex');
    insert into private.ai_relationship_memories (
      source_room_id, source_result_id, party_low_user_id, party_high_user_id,
      kind, content, status, dedupe_hash
    ) values (
      v_result.room_id, new.result_id, v_low, v_high, v_kind, v_content, 'PROPOSED', v_hash
    ) on conflict (source_result_id, dedupe_hash) do update
      set content = excluded.content, status = 'PROPOSED';
  end loop;
  update private.ai_relationship_memories memory
  set status = case
    when exists (
      select 1 from private.ai_relationship_memory_decisions decision
      where decision.memory_id = memory.id and decision.decision = 'DECLINE'
    ) then 'REVOKED'
    when (
      select count(*) from private.ai_relationship_memory_decisions decision
      where decision.memory_id = memory.id and decision.decision = 'REMEMBER'
    ) = 2 then 'ACTIVE'
    else 'PROPOSED'
  end
  where memory.source_result_id = new.result_id;
  return new;
end;
$$;

create trigger result_confirmations_sync_relationship_memories_v1
after insert or update of decision, invalidated_at on public.result_confirmations
for each row execute function private.sync_confirmed_relationship_memories_v1();

revoke all on function public.internal_save_ai_private_conversation_v1(uuid, uuid, bigint, text, jsonb, jsonb)
from public, anon, authenticated;
revoke all on function public.get_ai_private_conversation_v1(uuid) from public, anon, authenticated;
revoke all on function public.list_my_ai_private_conversations_v1(integer) from public, anon, authenticated;
revoke all on function public.list_my_ai_memories_v1() from public, anon, authenticated;
revoke all on function public.decide_ai_personal_memory_v1(uuid, text, text) from public, anon, authenticated;
revoke all on function public.decide_ai_relationship_memory_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.get_ai_memory_context_v1(uuid) from public, anon, authenticated;
revoke all on function private.sync_confirmed_relationship_memories_v1() from public, anon, authenticated;

grant execute on function public.internal_save_ai_private_conversation_v1(uuid, uuid, bigint, text, jsonb, jsonb)
to service_role;
grant execute on function public.get_ai_private_conversation_v1(uuid) to authenticated;
grant execute on function public.list_my_ai_private_conversations_v1(integer) to authenticated;
grant execute on function public.list_my_ai_memories_v1() to authenticated;
grant execute on function public.decide_ai_personal_memory_v1(uuid, text, text) to authenticated;
grant execute on function public.decide_ai_relationship_memory_v1(uuid, text) to authenticated;
grant execute on function public.get_ai_memory_context_v1(uuid) to authenticated;
