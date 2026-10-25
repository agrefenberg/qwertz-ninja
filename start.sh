#!/usr/bin/env bash
# Startet QWERTZ Ninja (neu), z. B. nach einem Update.
# Mit QN_DOMAIN in der Datei .env läuft die App mit HTTPS, sonst nur im lokalen Netz.
set -euo pipefail
cd "$(dirname "$0")"

compose_file() {
  if [ -f .env ] && grep -qE '^QN_DOMAIN=.+' .env; then echo docker-compose.https.yml; else echo docker-compose.yml; fi
}

docker compose -f "$(compose_file)" up -d --build --remove-orphans
docker image prune -f >/dev/null
# Alten Build-Cache aufräumen, damit die SD-Karte nicht volläuft.
docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
echo "QWERTZ Ninja läuft ($(compose_file))."
