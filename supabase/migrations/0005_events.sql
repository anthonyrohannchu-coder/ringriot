-- 0005: first-party product analytics (visits, sign-ups, checkouts, purchases, calls, refunds, cancellations).
-- Service-role only (RLS on, no policies). No personal data: visitor_id is a random first-party id,
-- phone numbers are never stored here. Safe to apply: additive, no existing table changes.
create table if not exists public.events (
  id bigserial primary key,
  at timestamptz not null default now(),
  name text not null,
  visitor_id text,
  user_id uuid references public.profiles(id) on delete set null,
  path text,
  ref text,
  props jsonb not null default '{}'::jsonb
);
create index if not exists events_name_at_idx on public.events(name, at desc);
create index if not exists events_ref_idx on public.events(ref) where ref is not null;
alter table public.events enable row level security;
