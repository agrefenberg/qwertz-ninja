# Gestaltung von QWERTZ Ninja

Kurze Regeln, damit neue Ansichten zum Rest passen. Alle Werte stehen als Variablen oben in `public/css/app.css`; neue Stile benutzen diese Variablen statt eigener Zahlen.

## Grundsätze

- Ruhige graue Fläche (`--bg`), darauf weiße Karten (`--surface`). Farbe kommt über Kacheln und die Fingerfarben, nicht über Text.
- Keine Emojis, keine externen Schriften oder Bilder. Schrift ist die mitgelieferte Plus Jakarta Sans (`font-family: 'Jakarta'`).
- Alles muss mit Tastatur, auf dem iPad mit Touch und auf dem Handy bedienbar sein.

## Farben und ihre Bedeutung

| Variable | Wofür |
|---|---|
| `--ink` | Text, Hauptknöpfe, aktives Menü, Fokusrahmen |
| `--muted` | Nebentext (mindestens 4,5:1 auf Weiß und auf `--bg`) |
| `--text-pending` | noch zu tippender Übungstext |
| `--on-color-muted` | Nebentext auf farbigen Kacheln |
| `--field-border` | Rahmen von Eingabefeldern (3:1) |
| `--coral` | „Jetzt dran“: aktuelle Lektion, Hinweis zum Handeln |
| `--green` | bestanden, geschafft |
| `--yellow` | Markierung des aktuellen Zeichens, eigene Zeile in Ranglisten, Schüleransicht |
| `--purple`, `--cyan`, `--pink`, `--blue` | Kacheln zur Unterscheidung, ohne eigene Bedeutung |
| `--err`, `--err-bg` | Tippfehler und Fehlerhinweise |
| `--danger-text` | Löschen und andere endgültige Aktionen |
| `--f-l5` … `--f-th` | Fingerfarben der Bildschirmtastatur, nur dort verwenden |

Text auf Farbflächen ist immer `--ink` oder `--on-color-muted`, nie Weiß auf Pastell.

## Schrift

| Variable | Größe | Einsatz |
|---|---|---|
| `--fs-2xs` | 0,68 rem | Tastenbeschriftungen |
| `--fs-xs` | 0,8 rem | Tabellenköpfe, Marken, Hinweise unter Feldern |
| `--fs-s` | 0,9 rem | Nebentext, kleine Knöpfe, Tabellen |
| `--fs-base` | 1 rem | Fließtext |
| `--fs-m` | 1,1 rem | `h3` |
| `--fs-l` | 1,3 rem | `h2`, hervorgehobene Zahlen |
| `--fs-xl` | 1,7 rem | Kennzahlen |
| `--fs-2xl` | 2,1 rem | `h1` |
| `--fs-display` | 2,6 rem | große Ergebniszahlen |
| `--fs-type` | 1,5 rem | Übungstext (Monospace) |

Gedruckte Blätter (PLN-Vorlage, Zugangsstreifen) rechnen in `pt` und sind davon ausgenommen. Kleinste Druckschrift: 8,5 pt.

## Formen und Schatten

- Eckradien: `--radius` (24 px) für Karten und Kacheln, `--radius-s` (14 px) für Felder und kleine Flächen, `--radius-xs` (6 px) für Details, `--radius-pill` für Knöpfe, Marken und das Menü.
- Schatten: `--shadow-1` für die schwebende Kopfzeile, `--shadow-2` für angehobene Elemente. Karten haben keinen Schatten.

## Knöpfe

- `button` / `.button`: Umriss, Standard für alles.
- `.primary`: gefüllt, höchstens einer je Bereich, für den nächsten sinnvollen Schritt. Gilt für `button` und für Links mit `.button`.
- `.danger`: Löschen, immer mit Rückfrage.
- `.small`: in Tabellen und Listen. Es gibt nur diese eine kleine Variante.
- `.link`: wie ein Textlink, z. B. „← Zurück“.
- Auf Touch-Geräten sind Knöpfe mindestens 44 px (klein 40 px) hoch.

## Bedienung

- Fokus ist immer sichtbar (3 px `--ink`-Rahmen), auch bei Häkchen.
- Jedes Feld hat ein sichtbares `label` oder ein `aria-label`.
- Meldungen (`toast`) haben `role="status"`, Fehler `role="alert"`.
- Tabellen stehen in `.table-wrap` und scrollen in sich, nie die ganze Seite.
- Aktionen bauen die Ansicht mit `swapView` neu auf, damit die Seite nicht nach oben springt.
- „Bewegung reduzieren“ schaltet Animationen ab.
- Jede Seite hat eine `h1`; daraus entsteht der Titel im Browser-Tab.

## Bildschirmgrößen

- Ab 1366 × 768 und auf dem iPad quer passen Übungstext und alle fünf Tastenreihen ohne Scrollen auf den Bildschirm (kompakte Darstellung bei geringer Höhe).
- Unter 640 px klappt das Menü hinter dem Knopf „Menü“ auf.
- Auf Handys (unter 700 px mit Touch) ist die Bildschirmtastatur ausgeblendet.
