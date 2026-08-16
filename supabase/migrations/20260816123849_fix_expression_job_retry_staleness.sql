-- Identical retries must not advance the private workspace revision. A retry
-- that reuses an idempotent AI job must also bind that job to the current
-- workspace revision so the worker can commit a result for unchanged input.

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
  v_workspace private.participant_workspaces_v2;
  v_source_text text := nullif(btrim(left(p_source_text, 12000)), '');
  v_manual_payload jsonb := coalesce(p_manual_payload, '{}'::jsonb);
  v_source_hash text;
begin
  if v_user_id is null then
    raise exception '请先登录。' using errcode = '42501';
  end if;
  if v_source_text is null then raise exception '表达内容不能为空。'; end if;
  if coalesce(p_selected_mode, '') not in ('NVC', 'FACT_DISPUTE', 'BOUNDARY', 'PAUSE') then
    raise exception '请选择有效的表达路径。';
  end if;
  if jsonb_typeof(v_manual_payload) <> 'object'
     or octet_length(v_manual_payload::text) > 16000 then
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

  select workspace.* into v_workspace
  from private.participant_workspaces_v2 workspace
  where workspace.participant_id = v_participant.id
    and workspace.owner_user_id = v_user_id
  for update;
  if v_workspace.id is null then
    raise exception '找不到当前表达草稿。' using errcode = 'P0002';
  end if;

  v_source_hash := encode(
    extensions.digest(
      convert_to(v_source_text || E'\n' || p_selected_mode, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  if v_workspace.source_text is not distinct from v_source_text
     and v_workspace.selected_mode is not distinct from p_selected_mode
     and v_workspace.manual_payload is not distinct from v_manual_payload then
    return jsonb_build_object(
      'revision', v_workspace.revision,
      'sourceHash', v_source_hash,
      'selectedMode', p_selected_mode
    );
  end if;

  if v_workspace.revision is distinct from p_expected_revision then
    raise exception '草稿刚刚发生了变化，请刷新后重试。' using errcode = '40001';
  end if;

  update private.participant_workspaces_v2
  set revision = revision + 1,
      flow_state = case when flow_state = 'CONFIRMED' then 'REVISING' else 'DRAFTING' end,
      source_text = v_source_text,
      selected_mode = p_selected_mode,
      manual_payload = v_manual_payload,
      ai_candidate_payload = null,
      source_hash = v_source_hash
  where id = v_workspace.id
  returning * into v_workspace;

  update public.participants
  set public_progress_v2 = 'ORGANIZING',
      version = version + 1
  where id = v_participant.id;

  return jsonb_build_object(
    'revision', v_workspace.revision,
    'sourceHash', v_source_hash,
    'selectedMode', p_selected_mode
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
  set draft_revision = excluded.draft_revision,
      status = case
        when ai_jobs.status in ('FAILED_FINAL', 'STALE', 'CANCELED') then 'QUEUED'
        else ai_jobs.status
      end,
      attempt_no = case
        when ai_jobs.status in ('FAILED_FINAL', 'STALE', 'CANCELED') then 0
        else ai_jobs.attempt_no
      end,
      locked_by = case
        when ai_jobs.status in ('FAILED_FINAL', 'STALE', 'CANCELED') then null
        else ai_jobs.locked_by
      end,
      lease_until = case
        when ai_jobs.status in ('FAILED_FINAL', 'STALE', 'CANCELED') then null
        else ai_jobs.lease_until
      end,
      started_at = case
        when ai_jobs.status in ('FAILED_FINAL', 'STALE', 'CANCELED') then null
        else ai_jobs.started_at
      end,
      error_code = case
        when ai_jobs.status in ('FAILED_FINAL', 'STALE', 'CANCELED') then null
        else ai_jobs.error_code
      end,
      finished_at = case
        when ai_jobs.status in ('FAILED_FINAL', 'STALE', 'CANCELED') then null
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

revoke all on function public.save_expression_workspace_v2(uuid, bigint, text, text, jsonb)
from public, anon, authenticated;
revoke all on function public.request_understanding_job_v2(uuid, bigint)
from public, anon, authenticated;

grant execute on function public.save_expression_workspace_v2(uuid, bigint, text, text, jsonb)
to authenticated;
grant execute on function public.request_understanding_job_v2(uuid, bigint)
to authenticated;
