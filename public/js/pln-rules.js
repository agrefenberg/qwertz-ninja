// Bewertungsregeln für den PLN (10-Minuten-Abschrift), gemeinsam für Browser und Server.
// Grundlage: PLN-Richtlinien 6. Klasse, Hinweise zur Bewertung einer 10-Minuten-Abschrift (7.–9. Jgst.)
// und Merkblatt Leistungsnachweise IT. Jeder Wert ist je PLN einstellbar, die Vorgaben entsprechen den Richtlinien.

// Bewertungsarten:
// - percent: Fehlerprozente (Fehler × 100 : Anschläge) mit geforderter Anschlagszahl, Abstufung bei
//   Unterschreitung und Bonus bei Überschreitung (7.–9. Jahrgangsstufe, 4. PLN der 6. Klasse).
// - count:   Fehlerzahl beim Abschreiben einer festen Zahl von Zeilen, je fehlender Zeile eine Note schlechter
//   (1. bis 3. PLN der 6. Klasse).
// - speed:   Notenschlüssel nach Anschlägen pro Minute (bisheriges Verfahren).
export const MODES = {
  percent: 'Fehlerprozente mit geforderter Anschlagszahl (7.–9. Klasse)',
  count: 'Fehlerzahl beim Abschreiben fester Zeilen (6. Klasse)',
  speed: 'Notenschlüssel nach Anschlägen pro Minute',
};

export const RETURN_RULES = {
  first: 'Erster Return ein Fehler, jeder weitere ein Wiederholungsfehler',
  each: 'Jede Nutzung der Returntaste ist ein Fehler',
};

export const FORMATS = {
  lines: 'Mit Zeilen- und Anschlagsangaben',
  plain: 'Normaler Fließtext ohne Zeilen- und Anschlagsangaben',
};

export const DEFAULTS = {
  mode: 'percent',
  durationMin: 10,
  format: 'lines',
  returnRule: 'each',
  capitalDouble: true, // Großbuchstabe zählt 2 Anschläge
  oneErrorPerWord: true, // mehrere Tippfehler in einem Wort = ein Fehler
  lastWordFree: true, // letzte Sinneinheit ohne Wertung
  repeatFree: false, // gleich falsch geschriebenes Wort nur einmal werten (Wiederholungsfehler)
  lineChars: 63, // Zeichen je Zeile auf der Vorlage
  weight: 0.5, // Gewichtung (nur zur Information)
  // percent
  requiredChars: 1000,
  percentBands: [0.1, 0.2, 0.3, 0.4, 0.5], // höchste Fehlerprozente für Note 1 bis 5, darüber Note 6
  shortfallSteps: [50, 100, 150, 200], // bis zu so vielen Anschlägen zu wenig: 1, 2, 3, 4 Stufen schlechter, darüber Note 6
  bonus: true,
  bonusStart: 400, // ab so vielen Anschlägen über dem Soll wird 1 Fehler nicht gewertet
  bonusStep: 200, // je weitere so viele Anschläge 1 Fehler mehr
  lrsTimePct: 25, // Nachteilsausgleich: Zeitverlängerung
  // count
  targetLines: 10,
  countBands: [1, 3, 5, 7, 9], // höchste Fehlerzahl für Note 1 bis 5, darüber Note 6
  missingLinePenalty: 1, // Notenstufen je fehlender (auch angefangener) Zeile
  monosyllableExempt: true, // fehlt nur ein einsilbiges Wort, keine Abstufung
  lrsLinesPct: 0, // Nachteilsausgleich: weniger Zeilen
  // speed
  gradingSchemeId: null,
};

const COUNT = { mode: 'count', durationMin: 12, lrsTimePct: 0, lrsLinesPct: 20, format: 'lines' };
export const PRESETS = [
  { id: '6-1', label: '6. Klasse, 1. PLN: 10 Zeilen in 12 Minuten', settings: { ...COUNT, targetLines: 10, returnRule: 'first' } },
  { id: '6-2', label: '6. Klasse, 2. PLN: 11 Zeilen in 12 Minuten', settings: { ...COUNT, targetLines: 11 } },
  { id: '6-3', label: '6. Klasse, 3. PLN: 12 Zeilen in 12 Minuten', settings: { ...COUNT, targetLines: 12 } },
  { id: '6-4', label: '6. Klasse, 4. PLN: 800 Anschläge in 10 Minuten', settings: { requiredChars: 800 } },
  { id: '7-1', label: '7. Klasse, 1. PLN: 900 Anschläge in 10 Minuten', settings: { requiredChars: 900 } },
  { id: '7-2', label: '7. Klasse, 2. PLN: 1000 Anschläge, normaler Fließtext', settings: { requiredChars: 1000, format: 'plain' } },
  { id: '8-1', label: '8. Klasse, 1. PLN: 1100 Anschläge in 10 Minuten', settings: { requiredChars: 1100, format: 'plain' } },
  { id: '8-2', label: '8. Klasse, 2. PLN: 1200 Anschläge in 10 Minuten', settings: { requiredChars: 1200, format: 'plain' } },
  { id: '9', label: '9./10. Klasse: 1200 Anschläge in 10 Minuten', settings: { requiredChars: 1200, format: 'plain' } },
];

export function presetSettings(id) {
  const p = PRESETS.find((x) => x.id === id);
  return { ...DEFAULTS, ...(p?.settings || {}) };
}

// Eingaben prüfen und auf sinnvolle Grenzen bringen. Fehlende Werte kommen aus den Vorgaben.
export function normalizeSettings(input = {}) {
  const s = { ...DEFAULTS };
  const num = (v, min, max, fb, digits = 0) => {
    const n = Number(typeof v === 'string' ? v.replace(',', '.') : v);
    if (v === '' || v == null || !Number.isFinite(n)) return fb;
    const f = 10 ** digits;
    return Math.min(max, Math.max(min, Math.round(n * f) / f));
  };
  const bool = (v, fb) => (v === undefined ? fb : v === true || v === 'true' || v === 'on' || v === 1 || v === '1');
  const list = (v, len, min, max, fb, digits) => {
    const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[;\s]+/).filter(Boolean) : null;
    if (!arr || arr.length !== len) return fb;
    const out = arr.map((x) => num(x, min, max, NaN, digits));
    if (out.some((x) => !Number.isFinite(x))) return fb;
    for (let i = 1; i < out.length; i++) if (out[i] < out[i - 1]) return fb;
    return out;
  };
  s.mode = MODES[input.mode] ? input.mode : DEFAULTS.mode;
  s.durationMin = num(input.durationMin, 1, 60, DEFAULTS.durationMin);
  s.format = s.mode === 'count' ? 'lines' : FORMATS[input.format] ? input.format : DEFAULTS.format;
  s.returnRule = RETURN_RULES[input.returnRule] ? input.returnRule : DEFAULTS.returnRule;
  s.capitalDouble = bool(input.capitalDouble, DEFAULTS.capitalDouble);
  s.oneErrorPerWord = bool(input.oneErrorPerWord, DEFAULTS.oneErrorPerWord);
  s.lastWordFree = bool(input.lastWordFree, DEFAULTS.lastWordFree);
  s.repeatFree = bool(input.repeatFree, DEFAULTS.repeatFree);
  s.lineChars = num(input.lineChars, 30, 90, DEFAULTS.lineChars);
  s.weight = num(input.weight, 0, 10, DEFAULTS.weight, 2);
  s.requiredChars = num(input.requiredChars, 50, 6000, DEFAULTS.requiredChars);
  s.percentBands = list(input.percentBands, 5, 0, 100, DEFAULTS.percentBands, 3);
  s.shortfallSteps = list(input.shortfallSteps, 4, 0, 6000, DEFAULTS.shortfallSteps, 0);
  s.bonus = bool(input.bonus, DEFAULTS.bonus);
  s.bonusStart = num(input.bonusStart, 1, 6000, DEFAULTS.bonusStart);
  s.bonusStep = num(input.bonusStep, 1, 6000, DEFAULTS.bonusStep);
  s.lrsTimePct = num(input.lrsTimePct, 0, 100, DEFAULTS.lrsTimePct);
  s.targetLines = num(input.targetLines, 1, 60, DEFAULTS.targetLines);
  s.countBands = list(input.countBands, 5, 0, 500, DEFAULTS.countBands, 0);
  s.missingLinePenalty = num(input.missingLinePenalty, 0, 5, DEFAULTS.missingLinePenalty);
  s.monosyllableExempt = bool(input.monosyllableExempt, DEFAULTS.monosyllableExempt);
  s.lrsLinesPct = num(input.lrsLinesPct, 0, 90, DEFAULTS.lrsLinesPct);
  s.gradingSchemeId = input.gradingSchemeId ? num(input.gradingSchemeId, 1, 1e12, null) : null;
  if (input.textId) s.textId = num(input.textId, 1, 1e12, undefined);
  if (input.preset && PRESETS.some((p) => p.id === input.preset)) s.preset = input.preset;
  return s;
}

// Anschläge eines Textes: jedes Zeichen einer, ein Großbuchstabe auf Wunsch zwei.
export function strokes(text, capitalDouble = true) {
  let n = 0;
  for (const c of text) n += capitalDouble && isCapital(c) ? 2 : 1;
  return n;
}

export function isCapital(c) {
  return c !== c.toLowerCase() && c === c.toUpperCase();
}

// Zahl der Zeilen, die eine Person mit Nachteilsausgleich schreibt (Beispiel der Richtlinie: 13 → 10, 16 → 13).
export function linesFor(s, lrs) {
  return lrs && s.lrsLinesPct ? Math.max(1, Math.round(s.targetLines * (1 - s.lrsLinesPct / 100))) : s.targetLines;
}

export function durationMsFor(s, lrs) {
  return Math.round(s.durationMin * 60000 * (lrs ? 1 + s.lrsTimePct / 100 : 1));
}

export function plnHeading(s) {
  return `PLN Praktischer Leistungsnachweis ${s?.durationMin ?? 10}-Minuten-Abschrift`;
}

// Fehler, die bei Überschreiten der geforderten Anschlagszahl nicht gewertet werden.
// Richtlinie: +400 → 1 Fehler, +600 → 2, +800 → 3 usw.
export function bonusErrors(s, gross) {
  if (!s.bonus) return 0;
  const over = gross - s.requiredChars;
  return over >= s.bonusStart ? Math.floor((over - s.bonusStart) / s.bonusStep) + 1 : 0;
}

const pct = (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (n) => n.toLocaleString('de-DE');

// Notenvorschlag aus der Auswertung (evaluatePln) nach den Einstellungen.
// Liefert { grade, steps } – steps erklärt den Weg zur Note in Worten.
export function gradeWithSettings(s, ev, { noTouch = false, lrs = false } = {}) {
  if (noTouch) return { grade: 6, steps: ['Zehn-Finger-System nicht angewendet: Note 6'] };
  if (s.mode === 'count') {
    const steps = [];
    let grade = bandGrade(s.countBands, ev.errors);
    steps.push(`${ev.errors} ${ev.errors === 1 ? 'Fehler' : 'Fehler'}: Note ${grade}`);
    const missing = ev.missingLines || 0;
    if (missing && s.missingLinePenalty) {
      const down = missing * s.missingLinePenalty;
      grade = Math.min(6, grade + down);
      steps.push(`${missing} ${missing === 1 ? 'Zeile fehlt' : 'Zeilen fehlen'} von ${linesFor(s, lrs)}: ${down} ${down === 1 ? 'Stufe' : 'Stufen'} schlechter, Note ${grade}`);
    } else if (ev.missingExempt) steps.push('Es fehlt nur ein einsilbiges Wort: keine Abstufung');
    return { grade, steps };
  }
  const gross = ev.strokes;
  if (!gross) return { grade: 6, steps: ['Nichts geschrieben: Note 6'] };
  const steps = [];
  const bonus = Math.min(bonusErrors(s, gross), ev.errors);
  const errors = ev.errors - bonus;
  if (bonus) steps.push(`Bonus: ${fmt(gross - s.requiredChars)} Anschläge über dem Soll, ${bonus} ${bonus === 1 ? 'Fehler wird' : 'Fehler werden'} nicht gewertet`);
  const percent = Math.round(((errors * 100) / gross) * 1000) / 1000;
  let grade = bandGrade(s.percentBands, percent);
  steps.push(`${errors} Fehler × 100 : ${fmt(gross)} Anschläge = ${pct(percent)} %: Note ${grade}`);
  const short = s.requiredChars - gross;
  if (short > 0) {
    const k = s.shortfallSteps.findIndex((x) => short <= x);
    const down = k === -1 ? 6 : k + 1;
    grade = Math.min(6, grade + down);
    steps.push(
      k === -1
        ? `${fmt(short)} Anschläge unter dem Soll von ${fmt(s.requiredChars)}: Note 6`
        : `${fmt(short)} Anschläge unter dem Soll von ${fmt(s.requiredChars)}: ${down} ${down === 1 ? 'Stufe' : 'Stufen'} schlechter, Note ${grade}`
    );
  }
  return { grade, steps, percent, bonus };
}

function bandGrade(bands, value) {
  for (let i = 0; i < bands.length; i++) if (value <= bands[i]) return i + 1;
  return 6;
}

// Kurzbeschreibung für Listen und Chips.
export function summary(s, schemeName = '') {
  if (s.mode === 'count') return `${s.targetLines} Zeilen in ${s.durationMin} Minuten, Fehlerzahl`;
  if (s.mode === 'speed') return `${s.durationMin} Minuten, Notenschlüssel${schemeName ? ` „${schemeName}“` : ''}`;
  return `${fmt(s.requiredChars)} Anschläge in ${s.durationMin} Minuten, Fehlerprozente`;
}
