// Seriendokument mit allen Abschriften eines PLN: je Schülerin oder Schüler eine eigene Seite
// mit unverändertem Endstand, markierten Fehlern und Fehlerliste.
import PDFDocument from 'pdfkit';
import { plnHeading, RETURN_RULES } from './pln.js';
import { summary } from '../public/js/pln-rules.js';

const RED = '#d92d2d';
const RED_BG = '#ffd6d1';
const ORANGE = '#c46a00';
const ORANGE_BG = '#ffe9c2';
const GREY = '#666666';
const MARGIN = 50;
const FS = 10.5; // Courier: jedes Zeichen 0,6 × Schriftgröße breit
const CW = FS * 0.6;
const LH = FS * 1.75;

// Standardschriften kennen nur WinAnsi. Alles andere wird sichtbar als ? ausgegeben.
const WIN_ANSI_EXTRA = new Set(Array.from('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'));
const safe = (c) => {
  const code = c.codePointAt(0);
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(c) ? c : '?';
};

const fmt = (ms, opts) => new Date(ms).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', ...opts });
const date = (ms) => fmt(ms, { day: '2-digit', month: '2-digit', year: 'numeric' });
const time = (ms) => fmt(ms, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function writePlnPdf(out, { school, className, pln, settings, scheme, entries }) {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: `${plnHeading(settings)} – ${className} – ${pln.title}`, Author: 'QWERTZ Ninja' } });
  doc.pipe(out);
  if (!entries.length) {
    header(doc, { school, className, pln, settings });
    doc.font('Helvetica').fontSize(11).fillColor('#000').text('Es liegen noch keine abgeschlossenen Abschriften vor.');
  }
  entries.forEach((e, n) => {
    if (n > 0) doc.addPage();
    studentPage(doc, { school, className, pln, settings, scheme, e });
  });
  doc.end();
}

function header(doc, { school, className, pln, settings }) {
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#000').text(plnHeading(settings));
  doc.font('Helvetica').fontSize(9.5).fillColor(GREY).text([school, `Klasse ${className}`, pln.title].filter(Boolean).join(' · '));
  doc.moveDown(0.6);
}

function studentPage(doc, { school, className, pln, settings: st, scheme, e }) {
  const { student, attempt, ev, grade } = e;
  header(doc, { school, className, pln, settings: st });
  const end = Math.min(attempt.submitted_at || Infinity, attempt.started_at + attempt.duration_ms);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(`Pseudonym: ${student.display_name}`, { continued: true });
  doc.font('Helvetica').text(`   (Benutzername ${student.username})`);
  doc.text(`Datum: ${date(attempt.started_at)}   Beginn: ${time(attempt.started_at)} Uhr   Ende: ${time(end)} Uhr`);
  if (attempt.lrs) doc.text(`Nachteilsausgleich: ${[st.lrsTimePct ? `${st.lrsTimePct} % mehr Zeit` : '', st.mode === 'count' && st.lrsLinesPct ? `${st.lrsLinesPct} % weniger Zeilen` : ''].filter(Boolean).join(', ') || 'ja'}`);
  if (attempt.left_count) doc.fillColor(RED).text(`Prüfungsfenster während des PLN ${attempt.left_count}× verlassen.`).fillColor('#000');
  doc.moveDown(0.5);

  // Ergebniszeile
  const third =
    st.mode === 'count'
      ? ['Fehlende Zeilen', String(ev.missingLines)]
      : st.mode === 'percent'
        ? ['Fehlerprozente', grade?.percent != null ? `${grade.percent.toLocaleString('de-DE', { minimumFractionDigits: 3 })} %` : '–']
        : ['davon Returntaste', String(ev.returnErrors)];
  const y0 = doc.y;
  doc.roundedRect(MARGIN, y0, doc.page.width - 2 * MARGIN, 44, 6).fill('#f2f3f6');
  doc.fillColor('#000').font('Helvetica').fontSize(9).text('Anschläge', MARGIN + 12, y0 + 8);
  doc.text('Gewertete Fehler', MARGIN + 110, y0 + 8);
  doc.text(third[0], MARGIN + 230, y0 + 8);
  if (grade) doc.text('Note (Vorschlag)', MARGIN + 350, y0 + 8);
  doc.font('Helvetica-Bold').fontSize(14);
  doc.text(String(ev.strokes), MARGIN + 12, y0 + 21);
  doc.text(String(ev.errors), MARGIN + 110, y0 + 21);
  doc.text(third[1], MARGIN + 230, y0 + 21);
  if (grade) doc.text(String(grade.grade), MARGIN + 350, y0 + 21);
  doc.y = y0 + 52;
  doc.x = MARGIN;
  const width = doc.page.width - 2 * MARGIN;
  if (grade?.steps?.length) {
    doc.font('Helvetica').fontSize(9).fillColor('#000').text(`Weg zur Note: ${grade.steps.join('; ')}.`, { width });
    doc.moveDown(0.2);
  }
  doc.font('Helvetica').fontSize(8.5).fillColor(GREY);
  const rules = [
    `${summary(st, scheme?.name)}${st.weight ? `, Gewichtung ${String(st.weight).replace('.', ',')}` : ''}`,
    `Returntaste: ${RETURN_RULES[st.returnRule] || ''}`,
    st.capitalDouble ? 'Großbuchstabe zählt 2 Anschläge' : '',
    st.oneErrorPerWord ? 'mehrere Tippfehler in einem Wort zählen als ein Fehler' : 'jeder Tippfehler zählt einzeln',
    st.lastWordFree ? 'in der letzten Sinneinheit wird kein Fehler gewertet' : '',
    st.repeatFree ? 'gleich falsch geschriebene Wörter zählen nur einmal' : '',
    st.mode === 'count' ? 'Fehler in der angefangenen oder fehlenden Zeile werden nicht gewertet' : '',
    st.mode === 'speed' && scheme?.error_penalty ? `${scheme.error_penalty} Anschläge Abzug je Fehler` : '',
  ].filter(Boolean);
  doc.text(`${rules.map((r) => r[0].toUpperCase() + r.slice(1)).join('. ')}.`, { width });
  doc.moveDown(0.8);

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Unveränderte Abschrift nach Ablauf der Zeit');
  doc.moveDown(0.3);
  snapshot(doc, attempt.typed, ev.marks, `${student.display_name} (Fortsetzung)`);

  doc.moveDown(0.6);
  legend(doc);
  if (ev.errorList.length || ev.returns) errorTable(doc, ev);
}

// Rohtext in Zeilen umbrechen und jedem Zeichen seine Position zuordnen.
function layout(raw, cols) {
  const chars = Array.from(raw.replace(/\r\n?/g, '\n'));
  const lines = [];
  let line = [];
  let lastSpace = -1;
  const push = () => {
    lines.push(line);
    line = [];
    lastSpace = -1;
  };
  chars.forEach((c, k) => {
    if (c === '\n') {
      line.push({ k, c, ret: true });
      push();
      return;
    }
    line.push({ k, c });
    if (c === ' ') lastSpace = line.length - 1;
    if (line.length >= cols) {
      if (lastSpace > 0 && lastSpace < line.length - 1) {
        const rest = line.slice(lastSpace + 1);
        line = line.slice(0, lastSpace + 1);
        push();
        line = rest;
      } else push();
    }
  });
  if (line.length || !lines.length) lines.push(line);
  return { lines, length: chars.length };
}

function snapshot(doc, raw, marks, contLabel) {
  const width = doc.page.width - 2 * MARGIN;
  const cols = Math.floor(width / CW);
  const { lines, length } = layout(raw || '', cols);
  const byIndex = new Map();
  for (const m of marks) {
    const list = byIndex.get(m.at) || [];
    list.push(m);
    byIndex.set(m.at, list);
  }
  // Position für Markierungen am Textende
  const endPos = { line: lines.length - 1, col: lines[lines.length - 1].length };

  let y = doc.y;
  const bottom = doc.page.height - MARGIN;
  lines.forEach((line, li) => {
    if (y + LH > bottom) {
      doc.addPage();
      doc.font('Helvetica').fontSize(8.5).fillColor(GREY).text(contLabel, MARGIN, MARGIN);
      y = MARGIN + 18;
    }
    const baseline = y + (LH - FS) / 2;
    // Hintergründe für falsche Zeichen
    line.forEach((cell, col) => {
      for (const m of byIndex.get(cell.k) || []) {
        if (m.kind === 'wrong') doc.rect(MARGIN + col * CW, baseline - 2, CW, FS + 4).fill(m.counted ? RED_BG : ORANGE_BG);
      }
    });
    const text = line.filter((c) => !c.ret).map((c) => safe(c.c)).join('');
    doc.font('Courier').fontSize(FS).fillColor('#000').text(text, MARGIN, baseline, { lineBreak: false });
    line.forEach((cell, col) => {
      for (const m of byIndex.get(cell.k) || []) {
        const x = MARGIN + col * CW;
        if (m.kind === 'wrong') {
          doc.moveTo(x, baseline + FS + 1).lineTo(x + CW, baseline + FS + 1).lineWidth(1.2).strokeColor(m.counted ? RED : ORANGE).stroke();
        } else if (m.kind === 'missing') caret(doc, x, baseline, m);
        else if (m.kind === 'return') {
          doc.font('Helvetica-Bold').fontSize(FS).fillColor(m.counted ? RED : ORANGE).text('¶', x + 1, baseline, { lineBreak: false });
        }
      }
    });
    if (li === endPos.line) for (const m of byIndex.get(length) || []) if (m.kind === 'missing') caret(doc, MARGIN + endPos.col * CW, baseline, m);
    y += LH;
  });
  doc.x = MARGIN;
  doc.y = y;
}

function caret(doc, x, baseline, m) {
  const color = m.counted ? RED : ORANGE;
  doc.save();
  doc.moveTo(x - 3, baseline + FS + 4).lineTo(x, baseline + FS - 1).lineTo(x + 3, baseline + FS + 4).fill(color);
  doc.restore();
  const label = Array.from(m.missing || '').map(safe).join('').slice(0, 14);
  if (label.trim()) doc.font('Helvetica').fontSize(6).fillColor(color).text(label, x - 2, baseline - 7, { lineBreak: false });
}

function legend(doc) {
  const y = doc.y;
  const items = [
    [RED_BG, RED, 'gewerteter Fehler'],
    [ORANGE_BG, ORANGE, 'markiert, nicht gewertet (z. B. zweiter Fehler im Wort, letzte Sinneinheit, Wiederholungsfehler)'],
  ];
  let yy = y;
  doc.font('Helvetica').fontSize(8);
  for (const [bg, fg, label] of items) {
    doc.rect(MARGIN, yy, 10, 9).fill(bg);
    doc.moveTo(MARGIN, yy + 9).lineTo(MARGIN + 10, yy + 9).lineWidth(1).strokeColor(fg).stroke();
    doc.fillColor('#000').text(label, MARGIN + 16, yy + 1, { lineBreak: false });
    yy += 13;
  }
  doc.moveTo(MARGIN + 2, yy + 9).lineTo(MARGIN + 5, yy + 3).lineTo(MARGIN + 8, yy + 9).fill(RED);
  doc.fillColor('#000').text('fehlende Zeichen, das Fehlende steht klein darüber', MARGIN + 16, yy + 1, { lineBreak: false });
  yy += 13;
  doc.font('Helvetica-Bold').fillColor(RED).text('¶', MARGIN + 2, yy, { lineBreak: false });
  doc.font('Helvetica').fillColor('#000').text('Returntaste benutzt', MARGIN + 16, yy + 1, { lineBreak: false });
  doc.x = MARGIN;
  doc.y = yy + 16;
}

function errorTable(doc, ev) {
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Fehlerliste', MARGIN);
  doc.moveDown(0.2);
  const cols = [MARGIN, MARGIN + 28, MARGIN + 170, MARGIN + 320];
  const row = (cells, bold = false, color = '#000') => {
    if (doc.y + 14 > doc.page.height - MARGIN) doc.addPage();
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(color);
    cells.forEach((c, i) => doc.text(Array.from(String(c)).map(safe).join(''), cols[i], y, { width: (cols[i + 1] ?? doc.page.width - MARGIN) - cols[i] - 6, lineBreak: false, ellipsis: true }));
    doc.y = y + 13;
  };
  row(['Nr.', 'Vorlage', 'Geschrieben', 'Wertung'], true);
  let n = 0;
  for (const e of ev.errorList) {
    n++;
    row([n, e.expected || '–', e.typed || '(fehlt)', e.counted ? (e.count > 1 ? `${e.count} Fehler` : 'Fehler') : `nicht gewertet: ${e.reason}`], false, e.counted ? '#000' : ORANGE);
  }
  if (ev.returns) {
    n++;
    row([n, 'Returntaste', `${ev.returns}× benutzt`, `${ev.returnErrors} Fehler`], false, '#000');
  }
}
