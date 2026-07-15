#!/usr/bin/env bash
set -euo pipefail
ALEX_DIR="/tmp/squashfs-root"

if [ ! -f "$ALEX_DIR/AppRun" ]; then
  echo "ERREUR: Alex n'est pas préparé. Exécute d'abord : /home/jordy/OpenDex-source/scripts/preparer-alex.sh"
  exit 1
fi

ALEX_PID=$(pgrep -f "squashfs-root/AppRun" 2>/dev/null || true)
if [ -n "$ALEX_PID" ]; then
  echo "Arrêt de l'instance précédente d'Alex…"
  kill "$ALEX_PID" 2>/dev/null || true
  sleep 1
fi

echo "Lancement d'Alex…"
[ -n "$OPENROUTER_API_KEY" ] || export OPENROUTER_API_KEY=""
[ -n "$ELEVENLABS_API_KEY" ] || export ELEVENLABS_API_KEY=""
systemctl --user start speech-dispatcher 2>/dev/null || true
export ELECTRON_OZONE_PLATFORM_HINT=x11
exec "$ALEX_DIR/opendex" --no-sandbox --in-process-gpu --ozone-platform=x11 "$@"
