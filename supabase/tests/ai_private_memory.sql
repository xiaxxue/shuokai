begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('80000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'memory-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('80000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'memory-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('80000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'memory-c@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

create temporary table memory_context (
  room_id uuid, room_code text, memory_id uuid, relationship_memory_id uuid, result_id uuid,
  participant_a_id uuid, participant_b_id uuid
);
grant all on memory_context to authenticated, service_role;

select ok(
  not has_table_privilege('authenticated', 'private.ai_private_messages', 'SELECT'),
  'authenticated clients cannot query raw private AI messages'
);
select ok(
  not has_table_privilege('authenticated', 'private.ai_personal_memories', 'SELECT'),
  'authenticated clients cannot query personal memory storage'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.internal_save_ai_private_conversation_v1(uuid,uuid,bigint,text,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot impersonate the AI persistence worker'
);
select ok(
  has_function_privilege('authenticated', 'public.get_ai_private_conversation_v1(uuid)', 'EXECUTE'),
  'authenticated members can restore their own bounded private conversation'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into memory_context (room_id, room_code)
select (created->>'roomId')::uuid, created->>'code'
from (select public.create_room_v2('A') created) item;
select public.set_room_goal_v2(room_id, '验证私人 AI 对话与记忆') from memory_context;

reset role;
insert into public.participants (room_id, user_id, role, display_name)
select room_id, '80000000-0000-4000-8000-000000000002', 'B', 'B'
from memory_context;
update memory_context context set
  participant_a_id = participant_a.id,
  participant_b_id = participant_b.id
from public.participants participant_a, public.participants participant_b
where participant_a.room_id = context.room_id and participant_a.role = 'A'
  and participant_b.room_id = context.room_id and participant_b.role = 'B';

set local role service_role;
select lives_ok(
  format(
    'select public.internal_save_ai_private_conversation_v1(%L::uuid,%L::uuid,0,%L,%L::jsonb,%L::jsonb)',
    room_id::text,
    '80000000-0000-4000-8000-000000000001',
    'A 只对 AI 说的原话',
    '[]',
    '{"ready":false,"question":"这件事对你有什么影响？","understanding":{},"safetyDisposition":"ALLOW","safetyMessage":"","conversationSummary":"A 正在补充一次沟通经历。","memoryCandidates":[]}'
  ),
  'service worker can durably save A private conversation'
)
from memory_context;

select lives_ok(
  format(
    'select public.internal_save_ai_private_conversation_v1(%L::uuid,%L::uuid,0,%L,%L::jsonb,%L::jsonb)',
    room_id::text,
    '80000000-0000-4000-8000-000000000002',
    'B 只对 AI 说的原话',
    '[{"question":"你在意什么？","answer":"计划变化时我希望提前知道。"}]',
    '{"ready":true,"question":"","understanding":{},"safetyDisposition":"ALLOW","safetyMessage":"","conversationSummary":"B 希望计划变化时被提前告知。","memoryCandidates":[{"kind":"PREFERENCE","content":"计划变化时，希望提前知道。","reason":"以后讨论计划变化时有用。","evidence":"计划变化时我希望提前知道。"}]}'
  ),
  'service worker can save B conversation and a consent proposal'
)
from memory_context;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  public.get_ai_private_conversation_v1(room_id)->>'sourceText',
  'A 只对 AI 说的原话',
  'A restores only A private source text'
) from memory_context;
select is(
  jsonb_array_length(public.get_ai_private_conversation_v1(room_id)->'turns'),
  0,
  'A cannot see B private question and answer history'
) from memory_context;

select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update memory_context context set memory_id = (
  public.get_ai_private_conversation_v1(room_id)->'memoryProposals'->0->>'id'
)::uuid;
select is(
  jsonb_array_length(public.get_ai_private_conversation_v1(room_id)->'turns'),
  1,
  'B restores B own private AI exchange'
) from memory_context;
select is(
  (public.list_my_ai_memories_v1()->'personal'->0->>'status'),
  'PROPOSED',
  'AI memory remains a proposal until B explicitly decides'
);
select public.decide_ai_personal_memory_v1(memory_id, 'CONFIRM', null) from memory_context;
select is(
  (public.get_ai_memory_context_v1(room_id)->'personal'->0->>'content'),
  '计划变化时，希望提前知道。',
  'only a confirmed personal memory enters future private AI context'
) from memory_context;

select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  jsonb_array_length(public.get_ai_memory_context_v1(room_id)->'personal'),
  0,
  'B confirmed personal memory never enters A private context'
) from memory_context;

select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  format('select public.get_ai_private_conversation_v1(%L::uuid)', room_id::text),
  '42501', null,
  'an unrelated user cannot restore either private conversation'
) from memory_context;

reset role;
insert into public.expression_versions (
  id, room_id, participant_id, owner_user_id, version, mode, payload, content_hash
)
select '81000000-0000-4000-8000-000000000001'::uuid, room_id, participant_a_id,
  '80000000-0000-4000-8000-000000000001'::uuid, 1, 'NVC',
  '{"observation":"计划变化时没有及时说明"}'::jsonb, repeat('a', 64)
from memory_context
union all
select '81000000-0000-4000-8000-000000000002'::uuid, room_id, participant_b_id,
  '80000000-0000-4000-8000-000000000002'::uuid, 1, 'NVC',
  '{"observation":"计划尚未确定"}'::jsonb, repeat('b', 64)
from memory_context;

insert into public.shared_results (
  id, room_id, result_type, version, expression_a_id, expression_b_id, payload, content_hash
)
select '82000000-0000-4000-8000-000000000001'::uuid, room_id, 'UNDERSTANDING', 1,
  '81000000-0000-4000-8000-000000000001'::uuid, '81000000-0000-4000-8000-000000000002'::uuid,
  '{"newUnderstanding":{"text":"双方确认分歧在于告知时机。"},"differences":[{"topic":"告知时机","sideA":"变化时告知","sideB":"确定后告知"}],"nextQuestion":{"text":"怎样兼顾及时与准确？"}}'::jsonb,
  repeat('c', 64)
from memory_context;

update memory_context set result_id = '82000000-0000-4000-8000-000000000001';
insert into public.result_confirmations (
  room_id, result_id, participant_id, version, decision, candidate_hash
)
select room_id, result_id, participant_a_id, 1, 'ACCURATE', repeat('c', 64) from memory_context;
select is(
  (select count(*) from private.ai_relationship_memories memory
    join memory_context context on memory.source_room_id = context.room_id),
  0::bigint,
  'one person confirming is not enough to create relationship memory'
);
insert into public.result_confirmations (
  room_id, result_id, participant_id, version, decision, candidate_hash
)
select room_id, result_id, participant_b_id, 1, 'ACCURATE', repeat('c', 64) from memory_context;
select ok(
  (select count(*) > 0 from private.ai_relationship_memories memory
    join memory_context context on memory.source_room_id = context.room_id
    where memory.status = 'PROPOSED'),
  'mutually confirmed shared understanding only proposes relationship memory'
);

update memory_context context set relationship_memory_id = (
  select memory.id from private.ai_relationship_memories memory
  where memory.source_result_id = context.result_id
  order by memory.created_at
  limit 1
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  jsonb_array_length(public.get_ai_memory_context_v1(room_id)->'relationship'),
  0,
  'accurate confirmation alone never enters future AI relationship context'
) from memory_context;
select is(
  public.decide_ai_relationship_memory_v1(relationship_memory_id, 'REMEMBER')->>'status',
  'PROPOSED',
  'one person consenting to memory still waits for the other person'
) from memory_context;
select is(
  jsonb_array_length(public.get_ai_memory_context_v1(room_id)->'relationship'),
  0,
  'one memory consent is not enough for future AI use'
) from memory_context;

select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  public.decide_ai_relationship_memory_v1(relationship_memory_id, 'REMEMBER')->>'status',
  'ACTIVE',
  'two explicit memory consents activate the relationship memory'
) from memory_context;
select ok(
  jsonb_array_length(public.get_ai_memory_context_v1(room_id)->'relationship') > 0,
  'both room members can use the explicitly remembered relationship memory'
) from memory_context;

select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.decide_ai_relationship_memory_v1(relationship_memory_id, 'STOP') from memory_context;
select is(
  jsonb_array_length(public.get_ai_memory_context_v1(room_id)->'relationship'),
  0,
  'either person can stop future use of a relationship memory'
) from memory_context;

reset role;
update public.result_confirmations confirmation
set invalidated_at = now()
from memory_context context
where confirmation.result_id = context.result_id
  and confirmation.participant_id = context.participant_a_id;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  format('select public.decide_ai_relationship_memory_v1(%L::uuid,%L)', relationship_memory_id::text, 'REMEMBER'),
  '55000', null,
  'A cannot reactivate memory after the shared source is invalidated'
) from memory_context;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  format('select public.decide_ai_relationship_memory_v1(%L::uuid,%L)', relationship_memory_id::text, 'REMEMBER'),
  '55000', null,
  'B cannot reactivate memory after the shared source is invalidated'
) from memory_context;

reset role;
select is(
  (select count(*) from private.ai_relationship_memories memory
    join memory_context context on memory.source_room_id = context.room_id
    where memory.status = 'ACTIVE'),
  0::bigint,
  'invalidating either confirmation revokes derived relationship memory'
);

select * from finish();
rollback;
