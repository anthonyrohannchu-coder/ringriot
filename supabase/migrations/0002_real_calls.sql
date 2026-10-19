-- 0002: real phone-call tables, exactly as already applied to the live project (migration "real_calls").
-- Kept here so a fresh database matches production. The live project ALREADY HAS THIS:
-- do not run it there (it would fail because the tables exist). New changes go in 0004+.
create table public.call_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text not null,
  to_e164 text,                       -- cleared after the call ends
  to_hash text not null,              -- peppered hash, kept for rate limits and opt-outs
  character_id text not null,
  scenario_id text not null,
  status text not null default 'awaiting_consent' check (status in
    ('awaiting_consent','declined','expired','calling','in_progress','completed','failed','no_answer','blocked')),
  credit_tx_id uuid references public.credit_transactions(id),
  twilio_call_sid text unique,
  transcript jsonb not null default '[]'::jsonb,
  turns int not null default 0,
  recording_sid text,
  created_at timestamptz not null default now(),
  consented_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 minutes'
);
create index on public.call_requests(user_id, created_at desc);
create index on public.call_requests(to_hash, created_at desc);

create table public.blocked_numbers (
  to_hash text primary key,
  created_at timestamptz not null default now()
);

alter table public.call_requests enable row level security;
alter table public.blocked_numbers enable row level security;
create policy "own call requests" on public.call_requests for select using ((select auth.uid()) = user_id);
-- blocked_numbers: service role only.
