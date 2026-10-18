#!/usr/bin/env bash
# Installiert oder aktualisiert QWERTZ Ninja auf einem Raspberry Pi direkt von GitHub.
#   curl -fsSL https://raw.githubusercontent.com/agrefenberg/qwertz-ninja/main/installieren.sh | sudo bash
# Erster Aufruf: holt den Code nach ~/qwertz-ninja und startet die Einrichtung (pi-einrichten.sh).
# Jeder weitere Aufruf: holt den neuesten Stand und startet die App neu. Daten und .env bleiben erhalten.
set -euo pipefail

REPO=${QN_REPO:-https://github.com/agrefenberg/qwertz-ninja.git}
BRANCH=${QN_BRANCH:-main}

main() {
  if [ "$(uname -s)" != Linux ] || ! command -v apt-get >/dev/null; then
    echo "Dieses Skript ist nur für den Raspberry Pi (Raspberry Pi OS)."; exit 1
  fi
  if [ "$(id -u)" -ne 0 ]; then
    echo "Bitte mit sudo starten:"
    echo "  curl -fsSL https://raw.githubusercontent.com/agrefenberg/qwertz-ninja/main/installieren.sh | sudo bash"
    exit 1
  fi
  local owner=${SUDO_USER:-root}
  local home
  home=$(getent passwd "$owner" | cut -d: -f6)
  local dir=${QN_DIR:-$home/qwertz-ninja}
  as_owner() { if [ "$owner" = root ]; then "$@"; else sudo -u "$owner" "$@"; fi; }

  if ! command -v git >/dev/null; then
    echo "git installieren …"
    apt-get update -qq && apt-get install -y -qq git >/dev/null
  fi

  if [ -d "$dir/.git" ]; then
    echo "QWERTZ Ninja aktualisieren in $dir"
    as_owner git -C "$dir" fetch --quiet origin "$BRANCH"
    as_owner git -C "$dir" reset --quiet --hard "origin/$BRANCH"
    if docker compose version >/dev/null 2>&1 && [ -f "$dir/.env" ]; then
      bash "$dir/start.sh"
      echo "Fertig. Stand: $(as_owner git -C "$dir" log -1 --format='%cd · %s' --date=format:'%d.%m.%Y %H:%M')"
      return
    fi
  elif [ -d "$dir" ]; then
    # Bisher per Zip installiert: Ordner in einen git-Stand umwandeln, data und .env bleiben.
    echo "Bestehende Installation in $dir auf GitHub-Updates umstellen"
    as_owner git -C "$dir" init --quiet -b "$BRANCH"
    as_owner git -C "$dir" remote add origin "$REPO" 2>/dev/null || as_owner git -C "$dir" remote set-url origin "$REPO"
    as_owner git -C "$dir" fetch --quiet origin "$BRANCH"
    as_owner git -C "$dir" reset --quiet --hard "origin/$BRANCH"
  else
    echo "QWERTZ Ninja herunterladen nach $dir"
    as_owner git clone --quiet --branch "$BRANCH" "$REPO" "$dir"
  fi

  # Erste Einrichtung (oder Einrichtung noch nicht abgeschlossen): Fragen kommen über das Terminal.
  bash "$dir/pi-einrichten.sh"
}

# Alles in main(), damit "curl … | bash" das Skript erst vollständig liest.
main "$@"
