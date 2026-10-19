-- Undo 0003. The code on main works with 0003 applied (deletion just succeeds), so a code rollback
-- does NOT require this. Reversible only while no account deletion has detached a referral row:
-- restoring NOT NULL would otherwise require deleting that history, so this refuses instead.
begin;
do $$
begin
  if exists (select 1 from public.referral_codes where user_id is null)
     or exists (select 1 from public.referral_conversions where referred_user_id is null) then
    raise exception 'Not reversible: referral rows from deleted accounts exist (their history would have to be deleted). Nothing was changed.';
  end if;
end $$;

drop trigger if exists referral_codes_owner_deleted on public.referral_codes;
drop trigger if exists referral_conversions_user_deleted on public.referral_conversions;
drop function if exists public.stamp_referral_code_owner_deleted();
drop function if exists public.stamp_referral_conversion_user_deleted();

alter table public.referral_codes drop constraint if exists referral_codes_user_id_fkey;
alter table public.referral_codes add constraint referral_codes_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.referral_codes alter column user_id set not null;
alter table public.referral_codes drop column if exists owner_deleted_at;

alter table public.referral_conversions drop constraint if exists referral_conversions_referred_user_id_fkey;
alter table public.referral_conversions add constraint referral_conversions_referred_user_id_fkey
  foreign key (referred_user_id) references public.profiles(id) on delete cascade;
alter table public.referral_conversions alter column referred_user_id set not null;
alter table public.referral_conversions drop column if exists referred_user_deleted_at;

-- Original signup bootstrap (as in 0001 / live).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, referred_by_code)
    values (new.id, split_part(new.email, '@', 1), new.raw_user_meta_data->>'ref');
  insert into credit_balances (user_id) values (new.id);
  insert into referral_codes (code, user_id)
    values (lower(substr(replace(gen_random_uuid()::text,'-',''),1,8)), new.id);
  if new.raw_user_meta_data->>'ref' is not null
     and exists (select 1 from referral_codes where code = new.raw_user_meta_data->>'ref') then
    insert into referral_conversions (code, referred_user_id) values (new.raw_user_meta_data->>'ref', new.id);
  end if;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
commit;
