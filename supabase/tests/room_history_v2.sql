begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('70000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'history-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('70000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'history-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.rooms (
  id, code, state, goal, created_by, created_at, updated_at, expires_at,
  workflow_version, phase_v2, dialogue_round
) values
  ('71000000-0000-4000-8000-000000000001', 'HIST2AA', 'COMMON_VIEW_READY', '最近更新的沟通', '70000000-0000-4000-8000-000000000001', now() - interval '3 days', now() - interval '1 hour', now() + interval '10 days', 2, 'DIALOGUE', 2),
  ('71000000-0000-4000-8000-000000000002', 'HIST2AB', 'COMPLETED', '已经完成的沟通', '70000000-0000-4000-8000-000000000001', now() - interval '5 days', now() - interval '1 day', now() + interval '9 days', 2, 'COMPLETED', 3),
  ('71000000-0000-4000-8000-000000000003', 'HIST2AC', 'GOAL_SETTING', '其他人的沟通', '70000000-0000-4000-8000-000000000002', now() - interval '2 days', now() - interval '30 minutes', now() + interval '12 days', 2, 'SETUP', 0);

insert into public.participants (room_id, user_id, role, display_name) values
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'A', 'A'),
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', 'B', 'B'),
  ('71000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001', 'A', 'A'),
  ('71000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000002', 'A', 'B');

select ok(
  has_function_privilege('authenticated', 'public.list_my_rooms_v2(integer,timestamp with time zone,uuid)', 'EXECUTE'),
  'authenticated users can list their own room history'
);
select ok(
  not has_function_privilege('anon', 'public.list_my_rooms_v2(integer,timestamp with time zone,uuid)', 'EXECUTE'),
  'anonymous users cannot list room history'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  jsonb_array_length(public.list_my_rooms_v2(20, null, null)->'items'),
  2,
  'history only includes rooms where the caller is a participant'
);
select is(
  public.list_my_rooms_v2(20, null, null)->'items'->0->>'roomId',
  '71000000-0000-4000-8000-000000000001',
  'history is ordered by latest room activity'
);
select is(
  public.list_my_rooms_v2(20, null, null)->'items'->0->>'role',
  'A',
  'history reports the caller role without exposing another user id'
);
select is(
  public.list_my_rooms_v2(20, null, null)->'items'->0->>'phaseV2',
  'DIALOGUE',
  'history carries the authoritative workflow phase'
);
select ok(
  not (public.list_my_rooms_v2(20, null, null)->'items'->0 ? 'createdBy'),
  'history omits internal ownership identifiers'
);
select ok(
  (public.list_my_rooms_v2(1, null, null)->>'hasMore')::boolean
  and public.list_my_rooms_v2(1, null, null)->'nextCursor' is not null,
  'history returns a bounded pagination cursor'
);
select throws_ok(
  $$select public.list_my_rooms_v2(20, now(), null)$$,
  '22023', null,
  'history rejects incomplete cursors'
);

select * from finish();
rollback;
