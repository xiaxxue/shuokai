-- Remove the user-triggerable two-party demo without rewriting historical
-- migrations or deleting legacy simulated-room records.
revoke all on function public.simulate_partner(uuid)
from public, anon, authenticated, service_role;

drop function public.simulate_partner(uuid);

-- Legacy simulated rooms may remain readable, but they must no longer cause a
-- synthetic participant to accept a new agreement automatically.
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
begin
  select * into v_participant from public.participants
  where room_id = p_room_id and user_id = (select auth.uid());
  if v_participant.id is null then
    raise exception '你不是这个房间的参与者。' using errcode = '42501';
  end if;
  if nullif(btrim(p_proposal), '') is null then
    raise exception '约定内容不能为空。';
  end if;

  insert into public.agreements (room_id, proposal, review_at, accepted_b)
  values (p_room_id, left(btrim(p_proposal), 2000), p_review_at, false)
  on conflict (room_id) do update
  set proposal = excluded.proposal,
      review_at = excluded.review_at,
      accepted_a = false,
      accepted_b = false,
      activated_at = null,
      created_at = now();

  perform private.transition_room(
    p_room_id, 'COMMON_VIEW_READY', 'AGREEMENT_PENDING',
    'AGREEMENT_PROPOSED', v_participant.id
  );
  return jsonb_build_object('state', 'AGREEMENT_PENDING');
end;
$$;

revoke all on function public.propose_agreement(uuid, text, timestamptz)
from public, anon;
grant execute on function public.propose_agreement(uuid, text, timestamptz)
to authenticated;

-- Rollback: restore public.simulate_partner(uuid) and the prior
-- public.propose_agreement(uuid, text, timestamptz) definition from
-- 20260806053428_migrate_from_d1_to_supabase.sql, then grant the former to
-- authenticated. Legacy rows are intentionally left untouched in both
-- directions.
