begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm3-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm3-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

create temporary table test_m3_context (
  room_id uuid, room_code text, a_revision bigint, b_revision bigint,
  consensus_job_id uuid, review_job_id uuid, blocked_job_id uuid,
  result_id uuid, result_hash text
);
grant all on table test_m3_context to authenticated, service_role;

select ok(
  has_function_privilege('authenticated', 'public.get_understanding_status_v2(uuid)', 'EXECUTE'),
  'room members can use the bounded shared-understanding status RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.internal_complete_consensus_job_v2(uuid,text,text,jsonb,text,integer,integer,integer)', 'EXECUTE'),
  'authenticated clients cannot publish model candidates'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into test_m3_context (room_id, room_code)
select (created->>'roomId')::uuid, created->>'code'
from (select public.create_room_v2('A') created) result;
select public.set_room_goal_v2(room_id, '准确理解') from test_m3_context;
update test_m3_context context set a_revision = (saved->>'revision')::bigint
from (select public.save_expression_workspace_v2(
  room_id, 0, '周五说好确认计划，但周日仍没有消息。', 'NVC', '{}'::jsonb
) saved from test_m3_context) result;
select public.confirm_expression_version_v2(
  room_id, a_revision,
  '{"mode":"NVC","schemaVersion":1,"observation":"周日仍未收到消息","feeling":"失望","need":"确定感","request":"可能变化时当天告诉我","uncertainties":[]}'::jsonb
) from test_m3_context;

select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.join_room_v2(room_code, 'B') from test_m3_context;
update test_m3_context context set b_revision = (saved->>'revision')::bigint
from (select public.save_expression_workspace_v2(
  room_id, 0, '我想等计划确定后再发消息，避免反复变化。', 'FACT_DISPUTE', '{}'::jsonb
) saved from test_m3_context) result;
select public.confirm_expression_version_v2(
  room_id, b_revision,
  '{"mode":"FACT_DISPUTE","schemaVersion":1,"claim":"计划当时还没有确定","basis":"当时仍在等待确认","verificationRequest":"核对最终确认时间","uncertainties":[]}'::jsonb
) from test_m3_context;

-- M4 requires one complete guided exchange before a new shared understanding.
-- This older consensus-focused fixture seeds the already-tested response event.
reset role;
insert into private.dialogue_turns (
  room_id, generation_no, sequence_no, round_no, participant_id, turn_kind,
  reply_to_turn_id, payload, content_hash
)
select context.room_id, room.dialogue_generation, 3, 1, participant.id, 'RESPONSE', room.dialogue_focus_turn_id,
  '{"text":"我已经完成本轮回应。"}'::jsonb,
  encode(extensions.digest(convert_to('{"text":"我已经完成本轮回应。"}', 'UTF8'), 'sha256'), 'hex')
from test_m3_context context
join public.rooms room on room.id = context.room_id
join public.participants participant on participant.room_id = context.room_id and participant.role = 'B';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

update test_m3_context context set consensus_job_id = (requested->>'jobId')::uuid
from (select public.request_consensus_job_v2(room_id) requested from test_m3_context) result;
select ok(consensus_job_id is not null, 'either member can idempotently request consensus') from test_m3_context;
select is(
  (public.get_understanding_status_v2(room_id)->>'status'), 'QUEUED',
  'members see only the bounded durable job state'
) from test_m3_context;

set local role service_role;
select is(
  (public.internal_claim_ai_job_v2(consensus_job_id, 'm3-worker')->>'jobType'), 'CONSENSUS',
  'service worker receives the two confirmed expressions for the consensus stage'
) from test_m3_context;
update test_m3_context context set review_job_id = (completed->>'nextJobId')::uuid
from (select public.internal_complete_consensus_job_v2(
  consensus_job_id, 'm3-worker', 'test-model',
  '{"schemaVersion":1,"commonGround":[{"text":"双方都希望减少计划变化带来的不确定","sources":["A.need","B.verificationRequest"]}],"differences":[{"topic":"何时告知","sideA":"可能变化时","sideB":"确认变化后","sources":["A.request","B.claim"]}],"unverifiedFacts":[{"text":"计划最终确认时间","sources":["B.verificationRequest"]}],"boundaries":[],"candidateUnderstanding":{"text":"双方对通知时点的期待不同","sources":["A.request","B.claim"]},"coreQuestion":{"text":"怎样兼顾及时与准确","sources":["A.request","B.verificationRequest"]},"safetyDisposition":"ALLOW","safetyMessage":""}'::jsonb
) completed from test_m3_context) result;
select ok(review_job_id is not null, 'consensus completion creates an independent review job') from test_m3_context;
select is(
  (public.internal_claim_ai_job_v2(review_job_id, 'm3-reviewer')->>'jobType'), 'REVIEW_UNDERSTANDING',
  'the review stage is claimed separately from generation'
) from test_m3_context;
select public.internal_complete_understanding_review_v2(
  review_job_id, 'm3-reviewer', 'test-review-model',
  '{"verdict":"PASS","issues":[],"safetyDisposition":"ALLOW","safetyMessage":""}'::jsonb
) from test_m3_context;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update test_m3_context context
set result_id = (status->'result'->>'id')::uuid,
    result_hash = status->'result'->>'contentHash'
from (select public.get_understanding_status_v2(room_id) status from test_m3_context) result;
select ok(result_id is not null, 'only the reviewed candidate is published to the room') from test_m3_context;
select is(
  (select phase_v2 from public.rooms where id = room_id), 'UNDERSTANDING_CONFIRMING',
  'the room waits for two independent accuracy confirmations'
) from test_m3_context;

select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (public.confirm_understanding_v2(room_id, result_id, result_hash, 'ACCURATE', '')->>'bothConfirmed')::boolean,
  false,
  'one confirmation cannot advance the room'
) from test_m3_context;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (public.confirm_understanding_v2(room_id, result_id, result_hash, 'ACCURATE', '')->>'bothConfirmed')::boolean,
  true,
  'the same reviewed hash advances only after both users confirm accuracy'
) from test_m3_context;
select is(
  (select phase_v2 from public.rooms where id = room_id), 'ACTION_GENERATING',
  'accuracy confirmation remains distinct from agreeing to an action'
) from test_m3_context;

-- Test fixtures may seed private jobs as the database owner, but the worker
-- path itself must still be exercised only through the service-role RPCs.
reset role;
with inputs as (
  select context.room_id,
    participant_a.id requester_id,
    participant_a.current_expression_id expression_a_id,
    participant_b.current_expression_id expression_b_id,
    encode(extensions.digest(convert_to(context.room_id::text || ':blocked-generator', 'UTF8'), 'sha256'), 'hex') input_hash
  from test_m3_context context
  join public.participants participant_a on participant_a.room_id = context.room_id and participant_a.role = 'A'
  join public.participants participant_b on participant_b.room_id = context.room_id and participant_b.role = 'B'
), inserted as (
  insert into private.ai_jobs (
    room_id, requested_by_participant_id, job_type,
    expression_a_id, expression_b_id, input_hash,
    pipeline_version, prompt_version, semantic_attempt, idempotency_key
  )
  select room_id, requester_id, 'CONSENSUS', expression_a_id, expression_b_id, input_hash,
    'understanding-v1', 'blocked-safety-test', 0,
    encode(extensions.digest(convert_to(input_hash || ':job', 'UTF8'), 'sha256'), 'hex')
  from inputs
  returning id
)
update test_m3_context context set blocked_job_id = inserted.id from inserted;
set local role service_role;
select public.internal_claim_ai_job_v2(blocked_job_id, 'm3-safety-worker') from test_m3_context;
select is(
  (public.internal_complete_consensus_job_v2(
    blocked_job_id, 'm3-safety-worker', 'test-model',
    '{"schemaVersion":1,"commonGround":[],"differences":[],"unverifiedFacts":[],"boundaries":[],"candidateUnderstanding":{"text":"不得展示","sources":["A.need"]},"coreQuestion":{"text":"不得展示","sources":["A.need"]},"safetyDisposition":"BLOCK_SHARE","safetyMessage":"private"}'::jsonb
  )->>'status'),
  'FAILED_FINAL',
  'a generator safety block ends the chain before review'
) from test_m3_context;
reset role;
select ok(
  not exists (
    select 1 from private.ai_jobs review
    join test_m3_context context on true
    where review.parent_job_id = context.blocked_job_id
  ),
  'a blocked generator never creates a review job'
);
select is(
  (select room.current_understanding_result_id from public.rooms room join test_m3_context context on room.id = context.room_id),
  (select result_id from test_m3_context),
  'a blocked generator cannot replace the reviewed public result'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.reopen_expression_v2(room_id) from test_m3_context;
select public.confirm_expression_version_v2(
  room_id, a_revision,
  '{"mode":"NVC","schemaVersion":1,"observation":"周日仍未收到消息","feeling":"失望","need":"确定感","request":"可能变化时当天告诉我","uncertainties":[]}'::jsonb
) from test_m3_context;
select public.request_consensus_job_v2(room_id) from test_m3_context;
select is(
  (select room.state from public.rooms room join test_m3_context context on room.id = context.room_id),
  'COMMON_VIEW_READY',
  'reconfirming A while B remains confirmed repairs the restorable room state'
);

select * from finish();
rollback;
