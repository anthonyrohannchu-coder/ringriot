-- Refund clawback against the REAL ledger functions: same key twice = one deduction; balance never below 0.
do $$
declare u uuid := '00000000-0000-0000-0000-0000000000a1'; r jsonb; b int;
begin
  insert into auth.users (id, email) values (u, 'refund@example.test');
  perform grant_credits(u, 25, 'pack:cs_test_1', 'credit pack purchase');
  perform grant_credits(u, 15, 'invoice:in_1', 'plus monthly credits');
  -- first refund event (full): take 25
  r := reserve_credits(u, 25, 'packrefund:cs_test_1:499', 'credit pack refunded');
  perform settle_credits((r->>'transaction_id')::uuid);
  -- same event delivered again: same key, must not deduct again
  r := reserve_credits(u, 25, 'packrefund:cs_test_1:499', 'credit pack refunded');
  select balance into b from credit_balances where user_id = u;
  if b <> 15 then raise exception 'FAIL duplicate refund: balance % (expected 15)', b; end if;
  raise notice 'PASS duplicate refund event deducts once (balance 15)';
  -- asking for more than the balance is refused, balance unchanged (never negative)
  r := reserve_credits(u, 99, 'packrefund:cs_test_2:499', 'credit pack refunded');
  select balance into b from credit_balances where user_id = u;
  if (r->>'ok')::boolean or b <> 15 then raise exception 'FAIL overdraw: % balance %', r, b; end if;
  raise notice 'PASS clawback larger than balance is refused, balance stays 15';
  -- clawed-so-far query the webhook uses
  select coalesce(sum(-amount),0) into b from credit_transactions where idempotency_key like 'packrefund:cs_test_1:%';
  if b <> 25 then raise exception 'FAIL clawed-so-far = %', b; end if;
  raise notice 'PASS clawed-so-far for the session = 25';
end $$;
