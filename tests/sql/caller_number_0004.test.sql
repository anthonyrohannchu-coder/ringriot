-- 0004 (from_e164) on a database that matches live (0001 + 0002) with an existing call row.
-- Throwaway local Postgres only. run.sh applies 0004 twice before this file.
\set ON_ERROR_STOP on
do $$
declare v_user uuid := '00000000-0000-0000-0000-0000000000f1'; r record;
begin
  -- The pre-existing row (inserted by run.sh before 0004) kept its data and has from_e164 NULL.
  select * into r from call_requests where sender_name = 'Before0004';
  if r.id is null or r.from_e164 is not null or r.scenario_id <> 'hit-my-car' then raise exception 'FAIL existing row changed'; end if;
  raise notice 'PASS existing call row untouched; from_e164 is NULL';

  -- New inserts (what /api/calls does) work with the caller number.
  insert into call_requests (user_id, sender_name, to_e164, from_e164, to_hash, character_id, scenario_id)
    values (v_user, 'After0004', '+15555550123', '+15555550100', 'hash2', 'sal', 'stay-away-from-my-girl');
  select * into r from call_requests where sender_name = 'After0004';
  if r.from_e164 <> '+15555550100' or r.status <> 'awaiting_consent' then raise exception 'FAIL insert with from_e164'; end if;
  raise notice 'PASS insert with from_e164 (Prank Caller Number) works';

  if not exists (select 1 from pg_indexes where tablename = 'call_requests' and indexname = 'call_requests_pending_idx') then
    raise exception 'FAIL pending index missing';
  end if;
  if (select count(*) from pg_policies where tablename = 'call_requests') <> 1 then raise exception 'FAIL policies changed'; end if;
  raise notice 'PASS pending-request index present; RLS policy unchanged';
end $$;
