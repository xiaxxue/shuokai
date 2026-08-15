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
    'phaseV2', (select phase_v2 from public.rooms where id = v_room_id),
    'invitationContext', public.get_invitation_context_v3(v_room_id)
  );
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
    ),
    'invitationContext', public.get_invitation_context_v3(p_room_id)
  );
end;
$$;

revoke all on function public.join_room_v2(text, text) from public, anon, authenticated;
revoke all on function public.get_room_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.join_room_v2(text, text) to authenticated;
grant execute on function public.get_room_snapshot(uuid) to authenticated;
