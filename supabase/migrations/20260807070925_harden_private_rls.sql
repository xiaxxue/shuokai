-- Defense in depth for service-only identity and quota tables. These tables
-- remain in the unexposed private schema and have no anon/authenticated
-- grants or policies; their owner-run SECURITY DEFINER helpers keep working.
alter table private.wechat_identities enable row level security;
alter table private.transcription_rate_limits enable row level security;

-- Rollback (not recommended):
-- alter table private.wechat_identities disable row level security;
-- alter table private.transcription_rate_limits disable row level security;
