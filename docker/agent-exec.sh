#!/bin/sh
# Runs a command as a client's agent uid (apps/claude-runner/src/sandbox.ts). The runner (node) calls it through
# sudo, its only root command: `sudo -n agent-exec <uid> <cmd> [args…]`, the environment on stdin, one KEY=VALUE
# per line (arguments are readable by every uid in /proc). `agent-exec --check` tells the runner sudo works.
set -eu

if [ "${1:-}" = "--check" ]; then exit 0; fi
uid="${1:-}"
case "$uid" in '' | *[!0-9]*) echo "agent-exec: uid attendu" >&2; exit 64 ;; esac
if [ "$uid" -lt 100000 ] || [ "$uid" -gt 199999 ]; then echo "agent-exec: uid hors plage" >&2; exit 64; fi
shift
[ "$#" -gt 0 ] || { echo "agent-exec: commande attendue" >&2; exit 64; }

# Only what the runner wrote on stdin: sudo's own variables go, and nothing may change how setpriv loads.
for name in $(env | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p'); do unset "$name" 2>/dev/null || true; done
while IFS= read -r line; do
  name="${line%%=*}"
  case "$name" in '' | *[!A-Za-z0-9_]* | [0-9]* | LD_* | GCONV_PATH | NODE_OPTIONS) continue ;; esac
  export "$line"
done

umask 077
exec /usr/bin/setpriv --reuid="$uid" --regid="$uid" --clear-groups --inh-caps=-all --bounding-set=-all --no-new-privs -- "$@"
