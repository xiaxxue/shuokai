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
      me.role
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
  ), enriched_page as (
    select
      page.*,
      nullif(left(regexp_replace(btrim(case topic_expression.mode
        when 'NVC' then topic_expression.payload->>'observation'
        when 'FACT_DISPUTE' then topic_expression.payload->>'claim'
        when 'BOUNDARY' then topic_expression.payload->>'boundary'
        else null
      end), '[[:space:]]+', ' ', 'g'), 180), '') as topic,
      (select count(*)::integer from public.participants member where member.room_id = page.id) as participant_count
    from page
    left join lateral (
      select expression.mode, expression.payload
      from public.participants topic_participant
      join public.expression_versions expression
        on expression.id = topic_participant.current_expression_id
       and expression.room_id = page.id
      where topic_participant.room_id = page.id
      order by case topic_participant.role when 'A' then 0 else 1 end
      limit 1
    ) topic_expression on true
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'roomId', enriched_page.id,
      'code', enriched_page.code,
      'state', enriched_page.state,
      'goal', enriched_page.goal,
      'topic', enriched_page.topic,
      'workflowVersion', enriched_page.workflow_version,
      'phaseV2', enriched_page.phase_v2,
      'dialogueRound', enriched_page.dialogue_round,
      'role', enriched_page.role,
      'participantCount', enriched_page.participant_count,
      'createdAt', enriched_page.created_at,
      'updatedAt', enriched_page.updated_at,
      'expiresAt', enriched_page.expires_at
    ) order by enriched_page.updated_at desc, enriched_page.id desc), '[]'::jsonb),
    (select count(*) > v_limit from candidates),
    (array_agg(enriched_page.updated_at order by enriched_page.updated_at asc, enriched_page.id asc))[1],
    (array_agg(enriched_page.id order by enriched_page.updated_at asc, enriched_page.id asc))[1]
  into v_items, v_has_more, v_next_updated_at, v_next_room_id
  from enriched_page;

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
