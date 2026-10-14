import { append, del, errorBox, fmtDate, fmtDuration, fmtNum, formData, get, h, patch, post, put, toast } from '../ui.js';
import { state } from '../app.js';
import { errorAnalysis, stars } from './student.js';

const KIND_LABEL = { text: 'Text', words: 'Wörter', weak: 'Schwachstellen', basics: 'Grundstellung', exercise: 'Aufgabe', test: 'Test' };

function back(href = '#/') {
  return h('p', h('a', { href }, '← Zurück'));
}

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

function purgeNotice() {
  const date = new Date(state.me.purgeDate);
  const days = Math.ceil((date - Date.now()) / 864e5);
  if (days > 21) return null;
  return h('p.notice', `Am ${date.toLocaleDateString('de-DE')} werden alle Ergebnisse gelöscht (Schuljahresende). Bitte vorher exportieren.`);
}

// ---------- Klassen ----------

export async function classesView(app) {
  const classes = await get('/api/classes');
  const form = h(
    'form.inline-form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(form);
        try {
          const { id } = await post('/api/classes', formData(form));
          location.hash = `#/klasse/${id}`;
        } catch (err) {
          showError(err.message);
        }
      },
    },
    h('input', { name: 'name', placeholder: 'z. B. 10b', required: true, maxlength: 40 }),
    h('button.primary', { type: 'submit' }, 'Klasse anlegen')
  );
  append(app, 
    h('h1', 'Meine Klassen'),
    purgeNotice(),
    classes.length
      ? h('div.tiles', classes.map((c) => h('a.tile', { href: `#/klasse/${c.id}` }, h('strong', c.name), h('span.muted.small', `${c.students} Schüler`))))
      : h('p.muted', 'Noch keine Klassen. Lege die erste an.'),
    h('section.card', h('h2', 'Neue Klasse'), form)
  );
}

export async function classView(app, { id }) {
  const [cls, assignments, texts, schemes] = await Promise.all([
    get(`/api/classes/${id}`),
    get(`/api/classes/${id}/assignments`),
    get('/api/texts'),
    get('/api/grading-schemes'),
  ]);
  const reload = () => {
    app.replaceChildren();
    classView(app, { id });
  };

  const createForm = h(
    'form.inline-form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(createForm);
        try {
          const res = await post(`/api/classes/${id}/students`, { count: Number(formData(createForm).count) });
          showCredentials(app, res, reload);
        } catch (err) {
          showError(err.message);
        }
      },
    },
    h('input', { name: 'count', type: 'number', min: 1, max: 40, value: 25, required: true }),
    h('button.primary', { type: 'submit' }, 'Zugänge erzeugen')
  );

  const lbToggle = h('input', {
    type: 'checkbox',
    checked: cls.leaderboard,
    onchange: async (e) => {
      await patch(`/api/classes/${id}`, { leaderboard: e.target.checked });
      toast(e.target.checked ? 'Rangliste eingeschaltet' : 'Rangliste ausgeschaltet');
    },
  });

  append(app, 
    back(),
    h('h1', `Klasse ${cls.name}`),
    purgeNotice(),
    h(
      'div.toolbar',
      h('label.inline', lbToggle, ' Rangliste für diese Klasse anzeigen'),
      h('a.button', { href: `/api/classes/${id}/export.csv`, download: true }, 'Ergebnisse exportieren (CSV)'),
      h(
        'button.danger',
        {
          onclick: confirmDo(`Klasse ${cls.name} mit allen Schülerkonten und Ergebnissen löschen?`, async () => {
            await del(`/api/classes/${id}`);
            location.hash = '#/';
          }),
        },
        'Klasse löschen'
      )
    ),
    h('section.card', h('h2', 'Aufgaben und Tests'), assignmentList(assignments, reload), assignmentForm(id, texts, schemes, reload)),
    h(
      'section.card',
      h('h2', `Schüler (${cls.students.length})`),
      cls.students.length ? studentTable(cls, reload) : h('p.muted', 'Noch keine Schülerzugänge.'),
      h('h3', 'Neue Zugänge'),
      h('p.muted.small', 'Die App erzeugt Benutzernamen mit Pseudonym und Passwort, ohne Namen oder E-Mail-Adressen. Du bekommst eine Liste zum Ausdrucken und Zerschneiden. Die Passwörter sind nur jetzt sichtbar.'),
      createForm
    )
  );
}

function studentTable(cls, reload) {
  const students = cls.students;
  const boxes = new Map();
  const selected = () => [...boxes].filter(([, b]) => b.checked).map(([id]) => id);
  const label = h('span', 'für alle');
  const sync = () => {
    const n = selected().length;
    label.textContent = n ? `für ${n} ausgewählte` : 'für alle';
    all.checked = n === students.length;
  };
  const all = h('input', {
    type: 'checkbox',
    'aria-label': 'Alle auswählen',
    onchange: (e) => {
      for (const b of boxes.values()) b.checked = e.target.checked;
      sync();
    },
  });
  const reprint = h(
    'button',
    {
      onclick: async () => {
        const ids = selected();
        const n = ids.length || students.length;
        if (!confirm(`Neuer Druckbogen ${ids.length ? `für ${n} ausgewählte Schüler` : `für alle ${n} Schüler`}?\n\nDie Passwörter werden dabei neu erzeugt, die alten gelten nicht mehr. Pseudonyme, Benutzernamen und Ergebnisse bleiben erhalten.`)) return;
        try {
          const res = await post(`/api/classes/${cls.id}/reset-passwords`, { studentIds: ids });
          showCredentials(document.getElementById('app'), res, reload);
        } catch (e) {
          toast(e.message, 'error');
        }
      },
    },
    'Druckbogen erneut erstellen ',
    label
  );
  return h(
    'div',
    h('div.toolbar', reprint, h('span.muted.small', 'Wähle einzelne Schüler aus, wenn nur deren Streifen fehlen. Die Passwörter werden dabei neu vergeben.')),
    studentRows(students, boxes, all, sync, reload, cls.lessonCount)
  );
}

function studentRows(students, boxes, all, sync, reload, lessonCount) {
  return h(
    'div.table-wrap',
    h(
      'table.table',
      h('thead', h('tr', h('th', all), h('th', 'Pseudonym'), h('th', 'Benutzername'), h('th', 'Gürtel'), h('th', 'Übungen'), h('th', 'Kurs'), h('th', 'Ø Anschl./min'), h('th', 'Ø Fehler'), h('th', 'Zuletzt aktiv'), h('th', ''))),
      h(
        'tbody',
        students.map((s) =>
          h(
            'tr',
            h('td', (() => {
              const b = h('input', { type: 'checkbox', 'aria-label': `${s.display_name} auswählen`, onchange: sync });
              boxes.set(s.id, b);
              return b;
            })()),
            h('td', h('a', { href: `#/schueler/${s.id}` }, s.display_name)),
            h('td.mono', s.username),
            h('td', s.level.belt),
            h('td', s.runs),
            h('td', `${s.lessons_passed}/${lessonCount}`),
            h('td', fmtNum(s.avg_apm)),
            h('td', s.avg_error_rate != null ? `${fmtNum(s.avg_error_rate, 1)} %` : '–'),
            h('td', fmtDate(s.last_active)),
            h(
              'td.actions',
              h(
                'button.small',
                {
                  onclick: confirmDo(`Passwort für ${s.display_name} zurücksetzen?`, async () => {
                    const res = await post(`/api/students/${s.id}/reset-password`);
                    showCredentials(document.getElementById('app'), res, reload);
                  }),
                },
                'Passwort neu'
              ),
              h('button.small.danger', { onclick: confirmDo(`Konto ${s.display_name} mit allen Ergebnissen löschen?`, async () => (await del(`/api/students/${s.id}`), reload())) }, 'Löschen')
            )
          )
        )
      )
    )
  );
}

// Druckbare Liste mit Zugangsdaten zum Zerschneiden.
function showCredentials(app, { className, credentials }, done) {
  const url = location.origin;
  const school = state.setup?.schoolName || '';
  app.replaceChildren(
    h('h1', 'Neue Zugangsdaten'),
    h('p', 'Die Passwörter werden nicht gespeichert und sind nur jetzt sichtbar. Drucke die Liste aus, schneide sie entlang der Linien und verteile die Streifen.'),
    h('div.toolbar', h('button.primary', { onclick: () => window.print() }, 'Drucken'), h('button', { onclick: done }, 'Fertig')),
    h(
      'div.print-sheet',
      credentials.map((c) =>
        h(
          'div.strip',
          h('div.strip-head', h('strong', 'QWERTZ Ninja'), h('span', [school, `Klasse ${className}`].filter(Boolean).join(' · '))),
          h('div.strip-body', h('span', 'Adresse: ', h('b.mono', url)), h('span', 'Benutzername: ', h('b.mono', c.username)), h('span', 'Passwort: ', h('b.mono', c.password))),
          h('div.strip-foot', `Pseudonym: ${c.displayName}`)
        )
      )
    )
  );
}

function assignmentList(assignments, reload) {
  if (!assignments.length) return h('p.muted', 'Noch keine Aufgaben.');
  return h(
    'ul.list',
    assignments.map((a) =>
      h(
        'li',
        h('a', { href: `#/aufgabe/${a.id}` }, h('span.tag', { class: a.type === 'test' ? 'tag-test' : null }, a.type === 'test' ? 'Test' : 'Übung'), ' ', a.title),
        h(
          'span.muted.small',
          ` · ${a.text_title}`,
          a.type === 'test' ? ` · ${fmtDuration(a.duration_sec * 1000)}` : '',
          a.scheme_name ? ` · ${a.scheme_name}` : '',
          a.due_at ? ` · bis ${fmtDate(a.due_at)}` : '',
          ` · ${a.done} erledigt`
        ),
        h('button.small.danger', { onclick: confirmDo(`"${a.title}" mit allen Ergebnissen löschen?`, async () => (await del(`/api/assignments/${a.id}`), reload())) }, 'Löschen')
      )
    )
  );
}

function assignmentForm(classId, texts, schemes, reload) {
  const typeSel = h('select', { name: 'type' }, h('option', { value: 'exercise' }, 'Übung'), h('option', { value: 'test' }, 'Test'));
  const testFields = h(
    'div.grid2',
    h('label', 'Dauer in Minuten', h('input', { name: 'durationMin', type: 'number', min: 0.5, max: 60, step: 0.5, value: 5 })),
    h(
      'label',
      'Notenschlüssel',
      h('select', { name: 'gradingSchemeId' }, h('option', { value: '' }, 'keiner'), schemes.map((s) => h('option', { value: s.id }, s.name)))
    )
  );
  const exerciseFields = h(
    'label',
    'Fehlermodus',
    h(
      'select',
      { name: 'errorMode' },
      h('option', { value: 'choice' }, 'Schüler wählen selbst'),
      h('option', { value: 'continue' }, 'Fehler markieren und weitertippen'),
      h('option', { value: 'correct' }, 'Fehler erst korrigieren')
    )
  );
  const sync = () => {
    testFields.hidden = typeSel.value !== 'test';
    exerciseFields.hidden = typeSel.value === 'test';
  };
  typeSel.addEventListener('change', sync);
  sync();

  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(form);
        const d = formData(form);
        try {
          await post(`/api/classes/${classId}/assignments`, {
            type: d.type,
            title: d.title,
            textId: Number(d.textId),
            durationSec: Math.round(Number(d.durationMin) * 60),
            gradingSchemeId: d.gradingSchemeId ? Number(d.gradingSchemeId) : null,
            errorMode: d.errorMode,
            dueAt: d.dueAt ? new Date(d.dueAt).toISOString() : null,
          });
          toast('Aufgabe angelegt');
          reload();
        } catch (err) {
          showError(err.message);
        }
      },
    },
    h('h3', 'Neue Aufgabe'),
    h(
      'div.grid2',
      h('label', 'Art', typeSel),
      h('label', 'Titel', h('input', { name: 'title', required: true, maxlength: 120, placeholder: 'z. B. Lernzielkontrolle 1' }))
    ),
    h('label', 'Text', h('select', { name: 'textId', required: true }, texts.map((t) => h('option', { value: t.id }, `${t.title}${t.own ? ' (eigener Text)' : ''} · ${t.length} Zeichen`)))),
    testFields,
    exerciseFields,
    h('label', 'Frist (optional)', h('input', { name: 'dueAt', type: 'datetime-local' })),
    h('p.muted.small', 'Tests: fester Text, Zeitlimit, Korrektur erlaubt (korrigierte Fehler zählen nicht), keine Bildschirmtastatur, ein Versuch. Der Text sollte lang genug für die Dauer sein.'),
    h('button.primary', { type: 'submit' }, 'Aufgabe anlegen')
  );
  return form;
}

// ---------- Ergebnisse einer Aufgabe ----------

export async function assignmentResultsView(app, { id }) {
  const { assignment: a, rows } = await get(`/api/assignments/${id}/results`);
  const reload = () => {
    app.replaceChildren();
    assignmentResultsView(app, { id });
  };
  const isTest = a.type === 'test';
  const status = (r) => (r.created_at ? 'abgegeben' : r.started_at ? 'begonnen' : 'offen');
  append(app, 
    back(`#/klasse/${a.class_id}`),
    h('h1', a.title),
    h(
      'p.muted',
      isTest ? `Test · ${fmtDuration(a.duration_sec * 1000)}` : 'Übung',
      a.scheme ? ` · Notenschlüssel: ${a.scheme.name}` : '',
      a.due_at ? ` · Frist ${fmtDate(a.due_at)}` : ''
    ),
    h(
      'div.table-wrap',
      h(
        'table.table',
        h(
          'thead',
          h(
            'tr',
            h('th', 'Pseudonym'),
            h('th', 'Status'),
            h('th', 'Anschl./min'),
            h('th', 'WPM'),
            h('th', 'Fehler'),
            h('th', 'Dauer'),
            a.scheme ? h('th', 'Note (Vorschlag)') : null,
            isTest ? h('th', '') : null
          )
        ),
        h(
          'tbody',
          rows.map((r) =>
            h(
              'tr',
              h('td', r.display_name),
              h('td', status(r)),
              h('td', fmtNum(r.apm)),
              h('td', fmtNum(r.wpm)),
              h('td', r.errors != null ? `${r.errors} (${fmtNum(r.error_rate, 1)} %)` : '–'),
              h('td', r.duration_ms ? fmtDuration(r.duration_ms) : '–'),
              a.scheme ? h('td', r.grade ? h('span', h('strong', r.grade.grade), h('span.muted.small', ` (${fmtNum(r.grade.netApm)} netto)`)) : '–') : null,
              isTest
                ? h(
                    'td',
                    r.started_at
                      ? h(
                          'button.small',
                          { onclick: confirmDo(`Versuch von ${r.display_name} zurücksetzen? Das Ergebnis wird gelöscht.`, async () => (await del(`/api/assignments/${a.id}/attempts/${r.user_id}`), reload())) },
                          'Zurücksetzen'
                        )
                      : null
                  )
                : null
            )
          )
        )
      )
    ),
    a.scheme
      ? h(
          'p.muted.small',
          `Notenschlüssel: Note 1 ab ${a.scheme.thresholds[0]}, 2 ab ${a.scheme.thresholds[1]}, 3 ab ${a.scheme.thresholds[2]}, 4 ab ${a.scheme.thresholds[3]}, 5 ab ${a.scheme.thresholds[4]} Netto-Anschlägen pro Minute`,
          a.scheme.error_penalty ? `, je Fehler ${a.scheme.error_penalty} Anschläge Abzug.` : '.'
        )
      : null
  );
}

// ---------- Einzelne Schüler ----------

export async function studentView(app, { id }) {
  const s = await get(`/api/students/${id}/results`);
  append(app, 
    h('p', h('button.link', { onclick: () => history.back() }, '← Zurück')),
    h('h1', s.displayName),
    h('p.muted.mono', s.username),
    h('h2', 'Kurs'),
    h(
      'p',
      `${s.course.filter((l) => l.passed).length} von ${s.course.length} Lektionen bestanden. `,
      s.course.filter((l) => l.passed).map((l) => h('span.word-chip', l.title, ' ', stars(l.stars)))
    ),
    h('h2', 'Fehleranalyse'),
    errorAnalysis(s.errors, { practice: false }),
    h('h2', 'Ergebnisse'),
    s.results.length
      ? h(
          'div.table-wrap',
          h(
            'table.table',
            h('thead', h('tr', h('th', 'Datum'), h('th', 'Art'), h('th', 'Dauer'), h('th', 'Anschl./min'), h('th', 'WPM'), h('th', 'Fehler'))),
            h(
              'tbody',
              s.results.map((r) =>
                h(
                  'tr',
                  h('td', fmtDate(r.created_at)),
                  h('td', KIND_LABEL[r.kind] || r.kind, r.assignment_title ? h('span.muted.small', ` · ${r.assignment_title}`) : null),
                  h('td', fmtDuration(r.duration_ms)),
                  h('td', fmtNum(r.apm)),
                  h('td', fmtNum(r.wpm)),
                  h('td', `${r.errors} (${fmtNum(r.error_rate, 1)} %)`)
                )
              )
            )
          )
        )
      : h('p.muted', 'Noch keine Ergebnisse.')
  );
}

// ---------- Texte ----------

export async function textsView(app) {
  const texts = await get('/api/texts');
  const reload = () => {
    app.replaceChildren();
    textsView(app);
  };
  const own = texts.filter((t) => t.own);
  const builtin = texts.filter((t) => !t.own);

  function editor(t = null) {
    const form = h(
      'form',
      {
        onsubmit: async (e) => {
          e.preventDefault();
          const showError = errorBox(form);
          try {
            if (t) await put(`/api/texts/${t.id}`, formData(form));
            else await post('/api/texts', formData(form));
            toast('Text gespeichert');
            reload();
          } catch (err) {
            showError(err.message);
          }
        },
      },
      h('h2', t ? 'Text bearbeiten' : 'Neuer Text'),
      h('label', 'Titel', h('input', { name: 'title', required: true, maxlength: 120, value: t?.title })),
      h('label', 'Text', h('textarea', { name: 'content', rows: 8, required: true, minlength: 20, maxlength: 20000 }, t?.content ?? '')),
      h('p.muted.small', 'Zeilenumbrüche werden zu Leerzeichen. Typografische Anführungszeichen werden durch " ersetzt.'),
      h('div.toolbar', h('button.primary', { type: 'submit' }, 'Speichern'), t ? h('button', { type: 'button', onclick: reload }, 'Abbrechen') : null)
    );
    return h('section.card', form);
  }

  const editorSlot = h('div', editor());
  append(app, 
    h('h1', 'Texte'),
    h('h2', 'Eigene Texte'),
    own.length
      ? h(
          'ul.list',
          own.map((t) =>
            h(
              'li',
              h('strong', t.title),
              h('span.muted.small', ` · ${t.length} Zeichen `),
              h('button.small', { onclick: async () => editorSlot.replaceChildren(editor(await get(`/api/texts/${t.id}`))) }, 'Bearbeiten'),
              h('button.small.danger', { onclick: confirmDo(`Text "${t.title}" löschen? Aufgaben mit diesem Text werden ebenfalls gelöscht.`, async () => (await del(`/api/texts/${t.id}`), reload())) }, 'Löschen')
            )
          )
        )
      : h('p.muted', 'Noch keine eigenen Texte. Deine Klassen sehen eigene Texte zusätzlich zur Textsammlung.'),
    editorSlot,
    h('h2', 'Mitgelieferte Textsammlung'),
    h('ul.list', builtin.map((t) => h('li', t.title, h('span.muted.small', ` · ${t.length} Zeichen`))))
  );
}

// ---------- Notenschlüssel ----------

export async function schemesView(app) {
  const schemes = await get('/api/grading-schemes');
  const reload = () => {
    app.replaceChildren();
    schemesView(app);
  };
  const defaults = [240, 200, 160, 120, 80];
  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(form);
        const d = formData(form);
        try {
          await post('/api/grading-schemes', {
            name: d.name,
            errorPenalty: Number(d.errorPenalty || 0),
            thresholds: [1, 2, 3, 4, 5].map((g) => Number(d[`g${g}`])),
          });
          toast('Notenschlüssel gespeichert');
          reload();
        } catch (err) {
          showError(err.message);
        }
      },
    },
    h('h2', 'Neuer Notenschlüssel'),
    h('label', 'Name', h('input', { name: 'name', required: true, maxlength: 80, placeholder: 'z. B. 10. Klasse, 2. Halbjahr' })),
    h('p.muted.small', 'Mindestens nötige Netto-Anschläge pro Minute je Note. Darunter gibt es eine 6.'),
    h('div.grid5', [1, 2, 3, 4, 5].map((g) => h('label', `Note ${g} ab`, h('input', { name: `g${g}`, type: 'number', min: 0, max: 2000, value: defaults[g - 1], required: true })))),
    h('label', 'Abzug je Fehler (Anschläge)', h('input', { name: 'errorPenalty', type: 'number', min: 0, max: 1000, value: 0 })),
    h('p.muted.small', 'Netto-Anschläge = richtige Anschläge minus Fehler × Abzug, geteilt durch die Testdauer in Minuten. Die App schlägt die Note nur vor.'),
    h('button.primary', { type: 'submit' }, 'Speichern')
  );
  append(app, 
    h('h1', 'Notenschlüssel'),
    schemes.length
      ? h(
          'table.table',
          h('thead', h('tr', h('th', 'Name'), [1, 2, 3, 4, 5].map((g) => h('th', `Note ${g}`)), h('th', 'Fehlerabzug'), h('th', ''))),
          h(
            'tbody',
            schemes.map((s) =>
              h(
                'tr',
                h('td', s.name),
                s.thresholds.map((t) => h('td', `ab ${t}`)),
                h('td', s.error_penalty),
                h('td', h('button.small.danger', { onclick: confirmDo(`Notenschlüssel "${s.name}" löschen?`, async () => (await del(`/api/grading-schemes/${s.id}`), reload())) }, 'Löschen'))
              )
            )
          )
        )
      : h('p.muted', 'Noch kein Notenschlüssel angelegt.'),
    h('section.card', form)
  );
}

// ---------- Konto ----------

export function accountView(app) {
  const form = h(
    'form.card.narrow',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(form);
        const d = formData(form);
        if (d.next !== d.next2) return showError('Die neuen Passwörter stimmen nicht überein.');
        try {
          await post('/api/me/password', d);
          form.reset();
          showError('');
          toast('Passwort geändert');
        } catch (err) {
          showError(err.message);
        }
      },
    },
    h('h2', 'Passwort ändern'),
    h('label', 'Aktuelles Passwort', h('input', { name: 'current', type: 'password', required: true, autocomplete: 'current-password' })),
    h('label', 'Neues Passwort (mindestens 10 Zeichen)', h('input', { name: 'next', type: 'password', required: true, minlength: 10, autocomplete: 'new-password' })),
    h('label', 'Neues Passwort wiederholen', h('input', { name: 'next2', type: 'password', required: true, minlength: 10, autocomplete: 'new-password' })),
    h('button.primary', { type: 'submit' }, 'Ändern')
  );
  append(app, h('h1', 'Konto'), h('p.muted', `Angemeldet als ${state.me.username}.`), form);
}
