# Entfernt die Raspberry-Pi-Abschnitte aus der README für das Paket ohne Pi-Einrichtung.
import sys

p = sys.argv[1]
s = open(p, encoding='utf-8').read()
a = s.index('### Auf einem Raspberry Pi')
b = s.index('### Ohne Docker')
s = s[:a] + '''### Im Internet mit HTTPS

```sh
QN_DOMAIN=ninja.example.de docker compose -f docker-compose.https.yml up -d --build
```

Voraussetzung: eine Adresse, die auf euren Internetanschluss zeigt, und am Router die Ports 80 und 443 zu diesem Gerät. Den Admin zuerst im lokalen Netz anlegen, bevor die Ports freigegeben werden. Für einen Raspberry Pi gibt es eine eigene Version mit Einrichtungsskript.

''' + s[b:]
a = s.index('### Aktualisieren')
b = s.index('### Demodaten')
s = s[:a] + '''### Aktualisieren

Neue Zip-Datei in denselben Ordner entpacken (der Ordner `data` bleibt dabei erhalten) und neu bauen:

```sh
unzip -o qwertz-ninja.zip -d qwertz-ninja
cd qwertz-ninja
docker compose up -d --build
```

''' + s[b:]
i = s.index('Es genügt, den Ordner `data` zu sichern.')
j = s.index('\n', i)
s = s[:i] + 'Es genügt, den Ordner `data` zu sichern. Für eine konsistente Kopie im laufenden Betrieb: `docker compose exec qwertz-ninja node --no-warnings server/backup.js` (legt die Sicherung in `data/sicherung` ab).' + s[j:]
assert 'pi-einrichten' not in s and 'start.sh' not in s and 'sicherung.sh' not in s
open(p, 'w', encoding='utf-8').write(s)
