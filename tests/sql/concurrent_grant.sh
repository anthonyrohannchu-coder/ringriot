#!/usr/bin/env bash
# Fires the same invoice grant from 10 parallel connections (simulating overlapping webhook retries)
# against a THROWAWAY local database and checks it landed exactly once.
# Usage: tests/sql/concurrent_grant.sh "<psql connection args for a local test db>"
set -euo pipefail
PSQL="psql -X -q -v ON_ERROR_STOP=1 $1"
U=d879b3c5-cb32-466d-b40d-869d6d191fe6
before=$($PSQL -tAc "select balance from credit_balances where user_id='$U'")
for i in $(seq 1 10); do
  $PSQL -c "select grant_credits('$U', 40, 'invoice:in_CONCURRENT', 'plus monthly credits')" >/dev/null &
done
wait
after=$($PSQL -tAc "select balance from credit_balances where user_id='$U'")
rows=$($PSQL -tAc "select count(*) from credit_transactions where idempotency_key='invoice:in_CONCURRENT'")
if [ "$((after - before))" -ne 40 ] || [ "$rows" -ne 1 ]; then
  echo "FAIL concurrent grants: +$((after - before)) credits, $rows rows"; exit 1
fi
echo "PASS 10 concurrent identical grants added 40 credits once ($rows ledger row)"
