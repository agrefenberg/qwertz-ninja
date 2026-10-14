# QWERTZ Ninja

Tastschreibtrainer für Fortgeschrittene auf deutscher QWERTZ-Tastatur. Web-App für eine Schule, mit eigenen pseudonymen Konten, ohne externe Dienste.

## Funktionen

- **Lernende:** geführte Wiederholung der Grundstellung beim ersten Anmelden, Übungen mit Texten, Wortlisten und automatisch erzeugten Schwachstellen-Übungen, Bildschirmtastatur mit Fingerfarben, Fehlermodus wählbar (weitertippen oder korrigieren), Anschläge/min und WPM umschaltbar, Gürtel-Level, Abzeichen, Rangliste (wenn freigegeben).
- **Lehrkräfte:** Klassen anlegen, Schülerzugänge als Schneideliste drucken, Übungen mit Frist und Tests mit Zeitlimit zuweisen, Notenschlüssel mit Notenvorschlag, eigene Texte, Ergebnisse pro Klasse, Aufgabe und Schüler, CSV-Export.
- **Admin:** Lehrkräfte anlegen, Passwörter zurücksetzen, Schulname, Schuljahresende, Datenschutzhinweis.

### Bewertung

- **Anschläge/min (netto)** zählen nur richtige Anschläge. **WPM** = Anschläge/min ÷ 5.
- **Tests:** Korrigieren mit der Rücktaste ist erlaubt. Gewertet wird nur der Endstand, korrigierte Fehler zählen also nicht. Fehler werden als Editierdistanz gezählt: Ein ausgelassener oder doppelter Buchstabe ist ein Fehler und verschiebt nicht den Rest des Textes.
- **Notenschlüssel:** Mindestzahl Netto-Anschläge pro Minute für die Noten 1 bis 5, optional mit Abzug je Fehler. Die App schlägt die Note nur vor.
- Die Startzeit eines Tests misst der Server. Jeder Test hat einen Versuch, den die Lehrkraft zurücksetzen kann.

### Datenschutz

- Für Schülerinnen und Schüler werden nur Pseudonym, Benutzername, Passwort-Hash und Ergebnisse gespeichert, keine Namen und keine E-Mail-Adressen.
- Keine Tracking-Cookies, keine CDNs, keine externen Schriftarten oder Skripte. Nur ein technisch notwendiges Sitzungs-Cookie.
- Alle Ergebnisse, Aufgaben, Abzeichen und Punkte werden am Tag nach dem Schuljahresende (Standard: 31. Juli) automatisch gelöscht. Konten und Klassen bleiben bestehen.
- Die Daten liegen in einer einzigen SQLite-Datei auf dem eigenen Server.
- Alle mitgelieferten Übungstexte wurden eigens für QWERTZ Ninja geschrieben.

## Betrieb

Voraussetzung: Docker, oder Node.js ab Version 22.13.

### Im lokalen Netz (mit Docker)

```sh
docker compose up -d --build
```

Die App ist dann unter `http://<IP-des-Rechners>:3080` erreichbar, die Datenbank liegt in `./data`. Beim ersten Aufruf legt man den Admin an. Ist Port 3080 belegt: `QN_PORT=3090 docker compose up -d --build`.

### Im Internet mit HTTPS (z. B. Raspberry Pi)

1. Raspberry Pi OS (64 Bit) mit Docker installieren.
2. Eine Adresse besorgen, die auf euren Internetanschluss zeigt, z. B. über MyFRITZ! oder einen DynDNS-Dienst.
3. Am Router die Ports 80 und 443 an den Raspberry Pi weiterleiten.
4. Wichtig: Den Admin zuerst im lokalen Netz anlegen, bevor die Ports freigegeben werden. Sonst könnte jemand anderes die Einrichtung übernehmen.
5. Starten:

```sh
QN_DOMAIN=ninja.example.de docker compose -f docker-compose.https.yml up -d --build
```

Caddy holt das HTTPS-Zertifikat automatisch und schreibt keine Zugriffsprotokolle mit IP-Adressen.

### Ohne Docker

```sh
npm ci --omit=dev
npm start
```

Umgebungsvariablen: `PORT` (Standard 3000), `DB_FILE` (Standard `./data/qwertz-ninja.sqlite`), `SECURE_COOKIES=1` hinter HTTPS.

### Aktualisieren

Neue Zip-Datei in denselben Ordner entpacken (der Ordner `data` bleibt dabei erhalten) und neu bauen:

```sh
unzip -o qwertz-ninja.zip -d qwertz-ninja
cd qwertz-ninja
docker compose up -d --build
```

### Demodaten

Unter Admin › Einstellungen lassen sich Demodaten anlegen und wieder entfernen: vier Demo-Lehrkräfte (`demo-huber`, `demo-maier`, `demo-yilmaz`, `demo-schmid`), sieben Klassen, rund 170 Schülerkonten mit mehreren Wochen Ergebnissen. Passwort für alle Demo-Konten: `ninja-demo`. Echte Konten bleiben unberührt.

### Sicherung

Es genügt, den Ordner `data` zu sichern. Für eine konsistente Kopie im laufenden Betrieb: `sqlite3 data/qwertz-ninja.sqlite ".backup sicherung.sqlite"`.

## Entwicklung

```sh
npm install
npm test
```

Aufbau: `server/` (Express, `node:sqlite`), `public/` (Oberfläche ohne Build-Schritt, ES-Module). Die Auswertung in `public/js/scoring.js` nutzen Browser und Server gemeinsam.
