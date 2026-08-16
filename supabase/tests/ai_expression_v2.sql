begin;

create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'v2-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'v2-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'v2-c@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

create temporary table test_v2_context (
  room_id uuid,
  room_code text,
  revision bigint,
  job_id uuid,
  expression_id uuid
);
grant all on table test_v2_context to authenticated, service_role;

select ok(
  not has_function_privilege('anon', 'public.create_room_v2(text)', 'EXECUTE'),
  'anonymous users cannot create v2 rooms'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.confirm_expression_version_v3(uuid,bigint,jsonb,text,text)',
    'EXECUTE'
  ),
  'anonymous users cannot confirm a persisted invitation summary'
);
select ok(
  not has_function_privilege('authenticated', 'public.internal_claim_ai_job_v2(uuid,text)', 'EXECUTE'),
  'authenticated clients cannot claim private AI jobs'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.expression_ai_input_hash(text,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot call the private AI input hash helper'
);
select isnt(
  private.expression_ai_input_hash(repeat('a', 64), 'NVC', '{}'::jsonb),
  private.expression_ai_input_hash(repeat('a', 64), 'NVC', '{"request":"当天告诉我"}'::jsonb),
  'manual draft changes produce a different model input hash'
);
select is(
  private.expression_ai_input_hash(repeat('a', 64), 'NVC', '{"need":"确定感","request":"当天告诉我"}'::jsonb),
  private.expression_ai_input_hash(repeat('a', 64), 'NVC', '{"request":"当天告诉我","need":"确定感"}'::jsonb),
  'json object key order does not change the model input hash'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into test_v2_context (room_id, room_code)
select (created->>'roomId')::uuid, created->>'code'
from (select public.create_room_v2('A') created) result;

select is(
  (select workflow_version from public.rooms where id = room_id),
  2::smallint,
  'v2 room is explicitly versioned'
) from test_v2_context;
select ok(
  not has_table_privilege('authenticated', 'private.participant_workspaces_v2', 'SELECT'),
  'private workspace table is not directly readable by authenticated clients'
);
select lives_ok(
  format('select public.set_room_goal_v2(%L::uuid, %L)', room_id::text, '准确理解'),
  'creator can start the v2 private expression phase'
) from test_v2_context;

update test_v2_context context
set revision = (saved->>'revision')::bigint
from (
  select public.save_expression_workspace_v2(
    room_id,
    0,
    '我们约好周五确认，但到周日我仍没有收到消息。',
    'NVC',
    '{}'::jsonb
  ) saved
  from test_v2_context
) result;

select is(revision, 1::bigint, 'workspace writes use optimistic revision numbers')
from test_v2_context;

update test_v2_context context
set job_id = (requested->>'jobId')::uuid
from (
  select public.request_understanding_job_v2(room_id, revision) requested
  from test_v2_context
) result;

select ok(job_id is not null, 'client receives an opaque AI job id') from test_v2_context;
select ok(
  not has_table_privilege('authenticated', 'private.ai_jobs', 'SELECT'),
  'private AI job table is not directly readable by authenticated clients'
);

set local role service_role;
select lives_ok(
  format('select public.internal_claim_ai_job_v2(%L::uuid, %L)', job_id::text, 'test-worker'),
  'service role can claim the queued job'
) from test_v2_context;

reset role;
select is(
  (select job.pipeline_version from private.ai_jobs job where job.id = context.job_id),
  'expression-dialogue-v2',
  'reflective expression jobs use the versioned dialogue pipeline'
) from test_v2_context context;
select is(
  (select job.prompt_version from private.ai_jobs job where job.id = context.job_id),
  'reflective-dialogue-v2',
  'reflective expression jobs record the prompt contract version'
) from test_v2_context context;

set local role service_role;
select lives_ok(
  format(
    'select public.internal_complete_ai_job_v2(%L::uuid, %L, %L, %L::jsonb)',
    job_id::text,
    'test-worker',
    'test-model',
    '{"mode":"NVC","fields":{"observation":"周日仍未收到消息","feeling":"失望","need":"确定感","request":"变化时当天告诉我"},"uncertainties":[],"safetyDisposition":"ALLOW","safetyMessage":""}'
  ),
  'service role can complete a valid structured result'
) from test_v2_context;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is(
  (public.get_ai_job_status_v2(job_id)->>'status'),
  'SUCCEEDED',
  'job owner sees a bounded status and result through the RPC'
) from test_v2_context;

select throws_ok(
  format(
    'select public.confirm_expression_version_v3(%L::uuid, %L, %L::jsonb, %L, %L)',
    room_id::text,
    revision,
    '{"mode":"NVC","schemaVersion":1,"observation":"周日仍未收到消息","feeling":"失望","need":"确定感","request":"变化时当天告诉我","uncertainties":[]}',
    '太短',
    '说明也太短'
  ),
  'P0001',
  '邀请标题需要 4—40 字，说明需要 20—300 字。',
  'v3 confirmation rejects an incomplete recipient-facing summary'
) from test_v2_context;

update test_v2_context context
set expression_id = (confirmed->>'expressionId')::uuid
from (
  select public.confirm_expression_version_v3(
    room_id,
    revision,
    '{"mode":"NVC","schemaVersion":1,"observation":"周日仍未收到消息","feeling":"失望","need":"确定感","request":"变化时当天告诉我","uncertainties":[]}'::jsonb,
    '关于周日仍未收到消息',
    '我们约好周五确认，但到周日仍没有消息。这份邀请希望你也讲讲自己记得的情况和期待。'
  ) confirmed
  from test_v2_context
) result;

select ok(expression_id is not null, 'only the user-confirmed payload becomes a public expression version')
from test_v2_context;
select is(
  (select schema_version from public.expression_versions where id = expression_id),
  2::smallint,
  'persisted invitation summaries use expression schema version 2'
) from test_v2_context;
select is(
  (select invitation_title from public.expression_versions where id = expression_id),
  '关于周日仍未收到消息',
  'the exact user-confirmed invitation title is stored with the expression version'
) from test_v2_context;
select is(
  (select invitation_summary from public.expression_versions where id = expression_id),
  '我们约好周五确认，但到周日仍没有消息。这份邀请希望你也讲讲自己记得的情况和期待。',
  'the exact user-confirmed invitation explanation is stored with the expression version'
) from test_v2_context;
select ok(
  (select invitation_source_hash ~ '^[a-f0-9]{64}$' from public.expression_versions where id = expression_id),
  'the stored summary is bound to a normalized event-source hash'
) from test_v2_context;
select lives_ok(
  format(
    'select public.confirm_expression_version_v3(%L::uuid, %L, %L::jsonb, %L, %L)',
    room_id::text,
    revision,
    '{"mode":"NVC","schemaVersion":1,"observation":"周日仍未收到消息","feeling":"失望","need":"确定感","request":"变化时当天告诉我","uncertainties":[]}',
    '关于周日仍未收到消息',
    '我们约好周五确认，但到周日仍没有消息。这份邀请希望你也讲讲自己记得的情况和期待。'
  ),
  'retrying the identical confirmed invitation is idempotent'
) from test_v2_context;
select throws_ok(
  format(
    'select public.confirm_expression_version_v3(%L::uuid, %L, %L::jsonb, %L, %L)',
    room_id::text,
    revision,
    '{"mode":"NVC","schemaVersion":1,"observation":"周日仍未收到消息","feeling":"失望","need":"确定感","request":"变化时当天告诉我","uncertainties":[]}',
    '关于另一件已经变化的事',
    '这是一段不同的邀请说明，不能悄悄覆盖已经由本人确认并分享出去的版本。'
  ),
  '40001',
  '确认版本已经发生变化，请刷新后重试。',
  'a confirmed invitation snapshot cannot be overwritten in place'
) from test_v2_context;

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select is(
  (select count(*) from public.expression_versions),
  0::bigint,
  'unrelated users cannot read confirmed expression versions'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format('select public.join_room_v2(%L, %L)', room_code, 'B'),
  'invitee can join the versioned room'
) from test_v2_context;
select is(
  (public.join_room_v2(room_code, 'B')->'invitationContext'->>'title'),
  '关于周日仍未收到消息',
  'the initial join response already contains the persisted invitation title'
) from test_v2_context;
select is(
  (public.get_room_snapshot(room_id)->'invitationContext'->>'summary'),
  '我们约好周五确认，但到周日仍没有消息。这份邀请希望你也讲讲自己记得的情况和期待。',
  'restoring a room returns the persisted invitation summary in the initial snapshot'
) from test_v2_context;
select ok(
  (
    (public.get_room_snapshot(room_id)->'invitationContext')
      - array['inviterName', 'topic', 'title', 'summary', 'confirmedSummary']
  ) = '{}'::jsonb,
  'prefetched invitation context exposes no private expression fields or internal metadata'
) from test_v2_context;
select is(
  (select count(*) from public.expression_versions),
  0::bigint,
  'invitee cannot read the inviter full expression before confirming their own version'
);
select is(
  (public.get_invitation_context_v3(room_id)->>'title'),
  '关于周日仍未收到消息',
  'invitee can read the bounded confirmed invitation through the dedicated RPC'
) from test_v2_context;
select ok(
  (
    public.get_invitation_context_v3(room_id)
      - array['inviterName', 'topic', 'title', 'summary', 'confirmedSummary']
  ) = '{}'::jsonb,
  'the invitation RPC exposes no private expression fields or internal metadata'
) from test_v2_context;
select lives_ok(
  format('select public.pause_room_v2(%L::uuid)', room_id::text),
  'either participant can explicitly pause without generating consensus'
) from test_v2_context;

select * from finish();
rollback;
