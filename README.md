# QWERTZ Ninja

Tastschreibtrainer für Fortgeschrittene auf deutscher QWERTZ-Tastatur. Web-App für eine Schule, mit eigenen pseudonymen Konten, ohne externe Dienste.

## Funktionen

- **Lernende:** geführte Wiederholung der Grundstellung beim ersten Anmelden, Übungen mit Texten, Wortlisten und automatisch erzeugten Schwachstellen-Übungen, Bildschirmtastatur mit Fingerfarben, Fehlermodus wählbar (weitertippen oder korrigieren), Anschläge/min und WPM umschaltbar, Gürtel-Level, Abzeichen, Rangliste (wenn freigegeben).
- **Kurs:** 16 aufeinander aufbauende Lektionen von der Grundreihe bis zur Abschlussprüfung. Bestanden mit höchstens 3 % Fehlern, dann wird die nächste frei; Sterne für Tempo.
- **Persönliche Fehleranalyse:** Die App merkt sich schwache Tasten, typische Verwechslungen (z. B. „ä statt ö“) und oft verschriebene Wörter, zeigt sie unter „Fehler“ und erzeugt passende Übungen. Lehrkräfte sehen die Analyse in der Schüleransicht.
- **Lehrkräfte:** Klassen anlegen, Schülerzugänge als Schneideliste drucken (jederzeit erneut für alle oder ausgewählte Schüler, dabei werden neue Passwörter vergeben), Übungen mit Frist und Tests mit Zeitlimit zuweisen, Notenschlüssel mit Notenvorschlag, eigene Texte, Ergebnisse pro Klasse, Aufgabe und Schüler, CSV-Export.
- **Admin:** Lehrkräfte anlegen, Passwörter zurücksetzen, Schulname, Schuljahresende, Datenschutzhinweis.

### Bewertung

- **Anschläge/min (netto)** zählen nur richtige Anschläge. **WPM** = Anschläge/min ÷ 5.
- **Tests:** Korrigieren mit der Rücktaste ist erlaubt. Gewertet wird nur der Endstand, korrigierte Fehler zählen also nicht. Fehler werden als Editierdistanz gezählt: Ein ausgelassener oder doppelter Buchstabe ist ein Fehler und verschiebt nicht den Rest des Textes.
- **Notenschlüssel:** Mindestzahl Netto-Anschläge pro Minute für die Noten 1 bis 5, optional mit Abzug je Fehler. Die App schlägt die Note nur vor.
- Die Startzeit eines Tests misst der Server. Jeder Test hat einen Versuch, den die Lehrkraft zurücksetzen kann.

### Datenschutz

- Für Schülerinnen und Schüler werden nur Pseudonym, Benutzername, Passwort-Hash und Ergebnisse gespeichert, keine Namen und keine E-Mail-Adressen.
- Keine Tracking-Cookies, keine CDNs, keine externen Schriftarten oder Skripte. Nur ein technisch notwendiges Sitzungs-Cookie.
- Alle Ergebnisse, Aufgaben, Abzeichen, Punkte, Kursfortschritte und Fehleranalysen werden am Tag nach dem Schuljahresende (Standard: 31. Juli) automatisch gelöscht. Konten und Klassen bleiben bestehen.
- Die Daten liegen in einer einzigen SQLite-Datei auf dem eigenen Server.
- Alle mitgelieferten Übungstexte wurden eigens für QWERTZ Ninja geschrieben. Die Schrift Plus Jakarta Sans (SIL Open Font License, `public/fonts`) wird vom eigenen Server ausgeliefert.

## Betrieb

Voraussetzung: Docker, oder Node.js ab Version 22.13.

### Im lokalen Netz (mit Docker)

```sh
docker compose up -d --build
```

Die App ist dann unter `http://<IP-des-Rechners>:3080` erreichbar, die Datenbank liegt in `./data`. Beim ersten Aufruf legt man den Admin an. Ist Port 3080 belegt: `QN_PORT=3090 docker compose up -d --build`.

### Auf einem Raspberry Pi (mit Einrichtungsskript)

Voraussetzungen: Raspberry Pi 4 oder 5 mit Raspberry Pi OS Lite (64 Bit), am besten mit USB-SSD statt SD-Karte. Für den Zugriff von außen außerdem eine Adresse, die auf euren Internetanschluss zeigt (z. B. MyFRITZ! oder DynDNS).

1. Zip-Datei auf den Pi kopieren und entpacken: `unzip qwertz-ninja-raspi.zip -d qwertz-ninja && cd qwertz-ninja`
2. Einrichtung starten: `sudo bash pi-einrichten.sh`

Das Skript aktualisiert das System, schaltet automatische Sicherheitsupdates ein, installiert Docker, startet die App zuerst nur im lokalen Netz und wartet, bis der Admin angelegt ist. Erst danach stellt es auf HTTPS um (Caddy holt das Zertifikat automatisch und schreibt keine Zugriffsprotokolle mit IP-Adressen). Zum Schluss richtet es die nächtliche Sicherung ein und sagt, welche Ports (80 und 443) am Router freizugeben sind. Das Skript kann jederzeit erneut laufen, z. B. um HTTPS später einzuschalten.

Ohne Skript geht es auch von Hand: `QN_DOMAIN=ninja.example.de docker compose -f docker-compose.https.yml up -d --build`. Wichtig: den Admin anlegen, bevor die Ports freigegeben werden.

### Ohne Docker

```sh
npm ci --omit=dev
npm start
```

Umgebungsvariablen: `PORT` (Standard 3000), `DB_FILE` (Standard `./data/qwertz-ninja.sqlite`), `SECURE_COOKIES=1` hinter HTTPS.

### Aktualisieren

Neue Zip-Datei in denselben Ordner entpacken (der Ordner `data` und die Einstellungen in `.env` bleiben dabei erhalten) und neu starten:

```sh
unzip -o qwertz-ninja-raspi.zip -d qwertz-ninja
cd qwertz-ninja
sudo ./start.sh
```

`start.sh` wählt selbst, ob mit HTTPS (wenn `QN_DOMAIN` in `.env` steht) oder nur im lokalen Netz.

### Demodaten

Unter Admin › Einstellungen lassen sich Demodaten anlegen und wieder entfernen: vier Demo-Lehrkräfte (`demo-huber`, `demo-maier`, `demo-yilmaz`, `demo-schmid`), sieben Klassen, rund 170 Schülerkonten mit mehreren Wochen Ergebnissen. Passwort für alle Demo-Konten: `ninja-demo`. Echte Konten bleiben unberührt.

### Sicherung

Es genügt, den Ordner `data` zu sichern. `./sicherung.sh` legt im laufenden Betrieb eine konsistente Kopie in `data/sicherung` an (die letzten 14 bleiben) und kopiert sie zusätzlich in `QN_BACKUP_DIR` aus `.env`, z. B. auf einen USB-Stick. Das Einrichtungsskript startet die Sicherung jede Nacht um 2:30 Uhr. Wiederherstellen: App stoppen, die gewünschte Sicherung als `data/qwertz-ninja.sqlite` zurückkopieren (vorhandene `-wal`- und `-shm`-Dateien daneben löschen), wieder starten.

## Entwicklung

```sh
npm install
npm test
```

Aufbau: `server/` (Express, `node:sqlite`), `public/` (Oberfläche ohne Build-Schritt, ES-Module). Die Auswertung in `public/js/scoring.js` nutzen Browser und Server gemeinsam.
