-- Version the reflective expression Agent independently from the original
-- one-shot organizer. Model jobs are keyed by every value that can affect the
-- result, including the user's current edited draft, while the private source
-- and conversation remain outside queue messages and public tables.

create or replace function private.expression_ai_input_hash(
  p_source_hash text,
  p_selected_mode text,
  p_manual_payload jsonb
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'sourceHash', p_source_hash,
          'selectedMode', p_selected_mode,
          'manualPayload', coalesce(p_manual_payload, '{}'::jsonb)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
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
  v_input_hash text;
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
  if nullif(v_workspace.source_text, '') is null then
    raise exception '表达内容不能为空。';
  end if;

  v_input_hash := private.expression_ai_input_hash(
    v_workspace.source_hash,
    v_workspace.selected_mode,
    v_workspace.manual_payload
  );
  v_idempotency_key := encode(
    extensions.digest(
      convert_to(
        'UNDERSTAND:' || v_input_hash || ':expression-dialogue-v2:reflective-dialogue-v2:0',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if not exists (
    select 1 from private.ai_jobs job where job.idempotency_key = v_idempotency_key
  ) and (
    select count(*)
    from private.ai_jobs job
    where job.requested_by_participant_id = v_participant_id
      and job.created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'AI 整理请求过于频繁，请稍后再试。' using errcode = 'P0003';
  end if;

  insert into private.ai_jobs (
    room_id, requested_by_participant_id, job_type, draft_revision,
    input_hash, pipeline_version, prompt_version, idempotency_key
  ) values (
    p_room_id, v_participant_id, 'UNDERSTAND', v_workspace.revision,
    v_input_hash, 'expression-dialogue-v2', 'reflective-dialogue-v2', v_idempotency_key
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
  v_parent_job private.ai_jobs;
  v_review_job private.ai_jobs;
  v_room public.rooms;
  v_expression_a public.expression_versions;
  v_expression_b public.expression_versions;
begin
  if nullif(btrim(left(p_worker_id, 120)), '') is null then
    raise exception 'Worker identity is required.';
  end if;
  update private.ai_jobs
  set status = 'PROCESSING', attempt_no = attempt_no + 1,
      locked_by = left(btrim(p_worker_id), 120),
      lease_until = now() + interval '2 minutes',
      started_at = coalesce(started_at, now())
  where id = p_job_id and (
    status in ('QUEUED', 'FAILED_RETRYABLE')
    or (status = 'PROCESSING' and lease_until < now())
  ) returning * into v_job;
  if v_job.id is null then
    return jsonb_build_object('claimed', false, 'status', (
      select status from private.ai_jobs where id = p_job_id
    ));
  end if;

  if v_job.job_type = 'UNDERSTAND' then
    if not exists (
      select 1 from private.participant_workspaces_v2 workspace
      where workspace.participant_id = v_job.requested_by_participant_id
        and workspace.revision = v_job.draft_revision
        and private.expression_ai_input_hash(
          workspace.source_hash,
          workspace.selected_mode,
          workspace.manual_payload
        ) = v_job.input_hash
        and workspace.flow_state not in ('PAUSED', 'ENDED')
    ) then
      update private.ai_jobs set status = 'STALE', finished_at = now(), lease_until = null
      where id = v_job.id;
      return jsonb_build_object('claimed', false, 'status', 'STALE');
    end if;
    return (
      select jsonb_build_object(
        'claimed', true, 'jobId', v_job.id, 'jobType', v_job.job_type,
        'draftRevision', v_job.draft_revision, 'inputHash', v_job.input_hash,
        'pipelineVersion', v_job.pipeline_version, 'promptVersion', v_job.prompt_version,
        'attemptNo', v_job.attempt_no, 'selectedMode', workspace.selected_mode,
        'sourceText', workspace.source_text, 'manualPayload', workspace.manual_payload
      ) from private.participant_workspaces_v2 workspace
      where workspace.participant_id = v_job.requested_by_participant_id
        and workspace.revision = v_job.draft_revision
        and private.expression_ai_input_hash(
          workspace.source_hash,
          workspace.selected_mode,
          workspace.manual_payload
        ) = v_job.input_hash
    );
  end if;

  if v_job.job_type not in ('CONSENSUS', 'REVIEW_UNDERSTANDING') then
    update private.ai_jobs set status = 'FAILED_FINAL', error_code = 'UNSUPPORTED_JOB_TYPE',
      finished_at = now(), lease_until = null where id = v_job.id;
    return jsonb_build_object('claimed', false, 'status', 'FAILED_FINAL');
  end if;
  select * into v_room from public.rooms where id = v_job.room_id;
  select * into v_expression_a from public.expression_versions where id = v_job.expression_a_id;
  select * into v_expression_b from public.expression_versions where id = v_job.expression_b_id;
  if v_room.phase_v2 = 'PAUSED' or not exists (
    select 1 from public.participants participant
    where participant.room_id = v_job.room_id and participant.role = 'A'
      and participant.current_expression_id = v_job.expression_a_id
  ) or not exists (
    select 1 from public.participants participant
    where participant.room_id = v_job.room_id and participant.role = 'B'
      and participant.current_expression_id = v_job.expression_b_id
  ) then
    update private.ai_jobs set status = 'STALE', finished_at = now(), lease_until = null
    where id = v_job.id;
    return jsonb_build_object('claimed', false, 'status', 'STALE');
  end if;

  if v_job.job_type = 'REVIEW_UNDERSTANDING' then
    select * into v_parent_job from private.ai_jobs where id = v_job.parent_job_id;
    return jsonb_build_object(
      'claimed', true, 'jobId', v_job.id, 'jobType', v_job.job_type,
      'semanticAttempt', v_job.semantic_attempt,
      'expressionA', jsonb_build_object('mode', v_expression_a.mode, 'payload', v_expression_a.payload),
      'expressionB', jsonb_build_object('mode', v_expression_b.mode, 'payload', v_expression_b.payload),
      'candidate', v_parent_job.result_payload
    );
  end if;

  if v_job.semantic_attempt > 0 and v_job.parent_job_id is not null then
    select * into v_review_job from private.ai_jobs where id = v_job.parent_job_id;
    select * into v_parent_job from private.ai_jobs where id = v_review_job.parent_job_id;
  end if;
  return jsonb_build_object(
    'claimed', true, 'jobId', v_job.id, 'jobType', v_job.job_type,
    'semanticAttempt', v_job.semantic_attempt,
    'expressionA', jsonb_build_object('mode', v_expression_a.mode, 'payload', v_expression_a.payload),
    'expressionB', jsonb_build_object('mode', v_expression_b.mode, 'payload', v_expression_b.payload),
    'previousCandidate', v_parent_job.result_payload,
    'reviewIssues', v_review_job.result_payload->'issues'
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
     or octet_length(p_result_payload::text) > 32000 then
    raise exception 'AI result payload is invalid.';
  end if;
  if coalesce(p_result_payload->>'safetyDisposition', '') not in ('ALLOW', 'WARN', 'BLOCK_SHARE', 'PAUSE') then
    raise exception 'AI safety disposition is invalid.';
  end if;

  select * into v_job
  from private.ai_jobs
  where id = p_job_id
  for update;
  if v_job.id is null or v_job.job_type <> 'UNDERSTAND' or v_job.status <> 'PROCESSING'
     or v_job.locked_by is distinct from left(btrim(p_worker_id), 120) then
    return jsonb_build_object('status', 'IGNORED');
  end if;

  select * into v_workspace
  from private.participant_workspaces_v2
  where participant_id = v_job.requested_by_participant_id
  for update;
  if v_workspace.revision is distinct from v_job.draft_revision
     or private.expression_ai_input_hash(
       v_workspace.source_hash,
       v_workspace.selected_mode,
       v_workspace.manual_payload
     ) is distinct from v_job.input_hash
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

revoke all on function private.expression_ai_input_hash(text, text, jsonb)
from public, anon, authenticated;
revoke all on function public.request_understanding_job_v2(uuid, bigint)
from public, anon, authenticated;
revoke all on function public.internal_claim_ai_job_v2(uuid, text)
from public, anon, authenticated;
revoke all on function public.internal_complete_ai_job_v2(uuid, text, text, jsonb, text, integer, integer, integer)
from public, anon, authenticated;

grant execute on function public.request_understanding_job_v2(uuid, bigint) to authenticated;
grant execute on function public.internal_claim_ai_job_v2(uuid, text) to service_role;
grant execute on function public.internal_complete_ai_job_v2(uuid, text, text, jsonb, text, integer, integer, integer)
to service_role;
