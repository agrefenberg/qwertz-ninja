// Aufbauender Kurs: Lektionen bauen aufeinander auf, die nächste wird freigeschaltet,
// sobald die vorherige mit höchstens PASS_ERROR_RATE % Fehlern geschafft ist.
import { shuffle } from './words.js';

export const PASS_ERROR_RATE = 3;

// Sterne: 1 = bestanden, 2 = zusätzlich schnell, 3 = schnell und fast fehlerfrei.
export function starsFor({ apm, errorRate }, lesson) {
  if (errorRate > PASS_ERROR_RATE) return 0;
  if (apm >= lesson.fast && errorRate <= 1) return 3;
  if (apm >= lesson.fast * 0.8) return 2;
  return 1;
}

const pickMix = (items, count) => {
  const out = [];
  while (out.length < count) out.push(...shuffle(items));
  return out.slice(0, count).join(' ');
};

export const LESSONS = [
  {
    id: 'grundreihe',
    title: 'Grundreihe',
    goal: 'Alle Buchstaben der Grundreihe sicher, ohne hinzusehen.',
    keys: 'asdfghjklöä',
    fast: 140,
    make: () => pickMix(['asdf', 'jklö', 'fjfj', 'dkdk', 'slsl', 'aöaö', 'gh', 'hg', 'ä', 'das', 'als', 'lag', 'sag', 'gas', 'glas', 'hals', 'kahl', 'lass', 'fass', 'jagd', 'saal', 'ölfass', 'hall', 'lag', 'ja'], 36),
  },
  {
    id: 'oben-links',
    title: 'Obere Reihe links',
    goal: 'q, w, e, r und t von der Grundreihe aus.',
    keys: 'qwert',
    fast: 140,
    make: () => pickMix(['fr', 'ft', 'de', 'sw', 'aq', 'rest', 'wert', 'west', 'erst', 'tee', 'see', 'fest', 'rate', 'gras', 'treffe', 'herd', 'jetzt', 'wer', 'der', 'werft', 'quer', 'quark', 'raster', 'stadt', 'adresse'], 36),
  },
  {
    id: 'oben-rechts',
    title: 'Obere Reihe rechts',
    goal: 'z, u, i, o, p und ü sauber treffen.',
    keys: 'zuiopü',
    fast: 140,
    make: () => pickMix(['jz', 'ju', 'ki', 'lo', 'öp', 'öü', 'zug', 'auf', 'pilz', 'pult', 'opa', 'polo', 'stuhl', 'kugel', 'über', 'tür', 'glück', 'hupe', 'tipp', 'puzzle', 'zitrone', 'auto', 'zoo', 'pilot', 'trupp'], 36),
  },
  {
    id: 'unten',
    title: 'Untere Reihe',
    goal: 'y, x, c, v, b, n, m und Komma, Punkt, Bindestrich.',
    keys: 'yxcvbnm,.-',
    fast: 130,
    make: () => pickMix(['fv', 'fb', 'jn', 'jm', 'dc', 'sx', 'ay', 'k,', 'l.', 'ö-', 'name', 'brav', 'nebel', 'boxen', 'mix', 'baum', 'nach', 'bach', 'mantel', 'vase', 'nebenbei', 'mama,', 'neben.', 'x-mal', 'yacht'], 36),
  },
  {
    id: 'alle-buchstaben',
    title: 'Alle Buchstaben',
    goal: 'Gemischte Wörter in Kleinschreibung, ohne Pausen zwischen den Reihen.',
    keys: '',
    fast: 160,
    make: () => pickMix(['zwölf', 'quer', 'box', 'kampf', 'jagen', 'viktor', 'sylt', 'deich', 'fahrrad', 'wolke', 'mixer', 'pizza', 'joghurt', 'quelle', 'bücher', 'schnell', 'flugzeug', 'kompass', 'yoga', 'vogel', 'jacke', 'zucker', 'wurzel', 'paket', 'nebel'], 36),
  },
  {
    id: 'grossschreibung',
    title: 'Großschreibung',
    goal: 'Umschalttaste immer mit dem kleinen Finger der anderen Hand.',
    keys: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    fast: 150,
    make: () => pickMix(['Haus', 'Auto', 'Baum', 'Fenster', 'Tisch', 'Schule', 'Lehrer', 'Klasse', 'Garten', 'Wasser', 'Zimmer', 'Jacke', 'Kuchen', 'Licht', 'Musik', 'Nebel', 'Ostern', 'Pause', 'Quelle', 'Regen', 'Sommer', 'Urlaub', 'Vogel', 'Winter', 'Yacht'], 34),
  },
  {
    id: 'umlaute',
    title: 'Umlaute und ß',
    goal: 'ä, ö, ü, ß und die großen Umlaute mit dem rechten kleinen Finger.',
    keys: 'äöüßÄÖÜ',
    fast: 150,
    make: () => pickMix(['Mädchen', 'Bäcker', 'Käse', 'Öfen', 'Öl', 'Löffel', 'Übung', 'Tür', 'Glück', 'Straße', 'Fuß', 'Größe', 'grüßen', 'süß', 'weiß', 'Äpfel', 'Ärger', 'Übermut', 'schön', 'müde', 'fröhlich', 'Gemüse', 'Küche', 'Brötchen', 'äußerst'], 34),
  },
  {
    id: 'satzzeichen',
    title: 'Satzzeichen',
    goal: 'Komma, Punkt, Doppelpunkt, Fragezeichen, Ausrufezeichen und Anführungszeichen.',
    keys: ',.:;?!"-',
    fast: 140,
    make: () =>
      shuffle([
        'Wer kommt mit?',
        'Ja, gern!',
        'Achtung: frisch gestrichen.',
        'Er sagte: "Morgen."',
        'Nein, danke.',
        'Wie spät ist es?',
        'Super, das klappt!',
        'Erstens, zweitens, drittens.',
        'Hallo; bis bald.',
        'Ein- und Ausgang.',
        'Warum nicht?',
        'Sie rief: "Los!"',
      ]).join(' '),
  },
  {
    id: 'zahlen',
    title: 'Zahlenreihe',
    goal: 'Die Ziffern 1 bis 0 aus der Grundreihe heraus greifen.',
    keys: '1234567890',
    fast: 120,
    make: () => pickMix(['12', '34', '56', '78', '90', '19', '28', '37', '46', '50', '2026', '1989', '365', '24', '7', '100', '480', '13', '64', '1000'], 34),
  },
  {
    id: 'zahlen-im-text',
    title: 'Zahlen im Text',
    goal: 'Datum, Uhrzeit, Preise und Mengen flüssig in Sätzen.',
    keys: '1234567890.,:',
    fast: 140,
    make: () =>
      shuffle([
        'Treffpunkt 7:45 Uhr.',
        'Am 14.10.2026 ist Wandertag.',
        'Es kostet 12,50 Euro.',
        'Wir brauchen 3 kg Mehl.',
        'Raum 204 im 2. Stock.',
        'Die Strecke ist 63 km lang.',
        'Bus 18 fährt um 8:10 Uhr.',
        'Sie wurde 1999 geboren.',
        'Bitte 250 ml Milch.',
        'Seite 87, Aufgabe 4.',
      ]).join(' '),
  },
  {
    id: 'sonderzeichen',
    title: 'Sonderzeichen',
    goal: '§, $, %, &, /, (, ), =, +, * und # mit der Umschalttaste.',
    keys: '§$%&/()=+*#',
    fast: 110,
    make: () =>
      shuffle([
        '50 % Rabatt',
        'Müller & Söhne',
        '§ 3 Abs. 2',
        '(siehe unten)',
        '3 + 4 = 7',
        '2 * 6 = 12',
        'und/oder',
        '#Klassenfahrt',
        'Preis: 20 $',
        '(a + b) * c',
        'Tag/Nacht',
        '100 % sicher',
      ]).join(' '),
  },
  {
    id: 'altgr',
    title: 'Zeichen mit Alt Gr',
    goal: '@, €, {, }, [, ], \\ und ~ mit der rechten Alt-Gr-Taste.',
    keys: '@€{}[]\\~|',
    fast: 100,
    make: () =>
      shuffle(['info@schule.de', '15 €', '[Hinweis]', '{a, b}', 'name@post.de', '2,50 €', '[1] [2] [3]', 'C:\\Daten', '~ ca. 20', 'ja | nein', 'klasse@ninja.de', '99 €']).join(' '),
  },
  {
    id: 'buchstabenfolgen',
    title: 'Häufige Buchstabenfolgen',
    goal: 'sch, ch, ck, tz, ei, ie, en und er als flüssige Griffe.',
    keys: '',
    fast: 170,
    make: () => pickMix(['Schule', 'schnell', 'Tisch', 'machen', 'Bach', 'Licht', 'Brücke', 'Glück', 'Katze', 'Platz', 'Schatz', 'Stein', 'mein', 'Liebe', 'Brief', 'spielen', 'gehen', 'lernen', 'Lehrer', 'immer', 'schreiben', 'sicher', 'leicht', 'Zeichen', 'Fischer'], 34),
  },
  {
    id: 'saetze',
    title: 'Kurze Sätze',
    goal: 'Ganze Sätze mit Groß- und Kleinschreibung und Satzzeichen.',
    keys: '',
    fast: 170,
    make: () =>
      shuffle([
        'Heute regnet es den ganzen Tag.',
        'Der Hund schläft unter dem Tisch.',
        'Wir fahren morgen nach Würzburg.',
        'Kannst du mir bitte helfen?',
        'Die Pause dauert zwanzig Minuten.',
        'Im Sommer gehen wir oft schwimmen.',
        'Das Fenster ist offen, mach es zu!',
        'Jeder Finger hat seine eigene Taste.',
      ]).join(' '),
  },
  {
    id: 'fliesstext',
    title: 'Fließtext',
    goal: 'Ein längerer Text ohne Hinsehen, ruhig und gleichmäßig.',
    keys: '',
    fast: 180,
    make: () =>
      'Wer gleichmäßig schreibt, ist am Ende schneller als jemand, der hastig beginnt und dann ins Stocken gerät. Ein ruhiger Takt hilft, die Finger locker zu halten. Fehler entstehen meist dann, wenn man zu viel auf einmal will. Atme ruhig, halte den Blick auf dem Text und vertraue deinen Fingern.',
  },
  {
    id: 'abschluss',
    title: 'Abschlussprüfung',
    goal: 'Alles zusammen: Buchstaben, Umlaute, Zahlen und Zeichen.',
    keys: '',
    fast: 190,
    make: () =>
      'Am Freitag, dem 24. Mai, beginnt um 9:30 Uhr die Projektwoche. Jede Gruppe bekommt 15 € Budget (bitte Quittungen sammeln!). Fragen beantwortet Frau Öztürk unter projekt@schule-beispiel.de. Zwölf Boxkämpfer jagen Viktor quer über den großen Sylter Deich.',
  },
];

export const LESSON_IDS = LESSONS.map((l) => l.id);

export function lessonById(id) {
  return LESSONS.find((l) => l.id === id) || null;
}
