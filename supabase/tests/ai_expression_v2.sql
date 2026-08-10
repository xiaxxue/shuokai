begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

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
  not has_function_privilege('authenticated', 'public.internal_claim_ai_job_v2(uuid,text)', 'EXECUTE'),
  'authenticated clients cannot claim private AI jobs'
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

update test_v2_context context
set expression_id = (confirmed->>'expressionId')::uuid
from (
  select public.confirm_expression_version_v2(
    room_id,
    revision,
    '{"mode":"NVC","schemaVersion":1,"observation":"周日仍未收到消息","feeling":"失望","need":"确定感","request":"变化时当天告诉我","uncertainties":[]}'::jsonb
  ) confirmed
  from test_v2_context
) result;

select ok(expression_id is not null, 'only the user-confirmed payload becomes a public expression version')
from test_v2_context;

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
  (select count(*) from public.expression_versions),
  1::bigint,
  'room member can read only the current confirmed expression'
);
select lives_ok(
  format('select public.pause_room_v2(%L::uuid)', room_id::text),
  'either participant can explicitly pause without generating consensus'
) from test_v2_context;

select * from finish();
rollback;
