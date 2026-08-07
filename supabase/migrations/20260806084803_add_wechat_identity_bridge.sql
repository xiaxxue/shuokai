-- Migration version aligned with the deployed Supabase history.
create table private.wechat_identities (
  openid text primary key check (char_length(openid) between 8 and 128),
  unionid text,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create unique index wechat_identities_unionid_idx
on private.wechat_identities (unionid)
where unionid is not null;

create or replace function public.internal_get_wechat_user(p_openid text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  update private.wechat_identities
  set last_login_at = now()
  where openid = p_openid
  returning user_id;
$$;

create or replace function public.internal_bind_wechat_user(
  p_openid text,
  p_unionid text,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.wechat_identities as identity (openid, unionid, user_id)
  values (p_openid, nullif(p_unionid, ''), p_user_id)
  on conflict (openid) do update
  set last_login_at = now(),
      unionid = coalesce(private.wechat_identities.unionid, excluded.unionid)
  returning identity.user_id into p_user_id;
  return p_user_id;
end;
$$;

revoke all on table private.wechat_identities from public, anon, authenticated;
revoke all on function public.internal_get_wechat_user(text) from public, anon, authenticated;
revoke all on function public.internal_bind_wechat_user(text, text, uuid) from public, anon, authenticated;
grant execute on function public.internal_get_wechat_user(text) to service_role;
grant execute on function public.internal_bind_wechat_user(text, text, uuid) to service_role;
