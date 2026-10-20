-- Migration 0005: applies twice, and only the service role can read or write analytics.
-- Simulate Supabase's default table grants to anon/authenticated so RLS is what blocks them.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.events to anon, authenticated;
grant usage, select on sequence public.events_id_seq to anon, authenticated;
insert into public.events (name, visitor_id, props) values ('page_view', 'v1', '{}');
do $$ declare n int; begin
  set local role anon;
  select count(*) into n from public.events;
  if n <> 0 then raise exception 'FAIL anon can read % analytics rows', n; end if;
  begin
    insert into public.events (name) values ('purchase');
    raise exception 'FAIL anon could insert';
  exception when insufficient_privilege then null; end;
  reset role;
  raise notice 'PASS anon cannot read or write analytics';
end $$;
do $$ declare n int; begin
  set local role authenticated;
  select count(*) into n from public.events;
  if n <> 0 then raise exception 'FAIL signed-in users can read % analytics rows', n; end if;
  reset role;
  raise notice 'PASS signed-in users cannot read analytics';
end $$;
do $$ declare n int; begin
  select count(*) into n from information_schema.columns where table_name = 'events' and column_name ~ '(phone|e164|email|ip)';
  if n <> 0 then raise exception 'FAIL events has a sensitive column'; end if;
  raise notice 'PASS events table has no phone, email or IP columns';
end $$;
