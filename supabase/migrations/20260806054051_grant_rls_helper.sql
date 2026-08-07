-- Migration version aligned with the deployed Supabase history.
-- The private schema is not exposed by the Data API. Authenticated callers
-- need these two privileges only so Postgres can evaluate membership RLS.
grant usage on schema private to authenticated;
grant execute on function private.is_room_member(uuid) to authenticated;
