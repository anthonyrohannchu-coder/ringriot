-- Undo 0004. Only needed if you must remove the column; the code on main ignores it, so a code
-- rollback does NOT require this. Loses the stored Prank Caller Number of past requests (no other data).
begin;
drop index if exists public.call_requests_pending_idx;
alter table public.call_requests drop column if exists from_e164;
commit;
