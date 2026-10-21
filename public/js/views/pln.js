// PLN: Praktischer Leistungsnachweis, 10-Minuten-Abschrift von einer Papiervorlage.
import { append, del, errorBox, fmtDate, fmtNum, get, h, patch, post, put, toast } from '../ui.js';
import { state } from '../app.js';
import { DEFAULTS, FORMATS, MODES, PRESETS, linesFor, normalizeSettings, plnHeading, presetSettings, strokes, summary } from '../pln-rules.js';

const FORMAT_LABEL = { ...FORMATS, plain: 'Normaler Fließtext (ab dem letzten PLN der 7. Jahrgangsstufe)' };
const RETURN_LABEL = {
  first: 'Erster Return ein Fehler, weitere als Wiederholungsfehler',
  each: 'Jeder Return ein Fehler',
};
const STATUS_LABEL = { draft: 'Vorbereitet', open: 'Freigegeben', closed: 'Beendet' };
const NOTES = ['Note 1', 'Note 2', 'Note 3', 'Note 4', 'Note 5'];

const time = (ms) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const dec = (n) => String(n).replace('.', ',');

function confirmDo(msg, fn) {
  return async () => {
    if (!window.confirm(msg)) return;
    try {
      await fn();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
}

// ---------- Lehrkraft: Einstellungen eines PLN ----------

// Formularfelder für alle Bewertungsregeln. Vorlagen nach den Richtlinien füllen die Felder,
// danach lässt sich jeder Wert einzeln anpassen.
function settingsFields(initial, schemes, { locked = false } = {}) {
  const box = h('div.pln-settings');
  const field = (name, label, value, attrs = {}) => h('label', label, h('input', { name, value: dec(value), inputmode: 'decimal', ...attrs }));
  const check = (name, label, value) => h('label.inline.pln-check', h('input', { type: 'checkbox', name, checked: value }), label);
  const row = (prefix, values) => h('div.grid5', values.map((v, i) => field(`${prefix}${i}`, NOTES[i], v, { required: true })));
  const steps = (values) => h('div.grid5', values.map((v, i) => field(`shortfallSteps${i}`, `${i + 1} ${i ? 'Stufen' : 'Stufe'} bis`, v, { required: true })));

  let current;
  const render = (s) => {
    current = s;
    const groups = {
      percent: h(
        'fieldset.pln-group',
        h('legend', 'Fehlerprozente (Fehler × 100 : Anschläge)'),
        field('requiredChars', 'Geforderte Anschlagszahl (Soll, für die Note 1 nötig)', s.requiredChars, { required: true }),
        h('p.muted.small', 'Höchste Fehlerprozente je Note, darüber Note 6:'),
        row('percentBands', s.percentBands),
        h('p.muted.small', 'Soll unterschritten: bis zu so vielen Anschlägen zu wenig wird die Note um 1, 2, 3, 4 Stufen herabgesetzt, darüber Note 6.'),
        steps(s.shortfallSteps),
        check('bonus', 'Bonus: Fehler werden nicht gewertet, wenn das Soll deutlich überschritten wird', s.bonus),
        h('div.grid2', field('bonusStart', 'Ab so vielen Anschlägen über dem Soll: 1 Fehler frei', s.bonusStart), field('bonusStep', 'Je weitere so viele Anschläge: 1 Fehler mehr frei', s.bonusStep))
      ),
      count: h(
        'fieldset.pln-group',
        h('legend', 'Fehlerzahl beim Abschreiben fester Zeilen'),
        h('div.grid2', field('targetLines', 'Zeilen zum Abschreiben', s.targetLines, { required: true, disabled: locked }), field('missingLinePenalty', 'Notenstufen je fehlender Zeile', s.missingLinePenalty)),
        h('p.muted.small', 'Höchste Fehlerzahl je Note, darüber Note 6:'),
        row('countBands', s.countBands),
        check('monosyllableExempt', 'Fehlt nur ein einsilbiges Wort, wird die Note nicht herabgesetzt', s.monosyllableExempt),
        field('lrsLinesPct', 'Nachteilsausgleich: so viel Prozent weniger Zeilen', s.lrsLinesPct),
        h('p.muted.small', 'Fehler in der angefangenen oder fehlenden Zeile werden nicht gewertet.')
      ),
      speed: h(
        'fieldset.pln-group',
        h('legend', 'Notenschlüssel nach Anschlägen pro Minute'),
        schemes.length
          ? h('label', 'Notenschlüssel', h('select', { name: 'gradingSchemeId' }, schemes.map((x) => h('option', { value: x.id, selected: x.id === Number(s.gradingSchemeId) }, `${x.name} · Note 1 ab ${x.thresholds[0]} Anschl./min`))))
          : h('p.muted.small', 'Bitte zuerst unter „Notenschlüssel“ einen anlegen.')
      ),
    };
    box.replaceChildren(
      h(
        'label',
        'Vorlage nach den Richtlinien',
        h(
          'select',
          {
            name: 'preset',
            onchange: (e) => e.target.value && render({ ...presetSettings(e.target.value), preset: e.target.value, gradingSchemeId: current.gradingSchemeId }),
          },
          h('option', { value: '' }, 'Eigene Einstellungen'),
          PRESETS.map((p) => h('option', { value: p.id, selected: p.id === s.preset }, p.label))
        )
      ),
      h(
        'div.grid2',
        h('label', 'Bewertungsart', h('select', { name: 'mode', disabled: locked, onchange: (e) => render(normalizeSettings({ ...read(), mode: e.target.value, preset: undefined })) }, Object.entries(MODES).map(([v, l]) => h('option', { value: v, selected: v === s.mode }, l)))),
        h('div.grid2', field('durationMin', 'Arbeitszeit (Minuten)', s.durationMin, { required: true }), field('weight', 'Gewichtung', s.weight))
      ),
      h(
        'div.grid2',
        s.mode === 'count'
          ? h('label', 'Vorlage', h('select', { disabled: true }, h('option', FORMATS.lines)))
          : h('label', 'Vorlage', h('select', { name: 'format' }, Object.entries(FORMAT_LABEL).map(([v, l]) => h('option', { value: v, selected: v === s.format }, l)))),
        h('label', 'Returntaste', h('select', { name: 'returnRule' }, Object.entries(RETURN_LABEL).map(([v, l]) => h('option', { value: v, selected: v === s.returnRule }, l))))
      ),
      h('div.grid2', field('lineChars', 'Zeichen je Zeile auf der Vorlage', s.lineChars, { disabled: locked }), field('lrsTimePct', 'Nachteilsausgleich: so viel Prozent mehr Zeit', s.lrsTimePct)),
      h(
        'div.pln-checks',
        check('capitalDouble', 'Großbuchstabe zählt 2 Anschläge', s.capitalDouble),
        check('oneErrorPerWord', 'Mehrere Tippfehler in einem Wort zählen als ein Fehler (alle werden markiert)', s.oneErrorPerWord),
        check('lastWordFree', 'In der letzten Sinneinheit (letztes Wort) wird kein Fehler gewertet', s.lastWordFree),
        check('repeatFree', 'Wiederholungsfehler: dasselbe Wort gleich falsch geschrieben zählt nur einmal', s.repeatFree)
      ),
      groups[s.mode]
    );
  };

  // Formularwerte als Einstellungen lesen.
  const read = () => {
    const out = { ...current };
    for (const el of box.querySelectorAll('input[name], select[name]')) {
      if (el.disabled) continue;
      out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    for (const [key, len] of [['percentBands', 5], ['shortfallSteps', 4], ['countBands', 5]]) {
      if (!(`${key}0` in out)) continue;
      out[key] = Array.from({ length: len }, (_, i) => out[`${key}${i}`]);
      for (let i = 0; i < len; i++) delete out[`${key}${i}`];
    }
    if (locked) Object.assign(out, { mode: initial.mode, lineChars: initial.lineChars, targetLines: initial.targetLines });
    if (!out.preset) delete out.preset;
    delete out.textId;
    return out;
  };
  render({ ...DEFAULTS, ...initial });
  return { el: box, read };
}

// ---------- Lehrkraft: Abschnitt in der Klassenansicht ----------

export function plnSection(classId, texts, schemes) {
  const list = h('div', h('p.muted', 'Wird geladen …'));
  const load = async () => {
    const plns = await get(`/api/classes/${classId}/plns`);
    list.replaceChildren(
      plns.length
        ? h(
            'ul.list',
            plns.map((p) =>
              h(
                'li',
                h('span.tag.tag-pln', 'PLN'),
                h('a', { href: `#/pln/${p.id}` }, p.title),
                h('span.muted.small', ` · ${STATUS_LABEL[p.status]} · ${p.started} begonnen · ${summary(p.settings, p.scheme_name)}`)
              )
            )
          )
        : h('p.muted', 'Noch kein PLN angelegt.')
    );
  };
  load();

  const longFirst = [...texts].sort((a, b) => b.length - a.length);
  const settings = settingsFields({ ...presetSettings('7-1'), preset: '7-1', gradingSchemeId: schemes[0]?.id ?? null }, schemes);
  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(form);
        try {
          const { id } = await post(`/api/classes/${classId}/plns`, {
            title: form.elements.title.value,
            settings: { ...settings.read(), textId: Number(form.elements.textId.value) },
          });
          location.hash = `#/pln/${id}`;
        } catch (err) {
          showError(err.message);
        }
      },
    },
    h('h3', 'Neuen PLN anlegen'),
    h(
      'div.grid2',
      h('label', 'Titel', h('input', { name: 'title', required: true, maxlength: 120, placeholder: 'z. B. 2. Tipp-PLN' })),
      h(
        'label',
        'Text',
        h('select', { name: 'textId', required: true }, longFirst.map((t) => h('option', { value: t.id }, `${t.title}${t.own ? ' (eigener Text)' : ''} · ${t.length} Zeichen`)))
      )
    ),
    h('p.muted.small', 'Ist der Text kürzer als nötig, hängt die App weitere Texte an, damit niemand vor Ablauf der Zeit fertig ist. Alle Werte lassen sich später noch ändern.'),
    settings.el,
    h('button.primary', { type: 'submit' }, 'PLN anlegen')
  );
  return h(
    'section.card',
    h('h2', 'PLN Praktischer Leistungsnachweis'),
    h('p.muted.small', 'Abschrift von einer ausgedruckten Vorlage. Nach Ablauf der Zeit wird der Stand unverändert gespeichert. Bewertet wird nach den Richtlinien, jeder Wert ist einstellbar.'),
    list,
    form
  );
}

// ---------- Lehrkraft: ein PLN ----------

export async function plnView(app, { id }) {
  const [data, schemes] = await Promise.all([get(`/api/plns/${id}`), get('/api/grading-schemes').catch(() => [])]);
  const { pln, rows } = data;
  const s = pln.settings;
  const reload = () => {
    const c = h('div');
    app.replaceWith(c);
    plnView(c, { id });
  };
  const setStatus = (status) => async () => {
    await patch(`/api/plns/${id}`, { status });
    reload();
  };
  const running = rows.filter((r) => r.state === 'running').length;
  const done = rows.filter((r) => r.state === 'done').length;
  const anyStarted = rows.some((r) => r.state !== 'none');

  const statusButtons = {
    draft: [h('button.primary', { onclick: setStatus('open') }, 'Für Schüler freigeben')],
    open: [h('button.primary', { onclick: confirmDo('PLN beenden? Danach kann niemand mehr beginnen. Laufende Abschriften enden regulär nach Ablauf der Zeit.', setStatus('closed')) }, 'PLN beenden')],
    closed: [h('button', { onclick: setStatus('open') }, 'Wieder freigeben')],
  }[pln.status];

  const setFlag = (r, key) => async (e) => {
    try {
      await put(`/api/plns/${id}/students/${r.user_id}`, { [key]: e.target.checked });
      reload();
    } catch (err) {
      toast(err.message, 'error');
      e.target.checked = !e.target.checked;
    }
  };

  const settings = settingsFields(s, schemes, { locked: anyStarted });
  const settingsForm = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(settingsForm);
        try {
          const r = await put(`/api/plns/${id}/settings`, settings.read());
          toast(r.textChanged ? 'Gespeichert. Der Text wurde neu zusammengestellt, bitte die Vorlage neu drucken.' : 'Gespeichert. Die Notenvorschläge sind neu berechnet.');
          reload();
        } catch (err) {
          showError(err.message);
        }
      },
    },
    anyStarted ? h('p.muted.small', 'Es hat schon jemand begonnen: Bewertungsart, Text und Zeilen bleiben fest. Alle Bewertungsregeln lassen sich weiter ändern, die Notenvorschläge werden dann neu berechnet.') : null,
    settings.el,
    h('button.primary', { type: 'submit' }, 'Einstellungen speichern')
  );

  const third = s.mode === 'count' ? 'Fehlende Zeilen' : s.mode === 'percent' ? 'Fehler %' : null;
  const ntaInfo = [s.lrsTimePct ? `${s.lrsTimePct} % mehr Zeit` : '', s.mode === 'count' && s.lrsLinesPct ? `${linesFor(s, true)} statt ${s.targetLines} Zeilen` : ''].filter(Boolean).join(', ');

  append(
    app,
    h('p', h('a', { href: `#/klasse/${pln.class_id}` }, `← Klasse ${pln.className}`)),
    h('p.pln-kicker', pln.heading),
    h('h1', pln.title),
    h(
      'div.chips',
      h('span.chip', h('b', STATUS_LABEL[pln.status])),
      h('span.chip', summary(s, pln.scheme?.name)),
      s.mode !== 'count' ? h('span.chip', FORMAT_LABEL[s.format]) : null,
      h('span.chip', `Returntaste: ${RETURN_LABEL[s.returnRule]}`),
      h('span.chip', `Note 1 ab ${fmtNum(pln.note1_chars)} Anschlägen`),
      s.weight ? h('span.chip', `Gewichtung ${dec(s.weight)}`) : null
    ),
    h(
      'section.card',
      h('h2', 'Ablauf'),
      h(
        'ol.steps',
        h('li', h('a', { href: `#/pln/${id}/vorlage` }, 'Vorlage drucken'), ' und austeilen. Der Text erscheint bei den Schülern nicht am Bildschirm. Für den Nachteilsausgleich gibt es eine ', h('a', { href: `#/pln/${id}/vorlage-nta` }, 'Vorlage mit größerer Schrift'), '.'),
        h('li', 'Nachteilsausgleich unten in der Tabelle ankreuzen, bevor die Person startet. Dann PLN freigeben. Jede Person startet selbst und hat ab dem Start die eingestellte Zeit.'),
        h('li', 'Nach Ablauf der Zeit wird der Stand unverändert gespeichert. Danach die Abschriften als PDF herunterladen.')
      ),
      h(
        'div.toolbar',
        h('a.button', { href: `#/pln/${id}/vorlage` }, 'Vorlage drucken'),
        ...statusButtons,
        h('a.button', { href: `/api/plns/${id}/abschriften.pdf`, download: true }, `Abschriften als PDF (${done})`),
        h('button', { onclick: reload }, 'Aktualisieren'),
        h(
          'button.danger',
          { onclick: confirmDo(`PLN „${pln.title}“ mit allen Abschriften löschen?`, async () => { await del(`/api/plns/${id}`); location.hash = `#/klasse/${pln.class_id}`; }) },
          'Löschen'
        )
      )
    ),
    h(
      'section.card',
      h('h2', `Teilnahme (${done} abgegeben, ${running} schreiben gerade)`),
      h(
        'div.table-wrap',
        h(
          'table.table',
          h(
            'thead',
            h(
              'tr',
              ['Pseudonym', 'Benutzername', 'Status', 'Beginn', 'Anschläge', 'Fehler', third, 'Note (Vorschlag)', 'NTA', 'Ohne 10 F.', ''].filter((c) => c !== null).map((c) => h('th', c))
            )
          ),
          h(
            'tbody',
            rows.map((r) =>
              h(
                'tr',
                h('td', r.display_name),
                h('td.mono', r.username),
                h(
                  'td',
                  r.state === 'none' ? h('span.muted', 'nicht begonnen') : r.state === 'running' ? h('span.tag', `schreibt bis ${time(r.end_at)}`) : 'abgegeben',
                  r.left_count ? h('span.tag.tag-test', { title: 'Prüfungsfenster verlassen' }, ` ${r.left_count}× verlassen`) : null
                ),
                h('td', r.started_at ? fmtDate(r.started_at) : '–'),
                h('td', r.gross ?? '–'),
                h('td', r.errors ?? '–'),
                third ? h('td', r.grade == null ? '–' : s.mode === 'count' ? r.missingLines : r.grade.percent != null ? `${r.grade.percent.toLocaleString('de-DE', { minimumFractionDigits: 3 })} %` : '–') : null,
                h('td', r.grade ? h('b', { title: (r.grade.steps || []).join('\n') }, r.grade.grade) : '–', r.grade?.steps?.length ? h('div.muted.small.pln-steps', r.grade.steps.join(' · ')) : null),
                h(
                  'td',
                  h('label.inline', { title: ntaInfo }, h('input', { type: 'checkbox', checked: r.lrs, disabled: r.state !== 'none' && s.mode !== 'count', onchange: setFlag(r, 'lrs') }), r.lrs ? ntaInfo : '')
                ),
                h('td', h('input', { type: 'checkbox', checked: r.no_touch, title: 'Zehn-Finger-System nicht angewendet: Note 6', onchange: setFlag(r, 'noTouch') })),
                h(
                  'td',
                  r.state !== 'none'
                    ? h(
                        'button.small',
                        {
                          onclick: confirmDo(`Abschrift von ${r.display_name} löschen? Die Person kann den PLN danach neu beginnen (z. B. als Nachholer).`, async () => {
                            await del(`/api/plns/${id}/attempts/${r.user_id}`);
                            reload();
                          }),
                        },
                        'Zurücksetzen'
                      )
                    : null
                )
              )
            )
          )
        )
      ),
      h('p.muted.small', `NTA: Nachteilsausgleich bei LRS/Legasthenie (${ntaInfo || 'in den Einstellungen festlegen'}), vor dem Start ankreuzen. Ohne 10 F.: Zehn-Finger-System nicht angewendet, Note 6.`)
    ),
    h('section.card', h('details', h('summary', h('b', 'Bewertung genau einstellen')), settingsForm))
  );
  if (pln.status === 'open') {
    const timer = setTimeout(() => app.isConnected && reload(), 15000);
    state.cleanup = () => clearTimeout(timer);
  }
}

// ---------- Lehrkraft: Druckvorlage ----------

export const plnSheetNtaView = (app, params) => plnSheetView(app, { ...params, nta: true });

export async function plnSheetView(app, { id, nta = false }) {
  const { pln, schoolName } = await get(`/api/plns/${id}`);
  const s = pln.settings;
  const text = pln.text;
  // Mit Nachteilsausgleich bei fester Zeilenzahl: Ziel ist das Ende der verkürzten Zeilen.
  const short = nta && s.mode === 'count' && pln.lrs_pos != null && pln.lrs_pos < text.length;
  const pos = short ? pln.lrs_pos : pln.note1_pos;
  const goal = short ? pln.lrs_chars : pln.note1_chars;
  const marker = () => h('span.mark1', 'Note 1');
  // Text mit Note-1-Markierung hinter dem Wort, in dem die Grenze liegt.
  const withMarker = (str, offset) => {
    if (pos < offset || pos > offset + str.length) return str;
    const cut = pos - offset;
    return [str.slice(0, cut), marker(), str.slice(cut)];
  };

  let body;
  if (s.format === 'lines' || s.mode === 'count') {
    let lines = templateLines(text, s.lineChars, s.capitalDouble);
    if (short) lines = lines.slice(0, linesFor(s, true));
    body = h(
      'table.pln-lines',
      h('thead', h('tr', h('th', 'Zeile'), h('th', 'Text'), h('th', 'Anschläge'))),
      h('tbody', lines.map((l) => h('tr', h('td.no', l.no), h('td.txt', withMarker(l.text, l.start)), h('td.no', l.strokes))))
    );
  } else {
    body = h('p.pln-plain', withMarker(text, 0));
  }
  const minutes = nta && s.lrsTimePct ? Math.round(s.durationMin * (1 + s.lrsTimePct / 100) * 10) / 10 : s.durationMin;
  const goalInfo = `${fmtNum(goal)} Anschläge in ${dec(minutes)} Minuten`;
  const goalHint =
    s.mode === 'count'
      ? h('li', `Schreibe alle ${short ? linesFor(s, true) : s.targetLines} Zeilen ab, also bis zur Markierung `, marker(), ` (${goalInfo}).`)
      : h('li', 'Für die Note 1 musst du mindestens bis zur Markierung ', marker(), ` schreiben (${goalInfo}, fehlerfrei).`);

  append(
    app,
    h(
      'div.toolbar.no-print',
      h('a', { href: `#/pln/${id}` }, '← Zurück'),
      h('button.primary', { onclick: () => window.print() }, 'Drucken'),
      h('span.muted.small', nta ? 'Vorlage für den Nachteilsausgleich: größere Schrift.' : 'Gedruckt wird in 12 Punkt mit eineinhalbfachem Zeilenabstand.')
    ),
    h(
      `article.pln-sheet${nta ? '.pln-sheet-large' : ''}`,
      h('h1', plnHeading(s)),
      h('p.pln-meta', [schoolName, `Klasse ${pln.className}`, pln.title].filter(Boolean).join(' · ')),
      h('p.pln-fill', 'Pseudonym: ________________________   Datum: ______________'),
      h(
        'ul.pln-hints',
        h('li', h('b', 'Es ist ein Fließtext im Zehn-Finger-System zu schreiben.')),
        goalHint,
        s.capitalDouble ? h('li', 'Ein Großbuchstabe zählt zwei Anschläge.') : null,
        h('li', 'Die Returntaste nicht benutzen: Am Zeilenende einfach mit einem Leerzeichen weiterschreiben.'),
        h('li', 'Der Nummernblock darf verwendet werden. Korrigieren mit der Rücktaste ist erlaubt.'),
        h('li', `Du hast ab dem Start genau ${dec(minutes)} Minuten. Danach wird dein Text automatisch gespeichert.`)
      ),
      body
    )
  );
}

// Gleiche Zeilenaufteilung wie auf dem Server (server/pln.js).
function templateLines(text, width = 62, capitalDouble = false) {
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
    const add = i < lines.length - 1 ? 1 : 0;
    total += line.length + add;
    sum += strokes(line, capitalDouble) + add;
    return { no: i + 1, text: line, start, end: total, strokes: sum };
  });
}

// ---------- Schülerin oder Schüler ----------

export async function studentPlnView(app, { id }) {
  const s = await get(`/api/me/plns/${id}`);
  const head = [h('p.pln-kicker', s.heading), h('h1', s.title)];

  if (s.ended) {
    append(app, ...head, h('section.card.pln-done', h('h2', 'Abgegeben'), h('p', 'Deine Abschrift ist gespeichert. Deine Lehrkraft bekommt sie unverändert zur Bewertung.'), h('a.button', { href: '#/' }, 'Zur Startseite')));
    return;
  }
  if (!s.startedAt) {
    if (s.status !== 'open') {
      append(app, ...head, h('section.card', h('p', 'Dieser PLN ist gerade nicht freigegeben. Warte, bis deine Lehrkraft ihn freigibt.'), h('a.button', { href: '#/' }, 'Zur Startseite')));
      return;
    }
    append(
      app,
      ...head,
      h(
        'section.card.pln-intro',
        h('h2', 'Bevor du beginnst'),
        h(
          'ul',
          h('li', 'Lege dein Blatt mit dem Text neben die Tastatur. Am Bildschirm siehst du den Text nicht.'),
          h('li', 'Es ist ein Fließtext im Zehn-Finger-System zu schreiben. Die Returntaste nicht benutzen.'),
          h('li', 'Der Nummernblock darf verwendet werden. Korrigieren mit der Rücktaste ist erlaubt.'),
          h('li', h('b', `Du hast genau ${fmtMin(s.durationMs)} Minuten.`), ' Danach wird dein Text automatisch gespeichert. Du kannst nur einmal beginnen.')
        ),
        h(
          'button.primary.big',
          {
            onclick: async (e) => {
              e.target.disabled = true;
              enterFullscreen();
              try {
                const started = await post(`/api/me/plns/${id}/start`);
                app.replaceChildren();
                runPln(app, started, head);
              } catch (err) {
                toast(err.message, 'error');
                e.target.disabled = false;
              }
            },
          },
          'PLN starten'
        )
      )
    );
    return;
  }
  runPln(app, s, head);
}

function runPln(app, s, head) {
  const offset = s.serverNow - Date.now(); // Serverzeit = lokale Zeit + offset
  const endAt = s.startedAt + s.durationMs;
  const clock = h('span.pln-clock', clockText(s.durationMs));
  const status = h('span.muted.small.pln-save', '');
  const area = h('textarea.pln-area', {
    spellcheck: 'false',
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'off',
    'aria-label': 'Abschrift',
    readonly: true,
    onpaste: (e) => e.preventDefault(),
    ondrop: (e) => e.preventDefault(),
    oncontextmenu: (e) => e.preventDefault(),
  });
  area.value = s.typed || '';
  const overlay = h('div.pln-countdown', '');
  const leftNote = h('div.pln-warning', { hidden: true });
  append(app, ...head, h('div.pln-bar', clock, status), leftNote, h('div.pln-stage', area, overlay));

  // Prüfungsmodus: Menü ausblenden, Navigation sperren, Vollbild. Verlassen des Fensters wird gezählt.
  state.examLock = location.hash;
  document.body.classList.add('exam-mode');
  let leftCount = s.leftCount || 0;
  const showLeft = () => {
    leftNote.hidden = false;
    leftNote.replaceChildren(
      h('strong', 'Bitte im PLN bleiben.'),
      h('span', ` Du hast das Fenster ${leftCount}× verlassen. Deine Lehrkraft sieht das.`)
    );
    if (!document.fullscreenElement && document.fullscreenEnabled) {
      leftNote.append(h('button.small', { onclick: () => { enterFullscreen(); area.focus(); } }, 'Vollbild wieder einschalten'));
    }
  };
  let lastLeave = 0;
  const onLeave = () => {
    if (finished || Date.now() + offset < s.startedAt) return;
    if (Date.now() - lastLeave < 1500) return; // ein Wechsel löst mehrere Ereignisse aus
    lastLeave = Date.now();
    leftCount++;
    showLeft();
  };
  const onVisibility = () => document.visibilityState === 'hidden' && onLeave();
  const onFullscreen = () => {
    if (!document.fullscreenElement) onLeave();
  };
  window.addEventListener('blur', onLeave);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('fullscreenchange', onFullscreen);
  if (leftCount) showLeft();
  const unlock = () => {
    state.examLock = null;
    document.body.classList.remove('exam-mode');
    window.removeEventListener('blur', onLeave);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('fullscreenchange', onFullscreen);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  let lastSent = null;
  let lastLeft = leftCount;
  let finished = false;
  const save = async (final = false) => {
    const typed = area.value;
    if (!final && typed === lastSent && leftCount === lastLeft) return;
    try {
      await post(`/api/me/plns/${s.id}/save`, { typed, final, leftCount });
      lastSent = typed;
      lastLeft = leftCount;
      status.textContent = final ? 'Abgegeben' : `Gespeichert ${new Date().toLocaleTimeString('de-DE')}`;
    } catch (e) {
      status.textContent = e.message;
      if (final) throw e;
    }
  };

  const finish = async () => {
    if (finished) return;
    finished = true;
    area.readOnly = true;
    clock.textContent = '0:00';
    overlay.textContent = 'Die Zeit ist um. Dein Text wird gespeichert …';
    overlay.hidden = false;
    try {
      await save(true);
      overlay.replaceChildren(h('strong', 'Abgegeben.'), h('span', 'Deine Abschrift ist gespeichert.'), h('a.button', { href: '#/' }, 'Zur Startseite'));
    } catch (e) {
      overlay.replaceChildren(h('strong', 'Speichern nicht möglich'), h('span', e.message), h('a.button', { href: '#/' }, 'Zur Startseite'));
    }
    unlock();
    leftNote.hidden = true;
  };

  const tick = () => {
    const now = Date.now() + offset;
    if (now < s.startedAt) {
      overlay.hidden = false;
      overlay.textContent = `Gleich geht es los: ${Math.ceil((s.startedAt - now) / 1000)}`;
      return;
    }
    if (area.readOnly && !finished) {
      area.readOnly = false;
      overlay.hidden = true;
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
    }
    const left = Math.max(0, endAt - now);
    const sec = Math.ceil(left / 1000);
    clock.textContent = clockText(left);
    clock.classList.toggle('pln-clock-low', sec <= 60);
    if (left <= 0) finish();
  };
  tick();
  const timer = setInterval(tick, 250);
  const autosave = setInterval(() => !finished && Date.now() + offset >= s.startedAt && save(), 10000);
  const warn = (e) => {
    if (!finished) e.preventDefault();
  };
  window.addEventListener('beforeunload', warn);
  state.cleanup = () => {
    clearInterval(timer);
    clearInterval(autosave);
    window.removeEventListener('beforeunload', warn);
    unlock();
    if (!finished) save();
  };
}

const fmtMin = (ms) => dec(Math.round(ms / 6000) / 10);
const clockText = (ms) => {
  const sec = Math.ceil(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

function enterFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
}

// Für die Startseite der Lernenden.
export function openPlnCards(plns) {
  return plns
    .filter((p) => !p.done && p.status === 'open')
    .map((p) => h('a.suggestion.pln-card', { href: `#/pln/${p.id}` }, h('span.pill-label', 'Prüfung'), h('strong', 'PLN Praktischer Leistungsnachweis'), h('span', p.title), h('span.button.go', 'Zum PLN')));
}
