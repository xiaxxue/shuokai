-- Additive v2 foundation for the AI-assisted private expression flow.
-- Existing v1 rooms and RPCs remain intact during the test rollout.
create extension if not exists pgcrypto with schema extensions;

alter table public.rooms
  add column workflow_version smallint not null default 1
    check (workflow_version in (1, 2)),
  add column phase_v2 text
    check (phase_v2 is null or phase_v2 in (
      'SETUP', 'PRIVATE_EXPRESSION', 'UNDERSTANDING_GENERATING',
      'UNDERSTANDING_CONFIRMING', 'ACTION_GENERATING',
      'ACTION_CONFIRMING', 'PAUSED', 'COMPLETED', 'ENDED'
    )),
  add column resume_phase_v2 text
    check (resume_phase_v2 is null or resume_phase_v2 in (
      'SETUP', 'PRIVATE_EXPRESSION', 'UNDERSTANDING_GENERATING',
      'UNDERSTANDING_CONFIRMING', 'ACTION_GENERATING',
      'ACTION_CONFIRMING', 'COMPLETED', 'ENDED'
    )),
  add column paused_by_participant_id uuid,
  add column ended_at timestamptz;

alter table public.participants
  add column public_progress_v2 text
    check (public_progress_v2 is null or public_progress_v2 in (
      'NOT_JOINED', 'ORGANIZING', 'CONFIRMED', 'PAUSED', 'ENDED'
    )),
  add column version bigint not null default 1 check (version > 0),
  add column current_expression_id uuid,
  add column paused_at timestamptz,
  add column ended_at timestamptz;

create table public.expression_versions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  version bigint not null check (version > 0),
  mode text not null check (mode in ('NVC', 'FACT_DISPUTE', 'BOUNDARY')),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and octet_length(payload::text) between 2 and 16000
  ),
  schema_version smallint not null default 1 check (schema_version > 0),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  confirmed_at timestamptz not null default now(),
  unique (participant_id, version)
);

create index expression_versions_room_id_idx
on public.expression_versions (room_id);
create index expression_versions_participant_id_idx
on public.expression_versions (participant_id);
create index expression_versions_owner_user_id_idx
on public.expression_versions (owner_user_id);

alter table public.participants
  add constraint participants_current_expression_id_fkey
  foreign key (current_expression_id)
  references public.expression_versions(id)
  on delete set null;

create table public.shared_results (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  result_type text not null check (result_type in ('UNDERSTANDING', 'ACTION')),
  version bigint not null check (version > 0),
  expression_a_id uuid not null references public.expression_versions(id),
  expression_b_id uuid not null references public.expression_versions(id),
  parent_result_id uuid references public.shared_results(id),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and octet_length(payload::text) between 2 and 24000
  ),
  schema_version smallint not null default 1 check (schema_version > 0),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  published_at timestamptz not null default now(),
  unique (room_id, result_type, version)
);

create index shared_results_room_id_idx on public.shared_results (room_id);
create index shared_results_expression_a_id_idx on public.shared_results (expression_a_id);
create index shared_results_expression_b_id_idx on public.shared_results (expression_b_id);
create index shared_results_parent_result_id_idx on public.shared_results (parent_result_id);

alter table public.rooms
  add column current_understanding_result_id uuid
    references public.shared_results(id) on delete set null,
  add column current_action_result_id uuid
    references public.shared_results(id) on delete set null;

alter table public.rooms
  add constraint rooms_paused_by_participant_id_fkey
  foreign key (paused_by_participant_id)
  references public.participants(id)
  on delete set null;

create table public.result_confirmations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  result_id uuid not null references public.shared_results(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  version bigint not null check (version > 0),
  decision text not null check (
    decision in ('ACCURATE', 'INACCURATE', 'SELECTED', 'REJECTED', 'PAUSED')
  ),
  selected_option_key text check (
    selected_option_key is null or char_length(selected_option_key) between 1 and 80
  ),
  candidate_hash text not null check (candidate_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  invalidated_at timestamptz,
  unique (result_id, participant_id, version)
);

create index result_confirmations_room_id_idx on public.result_confirmations (room_id);
create index result_confirmations_result_id_idx on public.result_confirmations (result_id);
create index result_confirmations_participant_id_idx on public.result_confirmations (participant_id);
create unique index result_confirmations_current_idx
on public.result_confirmations (result_id, participant_id)
where invalidated_at is null;

create table private.participant_workspaces_v2 (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid not null unique references public.participants(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  flow_state text not null default 'DRAFTING' check (
    flow_state in ('DRAFTING', 'AI_REVIEW', 'CONFIRMED', 'REVISING', 'PAUSED', 'ENDED')
  ),
  source_text text not null default '' check (char_length(source_text) <= 12000),
  selected_mode text check (
    selected_mode is null or selected_mode in ('NVC', 'FACT_DISPUTE', 'BOUNDARY', 'PAUSE')
  ),
  manual_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(manual_payload) = 'object'),
  ai_candidate_payload jsonb check (
    ai_candidate_payload is null or jsonb_typeof(ai_candidate_payload) = 'object'
  ),
  pending_feedback_result_id uuid references public.shared_results(id) on delete set null,
  pending_feedback_text text check (
    pending_feedback_text is null or char_length(pending_feedback_text) <= 3000
  ),
  source_hash text not null default encode(
    extensions.digest(convert_to('', 'UTF8'), 'sha256'),
    'hex'
  ) check (source_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index participant_workspaces_v2_room_id_idx
on private.participant_workspaces_v2 (room_id);
create index participant_workspaces_v2_owner_user_id_idx
on private.participant_workspaces_v2 (owner_user_id);

create trigger participant_workspaces_v2_set_updated_at
before update on private.participant_workspaces_v2
for each row execute function private.set_updated_at();

create table private.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  requested_by_participant_id uuid references public.participants(id) on delete cascade,
  job_type text not null check (
    job_type in (
      'ROUTE', 'SAFETY_EXPRESSION', 'UNDERSTAND', 'CONSENSUS',
      'REVIEW_UNDERSTANDING', 'ACTION', 'REVIEW_ACTION', 'SAFETY_RESULT'
    )
  ),
  status text not null default 'QUEUED' check (
    status in (
      'QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED_RETRYABLE',
      'FAILED_FINAL', 'STALE', 'CANCELED'
    )
  ),
  draft_revision bigint,
  expression_a_id uuid references public.expression_versions(id),
  expression_b_id uuid references public.expression_versions(id),
  parent_result_id uuid references public.shared_results(id),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  pipeline_version text not null,
  prompt_version text not null,
  schema_version smallint not null default 1 check (schema_version > 0),
  model_id text,
  attempt_no integer not null default 0 check (attempt_no >= 0),
  semantic_attempt integer not null default 0 check (semantic_attempt >= 0),
  parent_job_id uuid references private.ai_jobs(id),
  lease_until timestamptz,
  locked_by text,
  idempotency_key text not null unique,
  result_payload jsonb,
  review_issues jsonb,
  safety_disposition text check (
    safety_disposition is null or safety_disposition in ('ALLOW', 'WARN', 'BLOCK_SHARE', 'PAUSE')
  ),
  risk_categories text[],
  error_code text check (error_code is null or char_length(error_code) <= 80),
  provider_request_ref text check (
    provider_request_ref is null or char_length(provider_request_ref) <= 200
  ),
  token_input integer check (token_input is null or token_input >= 0),
  token_output integer check (token_output is null or token_output >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index ai_jobs_room_timeline_idx
on private.ai_jobs (room_id, created_at desc);
create index ai_jobs_requester_timeline_idx
on private.ai_jobs (requested_by_participant_id, created_at desc);
create index ai_jobs_claimable_idx
on private.ai_jobs (status, lease_until)
where status in ('QUEUED', 'FAILED_RETRYABLE', 'PROCESSING');
create unique index ai_jobs_active_input_idx
on private.ai_jobs (job_type, input_hash, pipeline_version, prompt_version, semantic_attempt)
where status in ('QUEUED', 'PROCESSING', 'FAILED_RETRYABLE');

alter table public.expression_versions enable row level security;
alter table public.shared_results enable row level security;
alter table public.result_confirmations enable row level security;
alter table private.participant_workspaces_v2 enable row level security;
alter table private.ai_jobs enable row level security;

create policy expression_versions_select_owner_or_current
on public.expression_versions
for select to authenticated
using (
  owner_user_id = (select auth.uid())
  or (
    (select private.is_room_member(room_id))
    and exists (
      select 1
      from public.participants participant
      where participant.current_expression_id = expression_versions.id
        and participant.room_id = expression_versions.room_id
    )
  )
);

create policy shared_results_select_room_members
on public.shared_results
for select to authenticated
using ((select private.is_room_member(room_id)));

create policy result_confirmations_select_room_members
on public.result_confirmations
for select to authenticated
using ((select private.is_room_member(room_id)));

revoke all on table public.expression_versions from public, anon, authenticated;
revoke all on table public.shared_results from public, anon, authenticated;
revoke all on table public.result_confirmations from public, anon, authenticated;
revoke all on table private.participant_workspaces_v2 from public, anon, authenticated;
revoke all on table private.ai_jobs from public, anon, authenticated;

grant select on table public.expression_versions to authenticated;
grant select on table public.shared_results to authenticated;
grant select on table public.result_confirmations to authenticated;

create or replace function public.create_room_v2(p_display_name text default '我')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created jsonb;
  v_room_id uuid;
  v_user_id uuid := (select auth.uid());
  v_participant_id uuid;
begin
  if v_user_id is null then
    raise exception '请先登录。' using errcode = '42501';
  end if;

  v_created := public.create_room(p_display_name);
  v_room_id := (v_created->>'roomId')::uuid;

  update public.rooms
  set workflow_version = 2,
      phase_v2 = 'SETUP'
  where id = v_room_id;

  select id into v_participant_id
  from public.participants
  where room_id = v_room_id and user_id = v_user_id;

  update public.participants
  set public_progress_v2 = 'ORGANIZING'
  where id = v_participant_id;

  insert into private.participant_workspaces_v2 (
    room_id, participant_id, owner_user_id
  ) values (
    v_room_id, v_participant_id, v_user_id
  );

  return v_created || jsonb_build_object('workflowVersion', 2, 'phaseV2', 'SETUP');
end;
$$;

create or replace function public.set_room_goal_v2(p_room_id uuid, p_goal text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not exists (
    select 1 from public.rooms
    where id = p_room_id and workflow_version = 2
  ) then
    raise exception '这个房间不支持当前流程。' using errcode = '55000';
  end if;

  v_result := public.set_room_goal(p_room_id, p_goal);
  update public.rooms
  set phase_v2 = 'PRIVATE_EXPRESSION'
  where id = p_room_id;
  return v_result;
end;
$$;

create or replace function public.join_room_v2(
  p_code text,
  p_display_name text default '我'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_joined jsonb;
  v_room_id uuid;
  v_user_id uuid := (select auth.uid());
  v_participant_id uuid;
begin
  if v_user_id is null then
    raise exception '请先登录。' using errcode = '42501';
  end if;

  select id into v_room_id
  from public.rooms
  where code = upper(btrim(p_code))
    and workflow_version = 2;
  if v_room_id is null then
    raise exception '沟通房间不存在或已经失效。' using errcode = 'P0002';
  end if;

  v_joined := public.join_room(p_code, p_display_name);
  select id into v_participant_id
  from public.participants
  where room_id = v_room_id and user_id = v_user_id;

  update public.participants
  set public_progress_v2 = 'ORGANIZING'
  where id = v_participant_id;

  insert into private.participant_workspaces_v2 (
    room_id, participant_id, owner_user_id
  ) values (
    v_room_id, v_participant_id, v_user_id
  ) on conflict (participant_id) do nothing;

  return v_joined || jsonb_build_object(
    'workflowVersion', 2,
    'phaseV2', (select phase_v2 from public.rooms where id = v_room_id)
  );
end;
$$;

create or replace function public.save_expression_workspace_v2(
  p_room_id uuid,
  p_expected_revision bigint,
  p_source_text text,
  p_selected_mode text,
  p_manual_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant public.participants;
  v_source_text text := nullif(btrim(left(p_source_text, 12000)), '');
  v_revision bigint;
  v_source_hash text;
begin
  if v_user_id is null then
    raise exception '请先登录。' using errcode = '42501';
  end if;
  if v_source_text is null then raise exception '表达内容不能为空。'; end if;
  if coalesce(p_selected_mode, '') not in ('NVC', 'FACT_DISPUTE', 'BOUNDARY', 'PAUSE') then
    raise exception '请选择有效的表达路径。';
  end if;
  if jsonb_typeof(coalesce(p_manual_payload, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_manual_payload, '{}'::jsonb)::text) > 16000 then
    raise exception '表达草稿格式无效。';
  end if;

  select participant.* into v_participant
  from public.participants participant
  join public.rooms room on room.id = participant.room_id
  where participant.room_id = p_room_id
    and participant.user_id = v_user_id
    and room.workflow_version = 2;
  if v_participant.id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;

  v_source_hash := encode(
    extensions.digest(
      convert_to(v_source_text || E'\n' || p_selected_mode, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  update private.participant_workspaces_v2
  set revision = revision + 1,
      flow_state = case when flow_state = 'CONFIRMED' then 'REVISING' else 'DRAFTING' end,
      source_text = v_source_text,
      selected_mode = p_selected_mode,
      manual_payload = coalesce(p_manual_payload, '{}'::jsonb),
      ai_candidate_payload = null,
      source_hash = v_source_hash
  where participant_id = v_participant.id
    and owner_user_id = v_user_id
    and revision = p_expected_revision
  returning revision into v_revision;

  if v_revision is null then
    raise exception '草稿刚刚发生了变化，请刷新后重试。' using errcode = '40001';
  end if;

  update public.participants
  set public_progress_v2 = 'ORGANIZING',
      version = version + 1
  where id = v_participant.id;

  return jsonb_build_object(
    'revision', v_revision,
    'sourceHash', v_source_hash,
    'selectedMode', p_selected_mode
  );
end;
$$;

create or replace function public.get_expression_workspace_v2(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant_id uuid;
begin
  select participant.id into v_participant_id
  from public.participants participant
  join public.rooms room on room.id = participant.room_id
  where participant.room_id = p_room_id
    and participant.user_id = v_user_id
    and room.workflow_version = 2;
  if v_participant_id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'revision', workspace.revision,
      'flowState', workspace.flow_state,
      'sourceText', workspace.source_text,
      'selectedMode', workspace.selected_mode,
      'manualPayload', workspace.manual_payload,
      'aiCandidate', workspace.ai_candidate_payload,
      'updatedAt', workspace.updated_at
    )
    from private.participant_workspaces_v2 workspace
    where workspace.participant_id = v_participant_id
      and workspace.owner_user_id = v_user_id
  );
end;
$$;

create or replace function public.request_understanding_job_v2(
  p_room_id uuid,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant_id uuid;
  v_workspace private.participant_workspaces_v2;
  v_job private.ai_jobs;
  v_idempotency_key text;
begin
  select participant.id into v_participant_id
  from public.participants participant
  join public.rooms room on room.id = participant.room_id
  where participant.room_id = p_room_id
    and participant.user_id = v_user_id
    and room.workflow_version = 2;
  if v_participant_id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;

  select * into v_workspace
  from private.participant_workspaces_v2
  where participant_id = v_participant_id
    and owner_user_id = v_user_id
    and revision = p_expected_revision;
  if v_workspace.id is null then
    raise exception '草稿刚刚发生了变化，请刷新后重试。' using errcode = '40001';
  end if;
  if v_workspace.selected_mode is null or v_workspace.selected_mode = 'PAUSE' then
    raise exception '当前路径不需要 AI 整理。' using errcode = '55000';
  end if;
  if nullif(v_workspace.source_text, '') is null then raise exception '表达内容不能为空。'; end if;
  if (
    select count(*)
    from private.ai_jobs job
    where job.requested_by_participant_id = v_participant_id
      and job.created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'AI 整理请求过于频繁，请稍后再试。' using errcode = 'P0003';
  end if;

  v_idempotency_key := encode(
    extensions.digest(
      convert_to(
        'UNDERSTAND:' || v_workspace.source_hash || ':expression-v1:understand-v1:0',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into private.ai_jobs (
    room_id, requested_by_participant_id, job_type, draft_revision,
    input_hash, pipeline_version, prompt_version, idempotency_key
  ) values (
    p_room_id, v_participant_id, 'UNDERSTAND', v_workspace.revision,
    v_workspace.source_hash, 'expression-v1', 'understand-v1', v_idempotency_key
  ) on conflict (idempotency_key) do update
  set status = case
        when ai_jobs.status in ('FAILED_FINAL', 'STALE') then 'QUEUED'
        else ai_jobs.status
      end,
      attempt_no = case
        when ai_jobs.status in ('FAILED_FINAL', 'STALE') then 0
        else ai_jobs.attempt_no
      end,
      error_code = case
        when ai_jobs.status in ('FAILED_FINAL', 'STALE') then null
        else ai_jobs.error_code
      end,
      finished_at = case
        when ai_jobs.status in ('FAILED_FINAL', 'STALE') then null
        else ai_jobs.finished_at
      end
  returning * into v_job;

  update private.participant_workspaces_v2
  set flow_state = 'AI_REVIEW'
  where id = v_workspace.id;

  return jsonb_build_object(
    'jobId', v_job.id,
    'status', v_job.status,
    'draftRevision', v_workspace.revision
  );
end;
$$;

create or replace function public.get_ai_job_status_v2(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_job private.ai_jobs;
begin
  select job.* into v_job
  from private.ai_jobs job
  join public.participants participant on participant.id = job.requested_by_participant_id
  where job.id = p_job_id and participant.user_id = v_user_id;
  if v_job.id is null then
    raise exception '找不到这个 AI 任务。' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'jobId', v_job.id,
    'status', v_job.status,
    'draftRevision', v_job.draft_revision,
    'result', case when v_job.status = 'SUCCEEDED' then v_job.result_payload else null end,
    'errorCode', case when v_job.status in ('FAILED_RETRYABLE', 'FAILED_FINAL') then v_job.error_code else null end
  );
end;
$$;

create or replace function public.confirm_expression_version_v2(
  p_room_id uuid,
  p_expected_revision bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant public.participants;
  v_workspace private.participant_workspaces_v2;
  v_room public.rooms;
  v_version bigint;
  v_expression_id uuid;
  v_content_hash text;
  v_next_state text;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 16000 then
    raise exception '确认内容格式无效。';
  end if;

  select participant.* into v_participant
  from public.participants participant
  where participant.room_id = p_room_id and participant.user_id = v_user_id
  for update;
  if v_participant.id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;

  select * into v_room from public.rooms
  where id = p_room_id and workflow_version = 2
  for update;
  if v_room.id is null then
    raise exception '这个房间不支持当前流程。' using errcode = '55000';
  end if;

  select * into v_workspace
  from private.participant_workspaces_v2
  where participant_id = v_participant.id
    and owner_user_id = v_user_id
    and revision = p_expected_revision
  for update;
  if v_workspace.id is null then
    raise exception '草稿刚刚发生了变化，请刷新后重试。' using errcode = '40001';
  end if;
  if v_workspace.selected_mode is null or v_workspace.selected_mode = 'PAUSE'
     or p_payload->>'mode' is distinct from v_workspace.selected_mode then
    raise exception '确认内容与当前表达路径不一致。';
  end if;
  if p_payload->>'schemaVersion' is distinct from '1'
     or jsonb_typeof(p_payload->'uncertainties') is distinct from 'array' then
    raise exception '确认内容格式无效。';
  end if;
  if jsonb_array_length(p_payload->'uncertainties') > 8
     or exists (
       select 1 from jsonb_array_elements(p_payload->'uncertainties') item
       where jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 500
     ) then
    raise exception '确认内容格式无效。';
  end if;

  if v_workspace.selected_mode = 'NVC' and (
    p_payload - array['mode', 'schemaVersion', 'observation', 'feeling', 'need', 'request', 'uncertainties'] <> '{}'::jsonb
    or
    nullif(btrim(p_payload->>'observation'), '') is null
    or nullif(btrim(p_payload->>'feeling'), '') is null
    or nullif(btrim(p_payload->>'need'), '') is null
    or nullif(btrim(p_payload->>'request'), '') is null
    or greatest(
      char_length(p_payload->>'observation'), char_length(p_payload->>'feeling'),
      char_length(p_payload->>'need'), char_length(p_payload->>'request')
    ) > 3000
  ) then raise exception '观察、感受、需要和请求都需要由本人确认。'; end if;

  if v_workspace.selected_mode = 'FACT_DISPUTE' and (
    p_payload - array['mode', 'schemaVersion', 'claim', 'basis', 'verificationRequest', 'uncertainties'] <> '{}'::jsonb
    or
    nullif(btrim(p_payload->>'claim'), '') is null
    or nullif(btrim(p_payload->>'basis'), '') is null
    or nullif(btrim(p_payload->>'verificationRequest'), '') is null
    or greatest(
      char_length(p_payload->>'claim'), char_length(p_payload->>'basis'),
      char_length(p_payload->>'verificationRequest')
    ) > 3000
  ) then raise exception '主张、依据和核实事项都需要由本人确认。'; end if;

  if v_workspace.selected_mode = 'BOUNDARY' and (
    p_payload - array['mode', 'schemaVersion', 'boundary', 'reason', 'acceptableRange', 'selfProtectiveAction', 'uncertainties'] <> '{}'::jsonb
    or
    nullif(btrim(p_payload->>'boundary'), '') is null
    or nullif(btrim(p_payload->>'acceptableRange'), '') is null
    or nullif(btrim(p_payload->>'selfProtectiveAction'), '') is null
    or greatest(
      char_length(p_payload->>'boundary'), char_length(coalesce(p_payload->>'reason', '')),
      char_length(p_payload->>'acceptableRange'), char_length(p_payload->>'selfProtectiveAction')
    ) > 3000
  ) then raise exception '边界、可接受范围和自我保护行动都需要由本人确认。'; end if;

  v_content_hash := encode(
    extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_workspace.flow_state = 'CONFIRMED' then
    select expression.id, expression.version
    into v_expression_id, v_version
    from public.expression_versions expression
    where expression.id = v_participant.current_expression_id
      and expression.content_hash = v_content_hash;
    if v_expression_id is null then
      raise exception '确认版本已经发生变化，请刷新后重试。' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'state', v_room.state,
      'version', v_version,
      'expressionId', v_expression_id,
      'contentHash', v_content_hash
    );
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.expression_versions
  where participant_id = v_participant.id;

  insert into public.expression_versions (
    room_id, participant_id, owner_user_id, version, mode,
    payload, content_hash
  ) values (
    p_room_id, v_participant.id, v_user_id, v_version,
    v_workspace.selected_mode, p_payload, v_content_hash
  ) returning id into v_expression_id;

  update public.participants
  set current_expression_id = v_expression_id,
      public_progress_v2 = 'CONFIRMED',
      version = version + 1
  where id = v_participant.id;

  update private.participant_workspaces_v2
  set flow_state = 'CONFIRMED',
      manual_payload = p_payload,
      ai_candidate_payload = null
  where id = v_workspace.id;

  if v_participant.role = 'A' then
    v_next_state := private.transition_room(
      p_room_id, v_room.state, 'WAITING_FOR_B',
      'A_EXPRESSION_V2_CONFIRMED', v_participant.id,
      jsonb_build_object('expressionVersion', v_version)
    );
  else
    v_next_state := private.transition_room(
      p_room_id, v_room.state, 'COMMON_VIEW_READY',
      'B_EXPRESSION_V2_CONFIRMED', v_participant.id,
      jsonb_build_object('expressionVersion', v_version)
    );
    update public.rooms
    set phase_v2 = 'UNDERSTANDING_GENERATING'
    where id = p_room_id;
  end if;

  return jsonb_build_object(
    'state', v_next_state,
    'version', v_version,
    'expressionId', v_expression_id,
    'contentHash', v_content_hash
  );
end;
$$;

create or replace function public.pause_room_v2(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant_id uuid;
begin
  select participant.id into v_participant_id
  from public.participants participant
  join public.rooms room on room.id = participant.room_id
  where participant.room_id = p_room_id
    and participant.user_id = v_user_id
    and room.workflow_version = 2
  for update of participant;
  if v_participant_id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;

  update public.rooms
  set resume_phase_v2 = case when phase_v2 = 'PAUSED' then resume_phase_v2 else phase_v2 end,
      phase_v2 = 'PAUSED',
      paused_by_participant_id = v_participant_id
  where id = p_room_id;
  update public.participants
  set public_progress_v2 = 'PAUSED', paused_at = now(), version = version + 1
  where id = v_participant_id;
  update private.participant_workspaces_v2
  set selected_mode = 'PAUSE', flow_state = 'PAUSED'
  where participant_id = v_participant_id and owner_user_id = v_user_id;
  update private.ai_jobs
  set status = 'CANCELED', finished_at = now(), lease_until = null
  where room_id = p_room_id
    and requested_by_participant_id = v_participant_id
    and status in ('QUEUED', 'PROCESSING', 'FAILED_RETRYABLE');

  return jsonb_build_object('phase', 'PAUSED', 'paused', true);
end;
$$;

create or replace function public.internal_claim_ai_job_v2(
  p_job_id uuid,
  p_worker_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.ai_jobs;
begin
  if nullif(btrim(left(p_worker_id, 120)), '') is null then
    raise exception 'Worker identity is required.';
  end if;

  update private.ai_jobs
  set status = 'PROCESSING',
      attempt_no = attempt_no + 1,
      locked_by = left(btrim(p_worker_id), 120),
      lease_until = now() + interval '2 minutes',
      started_at = coalesce(started_at, now())
  where id = p_job_id
    and (
      status in ('QUEUED', 'FAILED_RETRYABLE')
      or (status = 'PROCESSING' and lease_until < now())
    )
  returning * into v_job;

  if v_job.id is null then
    return jsonb_build_object(
      'claimed', false,
      'status', (select status from private.ai_jobs where id = p_job_id)
    );
  end if;

  if not exists (
    select 1 from private.participant_workspaces_v2 workspace
    where workspace.participant_id = v_job.requested_by_participant_id
      and workspace.revision = v_job.draft_revision
      and workspace.source_hash = v_job.input_hash
      and workspace.flow_state not in ('PAUSED', 'ENDED')
  ) then
    update private.ai_jobs
    set status = 'STALE', finished_at = now(), lease_until = null
    where id = v_job.id;
    return jsonb_build_object('claimed', false, 'status', 'STALE');
  end if;

  return (
    select jsonb_build_object(
      'claimed', true,
      'jobId', v_job.id,
      'roomId', v_job.room_id,
      'jobType', v_job.job_type,
      'draftRevision', v_job.draft_revision,
      'inputHash', v_job.input_hash,
      'pipelineVersion', v_job.pipeline_version,
      'promptVersion', v_job.prompt_version,
      'attemptNo', v_job.attempt_no,
      'selectedMode', workspace.selected_mode,
      'sourceText', workspace.source_text,
      'manualPayload', workspace.manual_payload
    )
    from private.participant_workspaces_v2 workspace
    where workspace.participant_id = v_job.requested_by_participant_id
      and workspace.revision = v_job.draft_revision
      and workspace.source_hash = v_job.input_hash
  );
end;
$$;

create or replace function public.internal_complete_ai_job_v2(
  p_job_id uuid,
  p_worker_id text,
  p_model_id text,
  p_result_payload jsonb,
  p_provider_request_ref text default null,
  p_token_input integer default null,
  p_token_output integer default null,
  p_latency_ms integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.ai_jobs;
  v_workspace private.participant_workspaces_v2;
begin
  if jsonb_typeof(p_result_payload) is distinct from 'object'
     or octet_length(p_result_payload::text) > 24000 then
    raise exception 'AI result payload is invalid.';
  end if;
  if coalesce(p_result_payload->>'safetyDisposition', '') not in ('ALLOW', 'WARN', 'BLOCK_SHARE', 'PAUSE') then
    raise exception 'AI safety disposition is invalid.';
  end if;

  select * into v_job
  from private.ai_jobs
  where id = p_job_id
  for update;
  if v_job.id is null or v_job.status <> 'PROCESSING'
     or v_job.locked_by is distinct from left(btrim(p_worker_id), 120) then
    return jsonb_build_object('status', 'IGNORED');
  end if;

  select * into v_workspace
  from private.participant_workspaces_v2
  where participant_id = v_job.requested_by_participant_id
  for update;
  if v_workspace.revision is distinct from v_job.draft_revision
     or v_workspace.source_hash is distinct from v_job.input_hash
     or v_workspace.flow_state in ('PAUSED', 'ENDED') then
    update private.ai_jobs
    set status = 'STALE', finished_at = now(), lease_until = null
    where id = v_job.id;
    return jsonb_build_object('status', 'STALE');
  end if;

  update private.ai_jobs
  set status = 'SUCCEEDED',
      model_id = left(p_model_id, 120),
      result_payload = p_result_payload,
      safety_disposition = p_result_payload->>'safetyDisposition',
      provider_request_ref = left(nullif(p_provider_request_ref, ''), 200),
      token_input = p_token_input,
      token_output = p_token_output,
      latency_ms = p_latency_ms,
      finished_at = now(),
      lease_until = null
  where id = v_job.id;

  update private.participant_workspaces_v2
  set ai_candidate_payload = p_result_payload,
      flow_state = 'AI_REVIEW'
  where id = v_workspace.id;

  return jsonb_build_object('status', 'SUCCEEDED');
end;
$$;

create or replace function public.internal_fail_ai_job_v2(
  p_job_id uuid,
  p_worker_id text,
  p_error_code text,
  p_retryable boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  update private.ai_jobs
  set status = case
        when p_retryable and attempt_no < 3 then 'FAILED_RETRYABLE'
        else 'FAILED_FINAL'
      end,
      error_code = left(coalesce(nullif(p_error_code, ''), 'AI_UNKNOWN_ERROR'), 80),
      finished_at = case when p_retryable and attempt_no < 3 then null else now() end,
      lease_until = null
  where id = p_job_id
    and status = 'PROCESSING'
    and locked_by = left(btrim(p_worker_id), 120)
  returning status into v_status;

  return jsonb_build_object('status', coalesce(v_status, 'IGNORED'));
end;
$$;

revoke all on function public.create_room_v2(text) from public, anon, authenticated;
revoke all on function public.set_room_goal_v2(uuid, text) from public, anon, authenticated;
revoke all on function public.join_room_v2(text, text) from public, anon, authenticated;
revoke all on function public.save_expression_workspace_v2(uuid, bigint, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.get_expression_workspace_v2(uuid) from public, anon, authenticated;
revoke all on function public.request_understanding_job_v2(uuid, bigint) from public, anon, authenticated;
revoke all on function public.get_ai_job_status_v2(uuid) from public, anon, authenticated;
revoke all on function public.confirm_expression_version_v2(uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.pause_room_v2(uuid) from public, anon, authenticated;
revoke all on function public.internal_claim_ai_job_v2(uuid, text) from public, anon, authenticated;
revoke all on function public.internal_complete_ai_job_v2(uuid, text, text, jsonb, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.internal_fail_ai_job_v2(uuid, text, text, boolean) from public, anon, authenticated;

grant execute on function public.create_room_v2(text) to authenticated;
grant execute on function public.set_room_goal_v2(uuid, text) to authenticated;
grant execute on function public.join_room_v2(text, text) to authenticated;
grant execute on function public.save_expression_workspace_v2(uuid, bigint, text, text, jsonb) to authenticated;
grant execute on function public.get_expression_workspace_v2(uuid) to authenticated;
grant execute on function public.request_understanding_job_v2(uuid, bigint) to authenticated;
grant execute on function public.get_ai_job_status_v2(uuid) to authenticated;
grant execute on function public.confirm_expression_version_v2(uuid, bigint, jsonb) to authenticated;
grant execute on function public.pause_room_v2(uuid) to authenticated;

grant execute on function public.internal_claim_ai_job_v2(uuid, text) to service_role;
grant execute on function public.internal_complete_ai_job_v2(uuid, text, text, jsonb, text, integer, integer, integer) to service_role;
grant execute on function public.internal_fail_ai_job_v2(uuid, text, text, boolean) to service_role;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Rollback is intentionally additive: revoke the v2 RPC grants and roll the app
-- back to v1. Do not drop these tables while a v2 room may still reference them.
