// PLN: Praktischer Leistungsnachweis, 10-Minuten-Abschrift von einer Papiervorlage.
import { append, del, errorBox, fmtDate, fmtNum, formData, get, h, patch, post, toast } from '../ui.js';
import { state } from '../app.js';

export const PLN_TITLE = 'PLN Praktischer Leistungsnachweis 10-Minuten-Abschrift';
const FORMAT_LABEL = {
  lines: 'Mit Zeilen- und Anschlagsangaben',
  plain: 'Normaler Fließtext (ab dem letzten PLN der 7. Jahrgangsstufe)',
};
const RETURN_LABEL = {
  first: 'Erster Return ein Fehler, weitere als Wiederholungsfehler',
  each: 'Jeder Return ein Fehler',
};
const STATUS_LABEL = { draft: 'Vorbereitet', open: 'Freigegeben', closed: 'Beendet' };

const time = (ms) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

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
                h('span.muted.small', ` · ${STATUS_LABEL[p.status]} · ${p.started} begonnen · Note 1 ab ${fmtNum(p.note1_chars)} Anschlägen`)
              )
            )
          )
        : h('p.muted', 'Noch kein PLN angelegt.')
    );
  };
  load();

  const longFirst = [...texts].sort((a, b) => b.length - a.length);
  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(form);
        const d = formData(form);
        try {
          const { id } = await post(`/api/classes/${classId}/plns`, {
            title: d.title,
            gradingSchemeId: Number(d.gradingSchemeId) || null,
            textId: Number(d.textId),
            format: d.format,
            returnRule: d.returnRule,
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
        'Notenschlüssel',
        schemes.length
          ? h('select', { name: 'gradingSchemeId', required: true }, schemes.map((s) => h('option', { value: s.id }, `${s.name} · Note 1 ab ${s.thresholds[0]} Anschl./min`)))
          : h('span.muted.small', h('br'), 'Bitte zuerst unter „Notenschlüssel“ einen anlegen.')
      )
    ),
    h(
      'label',
      'Text',
      h('select', { name: 'textId', required: true }, longFirst.map((t) => h('option', { value: t.id }, `${t.title}${t.own ? ' (eigener Text)' : ''} · ${t.length} Zeichen`))),
      h('span.muted.small', 'Ist der Text kürzer als nötig, hängt die App weitere Texte an, damit niemand vor Ablauf der 10 Minuten fertig ist.')
    ),
    h(
      'div.grid2',
      h('label', 'Vorlage', h('select', { name: 'format' }, Object.entries(FORMAT_LABEL).map(([v, l]) => h('option', { value: v }, l)))),
      h('label', 'Returntaste', h('select', { name: 'returnRule' }, Object.entries(RETURN_LABEL).map(([v, l]) => h('option', { value: v }, l))))
    ),
    h('button.primary', { type: 'submit', disabled: !schemes.length }, 'PLN anlegen')
  );
  return h(
    'section.card',
    h('h2', 'PLN Praktischer Leistungsnachweis'),
    h('p.muted.small', '10-Minuten-Abschrift: Die Schülerinnen und Schüler schreiben von einer ausgedruckten Vorlage ab. Nach 10 Minuten wird der Stand unverändert gespeichert.'),
    list,
    form
  );
}

// ---------- Lehrkraft: ein PLN ----------

export async function plnView(app, { id }) {
  const data = await get(`/api/plns/${id}`);
  const { pln, rows } = data;
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

  const statusButtons = {
    draft: [h('button.primary', { onclick: setStatus('open') }, 'Für Schüler freigeben')],
    open: [h('button.primary', { onclick: confirmDo('PLN beenden? Danach kann niemand mehr beginnen. Laufende Abschriften enden regulär nach 10 Minuten.', setStatus('closed')) }, 'PLN beenden')],
    closed: [h('button', { onclick: setStatus('open') }, 'Wieder freigeben')],
  }[pln.status];

  append(
    app,
    h('p', h('a', { href: `#/klasse/${pln.class_id}` }, `← Klasse ${pln.className}`)),
    h('p.pln-kicker', PLN_TITLE),
    h('h1', pln.title),
    h(
      'div.chips',
      h('span.chip', h('b', STATUS_LABEL[pln.status])),
      h('span.chip', FORMAT_LABEL[pln.format]),
      h('span.chip', `Returntaste: ${RETURN_LABEL[pln.return_rule]}`),
      pln.scheme ? h('span.chip', `Notenschlüssel: ${pln.scheme.name}`) : null,
      h('span.chip', `Note 1 ab ${fmtNum(pln.note1_chars)} Anschlägen`)
    ),
    h(
      'section.card',
      h('h2', 'Ablauf'),
      h(
        'ol.steps',
        h('li', h('a', { href: `#/pln/${id}/vorlage` }, 'Vorlage drucken'), ' und austeilen. Der Text erscheint bei den Schülern nicht am Bildschirm.'),
        h('li', 'PLN freigeben. Jede Schülerin und jeder Schüler startet selbst und hat ab dem Start genau 10 Minuten.'),
        h('li', 'Nach 10 Minuten wird der Stand unverändert gespeichert. Danach die Abschriften als PDF herunterladen.')
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
          h('thead', h('tr', ['Pseudonym', 'Benutzername', 'Status', 'Beginn', 'Anschläge', 'Fehler', 'Note (Vorschlag)', ''].map((c) => h('th', c)))),
          h(
            'tbody',
            rows.map((r) =>
              h(
                'tr',
                h('td', r.display_name),
                h('td.mono', r.username),
                h('td', r.state === 'none' ? h('span.muted', 'nicht begonnen') : r.state === 'running' ? h('span.tag', `schreibt bis ${time(r.started_at + 600000)}`) : 'abgegeben'),
                h('td', r.started_at ? fmtDate(r.started_at) : '–'),
                h('td', r.gross ?? '–'),
                h('td', r.errors ?? '–'),
                h('td', r.grade ? h('b', r.grade.grade) : '–'),
                h(
                  'td',
                  r.state !== 'none'
                    ? h(
                        'button.small',
                        {
                          onclick: confirmDo(`Abschrift von ${r.display_name} löschen? Die Person kann den PLN danach neu beginnen.`, async () => {
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
      )
    )
  );
  if (pln.status === 'open') {
    const timer = setTimeout(() => app.isConnected && reload(), 15000);
    state.cleanup = () => clearTimeout(timer);
  }
}

// ---------- Lehrkraft: Druckvorlage ----------

export async function plnSheetView(app, { id }) {
  const { pln, schoolName } = await get(`/api/plns/${id}`);
  const text = pln.text;
  const pos = pln.note1_pos;
  const marker = () => h('span.mark1', 'Note 1');
  // Text mit Note-1-Markierung hinter dem Wort, in dem die Grenze liegt.
  const withMarker = (s, offset) => {
    if (pos < offset || pos > offset + s.length) return s;
    const cut = pos - offset;
    return [s.slice(0, cut), marker(), s.slice(cut)];
  };

  let body;
  if (pln.format === 'lines') {
    const lines = templateLines(text);
    body = h(
      'table.pln-lines',
      h('thead', h('tr', h('th', 'Zeile'), h('th', 'Text'), h('th', 'Anschläge'))),
      h('tbody', lines.map((l) => h('tr', h('td.no', l.no), h('td.txt', withMarker(l.text, l.start)), h('td.no', l.end))))
    );
  } else {
    body = h('p.pln-plain', withMarker(text, 0));
  }

  append(
    app,
    h(
      'div.toolbar.no-print',
      h('a', { href: `#/pln/${id}` }, '← Zurück'),
      h('button.primary', { onclick: () => window.print() }, 'Drucken'),
      h('span.muted.small', 'Gedruckt wird in 12 Punkt mit eineinhalbfachem Zeilenabstand.')
    ),
    h(
      'article.pln-sheet',
      h('h1', PLN_TITLE),
      h('p.pln-meta', [schoolName, `Klasse ${pln.className}`, pln.title].filter(Boolean).join(' · ')),
      h('p.pln-fill', 'Pseudonym: ________________________   Datum: ______________'),
      h(
        'ul.pln-hints',
        h('li', h('b', 'Es ist ein Fließtext im Zehn-Finger-System zu schreiben.')),
        h('li', 'Für die Note 1 musst du mindestens bis zur Markierung ', marker(), ` schreiben (${fmtNum(pln.note1_chars)} Anschläge in 10 Minuten, fehlerfrei).`),
        h('li', 'Die Returntaste nicht benutzen: Am Zeilenende einfach mit einem Leerzeichen weiterschreiben.'),
        h('li', 'Der Nummernblock darf verwendet werden. Korrigieren mit der Rücktaste ist erlaubt.'),
        h('li', 'Du hast ab dem Start genau 10 Minuten. Danach wird dein Text automatisch gespeichert.')
      ),
      body
    )
  );
}

// Gleiche Zeilenaufteilung wie auf dem Server (server/pln.js).
function templateLines(text, width = 62) {
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
    total += line.length + (i < lines.length - 1 ? 1 : 0);
    return { no: i + 1, text: line, start, end: total };
  });
}

// ---------- Schülerin oder Schüler ----------

export async function studentPlnView(app, { id }) {
  const s = await get(`/api/me/plns/${id}`);
  const head = [h('p.pln-kicker', PLN_TITLE), h('h1', s.title)];

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
          h('li', h('b', 'Du hast genau 10 Minuten.'), ' Danach wird dein Text automatisch gespeichert. Du kannst nur einmal beginnen.')
        ),
        h(
          'button.primary.big',
          {
            onclick: async (e) => {
              e.target.disabled = true;
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
  const clock = h('span.pln-clock', '10:00');
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
  append(app, ...head, h('div.pln-bar', clock, status), h('div.pln-stage', area, overlay));

  let lastSent = null;
  let finished = false;
  const save = async (final = false) => {
    const typed = area.value;
    if (!final && typed === lastSent) return;
    try {
      await post(`/api/me/plns/${s.id}/save`, { typed, final });
      lastSent = typed;
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
      overlay.replaceChildren(h('strong', 'Speichern nicht möglich'), h('span', e.message));
    }
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
    clock.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
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
    if (!finished) save();
  };
}

// Für die Startseite der Lernenden.
export function openPlnCards(plns) {
  return plns
    .filter((p) => !p.done && p.status === 'open')
    .map((p) => h('a.suggestion.pln-card', { href: `#/pln/${p.id}` }, h('span.pill-label', 'Prüfung'), h('strong', PLN_TITLE), h('span', p.title), h('span.button.go', 'Zum PLN')));
}
