#!/usr/bin/env bash
#
# Stop what ./scripts/dev.sh started, then stop Postgres.
#
#   ./scripts/stop.sh          # dev servers + Postgres (data volume kept)
#   ./scripts/stop.sh --keep-db  # dev servers only
#
# PID-BASED ON PURPOSE. The obvious implementation — "kill whatever is
# listening on :3000 and :3001" — is wrong here: this repo is routinely driven
# by more than one session at a time, and a port sweep reaches into a stack
# this script did not start. So it kills only the process trees dev.sh recorded
# in `.dev-pids`, and merely REPORTS anything else still holding those ports.
#
# Never `docker compose down -v`: that drops devdigest_pgdata and every
# imported repo and review with it (README → Troubleshooting).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PIDFILE="$ROOT/.dev-pids"
KEEP_DB=0

for arg in "$@"; do
  case "$arg" in
    --keep-db)  KEEP_DB=1 ;;
    -h|--help)  sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

log()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }

# Leaves-first, same helper as dev.sh and e2e.sh: the real listener is a
# grandchild, so killing the recorded PID alone orphans it.
kill_tree() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  local kid
  for kid in $(pgrep -P "$pid" 2>/dev/null || true); do kill_tree "$kid"; done
  kill "$pid" 2>/dev/null || true
}

stopped=0
if [ -f "$PIDFILE" ]; then
  while read -r pid; do
    [ -n "$pid" ] || continue
    if ps -p "$pid" >/dev/null 2>&1; then
      log "stopping dev server tree $pid"
      kill_tree "$pid"
      stopped=$((stopped + 1))
    fi
  done < "$PIDFILE"
  rm -f "$PIDFILE"
  [ "$stopped" -eq 0 ] && log "no live PIDs in .dev-pids (already stopped)"
else
  log "no .dev-pids here — dev.sh is not running from this checkout"
fi

# Report only. These may belong to another session working the same repo.
for port in 3000 3001; do
  pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    csv="$(echo $pids | tr ' ' ',')"
    warn ":$port still held by PID(s) ${csv//,/ } — NOT killed, it may be another session."
    warn "  inspect: ps -o pid,ppid,lstart,command -p ${csv}"
  fi
done

if [ "$KEEP_DB" -eq 1 ]; then
  log "Postgres left running (--keep-db)"
else
  log "stopping Postgres (container and data volume kept)"
  docker compose stop
fi
