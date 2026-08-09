begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

select ok(
  to_regprocedure('public.simulate_partner(uuid)') is null,
  'retired demo RPC is absent'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

create temporary table test_context (room_id uuid, room_code text);
grant all on table test_context to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into test_context (room_id, room_code)
select (created->>'roomId')::uuid, created->>'code'
from (select public.create_room('A') created) result;

select is((select count(*) from public.rooms), 1::bigint, 'creator can select their room');
select lives_ok(
  format('select public.set_room_goal(%L::uuid, %L)', room_id::text, '理解彼此'),
  'creator can move their own room through the state machine'
) from test_context;
select lives_ok(
  format('select public.save_private_draft(%L::uuid, %L, %L)', room_id::text, 'A 私人原话', 'A 澄清'),
  'creator can save a private draft'
) from test_context;
select lives_ok(
  format(
    'select public.approve_perspective(%L::uuid, %L, %L, %L, %L)',
    room_id::text, 'A 事实', 'A 理解', 'A 影响', 'A 请求'
  ),
  'creator can approve their own perspective'
) from test_context;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select is((select count(*) from public.rooms), 0::bigint, 'invitee cannot read a room before joining');
select lives_ok(
  format('select public.join_room(%L, %L)', room_code, 'B'),
  'invitee can join with the room code'
) from test_context;
select is((select count(*) from public.rooms), 1::bigint, 'invitee can read the room after joining');
select is((select count(*) from public.private_drafts), 0::bigint, 'invitee cannot read the creator private draft');
select is((select count(*) from public.perspectives), 0::bigint, 'invitee cannot read an approved perspective before the shared stage');

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select is((select count(*) from public.rooms), 0::bigint, 'unrelated user cannot read either participant room');

select * from finish();
rollback;
