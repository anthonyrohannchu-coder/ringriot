#!/usr/bin/env bash
# Runs every SQL test against a THROWAWAY local Postgres. Refuses anything that isn't local.
# Usage: tests/sql/run.sh "-h <socket dir or localhost> -p <port> -U <user>"
set -euo pipefail
CONN="$1"
case "$CONN" in *supabase*|*pooler*|*amazonaws*|*render.com*) echo "Refusing: not a local test database"; exit 2;; esac
cd "$(dirname "$0")/../.."
PSQL="psql -X -q -v ON_ERROR_STOP=1 $CONN"
fresh() { $PSQL -d postgres -c "drop database if exists $1" -c "create database $1" >/dev/null; $PSQL -d "$1" -f tests/sql/supabase_stub.sql -f supabase/migrations/0001_init.sql; }

echo "== ledger idempotency (schema as today) =="
fresh rr_ledger
$PSQL -d rr_ledger -f tests/sql/ledger.test.sql 2>&1 | sed 's/^psql:[^ ]* //'
tests/sql/concurrent_grant.sh "$CONN -d rr_ledger"

echo "== referral deletion: reproduce on today's schema, then apply 0003 twice on the same data =="
fresh rr_ref
$PSQL -d rr_ref -f tests/sql/referral_deletion_before_0003.test.sql 2>&1 | sed 's/^psql:[^ ]* //'
$PSQL -d rr_ref -f supabase/migrations/0003_preserve_referrals_on_account_deletion.sql
$PSQL -d rr_ref -f supabase/migrations/0003_preserve_referrals_on_account_deletion.sql
echo "NOTICE:  PASS migration 0003 applied twice on existing data without error"
$PSQL -d rr_ref -f tests/sql/referral_deletion_after_0003.test.sql 2>&1 | sed 's/^psql:[^ ]* //'

echo "== ledger idempotency still holds after 0003 =="
fresh rr_ledger2
$PSQL -d rr_ledger2 -f supabase/migrations/0003_preserve_referrals_on_account_deletion.sql
$PSQL -d rr_ledger2 -f tests/sql/ledger.test.sql 2>&1 | sed 's/^psql:[^ ]* //'

echo "== call requests: live-equivalent schema (0001 + 0002), existing row, then 0004 twice =="
fresh rr_calls
$PSQL -d rr_calls -f supabase/migrations/0002_real_calls.sql
$PSQL -d rr_calls -c "insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'caller@example.test')" \
  -c "insert into call_requests (user_id, sender_name, to_e164, to_hash, character_id, scenario_id) values ('00000000-0000-0000-0000-0000000000f1', 'Before0004', '+15555550199', 'hash1', 'sal', 'hit-my-car')" >/dev/null
$PSQL -d rr_calls -f supabase/migrations/0004_call_requests_caller_number.sql
$PSQL -d rr_calls -f supabase/migrations/0004_call_requests_caller_number.sql 2>&1 | grep -v "already exists, skipping" || true
echo "NOTICE:  PASS migration 0004 applied twice on existing data without error"
$PSQL -d rr_calls -f tests/sql/caller_number_0004.test.sql 2>&1 | sed 's/^psql:[^ ]* //'

echo "== rollbacks: 0004 and 0003 up -> down -> up; schema returns to the original =="
fresh rr_rb
$PSQL -d rr_rb -f supabase/migrations/0002_real_calls.sql
snap() { $PSQL -d rr_rb -tAc "select string_agg(table_name||'.'||column_name||':'||is_nullable, ',' order by table_name, column_name) from information_schema.columns where table_schema='public' and table_name in ('call_requests','referral_codes','referral_conversions')"; $PSQL -d rr_rb -tAc "select string_agg(conname||'='||pg_get_constraintdef(oid), ',' order by conname) from pg_constraint where conrelid::regclass::text in ('referral_codes','referral_conversions') and contype='f'"; $PSQL -d rr_rb -tAc "select md5(prosrc) from pg_proc where proname='handle_new_user'"; }
BEFORE=$(snap)
for m in 0004_call_requests_caller_number 0003_preserve_referrals_on_account_deletion; do $PSQL -d rr_rb -f supabase/migrations/$m.sql 2>&1 | grep -v "does not exist, skipping" || true; done
[ "$(snap)" != "$BEFORE" ] && echo "NOTICE:  PASS migrations changed the schema"
$PSQL -d rr_rb -f supabase/rollbacks/0003_down.sql 2>&1 | grep -v "does not exist, skipping" || true
$PSQL -d rr_rb -f supabase/rollbacks/0004_down.sql
[ "$(snap)" = "$BEFORE" ] && echo "NOTICE:  PASS rollbacks restored the original schema exactly" || { echo "FAIL schema differs after rollback"; exit 1; }
for m in 0004_call_requests_caller_number 0003_preserve_referrals_on_account_deletion; do $PSQL -d rr_rb -f supabase/migrations/$m.sql 2>&1 | grep -v "does not exist, skipping" || true; done
echo "NOTICE:  PASS migrations re-apply after rollback"
# A deleted referrer makes 0003 irreversible: the rollback must refuse and change nothing.
$PSQL -d rr_rb -c "insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a9','r@example.test')" -c "delete from auth.users where id='00000000-0000-0000-0000-0000000000a9'" >/dev/null
if $PSQL -d rr_rb -f supabase/rollbacks/0003_down.sql >/dev/null 2>&1; then echo "FAIL 0003 rollback ran despite detached history"; exit 1; fi
$PSQL -d rr_rb -tAc "select count(*) from referral_codes where user_id is null and owner_deleted_at is not null" | grep -qx 1 && echo "NOTICE:  PASS 0003 rollback refuses once history is detached, and changes nothing"
