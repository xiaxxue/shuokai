-- Migration version aligned with the deployed Supabase history.
create index rooms_created_by_idx on public.rooms (created_by);
drop index if exists public.participants_room_user_idx;
