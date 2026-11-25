#!/usr/bin/env bash
# Stop Second Live only; preserve data and TLS volumes.
set -euo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
command -v python3 >/dev/null 2>&1 || { echo 'FEHLER: Python 3 wird fuer den sicheren Host-Stopp benoetigt.' >&2; exit 1; }
exec python3 scripts/stop_host.py "$@"
