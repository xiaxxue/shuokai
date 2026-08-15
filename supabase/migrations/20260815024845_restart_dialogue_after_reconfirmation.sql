-- A may revise after both expressions were previously confirmed. Once A confirms
-- the new version, keep B's still-confirmed expression and start a fresh dialogue
-- generation instead of allowing the previous dialogue to support a new result.

create or replace function private.restart_dialogue_after_a_reconfirmation_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a_participant_id uuid;
begin
  if new.workflow_version <> 2
     or new.phase_v2 <> 'PRIVATE_EXPRESSION'
     or old.state <> 'A_REVIEWING'
     or new.state <> 'WAITING_FOR_B' then
    return new;
  end if;

  select participant.id into v_a_participant_id
  from public.participants participant
  where participant.room_id = new.id
    and participant.role = 'A'
    and participant.current_expression_id is not null;

  if v_a_participant_id is null or not exists (
    select 1
    from public.participants participant
    where participant.room_id = new.id
      and participant.role = 'B'
      and participant.current_expression_id is not null
  ) then
    return new;
  end if;

  perform private.transition_room(
    new.id,
    'WAITING_FOR_B',
    'COMMON_VIEW_READY',
    'BOTH_EXPRESSIONS_V2_READY',
    v_a_participant_id,
    jsonb_build_object('reconfirmedRole', 'A')
  );

  update public.rooms
  set phase_v2 = 'UNDERSTANDING_GENERATING'
  where id = new.id
    and phase_v2 = 'PRIVATE_EXPRESSION';

  return new;
end;
$$;

drop trigger if exists rooms_restart_dialogue_after_a_reconfirmation_v2 on public.rooms;
create trigger rooms_restart_dialogue_after_a_reconfirmation_v2
after update of state on public.rooms
for each row execute function private.restart_dialogue_after_a_reconfirmation_v2();

revoke all on function private.restart_dialogue_after_a_reconfirmation_v2()
from public, anon, authenticated;
