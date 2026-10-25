#!/usr/bin/env bash
# Setzt das Passwort eines Kontos neu, z. B. wenn ein Admin es vergessen hat.
#   sudo ./passwort-zuruecksetzen.sh <Benutzername>
# Fragt nach dem neuen Passwort. Leer lassen, dann wird eines erzeugt und angezeigt.
set -euo pipefail
cd "$(dirname "$0")"

file=docker-compose.yml
if [ -f .env ] && grep -qE '^QN_DOMAIN=.+' .env; then file=docker-compose.https.yml; fi

user=${1:-}
pw=
if [ -n "$user" ]; then
  read -rsp "Neues Passwort für $user (leer = erzeugen): " pw; echo
  if [ -n "$pw" ]; then
    read -rsp "Passwort wiederholen: " pw2; echo
    if [ "$pw" != "$pw2" ]; then echo "Die Passwörter stimmen nicht überein." >&2; exit 1; fi
  fi
fi

docker compose -f "$file" exec -T -e PW="$pw" qwertz-ninja node --no-warnings server/passwort.js "$user"
