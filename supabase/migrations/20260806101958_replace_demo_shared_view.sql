create or replace function private.create_shared_view(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.perspectives;
  v_b public.perspectives;
begin
  select p.* into v_a
  from public.perspectives p
  join public.participants participant on participant.id = p.participant_id
  where p.room_id = p_room_id and participant.role = 'A'
  order by p.version desc
  limit 1;

  select p.* into v_b
  from public.perspectives p
  join public.participants participant on participant.id = p.participant_id
  where p.room_id = p_room_id and participant.role = 'B'
  order by p.version desc
  limit 1;

  if v_a.id is null or v_b.id is null then
    raise exception '双方都确认自己的观点后才能生成共同视图。' using errcode = '55000';
  end if;

  insert into public.shared_views (
    room_id, common_ground, disagreement, core_question
  ) values (
    p_room_id,
    '双方都愿意把本人确认过的版本放到共同空间，继续理解这件事。',
    format(
      'A 的理解：%s；A 的请求：%s。B 的理解：%s；B 的请求：%s。',
      left(v_a.meaning, 400), left(v_a.request, 400),
      left(v_b.meaning, 400), left(v_b.request, 400)
    ),
    '在理解彼此的请求后，你们愿意先确认哪一点，或明确保留哪一处不同？'
  )
  on conflict (room_id) do update
  set version = public.shared_views.version + 1,
      common_ground = excluded.common_ground,
      disagreement = excluded.disagreement,
      core_question = excluded.core_question,
      created_at = now();
end;
$$;

revoke all on function private.create_shared_view(uuid) from public, anon, authenticated;
