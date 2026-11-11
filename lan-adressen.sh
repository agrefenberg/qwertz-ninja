#!/usr/bin/env bash
# Gibt die Adressen aus, unter denen QWERTZ Ninja im Schulnetz ohne HTTPS erreichbar ist
# (Rechnername, Rechnername.local und IP-Adressen), für Caddy im HTTPS-Betrieb.
# Steht QN_LAN_HOSTS in .env, gilt diese Liste. Wird von start.sh und pi-einrichten.sh benutzt.
cd "$(dirname "$0")"
if [ -f .env ] && grep -qE '^QN_LAN_HOSTS=.+' .env; then
  grep -E '^QN_LAN_HOSTS=' .env | tail -1 | cut -d= -f2-
  exit 0
fi
name=$(hostname -s 2>/dev/null || hostname)
hosts="http://localhost"
if [ -n "$name" ] && [ "$name" != localhost ]; then hosts="$hosts, http://$name, http://$name.local"; fi
# Nur IPv4-Adressen aus dem lokalen Netz, keine Docker-internen (172.17–31).
for ip in $(hostname -I 2>/dev/null); do
  case "$ip" in
    *:*|172.1[7-9].*|172.2[0-9].*|172.3[01].*) ;;
    *) case ", $hosts," in *", http://$ip,"*) ;; *) hosts="$hosts, http://$ip" ;; esac ;;
  esac
done
echo "$hosts"
