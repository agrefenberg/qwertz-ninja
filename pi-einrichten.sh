#!/usr/bin/env bash
# Richtet QWERTZ Ninja auf einem Raspberry Pi (Raspberry Pi OS 64 Bit) ein.
#   sudo bash pi-einrichten.sh
# Kann gefahrlos mehrfach ausgeführt werden, z. B. um später HTTPS einzuschalten.
set -euo pipefail
cd "$(dirname "$0")"
APP_DIR=$(pwd)

say()  { printf '\n\033[1;31m▶ %s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
ask()  { local a; read -r -p "  $1 " a </dev/tty; echo "$a"; }

set_env() { # set_env KEY VALUE  (in .env, ohne andere Einträge zu verändern)
  touch .env
  grep -v -E "^$1=" .env > .env.neu || true
  if [ -n "$2" ]; then echo "$1=$2" >> .env.neu; fi
  mv .env.neu .env
}

# ---------------------------------------------------------------- Prüfungen
if [ "$(id -u)" -ne 0 ]; then
  echo "Bitte mit sudo starten: sudo bash pi-einrichten.sh"; exit 1
fi
if [ ! -f docker-compose.yml ]; then
  echo "Bitte im entpackten Ordner qwertz-ninja ausführen."; exit 1
fi
case "$(uname -m)" in
  aarch64|arm64|x86_64) ;;
  *) echo "Dieses System ist $(uname -m). Bitte Raspberry Pi OS in der 64-Bit-Version verwenden."; exit 1 ;;
esac
OWNER=${SUDO_USER:-root}

echo "QWERTZ Ninja · Einrichtung auf $(hostname)"

# ---------------------------------------------------------------- System
say "System aktualisieren und automatische Sicherheitsupdates einschalten"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl ca-certificates unattended-upgrades cron >/dev/null
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
info "erledigt"

say "Docker installieren"
if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  info "Docker ist schon installiert: $(docker --version)"
else
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null
if [ "$OWNER" != root ]; then usermod -aG docker "$OWNER"; fi

# ---------------------------------------------------------------- Datenordner
mkdir -p data
chown -R 1000:1000 data   # Benutzer "node" im Container

# ---------------------------------------------------------------- Fragen
say "Einstellungen"
CURRENT_DOMAIN=$( (grep -E '^QN_DOMAIN=' .env 2>/dev/null || true) | cut -d= -f2-)
if [ -n "$CURRENT_DOMAIN" ]; then
  info "Bisher eingestellte Adresse: $CURRENT_DOMAIN"
fi
info "Soll QWERTZ Ninja auch von außerhalb (aus dem Internet, mit HTTPS) erreichbar sein?"
info "Dafür braucht ihr eine Adresse, die auf euren Anschluss zeigt (z. B. MyFRITZ! oder DynDNS)."
EXTERN=$(ask "Von außen erreichbar? (j/n) [n]:")
DOMAIN=""
if [[ "$EXTERN" =~ ^[jJyY] ]]; then
  DOMAIN=$(ask "Adresse ohne https://, z. B. ninja.meineschule.de [${CURRENT_DOMAIN}]:")
  DOMAIN=${DOMAIN:-$CURRENT_DOMAIN}
  DOMAIN=${DOMAIN#https://}; DOMAIN=${DOMAIN#http://}; DOMAIN=${DOMAIN%%/*}
  if [ -z "$DOMAIN" ]; then echo "Keine Adresse angegeben, Abbruch."; exit 1; fi
  if ! getent hosts "$DOMAIN" >/dev/null; then
    info "Hinweis: $DOMAIN lässt sich gerade nicht auflösen. Bitte die DynDNS-Einstellung prüfen."
  fi
fi

info ""
info "Sicherungen landen jede Nacht in $APP_DIR/data/sicherung."
info "Zusätzlich auf einen USB-Stick oder ein NAS kopieren? Dann den Ordner angeben"
info "(z. B. /media/$OWNER/STICK), sonst einfach Enter."
BACKUP_DIR=$(ask "Zusätzlicher Sicherungsordner []:")
set_env QN_BACKUP_DIR "$BACKUP_DIR"

# ---------------------------------------------------------------- Start im lokalen Netz
IP=$(hostname -I | awk '{print $1}')
PORT=$( (grep -E '^QN_PORT=' .env 2>/dev/null || true) | cut -d= -f2-)
PORT=${PORT:-3080}
say "QWERTZ Ninja bauen und im lokalen Netz starten (dauert beim ersten Mal einige Minuten)"
docker compose -f docker-compose.https.yml down --remove-orphans >/dev/null 2>&1 || true
docker compose -f docker-compose.yml up -d --build --remove-orphans

for _ in $(seq 1 60); do
  curl -fs "http://localhost:$PORT/api/setup" >/dev/null 2>&1 && break
  sleep 2
done
if ! curl -fs "http://localhost:$PORT/api/setup" >/dev/null; then
  echo "Die App startet nicht. Protokoll: docker compose logs"; exit 1
fi

if curl -fs "http://localhost:$PORT/api/setup" | grep -q '"needsSetup":true'; then
  say "Jetzt den Admin anlegen"
  info "Öffne im Browser eines Rechners im selben Netz:  http://$IP:$PORT"
  info "und lege Schulname und Admin-Konto an. Das Skript wartet so lange."
  while curl -fs "http://localhost:$PORT/api/setup" | grep -q '"needsSetup":true'; do sleep 3; done
  info "Admin angelegt."
fi

# ---------------------------------------------------------------- HTTPS
if [ -n "$DOMAIN" ]; then
  set_env QN_DOMAIN "$DOMAIN"
  say "Auf HTTPS umstellen ($DOMAIN)"
  docker compose -f docker-compose.yml down --remove-orphans
  docker compose -f docker-compose.https.yml up -d --build --remove-orphans
else
  set_env QN_DOMAIN ""
fi
chown "$OWNER": .env 2>/dev/null || true

# ---------------------------------------------------------------- Sicherung
say "Nächtliche Sicherung einrichten (2:30 Uhr)"
chmod +x start.sh sicherung.sh pi-einrichten.sh
cat > /etc/cron.d/qwertz-ninja <<EOF
# QWERTZ Ninja: nächtliche Sicherung der Datenbank
30 2 * * * root $APP_DIR/sicherung.sh >> /var/log/qwertz-ninja-sicherung.log 2>&1
EOF
chmod 644 /etc/cron.d/qwertz-ninja
if "$APP_DIR/sicherung.sh"; then info "Testsicherung erfolgreich."; else info "Testsicherung fehlgeschlagen, siehe Meldung oben."; fi

# ---------------------------------------------------------------- Fertig
say "Fertig"
if [ -n "$DOMAIN" ]; then
  info "Letzter Schritt am Router (z. B. Fritzbox › Internet › Freigaben):"
  info "  Ports 80 und 443 (TCP) an dieses Gerät ($IP) weiterleiten."
  info "Danach holt sich die App das HTTPS-Zertifikat selbst. Adresse: https://$DOMAIN"
  info "Wenn es nach ein paar Minuten nicht geht: docker compose -f docker-compose.https.yml logs caddy"
else
  info "QWERTZ Ninja läuft im lokalen Netz: http://$IP:$PORT"
  info "Für HTTPS und Zugriff von außen dieses Skript später erneut starten."
fi
info ""
info "Tipp: Dem Pi im Router immer dieselbe IP-Adresse geben ($IP)."
info "Update einspielen: neue Zip-Datei entpacken, dann  sudo ./start.sh"
