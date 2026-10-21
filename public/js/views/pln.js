// PLN: Praktischer Leistungsnachweis, 10-Minuten-Abschrift von einer Papiervorlage.
import { append, del, errorBox, fmtDate, fmtNum, get, h, patch, post, put, toast } from '../ui.js';
import { state } from '../app.js';
import { DEFAULTS, MODES, PRESETS, linesFor, normalizeSettings, plnHeading, presetSettings, strokes, summary } from '../pln-rules.js';

const FORMAT_LABEL = { lines: 'Mit Zeilenangaben', plain: 'Normaler Fließtext' };
const RETURN_LABEL = {
  first: 'Erster Return ein Fehler, weitere als Wiederholungsfehler',
  each: 'Jeder Return ein Fehler',
};
const STATUS_LABEL = { draft: 'Vorbereitet', open: 'Freigegeben', closed: 'Beendet' };
const NOTES = ['Note 1', 'Note 2', 'Note 3', 'Note 4', 'Note 5'];

const time = (ms) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const dec = (n) => String(n).replace('.', ',');
const statusTag = (status) => h(`span.tag.pln-status.pln-status-${status}`, STATUS_LABEL[status]);

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

// Die wichtigsten Regeln in einer Zeile, damit man die Einstellungen nicht aufklappen muss.
function rulesLine(s, schemeName = '') {
  const parts = [summary(s, schemeName)];
  if (s.mode === 'percent') {
    parts.push(`Note 1 bis ${dec(s.percentBands[0])} %`);
    if (s.bonus) parts.push(`Bonus ab +${s.bonusStart}`);
  }
  if (s.mode === 'count') {
    parts.push(`Note 1 bis ${s.countBands[0]} ${s.countBands[0] === 1 ? 'Fehler' : 'Fehler'}`);
    if (s.missingLinePenalty) parts.push(`je fehlende Zeile −${s.missingLinePenalty} ${s.missingLinePenalty === 1 ? 'Stufe' : 'Stufen'}`);
  }
  if (s.capitalDouble) parts.push('Großbuchstabe = 2 Anschläge');
  parts.push(s.returnRule === 'each' ? 'jeder Return ein Fehler' : 'erster Return ein Fehler');
  const nta = [s.lrsTimePct ? `+${s.lrsTimePct} % Zeit` : '', s.mode === 'count' && s.lrsLinesPct ? `−${s.lrsLinesPct} % Zeilen` : ''].filter(Boolean).join(', ');
  if (nta) parts.push(`Nachteilsausgleich ${nta}`);
  return parts.join(' · ');
}

// ---------- Lehrkraft: Einstellungen eines PLN ----------

// Vorlage nach den Richtlinien als Auswahl, darunter eine Zeile mit den wichtigsten Regeln und
// aufklappbar alle Werte. Die Vorlage füllt die Felder, danach lässt sich jeder Wert einzeln anpassen.
function settingsFields(initial, schemes, { locked = false, open = false } = {}) {
  const field = (name, label, value, attrs = {}) => h('label', label, h('input', { name, value: dec(value), inputmode: 'decimal', ...attrs }));
  const check = (name, label, value) => h('label.inline.pln-check', h('input', { type: 'checkbox', name, checked: value }), label);
  const row = (prefix, values, labels) => h('div.grid5', values.map((v, i) => field(`${prefix}${i}`, labels[i], v, { required: true })));

  let current;
  const preset = h(
    'select',
    { name: 'preset', onchange: (e) => e.target.value && render({ ...presetSettings(e.target.value), preset: e.target.value, gradingSchemeId: current.gradingSchemeId }) },
    h('option', { value: '' }, 'Eigene Einstellungen'),
    PRESETS.map((p) => h('option', { value: p.id }, p.label))
  );
  const line = h('p.pln-rules-line');
  const body = h('div.pln-settings');
  const details = h('details.pln-more', { open }, h('summary', 'Alle Werte anpassen'), body);

  const render = (s) => {
    current = s;
    preset.value = s.preset || '';
    const groups = {
      percent: h(
        'fieldset.pln-group',
        h('legend', 'Fehlerprozente (Fehler × 100 : Anschläge)'),
        h('div.grid3', field('requiredChars', 'Geforderte Anschläge (Soll)', s.requiredChars, { required: true }), field('bonusStart', 'Bonus: 1 Fehler frei ab + Anschlägen', s.bonusStart), field('bonusStep', 'je weitere + Anschläge 1 Fehler mehr', s.bonusStep)),
        check('bonus', 'Bonus bei deutlich mehr Anschlägen als gefordert', s.bonus),
        h('p.pln-hint', 'Höchste Fehlerprozente je Note, darüber Note 6'),
        row('percentBands', s.percentBands, NOTES),
        h('p.pln-hint', 'Soll unterschritten um höchstens … Anschläge: Note 1–4 Stufen schlechter, darüber Note 6'),
        row('shortfallSteps', s.shortfallSteps, ['−1 Stufe', '−2 Stufen', '−3 Stufen', '−4 Stufen'])
      ),
      count: h(
        'fieldset.pln-group',
        h('legend', 'Fehlerzahl bei festen Zeilen'),
        h('div.grid3', field('targetLines', 'Zeilen zum Abschreiben', s.targetLines, { required: true, disabled: locked }), field('missingLinePenalty', 'Stufen je fehlender Zeile', s.missingLinePenalty), field('lrsLinesPct', 'Nachteilsausgleich: % weniger Zeilen', s.lrsLinesPct)),
        h('p.pln-hint', 'Höchste Fehlerzahl je Note, darüber Note 6'),
        row('countBands', s.countBands, NOTES),
        check('monosyllableExempt', 'Fehlt nur ein einsilbiges Wort, keine Abstufung', s.monosyllableExempt),
        h('p.pln-hint', 'Fehler in der angefangenen oder fehlenden Zeile werden nicht gewertet.')
      ),
      speed: h(
        'fieldset.pln-group',
        h('legend', 'Notenschlüssel nach Anschlägen pro Minute'),
        schemes.length
          ? h('label', 'Notenschlüssel', h('select', { name: 'gradingSchemeId' }, schemes.map((x) => h('option', { value: x.id, selected: x.id === Number(s.gradingSchemeId) }, `${x.name} · Note 1 ab ${x.thresholds[0]} Anschl./min`))))
          : h('p.muted.small', 'Bitte zuerst unter „Notenschlüssel“ einen anlegen.')
      ),
    };
    body.replaceChildren(
      h(
        'div.grid4',
        h('label.span2', 'Bewertungsart', h('select', { name: 'mode', disabled: locked, onchange: (e) => render(normalizeSettings({ ...read(), mode: e.target.value, preset: undefined })) }, Object.entries(MODES).map(([v, l]) => h('option', { value: v, selected: v === s.mode }, l)))),
        field('durationMin', 'Arbeitszeit (Min.)', s.durationMin, { required: true }),
        field('weight', 'Gewichtung', s.weight)
      ),
      h(
        'div.grid4',
        s.mode === 'count'
          ? h('label', 'Vorlage', h('select', { disabled: true }, h('option', FORMAT_LABEL.lines)))
          : h('label', 'Vorlage', h('select', { name: 'format' }, Object.entries(FORMAT_LABEL).map(([v, l]) => h('option', { value: v, selected: v === s.format }, l)))),
        h('label', 'Returntaste', h('select', { name: 'returnRule' }, Object.entries(RETURN_LABEL).map(([v, l]) => h('option', { value: v, selected: v === s.returnRule }, l)))),
        field('lineChars', 'Zeichen je Zeile', s.lineChars, { disabled: locked }),
        field('lrsTimePct', 'Nachteilsausgleich: % mehr Zeit', s.lrsTimePct)
      ),
      h(
        'div.pln-checks',
        check('capitalDouble', 'Großbuchstabe zählt 2 Anschläge', s.capitalDouble),
        check('oneErrorPerWord', 'Mehrere Tippfehler in einem Wort = ein Fehler', s.oneErrorPerWord),
        check('lastWordFree', 'Letzte Sinneinheit ohne Wertung', s.lastWordFree),
        check('repeatFree', 'Wiederholungsfehler nur einmal werten', s.repeatFree)
      ),
      groups[s.mode]
    );
    update();
  };

  // Formularwerte als Einstellungen lesen.
  const read = () => {
    const out = { ...current, preset: preset.value };
    for (const el of body.querySelectorAll('input[name], select[name]')) {
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
  const update = () => {
    const s = normalizeSettings(read());
    const scheme = schemes.find((x) => x.id === Number(s.gradingSchemeId));
    line.textContent = rulesLine(s, scheme?.name);
  };
  // Eigene Änderung: Auswahl der Vorlage zurücksetzen, Zusammenfassung neu schreiben.
  body.addEventListener('input', (e) => {
    if (e.target.name !== 'mode') preset.value = '';
    update();
  });
  render({ ...DEFAULTS, ...initial });
  return { preset, line, details, read };
}

// ---------- Lehrkraft: Abschnitt in der Klassenansicht ----------

export function plnSection(classId, texts, schemes) {
  const list = h('div', h('p.muted', 'Wird geladen …'));
  const load = async () => {
    const plns = await get(`/api/classes/${classId}/plns`);
    list.replaceChildren(
      plns.length
        ? h(
            'ul.list.pln-list',
            plns.map((p) =>
              h(
                'li',
                h('a', { href: `#/pln/${p.id}` }, p.title),
                statusTag(p.status),
                h('span.muted.small', `${summary(p.settings, p.scheme_name)} · ${p.started} begonnen`),
                h('a.button.small', { href: `#/pln/${p.id}` }, 'Öffnen')
              )
            )
          )
        : h('p.muted.small', 'Noch kein PLN angelegt.')
    );
  };
  load();

  const longFirst = [...texts].sort((a, b) => b.length - a.length);
  const settings = settingsFields({ ...presetSettings('7-1'), preset: '7-1', gradingSchemeId: schemes[0]?.id ?? null }, schemes);
  const form = h(
    'form.pln-new',
    {
      hidden: true,
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
    h(
      'div.grid3',
      h('label', 'Titel', h('input', { name: 'title', required: true, maxlength: 120, placeholder: 'z. B. 2. Tipp-PLN' })),
      h('label', 'Vorlage nach den Richtlinien', settings.preset),
      h('label', 'Text', h('select', { name: 'textId', required: true }, longFirst.map((t) => h('option', { value: t.id }, `${t.title}${t.own ? ' (eigener Text)' : ''} · ${t.length} Zeichen`))))
    ),
    settings.line,
    settings.details,
    h(
      'div.toolbar',
      h('button.primary', { type: 'submit' }, 'PLN anlegen'),
      h('button', { type: 'button', onclick: () => toggle(false) }, 'Abbrechen'),
      h('span.muted.small', 'Reicht der Text nicht für die ganze Zeit, hängt die App weitere Texte an.')
    )
  );
  const openBtn = h('button.small', { type: 'button', onclick: () => toggle(true) }, '+ Neuer PLN');
  const toggle = (show) => {
    form.hidden = !show;
    openBtn.hidden = show;
    if (show) form.elements.title.focus();
  };
  return h(
    'section.card',
    h('div.pln-section-head', h('h2', 'PLN Praktischer Leistungsnachweis'), openBtn),
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

  const setFlag = (r, key) => async (e) => {
    try {
      await put(`/api/plns/${id}/students/${r.user_id}`, { [key]: e.target.checked });
      reload();
    } catch (err) {
      toast(err.message, 'error');
      e.target.checked = !e.target.checked;
    }
  };

  // Einstellungen: aufklappbar unter dem Kopf, Regeln stehen als eine Zeile darüber.
  const settings = settingsFields(s, schemes, { locked: anyStarted, open: true });
  const settingsForm = h(
    'form.pln-edit',
    {
      hidden: true,
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
    h('label', 'Vorlage nach den Richtlinien', settings.preset),
    anyStarted ? h('p.pln-hint', 'Es hat schon jemand begonnen: Bewertungsart, Text und Zeilen bleiben fest. Die übrigen Regeln lassen sich ändern, die Notenvorschläge werden neu berechnet.') : null,
    settings.details,
    h('div.toolbar', h('button.primary', { type: 'submit' }, 'Speichern'), h('button', { type: 'button', onclick: () => (settingsForm.hidden = true) }, 'Abbrechen'))
  );

  // Ablauf als drei Schritte nebeneinander.
  const releaseStep = {
    draft: h('button.primary', { onclick: setStatus('open') }, 'Freigeben'),
    open: h('button.primary', { onclick: confirmDo('PLN beenden? Danach kann niemand mehr beginnen. Laufende Abschriften enden regulär nach Ablauf der Zeit.', setStatus('closed')) }, 'Beenden'),
    closed: h('button', { onclick: setStatus('open') }, 'Wieder freigeben'),
  }[pln.status];
  const step = (n, title, text, ...actions) => h('div.pln-step', h('span.pln-step-no', n), h('div', h('strong', title), h('p', text), h('div.pln-step-actions', actions)));

  const third = s.mode === 'count' ? 'Fehlende Zeilen' : s.mode === 'percent' ? 'Fehler %' : null;
  const ntaInfo = [s.lrsTimePct ? `${s.lrsTimePct} % mehr Zeit` : '', s.mode === 'count' && s.lrsLinesPct ? `${linesFor(s, true)} statt ${s.targetLines} Zeilen` : ''].filter(Boolean).join(', ');
  const thirdCell = (r) => (r.grade == null ? '–' : s.mode === 'count' ? r.missingLines : r.grade.percent != null ? `${r.grade.percent.toLocaleString('de-DE', { minimumFractionDigits: 3 })} %` : '–');
  const stateCell = (r) =>
    r.state === 'none'
      ? h('span.muted', 'nicht begonnen')
      : r.state === 'running'
        ? h('span.tag', `schreibt bis ${time(r.end_at)}`)
        : h('span', 'abgegeben', h('span.muted.small', ` ${time(r.started_at)}`));

  append(
    app,
    h('p.pln-back', h('a', { href: `#/klasse/${pln.class_id}` }, `← Klasse ${pln.className}`), h('span.muted.small', ` · ${pln.heading}`)),
    h('div.pln-title', h('h1', pln.title), statusTag(pln.status)),
    h(
      'p.pln-rules-line',
      rulesLine(s, pln.scheme?.name),
      ' ',
      h('button.link.small', { onclick: () => { settingsForm.hidden = !settingsForm.hidden; } }, 'Bewertung einstellen')
    ),
    h('section.card.pln-edit-card', settingsForm),
    h(
      'div.pln-flow',
      step(1, 'Vorlage drucken', 'Der Text liegt nur auf Papier vor.', h('a.button.small', { href: `#/pln/${id}/vorlage` }, 'Drucken'), h('a.small', { href: `#/pln/${id}/vorlage-nta` }, 'große Schrift')),
      step(2, pln.status === 'open' ? 'Läuft' : pln.status === 'closed' ? 'Beendet' : 'Freigeben', 'Nachteilsausgleich vorher in der Tabelle ankreuzen.', releaseStep),
      step(3, 'Abschriften', `${done} abgegeben, ${running} schreiben gerade.`, h('a.button.small', { href: `/api/plns/${id}/abschriften.pdf`, download: true }, `PDF (${done})`))
    ),
    h(
      'section.card',
      h(
        'div.pln-section-head',
        h('h2', 'Teilnahme'),
        h('div.pln-head-actions', h('button.small', { onclick: reload }, 'Aktualisieren'), h('button.small.danger', { onclick: confirmDo(`PLN „${pln.title}“ mit allen Abschriften löschen?`, async () => { await del(`/api/plns/${id}`); location.hash = `#/klasse/${pln.class_id}`; }) }, 'PLN löschen'))
      ),
      h(
        'div.table-wrap',
        h(
          'table.table.pln-table',
          h(
            'thead',
            h(
              'tr',
              ['Schüler', 'Status', 'Anschläge', 'Fehler', third, 'Note', h('span', { title: `Nachteilsausgleich: ${ntaInfo}` }, 'NTA'), h('span', { title: 'Zehn-Finger-System nicht angewendet: Note 6' }, 'Ohne 10 F.'), '']
                .filter((c) => c !== null)
                .map((c) => h('th', c))
            )
          ),
          h(
            'tbody',
            rows.map((r) =>
              h(
                'tr',
                h('td', h('div', r.display_name), h('div.mono.muted.small', r.username)),
                h('td', stateCell(r), r.left_count ? h('div', h('span.tag.tag-test', { title: 'Prüfungsfenster verlassen' }, `${r.left_count}× verlassen`)) : null),
                h('td', r.gross ?? '–'),
                h('td', r.errors ?? '–'),
                third ? h('td', thirdCell(r)) : null,
                h(
                  'td',
                  r.grade
                    ? h('details.pln-grade', h('summary', h('b.pln-grade-no', r.grade.grade)), h('div.small.muted', (r.grade.steps || []).map((x) => h('div', x))))
                    : '–'
                ),
                h('td', h('input', { type: 'checkbox', checked: r.lrs, title: `Nachteilsausgleich: ${ntaInfo}`, disabled: r.state !== 'none' && s.mode !== 'count', onchange: setFlag(r, 'lrs') })),
                h('td', h('input', { type: 'checkbox', checked: r.no_touch, title: 'Zehn-Finger-System nicht angewendet: Note 6', onchange: setFlag(r, 'noTouch') })),
                h(
                  'td',
                  r.state !== 'none'
                    ? h(
                        'button.link.small',
                        {
                          title: 'Abschrift löschen, die Person kann neu beginnen (z. B. als Nachholer)',
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
      h('p.pln-hint', `NTA: Nachteilsausgleich bei LRS/Legasthenie (${ntaInfo || 'in den Einstellungen festlegen'}), vor dem Start ankreuzen. Ohne 10 F.: Note 6. Ein Klick auf die Note zeigt den Rechenweg.`)
    )
  );
  if (pln.status === 'open') {
    const timer = setTimeout(() => app.isConnected && settingsForm.hidden && reload(), 15000);
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
      h('p.pln-fill', h('b', 'Name:'), ' ________________________________   ', h('b', 'Datum:'), ' ______________'),
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
