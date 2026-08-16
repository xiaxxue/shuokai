begin;

create extension if not exists pgtap with schema extensions;
select plan(40);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('91000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'context-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('91000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'context-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('91000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'context-c@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

create temporary table relationship_context_test (room_id uuid, room_code text);
grant all on relationship_context_test to authenticated;

select ok(not has_table_privilege('authenticated', 'private.user_profiles', 'SELECT'), 'profiles cannot be selected directly');
select ok(not has_table_privilege('authenticated', 'private.room_relationship_contexts', 'SELECT'), 'shared context cannot be selected directly');
select ok(not has_table_privilege('authenticated', 'private.participant_relationship_contexts', 'SELECT'), 'private participant context cannot be selected directly');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.get_my_profile_v1()->>'status', 'MISSING', 'new user starts without a profile');
select is(
  public.save_my_profile_v1(0, ' 小　雨 ', 'SHORT', '简体中文', true, false)->>'displayName',
  '小 雨',
  'profile save normalizes a chosen display name'
);
select is(
  public.save_my_profile_v1(1, '小   雨', 'SHORT', '简体中文', true, false)->>'displayName',
  '小 雨',
  'profile save collapses consecutive ASCII spaces'
);
select throws_ok(
  $$select public.save_my_profile_v1(1, '旧版本', null, null, false, false)$$,
  '40001', null,
  'profile update rejects a stale revision'
);

insert into relationship_context_test (room_id, room_code)
select (created->>'roomId')::uuid, created->>'code'
from (select public.create_room_v2('小雨') created) item;

select is(
  public.save_room_relationship_context_v1(
    room_id, 0, 0, 'DRAFT', 2::smallint,
    '{"relationshipType":"PARTNER","relationshipOther":null,"durationRange":"Y1_3","interactionMode":"MOSTLY_REMOTE","useSharedAi":true}',
    '{"communicationPace":"IMMEDIATE","responsePreference":"EMPATHY_FIRST","planningStyle":"DEPENDS","relationshipState":"REPAIR","observedDifference":"我想马上说清","culturalContext":"","useCommunicationAi":true,"useRelationshipStateAi":true,"useDifferenceAi":true,"useCultureAi":false,"useInviterSharedAi":false}'
  )->'shared'->>'status',
  'DRAFT',
  'inviter can checkpoint a private draft'
) from relationship_context_test;
select is(public.get_ai_memory_context_v1(room_id)->'onboarding'->'sharedContext', '{}'::jsonb, 'draft shared context never enters inviter AI')
from relationship_context_test;
select is(public.get_ai_memory_context_v1(room_id)->'onboarding'->'myContext', '{}'::jsonb, 'draft private context never enters inviter AI')
from relationship_context_test;

reset role;
select throws_ok(
  format(
    $$select public.internal_save_ai_private_conversation_v2(%L::uuid, %L::uuid, 0, %L::jsonb, 'test', '[]'::jsonb, '{}'::jsonb)$$,
    room_id,
    '91000000-0000-4000-8000-000000000001',
    '{"profileRevision":2,"participantRevision":1,"sharedRevision":0,"consentRevision":3,"seenSharedRevision":1}'
  ),
  'P0C01', null,
  'atomic private AI save rejects a stale onboarding version'
) from relationship_context_test;
insert into public.participants (room_id, user_id, role, display_name, public_progress_v2)
select room_id, '91000000-0000-4000-8000-000000000002', 'B', '小林', 'ORGANIZING'
from relationship_context_test;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.get_room_relationship_context_v1(room_id)->'shared'->>'status', 'MISSING', 'receiver cannot read an inviter draft')
from relationship_context_test;
select throws_ok(
  format(
    $$select public.respond_room_relationship_context_v1(%L::uuid, 0, 0, 'CONFIRMED', 1::smallint, 'CONFIRMED', '{}'::jsonb)$$,
    room_id
  ),
  'P0C02', null,
  'receiver cannot confirm an inviter draft that is not visible'
) from relationship_context_test;

select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  public.save_room_relationship_context_v1(
    room_id, 1, 1, 'CONFIRMED', 4::smallint,
    '{"relationshipType":"PARTNER","relationshipOther":null,"durationRange":"Y1_3","interactionMode":"MOSTLY_REMOTE","useSharedAi":true}',
    '{"communicationPace":"IMMEDIATE","responsePreference":"EMPATHY_FIRST","planningStyle":"DEPENDS","relationshipState":"REPAIR","observedDifference":"我想马上说清","culturalContext":"","useCommunicationAi":true,"useRelationshipStateAi":true,"useDifferenceAi":true,"useCultureAi":false,"useInviterSharedAi":false}'
  )->'shared'->>'status',
  'CONFIRMED',
  'inviter confirms a shared relationship version'
) from relationship_context_test;
select is(public.get_room_relationship_context_v1(room_id)->'mine'->>'observedDifference', '我想马上说清', 'inviter reads only own private view')
from relationship_context_test;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.get_my_profile_v1()->>'status', 'MISSING', 'another account cannot read the inviter profile');
select is(public.get_room_relationship_context_v1(room_id)->'shared'->>'relationshipType', 'PARTNER', 'receiver can read the labeled inviter version')
from relationship_context_test;
select ok(
  not (public.get_room_relationship_context_v1(room_id)->'shared' ?| array['useSharedAi', 'draftStep', 'consentRevision']),
  'receiver never receives inviter private AI consent or draft metadata'
) from relationship_context_test;
select is(
  public.respond_room_relationship_context_v1(
    room_id, 0, 2, 'DRAFT', 2::smallint, 'DIFFERENT',
    '{"relationshipType":"FRIEND","relationshipOther":null,"durationRange":"Y3_7","interactionMode":"MIXED","communicationPace":null,"responsePreference":null,"planningStyle":null,"relationshipState":null,"observedDifference":"","culturalContext":"","useCommunicationAi":true,"useRelationshipStateAi":true,"useDifferenceAi":true,"useCultureAi":false,"useInviterSharedAi":false}'
  )->'mine'->>'status',
  'DRAFT',
  'receiver can checkpoint an unfinished response privately'
) from relationship_context_test;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.get_room_relationship_context_v1(room_id)->'recipientResponse'->>'status', 'PENDING', 'inviter sees receiver draft only as pending')
from relationship_context_test;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  public.respond_room_relationship_context_v1(
    room_id, 1, 2, 'DIFFERENT', 4::smallint, 'DIFFERENT',
    '{"relationshipType":"FRIEND","relationshipOther":null,"durationRange":"Y3_7","interactionMode":"MIXED","communicationPace":"PAUSE_FIRST","responsePreference":"EMPATHY_FIRST","planningStyle":"DEPENDS","relationshipState":"BOUNDARY","observedDifference":"我会先安静","culturalContext":"","useCommunicationAi":true,"useRelationshipStateAi":true,"useDifferenceAi":true,"useCultureAi":false,"useInviterSharedAi":false}'
  )->'mine'->>'status',
  'DIFFERENT',
  'receiver saves an independent version'
) from relationship_context_test;
select is(
  public.get_ai_memory_context_v1(room_id)->'onboarding'->'sharedContext',
  '{}'::jsonb,
  'receiver inviter-version AI consent defaults off'
) from relationship_context_test;

select is(
  public.respond_room_relationship_context_v1(
    room_id, 2, 2, 'DIFFERENT', 4::smallint, 'DIFFERENT',
    '{"relationshipType":"FRIEND","relationshipOther":null,"durationRange":"Y3_7","interactionMode":"MIXED","communicationPace":"PAUSE_FIRST","responsePreference":"EMPATHY_FIRST","planningStyle":"DEPENDS","relationshipState":"BOUNDARY","observedDifference":"我会先安静","culturalContext":"","useCommunicationAi":true,"useRelationshipStateAi":true,"useDifferenceAi":true,"useCultureAi":false,"useInviterSharedAi":true}'
  )->'mine'->>'useInviterSharedAi',
  'true',
  'receiver can explicitly enable private AI use of inviter version'
) from relationship_context_test;
select is(
  public.get_ai_memory_context_v1(room_id)->'onboarding'->'sharedContext'->>'source',
  'INVITER',
  'receiver private AI receives the inviter version only after consent'
) from relationship_context_test;

select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.get_room_relationship_context_v1(room_id)->'recipientResponse'->>'relationshipType', 'FRIEND', 'inviter sees the receiver shared different version')
from relationship_context_test;
select ok(not (public.get_room_relationship_context_v1(room_id)->'recipientResponse' ? 'observedDifference'), 'inviter never receives receiver private fields')
from relationship_context_test;
select is(
  public.save_room_relationship_context_v1(
    room_id, 2, 2, 'CONFIRMED', 4::smallint,
    '{"relationshipType":"PARTNER","relationshipOther":null,"durationRange":"Y1_3","interactionMode":"MOSTLY_REMOTE","useSharedAi":true}',
    '{"communicationPace":"IMMEDIATE","responsePreference":"EMPATHY_FIRST","planningStyle":"DEPENDS","relationshipState":"REPAIR","observedDifference":"只修改我的私人观察","culturalContext":"","useCommunicationAi":true,"useRelationshipStateAi":true,"useDifferenceAi":true,"useCultureAi":false,"useInviterSharedAi":false}'
  )->'shared'->>'revision',
  '2',
  'private-only update does not advance shared revision'
) from relationship_context_test;
select is(public.get_room_relationship_context_v1(room_id)->'recipientResponse'->>'status', 'DIFFERENT', 'private-only update preserves receiver confirmation')
from relationship_context_test;
select lives_ok(
  format(
    $$select public.save_room_relationship_context_v1(%L::uuid, 2, 3, 'CONFIRMED', 4::smallint, %L::jsonb, %L::jsonb)$$,
    room_id,
    '{"relationshipType":"PARTNER","relationshipOther":null,"durationRange":"Y3_7","interactionMode":"MIXED","useSharedAi":true}',
    '{"communicationPace":"IMMEDIATE","responsePreference":"EMPATHY_FIRST","planningStyle":"DEPENDS","relationshipState":"REPAIR","observedDifference":"我想马上说清","culturalContext":"","useCommunicationAi":true,"useRelationshipStateAi":true,"useDifferenceAi":true,"useCultureAi":false,"useInviterSharedAi":false}'
  ),
  'inviter can revise shared context'
) from relationship_context_test;
select is(public.get_room_relationship_context_v1(room_id)->'recipientResponse'->>'status', 'PENDING', 'shared revision invalidates receiver confirmation')
from relationship_context_test;

select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.get_ai_memory_context_v1(room_id)->'onboarding'->'sharedContext', '{}'::jsonb, 'stale receiver consent no longer sends inviter context to AI')
from relationship_context_test;

create temporary table legacy_relationship_context_test (room_id uuid);
grant all on legacy_relationship_context_test to authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into legacy_relationship_context_test (room_id)
select (public.create_room_v2('小雨')->>'roomId')::uuid;
reset role;
insert into public.participants (room_id, user_id, role, display_name, public_progress_v2)
select room_id, '91000000-0000-4000-8000-000000000002', 'B', '小林', 'ORGANIZING'
from legacy_relationship_context_test;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  public.get_room_relationship_context_v1(room_id)->'shared'->>'status',
  'MISSING',
  'legacy room exposes an explicit missing inviter context'
) from legacy_relationship_context_test;
select is(
  public.respond_room_relationship_context_v1(
    room_id, 0, 0, 'DRAFT', 2::smallint, 'DIFFERENT',
    '{"relationshipType":"FRIEND","relationshipOther":null,"durationRange":null,"interactionMode":null,"communicationPace":null,"responsePreference":null,"planningStyle":null,"relationshipState":null,"observedDifference":"","culturalContext":"","useCommunicationAi":true,"useRelationshipStateAi":true,"useDifferenceAi":true,"useCultureAi":false,"useInviterSharedAi":true}'
  )->'mine'->>'status',
  'DRAFT',
  'receiver can checkpoint a private version when legacy room has no inviter context'
) from legacy_relationship_context_test;
select is(
  public.respond_room_relationship_context_v1(
    room_id, 1, 0, 'DIFFERENT', 4::smallint, 'DIFFERENT',
    '{"relationshipType":"FRIEND","relationshipOther":null,"durationRange":null,"interactionMode":null,"communicationPace":"PAUSE_FIRST","responsePreference":null,"planningStyle":null,"relationshipState":null,"observedDifference":"","culturalContext":"","useCommunicationAi":true,"useRelationshipStateAi":true,"useDifferenceAi":true,"useCultureAi":false,"useInviterSharedAi":true}'
  )->'mine'->>'status',
  'DIFFERENT',
  'receiver can save an independent version when legacy room has no inviter context'
) from legacy_relationship_context_test;
select is(
  public.get_room_relationship_context_v1(room_id)->'mine'->>'useInviterSharedAi',
  'false',
  'missing inviter context cannot pre-authorize future private AI use'
) from legacy_relationship_context_test;
select is(
  public.respond_room_relationship_context_v1(
    room_id, 2, 0, 'SKIPPED', 4::smallint, 'SKIPPED', '{}'
  )->'mine'->>'status',
  'SKIPPED',
  'receiver can skip when legacy room has no inviter context'
) from legacy_relationship_context_test;
select is(
  public.get_room_relationship_context_v1(room_id)->'mine'->>'seenSharedRevision',
  '0',
  'legacy response remains bound to the visible missing revision'
) from legacy_relationship_context_test;

select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  format('select public.get_room_relationship_context_v1(%L::uuid)', room_id),
  '42501', null,
  'non-member cannot read room context'
) from relationship_context_test;

create temporary table missing_context_test (room_id uuid);
grant all on missing_context_test to authenticated;
insert into missing_context_test (room_id)
select (public.create_room_v2('小周')->>'roomId')::uuid;
select is(
  public.get_ai_memory_context_v1(room_id)->'onboarding'->'version',
  '{"profileRevision":0,"participantRevision":0,"sharedRevision":0,"consentRevision":0,"seenSharedRevision":0}'::jsonb,
  'AI version tuple represents context rows that do not exist yet'
) from missing_context_test;
select public.save_my_profile_v1(0, '小周', null, null, false, false);
reset role;
select throws_ok(
  format(
    $$select public.internal_save_ai_private_conversation_v2(%L::uuid, %L::uuid, 0, %L::jsonb, 'test', '[]'::jsonb, '{}'::jsonb)$$,
    room_id,
    '91000000-0000-4000-8000-000000000003',
    '{"profileRevision":0,"participantRevision":0,"sharedRevision":0,"consentRevision":0,"seenSharedRevision":0}'
  ),
  'P0C01', null,
  'atomic save rejects a first profile insert after an all-missing context read'
) from missing_context_test;

do $$
declare
  v_failure_summary text;
begin
  select string_agg(result.line, E'\n')
  into v_failure_summary
  from finish() as result(line);

  if v_failure_summary is not null then
    raise exception 'pgTAP failures:%', E'\n' || v_failure_summary;
  end if;
end;
$$;
rollback;
