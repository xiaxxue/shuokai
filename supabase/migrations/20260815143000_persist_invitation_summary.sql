-- Persist the recipient-facing invitation summary with the confirmed expression version.
-- The existing v2 confirmation RPC remains available during a rolling client deploy.

alter table public.expression_versions
  add column if not exists invitation_title text,
  add column if not exists invitation_summary text,
  add column if not exists invitation_source_hash text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expression_versions_invitation_pair_check'
      and conrelid = 'public.expression_versions'::regclass
  ) then
    alter table public.expression_versions
      add constraint expression_versions_invitation_pair_check check (
        (invitation_title is null and invitation_summary is null and invitation_source_hash is null)
        or
        (
          invitation_title is not null
          and invitation_summary is not null
          and invitation_source_hash is not null
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'expression_versions_invitation_v2_check'
      and conrelid = 'public.expression_versions'::regclass
  ) then
    alter table public.expression_versions
      add constraint expression_versions_invitation_v2_check check (
        schema_version < 2
        or (
          char_length(btrim(invitation_title)) between 4 and 40
          and invitation_title !~ E'[\\r\\n]'
          and char_length(btrim(invitation_summary)) between 20 and 300
          and invitation_source_hash ~ '^[a-f0-9]{64}$'
        )
      );
  end if;
end;
$$;

create or replace function public.confirm_expression_version_v3(
  p_room_id uuid,
  p_expected_revision bigint,
  p_payload jsonb,
  p_invitation_title text,
  p_invitation_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_title text;
  v_summary text;
  v_source_text text;
  v_source_hash text;
  v_content_hash text;
  v_confirmation jsonb;
  v_expression public.expression_versions;
  v_current_expression_id uuid;
  v_flow_state text;
  v_room_state text;
begin
  if v_user_id is null then
    raise exception '请先登录。' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception '确认内容格式无效。';
  end if;

  v_title := regexp_replace(btrim(coalesce(p_invitation_title, '')), '[[:space:]]+', ' ', 'g');
  v_summary := regexp_replace(btrim(coalesce(p_invitation_summary, '')), '[[:space:]]+', ' ', 'g');
  if char_length(v_title) not between 4 and 40
     or v_title ~ E'[\\r\\n]'
     or char_length(v_summary) not between 20 and 300 then
    raise exception '邀请标题需要 4—40 字，说明需要 20—300 字。';
  end if;

  v_source_text := nullif(btrim(case p_payload->>'mode'
    when 'NVC' then p_payload->>'observation'
    when 'FACT_DISPUTE' then p_payload->>'claim'
    when 'BOUNDARY' then p_payload->>'boundary'
    else null
  end), '');
  if v_source_text is null then
    raise exception '请先确认一段具体事件，再生成邀请说明。';
  end if;

  v_source_hash := encode(
    extensions.digest(
      convert_to((p_payload->>'mode') || E'\n' || regexp_replace(v_source_text, '[[:space:]]+', ' ', 'g'), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_content_hash := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'payload', p_payload,
        'invitation', jsonb_build_object(
          'title', v_title,
          'summary', v_summary,
          'sourceHash', v_source_hash
        )
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  select participant.current_expression_id, workspace.flow_state
  into v_current_expression_id, v_flow_state
  from public.participants participant
  join private.participant_workspaces_v2 workspace
    on workspace.participant_id = participant.id
   and workspace.owner_user_id = v_user_id
  where participant.room_id = p_room_id
    and participant.user_id = v_user_id;

  if v_flow_state = 'CONFIRMED' and v_current_expression_id is not null then
    select expression.* into v_expression
    from public.expression_versions expression
    where expression.id = v_current_expression_id
      and expression.room_id = p_room_id
      and expression.owner_user_id = v_user_id;
    if v_expression.id is not null
       and v_expression.payload = p_payload
       and v_expression.schema_version >= 2
       and v_expression.invitation_title = v_title
       and v_expression.invitation_summary = v_summary
       and v_expression.invitation_source_hash = v_source_hash
       and v_expression.content_hash = v_content_hash then
      select room.state into v_room_state from public.rooms room where room.id = p_room_id;
      return jsonb_build_object(
        'state', v_room_state,
        'version', v_expression.version,
        'expressionId', v_expression.id,
        'contentHash', v_content_hash
      );
    end if;
    raise exception '确认版本已经发生变化，请刷新后重试。' using errcode = '40001';
  end if;

  begin
    v_confirmation := public.confirm_expression_version_v2(
      p_room_id,
      p_expected_revision,
      p_payload
    );
  exception
    when serialization_failure then
      v_confirmation := null;
  end;

  if v_confirmation is null then
    select expression.* into v_expression
    from public.participants participant
    join public.expression_versions expression
      on expression.id = participant.current_expression_id
    where participant.room_id = p_room_id
      and participant.user_id = v_user_id
      and expression.owner_user_id = v_user_id;
    if v_expression.id is not null
       and v_expression.payload = p_payload
       and v_expression.schema_version >= 2
       and v_expression.invitation_title = v_title
       and v_expression.invitation_summary = v_summary
       and v_expression.invitation_source_hash = v_source_hash
       and v_expression.content_hash = v_content_hash then
      select room.state into v_room_state from public.rooms room where room.id = p_room_id;
      return jsonb_build_object(
        'state', v_room_state,
        'version', v_expression.version,
        'expressionId', v_expression.id,
        'contentHash', v_content_hash
      );
    end if;
    raise exception '确认版本已经发生变化，请刷新后重试。' using errcode = '40001';
  end if;

  update public.expression_versions expression
  set schema_version = 2,
      invitation_title = v_title,
      invitation_summary = v_summary,
      invitation_source_hash = v_source_hash,
      content_hash = v_content_hash
  where expression.id = (v_confirmation->>'expressionId')::uuid
    and expression.room_id = p_room_id
    and expression.owner_user_id = v_user_id
  returning expression.* into v_expression;

  if v_expression.id is null then
    raise exception '确认内容没有保存，请重试。' using errcode = '40001';
  end if;

  return v_confirmation || jsonb_build_object('contentHash', v_content_hash);
end;
$$;

revoke all on function public.confirm_expression_version_v3(uuid, bigint, jsonb, text, text)
from public, anon, authenticated;
grant execute on function public.confirm_expression_version_v3(uuid, bigint, jsonb, text, text)
to authenticated;

comment on column public.expression_versions.invitation_title is
  'Recipient-facing invitation title confirmed with this immutable expression version.';
comment on column public.expression_versions.invitation_summary is
  'Recipient-facing invitation explanation confirmed with this immutable expression version.';
comment on column public.expression_versions.invitation_source_hash is
  'SHA-256 of the normalized event-like source field used for the invitation explanation.';

drop policy if exists expression_versions_select_owner_or_current on public.expression_versions;
create policy expression_versions_select_owner_or_current
on public.expression_versions
for select to authenticated
using (
  owner_user_id = (select auth.uid())
  or (
    (select private.is_room_member(room_id))
    and exists (
      select 1
      from public.participants shared_participant
      where shared_participant.current_expression_id = expression_versions.id
        and shared_participant.room_id = expression_versions.room_id
    )
    and exists (
      select 1
      from public.participants viewer
      where viewer.room_id = expression_versions.room_id
        and viewer.user_id = (select auth.uid())
        and viewer.current_expression_id is not null
    )
  )
);

create or replace function public.get_invitation_context_v3(p_room_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_inviter public.participants;
  v_expression public.expression_versions;
  v_topic text;
  v_name text;
begin
  if v_user_id is null or not exists (
    select 1 from public.participants participant
    where participant.room_id = p_room_id
      and participant.user_id = v_user_id
  ) then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;

  select participant.* into v_inviter
  from public.participants participant
  where participant.room_id = p_room_id
    and participant.role = 'A';

  if v_inviter.id is null then
    raise exception '暂时无法读取这次邀请。' using errcode = 'P0002';
  end if;

  if v_inviter.current_expression_id is not null then
    select expression.* into v_expression
    from public.expression_versions expression
    where expression.id = v_inviter.current_expression_id
      and expression.room_id = p_room_id;
  end if;

  v_topic := left(regexp_replace(btrim(case v_expression.mode
    when 'NVC' then v_expression.payload->>'observation'
    when 'FACT_DISPUTE' then v_expression.payload->>'claim'
    when 'BOUNDARY' then v_expression.payload->>'boundary'
    else ''
  end), '[[:space:]]+', ' ', 'g'), 180);
  v_name := nullif(left(regexp_replace(btrim(v_inviter.display_name), '[[:space:]]+', ' ', 'g'), 60), '');
  if v_name is null or v_name in ('我', 'Lin') then v_name := '邀请你的人'; end if;

  return jsonb_build_object(
    'inviterName', v_name,
    'topic', coalesce(v_topic, ''),
    'title', coalesce(v_expression.invitation_title, ''),
    'summary', coalesce(v_expression.invitation_summary, ''),
    'confirmedSummary', v_expression.invitation_title is not null
      and v_expression.invitation_summary is not null
  );
end;
$$;

revoke all on function public.get_invitation_context_v3(uuid) from public, anon, authenticated;
grant execute on function public.get_invitation_context_v3(uuid) to authenticated;
