create or replace function public.list_my_rooms_v2(
  p_limit integer default 20,
  p_before_updated_at timestamptz default null,
  p_before_room_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 30);
  v_items jsonb;
  v_has_more boolean;
  v_next_updated_at timestamptz;
  v_next_room_id uuid;
begin
  if v_user_id is null then
    raise exception '请先登录。' using errcode = '42501';
  end if;
  if (p_before_updated_at is null) <> (p_before_room_id is null) then
    raise exception '历史记录游标不完整。' using errcode = '22023';
  end if;

  with candidates as (
    select
      room.id,
      room.code,
      room.state,
      room.goal,
      room.workflow_version,
      room.phase_v2,
      room.dialogue_round,
      room.created_at,
      room.updated_at,
      room.expires_at,
      me.role,
      (select count(*)::integer from public.participants member where member.room_id = room.id) as participant_count
    from public.participants me
    join public.rooms room on room.id = me.room_id
    where me.user_id = v_user_id
      and (
        p_before_updated_at is null
        or (room.updated_at, room.id) < (p_before_updated_at, p_before_room_id)
      )
    order by room.updated_at desc, room.id desc
    limit v_limit + 1
  ), page as (
    select * from candidates
    order by updated_at desc, id desc
    limit v_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'roomId', page.id,
      'code', page.code,
      'state', page.state,
      'goal', page.goal,
      'workflowVersion', page.workflow_version,
      'phaseV2', page.phase_v2,
      'dialogueRound', page.dialogue_round,
      'role', page.role,
      'participantCount', page.participant_count,
      'createdAt', page.created_at,
      'updatedAt', page.updated_at,
      'expiresAt', page.expires_at
    ) order by page.updated_at desc, page.id desc), '[]'::jsonb),
    (select count(*) > v_limit from candidates),
    (array_agg(page.updated_at order by page.updated_at asc, page.id asc))[1],
    (array_agg(page.id order by page.updated_at asc, page.id asc))[1]
  into v_items, v_has_more, v_next_updated_at, v_next_room_id
  from page;

  return jsonb_build_object(
    'items', v_items,
    'hasMore', coalesce(v_has_more, false),
    'nextCursor', case
      when coalesce(v_has_more, false) then jsonb_build_object(
        'updatedAt', v_next_updated_at,
        'roomId', v_next_room_id
      )
      else null
    end
  );
end;
$$;

revoke all on function public.list_my_rooms_v2(integer, timestamptz, uuid)
from public, anon, authenticated;
grant execute on function public.list_my_rooms_v2(integer, timestamptz, uuid)
to authenticated;
