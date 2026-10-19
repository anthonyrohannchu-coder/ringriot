-- Reproduces the referral FK problem on the CURRENT schema (0001 only, same as live), and leaves
-- realistic referral data behind so 0003 can then be applied on top of existing rows.
-- Throwaway local Postgres only.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'referrer@example.test');
insert into auth.users (id, email, raw_user_meta_data)
  select '00000000-0000-0000-0000-0000000000b1', 'friend@example.test', jsonb_build_object('ref', code)
  from referral_codes where user_id = '00000000-0000-0000-0000-0000000000a1';
insert into auth.users (id, email, raw_user_meta_data)
  select '00000000-0000-0000-0000-0000000000b2', 'friend2@example.test', jsonb_build_object('ref', code)
  from referral_codes where user_id = '00000000-0000-0000-0000-0000000000a1';
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'loner@example.test');
-- friend1 became a paying customer: commission recorded like the webhook does.
update referral_conversions set stripe_invoice_id = 'in_TEST1', amount_cents = 999, commission_cents = 300, status = 'paid'
  where referred_user_id = '00000000-0000-0000-0000-0000000000b1';

do $$
declare n int;
begin
  select count(*) into n from referral_conversions;
  if n <> 2 then raise exception 'FAIL setup: % conversions', n; end if;

  -- The bug: deleting the referrer fails.
  begin
    delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FAIL expected referrer deletion to be blocked by the FK';
  exception when foreign_key_violation then
    raise notice 'PASS (reproduced) referrer deletion fails with referral_conversions_code_fkey before 0003';
  end;

  -- The silent-erasure problem: deleting a referred user drops their conversion (rolled back here).
  begin
    delete from auth.users where id = '00000000-0000-0000-0000-0000000000b2';
    select count(*) into n from referral_conversions;
    if n <> 1 then raise exception 'FAIL expected cascade to erase a conversion, have %', n; end if;
    raise exception 'rollback-marker';
  exception when raise_exception then
    if sqlerrm <> 'rollback-marker' then raise; end if;
    raise notice 'PASS (reproduced) deleting a referred user erases their conversion before 0003 (rolled back)';
  end;

  select count(*) into n from referral_conversions;
  if n <> 2 then raise exception 'FAIL data not restored after rollback: %', n; end if;
end $$;
