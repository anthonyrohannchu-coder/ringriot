-- Account deletion with referral history, AFTER migration 0003 has been applied on top of the data
-- left by referral_deletion_before_0003.test.sql. Throwaway local Postgres only.
\set ON_ERROR_STOP on

do $$
declare
  v_code text; n int; r record;
begin
  select code into v_code from referral_codes where user_id = '00000000-0000-0000-0000-0000000000a1';

  -- 1) Account WITH referral conversions (the referrer) can now be deleted...
  delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
  if exists (select 1 from profiles where id = '00000000-0000-0000-0000-0000000000a1') then
    raise exception 'FAIL referrer profile still present';
  end if;
  -- ...and attribution is kept: code row detached and stamped, conversions untouched.
  select * into r from referral_codes where code = v_code;
  if r.code is null then raise exception 'FAIL referral code row erased'; end if;
  if r.user_id is not null or r.owner_deleted_at is null then raise exception 'FAIL code not detached/stamped: % %', r.user_id, r.owner_deleted_at; end if;
  select count(*) into n from referral_conversions where code = v_code;
  if n <> 2 then raise exception 'FAIL conversions lost: %', n; end if;
  select * into r from referral_conversions where stripe_invoice_id = 'in_TEST1';
  if r.amount_cents <> 999 or r.commission_cents <> 300 or r.status <> 'paid' then raise exception 'FAIL commission history changed'; end if;
  raise notice 'PASS referrer with conversions deleted; code kept (owner NULL, owner_deleted_at set); 2 conversions and commission history intact';

  -- 2) Referred user deleted: their conversion stays, link cleared and stamped.
  delete from auth.users where id = '00000000-0000-0000-0000-0000000000b1';
  select * into r from referral_conversions where stripe_invoice_id = 'in_TEST1';
  if r.id is null then raise exception 'FAIL conversion erased with referred user'; end if;
  if r.referred_user_id is not null or r.referred_user_deleted_at is null then raise exception 'FAIL conversion not detached/stamped'; end if;
  if r.code <> v_code then raise exception 'FAIL attribution changed'; end if;
  raise notice 'PASS referred user deleted; conversion kept with code and amounts, referred_user_id NULL, referred_user_deleted_at set';

  -- 3) Account WITHOUT referrals: deleted cleanly, its own data gone.
  perform grant_credits('00000000-0000-0000-0000-0000000000c1', 40, 'invoice:in_LONER', 'plus monthly credits');
  delete from auth.users where id = '00000000-0000-0000-0000-0000000000c1';
  if exists (select 1 from profiles where id = '00000000-0000-0000-0000-0000000000c1')
     or exists (select 1 from credit_balances where user_id = '00000000-0000-0000-0000-0000000000c1')
     or exists (select 1 from credit_transactions where user_id = '00000000-0000-0000-0000-0000000000c1') then
    raise exception 'FAIL user without referrals left data behind';
  end if;
  raise notice 'PASS account without referrals deleted; profile, balance and credit history removed';

  -- 4) A deleted owner's code no longer attributes new signups.
  insert into auth.users (id, email, raw_user_meta_data)
    values ('00000000-0000-0000-0000-0000000000d1', 'late@example.test', jsonb_build_object('ref', v_code));
  select count(*) into n from referral_conversions where code = v_code;
  if n <> 2 then raise exception 'FAIL orphaned code attributed a new signup'; end if;
  if not exists (select 1 from profiles where id = '00000000-0000-0000-0000-0000000000d1') then raise exception 'FAIL signup broken'; end if;
  raise notice 'PASS orphaned code does not attribute new signups (signup itself still works)';

  -- 5) Live codes still attribute as before.
  insert into auth.users (id, email, raw_user_meta_data)
    select '00000000-0000-0000-0000-0000000000e1', 'new-friend@example.test', jsonb_build_object('ref', code)
    from referral_codes where user_id = '00000000-0000-0000-0000-0000000000d1';
  if not exists (select 1 from referral_conversions where referred_user_id = '00000000-0000-0000-0000-0000000000e1') then
    raise exception 'FAIL normal referral attribution broken';
  end if;
  raise notice 'PASS normal referral attribution unchanged';

  -- 6) Browser roles still can't read detached rows or call the new trigger functions.
  if has_function_privilege('anon', 'public.stamp_referral_code_owner_deleted()', 'execute')
     or has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') then
    raise exception 'FAIL function privileges';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename in ('referral_codes','referral_conversions')) <> 2 then
    raise exception 'FAIL referral RLS policies changed';
  end if;
  raise notice 'PASS function privileges and referral RLS policies intact';
end $$;
