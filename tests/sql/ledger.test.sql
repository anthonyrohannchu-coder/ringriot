-- Credit-ledger idempotency tests. Runs on a throwaway local Postgres after supabase_stub.sql and
-- supabase/migrations/0001_init.sql. Any failed check raises an exception (non-zero exit with ON_ERROR_STOP).
\set ON_ERROR_STOP on

-- Two users through the real signup trigger.
insert into auth.users (id, email) values
  ('d879b3c5-cb32-466d-b40d-869d6d191fe6', 'test@ringriot.test'),
  ('88156e04-5070-47e0-b8c5-314b09ae1394', 'other@ringriot.test');

do $$
declare b int; n int;
begin
  -- Trigger created profile + zero balance.
  select balance into b from credit_balances where user_id = 'd879b3c5-cb32-466d-b40d-869d6d191fe6';
  if b is distinct from 0 then raise exception 'FAIL signup balance: %', b; end if;

  -- 1) Same invoice processed twice (Stripe retry / resend) -> granted once.
  perform grant_credits('d879b3c5-cb32-466d-b40d-869d6d191fe6', 40, 'invoice:in_1USIfPKTWyAE5acukAnAg27o', 'plus monthly credits');
  perform grant_credits('d879b3c5-cb32-466d-b40d-869d6d191fe6', 40, 'invoice:in_1USIfPKTWyAE5acukAnAg27o', 'plus monthly credits');
  select balance into b from credit_balances where user_id = 'd879b3c5-cb32-466d-b40d-869d6d191fe6';
  if b <> 40 then raise exception 'FAIL duplicate invoice grant: balance %', b; end if;
  raise notice 'PASS duplicate invoice.paid grants once (balance 40)';

  -- 2) Manual backfill with the webhook's key, then the webhook arrives -> still once.
  perform grant_credits('d879b3c5-cb32-466d-b40d-869d6d191fe6', 40, 'invoice:in_RENEWAL', 'backfill');
  perform grant_credits('d879b3c5-cb32-466d-b40d-869d6d191fe6', 40, 'invoice:in_RENEWAL', 'plus monthly credits');
  select balance into b from credit_balances where user_id = 'd879b3c5-cb32-466d-b40d-869d6d191fe6';
  if b <> 80 then raise exception 'FAIL backfill + webhook: balance %', b; end if;
  raise notice 'PASS backfill then webhook with same key grants once (balance 80)';

  -- 3) Credit pack keyed by checkout session, replayed.
  perform grant_credits('d879b3c5-cb32-466d-b40d-869d6d191fe6', 25, 'pack:cs_test_1', 'credit pack purchase');
  perform grant_credits('d879b3c5-cb32-466d-b40d-869d6d191fe6', 25, 'pack:cs_test_1', 'credit pack purchase');
  select balance into b from credit_balances where user_id = 'd879b3c5-cb32-466d-b40d-869d6d191fe6';
  if b <> 105 then raise exception 'FAIL pack replay: balance %', b; end if;
  raise notice 'PASS credit pack replay grants once (balance 105)';

  -- 4) Other users untouched.
  select balance into b from credit_balances where user_id = '88156e04-5070-47e0-b8c5-314b09ae1394';
  if b <> 0 then raise exception 'FAIL other user changed: %', b; end if;
  select count(*) into n from credit_transactions where user_id = '88156e04-5070-47e0-b8c5-314b09ae1394';
  if n <> 0 then raise exception 'FAIL other user has % transactions', n; end if;
  raise notice 'PASS other user balance and history unchanged';

  -- 5) Ledger matches balance.
  select coalesce(sum(amount),0) into n from credit_transactions where user_id = 'd879b3c5-cb32-466d-b40d-869d6d191fe6';
  if n <> 105 then raise exception 'FAIL ledger sum % <> balance', n; end if;
  raise notice 'PASS ledger sum equals balance';

  -- 6) Reserve/refund round trip is idempotent too.
  perform reserve_credits('d879b3c5-cb32-466d-b40d-869d6d191fe6', 3, 'call:req1', 'real phone call');
  perform reserve_credits('d879b3c5-cb32-466d-b40d-869d6d191fe6', 3, 'call:req1', 'real phone call');
  select balance into b from credit_balances where user_id = 'd879b3c5-cb32-466d-b40d-869d6d191fe6';
  if b <> 102 then raise exception 'FAIL duplicate reserve: %', b; end if;
  perform refund_credits((select id from credit_transactions where idempotency_key = 'call:req1'), 'no answer');
  perform refund_credits((select id from credit_transactions where idempotency_key = 'call:req1'), 'no answer');
  select balance into b from credit_balances where user_id = 'd879b3c5-cb32-466d-b40d-869d6d191fe6';
  if b <> 105 then raise exception 'FAIL double refund: %', b; end if;
  raise notice 'PASS reserve and refund are each applied once';
end $$;

-- 7) Webhook duplicate marker: second insert of the same event id must fail with unique_violation (23505).
insert into stripe_events (id, type) values ('evt_1USIfSKTWyAE5acuGw9gaPYW', 'invoice.paid');
do $$
begin
  begin
    insert into stripe_events (id, type) values ('evt_1USIfSKTWyAE5acuGw9gaPYW', 'invoice.paid');
    raise exception 'FAIL duplicate stripe event accepted';
  exception when unique_violation then
    raise notice 'PASS duplicate stripe_events insert rejected with 23505';
  end;
end $$;

-- 8) Ledger functions are not callable by browser roles.
do $$
begin
  if has_function_privilege('anon', 'public.grant_credits(uuid,int,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.grant_credits(uuid,int,text,text)', 'execute') then
    raise exception 'FAIL grant_credits executable by anon/authenticated';
  end if;
  raise notice 'PASS grant_credits not executable by anon/authenticated';
end $$;
