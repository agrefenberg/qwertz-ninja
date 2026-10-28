// Kursfortschritt einer Klasse für Lehrkräfte: Übersicht je Lektion, Matrix Schüler × Lektionen,
// Freischalten von Hand und die Fehlergrenze zum Bestehen.
import { fmtNum, fmtRate, h, patch, post, toast } from '../ui.js';
import { PASS_ERROR_RATE, PASS_ERROR_RATE_MAX } from '../course.js';
import { GAMES_AFTER_DEFAULT, GAMES_ALWAYS, GAMES_OFF } from '../game-rules.js';

const STATE_LABEL = {
  passed: 'bestanden',
  open: 'frei',
  teacher: 'von dir freigeschaltet',
  locked: 'gesperrt',
};

function cellTitle(lesson, i, c) {
  const parts = [`Lektion ${i + 1} · ${lesson.title}`, STATE_LABEL[c.s]];
  if (c.s === 'passed') parts.push(`${c.stars} von 3 Sternen`);
  if (c.attempts) parts.push(`${c.attempts} ${c.attempts === 1 ? 'Versuch' : 'Versuche'}`);
  return parts.join(' · ');
}

// Kleiner Streifen mit einem Feld je Lektion, z. B. für die Schülertabelle.
export function courseMiniBar(course, lessons) {
  const passed = course.filter((c) => c.s === 'passed').length;
  return h(
    'span.course-mini',
    { title: `${passed} von ${lessons.length} Lektionen bestanden` },
    h(
      'span.course-mini-cells',
      { 'aria-hidden': 'true' },
      course.map((c, i) => h('span.cc', { class: `cc-${c.s}`, 'data-stars': c.s === 'passed' ? c.stars : null, title: cellTitle(lessons[i], i, c) }))
    ),
    h('span.course-mini-num', `${passed}/${lessons.length}`)
  );
}

function legend() {
  return h(
    'div.course-legend',
    h('span', h('span.cc.cc-passed', { 'data-stars': 3 }), 'bestanden (je dunkler, desto mehr Sterne)'),
    h('span', h('span.cc.cc-open'), 'frei, noch nicht bestanden'),
    h('span', h('span.cc.cc-teacher'), 'von dir freigeschaltet'),
    h('span', h('span.cc.cc-locked'), 'gesperrt')
  );
}

// Die Content-Security-Policy erlaubt keine style-Attribute, daher über das CSSOM.
function heightBar(spec, share) {
  const el = h(spec);
  el.style.height = `${share * 100}%`;
  return el;
}

// Säulen je Lektion: Anteil der Klasse, der bestanden hat bzw. gerade daran arbeitet.
function lessonChart(cls) {
  const n = cls.students.length;
  return h(
    'div.course-chart',
    { role: 'img', 'aria-label': 'Bestanden je Lektion' },
    cls.lessons.map((l, i) => {
      const passed = cls.students.filter((s) => s.course[i].s === 'passed').length;
      const working = cls.students.filter((s) => s.course[i].s !== 'passed' && s.course[i].s !== 'locked').length;
      return h(
        'div.course-col',
        { title: `Lektion ${i + 1} · ${l.title}: ${passed} von ${n} bestanden, ${working} frei` },
        h('span.course-col-num', passed ? String(passed) : ''),
        h('div.course-col-track', heightBar('div.course-col-open', n ? working / n : 0), heightBar('div.course-col-passed', n ? passed / n : 0)),
        h('span.course-col-label', String(i + 1))
      );
    })
  );
}

export function courseSection(cls, refresh) {
  const { students, lessons } = cls;
  const n = students.length;
  const passedCounts = students.map((s) => s.course.filter((c) => c.s === 'passed').length);
  const avg = n ? passedCounts.reduce((a, b) => a + b, 0) / n : 0;
  const finished = passedCounts.filter((c) => c === lessons.length).length;
  const started = passedCounts.filter((c) => c > 0).length;

  // Auswahl für das Freischalten mehrerer Schüler auf einmal.
  const boxes = new Map();
  const selected = () => [...boxes].filter(([, b]) => b.checked).map(([id]) => id);
  const scope = h('span', 'für alle');
  const sync = () => {
    const k = selected().length;
    scope.textContent = k ? `für ${k} ausgewählte` : 'für alle';
    all.checked = k === n;
  };
  const all = h('input', {
    type: 'checkbox',
    'aria-label': 'Alle auswählen',
    onchange: (e) => {
      for (const b of boxes.values()) b.checked = e.target.checked;
      sync();
    },
  });

  const unlock = async (body, msg) => {
    try {
      const r = await post(`/api/classes/${cls.id}/unlocks`, body);
      toast(r.changed ? msg : 'Keine Änderung');
      await refresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const cell = (s, l, i) => {
    const c = s.course[i];
    const title = cellTitle(l, i, c);
    const attrs = { class: `cc-${c.s}`, 'data-stars': c.s === 'passed' ? c.stars : null, title };
    if (c.s === 'locked') {
      return h('td', h('button.cc', { ...attrs, title: `${title} · klicken zum Freischalten`, 'aria-label': `${l.title} für ${s.display_name} freischalten`, onclick: () => unlock({ lessonId: l.id, studentIds: [s.id] }, `${l.title} für ${s.display_name} freigeschaltet`) }));
    }
    if (c.s === 'teacher') {
      return h('td', h('button.cc', { ...attrs, title: `${title} · klicken zum Zurücknehmen`, 'aria-label': `Freischaltung von ${l.title} für ${s.display_name} zurücknehmen`, onclick: () => unlock({ lessonId: l.id, studentIds: [s.id], lock: true }, `Freischaltung zurückgenommen`) }));
    }
    return h('td', h('span.cc', attrs, c.s === 'passed' && c.stars ? h('span.cc-stars', String(c.stars)) : null));
  };

  const matrix = h(
    'div.table-wrap',
    h(
      'table.course-matrix',
      h(
        'thead',
        h('tr', h('th', all), h('th.name', 'Pseudonym'), lessons.map((l, i) => h('th', { title: l.title }, String(i + 1))), h('th', 'Bestanden'))
      ),
      h(
        'tbody',
        students.map((s, k) =>
          h(
            'tr',
            h('td', (() => {
              const b = h('input', { type: 'checkbox', 'aria-label': `${s.display_name} auswählen`, onchange: sync });
              boxes.set(s.id, b);
              return b;
            })()),
            h('td.name', h('a', { href: `#/schueler/${s.id}` }, s.display_name)),
            lessons.map((l, i) => cell(s, l, i)),
            h('td.num', `${passedCounts[k]}/${lessons.length}`)
          )
        )
      )
    )
  );

  const lessonSel = h('select', { 'aria-label': 'Lektion' }, lessons.map((l, i) => h('option', { value: l.id }, `${i + 1}. ${l.title}`)));
  const upTo = h('input', { type: 'checkbox', checked: true });
  const bulk = (lock) => () => {
    const ids = selected();
    const l = lessons.find((x) => x.id === lessonSel.value);
    const what = upTo.checked ? `Lektionen 1 bis ${lessons.indexOf(l) + 1}` : `„${l.title}“`;
    const who = ids.length ? `${ids.length} ausgewählte Schüler` : 'die ganze Klasse';
    unlock({ lessonId: l.id, upTo: upTo.checked, studentIds: ids, lock }, lock ? `Freischaltung von ${what} für ${who} zurückgenommen` : `${what} für ${who} freigeschaltet`);
  };

  const rateInput = h('input', { type: 'number', min: 0, max: PASS_ERROR_RATE_MAX, step: 0.5, value: cls.passErrorRate, 'aria-label': 'Fehlergrenze in Prozent' });
  const rateForm = h(
    'form.inline-form.course-rate',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const r = await patch(`/api/classes/${cls.id}`, { passErrorRate: rateInput.value });
          toast(`Fehlergrenze: ${fmtRate(r.passErrorRate)} %${r.newlyPassed ? `, ${r.newlyPassed} Lektionen damit nachträglich bestanden` : ''}`);
          await refresh();
        } catch (err) {
          toast(err.message, 'error');
        }
      },
    },
    h('label.inline', 'Bestanden mit höchstens ', rateInput, ' % Fehlern'),
    h('button', { type: 'submit' }, 'Speichern')
  );

  return h(
    'section.card',
    h('h2', 'Kursfortschritt'),
    n
      ? [
          h(
            'div.result-grid',
            h('div', h('span.stat-value', `${fmtNum(avg, 1)}`, h('small', ` / ${lessons.length}`)), h('span.stat-label', 'Lektionen bestanden im Schnitt')),
            h('div', h('span.stat-value', `${started}`, h('small', ` / ${n}`)), h('span.stat-label', 'haben mindestens eine Lektion bestanden')),
            h('div', h('span.stat-value', `${finished}`, h('small', ` / ${n}`)), h('span.stat-label', 'haben den ganzen Kurs geschafft')),
            h('div', h('span.stat-value', `${fmtRate(cls.passErrorRate)} %`), h('span.stat-label', 'Fehlergrenze zum Bestehen'))
          ),
          h('h3', 'Bestanden je Lektion'),
          lessonChart(cls),
          h('h3', 'Jede Schülerin, jeder Schüler'),
          h('p.muted.small', 'Ein Klick auf ein gesperrtes Feld schaltet die Lektion für diese Person frei, ein weiterer Klick nimmt das zurück. Bestandene Lektionen bleiben bestanden.'),
          legend(),
          matrix,
          h('h3', 'Lektionen freischalten'),
          h(
            'div.toolbar.course-tools',
            lessonSel,
            h('label.inline', upTo, ' mit allen Lektionen davor'),
            h('button.primary', { onclick: bulk(false) }, 'Freischalten ', scope),
            h('button', { onclick: bulk(true) }, 'Zurücknehmen')
          ),
          h('p.muted.small', 'Ohne Auswahl in der Tabelle gilt das für die ganze Klasse. Freigeschaltete Lektionen können geübt werden, bestanden sind sie erst mit einem Versuch unter der Fehlergrenze.'),
        ]
      : h('p.muted', 'Noch keine Schülerzugänge.'),
    gamesSetting(cls, refresh),
    h('h3', 'Fehlergrenze'),
    h('p.muted.small', `Eine Lektion ist bestanden, wenn die Fehlerquote höchstens so hoch ist. Standard sind ${PASS_ERROR_RATE} %. Wird die Grenze großzügiger, gelten Lektionen als bestanden, deren bester Versuch schon darunter lag. Eine strengere Grenze nimmt nichts zurück.`),
    rateForm
  );
}

// Ab welcher Lektion die Lernspiele frei werden (Grundkompetenz), oder ganz aus bzw. sofort.
function gamesSetting(cls, refresh) {
  const idx = cls.lessons.findIndex((l) => l.id === cls.gamesAfter);
  const n = cls.students.length;
  const unlocked = cls.gamesAfter === GAMES_ALWAYS ? n : idx < 0 ? 0 : cls.students.filter((s) => s.course.slice(0, idx + 1).every((c) => c.s === 'passed')).length;
  const select = h(
    'select',
    {
      'aria-label': 'Spiele freischalten',
      onchange: async (e) => {
        try {
          await patch(`/api/classes/${cls.id}`, { gamesAfter: e.target.value });
          toast(e.target.value === GAMES_OFF ? 'Spiele ausgeschaltet' : 'Gespeichert');
          await refresh();
        } catch (err) {
          toast(err.message, 'error');
        }
      },
    },
    h('option', { value: GAMES_OFF }, 'Aus'),
    cls.lessons.map((l, i) => h('option', { value: l.id }, `Nach Lektion ${i + 1}: ${l.title}${l.id === GAMES_AFTER_DEFAULT ? ' (empfohlen)' : ''}`)),
    h('option', { value: GAMES_ALWAYS }, 'Sofort, ohne Voraussetzung')
  );
  select.value = cls.gamesAfter;
  return [
    h('h3', 'Spiele'),
    h(
      'p.muted.small',
      'Fallende Wörter, Tipp-Snake und Ninja-Lauf sind freiwillig und zählen nicht für Noten. Sie werden frei, wenn die gewählte Lektion und alle davor bestanden sind. Empfohlen ist „Umlaute und ß“: Dann sitzen alle Buchstaben, Großschreibung und Umlaute.'
    ),
    h('label.inline', 'Spiele freischalten ', select),
    cls.gamesAfter !== GAMES_OFF && n ? h('p.small', `${unlocked} von ${n} Schülern haben die Spiele frei.`) : null,
  ];
}
