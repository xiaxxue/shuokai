-- The INSERT alias hides the original table name inside ON CONFLICT.
-- Preserve existing account bindings and unionids when a login is retried.
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
      unionid = coalesce(identity.unionid, excluded.unionid)
  returning identity.user_id into p_user_id;
  return p_user_id;
end;
$$;
