#!/usr/bin/env bash
# Nächtliche Sicherung der Datenbank. Wird von pi-einrichten.sh als Cronjob eingerichtet.
# Sicherungen liegen in data/sicherung (die letzten 14). Ist in .env QN_BACKUP_DIR gesetzt
# (z. B. ein USB-Stick oder NAS), wird zusätzlich dorthin kopiert (die letzten 30).
# Ist außerdem QN_BACKUP_PASSWORD gesetzt, werden die Kopien dort verschlüsselt (AES-256, openssl).
# Wiederherstellen: sudo ./wiederherstellen.sh <Sicherungsdatei>
set -euo pipefail
cd "$(dirname "$0")"

env_value() { (grep -E "^$1=" .env 2>/dev/null || true) | tail -n1 | cut -d= -f2-; }

file=docker-compose.yml
if [ -f .env ] && grep -qE '^QN_DOMAIN=.+' .env; then file=docker-compose.https.yml; fi

docker compose -f "$file" exec -T qwertz-ninja node --no-warnings server/backup.js /data/sicherung 14

backup_dir=$(env_value QN_BACKUP_DIR)
password=$(env_value QN_BACKUP_PASSWORD)
if [ -n "$backup_dir" ]; then
  if [ -d "$backup_dir" ] && [ -w "$backup_dir" ]; then
    mkdir -p "$backup_dir/qwertz-ninja"
    newest=$(ls -1 data/sicherung/qwertz-ninja-*.sqlite | sort | tail -n1)
    name=$(basename "$newest")
    if [ -n "$password" ]; then
      QN_PW="$password" openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:QN_PW -in "$newest" -out "$backup_dir/qwertz-ninja/$name.enc"
    else
      echo "Hinweis: Die Kopie in $backup_dir ist unverschlüsselt. Für Verschlüsselung QN_BACKUP_PASSWORD in .env setzen." >&2
      cp -p "$newest" "$backup_dir/qwertz-ninja/"
    fi
    # Auf dem Zielordner nur die letzten 30 behalten.
    ls -1 "$backup_dir"/qwertz-ninja/qwertz-ninja-*.sqlite* | sort | head -n -30 | xargs -r rm --
    echo "Kopiert nach $backup_dir/qwertz-ninja"
  else
    echo "WARNUNG: Sicherungsordner $backup_dir nicht erreichbar (USB-Stick eingesteckt?)." >&2
    exit 1
  fi
fi
