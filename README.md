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

### Mit Docker

```sh
docker compose up -d --build
```

Die App läuft dann auf Port 3000, die Datenbank liegt in `./data`. Beim ersten Aufruf legt man den Admin an.

Für den Betrieb im Netz gehört die App hinter einen Reverse Proxy mit HTTPS (z. B. nginx oder Caddy). Dann in `docker-compose.yml` `SECURE_COOKIES: "1"` setzen.

### Ohne Docker

```sh
npm ci --omit=dev
npm start
```

Umgebungsvariablen: `PORT` (Standard 3000), `DB_FILE` (Standard `./data/qwertz-ninja.sqlite`), `SECURE_COOKIES=1` hinter HTTPS.

### Sicherung

Es genügt, den Ordner `data` zu sichern. Für eine konsistente Kopie im laufenden Betrieb: `sqlite3 data/qwertz-ninja.sqlite ".backup sicherung.sqlite"`.

## Entwicklung

```sh
npm install
npm test
```

Aufbau: `server/` (Express, `node:sqlite`), `public/` (Oberfläche ohne Build-Schritt, ES-Module). Die Auswertung in `public/js/scoring.js` nutzen Browser und Server gemeinsam.
