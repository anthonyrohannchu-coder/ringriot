#!/usr/bin/env bash
# One-command pre-deploy check. Writes verify-report.txt (safe to share: no secrets are printed).
# Optional real-AI test: have ANTHROPIC_API_KEY exported in this shell first (never typed into a file).
set -u
cd "$(dirname "$0")/.."
R=verify-report.txt; : > "$R"
STEP_LOG="$(mktemp)"
RESULTS=()
log() { echo "$@" | tee -a "$R"; }
run() {
  local name="$1"; shift
  log ""; log "\$ $*"
  "$@" > "$STEP_LOG" 2>&1; local code=$?
  tail -n 40 "$STEP_LOG" | tee -a "$R"
  log "exit=$code"
  RESULTS+=("$name: $([ $code -eq 0 ] && echo PASS || echo "FAIL (exit $code)")")
  return $code
}

log "date: $(date)"; log "os: $(uname -sm)"; log "node: $(node -v)"; log "npm: $(npm -v)"
log "branch: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
log "uncommitted: $(git status --short | wc -l | tr -d ' ') file(s)"

if [ -f package-lock.json ]; then
  run "npm ci" npm ci || { log "npm ci failed with the existing lockfile; regenerating it"; rm -rf node_modules package-lock.json; run "npm install" npm install && run "npm ci (fresh lockfile)" npm ci; }
else
  run "npm install" npm install && rm -rf node_modules && run "npm ci" npm ci
fi

log ""; log "== lockfile: Linux packages Render needs (each should be >= 1) =="
for p in '@next/swc-linux-x64-gnu' 'lightningcss-linux-x64-gnu' '@tailwindcss/oxide-linux-x64-gnu' 'tsx'; do
  n=$(grep -c "\"node_modules/$p\"" package-lock.json 2>/dev/null); n=${n:-0}; log "$p: $n"
  [ "$n" -ge 1 ] || RESULTS+=("lockfile has $p: FAIL")
done

run "npm run build" npm run build
run "npm run typecheck" npm run typecheck
run "npm test" npm test

if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  run "real-AI call check" npm run -s call:check
else
  log ""; log "ANTHROPIC_API_KEY not set in this shell: real-AI call check SKIPPED"
  RESULTS+=("real-AI call check: SKIPPED")
fi

log ""; log "== SUMMARY =="; for x in "${RESULTS[@]}"; do log "$x"; done
rm -f "$STEP_LOG"
