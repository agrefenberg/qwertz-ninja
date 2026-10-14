#!/usr/bin/env bash
# Nächtliche Sicherung der Datenbank. Wird von pi-einrichten.sh als Cronjob eingerichtet.
# Sicherungen liegen in data/sicherung (14 Stück). Ist in .env QN_BACKUP_DIR gesetzt
# (z. B. ein USB-Stick), wird zusätzlich dorthin kopiert.
set -euo pipefail
cd "$(dirname "$0")"

file=docker-compose.yml
if [ -f .env ] && grep -qE '^QN_DOMAIN=.+' .env; then file=docker-compose.https.yml; fi

docker compose -f "$file" exec -T qwertz-ninja node --no-warnings server/backup.js /data/sicherung 14

backup_dir=$( (grep -E '^QN_BACKUP_DIR=' .env 2>/dev/null || true) | tail -n1 | cut -d= -f2-)
if [ -n "$backup_dir" ]; then
  if [ -d "$backup_dir" ] && [ -w "$backup_dir" ]; then
    mkdir -p "$backup_dir/qwertz-ninja"
    cp -p data/sicherung/qwertz-ninja-*.sqlite "$backup_dir/qwertz-ninja/"
    # Auf dem Zielordner ebenfalls nur die letzten 30 behalten.
    ls -1 "$backup_dir"/qwertz-ninja/qwertz-ninja-*.sqlite | sort | head -n -30 | xargs -r rm --
    echo "Kopiert nach $backup_dir/qwertz-ninja"
  else
    echo "WARNUNG: Sicherungsordner $backup_dir nicht erreichbar (USB-Stick eingesteckt?)." >&2
    exit 1
  fi
fi
