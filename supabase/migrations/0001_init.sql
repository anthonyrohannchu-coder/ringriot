-- RingRiot initial schema. Run in Supabase SQL editor or `supabase db push`.

create extension if not exists pgcrypto;

-- ---------- Profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan text not null default 'free' check (plan in ('free','plus','pro')),
  stripe_customer_id text unique,
  referred_by_code text,
  is_admin boolean not null default false,
  suspended boolean not null default false,
  save_transcripts boolean not null default true,
  transcript_retention_days int not null default 30,
  created_at timestamptz not null default now()
);

-- ---------- Subscriptions (mirrors Stripe; written only by webhook) ----------
create table public.subscriptions (
  id text primary key,                       -- Stripe subscription id
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null,
  status text not null,                      -- active, past_due, canceled, ...
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
create index on public.subscriptions(user_id);

-- ---------- Credits ----------
create table public.credit_balances (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null,                        -- negative = spend, positive = grant/refund
  status text not null check (status in ('reserved','settled','refunded','granted')),
  reason text not null,
  idempotency_key text not null unique,       -- duplicate-request protection
  created_at timestamptz not null default now()
);
create index on public.credit_transactions(user_id, created_at desc);

-- ---------- Characters / scenarios (optional DB overrides; code config is the default source) ----------
create table public.characters (
  id text primary key,
  data jsonb not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create table public.scenarios (
  id text primary key,
  character_id text not null,
  data jsonb not null,
  enabled boolean not null default true
);

-- ---------- Conversations ----------
create table public.conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  character_id text not null,
  scenario_id text not null,
  mode text not null default 'browser' check (mode in ('browser','phone')),
  credit_tx_id uuid references public.credit_transactions(id),
  turns int not null default 0,
  cost_usd numeric(10,5) not null default 0,
  status text not null default 'active' check (status in ('active','completed','failed')),
  transcript jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index on public.conversation_sessions(user_id, created_at desc);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.conversation_sessions(id) on delete cascade,
  kind text not null,                         -- e.g. 'recipient_consent', 'recording_disclosure'
  recipient_hash text,                        -- hashed phone number, never raw
  granted_at timestamptz not null default now()
);

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.conversation_sessions(id) on delete cascade,
  storage_path text not null,
  consent_id uuid references public.consent_records(id),
  delete_after timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.conversation_sessions(id) on delete set null,
  title text not null,
  caption text,
  hook text,
  highlight jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Referrals ----------
create table public.referral_codes (
  code text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  commission_rate numeric(4,3) not null default 0.300,
  created_at timestamptz not null default now()
);
create table public.referral_conversions (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.referral_codes(code),
  referred_user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_invoice_id text unique,
  amount_cents int not null default 0,
  commission_cents int not null default 0,
  status text not null default 'signup' check (status in ('signup','paid','refunded')),
  created_at timestamptz not null default now()
);

-- ---------- Provider usage / costs ----------
create table public.provider_usage (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete set null,
  session_id uuid,
  provider text not null,
  kind text not null,
  units numeric not null,
  cost_usd numeric(10,5) not null,
  created_at timestamptz not null default now()
);

-- ---------- Admin + webhook idempotency + analytics ----------
create table public.admin_settings (key text primary key, value jsonb not null, updated_at timestamptz default now());
create table public.admin_audit_log (
  id bigserial primary key, actor uuid, action text not null, detail jsonb, created_at timestamptz default now()
);
create table public.stripe_events (id text primary key, type text not null, received_at timestamptz default now());
create table public.analytics_events (
  id bigserial primary key, event text not null, user_id uuid, ref_code text, created_at timestamptz default now()
);

-- ---------- New user bootstrap ----------
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

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Credit ledger functions (row-locked, idempotent) ----------
create or replace function public.reserve_credits(p_user uuid, p_amount int, p_key text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_bal int; v_tx uuid; v_existing uuid;
begin
  select id into v_existing from credit_transactions where idempotency_key = p_key;
  if v_existing is not null then
    select balance into v_bal from credit_balances where user_id = p_user;
    return jsonb_build_object('ok', true, 'transaction_id', v_existing, 'balance', v_bal, 'error', null);
  end if;
  select balance into v_bal from credit_balances where user_id = p_user for update;
  if v_bal is null or v_bal < p_amount then
    return jsonb_build_object('ok', false, 'transaction_id', null, 'balance', coalesce(v_bal,0), 'error', 'insufficient_credits');
  end if;
  update credit_balances set balance = balance - p_amount, updated_at = now() where user_id = p_user;
  insert into credit_transactions (user_id, amount, status, reason, idempotency_key)
    values (p_user, -p_amount, 'reserved', p_reason, p_key) returning id into v_tx;
  return jsonb_build_object('ok', true, 'transaction_id', v_tx, 'balance', v_bal - p_amount, 'error', null);
end $$;

create or replace function public.settle_credits(p_tx uuid) returns void
language sql security definer set search_path = public as $$
  update credit_transactions set status = 'settled' where id = p_tx and status = 'reserved';
$$;

create or replace function public.refund_credits(p_tx uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_amt int;
begin
  update credit_transactions set status = 'refunded', reason = reason || ' | refund: ' || p_reason
    where id = p_tx and status = 'reserved' returning user_id, -amount into v_user, v_amt;
  if v_user is not null then
    update credit_balances set balance = balance + v_amt, updated_at = now() where user_id = v_user;
  end if;
end $$;

create or replace function public.grant_credits(p_user uuid, p_amount int, p_key text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into credit_transactions (user_id, amount, status, reason, idempotency_key)
    values (p_user, p_amount, 'granted', p_reason, p_key)
    on conflict (idempotency_key) do nothing;
  if found then
    insert into credit_balances (user_id, balance) values (p_user, p_amount)
      on conflict (user_id) do update set balance = credit_balances.balance + p_amount, updated_at = now();
  end if;
end $$;

-- Only the server (service role) may call ledger functions.
revoke execute on function public.reserve_credits, public.settle_credits, public.refund_credits, public.grant_credits
  from public, anon, authenticated;

-- ---------- Row-level security ----------
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.conversation_sessions enable row level security;
alter table public.consent_records enable row level security;
alter table public.recordings enable row level security;
alter table public.clips enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referral_conversions enable row level security;
alter table public.provider_usage enable row level security;
alter table public.characters enable row level security;
alter table public.scenarios enable row level security;
alter table public.admin_settings enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.stripe_events enable row level security;
alter table public.analytics_events enable row level security;

-- Users read their own rows. All writes to money/credit tables go through the service role.
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
create policy "own profile privacy update" on public.profiles for update using (auth.uid() = id)
  with check (auth.uid() = id);
-- Prevent users from editing billing/admin columns through the update policy.
revoke update on public.profiles from authenticated;
grant update (display_name, save_transcripts, transcript_retention_days) on public.profiles to authenticated;

create policy "own subs" on public.subscriptions for select using (auth.uid() = user_id);
create policy "own balance" on public.credit_balances for select using (auth.uid() = user_id);
create policy "own tx" on public.credit_transactions for select using (auth.uid() = user_id);
create policy "own sessions read" on public.conversation_sessions for select using (auth.uid() = user_id);
create policy "own sessions delete" on public.conversation_sessions for delete using (auth.uid() = user_id);
create policy "own consent" on public.consent_records for select using (auth.uid() = user_id);
create policy "own recordings" on public.recordings for select using (auth.uid() = user_id);
create policy "own clips all" on public.clips for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own ref code" on public.referral_codes for select using (auth.uid() = user_id);
create policy "own ref conversions" on public.referral_conversions for select
  using (exists (select 1 from referral_codes r where r.code = referral_conversions.code and r.user_id = auth.uid()));
create policy "characters public read" on public.characters for select using (enabled);
create policy "scenarios public read" on public.scenarios for select using (enabled);
-- provider_usage, admin_*, stripe_events, analytics_events: no user policies (service role only).
