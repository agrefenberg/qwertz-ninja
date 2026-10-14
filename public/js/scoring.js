// Gemeinsame Auswertungslogik für Browser und Server.

// Zeichen, die Autokorrektur oder Tablet-Tastaturen gern ersetzen, auf Tastaturzeichen abbilden.
const NORMALIZE = { '„': '"', '“': '"', '”': '"', '‚': "'", '‘': "'", '’': "'", ' ': ' ', '–': '-' };

export function normalizeChar(ch) {
  return NORMALIZE[ch] ?? ch;
}

export function normalizeText(text) {
  return Array.from(text.replace(/\s+/g, ' ').trim(), normalizeChar).join('');
}

// Vergleicht den getippten Endstand mit dem Vorlagetext. Korrigierte Fehler stehen nicht mehr
// im Endstand und zählen deshalb nicht. Fehler werden als Editierdistanz gezählt: Ein ausgelassener
// oder doppelter Buchstabe ist ein Fehler und verschiebt nicht den ganzen Rest.
export function compareTyped(target, typed, band = 30) {
  const t = Array.from(target);
  const y = Array.from(typed);
  const n = y.length;
  const errors = n ? editDistanceToPrefix(t, y, band) : 0;
  return { gross: n, correct: Math.max(0, n - errors), errors };
}

// Kleinste Editierdistanz zwischen y und einem Anfangsstück von t (Diagonalband ±band).
function editDistanceToPrefix(t, y, band) {
  const n = y.length;
  const W = 2 * band + 1;
  const INF = 1e9;
  let prev = new Array(W).fill(INF); // prev[k] = D[i-1][j], j = i-1 - band + k
  for (let k = 0; k < W; k++) {
    const j = k - band;
    if (j >= 0 && j <= t.length) prev[k] = j;
  }
  for (let i = 1; i <= n; i++) {
    const cur = new Array(W).fill(INF);
    for (let k = 0; k < W; k++) {
      const j = i - band + k;
      if (j < 0 || j > t.length) continue;
      // D[i-1][j-1] liegt in prev bei k, D[i-1][j] bei k+1, D[i][j-1] in cur bei k-1
      let best = (k + 1 < W ? prev[k + 1] : INF) + 1;
      if (j > 0) best = Math.min(best, prev[k] + (y[i - 1] === t[j - 1] ? 0 : 1));
      if (k > 0) best = Math.min(best, cur[k - 1] + 1);
      if (j === 0) best = Math.min(best, i);
      cur[k] = best;
    }
    prev = cur;
  }
  return Math.min(...prev);
}

// Anschläge pro Minute (netto) zählen nur richtige Anschläge. WPM rechnet fünf Anschläge als ein Wort.
export function metrics({ gross, correct, errors, durationMs }) {
  const minutes = Math.max(durationMs, 1000) / 60000;
  return {
    apm: round1(correct / minutes),
    wpm: round1(correct / 5 / minutes),
    errorRate: gross ? round2((errors / gross) * 100) : 0,
  };
}

// Notenschlüssel: thresholds[i] ist die Mindestzahl an Netto-Anschlägen pro Minute für Note i+1
// (Noten 1 bis 5, darunter 6). Optional zieht jeder Fehler error_penalty Anschläge ab.
export function suggestGrade(scheme, { correct, errors, durationMs }) {
  if (!scheme) return null;
  const minutes = Math.max(durationMs, 1000) / 60000;
  const net = Math.max(0, correct - errors * (scheme.error_penalty || 0)) / minutes;
  const thresholds = Array.isArray(scheme.thresholds) ? scheme.thresholds : JSON.parse(scheme.thresholds);
  for (let i = 0; i < thresholds.length; i++) if (net >= thresholds[i]) return { grade: i + 1, netApm: round1(net) };
  return { grade: 6, netApm: round1(net) };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
