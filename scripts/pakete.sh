#!/usr/bin/env bash
# Baut die beiden Auslieferungspakete aus dem aktuellen git-Stand:
#   qwertz-ninja.zip        ohne Raspberry-Pi-Einrichtung (z. B. für den Mac mini)
#   qwertz-ninja-raspi.zip  mit pi-einrichten.sh, start.sh und sicherung.sh
#   scripts/pakete.sh <Zielordner>
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=$(realpath "${1:?Zielordner angeben}")
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

rm -f "$OUT/qwertz-ninja-raspi.zip" "$OUT/qwertz-ninja.zip"
git archive --format=zip -o "$OUT/qwertz-ninja-raspi.zip" HEAD

git archive HEAD | tar -x -C "$TMP"
rm -f "$TMP/pi-einrichten.sh" "$TMP/start.sh" "$TMP/sicherung.sh" "$TMP/installieren.sh"
python3 scripts/readme-ohne-pi.py "$TMP/README.md"
(cd "$TMP" && zip -qr "$OUT/qwertz-ninja.zip" .)
echo "Pakete in $OUT"
