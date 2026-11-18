begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

select ok(not has_function_privilege('anon', 'public.internal_bind_wechat_user(text,text,uuid)', 'EXECUTE'), 'anonymous clients cannot bind identities');
select ok(not has_function_privilege('authenticated', 'public.internal_bind_wechat_user(text,text,uuid)', 'EXECUTE'), 'users cannot bind an identity supplied in a request');
select ok(has_function_privilege('service_role', 'public.internal_bind_wechat_user(text,text,uuid)', 'EXECUTE'), 'the trusted login service can bind identities');
select ok((select relrowsecurity from pg_class where oid = 'private.wechat_identities'::regclass), 'identity table retains RLS');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('98000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wechat-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('98000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wechat-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('98000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wechat-c@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local role service_role;
select is(public.internal_bind_wechat_user('wechat-openid-first', '', '98000000-0000-4000-8000-000000000001'), '98000000-0000-4000-8000-000000000001'::uuid, 'first login creates an identity binding without a unionid');
select is(public.internal_bind_wechat_user('wechat-openid-first', 'wechat-union-first', '98000000-0000-4000-8000-000000000002'), '98000000-0000-4000-8000-000000000001'::uuid, 'a retried login keeps the original account and can add a missing unionid');
select is(public.internal_bind_wechat_user('wechat-openid-first', 'wechat-union-other', '98000000-0000-4000-8000-000000000003'), '98000000-0000-4000-8000-000000000001'::uuid, 'later identity claims cannot reassign an existing account');
select is(public.internal_bind_wechat_user('wechat-openid-second', '', '98000000-0000-4000-8000-000000000002'), '98000000-0000-4000-8000-000000000002'::uuid, 'a second identity binds independently');
select is(public.internal_get_wechat_user('wechat-openid-first'), '98000000-0000-4000-8000-000000000001'::uuid, 'the login service can retrieve the bound account');

reset role;
select is((select count(*) from private.wechat_identities), 2::bigint, 'retries do not create extra identity mappings');
select is((select unionid from private.wechat_identities where openid = 'wechat-openid-first'), 'wechat-union-first', 'an established unionid is preserved');
select is((select unionid from private.wechat_identities where openid = 'wechat-openid-second'), null::text, 'empty unionids remain null');

set local role service_role;
select throws_ok(
  $$select public.internal_bind_wechat_user('short', '', '98000000-0000-4000-8000-000000000003')$$,
  '23514', null, 'invalid openids still fail the table constraint'
);
select throws_ok(
  $$select public.internal_bind_wechat_user('wechat-openid-third', 'wechat-union-first', '98000000-0000-4000-8000-000000000003')$$,
  '23505', null, 'one unionid cannot be assigned to two accounts'
);
reset role;

select * from finish();
rollback;
