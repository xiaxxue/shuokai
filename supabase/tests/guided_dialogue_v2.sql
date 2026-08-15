begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dialogue-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-0000-8000-000000000000', 'authenticated', 'authenticated', 'dialogue-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

create temporary table dialogue_context (
  room_id uuid, room_code text, a_revision bigint, b_revision bigint,
  opening_a uuid, opening_b uuid, reflection uuid, response uuid,
  consensus_job uuid, revision bigint
);
grant all on dialogue_context to authenticated, service_role;

select ok(has_function_privilege('authenticated', 'public.get_dialogue_state_v2(uuid)', 'EXECUTE'), 'members can read bounded dialogue state');
select ok(not has_table_privilege('authenticated', 'private.dialogue_turns', 'SELECT'), 'members cannot query private dialogue storage directly');
select ok(not has_function_privilege('authenticated', 'public.append_dialogue_summary_v2(uuid,bigint,jsonb)', 'EXECUTE'), 'clients cannot impersonate AI summaries');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into dialogue_context (room_id, room_code)
select (created->>'roomId')::uuid, created->>'code' from (select public.create_room_v2('A') created) item;
select public.set_room_goal_v2(room_id, '互相听懂') from dialogue_context;
update dialogue_context context set a_revision = (saved->>'revision')::bigint
from (select public.save_expression_workspace_v2(room_id, 0, '我希望被听见。', 'NVC', '{}'::jsonb) saved from dialogue_context) item;
select public.confirm_expression_version_v2(room_id, a_revision,
  '{"mode":"NVC","schemaVersion":1,"observation":"对方打断了我","feeling":"难过","need":"被听见","request":"先让我说完","uncertainties":[]}'::jsonb) from dialogue_context;

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.join_room_v2(room_code, 'B') from dialogue_context;
update dialogue_context context set b_revision = (saved->>'revision')::bigint
from (select public.save_expression_workspace_v2(room_id, 0, '我也想说明自己。', 'NVC', '{}'::jsonb) saved from dialogue_context) item;
select public.confirm_expression_version_v2(room_id, b_revision,
  '{"mode":"NVC","schemaVersion":1,"observation":"谈话持续很久","feeling":"疲惫","need":"喘息空间","request":"一次只谈十分钟","uncertainties":[]}'::jsonb) from dialogue_context;

update dialogue_context context set
  opening_a = (state->>'focusTurnId')::uuid,
  revision = (state->>'revision')::bigint
from (select public.get_dialogue_state_v2(room_id) state from dialogue_context) item;
select is((select phase_v2 from public.rooms room join dialogue_context context on room.id = context.room_id), 'DIALOGUE', 'both confirmed cards begin guided dialogue');
select is((public.get_dialogue_state_v2(room_id)->>'step'), 'AWAITING_REFLECTION', 'B first reflects A before responding') from dialogue_context;
select is((jsonb_array_length(public.get_dialogue_state_v2(room_id)->'turns')), 2, 'both confirmed opening cards seed the timeline') from dialogue_context;

update dialogue_context context set
  reflection = (submitted->>'turnId')::uuid,
  revision = (submitted->>'revision')::bigint
from (select public.append_dialogue_turn_v2(
  room_id, revision, 'REFLECTION', opening_a, '{"text":"我听见你希望先把话说完。"}'::jsonb
) submitted from dialogue_context) item;
select is((public.get_dialogue_state_v2(room_id)->>'step'), 'AWAITING_CONFIRMATION', 'a reflection waits for its author to confirm') from dialogue_context;
select throws_ok(
  $$select public.append_dialogue_turn_v2(room_id, revision, 'RESPONSE', reflection, '{"text":"跳过确认"}'::jsonb) from dialogue_context$$,
  '55000', null, 'the listener cannot skip the author confirmation'
);

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update dialogue_context context set revision = (submitted->>'revision')::bigint
from (select public.append_dialogue_turn_v2(
  room_id, revision, 'REFLECTION_CONFIRMATION', reflection,
  '{"decision":"NEEDS_CORRECTION","feedback":"我还希望语气不要带指责。"}'::jsonb
) submitted from dialogue_context) item;
select is((public.get_dialogue_state_v2(room_id)->>'activeRole'), 'B', 'a correction returns the turn to the listener') from dialogue_context;
select is((public.get_dialogue_state_v2(room_id)->>'step'), 'AWAITING_REFLECTION', 'the listener must reflect again after correction') from dialogue_context;

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update dialogue_context context set
  reflection = (submitted->>'turnId')::uuid,
  revision = (submitted->>'revision')::bigint
from (select public.append_dialogue_turn_v2(
  room_id, revision, 'REFLECTION', opening_a, '{"text":"我听见你希望说完，也希望不被指责。"}'::jsonb
) submitted from dialogue_context) item;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update dialogue_context context set revision = (submitted->>'revision')::bigint
from (select public.append_dialogue_turn_v2(
  room_id, revision, 'REFLECTION_CONFIRMATION', reflection,
  '{"decision":"ACCURATE","feedback":""}'::jsonb
) submitted from dialogue_context) item;
select is((public.get_dialogue_state_v2(room_id)->>'activeRole'), 'A', 'after A is understood, A reflects B') from dialogue_context;

select throws_ok(
  $$select public.append_dialogue_turn_v2(room_id, 1, 'REFLECTION', (public.get_dialogue_state_v2(room_id)->>'focusTurnId')::uuid, '{"text":"stale"}'::jsonb) from dialogue_context$$,
  '40001', null, 'stale revisions cannot overwrite newer dialogue progress'
);

update dialogue_context context set opening_b = (state->>'focusTurnId')::uuid
from (select public.get_dialogue_state_v2(room_id) state from dialogue_context) item;
update dialogue_context context set
  reflection = (submitted->>'turnId')::uuid,
  revision = (submitted->>'revision')::bigint
from (select public.append_dialogue_turn_v2(
  room_id, revision, 'REFLECTION', opening_b, '{"text":"我听见你需要喘息空间，也希望一次只谈一小段。"}'::jsonb
) submitted from dialogue_context) item;

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update dialogue_context context set revision = (submitted->>'revision')::bigint
from (select public.append_dialogue_turn_v2(
  room_id, revision, 'REFLECTION_CONFIRMATION', reflection,
  '{"decision":"ACCURATE","feedback":""}'::jsonb
) submitted from dialogue_context) item;

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update dialogue_context context set
  response = (submitted->>'turnId')::uuid,
  revision = (submitted->>'revision')::bigint
from (select public.append_dialogue_turn_v2(
  room_id, revision, 'RESPONSE', (public.get_dialogue_state_v2(room_id)->>'focusTurnId')::uuid,
  '{"text":"听见你需要喘息，我愿意一次只谈十分钟。"}'::jsonb
) submitted from dialogue_context) item;
select is((public.get_dialogue_state_v2(room_id)->>'activeRole'), 'B', 'after A responds, B must listen to that response') from dialogue_context;
select throws_ok(
  $$select public.request_consensus_job_v2(room_id) from dialogue_context$$,
  '55000', null, 'one-sided listening and response cannot produce mutual understanding'
);

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update dialogue_context context set
  reflection = (submitted->>'turnId')::uuid,
  revision = (submitted->>'revision')::bigint
from (select public.append_dialogue_turn_v2(
  room_id, revision, 'REFLECTION', response,
  '{"text":"我听见你愿意缩短每次谈话，也希望仍能把需要说完。"}'::jsonb
) submitted from dialogue_context) item;

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update dialogue_context context set revision = (submitted->>'revision')::bigint
from (select public.append_dialogue_turn_v2(
  room_id, revision, 'REFLECTION_CONFIRMATION', reflection,
  '{"decision":"ACCURATE","feedback":""}'::jsonb
) submitted from dialogue_context) item;

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update dialogue_context context set revision = (submitted->>'revision')::bigint
from (select public.append_dialogue_turn_v2(
  room_id, revision, 'RESPONSE', (public.get_dialogue_state_v2(room_id)->>'focusTurnId')::uuid,
  '{"text":"我愿意先让你说完，再提出暂停。"}'::jsonb
) submitted from dialogue_context) item;
update dialogue_context context set consensus_job = (requested->>'jobId')::uuid
from (select public.request_consensus_job_v2(room_id) requested from dialogue_context) item;
select ok(consensus_job is not null, 'consensus becomes available after both people are heard and respond') from dialogue_context;

set local role service_role;
select ok(
  (public.internal_get_dialogue_context_v2(consensus_job)->6->>'replyToSequence')::integer > 0,
  'worker context includes sequence-only reply links without exposing internal turn ids'
) from dialogue_context;

reset role;
select is((select count(*)::integer from private.dialogue_turns turn join dialogue_context context on turn.room_id = context.room_id), 12, 'the append-only timeline retains both complete listening-and-response loops');
select ok((select bool_and(content_hash ~ '^[a-f0-9]{64}$') from private.dialogue_turns turn join dialogue_context context on turn.room_id = context.room_id), 'every shared turn is integrity hashed');
select is((select count(*)::integer from private.dialogue_turns turn join dialogue_context context on turn.room_id = context.room_id where turn.turn_kind = 'AI_SUMMARY'), 0, 'no AI summary is fabricated before the worker creates one');

select * from finish();
rollback;
