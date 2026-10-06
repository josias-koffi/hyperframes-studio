#!/bin/sh
# Crée une nouvelle vidéo dans videos/<nom>/ (sans dépôt git ni package.json propres).
# Usage : npm run new -- <nom> [options de hyperframes init, ex. --resolution=portrait]
set -e
[ -n "$1" ] || { echo "Usage : npm run new -- <nom> [--resolution=portrait|square|...]" >&2; exit 1; }
NAME="$1"; shift
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -e "$ROOT/videos/$NAME" ] && { echo "videos/$NAME existe déjà" >&2; exit 1; }
cd "$ROOT/videos"
npx --yes hyperframes@0.8.134 init "$NAME" --non-interactive --example=blank "$@"
# La config est partagée à la racine du repo : on retire les doublons générés.
rm -f "$NAME/package.json" "$NAME/CLAUDE.md" "$NAME/AGENTS.md"
echo
echo "Vidéo créée : videos/$NAME"
echo "  npm run preview -- videos/$NAME"
