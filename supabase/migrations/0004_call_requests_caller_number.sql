-- 0004: remember which configured Twilio number ("Prank Caller Number") each call request uses.
--
-- NOT APPLIED. Required BEFORE deploying the caller-number picker: /api/calls inserts from_e164 and
-- would fail on every call request without this column.
-- Safe on the live table: adds one nullable column (metadata-only, no rewrite) and one index.
-- Existing rows keep from_e164 = NULL; the SMS route falls back to the first configured number.
-- Re-runnable.
alter table public.call_requests add column if not exists from_e164 text;

-- Speeds up the "does this recipient already have a pending call?" check in /api/calls.
create index if not exists call_requests_pending_idx
  on public.call_requests(to_hash, status, expires_at);
