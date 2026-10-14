import { append, h, post, toast } from '../ui.js';
import { Keyboard } from '../keyboard.js';
import { HOME_KEYS } from '../layout.js';
import { Trainer } from '../trainer.js';
import { refreshMe, state } from '../app.js';
import { shuffle } from '../words.js';

const FINGERS = [
  ['l5', 'kleiner Finger links'],
  ['l4', 'Ringfinger links'],
  ['l3', 'Mittelfinger links'],
  ['l2', 'Zeigefinger links'],
  ['r2', 'Zeigefinger rechts'],
  ['r3', 'Mittelfinger rechts'],
  ['r4', 'Ringfinger rechts'],
  ['r5', 'kleiner Finger rechts'],
  ['th', 'Daumen'],
];

const HOME_WORDS = ['das', 'als', 'lag', 'sag', 'gas', 'glas', 'hals', 'kahl', 'lass', 'fass', 'jagd', 'saal', 'ölfass'];

const STEPS = [
  {
    title: 'Die Grundstellung',
    body: [
      'Lege die Finger der linken Hand auf a, s, d und f, die der rechten Hand auf j, k, l und ö.',
      'Die Tasten F und J haben kleine Erhebungen. Daran findest du die Grundstellung, ohne hinzusehen.',
      'Beide Daumen liegen locker über der Leertaste.',
    ],
    keyboard: HOME_KEYS.concat('Space'),
  },
  {
    title: 'Jeder Finger hat seine Tasten',
    body: [
      'Jede Farbe gehört zu einem Finger. Die Zeigefinger übernehmen je zwei Spalten.',
      'Großbuchstaben: Die Umschalttaste drückt immer der kleine Finger der anderen Hand.',
      'Nach jedem Anschlag kehrt der Finger in die Grundstellung zurück.',
    ],
    keyboard: null,
    legend: true,
  },
  {
    title: 'Aufwärmen: Grundreihe',
    body: ['Tippe die Grundreihe. Bei einem Fehler geht es erst weiter, wenn du die richtige Taste triffst.'],
    drill: () => 'asdf jklö fdsa ölkj asdf jklö adsf jlkö fads ökjl',
  },
  {
    title: 'Wörter aus der Grundreihe',
    body: ['Jetzt mit G und H. Die Zeigefinger greifen kurz zur Seite und kehren sofort zurück.'],
    drill: () => shuffle(HOME_WORDS).slice(0, 12).join(' '),
  },
  {
    title: 'Alle Reihen',
    body: ['Zum Schluss ein Satz, in dem jeder Buchstabe vorkommt. Schau dabei möglichst nicht auf die Tastatur.'],
    drill: () => 'Zwölf Boxkämpfer jagen Viktor quer über den großen Sylter Deich.',
    final: true,
  },
];

export function basicsView(app) {
  let step = 0;
  let trainer = null;
  const body = h('div');

  function show() {
    trainer?.destroy();
    trainer = null;
    const s = STEPS[step];
    const next = h('button.primary', { onclick: () => advance() }, step === STEPS.length - 1 ? 'Fertig' : 'Weiter');
    const parts = [
      h('p.muted.small', `Schritt ${step + 1} von ${STEPS.length}`),
      h('h1', s.title),
      ...s.body.map((p) => h('p', p)),
    ];
    if (s.drill) {
      next.disabled = true;
      trainer = new Trainer({
        text: s.drill(),
        errorMode: 'correct',
        showKeyboard: true,
        metric: state.me.prefs.metric,
        onFinish: async (r) => {
          next.disabled = false;
          if (s.final) {
            try {
              const res = await post('/api/results', { kind: 'basics', ...r });
              if (res.newBadges?.length) toast(`Abzeichen: ${res.newBadges.map((b) => b.name).join(', ')}`);
            } catch (e) {
              toast(e.message, 'error');
            }
          }
          next.focus();
        },
      });
      parts.push(trainer.el);
    } else {
      const kb = new Keyboard();
      kb.focusKeys(s.keyboard);
      parts.push(kb.el);
      if (s.legend) parts.push(h('div.legend', FINGERS.map(([f, name]) => h('span', h('i', { class: `swatch finger-${f}` }), name))));
    }
    parts.push(h('div.toolbar', step > 0 ? h('button', { onclick: () => ((step -= 1), show()) }, 'Zurück') : null, next));
    body.replaceChildren(...parts);
    trainer?.focus();
  }

  async function advance() {
    if (step < STEPS.length - 1) {
      step += 1;
      return show();
    }
    await refreshMe();
    location.hash = '#/';
  }

  append(app, body);
  show();
  state.cleanup = () => trainer?.destroy();
}
