// PLN (Praktischer Leistungsnachweis): 10-Minuten-Abschrift von einer Papiervorlage.
// Auswertung nach den Regeln für das Zehn-Finger-Tastschreiben:
// - Fehler werden je Wort gezählt: Zwei Tippfehler in einem Wort sind ein Fehler, markiert werden alle.
// - In der letzten Sinneinheit (dem zuletzt geschriebenen Wort) wird kein Fehler gewertet.
// - Returntaste: entweder erster Return ein Fehler und jeder weitere ein Wiederholungsfehler (nicht
//   gewertet), oder jeder Return ein Fehler.
// - Korrigierte Fehler zählen nicht, gewertet wird der Endstand nach 10 Minuten.
import { normalizeChar, normalizeText, suggestGrade } from '../public/js/scoring.js';

export const PLN_TITLE = 'PLN Praktischer Leistungsnachweis 10-Minuten-Abschrift';
export const PLN_DURATION_MS = 10 * 60 * 1000;
export const PLN_GRACE_MS = 15000;
export const PLN_MAX_CHARS = 8000;
export const RETURN_RULES = {
  first: 'Erster Return ein Fehler, jeder weitere ein Wiederholungsfehler',
  each: 'Jede Nutzung der Returntaste ist ein Fehler',
};
export const FORMATS = {
  lines: 'Mit Zeilen- und Anschlagsangaben',
  plain: 'Normaler Fließtext ohne Zeilen- und Anschlagsangaben',
};

// Wie viele Anschläge in 10 Minuten fehlerfrei für die Note 1 nötig sind.
export function note1Chars(scheme) {
  const th = Array.isArray(scheme.thresholds) ? scheme.thresholds : JSON.parse(scheme.thresholds);
  return th[0] * 10;
}

// Vorlagetext aus dem gewählten Text und, falls nötig, weiteren Texten zusammenstellen,
// damit niemand vor Ablauf der 10 Minuten fertig ist.
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

// Position (Zeichenindex) hinter dem Wort, in dem die Note-1-Grenze liegt.
export function note1Position(text, chars) {
  if (chars >= text.length) return text.length;
  const space = text.indexOf(' ', Math.max(0, chars - 1));
  return space === -1 ? text.length : space;
}

// Zeilen für die Druckvorlage mit Zeilen- und Anschlagsangaben.
export function templateLines(text, width = 62) {
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
  return lines.map((line, i) => {
    const start = total;
    total += line.length + (i < lines.length - 1 ? 1 : 0); // Leerzeichen am Zeilenende zählt mit
    return { no: i + 1, text: line, start, end: total };
  });
}

// ---------- Auswertung ----------

export function evaluatePln(source, raw, returnRule = 'first') {
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
  let w = -1;
  for (let j = 0; j < t.length; j++) {
    if (t[j] !== ' ' && (j === 0 || t[j - 1] === ' ')) {
      w++;
      words.push('');
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

  const counted = new Set();
  const marks = []; // { at: Index im Rohtext, kind: 'wrong'|'missing'|'return', counted, missing? }
  const slots = new Map();
  for (const op of ops) {
    if (op.type === 'match') continue;
    let isCounted = false;
    let reason = '';
    if (op.slot === lastSlot) reason = 'letzte Sinneinheit';
    else if (counted.has(op.slot)) reason = 'weiterer Fehler im selben Wort';
    else {
      isCounted = true;
      counted.add(op.slot);
    }
    const s = slots.get(op.slot) || { slot: op.slot, counted: false, reason: '' };
    if (isCounted) s.counted = true;
    else if (!s.counted && !s.reason) s.reason = reason;
    slots.set(op.slot, s);
    if (op.type === 'del') {
      // Fehlende Zeichen vor dem nächsten geschriebenen Zeichen markieren.
      const nextRaw = nextRawIndex(op.i, yRaw, rawChars.length);
      marks.push({ at: nextRaw, kind: 'missing', counted: isCounted, missing: t[op.j] });
    } else {
      const at = yRaw[op.i];
      marks.push({ at: at === -1 ? nearestReturn(op.i, yRaw, returnsAt) : at, kind: 'wrong', counted: isCounted });
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
    const isCounted = returnRule === 'each' || n === 0;
    if (isCounted) returnErrors++;
    merged.push({ at, kind: 'return', counted: isCounted, reason: isCounted ? '' : 'Wiederholungsfehler' });
  });

  // Fehlerliste je Wort: Vorlage und Geschriebenes.
  const typedBySlot = new Map();
  for (const op of ops) {
    if (op.type === 'del' || !slots.has(op.slot)) continue;
    typedBySlot.set(op.slot, (typedBySlot.get(op.slot) || '') + y[op.i]);
  }
  const errorList = [...slots.values()]
    .sort((a, b) => a.slot - b.slot)
    .map((s) => ({
      expected: words[s.slot] ?? '',
      typed: (typedBySlot.get(s.slot) || '').trim(),
      counted: s.counted,
      reason: s.counted ? '' : s.reason,
    }));

  const wordErrors = counted.size;
  return {
    gross: y.length,
    wordErrors,
    returnErrors,
    returns: returnsAt.length,
    errors: wordErrors + returnErrors,
    marks: merged.sort((a, b) => a.at - b.at || (a.kind === 'missing' ? -1 : 1)),
    errorList,
    typedWords: words.length ? Math.min(words.length, lastSlot + 1) : 0,
  };
}

export function gradePln(scheme, ev) {
  if (!scheme) return null;
  return suggestGrade(scheme, { correct: ev.gross, errors: ev.errors, durationMs: PLN_DURATION_MS });
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
