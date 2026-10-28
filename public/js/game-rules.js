// Spiele und ihre Freischaltung, gemeinsam für Server und Oberfläche.
// Spiele sind freiwillig und zählen weder für Noten noch als Übungsergebnis. Sie werden je Klasse frei,
// sobald die Grundkompetenz da ist: Standard ist die Lektion „Umlaute und ß“ samt allen Lektionen davor,
// also alle Buchstaben, Großschreibung und Umlaute blind und mit höchstens der Fehlergrenze der Klasse.
import { LESSONS } from './course.js';

export const GAMES = [
  { id: 'regen', title: 'Fallende Wörter', desc: 'Wörter fallen herab. Tipp sie, bevor sie unten aufschlagen.' },
  { id: 'snake', title: 'Tipp-Snake', desc: 'Lenk die Schlange, indem du das Wort an der Richtung tippst.' },
  { id: 'lauf', title: 'Ninja-Lauf', desc: 'Jedes fertig getippte Wort ist ein Sprung über ein Hindernis.' },
];

export const GAMES_AFTER_DEFAULT = 'umlaute';
export const GAMES_OFF = 'off';
export const GAMES_ALWAYS = 'always';

export const gameById = (id) => GAMES.find((g) => g.id === id);

export function validGamesAfter(v) {
  return v === GAMES_OFF || v === GAMES_ALWAYS || LESSONS.some((l) => l.id === v);
}

// passed: Menge der bestandenen Lektions-IDs. Liefert, ob die Spiele an sind, ob sie frei sind
// und welche Lektionen dafür noch fehlen.
export function gamesAccess(gamesAfter, passed) {
  if (gamesAfter === GAMES_OFF) return { enabled: false, unlocked: false, missing: [], until: null };
  const idx = LESSONS.findIndex((l) => l.id === gamesAfter);
  if (gamesAfter === GAMES_ALWAYS || idx < 0) return { enabled: true, unlocked: true, missing: [], until: null };
  const missing = LESSONS.slice(0, idx + 1).filter((l) => !passed.has(l.id));
  return { enabled: true, unlocked: !missing.length, missing: missing.map((l) => ({ id: l.id, title: l.title })), until: { id: LESSONS[idx].id, title: LESSONS[idx].title, number: idx + 1 } };
}
