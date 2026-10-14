import { append, fmtDate, fmtDuration, fmtNum, get, h, patch, post, sparkline, toast } from '../ui.js';
import { Trainer } from '../trainer.js';
import { randomWords, weakExercise } from '../words.js';
import { refreshMe, state } from '../app.js';

const KIND_LABEL = { text: 'Text', words: 'Wörter', weak: 'Schwachstellen', basics: 'Grundstellung', exercise: 'Aufgabe', test: 'Test' };

function speed(r, metric = state.me.prefs.metric) {
  return metric === 'wpm' ? `${fmtNum(r.wpm)} WPM` : `${fmtNum(r.apm)} Anschl./min`;
}

export function beltCard(level) {
  const span = level.next ? level.next - level.levelStart : 1;
  const pct = level.next ? Math.min(100, ((level.xp - level.levelStart) / span) * 100) : 100;
  const bar = h('div.progress-bar');
  bar.style.width = `${pct}%`;
  return h(
    'section.card.belt-card',
    h('div.belt', { 'data-level': level.level }, h('span.belt-knot')),
    h(
      'div',
      h('div.belt-title', `${level.belt}er Gürtel`, h('span.muted', ` · Level ${level.level}`)),
      h('div.progress', bar),
      h('div.muted.small', level.next ? `${fmtNum(level.xp)} von ${fmtNum(level.next)} Punkten bis zum nächsten Gürtel` : `${fmtNum(level.xp)} Punkte, höchster Gürtel erreicht`)
    )
  );
}

export async function homeView(app) {
  await refreshMe();
  const me = state.me;
  const [assignments, results, weak] = await Promise.all([get('/api/me/assignments'), get('/api/me/results'), get('/api/me/weak-keys')]);
  const open = assignments.filter((a) => !a.done && (!a.due_at || a.due_at > Date.now()));
  const recent = results.slice(0, 30).reverse();
  const values = recent.map((r) => (me.prefs.metric === 'wpm' ? r.wpm : r.apm));

  append(app, 
    h('h1', `Hallo, ${me.displayName}!`),
    beltCard(me.level),
    open.length
      ? h(
          'section.card',
          h('h2', 'Offene Aufgaben'),
          h(
            'ul.list',
            open.map((a) =>
              h(
                'li',
                h('a', { href: `#/aufgabe/${a.id}` }, h('span.tag', { class: a.type === 'test' ? 'tag-test' : null }, a.type === 'test' ? 'Test' : 'Übung'), ' ', a.title),
                a.due_at ? h('span.muted.small', ` bis ${fmtDate(a.due_at)}`) : null
              )
            )
          )
        )
      : null,
    h('h2', 'Üben'),
    h(
      'div.tiles',
      tile('#/ueben/texte', 'Texte', 'Echte Texte mit Umlauten, ß und Satzzeichen.'),
      tile('#/ueben/woerter', 'Wörter', 'Zufällige Wörter aus der Wortliste.'),
      tile(
        '#/ueben/schwachstellen',
        'Schwachstellen',
        weak.length ? h('span', 'Gezielt für: ', weak.map((w) => h('kbd', w.ch))) : 'Wird nach ein paar Übungen auf dich zugeschnitten.'
      ),
      tile('#/grundstellung', 'Grundstellung', 'Fingerzuordnung und Grundreihe wiederholen.')
    ),
    h(
      'section.card',
      h('h2', 'Dein Tempo'),
      values.length >= 2 ? sparkline(values, { label: 'Verlauf der letzten Übungen' }) : h('p.muted', 'Nach zwei Übungen siehst du hier deinen Verlauf.'),
      results[0] ? h('p.muted.small', `Zuletzt: ${speed(results[0])}, ${fmtNum(results[0].error_rate, 1)} % Fehler`) : null
    ),
    badgesSection(me)
  );
}

function tile(href, title, desc) {
  return h('a.tile', { href }, h('strong', title), h('span.muted.small', desc));
}

function badgesSection(me) {
  const earned = new Set(me.badges.map((b) => b.id));
  return h(
    'section.card',
    h('h2', `Abzeichen (${earned.size} von ${me.allBadges.length})`),
    h(
      'div.badges',
      me.allBadges.map((b) => h('div.badge', { class: earned.has(b.id) ? 'earned' : null, title: b.desc }, h('span.badge-icon', '★'), h('strong', b.name), h('span.small', b.desc)))
    )
  );
}

export async function practiceView(app, { kind }) {
  if (kind === 'texte') {
    const texts = await get('/api/texts');
    append(app, 
      h('p', h('a', { href: '#/' }, '← Zurück')),
      h('h1', 'Texte'),
      h(
        'div.tiles',
        texts.map((t) => tile(`#/ueben/text/${t.id}`, t.title, `${t.length} Zeichen${t.own ? ' · von deiner Lehrkraft' : ''}`))
      )
    );
    return;
  }
  if (kind === 'woerter') return runPractice(app, { title: 'Wortübung', kind: 'words', makeText: () => randomWords(40) });
  if (kind === 'schwachstellen') {
    const weak = await get('/api/me/weak-keys');
    return runPractice(app, {
      title: 'Schwachstellen',
      subtitle: weak.length ? h('span', 'Heute im Fokus: ', weak.map((w) => h('kbd', w.ch))) : 'Noch zu wenig Daten, es gibt erst einmal gemischte Wörter.',
      kind: 'weak',
      makeText: () => weakExercise(weak.map((w) => w.ch), 40),
    });
  }
  location.hash = '#/';
}

export async function practiceTextView(app, { id }) {
  const t = await get(`/api/texts/${encodeURIComponent(id)}`);
  return runPractice(app, { title: t.title, kind: 'text', makeText: () => t.content, back: '#/ueben/texte' });
}

// Übung mit Trainer, Einstellungen und Auswertung. fixedErrorMode sperrt den Schalter (Aufgaben).
export function runPractice(app, { title, subtitle, kind, makeText, assignmentId = null, fixedErrorMode = null, back = '#/' }) {
  const prefs = state.me.prefs;
  let errorMode = fixedErrorMode || prefs.errorMode;
  let showKeyboard = prefs.keyboard;
  let trainer;
  const holder = h('div');

  const modeSelect = h(
    'select',
    {
      disabled: !!fixedErrorMode,
      onchange: (e) => {
        errorMode = e.target.value;
        patch('/api/me/prefs', { errorMode });
        state.me.prefs.errorMode = errorMode;
        start();
      },
    },
    h('option', { value: 'continue' }, 'Fehler markieren und weitertippen'),
    h('option', { value: 'correct' }, 'Fehler erst korrigieren')
  );
  modeSelect.value = errorMode;
  const kbToggle = h('input', {
    type: 'checkbox',
    checked: showKeyboard,
    onchange: (e) => {
      showKeyboard = e.target.checked;
      patch('/api/me/prefs', { keyboard: showKeyboard });
      state.me.prefs.keyboard = showKeyboard;
      start();
    },
  });

  function start() {
    trainer?.destroy();
    trainer = new Trainer({
      text: makeText(),
      errorMode,
      showKeyboard,
      metric: prefs.metric,
      onFinish: (r) => finish(r),
    });
    holder.replaceChildren(trainer.el);
    trainer.focus();
  }

  async function finish(r) {
    try {
      const res = await post('/api/results', { kind: assignmentId ? 'exercise' : kind, assignmentId, ...r });
      holder.replaceChildren(resultPanel(res, r, { again: start, back }));
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  append(app, 
    h('p', h('a', { href: back }, '← Zurück')),
    h('h1', title),
    subtitle ? h('p.muted', subtitle) : null,
    h(
      'div.toolbar',
      h('label.inline', 'Fehlermodus ', modeSelect),
      h('label.inline', kbToggle, ' Bildschirmtastatur'),
      h('button', { onclick: start }, 'Neu starten')
    ),
    holder
  );
  start();
  state.cleanup = () => trainer?.destroy();
}

export function resultPanel(res, raw, { again, back, test = false }) {
  return h(
    'section.card.result',
    h('h2', test ? 'Test abgegeben' : raw.completed ? 'Geschafft!' : 'Übung beendet'),
    h(
      'div.result-grid',
      stat(fmtNum(res.apm), 'Anschläge/min (netto)'),
      stat(fmtNum(res.wpm), 'WPM'),
      stat(`${fmtNum(res.errorRate, 1)} %`, 'Fehlerquote'),
      stat(fmtNum(raw.errors), 'Fehler'),
      stat(fmtDuration(raw.durationMs ?? res.durationMs), 'Dauer')
    ),
    test && raw.correctedErrors ? h('p.muted.small', `${raw.correctedErrors} Fehler hast du selbst korrigiert; sie zählen nicht.`) : null,
    res.xpGain ? h('p', `+${res.xpGain} Punkte`) : null,
    res.levelUp ? h('p.highlight', `Neuer Gürtel: ${res.level.belt}! (Level ${res.level.level})`) : null,
    res.newBadges?.length ? h('div', h('p', 'Neue Abzeichen:'), h('div.badges', res.newBadges.map((b) => h('div.badge.earned', h('span.badge-icon', '★'), h('strong', b.name), h('span.small', b.desc))))) : null,
    h('div.toolbar', again ? h('button.primary', { onclick: again }, 'Nochmal') : null, h('a.button', { href: back }, 'Zurück'))
  );
}

function stat(value, label) {
  return h('div', h('span.stat-value', value), h('span.stat-label', label));
}

export async function assignmentView(app, { id }) {
  const a = await get(`/api/me/assignments/${encodeURIComponent(id)}`);
  if (a.type === 'exercise') {
    return runPractice(app, {
      title: a.title,
      subtitle: a.due_at ? `Abgabe bis ${fmtDate(a.due_at)}` : null,
      kind: 'exercise',
      assignmentId: a.id,
      makeText: () => a.text,
      fixedErrorMode: a.error_mode === 'choice' ? null : a.error_mode,
    });
  }
  return testView(app, a);
}

function testView(app, a) {
  const minutes = Math.round(a.duration_sec / 60);
  const intro = h(
    'section.card',
    h('h1', a.title),
    h(
      'ul',
      h('li', `Du hast ${a.duration_sec % 60 ? `${a.duration_sec} Sekunden` : `${minutes} Minute${minutes === 1 ? '' : 'n'}`} Zeit.`),
      h('li', 'Du darfst mit der Rücktaste korrigieren. Korrigierte Fehler zählen nicht, kosten aber Zeit.'),
      h('li', 'Die Bildschirmtastatur ist ausgeblendet.'),
      h('li', 'Du hast nur einen Versuch. Nach dem Start läuft die Zeit auch dann weiter, wenn du die Seite verlässt.')
    ),
    h('button.primary', { onclick: start }, 'Test starten')
  );
  append(app, h('p', h('a', { href: '#/' }, '← Zurück')), intro);

  let trainer;
  const warn = (e) => {
    e.preventDefault();
    e.returnValue = '';
  };

  async function start() {
    let s;
    try {
      s = await post(`/api/tests/${a.id}/start`);
    } catch (e) {
      return toast(e.message, 'error');
    }
    window.addEventListener('beforeunload', warn);
    trainer = new Trainer({
      text: s.text,
      errorMode: 'free',
      showKeyboard: false,
      timeLimitMs: s.durationSec * 1000,
      startAt: Date.now() + s.countdownMs,
      metric: state.me.prefs.metric,
      onFinish: submit,
    });
    intro.replaceWith(h('div', h('h1', a.title), trainer.el));
    trainer.focus();
  }

  async function submit(r) {
    window.removeEventListener('beforeunload', warn);
    try {
      const res = await post(`/api/tests/${a.id}/submit`, { typed: r.typed, correctedErrors: r.correctedErrors, keyStats: r.keyStats });
      trainer.el.replaceWith(resultPanel(res, { ...r, errors: res.errors, durationMs: res.durationMs }, { back: '#/', test: true }));
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  state.cleanup = () => {
    window.removeEventListener('beforeunload', warn);
    if (trainer && !trainer.finished) trainer.finish(false);
    trainer?.destroy();
  };
}

export async function leaderboardView(app) {
  const lb = await get('/api/leaderboard');
  if (!lb.enabled) {
    append(app, h('h1', 'Rangliste'), h('p.muted', 'Deine Lehrkraft hat die Rangliste für deine Klasse nicht eingeschaltet.'));
    return;
  }
  const wpm = state.me.prefs.metric === 'wpm';
  append(app, 
    h('h1', 'Rangliste'),
    h('p.muted', 'Beste Geschwindigkeit der letzten 7 Tage (Übungen ab einer Minute oder 200 Anschlägen, höchstens 5 % Fehler).'),
    h(
      'table.table',
      h('thead', h('tr', h('th', 'Platz'), h('th', 'Name'), h('th', wpm ? 'WPM' : 'Anschläge/min'), h('th', 'Gürtel'))),
      h(
        'tbody',
        lb.rows.map((r, i) =>
          h('tr', { class: r.me ? 'me' : null }, h('td', r.bestApm != null ? `${i + 1}.` : '–'), h('td', r.name), h('td', fmtNum(wpm ? r.bestWpm : r.bestApm)), h('td', r.level.belt))
        )
      )
    )
  );
}

export async function historyView(app) {
  const results = await get('/api/me/results');
  append(app, 
    h('h1', 'Verlauf'),
    results.length
      ? h(
          'table.table',
          h('thead', h('tr', h('th', 'Datum'), h('th', 'Art'), h('th', 'Dauer'), h('th', 'Anschläge/min'), h('th', 'WPM'), h('th', 'Fehler'))),
          h(
            'tbody',
            results.map((r) =>
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
      : h('p.muted', 'Noch keine Ergebnisse.')
  );
}

export async function settingsView(app) {
  const prefs = state.me.prefs;
  const save = async (change) => {
    Object.assign(state.me.prefs, await patch('/api/me/prefs', change));
    toast('Gespeichert');
  };
  const metric = h('select', { onchange: (e) => save({ metric: e.target.value }) }, h('option', { value: 'apm' }, 'Anschläge pro Minute'), h('option', { value: 'wpm' }, 'Wörter pro Minute (WPM)'));
  metric.value = prefs.metric;
  const mode = h('select', { onchange: (e) => save({ errorMode: e.target.value }) }, h('option', { value: 'continue' }, 'Fehler markieren und weitertippen'), h('option', { value: 'correct' }, 'Fehler erst korrigieren'));
  mode.value = prefs.errorMode;
  append(app, 
    h('h1', 'Einstellungen'),
    h(
      'section.card.narrow',
      h('label', 'Angezeigte Geschwindigkeit', metric),
      h('label', 'Fehlermodus beim Üben', mode),
      h('label.inline', h('input', { type: 'checkbox', checked: prefs.keyboard, onchange: (e) => save({ keyboard: e.target.checked }) }), ' Bildschirmtastatur beim Üben anzeigen'),
      h('p.muted.small', `Benutzername: ${state.me.username}. Dein Passwort kann deine Lehrkraft zurücksetzen.`),
      h('p.muted.small', `Deine Ergebnisse werden am ${new Date(state.me.purgeDate).toLocaleDateString('de-DE')} automatisch gelöscht.`)
    )
  );
}
