// PLN (Praktischer Leistungsnachweis): 10-Minuten-Abschrift von einer Papiervorlage.
// Auswertung nach den Regeln für das Zehn-Finger-Tastschreiben:
// - Fehler werden je Wort gezählt: Zwei Tippfehler in einem Wort sind ein Fehler, markiert werden alle.
// - In der letzten Sinneinheit (dem zuletzt geschriebenen Wort) wird kein Fehler gewertet.
// - Returntaste: entweder erster Return ein Fehler und jeder weitere ein Wiederholungsfehler (nicht
//   gewertet), oder jeder Return ein Fehler.
// - Korrigierte Fehler zählen nicht, gewertet wird der Endstand nach Ablauf der Zeit.
// Welche Regeln gelten und wie daraus die Note wird, ist je PLN einstellbar (public/js/pln-rules.js).
import { normalizeChar, normalizeText, suggestGrade } from '../public/js/scoring.js';
import { FORMATS, RETURN_RULES, gradeWithSettings, linesFor, normalizeSettings, plnHeading, strokes } from '../public/js/pln-rules.js';

export { FORMATS, RETURN_RULES, plnHeading };
export const PLN_TITLE = plnHeading({ durationMin: 10 });
export const PLN_DURATION_MS = 10 * 60 * 1000;
export const PLN_GRACE_MS = 15000;
export const PLN_LATE_MS = 30 * 60 * 1000;
export const PLN_MAX_CHARS = 8000;

// Einstellungen eines PLN. Ältere PLN ohne Einstellungen werden wie bisher mit dem Notenschlüssel bewertet.
export function plnSettings(p) {
  if (p.settings) return normalizeSettings(JSON.parse(p.settings));
  return normalizeSettings({
    mode: 'speed',
    durationMin: 10,
    format: p.format,
    returnRule: p.return_rule,
    capitalDouble: false,
    gradingSchemeId: p.grading_scheme_id,
  });
}

// Wie viele Anschläge in 10 Minuten fehlerfrei für die Note 1 nötig sind (Notenschlüssel nach Anschlägen/min).
export function note1Chars(scheme, minutes = 10) {
  const th = Array.isArray(scheme.thresholds) ? scheme.thresholds : JSON.parse(scheme.thresholds);
  return th[0] * minutes;
}

// Vorlagetext aus dem gewählten Text und, falls nötig, weiteren Texten zusammenstellen,
// damit niemand vor Ablauf der Zeit fertig ist.
export function composeText(startText, otherTexts, minChars) {
  const parts = [normalizeText(startText.content)];
  const used = [startText.title];
  const pool = otherTexts.filter((t) => t.id !== startText.id);
  let len = parts[0].length;
  for (let k = 0; len < minChars && pool.length; k++) {
    const t = pool[k % pool.length];
    parts.push(normalizeText(t.content));
    used.push(t.title);
    len += t.content.length + 1;
    if (k > 50) break;
  }
  return { text: parts.join(' '), sources: used };
}

// Text und Note-1-Grenze (in Anschlägen) für einen neuen PLN.
export function buildPlnText(s, startText, otherTexts, scheme) {
  if (s.mode === 'count') {
    const { text, sources } = composeText(startText, otherTexts, s.targetLines * (s.lineChars + 10) + 200);
    const lines = templateLines(text, s.lineChars).slice(0, s.targetLines);
    const cut = lines.map((l) => l.text).join(' ');
    return { text: cut, sources, note1: strokes(cut, s.capitalDouble) };
  }
  const need = s.mode === 'speed' ? note1Chars(scheme, s.durationMin) : s.requiredChars;
  const minChars = s.mode === 'speed' ? Math.ceil(need * 1.25) + 300 : need * 2 + 400;
  const { text, sources } = composeText(startText, otherTexts, minChars);
  return { text, sources, note1: need };
}

// Position (Zeichenindex) hinter dem Wort, in dem die Note-1-Grenze (in Anschlägen) liegt.
export function note1Position(text, need, capitalDouble = false) {
  let n = 0;
  let k = 0;
  while (k < text.length && n < need) {
    n += capitalDouble && isUpper(text[k]) ? 2 : 1;
    k++;
  }
  if (n < need || k >= text.length) return text.length;
  const space = text.indexOf(' ', k - 1);
  return space === -1 ? text.length : space;
}

const isUpper = (c) => c !== c.toLowerCase() && c === c.toUpperCase();

// Zeilen für die Druckvorlage mit Zeilen- und Anschlagsangaben.
// start/end sind Zeichenindizes, strokes die Anschläge bis Zeilenende.
export function templateLines(text, width = 62, capitalDouble = false) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && cur.length + 1 + w.length > width) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  let total = 0;
  let sum = 0;
  return lines.map((line, i) => {
    const start = total;
    const add = i < lines.length - 1 ? 1 : 0; // Leerzeichen am Zeilenende zählt mit
    total += line.length + add;
    sum += strokes(line, capitalDouble) + add;
    return { no: i + 1, text: line, start, end: total, strokes: sum };
  });
}

// Wertungsregeln für evaluatePln aus den PLN-Einstellungen.
export function evalRules(s, text, lrs = false) {
  return {
    returnRule: s.returnRule,
    oneErrorPerWord: s.oneErrorPerWord,
    lastWordFree: s.lastWordFree,
    repeatFree: s.repeatFree,
    capitalDouble: s.capitalDouble,
    monosyllableExempt: s.monosyllableExempt,
    lines: s.mode === 'count' ? { list: templateLines(text, s.lineChars), target: linesFor(s, lrs) } : null,
  };
}

// ---------- Auswertung ----------

// rules: Wertungsregeln (siehe public/js/pln-rules.js). Nur eine Zeichenkette = Regel für die Returntaste.
export function evaluatePln(source, raw, rules = {}) {
  if (typeof rules === 'string') rules = { returnRule: rules };
  rules = { returnRule: 'first', oneErrorPerWord: true, lastWordFree: true, repeatFree: false, capitalDouble: false, lines: null, monosyllableExempt: true, ...rules };
  const t = Array.from(normalizeText(source));
  const rawChars = Array.from(String(raw ?? '').replace(/\r\n?/g, '\n')).slice(0, PLN_MAX_CHARS);

  // Returns herausnehmen. Ersetzt ein Return das Leerzeichen, steht für den Vergleich ein Leerzeichen da.
  const y = [];
  const yRaw = [];
  const returnsAt = [];
  for (let k = 0; k < rawChars.length; k++) {
    const c = rawChars[k];
    if (c === '\n') {
      returnsAt.push(k);
      const prevSpace = y.length === 0 || y[y.length - 1] === ' ';
      const next = rawChars[k + 1];
      const nextSpace = next === undefined || next === ' ' || next === '\n';
      if (!prevSpace && !nextSpace) {
        y.push(' ');
        yRaw.push(-1);
      }
      continue;
    }
    y.push(normalizeChar(c));
    yRaw.push(k);
  }

  const ops = align(t, y);

  // Wortnummer je Zeichen der Vorlage; ein Leerzeichen gehört zum Wort davor.
  const wIdx = new Int32Array(t.length + 1);
  const words = [];
  const wordStart = [];
  let w = -1;
  for (let j = 0; j < t.length; j++) {
    if (t[j] !== ' ' && (j === 0 || t[j - 1] === ' ')) {
      w++;
      words.push('');
      wordStart.push(j);
    }
    wIdx[j] = Math.max(w, 0);
    if (t[j] !== ' ' && w >= 0) words[w] += t[j];
  }
  wIdx[t.length] = Math.max(w, 0);

  const slotOf = (op) => {
    if (op.type === 'ins') {
      const j = op.j;
      if (t[j] !== undefined && t[j] !== ' ' && y[op.i] !== ' ') return wIdx[j];
      return wIdx[Math.max(j - 1, 0)];
    }
    return wIdx[op.j];
  };
  for (const op of ops) op.slot = slotOf(op);
  // Fehlt ein ganzes Wort samt Leerzeichen (oder ist eines zu viel), zählt das Leerzeichen zu diesem Wort.
  for (let a = 0; a < ops.length; ) {
    let b = a;
    while (b < ops.length && ops[b].type === ops[a].type && ops[a].type !== 'match' && ops[a].type !== 'sub') b++;
    if (b > a + 1) {
      const run = ops.slice(a, b);
      const ch = (op) => (op.type === 'del' ? t[op.j] : y[op.i]);
      const word = run.find((op) => ch(op) !== ' ');
      if (word) for (const op of run) if (ch(op) === ' ') op.slot = word.slot;
    }
    a = Math.max(b, a + 1);
  }

  // Letzte Sinneinheit: das Wort, in dem das zuletzt geschriebene Zeichen steht.
  let lastSlot = -1;
  for (let k = ops.length - 1; k >= 0; k--) {
    const op = ops[k];
    if (op.type !== 'del' && y[op.i] !== ' ') {
      lastSlot = op.slot;
      break;
    }
  }

  // Wie weit die Vorlage abgeschrieben wurde (Zeichenindex hinter dem letzten erreichten Zeichen).
  let reached = 0;
  for (const op of ops) if (op.type !== 'ins') reached = Math.max(reached, op.j + 1);

  // Feste Zeilen (6. Klasse): Fehler in der angefangenen oder fehlenden Zeile werden nicht gewertet,
  // jede fehlende Zeile kostet eine Notenstufe.
  let cutoff = Infinity;
  let missingLines = 0;
  let missingExempt = false;
  if (rules.lines) {
    const { list, target } = rules.lines;
    let completed = 0;
    while (completed < Math.min(target, list.length) && list[completed].start + list[completed].text.length <= reached) completed++;
    missingLines = target - completed;
    if (list[completed]) cutoff = list[completed].start;
    if (missingLines === 1 && rules.monosyllableExempt && completed < list.length) {
      const rest = t.slice(reached, list[completed].start + list[completed].text.length).join('').trim();
      if (rest && !rest.includes(' ') && syllables(rest) <= 1) {
        missingLines = 0;
        missingExempt = true;
      }
    }
  }

  const typedBySlot = new Map();
  for (const op of ops) if (op.type !== 'del') typedBySlot.set(op.slot, (typedBySlot.get(op.slot) || '') + y[op.i]);
  const slotOps = new Map();
  for (const op of ops) {
    if (op.type === 'match') continue;
    if (!slotOps.has(op.slot)) slotOps.set(op.slot, []);
    slotOps.get(op.slot).push(op);
  }
  const seen = new Set();
  const slots = new Map();
  let wordErrors = 0;
  for (const slot of [...slotOps.keys()].sort((a, b) => a - b)) {
    const key = `${words[slot] ?? ''}|${(typedBySlot.get(slot) || '').trim()}`;
    let reason = '';
    if (slot === lastSlot && rules.lastWordFree) reason = 'letzte Sinneinheit';
    else if ((wordStart[slot] ?? Infinity) >= cutoff) reason = 'angefangene oder fehlende Zeile';
    else if (rules.repeatFree && seen.has(key)) reason = 'Wiederholungsfehler';
    seen.add(key);
    const counted = !reason;
    const n = counted ? (rules.oneErrorPerWord ? 1 : slotOps.get(slot).length) : 0;
    wordErrors += n;
    slots.set(slot, { slot, counted, reason, n });
    slotOps.get(slot).forEach((op, k) => (op.counted = counted && (k === 0 || !rules.oneErrorPerWord)));
  }

  const marks = []; // { at: Index im Rohtext, kind: 'wrong'|'missing'|'return', counted, missing? }
  for (const op of ops) {
    if (op.type === 'match') continue;
    if (op.type === 'del') {
      // Fehlende Zeichen vor dem nächsten geschriebenen Zeichen markieren.
      const nextRaw = nextRawIndex(op.i, yRaw, rawChars.length);
      marks.push({ at: nextRaw, kind: 'missing', counted: op.counted, missing: t[op.j] });
    } else {
      const at = yRaw[op.i];
      marks.push({ at: at === -1 ? nearestReturn(op.i, yRaw, returnsAt) : at, kind: 'wrong', counted: op.counted });
    }
  }
  // Fehlende Zeichen hintereinander zu einer Markierung zusammenfassen.
  const merged = [];
  for (const m of marks) {
    const prev = merged[merged.length - 1];
    if (m.kind === 'missing' && prev && prev.kind === 'missing' && prev.at === m.at) {
      prev.missing += m.missing;
      prev.counted = prev.counted || m.counted;
    } else merged.push({ ...m });
  }

  let returnErrors = 0;
  returnsAt.forEach((at, n) => {
    const isCounted = rules.returnRule === 'each' || n === 0;
    if (isCounted) returnErrors++;
    merged.push({ at, kind: 'return', counted: isCounted, reason: isCounted ? '' : 'Wiederholungsfehler' });
  });

  // Fehlerliste je Wort: Vorlage und Geschriebenes.
  const errorList = [...slots.values()].map((s) => ({
    expected: words[s.slot] ?? '',
    typed: (typedBySlot.get(s.slot) || '').trim(),
    counted: s.counted,
    count: s.n,
    reason: s.reason,
  }));

  return {
    gross: y.length,
    strokes: strokes(y.join(''), rules.capitalDouble),
    wordErrors,
    returnErrors,
    returns: returnsAt.length,
    errors: wordErrors + returnErrors,
    reached,
    missingLines,
    missingExempt,
    marks: merged.sort((a, b) => a.at - b.at || (a.kind === 'missing' ? -1 : 1)),
    errorList,
    typedWords: words.length ? Math.min(words.length, lastSlot + 1) : 0,
  };
}

// Silben grob über Vokalgruppen zählen (für die Ausnahme „einsilbiges Wort“).
export function syllables(word) {
  return (word.toLowerCase().match(/[aeiouyäöü]+/g) || []).length;
}

// Notenvorschlag. scheme nur für die Bewertungsart „Notenschlüssel“.
export function gradePln(s, ev, { scheme = null, lrs = false, noTouch = false, durationMs = PLN_DURATION_MS } = {}) {
  if (s.mode !== 'speed') return gradeWithSettings(s, ev, { lrs, noTouch });
  if (noTouch) return { grade: 6, steps: ['Zehn-Finger-System nicht angewendet: Note 6'] };
  if (!scheme) return null;
  const g = suggestGrade(scheme, { correct: ev.strokes, errors: ev.errors, durationMs });
  return { ...g, steps: [`${g.netApm} Anschläge pro Minute nach Notenschlüssel „${scheme.name}“: Note ${g.grade}`] };
}

function nextRawIndex(i, yRaw, rawLen) {
  for (let k = i; k < yRaw.length; k++) if (yRaw[k] !== -1) return yRaw[k];
  return rawLen;
}

function nearestReturn(i, yRaw, returnsAt) {
  const before = i > 0 ? yRaw[i - 1] : 0;
  return returnsAt.find((r) => r > before) ?? before;
}

// Editierdistanz zwischen y und einem Anfangsstück von t, mit Rückverfolgung der Schritte.
function align(t, y) {
  const n = y.length;
  if (!n) return [];
  const m = Math.min(t.length, n + 600);
  const W = m + 1;
  const bt = new Uint8Array((n + 1) * W); // 0 match, 1 sub, 2 ins (Zeichen zu viel), 3 del (Zeichen fehlt)
  let prev = new Uint32Array(W);
  let cur = new Uint32Array(W);
  for (let j = 0; j <= m; j++) {
    prev[j] = j;
    bt[j] = 3;
  }
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    bt[i * W] = 2;
    const yc = y[i - 1];
    for (let j = 1; j <= m; j++) {
      const same = yc === t[j - 1];
      let best = prev[j - 1] + (same ? 0 : 1);
      let op = same ? 0 : 1;
      const ins = prev[j] + 1;
      if (ins < best) {
        best = ins;
        op = 2;
      }
      const del = cur[j - 1] + 1;
      if (del < best) {
        best = del;
        op = 3;
      }
      cur[j] = best;
      bt[i * W + j] = op;
    }
    [prev, cur] = [cur, prev];
  }
  let endJ = 0;
  for (let j = 1; j <= m; j++) if (prev[j] < prev[endJ]) endJ = j;
  const ops = [];
  let i = n;
  let j = endJ;
  while (i > 0 || j > 0) {
    const op = bt[i * W + j];
    if (i > 0 && j > 0 && op <= 1) {
      ops.push({ type: op === 0 ? 'match' : 'sub', i: i - 1, j: j - 1 });
      i--;
      j--;
    } else if (i > 0 && (op === 2 || j === 0)) {
      ops.push({ type: 'ins', i: i - 1, j });
      i--;
    } else {
      ops.push({ type: 'del', i, j: j - 1 });
      j--;
    }
  }
  return ops.reverse();
}
