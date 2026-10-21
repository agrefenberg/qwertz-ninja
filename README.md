# QWERTZ Ninja

Tastschreibtrainer für Fortgeschrittene auf deutscher QWERTZ-Tastatur. Web-App für eine Schule, mit eigenen pseudonymen Konten, ohne externe Dienste.

## Funktionen

- **Lernende:** geführte Wiederholung der Grundstellung beim ersten Anmelden, Übungen mit Texten, Wortlisten und automatisch erzeugten Schwachstellen-Übungen, Bildschirmtastatur mit Fingerfarben, Fehlermodus wählbar (weitertippen oder korrigieren), Anschläge/min und WPM umschaltbar, Gürtel-Level, Abzeichen, Rangliste (wenn freigegeben).
- **Kurs:** 16 aufeinander aufbauende Lektionen von der Grundreihe bis zur Abschlussprüfung. Bestanden mit höchstens 3 % Fehlern, dann wird die nächste frei; Sterne für Tempo.
- **Persönliche Fehleranalyse:** Die App merkt sich schwache Tasten, typische Verwechslungen (z. B. „ä statt ö“) und oft verschriebene Wörter, zeigt sie unter „Fehler“ und erzeugt passende Übungen. Lehrkräfte sehen die Analyse in der Schüleransicht.
- **Lehrkräfte:** Klassen anlegen, Schülerzugänge als Schneideliste drucken (jederzeit erneut für alle oder ausgewählte Schüler, dabei werden neue Passwörter vergeben), Übungen mit Frist und Tests mit Zeitlimit zuweisen, Notenschlüssel mit Notenvorschlag, PLN (Praktischer Leistungsnachweis, 10-Minuten-Abschrift) nach den Richtlinien mit einstellbaren Bewertungsregeln, Druckvorlage und PDF aller Abschriften, eigene Texte, Ergebnisse pro Klasse, Aufgabe und Schüler, CSV-Export.
- **Admin:** Lehrkräfte anlegen, Passwörter zurücksetzen, Schulname, Schuljahresende, Datenschutzhinweis.

### Bewertung

- **Anschläge/min (netto)** zählen nur richtige Anschläge. **WPM** = Anschläge/min ÷ 5.
- **Tests:** Korrigieren mit der Rücktaste ist erlaubt. Gewertet wird nur der Endstand, korrigierte Fehler zählen also nicht. Fehler werden als Editierdistanz gezählt: Ein ausgelassener oder doppelter Buchstabe ist ein Fehler und verschiebt nicht den Rest des Textes.
- **Notenschlüssel:** Mindestzahl Netto-Anschläge pro Minute für die Noten 1 bis 5, optional mit Abzug je Fehler. Die App schlägt die Note nur vor.
- Die Startzeit eines Tests misst der Server. Jeder Test hat einen Versuch, den die Lehrkraft zurücksetzen kann.

### PLN: 10-Minuten-Abschrift

- Die Lehrkraft legt in der Klasse einen PLN an und wählt eine Vorlage nach den Richtlinien (6. Klasse 1.–4. PLN, 7. Klasse 900/1000, 8. Klasse 1100/1200, 9./10. Klasse 1200 Anschläge). Jeder Wert lässt sich danach unter „Bewertung genau einstellen“ ändern, auch nachträglich; die Notenvorschläge werden dann neu berechnet.
- Bewertungsarten:
  - **Fehlerprozente** (7.–9. Klasse): Fehler × 100 : Anschläge, Note 1 bis 0,100 %, Note 2 bis 0,200 % … ab 0,501 % Note 6. Geforderte Anschlagszahl; wird sie um bis zu 50/100/150/200 Anschläge unterschritten, sinkt die Note um 1/2/3/4 Stufen, darüber Note 6. Bonus: ab 400 Anschlägen über dem Soll wird 1 Fehler nicht gewertet, je weitere 200 einer mehr.
  - **Fehlerzahl bei festen Zeilen** (6. Klasse): 10/11/12 Zeilen in 12 Minuten, 0–1 Fehler Note 1, 2–3 Note 2 … ab 10 Note 6. Jede fehlende oder angefangene Zeile eine Notenstufe schlechter (nicht bei nur einem fehlenden einsilbigen Wort), Fehler in der angefangenen oder fehlenden Zeile zählen nicht.
  - **Notenschlüssel** nach Anschlägen pro Minute (bisheriges Verfahren, ältere PLN bleiben dabei).
- Weitere Einstellungen: Arbeitszeit, Großbuchstabe zählt 2 Anschläge, ein Fehler je Wort, letzte Sinneinheit frei, Wiederholungsfehler, Returntaste, Zeichen je Zeile, Gewichtung, Nachteilsausgleich (25 % mehr Zeit bzw. 20 % weniger Zeilen).
- Nachteilsausgleich (LRS/Legasthenie) kreuzt die Lehrkraft je Person vor dem Start an; dazu gibt es eine Vorlage mit größerer Schrift. „Ohne 10 F.“ setzt die Note 6, wenn das Zehn-Finger-System nicht angewendet wurde.
- Die Druckvorlage (12 Punkt, eineinhalbfacher Zeilenabstand) enthält immer den Hinweis „Es ist ein Fließtext im Zehn-Finger-System zu schreiben“ und eine Markierung, bis wohin für die Note 1 getippt werden muss.
- Nach der Freigabe startet jede Schülerin und jeder Schüler selbst und schreibt die eingestellte Zeit lang, ohne den Text am Bildschirm zu sehen. Der Stand wird alle 10 Sekunden zwischengespeichert und nach Ablauf unverändert festgehalten.
- Wertung: zwei Tippfehler in einem Wort zählen als ein Fehler (alle werden markiert), in der letzten Sinneinheit wird kein Fehler gewertet, Returntaste je nach Einstellung. Zu jedem Notenvorschlag steht der Rechenweg in der Tabelle und im PDF.
- Die Lehrkraft lädt alle Abschriften als ein PDF herunter: je Person eine Seite mit Pseudonym, Datum und Uhrzeit, unverändertem Text mit markierten Fehlern und Fehlerliste.

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

Am einfachsten direkt von GitHub, mit einem einzigen Befehl im Terminal des Pi:

```sh
curl -fsSL https://raw.githubusercontent.com/agrefenberg/qwertz-ninja/main/installieren.sh | sudo bash
```

Der Befehl lädt den Code nach `~/qwertz-ninja` und startet die Einrichtung. Derselbe Befehl spielt später auch jedes Update ein: Er holt den neuesten Stand von GitHub und startet die App neu, der Ordner `data` und die Einstellungen in `.env` bleiben erhalten. Eine bisher per Zip-Datei eingerichtete Installation in `~/qwertz-ninja` wird dabei auf GitHub-Updates umgestellt.

Alternativ mit der Zip-Datei:

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

Auf dem Raspberry Pi mit GitHub-Installation genügt der Installationsbefehl von oben. Sonst die neue Zip-Datei in denselben Ordner entpacken (der Ordner `data` und die Einstellungen in `.env` bleiben dabei erhalten) und neu starten:

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

### Mehrere Schulen (Betreiber)

Bei der Einrichtung lässt sich statt „Für eine Schule“ auch „Für mehrere Schulen“ wählen. Dann ist das erste Konto der Betreiber. Er trägt unter „Einstellungen“ seine Angaben ein (sie stehen im AVV) und legt unter „Schulen“ jede Schule mit einem Admin-Konto an. Jede Schule hat eigene Lehrkräfte, Klassen, Texte, Einstellungen und ein eigenes Schuljahresende; die Schulen sehen nichts voneinander. Der Betreiber sieht keine Ergebnisse.

Für jede Schule erzeugt das Programm einen vorausgefüllten **Vertrag zur Auftragsverarbeitung** (Art. 28 DSGVO) mit Anlage zu den technischen und organisatorischen Maßnahmen als PDF. Bis der Betreiber den unterschriebenen AVV mit Datum einträgt, können sich nur die Admins der Schule anmelden. Der AVV ist eine Vorlage und sollte vor der Unterzeichnung von der oder dem Datenschutzbeauftragten der Schule geprüft werden.

Bestehende Installationen laufen unverändert als eine Schule weiter.

### Anmeldung über VIDIS

Im Mehrschulbetrieb können sich Lehrkräfte und Schüler über [VIDIS](https://www.vidis.schule) anmelden (OpenID Connect). VIDIS liefert nur eine pseudonyme Kennung, die Rolle und die Schulkennung, bei Lehrkräften gegebenenfalls den Namen. Angemeldet wird nur, wessen Schulkennung beim Betreiber mit unterschriebenem AVV eingetragen ist. Schüler treten beim ersten Mal mit dem Klassencode ihrer Lehrkraft einer Klasse bei; den Code erzeugt die Lehrkraft in der Klassenansicht.

Voraussetzung ist die Registrierung des Angebots bei der FWU (vidis@fwu.de). Die Zugangsdaten kommen in die Datei `.env`:

```sh
QN_PUBLIC_URL=https://ninja.example.de
QN_VIDIS_ISSUER=https://aai-test.vidis.schule/auth/realms/vidis   # zuerst das Testsystem
QN_VIDIS_CLIENT_ID=…
QN_VIDIS_CLIENT_SECRET=…
```

Als Rückleitungsadresse (Redirect-URI) bei der FWU angeben: `https://ninja.example.de/api/vidis/callback`. Für die Vorauswahl des Bundeslands kann ein Link auf `/api/vidis/login?vidis_idp_hint=…` gesetzt werden.

## Entwicklung

```sh
npm install
npm test
```

Aufbau: `server/` (Express, `node:sqlite`), `public/` (Oberfläche ohne Build-Schritt, ES-Module). Die Auswertung in `public/js/scoring.js` nutzen Browser und Server gemeinsam.
