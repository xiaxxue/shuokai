begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('92000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'contact-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('92000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'contact-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('92000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'contact-c@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

create temporary table contact_test (room_id uuid, history jsonb);
grant all on contact_test to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into contact_test (room_id, history)
select (public.create_room_v2('小雨')->>'roomId')::uuid,
  '{"currentProximity":"DISTANT","currentFrequency":"MONTHLY_OR_LESS","changed":"YES","previousProximity":"TOGETHER","previousFrequency":"DAILY","changeTime":"M1_6"}'::jsonb;

select is(
  public.save_room_relationship_context_v2(room_id, 0, 0, 'DRAFT', 2::smallint,
    jsonb_build_object('relationshipType','PARTNER','contactHistory',history,'useSharedAi',true), '{}'::jsonb)
    #>> '{shared,contactHistory,currentProximity}', 'DISTANT',
  'inviter draft retains current distance'
) from contact_test;
select is(public.get_ai_memory_context_v2(room_id)#>'{onboarding,sharedContext}', '{}'::jsonb,
  'draft contact history stays out of AI') from contact_test;

reset role;
insert into public.participants (room_id, user_id, role, display_name, public_progress_v2)
select room_id, '92000000-0000-4000-8000-000000000002', 'B', '小林', 'ORGANIZING' from contact_test;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  public.save_room_relationship_context_v2(room_id, 2, 1, 'CONFIRMED', 4::smallint,
    jsonb_build_object('relationshipType','PARTNER','contactHistory',history,'useSharedAi',true), '{}'::jsonb)
    #>> '{shared,contactHistory,previousProximity}', 'TOGETHER',
  'confirmed version retains earlier arrangement'
) from contact_test;
select is(public.get_room_relationship_context_v2(room_id)#>>'{mine,seenSharedRevision}',
  public.get_room_relationship_context_v2(room_id)#>>'{shared,revision}',
  'inviter private context tracks the latest shared revision') from contact_test;
select is(public.get_ai_memory_context_v2(room_id)#>>'{onboarding,sharedContext,changeTime}', 'M1_6',
  'inviter consent includes the change period in private AI context') from contact_test;

select set_config('request.jwt.claims', '{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.get_room_relationship_context_v2(room_id)#>>'{shared,contactHistory,currentFrequency}', 'MONTHLY_OR_LESS',
  'receiver sees the inviter-labeled version') from contact_test;
select is(public.get_ai_memory_context_v2(room_id)#>'{onboarding,sharedContext}', '{}'::jsonb,
  'receiver AI cannot read inviter history without consent') from contact_test;
select is(
  public.respond_room_relationship_context_v2(room_id, 0, 3, 'DIFFERENT', 4::smallint, 'DIFFERENT',
    jsonb_build_object('contactHistory', history))#>>'{mine,contactHistory,currentProximity}',
  'DISTANT', 'receiver can submit contact history as the only different field'
) from contact_test;
select is(public.get_room_relationship_context_v2(room_id)#>>'{mine,interactionMode}', null::text,
  'contact-only answer leaves no placeholder legacy answer') from contact_test;
select set_config('request.jwt.claims', '{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.get_room_relationship_context_v2(room_id)#>>'{recipientResponse,contactHistory,changeTime}', 'M1_6',
  'inviter can read the receiver version after submission') from contact_test;
select set_config('request.jwt.claims', '{"sub":"92000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(format('select public.get_room_relationship_context_v2(%L::uuid)', room_id),
  '42501', null, 'non-member cannot read contact history') from contact_test;

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
