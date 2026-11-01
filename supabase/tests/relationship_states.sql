begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('93000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'states-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('93000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'states-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

create temporary table states_test (room_id uuid);
grant all on states_test to authenticated;
create temporary table legacy_states_test (room_id uuid);
grant all on legacy_states_test to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into states_test select (public.create_room_v2('小雨')->>'roomId')::uuid;

select is(public.save_room_relationship_context_v3(room_id, 0, 0, 'DRAFT', 3::smallint,
  '{"relationshipType":"PARTNER"}'::jsonb,
  '{"relationshipStates":["REPAIR","BOUNDARY"],"useRelationshipStateAi":true}'::jsonb)
  #>'{mine,relationshipStates}', '["REPAIR","BOUNDARY"]'::jsonb,
  'draft stores both selected states') from states_test;
select ok(not (public.get_ai_memory_context_v3(room_id)#>'{onboarding,myContext}' ? 'relationshipStates'),
  'draft states do not enter private AI context') from states_test;

reset role;
insert into public.participants (room_id, user_id, role, display_name, public_progress_v2)
select room_id, '93000000-0000-4000-8000-000000000002', 'B', '小林', 'ORGANIZING' from states_test;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.save_room_relationship_context_v3(room_id, 1, 1, 'CONFIRMED', 4::smallint,
  '{"relationshipType":"PARTNER"}'::jsonb,
  '{"relationshipStates":["REPAIR","BOUNDARY"],"useRelationshipStateAi":true}'::jsonb)
  #>'{mine,relationshipStates}', '["REPAIR","BOUNDARY"]'::jsonb,
  'confirmed version keeps both selected states') from states_test;
select is(public.get_ai_memory_context_v3(room_id)#>>'{onboarding,myContext,relationshipStates}',
  'REPAIR,BOUNDARY', 'private AI gets both states after consent') from states_test;
select is(public.save_room_relationship_context_v3(room_id, 2, 2, 'CONFIRMED', 4::smallint,
  '{"relationshipType":"PARTNER"}'::jsonb,
  '{"relationshipStates":["REPAIR","BOUNDARY"],"useRelationshipStateAi":false}'::jsonb)
  #>'{mine,relationshipStates}', '["REPAIR","BOUNDARY"]'::jsonb,
  'turning off AI use preserves selected states') from states_test;
select ok(not (public.get_ai_memory_context_v3(room_id)#>'{onboarding,myContext}' ? 'relationshipStates'),
  'private AI omits states after consent is turned off') from states_test;

select set_config('request.jwt.claims', '{"sub":"93000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.get_room_relationship_context_v3(room_id)#>'{mine,relationshipStates}', '[]'::jsonb,
  'receiver cannot read inviter private states') from states_test;
select is(public.respond_room_relationship_context_v3(room_id, 0, 2, 'DIFFERENT', 4::smallint,
  'DIFFERENT', '{"relationshipType":"FRIEND","relationshipStates":["REPEATING","UNCERTAIN"]}'::jsonb)
  #>'{mine,relationshipStates}', '["REPEATING","UNCERTAIN"]'::jsonb,
  'receiver saves their own multiple states') from states_test;

select set_config('request.jwt.claims', '{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select ok(not (public.get_room_relationship_context_v3(room_id)->'recipientResponse' ? 'relationshipStates'),
  'recipient private states are not disclosed to inviter') from states_test;

insert into legacy_states_test select (public.create_room_v2('小雨')->>'roomId')::uuid;
select public.save_room_relationship_context_v1(room_id, 0, 0, 'DRAFT', 3::smallint,
  '{}'::jsonb, '{"relationshipState":"DECISION"}'::jsonb) from legacy_states_test;
select is(public.get_room_relationship_context_v3(room_id)#>'{mine,relationshipStates}', '["DECISION"]'::jsonb,
  'legacy single choice appears as one selected item') from legacy_states_test;

do $$
declare v_failure_summary text;
begin
  select string_agg(result.line, E'\n') into v_failure_summary from finish() as result(line);
  if v_failure_summary is not null then
    raise exception 'pgTAP failures:%', E'\n' || v_failure_summary;
  end if;
end;
$$;
rollback;
