-- 0003: Keep referral attribution and history when either side of a referral deletes their account.
--
-- NOT APPLIED. Review it, take a backup, then apply it as its own named migration
-- (e.g. Supabase "apply migration" with name preserve_referrals_on_account_deletion).
-- Do NOT use `supabase db push` with this repo's files: the live project's migration history
-- uses different version names, and push would try to re-run 0001.
--
-- Problem it fixes (exists in the live schema):
--  * referral_conversions.code -> referral_codes(code) has no ON DELETE action, while
--    referral_codes.user_id cascades from profiles. Deleting a REFERRER whose code has any
--    conversions fails with 23503 (referral_conversions_code_fkey), so their account can't be deleted.
--  * referral_conversions.referred_user_id cascades, so deleting a REFERRED user silently erases
--    that conversion (including paid/commission history) from the referrer's records.
--
-- After this migration:
--  * The referral code row stays (code string, commission rate) with user_id = NULL and
--    owner_deleted_at stamped. Every conversion keeps pointing at it, so attribution is intact.
--  * A conversion stays with referred_user_id = NULL and referred_user_deleted_at stamped.
--    No personal data remains in either row (they hold ids, amounts, codes and timestamps only).
--  * A deleted owner's code no longer attributes NEW signups.
--
-- Safe on existing data: only relaxes NOT NULL, swaps two FK actions, adds two nullable columns,
-- adds triggers and replaces handle_new_user with one extra condition. No rows are rewritten or
-- deleted. Re-runnable. Runs in one transaction.

begin;

-- 1) Referral codes outlive their owner.
alter table public.referral_codes alter column user_id drop not null;
alter table public.referral_codes add column if not exists owner_deleted_at timestamptz;
alter table public.referral_codes drop constraint if exists referral_codes_user_id_fkey;
alter table public.referral_codes add constraint referral_codes_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

-- 2) Conversions outlive the referred user.
alter table public.referral_conversions alter column referred_user_id drop not null;
alter table public.referral_conversions add column if not exists referred_user_deleted_at timestamptz;
alter table public.referral_conversions drop constraint if exists referral_conversions_referred_user_id_fkey;
alter table public.referral_conversions add constraint referral_conversions_referred_user_id_fkey
  foreign key (referred_user_id) references public.profiles(id) on delete set null;

-- 3) Record when the link to a deleted account was cleared (FK SET NULL actions fire these triggers).
create or replace function public.stamp_referral_code_owner_deleted() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.user_id is not null and new.user_id is null then
    new.owner_deleted_at := coalesce(new.owner_deleted_at, now());
  end if;
  return new;
end $$;

create or replace function public.stamp_referral_conversion_user_deleted() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.referred_user_id is not null and new.referred_user_id is null then
    new.referred_user_deleted_at := coalesce(new.referred_user_deleted_at, now());
  end if;
  return new;
end $$;

drop trigger if exists referral_codes_owner_deleted on public.referral_codes;
create trigger referral_codes_owner_deleted before update of user_id on public.referral_codes
  for each row execute function public.stamp_referral_code_owner_deleted();

drop trigger if exists referral_conversions_user_deleted on public.referral_conversions;
create trigger referral_conversions_user_deleted before update of referred_user_id on public.referral_conversions
  for each row execute function public.stamp_referral_conversion_user_deleted();

revoke execute on function public.stamp_referral_code_owner_deleted(), public.stamp_referral_conversion_user_deleted()
  from public, anon, authenticated;

-- 4) Same signup bootstrap as before; the only change is "and user_id is not null", so a deleted
--    owner's code no longer attributes new signups.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, referred_by_code)
    values (new.id, split_part(new.email, '@', 1), new.raw_user_meta_data->>'ref');
  insert into credit_balances (user_id) values (new.id);
  insert into referral_codes (code, user_id)
    values (lower(substr(replace(gen_random_uuid()::text,'-',''),1,8)), new.id);
  if new.raw_user_meta_data->>'ref' is not null
     and exists (select 1 from referral_codes where code = new.raw_user_meta_data->>'ref' and user_id is not null) then
    insert into referral_conversions (code, referred_user_id) values (new.raw_user_meta_data->>'ref', new.id);
  end if;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

commit;
