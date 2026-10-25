#!/usr/bin/env bash
# Spielt eine Sicherung zurück.
#   sudo ./wiederherstellen.sh data/sicherung/qwertz-ninja-20261025-0230.sqlite
#   sudo ./wiederherstellen.sh /media/usb/qwertz-ninja/qwertz-ninja-20261025-0230.sqlite.enc
# Verschlüsselte Sicherungen (.enc) werden mit QN_BACKUP_PASSWORD aus .env entschlüsselt.
# Die bisherige Datenbank bleibt als data/qwertz-ninja.sqlite.vor-wiederherstellung-<Zeit> liegen.
set -euo pipefail
cd "$(dirname "$0")"

src=${1:-}
if [ -z "$src" ] || [ ! -f "$src" ]; then
  echo "Bitte die Sicherungsdatei angeben, z. B.:"
  ls -1 data/sicherung/qwertz-ninja-*.sqlite 2>/dev/null | tail -n 5 | sed 's/^/  sudo .\/wiederherstellen.sh /'
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then echo "Bitte mit sudo starten."; exit 1; fi

file=docker-compose.yml
if [ -f .env ] && grep -qE '^QN_DOMAIN=.+' .env; then file=docker-compose.https.yml; fi

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
if [[ "$src" == *.enc ]]; then
  password=$( (grep -E '^QN_BACKUP_PASSWORD=' .env 2>/dev/null || true) | tail -n1 | cut -d= -f2-)
  [ -n "$password" ] || { echo "QN_BACKUP_PASSWORD fehlt in .env."; exit 1; }
  QN_PW="$password" openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:QN_PW -in "$src" -out "$tmp"
else
  cp "$src" "$tmp"
fi
head -c 15 "$tmp" | grep -q 'SQLite format 3' || { echo "Das ist keine SQLite-Datenbank (falsches Passwort?)."; exit 1; }

echo "App anhalten …"
docker compose -f "$file" stop qwertz-ninja
stamp=$(date +%Y%m%d-%H%M)
[ -f data/qwertz-ninja.sqlite ] && mv data/qwertz-ninja.sqlite "data/qwertz-ninja.sqlite.vor-wiederherstellung-$stamp"
rm -f data/qwertz-ninja.sqlite-wal data/qwertz-ninja.sqlite-shm
cp "$tmp" data/qwertz-ninja.sqlite
# Die App läuft im Container als Benutzer node (1000:1000) und muss die Datei schreiben dürfen.
chown 1000:1000 data/qwertz-ninja.sqlite
chmod 600 data/qwertz-ninja.sqlite
echo "App starten …"
docker compose -f "$file" start qwertz-ninja
echo "Wiederhergestellt aus $src. Die vorherige Datenbank liegt unter data/qwertz-ninja.sqlite.vor-wiederherstellung-$stamp."
