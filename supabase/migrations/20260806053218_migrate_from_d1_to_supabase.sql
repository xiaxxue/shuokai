create schema if not exists private;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{7}$'),
  state text not null default 'GOAL_SETTING' check (
    state in (
      'GOAL_SETTING', 'A_DRAFTING', 'A_REVIEWING', 'WAITING_FOR_B',
      'B_DRAFTING', 'B_REVIEWING', 'COMMON_VIEW_READY',
      'AGREEMENT_PENDING', 'COMPLETED'
    )
  ),
  goal text check (goal is null or char_length(goal) <= 80),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('A', 'B')),
  display_name text not null check (char_length(display_name) between 1 and 60),
  is_simulated boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (room_id, role),
  unique (room_id, user_id),
  check ((is_simulated and user_id is null) or (not is_simulated and user_id is not null))
);

create table public.private_drafts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  transcript text not null check (char_length(transcript) between 1 and 12000),
  clarification text check (clarification is null or char_length(clarification) <= 3000),
  created_at timestamptz not null default now()
);

create table public.perspectives (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  fact text not null check (char_length(fact) between 1 and 1000),
  meaning text not null check (char_length(meaning) between 1 and 1000),
  impact text not null check (char_length(impact) between 1 and 1000),
  request text not null check (char_length(request) between 1 and 1000),
  approved_at timestamptz not null default now(),
  unique (room_id, participant_id, version)
);

create table public.shared_views (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  common_ground text not null check (char_length(common_ground) between 1 and 2000),
  disagreement text not null check (char_length(disagreement) between 1 and 2000),
  core_question text not null check (char_length(core_question) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms(id) on delete cascade,
  proposal text not null check (char_length(proposal) between 1 and 2000),
  review_at timestamptz not null,
  accepted_a boolean not null default false,
  accepted_b boolean not null default false,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.room_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  event_type text not null check (char_length(event_type) between 1 and 80),
  from_state text not null,
  to_state text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index participants_user_id_idx on public.participants (user_id);
create index participants_room_user_idx on public.participants (room_id, user_id);
create index private_drafts_owner_timeline_idx on public.private_drafts (owner_user_id, room_id, created_at desc);
create index private_drafts_room_id_idx on public.private_drafts (room_id);
create index private_drafts_participant_id_idx on public.private_drafts (participant_id);
create index perspectives_owner_timeline_idx on public.perspectives (owner_user_id, room_id, version desc);
create index perspectives_participant_id_idx on public.perspectives (participant_id);
create index perspectives_room_id_idx on public.perspectives (room_id);
create index room_events_room_timeline_idx on public.room_events (room_id, id desc);
create index room_events_participant_id_idx on public.room_events (participant_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function private.set_updated_at();

create or replace function private.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.participants
    where room_id = p_room_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function private.transition_room(
  p_room_id uuid,
  p_expected_state text,
  p_next_state text,
  p_event_type text,
  p_participant_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rooms
  set state = p_next_state,
      version = version + 1
  where id = p_room_id and state = p_expected_state;

  if not found then
    raise exception '房间刚刚发生了变化，请刷新后重试。' using errcode = '40001';
  end if;

  insert into public.room_events (
    room_id, participant_id, event_type, from_state, to_state, payload
  ) values (
    p_room_id, p_participant_id, p_event_type, p_expected_state, p_next_state, p_payload
  );

  return p_next_state;
end;
$$;

create or replace function private.create_shared_view(p_room_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.shared_views (
    room_id, common_ground, disagreement, core_question
  ) values (
    p_room_id,
    '双方都希望周末可以放松，也不想每次计划变化都变成一次争吵。',
    'A 希望一旦知道计划可能变化就尽早告知；B 希望在变化确定以后再给出明确通知。',
    '知道可能有变化时就应该告知，还是确定取消以后再告知？'
  )
  on conflict (room_id) do update
  set version = public.shared_views.version + 1,
      common_ground = excluded.common_ground,
      disagreement = excluded.disagreement,
      core_question = excluded.core_question,
      created_at = now();
$$;

create or replace function public.create_room(p_display_name text default 'Lin')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.rooms;
  v_participant public.participants;
  v_code text;
  v_attempt integer := 0;
  v_name text := coalesce(nullif(btrim(left(p_display_name, 60)), ''), 'Lin');
begin
  if v_user_id is null then
    raise exception '请先建立匿名会话。' using errcode = '42501';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := upper(translate(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7), '01', 'YZ'));
    begin
      insert into public.rooms (code, created_by)
      values (v_code, v_user_id)
      returning * into v_room;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then raise; end if;
    end;
  end loop;

  insert into public.participants (room_id, user_id, role, display_name)
  values (v_room.id, v_user_id, 'A', v_name)
  returning * into v_participant;

  insert into public.room_events (
    room_id, participant_id, event_type, from_state, to_state
  ) values (
    v_room.id, v_participant.id, 'ROOM_CREATED', 'GOAL_SETTING', 'GOAL_SETTING'
  );

  return jsonb_build_object(
    'roomId', v_room.id,
    'code', v_room.code,
    'role', v_participant.role,
    'state', v_room.state
  );
end;
$$;

create or replace function public.join_room(
  p_code text,
  p_display_name text default 'Jun'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.rooms;
  v_participant public.participants;
  v_name text := coalesce(nullif(btrim(left(p_display_name, 60)), ''), 'Jun');
begin
  if v_user_id is null then
    raise exception '请先建立匿名会话。' using errcode = '42501';
  end if;

  select * into v_room
  from public.rooms
  where code = upper(btrim(p_code)) and expires_at > now()
  for update;

  if v_room.id is null then
    raise exception '沟通房间不存在或已经失效。' using errcode = 'P0002';
  end if;

  select * into v_participant
  from public.participants
  where room_id = v_room.id and user_id = v_user_id;

  if v_participant.id is not null then
    return jsonb_build_object(
      'roomId', v_room.id,
      'code', v_room.code,
      'role', v_participant.role,
      'state', v_room.state
    );
  end if;

  if v_room.state <> 'WAITING_FOR_B' then
    raise exception '邀请尚未开放，或房间已经进入下一阶段。' using errcode = '55000';
  end if;

  if exists (select 1 from public.participants where room_id = v_room.id and role = 'B') then
    raise exception '这个房间已经有另一位参与者。' using errcode = '23505';
  end if;

  insert into public.participants (room_id, user_id, role, display_name)
  values (v_room.id, v_user_id, 'B', v_name)
  returning * into v_participant;

  perform private.transition_room(
    v_room.id, 'WAITING_FOR_B', 'B_DRAFTING', 'B_JOINED', v_participant.id
  );

  return jsonb_build_object(
    'roomId', v_room.id,
    'code', v_room.code,
    'role', v_participant.role,
    'state', 'B_DRAFTING'
  );
end;
$$;

create or replace function public.set_room_goal(p_room_id uuid, p_goal text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant public.participants;
  v_goal text := nullif(btrim(left(p_goal, 80)), '');
  v_state text;
begin
  select * into v_participant from public.participants
  where room_id = p_room_id and user_id = (select auth.uid());
  if v_participant.id is null or v_participant.role <> 'A' then
    raise exception '只有发起者可以设置目标。' using errcode = '42501';
  end if;
  if v_goal is null then raise exception '请选择本次沟通目标。'; end if;

  update public.rooms set goal = v_goal where id = p_room_id;
  v_state := private.transition_room(
    p_room_id, 'GOAL_SETTING', 'A_DRAFTING', 'GOAL_SELECTED', v_participant.id,
    jsonb_build_object('goal', v_goal)
  );
  return jsonb_build_object('state', v_state);
end;
$$;

create or replace function public.save_private_draft(
  p_room_id uuid,
  p_transcript text,
  p_clarification text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant public.participants;
  v_transcript text := nullif(btrim(left(p_transcript, 12000)), '');
  v_clarification text := nullif(btrim(left(coalesce(p_clarification, ''), 3000)), '');
  v_expected text;
  v_next text;
begin
  select * into v_participant from public.participants
  where room_id = p_room_id and user_id = v_user_id;
  if v_participant.id is null then raise exception '你不是这个房间的参与者。' using errcode = '42501'; end if;
  if v_transcript is null then raise exception '表达内容不能为空。'; end if;

  v_expected := case when v_participant.role = 'A' then 'A_DRAFTING' else 'B_DRAFTING' end;
  v_next := case when v_participant.role = 'A' then 'A_REVIEWING' else 'B_REVIEWING' end;

  insert into public.private_drafts (
    room_id, participant_id, owner_user_id, transcript, clarification
  ) values (
    p_room_id, v_participant.id, v_user_id, v_transcript, v_clarification
  );

  perform private.transition_room(
    p_room_id, v_expected, v_next, 'PRIVATE_DRAFT_SAVED', v_participant.id
  );
  return jsonb_build_object('state', v_next);
end;
$$;

create or replace function public.approve_perspective(
  p_room_id uuid,
  p_fact text,
  p_meaning text,
  p_impact text,
  p_request text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant public.participants;
  v_expected text;
  v_next text;
  v_version integer;
begin
  select * into v_participant from public.participants
  where room_id = p_room_id and user_id = v_user_id;
  if v_participant.id is null then raise exception '你不是这个房间的参与者。' using errcode = '42501'; end if;
  if nullif(btrim(p_fact), '') is null or nullif(btrim(p_meaning), '') is null
     or nullif(btrim(p_impact), '') is null or nullif(btrim(p_request), '') is null then
    raise exception '四张观点卡都需要由本人确认。';
  end if;

  v_expected := case when v_participant.role = 'A' then 'A_REVIEWING' else 'B_REVIEWING' end;
  v_next := case when v_participant.role = 'A' then 'WAITING_FOR_B' else 'COMMON_VIEW_READY' end;

  select coalesce(max(version), 0) + 1 into v_version
  from public.perspectives
  where room_id = p_room_id and participant_id = v_participant.id;

  insert into public.perspectives (
    room_id, participant_id, owner_user_id, version, fact, meaning, impact, request
  ) values (
    p_room_id, v_participant.id, v_user_id, v_version,
    left(btrim(p_fact), 1000), left(btrim(p_meaning), 1000),
    left(btrim(p_impact), 1000), left(btrim(p_request), 1000)
  );

  if v_participant.role = 'B' then perform private.create_shared_view(p_room_id); end if;
  perform private.transition_room(
    p_room_id, v_expected, v_next,
    v_participant.role || '_PERSPECTIVE_APPROVED', v_participant.id,
    jsonb_build_object('version', v_version)
  );
  return jsonb_build_object('state', v_next, 'version', v_version);
end;
$$;

create or replace function public.simulate_partner(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant public.participants;
  v_partner public.participants;
begin
  select * into v_participant from public.participants
  where room_id = p_room_id and user_id = (select auth.uid());
  if v_participant.id is null or v_participant.role <> 'A' then
    raise exception '只有发起者可以启动双人演示。' using errcode = '42501';
  end if;
  if (select state from public.rooms where id = p_room_id for update) <> 'WAITING_FOR_B' then
    raise exception '当前阶段不能启动双人演示。' using errcode = '55000';
  end if;

  insert into public.participants (room_id, user_id, role, display_name, is_simulated)
  values (p_room_id, null, 'B', 'Jun（演示）', true)
  returning * into v_partner;

  insert into public.perspectives (
    room_id, participant_id, owner_user_id, version, fact, meaning, impact, request
  ) values (
    p_room_id, v_partner.id, null, 1,
    '周六上午才确定身体状态不适合外出，并在确认后告诉了对方。',
    '你担心过早说“可能取消”会制造不必要的焦虑，也希望周末保留调整空间。',
    '在身体不舒服时仍感到需要立即解释清楚，压力变得更大。',
    '计划还不确定时可以先说明待定，但不希望被要求立刻给出完整解释。'
  );

  perform private.create_shared_view(p_room_id);
  perform private.transition_room(
    p_room_id, 'WAITING_FOR_B', 'COMMON_VIEW_READY',
    'B_PERSPECTIVE_APPROVED', v_partner.id, jsonb_build_object('simulated', true)
  );
  return jsonb_build_object('state', 'COMMON_VIEW_READY');
end;
$$;

create or replace function public.propose_agreement(
  p_room_id uuid,
  p_proposal text,
  p_review_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant public.participants;
  v_has_simulated_b boolean;
begin
  select * into v_participant from public.participants
  where room_id = p_room_id and user_id = (select auth.uid());
  if v_participant.id is null then raise exception '你不是这个房间的参与者。' using errcode = '42501'; end if;
  if nullif(btrim(p_proposal), '') is null then raise exception '约定内容不能为空。'; end if;

  select exists (
    select 1 from public.participants
    where room_id = p_room_id and role = 'B' and is_simulated
  ) into v_has_simulated_b;

  insert into public.agreements (room_id, proposal, review_at, accepted_b)
  values (p_room_id, left(btrim(p_proposal), 2000), p_review_at, v_has_simulated_b)
  on conflict (room_id) do update
  set proposal = excluded.proposal,
      review_at = excluded.review_at,
      accepted_a = false,
      accepted_b = excluded.accepted_b,
      activated_at = null,
      created_at = now();

  perform private.transition_room(
    p_room_id, 'COMMON_VIEW_READY', 'AGREEMENT_PENDING',
    'AGREEMENT_PROPOSED', v_participant.id
  );
  return jsonb_build_object('state', 'AGREEMENT_PENDING');
end;
$$;

create or replace function public.accept_agreement(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant public.participants;
  v_agreement public.agreements;
begin
  select * into v_participant from public.participants
  where room_id = p_room_id and user_id = (select auth.uid());
  if v_participant.id is null then raise exception '你不是这个房间的参与者。' using errcode = '42501'; end if;

  if v_participant.role = 'A' then
    update public.agreements set accepted_a = true where room_id = p_room_id returning * into v_agreement;
  else
    update public.agreements set accepted_b = true where room_id = p_room_id returning * into v_agreement;
  end if;
  if v_agreement.id is null then raise exception '还没有可以确认的约定。' using errcode = 'P0002'; end if;

  if v_agreement.accepted_a and v_agreement.accepted_b then
    update public.agreements set activated_at = now() where id = v_agreement.id;
    perform private.transition_room(
      p_room_id, 'AGREEMENT_PENDING', 'COMPLETED',
      'AGREEMENT_ACTIVATED', v_participant.id
    );
    return jsonb_build_object('state', 'COMPLETED', 'activated', true);
  end if;

  insert into public.room_events (
    room_id, participant_id, event_type, from_state, to_state
  ) values (
    p_room_id, v_participant.id,
    v_participant.role || '_AGREEMENT_ACCEPTED',
    'AGREEMENT_PENDING', 'AGREEMENT_PENDING'
  );
  return jsonb_build_object('state', 'AGREEMENT_PENDING', 'activated', false);
end;
$$;

create or replace function public.get_room_snapshot(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.rooms;
  v_participant public.participants;
  v_is_shared boolean;
begin
  select * into v_participant from public.participants
  where room_id = p_room_id and user_id = v_user_id;
  if v_participant.id is null then raise exception '你不是这个房间的参与者。' using errcode = '42501'; end if;
  select * into v_room from public.rooms where id = p_room_id;
  v_is_shared := v_room.state in ('COMMON_VIEW_READY', 'AGREEMENT_PENDING', 'COMPLETED');

  return jsonb_build_object(
    'room', to_jsonb(v_room) - 'created_by',
    'me', jsonb_build_object(
      'id', v_participant.id,
      'role', v_participant.role,
      'display_name', v_participant.display_name,
      'joined_at', v_participant.joined_at
    ),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role', role, 'display_name', display_name, 'joined_at', joined_at
      ) order by role)
      from public.participants where room_id = p_room_id
    ), '[]'::jsonb),
    'privateDraft', (
      select to_jsonb(d) - 'owner_user_id' - 'participant_id' - 'room_id'
      from public.private_drafts d
      where d.room_id = p_room_id and d.owner_user_id = v_user_id
      order by d.created_at desc limit 1
    ),
    'ownPerspective', (
      select to_jsonb(p) - 'owner_user_id' - 'participant_id' - 'room_id'
      from public.perspectives p
      where p.room_id = p_room_id and p.participant_id = v_participant.id
      order by p.version desc limit 1
    ),
    'approvedPerspectives', case when v_is_shared then coalesce((
      select jsonb_agg(item order by item->>'role') from (
        select jsonb_build_object(
          'role', u.role,
          'display_name', u.display_name,
          'version', p.version,
          'fact', p.fact,
          'meaning', p.meaning,
          'impact', p.impact,
          'request', p.request,
          'approved_at', p.approved_at
        ) as item
        from public.perspectives p
        join public.participants u on u.id = p.participant_id
        where p.room_id = p_room_id
          and p.version = (
            select max(p2.version) from public.perspectives p2
            where p2.room_id = p.room_id and p2.participant_id = p.participant_id
          )
      ) latest
    ), '[]'::jsonb) else '[]'::jsonb end,
    'sharedView', case when v_is_shared then (
      select to_jsonb(s) - 'room_id' from public.shared_views s where s.room_id = p_room_id
    ) else null end,
    'agreement', case when v_is_shared then (
      select to_jsonb(a) - 'room_id' from public.agreements a where a.room_id = p_room_id
    ) else null end,
    'events', coalesce((
      select jsonb_agg(event order by (event->>'id')::bigint desc) from (
        select jsonb_build_object(
          'id', e.id,
          'event_type', e.event_type,
          'from_state', e.from_state,
          'to_state', e.to_state,
          'created_at', e.created_at
        ) as event
        from public.room_events e
        where e.room_id = p_room_id
        order by e.id desc limit 30
      ) recent
    ), '[]'::jsonb),
    'privacy', jsonb_build_object(
      'rawDraftVisibility', 'owner_only',
      'sharedContentRule', 'approved_perspectives_only'
    )
  );
end;
$$;

alter table public.rooms enable row level security;
alter table public.participants enable row level security;
alter table public.private_drafts enable row level security;
alter table public.perspectives enable row level security;
alter table public.shared_views enable row level security;
alter table public.agreements enable row level security;
alter table public.room_events enable row level security;

create policy rooms_select_members on public.rooms
for select to authenticated
using ((select private.is_room_member(id)));

create policy participants_select_room_members on public.participants
for select to authenticated
using ((select private.is_room_member(room_id)));

create policy private_drafts_select_owner on public.private_drafts
for select to authenticated
using (owner_user_id = (select auth.uid()));

create policy perspectives_select_owner_or_shared on public.perspectives
for select to authenticated
using (
  owner_user_id = (select auth.uid())
  or (
    (select private.is_room_member(room_id))
    and exists (
      select 1 from public.rooms r
      where r.id = room_id
        and r.state in ('COMMON_VIEW_READY', 'AGREEMENT_PENDING', 'COMPLETED')
    )
  )
);

create policy shared_views_select_room_members on public.shared_views
for select to authenticated
using ((select private.is_room_member(room_id)));

create policy agreements_select_room_members on public.agreements
for select to authenticated
using ((select private.is_room_member(room_id)));

create policy room_events_select_room_members on public.room_events
for select to authenticated
using ((select private.is_room_member(room_id)));

revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on public.rooms, public.participants, public.private_drafts,
  public.perspectives, public.shared_views, public.agreements, public.room_events
  to authenticated;

grant execute on function public.create_room(text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.set_room_goal(uuid, text) to authenticated;
grant execute on function public.save_private_draft(uuid, text, text) to authenticated;
grant execute on function public.approve_perspective(uuid, text, text, text, text) to authenticated;
grant execute on function public.simulate_partner(uuid) to authenticated;
grant execute on function public.propose_agreement(uuid, text, timestamptz) to authenticated;
grant execute on function public.accept_agreement(uuid) to authenticated;
grant execute on function public.get_room_snapshot(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end;
$$;
