// Wortliste für Wortübungen und Schwachstellen-Übungen.
export const WORDS = `
und der die das ist nicht ein eine zu den mit sich auf für von im dem auch es an werden aus er hat
sie nach bei um am sind noch wie einem über einen so zum war haben nur oder aber vor zur bis mehr
durch man sein wurde sei hatte kann gegen vom können schon wenn habe seine ihre dann unter wir soll
ich eines jahr zwei jahre diese dieser wieder keine seiner worden will zwischen immer was sagte gibt
alle diesen seit muss doch jetzt drei neue damit bereits da ab ohne sowie sollen würde müssen
Zeit Mensch Hand Tag Welt Leben Frau Mann Kind Haus Stadt Land Schule Arbeit Wasser Weg Freund
Freundin Familie Straße Gruß Größe Fuß Maß Spaß Fluss Schloss Brötchen Mädchen Bäcker Bücher Löffel
Äpfel Öfen Übung Tür Tür Glück Brücke Küche Müller Größe Höhe Lösung Prüfung Gebühr Gefühl Märchen
Käse Bär Fähre Schüler Lehrerin Klasse Tastatur Finger Taste Zeile Abschnitt Absatz Satz Wort Buchstabe
Bildschirm Rechner Drucker Datei Ordner Programm Nachricht Termin Besprechung Rechnung Angebot
Bestellung Lieferung Kunde Kundin Firma Abteilung Vertrag Unterschrift Antwort Frage Beispiel
schnell langsam richtig falsch schön groß klein lang kurz hoch tief warm kalt neu alt jung früh spät
leicht schwer genau ruhig müde fröhlich wütend zufrieden gemütlich natürlich wirklich plötzlich
schreiben tippen lesen lernen üben rechnen spielen laufen fahren fliegen schwimmen springen
kochen backen essen trinken schlafen träumen denken wissen fühlen hören sehen zählen wählen
zahlen ändern prüfen öffnen schließen grüßen küssen müssen dürfen mögen möchten würden hätten
quer Quelle Qualität Quark Quatsch Quiz bequem Aquarium Xylophon Taxi Text Hexe Boxer Mix
Yacht Typ Hobby Party Pony Joghurt Jacke Jahr Juli Juni Januar jeder jemand jetzt Vogel Vase
Vater Volk voll vier viel vorbei Pferd Pflanze Pfeffer Apfel Kopf Zopf Zug Zahn Zange Zebra
Zucker Ziege Zwerg zwölf Wurzel Herz Pilz Salz Schatz Platz Katze Hitze Spitze Mütze Pfütze
Schwester Bruder Onkel Tante Oma Opa Nachbar Nachbarin Polizei Feuerwehr Krankenhaus Apotheke
Bahnhof Flughafen Hafen Brücke Tunnel Berg Tal Fluss See Meer Insel Wald Wiese Feld Garten
Montag Dienstag Mittwoch Donnerstag Freitag Samstag Sonntag Woche Monat Morgen Abend Nacht Mittag
`
  .trim()
  .split(/\s+/)
  .filter((w, i, all) => all.indexOf(w) === i);

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomWords(count = 40) {
  const out = [];
  while (out.length < count) out.push(...shuffle(WORDS));
  return out.slice(0, count).join(' ');
}

// Wörter, die die Schwachstellen-Zeichen besonders oft enthalten, plus kurze Griffübungen.
export function weakExercise(weakChars, count = 40) {
  if (!weakChars.length) return randomWords(count);
  const lower = weakChars.map((c) => c.toLowerCase());
  const scored = WORDS.map((w) => ({
    w,
    score: Array.from(w).filter((c) => weakChars.includes(c) || lower.includes(c.toLowerCase())).length,
  })).filter((x) => x.score > 0);
  const pool = scored.sort((a, b) => b.score - a.score).slice(0, 60).map((x) => x.w);
  const drills = weakChars.filter((c) => c !== ' ').map((c) => `${c}${c}${c}`);
  const out = [];
  let i = 0;
  while (out.length < count) {
    if (drills.length && i % 6 === 0) out.push(drills[(i / 6) % drills.length]);
    else out.push(pool.length ? pool[Math.floor(Math.random() * pool.length)] : WORDS[Math.floor(Math.random() * WORDS.length)]);
    i++;
  }
  return out.join(' ');
}

// Gegenüberstellung zweier verwechselter Zeichen: Wechselgriffe und Wörter mit dem richtigen Zeichen.
export function contrastExercise(expected, typed, count = 36) {
  const pair = [expected, typed].filter((c) => c.trim());
  const drills = pair.length === 2 ? [`${pair[0]}${pair[1]}`, `${pair[1]}${pair[0]}`, `${pair[0]}${pair[0]}${pair[1]}`] : [];
  const lower = expected.toLowerCase();
  const words = WORDS.filter((w) => w.includes(expected) || w.toLowerCase().includes(lower));
  const pool = words.length ? words : WORDS;
  const out = [];
  for (let i = 0; out.length < count; i++) out.push(i % 4 === 0 && drills.length ? drills[(i / 4) % drills.length] : pool[Math.floor(Math.random() * pool.length)]);
  return out.join(' ');
}

// Die persönlich oft verschriebenen Wörter mehrfach in gemischter Reihenfolge.
export function wordsExercise(words, rounds = 3) {
  const out = [];
  for (let r = 0; r < rounds; r++) out.push(...shuffle(words));
  return out.join(' ');
}
