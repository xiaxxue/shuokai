-- M3: generate and confirm a shared understanding from the two immutable,
-- user-confirmed expression versions. Model drafts and review details stay in
-- the private schema; only a reviewed result is published to room members.

create or replace function public.request_consensus_job_v2(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.rooms;
  v_requester_id uuid;
  v_expression_a public.expression_versions;
  v_expression_b public.expression_versions;
  v_input_hash text;
  v_idempotency_key text;
  v_job private.ai_jobs;
begin
  select room.* into v_room
  from public.rooms room
  where room.id = p_room_id and room.workflow_version = 2
  for update;
  if v_room.id is null then
    raise exception '这个房间不支持当前流程。' using errcode = '55000';
  end if;

  select participant.id into v_requester_id
  from public.participants participant
  where participant.room_id = p_room_id and participant.user_id = v_user_id;
  if v_requester_id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;
  if v_room.phase_v2 = 'PAUSED' then
    raise exception '当前沟通已经暂停。' using errcode = '55000';
  end if;

  select expression.* into v_expression_a
  from public.participants participant
  join public.expression_versions expression on expression.id = participant.current_expression_id
  where participant.room_id = p_room_id and participant.role = 'A';
  select expression.* into v_expression_b
  from public.participants participant
  join public.expression_versions expression on expression.id = participant.current_expression_id
  where participant.room_id = p_room_id and participant.role = 'B';
  if v_expression_a.id is null or v_expression_b.id is null then
    raise exception '需要双方先分别确认自己的表达。' using errcode = '55000';
  end if;

  if v_room.current_understanding_result_id is not null and exists (
    select 1 from public.shared_results result
    where result.id = v_room.current_understanding_result_id
      and result.expression_a_id = v_expression_a.id
      and result.expression_b_id = v_expression_b.id
  ) then
    return jsonb_build_object(
      'status', 'SUCCEEDED',
      'resultId', v_room.current_understanding_result_id
    );
  end if;

  v_input_hash := encode(extensions.digest(convert_to(
    'CONSENSUS:' || v_expression_a.id::text || ':' || v_expression_a.content_hash || ':' ||
    v_expression_b.id::text || ':' || v_expression_b.content_hash,
    'UTF8'
  ), 'sha256'), 'hex');
  v_idempotency_key := encode(extensions.digest(convert_to(
    v_input_hash || ':understanding-v1:consensus-v1:0', 'UTF8'
  ), 'sha256'), 'hex');
  if not exists (select 1 from private.ai_jobs where idempotency_key = v_idempotency_key)
     and (
       select count(*) from private.ai_jobs job
       where job.requested_by_participant_id = v_requester_id
         and job.created_at > now() - interval '1 hour'
     ) >= 20 then
    raise exception 'AI 整理请求过于频繁，请稍后再试。' using errcode = 'P0003';
  end if;

  insert into private.ai_jobs (
    room_id, requested_by_participant_id, job_type,
    expression_a_id, expression_b_id, input_hash,
    pipeline_version, prompt_version, semantic_attempt, idempotency_key
  ) values (
    p_room_id, v_requester_id, 'CONSENSUS',
    v_expression_a.id, v_expression_b.id, v_input_hash,
    'understanding-v1', 'consensus-v1', 0, v_idempotency_key
  ) on conflict (idempotency_key) do update
  set requested_by_participant_id = excluded.requested_by_participant_id
  returning * into v_job;

  -- A previous queue delivery may have completed the generator but failed before
  -- enqueueing its reviewer. Return the newest unfinished stage so a repeated
  -- client request repairs delivery without creating another semantic result.
  select job.* into v_job
  from private.ai_jobs job
  where job.room_id = p_room_id
    and job.input_hash = v_input_hash
    and job.job_type in ('CONSENSUS', 'REVIEW_UNDERSTANDING')
    and job.status in ('QUEUED', 'PROCESSING', 'FAILED_RETRYABLE')
  order by job.created_at desc
  limit 1;
  if v_job.id is null then
    select job.* into v_job
    from private.ai_jobs job
    where job.room_id = p_room_id and job.input_hash = v_input_hash
      and job.job_type in ('CONSENSUS', 'REVIEW_UNDERSTANDING')
    order by job.created_at desc limit 1;
  end if;

  if v_job.status not in ('QUEUED', 'PROCESSING', 'FAILED_RETRYABLE') then
    return jsonb_build_object('jobId', v_job.id, 'status', v_job.status);
  end if;

  -- The legacy room state still drives restore/navigation in both clients.
  -- Repair it after either participant re-confirms while the other expression
  -- remains current, so state and phase cannot describe different workflows.
  if v_room.state <> 'COMMON_VIEW_READY' then
    perform private.transition_room(
      p_room_id, v_room.state, 'COMMON_VIEW_READY',
      'BOTH_EXPRESSIONS_V2_READY', v_requester_id,
      jsonb_build_object(
        'expressionAId', v_expression_a.id,
        'expressionBId', v_expression_b.id
      )
    );
  end if;

  update public.rooms
  set phase_v2 = 'UNDERSTANDING_GENERATING'
  where id = p_room_id and phase_v2 <> 'PAUSED';

  return jsonb_build_object('jobId', v_job.id, 'status', v_job.status);
end;
$$;

create or replace function public.get_understanding_status_v2(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant_id uuid;
  v_room public.rooms;
  v_result public.shared_results;
  v_job private.ai_jobs;
begin
  select participant.id into v_participant_id
  from public.participants participant
  where participant.room_id = p_room_id and participant.user_id = v_user_id;
  if v_participant_id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;

  select * into v_room from public.rooms where id = p_room_id and workflow_version = 2;
  if v_room.id is null then
    raise exception '这个房间不支持当前流程。' using errcode = '55000';
  end if;
  select * into v_result from public.shared_results
  where id = v_room.current_understanding_result_id;
  select job.* into v_job
  from private.ai_jobs job
  where job.room_id = p_room_id
    and job.job_type in ('CONSENSUS', 'REVIEW_UNDERSTANDING')
  order by job.created_at desc
  limit 1;

  return jsonb_build_object(
    'phase', v_room.phase_v2,
    'status', case
      when v_room.phase_v2 = 'PAUSED' then 'PAUSED'
      when v_result.id is not null then 'SUCCEEDED'
      when v_job.id is null then 'WAITING'
      else v_job.status
    end,
    'progress', (
      select coalesce(jsonb_object_agg(
        participant.role, coalesce(participant.public_progress_v2, 'NOT_JOINED')
      ), '{}'::jsonb)
      from public.participants participant where participant.room_id = p_room_id
    ),
    'result', case when v_result.id is null then null else jsonb_build_object(
      'id', v_result.id,
      'version', v_result.version,
      'contentHash', v_result.content_hash,
      'payload', v_result.payload,
      'publishedAt', v_result.published_at
    ) end,
    'ownDecision', (
      select confirmation.decision
      from public.result_confirmations confirmation
      where confirmation.result_id = v_result.id
        and confirmation.participant_id = v_participant_id
        and confirmation.invalidated_at is null
      order by confirmation.created_at desc limit 1
    ),
    'accurateCount', (
      select count(*) from public.result_confirmations confirmation
      where confirmation.result_id = v_result.id
        and confirmation.decision = 'ACCURATE'
        and confirmation.invalidated_at is null
    ),
    'errorCode', case when v_job.status = 'FAILED_FINAL' then v_job.error_code else null end
  );
end;
$$;

create or replace function public.confirm_understanding_v2(
  p_room_id uuid,
  p_result_id uuid,
  p_candidate_hash text,
  p_decision text,
  p_feedback_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant_id uuid;
  v_room public.rooms;
  v_result public.shared_results;
  v_version bigint;
  v_accurate_count integer;
  v_feedback text := nullif(btrim(left(coalesce(p_feedback_text, ''), 3000)), '');
begin
  if p_decision not in ('ACCURATE', 'INACCURATE') then
    raise exception '请选择有效的确认结果。';
  end if;
  if p_decision = 'INACCURATE' and v_feedback is null then
    raise exception '请指出至少一处不准确的内容。';
  end if;
  if p_candidate_hash !~ '^[a-f0-9]{64}$' then
    raise exception '共同理解版本无效。';
  end if;

  select participant.id into v_participant_id
  from public.participants participant
  where participant.room_id = p_room_id and participant.user_id = v_user_id
  for update;
  if v_participant_id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;
  select * into v_room from public.rooms
  where id = p_room_id and workflow_version = 2 for update;
  select * into v_result from public.shared_results
  where id = p_result_id and room_id = p_room_id;
  if v_result.id is null or v_room.current_understanding_result_id is distinct from v_result.id
     or v_result.content_hash is distinct from p_candidate_hash
     or v_room.phase_v2 <> 'UNDERSTANDING_CONFIRMING' then
    raise exception '共同理解版本已经变化，请刷新后重试。' using errcode = '40001';
  end if;

  update public.result_confirmations
  set invalidated_at = now()
  where result_id = v_result.id and participant_id = v_participant_id
    and invalidated_at is null;
  select coalesce(max(version), 0) + 1 into v_version
  from public.result_confirmations
  where result_id = v_result.id and participant_id = v_participant_id;
  insert into public.result_confirmations (
    room_id, result_id, participant_id, version, decision, candidate_hash
  ) values (
    p_room_id, v_result.id, v_participant_id, v_version, p_decision, p_candidate_hash
  );

  update private.participant_workspaces_v2
  set pending_feedback_result_id = case when p_decision = 'INACCURATE' then v_result.id else null end,
      pending_feedback_text = case when p_decision = 'INACCURATE' then v_feedback else null end
  where participant_id = v_participant_id and owner_user_id = v_user_id;

  select count(*) into v_accurate_count
  from public.result_confirmations confirmation
  where confirmation.result_id = v_result.id
    and confirmation.decision = 'ACCURATE'
    and confirmation.invalidated_at is null;
  if v_accurate_count = 2 then
    update public.rooms set phase_v2 = 'ACTION_GENERATING'
    where id = p_room_id and current_understanding_result_id = v_result.id;
  end if;

  return jsonb_build_object(
    'decision', p_decision,
    'accurateCount', v_accurate_count,
    'bothConfirmed', v_accurate_count = 2,
    'phase', case when v_accurate_count = 2 then 'ACTION_GENERATING' else 'UNDERSTANDING_CONFIRMING' end
  );
end;
$$;

create or replace function public.reopen_expression_v2(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant public.participants;
  v_next_state text;
  v_previous_state text;
begin
  select participant.* into v_participant
  from public.participants participant
  join public.rooms room on room.id = participant.room_id
  where participant.room_id = p_room_id and participant.user_id = v_user_id
    and room.workflow_version = 2
  for update of participant;
  if v_participant.id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;
  if exists (select 1 from public.rooms where id = p_room_id and phase_v2 = 'PAUSED') then
    raise exception '当前沟通已经暂停。' using errcode = '55000';
  end if;
  v_next_state := case when v_participant.role = 'A' then 'A_REVIEWING' else 'B_REVIEWING' end;
  select state into v_previous_state from public.rooms where id = p_room_id for update;

  update public.result_confirmations confirmation
  set invalidated_at = now()
  where confirmation.room_id = p_room_id and confirmation.invalidated_at is null;
  update public.rooms
  set state = v_next_state, version = version + 1,
      phase_v2 = 'PRIVATE_EXPRESSION', current_understanding_result_id = null,
      current_action_result_id = null
  where id = p_room_id and phase_v2 <> 'PAUSED';
  update public.participants
  set current_expression_id = null, public_progress_v2 = 'ORGANIZING', version = version + 1
  where id = v_participant.id;
  update private.participant_workspaces_v2
  set flow_state = 'REVISING', pending_feedback_result_id = null, pending_feedback_text = null
  where participant_id = v_participant.id and owner_user_id = v_user_id;
  update private.ai_jobs
  set status = 'CANCELED', finished_at = now(), lease_until = null
  where room_id = p_room_id and job_type in ('CONSENSUS', 'REVIEW_UNDERSTANDING')
    and status in ('QUEUED', 'PROCESSING', 'FAILED_RETRYABLE');

  insert into public.room_events (room_id, participant_id, event_type, from_state, to_state, payload)
  values (p_room_id, v_participant.id, 'EXPRESSION_V2_REOPENED', v_previous_state, v_next_state, '{}'::jsonb);
  return jsonb_build_object('state', v_next_state, 'phase', 'PRIVATE_EXPRESSION');
end;
$$;

create or replace function private.cancel_shared_understanding_jobs_on_pause_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phase_v2 = 'PAUSED' and old.phase_v2 is distinct from 'PAUSED' then
    update private.ai_jobs
    set status = 'CANCELED', finished_at = now(), lease_until = null
    where room_id = new.id
      and job_type in ('CONSENSUS', 'REVIEW_UNDERSTANDING')
      and status in ('QUEUED', 'PROCESSING', 'FAILED_RETRYABLE');
  end if;
  return new;
end;
$$;

create trigger rooms_cancel_shared_understanding_jobs_on_pause_v2
after update of phase_v2 on public.rooms
for each row execute function private.cancel_shared_understanding_jobs_on_pause_v2();

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
        and workspace.source_hash = v_job.input_hash
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
        and workspace.source_hash = v_job.input_hash
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

create or replace function public.internal_complete_consensus_job_v2(
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
  v_review_job private.ai_jobs;
  v_room public.rooms;
  v_idempotency_key text;
begin
  if jsonb_typeof(p_result_payload) is distinct from 'object'
     or octet_length(p_result_payload::text) > 24000
     or coalesce(p_result_payload->>'safetyDisposition', '') not in ('ALLOW', 'WARN', 'BLOCK_SHARE', 'PAUSE') then
    raise exception 'Consensus result payload is invalid.';
  end if;
  select * into v_job from private.ai_jobs where id = p_job_id for update;
  if v_job.id is null or v_job.job_type <> 'CONSENSUS' or v_job.status <> 'PROCESSING'
     or v_job.locked_by is distinct from left(btrim(p_worker_id), 120) then
    return jsonb_build_object('status', 'IGNORED');
  end if;
  select * into v_room from public.rooms where id = v_job.room_id for update;
  if v_room.phase_v2 = 'PAUSED'
     or not exists (select 1 from public.participants where room_id = v_job.room_id and role = 'A' and current_expression_id = v_job.expression_a_id)
     or not exists (select 1 from public.participants where room_id = v_job.room_id and role = 'B' and current_expression_id = v_job.expression_b_id) then
    update private.ai_jobs set status = 'STALE', finished_at = now(), lease_until = null where id = v_job.id;
    return jsonb_build_object('status', 'STALE');
  end if;
  if p_result_payload->>'safetyDisposition' in ('BLOCK_SHARE', 'PAUSE') then
    update private.ai_jobs set status = 'FAILED_FINAL', model_id = left(p_model_id, 120),
      result_payload = p_result_payload,
      safety_disposition = p_result_payload->>'safetyDisposition',
      error_code = 'UNDERSTANDING_SAFETY_STOP',
      provider_request_ref = left(nullif(p_provider_request_ref, ''), 200),
      token_input = p_token_input, token_output = p_token_output, latency_ms = p_latency_ms,
      finished_at = now(), lease_until = null where id = v_job.id;
    return jsonb_build_object('status', 'FAILED_FINAL');
  end if;

  update private.ai_jobs set status = 'SUCCEEDED', model_id = left(p_model_id, 120),
    result_payload = p_result_payload,
    safety_disposition = p_result_payload->>'safetyDisposition',
    provider_request_ref = left(nullif(p_provider_request_ref, ''), 200),
    token_input = p_token_input, token_output = p_token_output, latency_ms = p_latency_ms,
    finished_at = now(), lease_until = null where id = v_job.id;

  v_idempotency_key := encode(extensions.digest(convert_to(
    'REVIEW_UNDERSTANDING:' || v_job.id::text || ':' || v_job.semantic_attempt::text,
    'UTF8'
  ), 'sha256'), 'hex');
  insert into private.ai_jobs (
    room_id, requested_by_participant_id, job_type,
    expression_a_id, expression_b_id, input_hash,
    pipeline_version, prompt_version, semantic_attempt, parent_job_id, idempotency_key
  ) values (
    v_job.room_id, v_job.requested_by_participant_id, 'REVIEW_UNDERSTANDING',
    v_job.expression_a_id, v_job.expression_b_id, v_job.input_hash,
    v_job.pipeline_version, 'review-understanding-v1', v_job.semantic_attempt, v_job.id, v_idempotency_key
  ) on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
  returning * into v_review_job;
  return jsonb_build_object('status', 'SUCCEEDED', 'nextJobId', v_review_job.id);
end;
$$;

create or replace function public.internal_complete_understanding_review_v2(
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
  v_parent private.ai_jobs;
  v_next private.ai_jobs;
  v_result_id uuid;
  v_version bigint;
  v_candidate jsonb;
  v_content_hash text;
  v_idempotency_key text;
  v_room public.rooms;
begin
  if jsonb_typeof(p_result_payload) is distinct from 'object'
     or coalesce(p_result_payload->>'verdict', '') not in ('PASS', 'REVISE', 'BLOCK')
     or coalesce(p_result_payload->>'safetyDisposition', '') not in ('ALLOW', 'WARN', 'BLOCK_SHARE', 'PAUSE')
     or jsonb_typeof(p_result_payload->'issues') is distinct from 'array'
     or ((p_result_payload->>'verdict' = 'PASS') is distinct from (jsonb_array_length(p_result_payload->'issues') = 0))
     or octet_length(p_result_payload::text) > 16000 then
    raise exception 'Understanding review payload is invalid.';
  end if;
  select * into v_job from private.ai_jobs where id = p_job_id for update;
  select * into v_parent from private.ai_jobs where id = v_job.parent_job_id;
  if v_job.id is null or v_job.job_type <> 'REVIEW_UNDERSTANDING' or v_job.status <> 'PROCESSING'
     or v_job.locked_by is distinct from left(btrim(p_worker_id), 120)
     or v_parent.status <> 'SUCCEEDED' then
    return jsonb_build_object('status', 'IGNORED');
  end if;
  select * into v_room from public.rooms where id = v_job.room_id for update;
  if v_room.phase_v2 = 'PAUSED'
     or not exists (select 1 from public.participants where room_id = v_job.room_id and role = 'A' and current_expression_id = v_job.expression_a_id)
     or not exists (select 1 from public.participants where room_id = v_job.room_id and role = 'B' and current_expression_id = v_job.expression_b_id) then
    update private.ai_jobs set status = 'STALE', finished_at = now(), lease_until = null where id = v_job.id;
    return jsonb_build_object('status', 'STALE');
  end if;

  update private.ai_jobs set model_id = left(p_model_id, 120), result_payload = p_result_payload,
    review_issues = p_result_payload->'issues', safety_disposition = p_result_payload->>'safetyDisposition',
    provider_request_ref = left(nullif(p_provider_request_ref, ''), 200),
    token_input = p_token_input, token_output = p_token_output, latency_ms = p_latency_ms,
    finished_at = now(), lease_until = null where id = v_job.id;

  if p_result_payload->>'verdict' = 'PASS'
     and p_result_payload->>'safetyDisposition' in ('ALLOW', 'WARN')
     and v_parent.safety_disposition in ('ALLOW', 'WARN') then
    update private.ai_jobs set status = 'SUCCEEDED' where id = v_job.id;
    v_candidate := v_parent.result_payload - array['safetyDisposition', 'safetyMessage'];
    v_content_hash := encode(extensions.digest(convert_to(v_candidate::text, 'UTF8'), 'sha256'), 'hex');
    select result.id into v_result_id from public.shared_results result
    where result.room_id = v_job.room_id and result.result_type = 'UNDERSTANDING'
      and result.expression_a_id = v_job.expression_a_id and result.expression_b_id = v_job.expression_b_id
      and result.content_hash = v_content_hash order by result.version desc limit 1;
    if v_result_id is null then
      select coalesce(max(version), 0) + 1 into v_version
      from public.shared_results where room_id = v_job.room_id and result_type = 'UNDERSTANDING';
      insert into public.shared_results (
        room_id, result_type, version, expression_a_id, expression_b_id,
        payload, content_hash
      ) values (
        v_job.room_id, 'UNDERSTANDING', v_version, v_job.expression_a_id, v_job.expression_b_id,
        v_candidate, v_content_hash
      ) returning id into v_result_id;
    end if;
    update public.result_confirmations set invalidated_at = now()
    where room_id = v_job.room_id and invalidated_at is null;
    update public.rooms set current_understanding_result_id = v_result_id,
      current_action_result_id = null, phase_v2 = 'UNDERSTANDING_CONFIRMING'
    where id = v_job.room_id and phase_v2 <> 'PAUSED';
    return jsonb_build_object('status', 'SUCCEEDED', 'publishedResultId', v_result_id);
  end if;

  if p_result_payload->>'verdict' = 'REVISE'
     and p_result_payload->>'safetyDisposition' in ('ALLOW', 'WARN')
     and v_parent.safety_disposition in ('ALLOW', 'WARN')
     and v_job.semantic_attempt < 1 then
    update private.ai_jobs set status = 'SUCCEEDED' where id = v_job.id;
    v_idempotency_key := encode(extensions.digest(convert_to(
      'CONSENSUS_REVISION:' || v_job.id::text || ':1', 'UTF8'
    ), 'sha256'), 'hex');
    insert into private.ai_jobs (
      room_id, requested_by_participant_id, job_type,
      expression_a_id, expression_b_id, input_hash,
      pipeline_version, prompt_version, semantic_attempt, parent_job_id, idempotency_key
    ) values (
      v_job.room_id, v_job.requested_by_participant_id, 'CONSENSUS',
      v_job.expression_a_id, v_job.expression_b_id, v_job.input_hash,
      v_job.pipeline_version, 'consensus-revision-v1', 1, v_job.id, v_idempotency_key
    ) on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
    returning * into v_next;
    return jsonb_build_object('status', 'SUCCEEDED', 'nextJobId', v_next.id);
  end if;

  update private.ai_jobs set status = 'FAILED_FINAL', error_code = case
    when p_result_payload->>'safetyDisposition' in ('BLOCK_SHARE', 'PAUSE') then 'UNDERSTANDING_SAFETY_STOP'
    else 'UNDERSTANDING_REVIEW_FAILED'
  end where id = v_job.id;
  return jsonb_build_object('status', 'FAILED_FINAL');
end;
$$;

revoke all on function public.request_consensus_job_v2(uuid) from public, anon, authenticated;
revoke all on function public.get_understanding_status_v2(uuid) from public, anon, authenticated;
revoke all on function public.confirm_understanding_v2(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.reopen_expression_v2(uuid) from public, anon, authenticated;
revoke all on function public.internal_complete_consensus_job_v2(uuid, text, text, jsonb, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.internal_complete_understanding_review_v2(uuid, text, text, jsonb, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function private.cancel_shared_understanding_jobs_on_pause_v2() from public, anon, authenticated;

grant execute on function public.request_consensus_job_v2(uuid) to authenticated;
grant execute on function public.get_understanding_status_v2(uuid) to authenticated;
grant execute on function public.confirm_understanding_v2(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.reopen_expression_v2(uuid) to authenticated;
grant execute on function public.internal_complete_consensus_job_v2(uuid, text, text, jsonb, text, integer, integer, integer) to service_role;
grant execute on function public.internal_complete_understanding_review_v2(uuid, text, text, jsonb, text, integer, integer, integer) to service_role;
