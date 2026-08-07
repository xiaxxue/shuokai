create table private.transcription_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0)
);

create or replace function public.internal_reserve_transcription(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean;
begin
  insert into private.transcription_rate_limits as quota (
    user_id, window_started_at, request_count
  ) values (
    p_user_id, now(), 1
  )
  on conflict (user_id) do update
  set window_started_at = case
        when quota.window_started_at <= now() - interval '1 hour' then now()
        else quota.window_started_at
      end,
      request_count = case
        when quota.window_started_at <= now() - interval '1 hour' then 1
        else quota.request_count + 1
      end
  returning request_count <= 10 into v_allowed;

  return v_allowed;
end;
$$;

revoke all on table private.transcription_rate_limits from public, anon, authenticated;
revoke all on function public.internal_reserve_transcription(uuid) from public, anon, authenticated;
grant execute on function public.internal_reserve_transcription(uuid) to service_role;
