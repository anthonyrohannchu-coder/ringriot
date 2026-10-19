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
