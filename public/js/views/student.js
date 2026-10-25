import { openPlnCards } from './pln.js';
import { append, errorBox, fmtDate, fmtDuration, fmtNum, fmtRate, formData, get, h, patch, post, sparkline, toast } from '../ui.js';
import { Trainer } from '../trainer.js';
import { contrastExercise, randomWords, weakExercise, wordsExercise } from '../words.js';
import { LESSONS, lessonById } from '../course.js';
import { FINGER_NAMES, fingerFor } from '../layout.js';
import { refreshMe, route, state } from '../app.js';

const KIND_LABEL = { text: 'Text', words: 'Wörter', weak: 'Schwachstellen', basics: 'Grundstellung', exercise: 'Aufgabe', test: 'Test', course: 'Kurs', focus: 'Fehlertraining' };

function speed(r, metric = state.me.prefs.metric) {
  return metric === 'wpm' ? `${fmtNum(r.wpm)} WPM` : `${fmtNum(r.apm)} Anschl./min`;
}

export function beltCard(level) {
  const span = level.next ? level.next - level.levelStart : 1;
  const pct = level.next ? Math.min(100, ((level.xp - level.levelStart) / span) * 100) : 100;
  const bar = h('div.progress-bar');
  bar.style.width = `${pct}%`;
  return h(
    'div.belt-card',
    h('div.belt', { 'data-level': level.level }, h('span.belt-knot')),
    h(
      'div',
      h('div.belt-title', `${level.belt}er Gürtel`, h('span.belt-level', ` · Level ${level.level}`)),
      h('div.progress', bar),
      h('div.small.belt-xp', level.next ? `${fmtNum(level.xp)} von ${fmtNum(level.next)} Punkten bis zum nächsten Gürtel` : `${fmtNum(level.xp)} Punkte, höchster Gürtel erreicht`)
    )
  );
}

function heroCard(me, { exercises, best, passed, lessons }) {
  return h(
    'section.hero',
    h('img.hero-ninja', { src: '/img/ninja.svg', alt: '' }),
    h('div.hero-main', h('h1', `Hallo, ${me.displayName}!`), beltCard(me.level)),
    h(
      'div.hero-stats',
      h('div', h('span.hero-num', fmtNum(exercises)), h('span.hero-label', 'Übungen')),
      h('div', h('span.hero-num', best ? fmtNum(best) : '–'), h('span.hero-label', me.prefs.metric === 'wpm' ? 'Bestes WPM' : 'Bestes Tempo')),
      h('div', h('span.hero-num', `${passed}`, h('small', `/${lessons}`)), h('span.hero-label', 'Lektionen'))
    )
  );
}

export async function homeView(app) {
  await refreshMe();
  const me = state.me;
  const [assignments, results, weak, course, profile, plns] = await Promise.all([
    get('/api/me/assignments'),
    get('/api/me/results'),
    get('/api/me/weak-keys'),
    get('/api/me/course'),
    get('/api/me/errors'),
    get('/api/me/plns'),
  ]);
  const tip = suggestion(course, profile);
  const passedLessons = course.lessons.filter((l) => l.passed).length;
  const open = assignments.filter((a) => !a.done && (!a.due_at || a.due_at > Date.now()));
  const recent = results.slice(0, 30).reverse();
  const values = recent.map((r) => (me.prefs.metric === 'wpm' ? r.wpm : r.apm));

  append(app, 
    heroCard(me, {
      exercises: results.length,
      best: Math.max(0, ...results.map((r) => (me.prefs.metric === 'wpm' ? r.wpm : r.apm))),
      passed: passedLessons,
      lessons: course.lessons.length,
    }),
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
    openPlnCards(plns),
    h(
      'a.suggestion',
      { href: tip.href },
      h('span.pill-label', 'Empfohlen für dich'),
      h('strong', tip.title),
      h('span', tip.text),
      h('span.button.go', 'Los geht’s')
    ),
    h('h2', 'Üben'),
    h(
      'div.tiles',
      tile('#/kurs', 'Kurs', `${passedLessons} von ${course.lessons.length} Lektionen bestanden. Schritt für Schritt aufbauend.`),
      tile('#/fehler', 'Meine Fehler', profile.confusions.length || profile.weakKeys.length ? 'Deine typischen Fehler und Übungen dazu.' : 'Wird nach ein paar Übungen gefüllt.'),
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
export function runPractice(app, { title, subtitle, kind, makeText, assignmentId = null, fixedErrorMode = null, back = '#/', extra = {} }) {
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
      const res = await post('/api/results', { kind: assignmentId ? 'exercise' : kind, assignmentId, ...extra, ...r });
      holder.replaceChildren(resultPanel(res, r, { again: start, back }));
    } catch (e) {
      // Das Ergebnis bleibt erhalten, bis es angekommen ist.
      holder.replaceChildren(
        h(
          'section.card.save-problem',
          { role: 'alert' },
          h('h2', 'Ergebnis nicht gespeichert'),
          h('p', e.message),
          h('div.toolbar', h('button.primary', { onclick: () => finish(r) }, 'Erneut senden'), h('button', { onclick: start }, 'Verwerfen und neu starten'))
        )
      );
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
    res.course ? courseOutcome(res.course) : null,
    res.xpGain ? h('p', `+${res.xpGain} Punkte`) : null,
    res.levelUp ? h('p.highlight', `Neuer Gürtel: ${res.level.belt}! (Level ${res.level.level})`) : null,
    res.newBadges?.length ? h('div', h('p', 'Neue Abzeichen:'), h('div.badges', res.newBadges.map((b) => h('div.badge.earned', h('span.badge-icon', '★'), h('strong', b.name), h('span.small', b.desc))))) : null,
    h('div.toolbar', again ? h('button.primary', { onclick: again }, 'Nochmal') : null, h('a.button', { href: back }, 'Zurück'))
  );
}

function courseOutcome(c) {
  if (!c.passed) {
    return h('p.notice', `Noch nicht bestanden: Für die nächste Lektion brauchst du höchstens ${fmtRate(c.passErrorRate)} % Fehler. Lass dir Zeit, Genauigkeit geht vor Tempo.`);
  }
  return h(
    'div',
    h('p.highlight', `${'★'.repeat(c.stars)}${'☆'.repeat(3 - c.stars)} Lektion bestanden!`),
    c.newlyPassed && c.next ? h('p', h('a.button.primary', { href: `#/kurs/${c.next.id}` }, `Weiter: ${c.next.title}`)) : null,
    c.newlyPassed && !c.next ? h('p', 'Du hast den ganzen Kurs geschafft!') : null
  );
}

export function stars(n) {
  return h('span.stars', { 'aria-label': `${n} von 3 Sternen` }, '★'.repeat(n), h('span.stars-off', '☆'.repeat(3 - n)));
}

// ---------- Kurs ----------

export async function courseView(app) {
  const { lessons, passErrorRate } = await get('/api/me/course');
  const done = lessons.filter((l) => l.passed).length;
  append(
    app,
    h('p', h('a', { href: '#/' }, '← Zurück')),
    h('h1', 'Kurs'),
    h('p.muted', `Die Lektionen bauen aufeinander auf. Mit höchstens ${fmtRate(passErrorRate)} % Fehlern ist eine Lektion bestanden und die nächste wird frei. Für mehr Sterne zählt dann auch das Tempo.`),
    h('p', `${done} von ${lessons.length} Lektionen bestanden`),
    h(
      'ol.lessons',
      lessons.map((l, i) =>
        h(
          'li',
          { class: l.passed ? 'passed' : l.unlocked ? 'open' : 'locked' },
          h('span.lesson-no', String(i + 1)),
          h(
            'div.lesson-body',
            l.unlocked ? h('a', { href: `#/kurs/${l.id}` }, h('strong', l.title)) : h('strong', l.title),
            h('span.muted.small', l.goal)
          ),
          h('div.lesson-meta', l.passed ? stars(l.stars) : l.unlockedByTeacher ? h('span.tag', 'von deiner Lehrkraft freigeschaltet') : l.unlocked ? h('span.tag', 'offen') : h('span.muted.small', 'gesperrt'), l.bestApm ? h('span.muted.small', `${fmtNum(l.bestApm)} Anschl./min`) : null)
        )
      )
    )
  );
}

export async function lessonView(app, { id }) {
  const lesson = lessonById(id);
  if (!lesson) return (location.hash = '#/kurs');
  const { lessons } = await get('/api/me/course');
  const info = lessons.find((l) => l.id === id);
  if (!info.unlocked) {
    append(app, h('p', h('a', { href: '#/kurs' }, '← Zurück')), h('h1', lesson.title), h('p.muted', 'Diese Lektion wird frei, sobald du die vorherige bestanden hast.'));
    return;
  }
  const no = LESSONS.indexOf(lesson) + 1;
  return runPractice(app, {
    title: `Lektion ${no}: ${lesson.title}`,
    subtitle: lesson.goal,
    kind: 'course',
    extra: { lessonId: lesson.id },
    makeText: lesson.make,
    back: '#/kurs',
  });
}

// ---------- Fehleranalyse ----------

export function confusionHint(expected, typed) {
  const show = (c) => (c === ' ' ? 'Leertaste' : `„${c}“`);
  if (expected === ' ') return 'Leerzeichen fehlt: Wortende abwarten, dann mit dem Daumen.';
  if (typed === ' ') return 'Leerzeichen zu früh: das Wort erst fertig schreiben.';
  if (expected.toLowerCase() === typed.toLowerCase()) return 'Groß- und Kleinschreibung: Umschalttaste mit dem kleinen Finger der anderen Hand.';
  const fe = fingerFor(expected);
  const ft = fingerFor(typed);
  if (!fe || !ft) return `${show(typed)} statt ${show(expected)}.`;
  if (fe === ft) return `Gleicher Finger (${FINGER_NAMES[fe]}), andere Taste: auf den Weg aus der Grundstellung achten.`;
  if (fe[0] === ft[0]) return `Benachbarte Finger: ${show(expected)} tippt der ${FINGER_NAMES[fe].replace(/er (?=.*finger)/gi, 'e ')}.`;
  return `Hände vertauscht: ${show(expected)} tippt der ${FINGER_NAMES[fe].replace(/er (?=.*finger)/gi, 'e ')}.`;
}

export function errorAnalysis(profile, { practice = true } = {}) {
  const { weakKeys, confusions, words } = profile;
  if (!weakKeys.length && !confusions.length && !words.length) {
    return h('p.muted', 'Noch zu wenig Daten. Nach ein paar Übungen siehst du hier deine typischen Fehler.');
  }
  const showCh = (c) => h('kbd', c === ' ' ? '␣' : c);
  return h(
    'div.analysis',
    weakKeys.length
      ? h(
          'section.card',
          h('h2', 'Schwache Tasten'),
          h(
            'ul.list',
            weakKeys.map((k) =>
              h(
                'li',
                showCh(k.ch),
                bar(k.rate, Math.max(...weakKeys.map((x) => x.rate))),
                h('span', `${fmtNum(k.rate, 1)} % Fehler`),
                h('span.muted.small', `${k.total} Anschläge · ${FINGER_NAMES[fingerFor(k.ch)] || ''}`)
              )
            )
          ),
          practice ? h('a.button.primary', { href: `#/ueben/fokus/${encodeURIComponent(weakKeys.slice(0, 5).map((k) => k.ch).join(''))}` }, 'Diese Tasten gezielt üben') : null
        )
      : null,
    confusions.length
      ? h(
          'section.card',
          h('h2', 'Typische Verwechslungen'),
          h(
            'ul.list',
            confusions.map((c) =>
              h(
                'li',
                h('span', showCh(c.typed), ' statt ', showCh(c.expected)),
                h('span.muted.small', `${c.count}×`),
                h('span.small', confusionHint(c.expected, c.typed)),
                practice ? h('a.button.small', { href: `#/ueben/verwechslung/${encodeURIComponent(c.expected + c.typed)}` }, 'Üben') : null
              )
            )
          )
        )
      : null,
    words.length
      ? h(
          'section.card',
          h('h2', 'Oft verschriebene Wörter'),
          h('p', words.map((w) => h('span.word-chip', w.word, h('span.muted.small', ` ${w.count}×`)))),
          practice ? h('a.button.primary', { href: '#/ueben/fehlerwoerter' }, 'Diese Wörter üben') : null
        )
      : null
  );
}

function bar(value, max) {
  const fill = h('div.bar-fill');
  fill.style.width = `${(value / (max || 1)) * 100}%`;
  return h('div.bar', fill);
}

export async function errorsView(app) {
  const profile = await get('/api/me/errors');
  const el = errorAnalysis(profile);
  append(
    app,
    h('h1', 'Meine Fehler'),
    h('p.muted', 'QWERTZ Ninja merkt sich, wo du dich vertippst. Daraus entstehen Übungen, die genau deine typischen Fehler trainieren.'),
    el
  );
}

export async function focusView(app, { chars }) {
  const keys = Array.from(chars);
  return runPractice(app, {
    title: 'Fehlertraining: Tasten',
    subtitle: h('span', 'Im Fokus: ', keys.map((c) => h('kbd', c))),
    kind: 'focus',
    makeText: () => weakExercise(keys, 40),
    back: '#/fehler',
  });
}

export async function contrastView(app, { pair }) {
  const [expected, typed] = Array.from(pair);
  return runPractice(app, {
    title: 'Fehlertraining: Verwechslung',
    subtitle: confusionHint(expected, typed ?? ''),
    kind: 'focus',
    makeText: () => contrastExercise(expected, typed ?? ''),
    back: '#/fehler',
  });
}

export async function errorWordsView(app) {
  const { words } = await get('/api/me/errors');
  if (!words.length) return (location.hash = '#/fehler');
  return runPractice(app, {
    title: 'Fehlertraining: Wörter',
    subtitle: 'Deine oft verschriebenen Wörter, mehrfach gemischt.',
    kind: 'focus',
    makeText: () => wordsExercise(words.map((w) => w.word)),
    back: '#/fehler',
  });
}

// Ein persönlicher Vorschlag für die nächste Übung.
function suggestion(course, profile) {
  const next = course.lessons.find((l) => l.unlocked && !l.passed);
  if (profile.confusions[0]?.count >= 5) {
    const c = profile.confusions[0];
    return { href: `#/ueben/verwechslung/${encodeURIComponent(c.expected + c.typed)}`, title: 'Typische Verwechslung trainieren', text: confusionHint(c.expected, c.typed) };
  }
  if (next) return { href: `#/kurs/${next.id}`, title: `Weiter im Kurs: ${next.title}`, text: next.goal };
  if (profile.weakKeys.length) {
    const keys = profile.weakKeys.slice(0, 5).map((k) => k.ch).join('');
    return { href: `#/ueben/fokus/${encodeURIComponent(keys)}`, title: 'Schwache Tasten üben', text: `Gezielt für ${Array.from(keys).join(' ')}` };
  }
  return { href: '#/ueben/texte', title: 'Einen Text schreiben', text: 'Ruhig und gleichmäßig, ohne hinzusehen.' };
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
  const resume = a.attempt?.started && !a.attempt.submitted;
  if (a.attempt?.submitted) {
    append(app, h('p', h('a', { href: '#/' }, '← Zurück')), h('section.card', h('h1', a.title), h('p', 'Diesen Test hast du schon abgegeben. Dein Ergebnis siehst du im Verlauf.'), h('a.button', { href: '#/verlauf' }, 'Zum Verlauf')));
    return;
  }
  const intro = h(
    'section.card',
    h('h1', a.title),
    resume
      ? h('p', h('b', 'Du hast diesen Test schon begonnen.'), ' Er läuft mit der restlichen Zeit weiter. Dein bisher gespeicherter Text ist noch da.')
      : h(
          'ul',
          h('li', `Du hast ${a.duration_sec % 60 ? `${a.duration_sec} Sekunden` : `${minutes} Minute${minutes === 1 ? '' : 'n'}`} Zeit.`),
          h('li', 'Du darfst mit der Rücktaste korrigieren. Korrigierte Fehler zählen nicht, kosten aber Zeit.'),
          h('li', 'Die Bildschirmtastatur ist ausgeblendet.'),
          h('li', 'Du hast nur einen Versuch. Nach dem Start läuft die Zeit weiter, auch wenn du die Seite neu lädst.')
        ),
    h('button.primary', { onclick: start }, resume ? 'Test fortsetzen' : 'Test starten')
  );
  append(app, h('p', h('a', { href: '#/' }, '← Zurück')), intro);

  let trainer;
  let saver;
  let lastSaved = null;
  const status = h('p.muted.small.test-save', { 'aria-live': 'polite' });
  const warn = (e) => {
    e.preventDefault();
    e.returnValue = '';
  };
  const save = async () => {
    const typed = trainer?.typed.join('') ?? '';
    if (!trainer || trainer.finished || typed === lastSaved) return;
    try {
      await post(`/api/tests/${a.id}/save`, { typed });
      lastSaved = typed;
      status.textContent = '';
    } catch (e) {
      if (e.offline) status.textContent = 'Keine Verbindung. Schreib einfach weiter, dein Text wird gesendet, sobald das Netz wieder da ist.';
    }
  };
  // Beim Neuladen oder Schließen den letzten Stand noch schnell senden.
  const beacon = () => {
    if (!trainer || trainer.finished) return;
    navigator.sendBeacon?.(`/api/tests/${a.id}/save`, new Blob([JSON.stringify({ typed: trainer.typed.join('') })], { type: 'application/json' }));
  };
  // Während des Tests ist das Menü gesperrt wie beim PLN: Ein Klick darauf soll den Test nicht beenden.
  const lock = () => {
    state.examLock = location.hash;
    document.body.classList.add('exam-mode');
  };
  const unlock = () => {
    state.examLock = null;
    document.body.classList.remove('exam-mode');
    clearInterval(saver);
    window.removeEventListener('beforeunload', warn);
    window.removeEventListener('pagehide', beacon);
  };

  async function start() {
    let s;
    try {
      s = await post(`/api/tests/${a.id}/start`);
    } catch (e) {
      return toast(e.message, 'error');
    }
    const offset = s.serverNow - Date.now();
    lastSaved = s.typed;
    trainer = new Trainer({
      text: s.text,
      errorMode: 'free',
      showKeyboard: false,
      timeLimitMs: s.durationSec * 1000,
      startAt: s.startedAt - offset,
      typed: s.typed,
      metric: state.me.prefs.metric,
      onFinish: submit,
    });
    intro.replaceWith(h('div', h('h1', a.title), status, trainer.el));
    lock();
    window.addEventListener('beforeunload', warn);
    window.addEventListener('pagehide', beacon);
    saver = setInterval(save, 5000);
    trainer.focus();
  }

  // Die Abgabe wird wiederholt, bis sie ankommt. Der Text ist da längst eingefroren.
  async function submit(r) {
    clearInterval(saver);
    status.textContent = 'Wird abgegeben …';
    try {
      const res = await post(`/api/tests/${a.id}/submit`, { typed: r.typed, correctedErrors: r.correctedErrors, keyStats: r.keyStats });
      unlock();
      status.textContent = '';
      trainer.el.replaceWith(resultPanel(res, { ...r, errors: res.errors, durationMs: res.durationMs }, { back: '#/', test: true }));
    } catch (e) {
      if (!e.offline) {
        unlock();
        status.textContent = '';
        return toast(e.message, 'error');
      }
      status.textContent = 'Keine Verbindung zum Server. Dein Test ist auf diesem Gerät gesichert und wird abgegeben, sobald das Netz wieder da ist. Bitte das Fenster offen lassen.';
      setTimeout(() => submit(r), 3000);
    }
  }

  state.cleanup = () => {
    unlock();
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

// Schüler ohne Klasse (Anmeldung über VIDIS): Klassencode der Lehrkraft eingeben.
export function joinClassView(app) {
  const form = h(
    'form.card.narrow',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(form);
        try {
          const cls = await post('/api/me/join', formData(form));
          toast(`Willkommen in der Klasse ${cls.name}`);
          state.me = null;
          location.hash = '#/';
          route();
        } catch (err) {
          showError(err.message);
        }
      },
    },
    h('img.login-ninja', { src: '/img/ninja.svg', alt: '' }),
    h('h1', `Hallo ${state.me.displayName}!`),
    h('p', 'Bevor es losgeht: Gib den Klassencode ein, den dir deine Lehrkraft gibt.'),
    h('label', 'Klassencode', h('input.join-input', { name: 'code', required: true, maxlength: 9, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'ABC-123', autofocus: true })),
    h('button.primary', { type: 'submit' }, 'Beitreten')
  );
  app.replaceChildren(form);
}
