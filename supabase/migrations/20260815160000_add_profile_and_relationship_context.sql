-- Private profile and per-room relationship context for the onboarding flow.
-- None of these tables are readable directly by clients or by the shared Agent.

create table private.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  response_length text check (response_length is null or response_length in ('SHORT', 'BALANCED', 'DETAILED')),
  language text check (language is null or char_length(language) between 1 and 30),
  use_response_length_ai boolean not null default true,
  use_language_ai boolean not null default true,
  revision bigint not null default 1 check (revision > 0),
  consent_revision bigint not null default 1 check (consent_revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.room_relationship_contexts (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  owner_participant_id uuid not null unique references public.participants(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'CONFIRMED', 'SKIPPED')),
  draft_step smallint not null default 1 check (draft_step between 1 and 4),
  relationship_type text check (relationship_type is null or relationship_type in (
    'PARTNER', 'MARRIED', 'FAMILY', 'FRIEND', 'COLLEAGUE', 'OTHER'
  )),
  relationship_other text check (relationship_other is null or char_length(relationship_other) between 1 and 30),
  duration_range text check (duration_range is null or duration_range in (
    'LT_3M', 'M3_12', 'Y1_3', 'Y3_7', 'Y7_PLUS', 'NA'
  )),
  interaction_mode text check (interaction_mode is null or interaction_mode in (
    'MOSTLY_IN_PERSON', 'MOSTLY_REMOTE', 'MIXED', 'RECENTLY_CHANGED', 'NA'
  )),
  use_shared_ai boolean not null default true,
  revision bigint not null default 1 check (revision > 0),
  consent_revision bigint not null default 1 check (consent_revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    relationship_type = 'OTHER' and relationship_other is not null
    or relationship_type is distinct from 'OTHER' and relationship_other is null
  )
);

create table private.participant_relationship_contexts (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'CONFIRMED', 'DIFFERENT', 'SKIPPED')),
  draft_step smallint not null default 1 check (draft_step between 1 and 4),
  draft_decision text check (draft_decision is null or draft_decision in ('CONFIRMED', 'DIFFERENT', 'SKIPPED')),
  seen_shared_revision bigint not null default 0 check (seen_shared_revision >= 0),
  relationship_type text check (relationship_type is null or relationship_type in (
    'PARTNER', 'MARRIED', 'FAMILY', 'FRIEND', 'COLLEAGUE', 'OTHER'
  )),
  relationship_other text check (relationship_other is null or char_length(relationship_other) between 1 and 30),
  duration_range text check (duration_range is null or duration_range in (
    'LT_3M', 'M3_12', 'Y1_3', 'Y3_7', 'Y7_PLUS', 'NA'
  )),
  interaction_mode text check (interaction_mode is null or interaction_mode in (
    'MOSTLY_IN_PERSON', 'MOSTLY_REMOTE', 'MIXED', 'RECENTLY_CHANGED', 'NA'
  )),
  communication_pace text check (communication_pace is null or communication_pace in ('IMMEDIATE', 'PAUSE_FIRST', 'DEPENDS')),
  response_preference text check (response_preference is null or response_preference in ('EMPATHY_FIRST', 'SOLUTIONS_FIRST', 'BOTH')),
  planning_style text check (planning_style is null or planning_style in ('PLAN_AHEAD', 'ADAPTIVE', 'DEPENDS')),
  relationship_state text check (relationship_state is null or relationship_state in (
    'REPAIR', 'REPEATING', 'DECISION', 'BOUNDARY', 'UNCERTAIN', 'PAUSE_END'
  )),
  observed_difference text check (observed_difference is null or char_length(observed_difference) <= 300),
  cultural_context text check (cultural_context is null or char_length(cultural_context) <= 300),
  use_communication_ai boolean not null default true,
  use_relationship_state_ai boolean not null default true,
  use_difference_ai boolean not null default true,
  use_culture_ai boolean not null default false,
  use_inviter_shared_ai boolean not null default false,
  revision bigint not null default 1 check (revision > 0),
  consent_revision bigint not null default 1 check (consent_revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, owner_user_id),
  check (
    relationship_type = 'OTHER' and relationship_other is not null
    or relationship_type is distinct from 'OTHER' and relationship_other is null
  )
);

create index room_relationship_contexts_owner_user_id_idx
on private.room_relationship_contexts (owner_user_id);
create index participant_relationship_contexts_room_id_idx
on private.participant_relationship_contexts (room_id);
create index participant_relationship_contexts_owner_user_id_idx
on private.participant_relationship_contexts (owner_user_id);

create trigger user_profiles_set_updated_at before update on private.user_profiles
for each row execute function private.set_updated_at();
create trigger room_relationship_contexts_set_updated_at before update on private.room_relationship_contexts
for each row execute function private.set_updated_at();
create trigger participant_relationship_contexts_set_updated_at before update on private.participant_relationship_contexts
for each row execute function private.set_updated_at();

alter table private.user_profiles enable row level security;
alter table private.room_relationship_contexts enable row level security;
alter table private.participant_relationship_contexts enable row level security;

revoke all on table private.user_profiles from public, anon, authenticated;
revoke all on table private.room_relationship_contexts from public, anon, authenticated;
revoke all on table private.participant_relationship_contexts from public, anon, authenticated;

create or replace function public.get_my_profile_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile private.user_profiles;
begin
  if v_user_id is null then
    raise exception '请先登录。' using errcode = '42501';
  end if;
  select * into v_profile from private.user_profiles where user_id = v_user_id;
  if v_profile.user_id is null then
    return jsonb_build_object('status', 'MISSING', 'revision', 0, 'consentRevision', 0);
  end if;
  return jsonb_build_object(
    'status', 'ACTIVE',
    'displayName', v_profile.display_name,
    'responseLength', v_profile.response_length,
    'language', v_profile.language,
    'useResponseLengthAi', v_profile.use_response_length_ai,
    'useLanguageAi', v_profile.use_language_ai,
    'revision', v_profile.revision,
    'consentRevision', v_profile.consent_revision,
    'updatedAt', v_profile.updated_at
  );
end;
$$;

create or replace function public.save_my_profile_v1(
  p_expected_revision bigint,
  p_display_name text,
  p_response_length text default null,
  p_language text default null,
  p_use_response_length_ai boolean default true,
  p_use_language_ai boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile private.user_profiles;
  v_name text := regexp_replace(btrim(normalize(p_display_name, NFKC)), '[[:space:]]+', ' ', 'g');
  v_language text := nullif(regexp_replace(btrim(normalize(coalesce(p_language, ''), NFKC)), '[[:space:]]+', ' ', 'g'), '');
begin
  if v_user_id is null then raise exception '请先登录。' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('shuokai-profile:' || v_user_id::text, 0));
  if char_length(v_name) not between 1 and 30 then
    raise exception '称呼需要 1 到 30 个字符。' using errcode = '22023';
  end if;
  if p_response_length is not null and p_response_length not in ('SHORT', 'BALANCED', 'DETAILED') then
    raise exception '回答长度偏好无效。' using errcode = '22023';
  end if;
  if v_language is not null and char_length(v_language) > 30 then
    raise exception '常用语言最多 30 个字符。' using errcode = '22023';
  end if;

  select * into v_profile from private.user_profiles where user_id = v_user_id for update;
  if v_profile.user_id is null then
    if p_expected_revision <> 0 then raise exception '个人资料刚刚在另一处更新。' using errcode = '40001'; end if;
    insert into private.user_profiles (
      user_id, display_name, response_length, language,
      use_response_length_ai, use_language_ai
    ) values (
      v_user_id, v_name, p_response_length, v_language,
      p_use_response_length_ai, p_use_language_ai
    ) returning * into v_profile;
  else
    if v_profile.revision <> p_expected_revision then
      raise exception '个人资料刚刚在另一处更新。' using errcode = '40001';
    end if;
    update private.user_profiles set
      display_name = v_name,
      response_length = p_response_length,
      language = v_language,
      use_response_length_ai = p_use_response_length_ai,
      use_language_ai = p_use_language_ai,
      revision = revision + 1,
      consent_revision = consent_revision + case when
        response_length is distinct from p_response_length or
        language is distinct from v_language or
        use_response_length_ai is distinct from p_use_response_length_ai or
        use_language_ai is distinct from p_use_language_ai
      then 1 else 0 end
    where user_id = v_user_id returning * into v_profile;
  end if;
  return public.get_my_profile_v1();
end;
$$;

create or replace function public.clear_my_profile_preferences_v1(p_expected_revision bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception '请先登录。' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('shuokai-profile:' || v_user_id::text, 0));
  update private.user_profiles set
    response_length = null,
    language = null,
    use_response_length_ai = false,
    use_language_ai = false,
    revision = revision + 1,
    consent_revision = consent_revision + 1
  where user_id = v_user_id and revision = p_expected_revision;
  if not found then raise exception '个人资料刚刚在另一处更新。' using errcode = '40001'; end if;
  return public.get_my_profile_v1();
end;
$$;

create or replace function private.require_context_participant_v1(p_room_id uuid)
returns public.participants
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participant public.participants;
begin
  select * into v_participant from public.participants
  where room_id = p_room_id and user_id = (select auth.uid());
  if v_participant.id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;
  return v_participant;
end;
$$;

create or replace function private.context_shared_json_v1(v_context private.room_relationship_contexts)
returns jsonb language sql immutable set search_path = '' as $$
  select case when v_context.room_id is null then
    jsonb_build_object('status', 'MISSING', 'revision', 0, 'consentRevision', 0)
  else jsonb_build_object(
    'status', v_context.status, 'draftStep', v_context.draft_step, 'revision', v_context.revision,
    'consentRevision', v_context.consent_revision,
    'relationshipType', v_context.relationship_type,
    'relationshipOther', v_context.relationship_other,
    'durationRange', v_context.duration_range,
    'interactionMode', v_context.interaction_mode,
    'useSharedAi', v_context.use_shared_ai,
    'updatedAt', v_context.updated_at
  ) end
$$;

create or replace function private.context_participant_json_v1(v_context private.participant_relationship_contexts)
returns jsonb language sql immutable set search_path = '' as $$
  select case when v_context.participant_id is null then
    jsonb_build_object('status', 'MISSING', 'revision', 0, 'consentRevision', 0, 'seenSharedRevision', 0)
  else jsonb_build_object(
    'status', v_context.status, 'draftStep', v_context.draft_step,
    'draftDecision', v_context.draft_decision, 'revision', v_context.revision,
    'consentRevision', v_context.consent_revision,
    'seenSharedRevision', v_context.seen_shared_revision,
    'relationshipType', v_context.relationship_type,
    'relationshipOther', v_context.relationship_other,
    'durationRange', v_context.duration_range,
    'interactionMode', v_context.interaction_mode,
    'communicationPace', v_context.communication_pace,
    'responsePreference', v_context.response_preference,
    'planningStyle', v_context.planning_style,
    'relationshipState', v_context.relationship_state,
    'observedDifference', v_context.observed_difference,
    'culturalContext', v_context.cultural_context,
    'useCommunicationAi', v_context.use_communication_ai,
    'useRelationshipStateAi', v_context.use_relationship_state_ai,
    'useDifferenceAi', v_context.use_difference_ai,
    'useCultureAi', v_context.use_culture_ai,
    'useInviterSharedAi', v_context.use_inviter_shared_ai,
    'updatedAt', v_context.updated_at
  ) end
$$;

create or replace function public.get_room_relationship_context_v1(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me public.participants := private.require_context_participant_v1(p_room_id);
  v_shared private.room_relationship_contexts;
  v_mine private.participant_relationship_contexts;
  v_recipient private.participant_relationship_contexts;
  v_response jsonb;
begin
  select * into v_shared from private.room_relationship_contexts
  where room_id = p_room_id
    and (v_me.role = 'A' or status in ('CONFIRMED', 'SKIPPED'));
  select * into v_mine from private.participant_relationship_contexts where participant_id = v_me.id;
  if v_me.role = 'A' then
    select context.* into v_recipient
    from private.participant_relationship_contexts context
    join public.participants participant on participant.id = context.participant_id
    where context.room_id = p_room_id and participant.role = 'B';
    v_response := case when v_recipient.participant_id is null then null else jsonb_build_object(
      'status', case when
        v_recipient.seen_shared_revision <> coalesce(v_shared.revision, 0) or
        v_recipient.status = 'DRAFT'
        then 'PENDING' else v_recipient.status end,
      'seenSharedRevision', v_recipient.seen_shared_revision,
      'relationshipType', case when v_recipient.status = 'DIFFERENT' then v_recipient.relationship_type end,
      'relationshipOther', case when v_recipient.status = 'DIFFERENT' then v_recipient.relationship_other end,
      'durationRange', case when v_recipient.status = 'DIFFERENT' then v_recipient.duration_range end,
      'interactionMode', case when v_recipient.status = 'DIFFERENT' then v_recipient.interaction_mode end
    ) end;
  end if;
  return jsonb_build_object(
    'role', v_me.role,
    'shared', case when v_me.role = 'A' or v_shared.room_id is null
      then private.context_shared_json_v1(v_shared)
      else jsonb_build_object(
        'status', v_shared.status,
        'revision', v_shared.revision,
        'relationshipType', v_shared.relationship_type,
        'relationshipOther', v_shared.relationship_other,
        'durationRange', v_shared.duration_range,
        'interactionMode', v_shared.interaction_mode,
        'updatedAt', v_shared.updated_at
      ) end,
    'mine', private.context_participant_json_v1(v_mine),
    'recipientResponse', v_response
  );
end;
$$;

create or replace function public.save_room_relationship_context_v1(
  p_room_id uuid,
  p_expected_shared_revision bigint,
  p_expected_private_revision bigint,
  p_status text,
  p_step smallint,
  p_shared jsonb,
  p_private jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.participants := private.require_context_participant_v1(p_room_id);
  v_shared private.room_relationship_contexts;
  v_mine private.participant_relationship_contexts;
  v_relationship_type text := nullif(p_shared->>'relationshipType', '');
  v_relationship_other text := nullif(regexp_replace(btrim(normalize(coalesce(p_shared->>'relationshipOther', ''), NFKC)), '[[:space:]]+', ' ', 'g'), '');
begin
  if v_me.role <> 'A' then raise exception '只有发起者可以编辑邀请背景。' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('shuokai-room-context:' || p_room_id::text, 0));
  if p_status not in ('DRAFT', 'CONFIRMED', 'SKIPPED') or p_step not between 1 and 4 or jsonb_typeof(p_shared) <> 'object' or jsonb_typeof(p_private) <> 'object' or
    octet_length(p_shared::text) > 4000 or octet_length(p_private::text) > 8000 then
    raise exception '关系背景参数无效。' using errcode = '22023';
  end if;
  if v_relationship_type is not null and v_relationship_type not in ('PARTNER','MARRIED','FAMILY','FRIEND','COLLEAGUE','OTHER') or
    (v_relationship_type = 'OTHER' and (v_relationship_other is null or char_length(v_relationship_other) > 30)) then
    raise exception '关系类型无效。' using errcode = '22023';
  end if;

  select * into v_shared from private.room_relationship_contexts where room_id = p_room_id for update;
  if v_shared.room_id is null then
    if p_expected_shared_revision <> 0 then raise exception '邀请背景刚刚在另一处更新。' using errcode = '40001'; end if;
    insert into private.room_relationship_contexts (
      room_id, owner_participant_id, owner_user_id, status, draft_step,
      relationship_type, relationship_other, duration_range, interaction_mode, use_shared_ai
    ) values (
      p_room_id, v_me.id, v_me.user_id, p_status, p_step,
      v_relationship_type, case when v_relationship_type = 'OTHER' then v_relationship_other end,
      nullif(p_shared->>'durationRange', ''), nullif(p_shared->>'interactionMode', ''),
      coalesce((p_shared->>'useSharedAi')::boolean, true)
    ) returning * into v_shared;
  else
    if v_shared.revision <> p_expected_shared_revision then raise exception '邀请背景刚刚在另一处更新。' using errcode = '40001'; end if;
    update private.room_relationship_contexts set
      status = p_status,
      draft_step = p_step,
      relationship_type = v_relationship_type,
      relationship_other = case when v_relationship_type = 'OTHER' then v_relationship_other end,
      duration_range = nullif(p_shared->>'durationRange', ''),
      interaction_mode = nullif(p_shared->>'interactionMode', ''),
      use_shared_ai = coalesce((p_shared->>'useSharedAi')::boolean, true),
      revision = revision + case when
        status is distinct from p_status or
        relationship_type is distinct from v_relationship_type or
        relationship_other is distinct from case when v_relationship_type = 'OTHER' then v_relationship_other end or
        duration_range is distinct from nullif(p_shared->>'durationRange', '') or
        interaction_mode is distinct from nullif(p_shared->>'interactionMode', '') or
        use_shared_ai is distinct from coalesce((p_shared->>'useSharedAi')::boolean, true)
      then 1 else 0 end,
      consent_revision = consent_revision + case when use_shared_ai is distinct from coalesce((p_shared->>'useSharedAi')::boolean, true) then 1 else 0 end
    where room_id = p_room_id returning * into v_shared;
  end if;

  select * into v_mine from private.participant_relationship_contexts where participant_id = v_me.id for update;
  if v_mine.participant_id is null then
    if p_expected_private_revision <> 0 then raise exception '私人背景刚刚在另一处更新。' using errcode = '40001'; end if;
    insert into private.participant_relationship_contexts (
      participant_id, room_id, owner_user_id, status, draft_step, seen_shared_revision,
      communication_pace, response_preference, planning_style, relationship_state,
      observed_difference, cultural_context, use_communication_ai,
      use_relationship_state_ai, use_difference_ai, use_culture_ai
    ) values (
      v_me.id, p_room_id, v_me.user_id, p_status, p_step, v_shared.revision,
      nullif(p_private->>'communicationPace',''), nullif(p_private->>'responsePreference',''),
      nullif(p_private->>'planningStyle',''), nullif(p_private->>'relationshipState',''),
      nullif(btrim(p_private->>'observedDifference'),''), nullif(btrim(p_private->>'culturalContext'),''),
      coalesce((p_private->>'useCommunicationAi')::boolean,true),
      coalesce((p_private->>'useRelationshipStateAi')::boolean,true),
      coalesce((p_private->>'useDifferenceAi')::boolean,true),
      coalesce((p_private->>'useCultureAi')::boolean,false)
    ) returning * into v_mine;
  else
    if v_mine.revision <> p_expected_private_revision then raise exception '私人背景刚刚在另一处更新。' using errcode = '40001'; end if;
    update private.participant_relationship_contexts set
      status = p_status, draft_step = p_step, seen_shared_revision = v_shared.revision,
      communication_pace = nullif(p_private->>'communicationPace',''),
      response_preference = nullif(p_private->>'responsePreference',''),
      planning_style = nullif(p_private->>'planningStyle',''),
      relationship_state = nullif(p_private->>'relationshipState',''),
      observed_difference = nullif(btrim(p_private->>'observedDifference'),''),
      cultural_context = nullif(btrim(p_private->>'culturalContext'),''),
      use_communication_ai = coalesce((p_private->>'useCommunicationAi')::boolean,true),
      use_relationship_state_ai = coalesce((p_private->>'useRelationshipStateAi')::boolean,true),
      use_difference_ai = coalesce((p_private->>'useDifferenceAi')::boolean,true),
      use_culture_ai = coalesce((p_private->>'useCultureAi')::boolean,false),
      revision = revision + 1,
      consent_revision = consent_revision + 1
    where participant_id = v_me.id returning * into v_mine;
  end if;
  return public.get_room_relationship_context_v1(p_room_id);
end;
$$;

create or replace function public.respond_room_relationship_context_v1(
  p_room_id uuid,
  p_expected_private_revision bigint,
  p_seen_shared_revision bigint,
  p_status text,
  p_step smallint,
  p_decision text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.participants := private.require_context_participant_v1(p_room_id);
  v_shared private.room_relationship_contexts;
  v_mine private.participant_relationship_contexts;
  v_relationship_type text := nullif(p_payload->>'relationshipType','');
  v_relationship_other text := nullif(regexp_replace(btrim(normalize(coalesce(p_payload->>'relationshipOther',''), NFKC)), '[[:space:]]+', ' ', 'g'), '');
begin
  if v_me.role <> 'B' then raise exception '只有受邀者可以确认邀请背景。' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('shuokai-room-context:' || p_room_id::text, 0));
  if p_status not in ('DRAFT','CONFIRMED','DIFFERENT','SKIPPED') or p_step not between 1 and 4 or
    (p_decision is not null and p_decision not in ('CONFIRMED','DIFFERENT','SKIPPED')) or
    (p_status <> 'DRAFT' and p_decision is distinct from p_status) or
    jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 10000 then
    raise exception '关系背景参数无效。' using errcode = '22023';
  end if;
  select * into v_shared from private.room_relationship_contexts where room_id = p_room_id;
  if v_shared.status is null or v_shared.status not in ('CONFIRMED', 'SKIPPED') then
    raise exception '邀请背景尚未确认，请稍后再试。' using errcode = '42501';
  end if;
  if coalesce(v_shared.revision, 0) <> p_seen_shared_revision then raise exception '邀请背景刚刚更新，请重新确认。' using errcode = '40001'; end if;
  if p_status = 'DIFFERENT' and v_relationship_type is null and nullif(p_payload->>'durationRange','') is null and nullif(p_payload->>'interactionMode','') is null then
    raise exception '请至少填写一项自己的版本，或选择暂不回答。' using errcode = '22023';
  end if;
  if v_relationship_type is not null and v_relationship_type not in ('PARTNER','MARRIED','FAMILY','FRIEND','COLLEAGUE','OTHER') or
    (v_relationship_type = 'OTHER' and (v_relationship_other is null or char_length(v_relationship_other) > 30)) then
    raise exception '关系类型无效。' using errcode = '22023';
  end if;

  select * into v_mine from private.participant_relationship_contexts where participant_id = v_me.id for update;
  if v_mine.participant_id is null then
    if p_expected_private_revision <> 0 then raise exception '你的选择刚刚在另一处更新。' using errcode = '40001'; end if;
    insert into private.participant_relationship_contexts (
      participant_id, room_id, owner_user_id, status, draft_step, draft_decision, seen_shared_revision,
      relationship_type, relationship_other, duration_range, interaction_mode,
      communication_pace, response_preference, planning_style, relationship_state,
      observed_difference, cultural_context, use_communication_ai, use_relationship_state_ai,
      use_difference_ai, use_culture_ai, use_inviter_shared_ai
    ) values (
      v_me.id, p_room_id, v_me.user_id, p_status, p_step, p_decision, p_seen_shared_revision,
      case when p_status = 'DIFFERENT' or p_status = 'DRAFT' and p_decision = 'DIFFERENT' then v_relationship_type end,
      case when (p_status = 'DIFFERENT' or p_status = 'DRAFT' and p_decision = 'DIFFERENT') and v_relationship_type = 'OTHER' then v_relationship_other end,
      case when p_status = 'DIFFERENT' or p_status = 'DRAFT' and p_decision = 'DIFFERENT' then nullif(p_payload->>'durationRange','') end,
      case when p_status = 'DIFFERENT' or p_status = 'DRAFT' and p_decision = 'DIFFERENT' then nullif(p_payload->>'interactionMode','') end,
      nullif(p_payload->>'communicationPace',''), nullif(p_payload->>'responsePreference',''),
      nullif(p_payload->>'planningStyle',''), nullif(p_payload->>'relationshipState',''),
      nullif(btrim(p_payload->>'observedDifference'),''), nullif(btrim(p_payload->>'culturalContext'),''),
      coalesce((p_payload->>'useCommunicationAi')::boolean,true),
      coalesce((p_payload->>'useRelationshipStateAi')::boolean,true),
      coalesce((p_payload->>'useDifferenceAi')::boolean,true),
      coalesce((p_payload->>'useCultureAi')::boolean,false),
      coalesce((p_payload->>'useInviterSharedAi')::boolean,false)
    ) returning * into v_mine;
  else
    if v_mine.revision <> p_expected_private_revision then raise exception '你的选择刚刚在另一处更新。' using errcode = '40001'; end if;
    update private.participant_relationship_contexts set
      status = p_status, draft_step = p_step, draft_decision = p_decision,
      seen_shared_revision = p_seen_shared_revision,
      relationship_type = case when p_status = 'DIFFERENT' or p_status = 'DRAFT' and p_decision = 'DIFFERENT' then v_relationship_type end,
      relationship_other = case when (p_status = 'DIFFERENT' or p_status = 'DRAFT' and p_decision = 'DIFFERENT') and v_relationship_type = 'OTHER' then v_relationship_other end,
      duration_range = case when p_status = 'DIFFERENT' or p_status = 'DRAFT' and p_decision = 'DIFFERENT' then nullif(p_payload->>'durationRange','') end,
      interaction_mode = case when p_status = 'DIFFERENT' or p_status = 'DRAFT' and p_decision = 'DIFFERENT' then nullif(p_payload->>'interactionMode','') end,
      communication_pace = nullif(p_payload->>'communicationPace',''),
      response_preference = nullif(p_payload->>'responsePreference',''),
      planning_style = nullif(p_payload->>'planningStyle',''),
      relationship_state = nullif(p_payload->>'relationshipState',''),
      observed_difference = nullif(btrim(p_payload->>'observedDifference'),''),
      cultural_context = nullif(btrim(p_payload->>'culturalContext'),''),
      use_communication_ai = coalesce((p_payload->>'useCommunicationAi')::boolean,true),
      use_relationship_state_ai = coalesce((p_payload->>'useRelationshipStateAi')::boolean,true),
      use_difference_ai = coalesce((p_payload->>'useDifferenceAi')::boolean,true),
      use_culture_ai = coalesce((p_payload->>'useCultureAi')::boolean,false),
      use_inviter_shared_ai = coalesce((p_payload->>'useInviterSharedAi')::boolean,false),
      revision = revision + 1, consent_revision = consent_revision + 1
    where participant_id = v_me.id returning * into v_mine;
  end if;
  return public.get_room_relationship_context_v1(p_room_id);
end;
$$;

create or replace function public.get_ai_memory_context_v1(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_me public.participants;
  v_other_user_id uuid;
  v_profile private.user_profiles;
  v_shared private.room_relationship_contexts;
  v_mine private.participant_relationship_contexts;
begin
  select * into v_me from public.participants where room_id = p_room_id and user_id = v_user_id;
  if v_me.id is null then raise exception '你不是这个房间的参与者。' using errcode = '42501'; end if;
  select participant.user_id into v_other_user_id from public.participants participant
  where participant.room_id = p_room_id and participant.user_id is distinct from v_user_id limit 1;
  select * into v_profile from private.user_profiles where user_id = v_user_id;
  select * into v_shared from private.room_relationship_contexts where room_id = p_room_id;
  select * into v_mine from private.participant_relationship_contexts where participant_id = v_me.id;

  return jsonb_build_object(
    'personal', coalesce((select jsonb_agg(jsonb_build_object('kind', memory.kind, 'content', memory.content) order by memory.updated_at desc)
      from (select * from private.ai_personal_memories where owner_user_id = v_user_id and status = 'CONFIRMED' order by updated_at desc limit 20) memory), '[]'::jsonb),
    'relationship', coalesce((select jsonb_agg(jsonb_build_object('kind', memory.kind, 'content', memory.content) order by memory.updated_at desc)
      from (select * from private.ai_relationship_memories where status = 'ACTIVE' and v_other_user_id is not null
        and party_low_user_id = least(v_user_id::text, v_other_user_id::text)::uuid
        and party_high_user_id = greatest(v_user_id::text, v_other_user_id::text)::uuid
        order by updated_at desc limit 20) memory), '[]'::jsonb),
    'onboarding', jsonb_build_object(
      'version', jsonb_build_object(
        'profileRevision', coalesce(v_profile.revision, 0),
        'participantRevision', coalesce(v_mine.revision, 0),
        'sharedRevision', coalesce(v_shared.revision, 0),
        'consentRevision', coalesce(v_profile.consent_revision, 0) + coalesce(v_mine.consent_revision, 0) + coalesce(v_shared.consent_revision, 0),
        'seenSharedRevision', coalesce(v_mine.seen_shared_revision, 0)
      ),
      'profile', jsonb_strip_nulls(jsonb_build_object(
        'responseLength', case when v_profile.use_response_length_ai then v_profile.response_length end,
        'language', case when v_profile.use_language_ai then v_profile.language end
      )),
      'myContext', jsonb_strip_nulls(jsonb_build_object(
        'communicationPace', case when v_mine.status <> 'DRAFT' and v_mine.use_communication_ai then v_mine.communication_pace end,
        'responsePreference', case when v_mine.status <> 'DRAFT' and v_mine.use_communication_ai then v_mine.response_preference end,
        'planningStyle', case when v_mine.status <> 'DRAFT' and v_mine.use_communication_ai then v_mine.planning_style end,
        'relationshipState', case when v_mine.status <> 'DRAFT' and v_mine.use_relationship_state_ai then v_mine.relationship_state end,
        'observedDifference', case when v_mine.status <> 'DRAFT' and v_mine.use_difference_ai then v_mine.observed_difference end,
        'culturalContext', case when v_mine.status <> 'DRAFT' and v_mine.use_culture_ai then v_mine.cultural_context end
      )),
      'sharedContext', case when
        v_shared.status = 'CONFIRMED' and (
          (v_me.role = 'A' and v_shared.use_shared_ai) or
          (v_me.role = 'B' and v_mine.use_inviter_shared_ai and v_mine.seen_shared_revision = v_shared.revision)
        )
      then jsonb_strip_nulls(jsonb_build_object(
        'source', case when v_me.role = 'A' then 'SELF' else 'INVITER' end,
        'relationshipType', v_shared.relationship_type,
        'durationRange', v_shared.duration_range,
        'interactionMode', v_shared.interaction_mode
      )) else '{}'::jsonb end
    )
  );
end;
$$;

create or replace function public.internal_save_ai_private_conversation_v2(
  p_room_id uuid,
  p_owner_user_id uuid,
  p_expected_revision bigint,
  p_expected_context_version jsonb,
  p_source_text text,
  p_turns jsonb,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant_id uuid;
  v_profile private.user_profiles;
  v_shared private.room_relationship_contexts;
  v_mine private.participant_relationship_contexts;
  v_current jsonb;
begin
  if p_room_id is null or p_owner_user_id is null then
    raise exception '私人对话参数无效。' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('shuokai-profile:' || p_owner_user_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('shuokai-room-context:' || p_room_id::text, 0));
  select participant.id into v_participant_id
  from public.participants participant
  where participant.room_id = p_room_id and participant.user_id = p_owner_user_id
  for share;
  if v_participant_id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;

  select * into v_profile from private.user_profiles
  where user_id = p_owner_user_id for share;
  select * into v_shared from private.room_relationship_contexts
  where room_id = p_room_id for share;
  select * into v_mine from private.participant_relationship_contexts
  where participant_id = v_participant_id for share;

  v_current := jsonb_build_object(
    'profileRevision', coalesce(v_profile.revision, 0),
    'participantRevision', coalesce(v_mine.revision, 0),
    'sharedRevision', coalesce(v_shared.revision, 0),
    'consentRevision', coalesce(v_profile.consent_revision, 0) + coalesce(v_mine.consent_revision, 0) + coalesce(v_shared.consent_revision, 0),
    'seenSharedRevision', coalesce(v_mine.seen_shared_revision, 0)
  );
  if jsonb_typeof(p_expected_context_version) <> 'object' or v_current <> p_expected_context_version then
    raise exception 'AI 可参考的资料刚刚发生了变化。' using errcode = 'P0C01';
  end if;

  return public.internal_save_ai_private_conversation_v1(
    p_room_id, p_owner_user_id, p_expected_revision,
    p_source_text, p_turns, p_result
  );
end;
$$;

revoke all on function public.get_my_profile_v1() from public, anon, authenticated;
revoke all on function public.save_my_profile_v1(bigint, text, text, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.clear_my_profile_preferences_v1(bigint) from public, anon, authenticated;
revoke all on function private.require_context_participant_v1(uuid) from public, anon, authenticated;
revoke all on function private.context_shared_json_v1(private.room_relationship_contexts) from public, anon, authenticated;
revoke all on function private.context_participant_json_v1(private.participant_relationship_contexts) from public, anon, authenticated;
revoke all on function public.get_room_relationship_context_v1(uuid) from public, anon, authenticated;
revoke all on function public.save_room_relationship_context_v1(uuid, bigint, bigint, text, smallint, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.respond_room_relationship_context_v1(uuid, bigint, bigint, text, smallint, text, jsonb) from public, anon, authenticated;
revoke all on function public.internal_save_ai_private_conversation_v2(uuid, uuid, bigint, jsonb, text, jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.get_my_profile_v1() to authenticated;
grant execute on function public.save_my_profile_v1(bigint, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.clear_my_profile_preferences_v1(bigint) to authenticated;
grant execute on function public.get_room_relationship_context_v1(uuid) to authenticated;
grant execute on function public.save_room_relationship_context_v1(uuid, bigint, bigint, text, smallint, jsonb, jsonb) to authenticated;
grant execute on function public.respond_room_relationship_context_v1(uuid, bigint, bigint, text, smallint, text, jsonb) to authenticated;
grant execute on function public.internal_save_ai_private_conversation_v2(uuid, uuid, bigint, jsonb, text, jsonb, jsonb) to service_role;
