// Spiele-Seite für Lernende: Übersicht mit Rekorden und das jeweilige Spiel.
// Die Spiele werden erst frei, wenn die Grundkompetenz erreicht ist (Kurslektion, die die Lehrkraft festlegt).
import { append, fmtNum, get, h, post, toast } from '../ui.js';
import { GAME_CLASSES, WordSource } from '../games.js';
import { gameById } from '../game-rules.js';
import { state } from '../app.js';

const WEAK_PREF = 'qn-games-weak';

function weakMode() {
  try {
    return localStorage.getItem(WEAK_PREF) === '1';
  } catch {
    return false;
  }
}

function lockedCard(info) {
  if (!info.enabled) return h('section.card', h('p', 'Deine Lehrkraft hat die Spiele für deine Klasse ausgeschaltet.'));
  const total = info.until.number;
  const done = total - info.missing.length;
  const bar = h('div.progress-bar');
  bar.style.width = `${(done / total) * 100}%`;
  return h(
    'section.card.games-locked',
    h('h2', 'Noch gesperrt'),
    h('p', `Die Spiele werden frei, sobald du die Grundlagen sicher kannst: alle Kurslektionen bis Lektion ${total} „${info.until.title}“ bestanden.`),
    h('div.progress', bar),
    h('p.muted.small', `${done} von ${total} Lektionen geschafft. Es fehlen noch: ${info.missing.map((l) => l.title).join(', ')}.`),
    h('a.button.primary', { href: `#/kurs/${info.missing[0].id}` }, `Weiter mit „${info.missing[0].title}“`)
  );
}

export async function gamesView(app) {
  const [info, weak] = await Promise.all([get('/api/me/games'), get('/api/me/weak-keys')]);
  append(
    app,
    h('h1', 'Spiele'),
    h('p.muted', 'Zum Auflockern nach dem Üben. Spiele sind freiwillig und zählen nicht für Noten. Gespeichert wird nur dein Rekord.')
  );
  if (!info.unlocked) return append(app, lockedCard(info));
  const weakBox = h('input', {
    type: 'checkbox',
    checked: weakMode(),
    disabled: !weak.length,
    onchange: (e) => {
      try {
        localStorage.setItem(WEAK_PREF, e.target.checked ? '1' : '0');
      } catch {}
    },
  });
  append(
    app,
    h(
      'div.tiles',
      info.games.map((g) =>
        h(
          'a.tile',
          { href: `#/spiele/${g.id}` },
          h('strong', g.title),
          h('span.muted.small', g.desc),
          h('span.small', g.plays ? `Rekord: ${fmtNum(g.best)} Punkte` : 'Noch nicht gespielt')
        )
      )
    ),
    h(
      'section.card',
      h('h2', 'Schwachstellen-Modus'),
      h('label.inline', weakBox, ' Bevorzugt Wörter mit meinen Schwachstellen'),
      h(
        'p.muted.small',
        weak.length ? h('span', 'Gerade sind das: ', weak.map((w) => h('kbd', w.ch))) : 'Wird nach ein paar Übungen auf dich zugeschnitten.'
      )
    )
  );
}

export async function gameView(app, { id }) {
  const meta = gameById(id);
  if (!meta) {
    location.hash = '#/spiele';
    return;
  }
  const info = await get('/api/me/games');
  append(app, h('p', h('a', { href: '#/spiele' }, '← Alle Spiele')), h('h1', meta.title));
  if (!info.unlocked) return append(app, lockedCard(info));
  const weak = weakMode() ? (await get('/api/me/weak-keys')).map((w) => w.ch) : [];
  let best = info.games.find((g) => g.id === id)?.best ?? 0;
  const bestEl = h('span', fmtNum(best));
  const holder = h('div');
  const result = h('div');
  let game = null;

  const play = () => {
    game?.destroy();
    result.replaceChildren();
    const words = new WordSource(weak);
    game = new GAME_CLASSES[id]({
      words,
      onEnd: async (r) => {
        let saved = null;
        try {
          saved = await post(`/api/me/games/${id}`, { score: r.score, level: r.level });
          best = saved.best;
          bestEl.textContent = fmtNum(best);
        } catch (err) {
          toast(err.message, 'error');
        }
        const rate = r.strokes ? (r.errors / r.strokes) * 100 : 0;
        result.replaceChildren(
          h(
            'section.card.result',
            h('h2', saved?.record ? 'Neuer Rekord!' : 'Spiel vorbei'),
            h(
              'div.result-grid',
              h('div', h('span.stat-value', fmtNum(r.score)), h('span.stat-label', 'Punkte')),
              h('div', h('span.stat-value', fmtNum(r.level)), h('span.stat-label', 'Stufe')),
              h('div', h('span.stat-value', `${fmtNum(rate, 1)} %`), h('span.stat-label', 'Tippfehler'))
            ),
            h('div.toolbar', h('button.primary', { onclick: play }, 'Nochmal'), h('a.button', { href: '#/spiele' }, 'Anderes Spiel'))
          )
        );
        result.querySelector('button.primary').focus({ preventScroll: true });
        result.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      },
    });
    holder.replaceChildren(game.el);
    game.showIntro();
  };

  append(
    app,
    h('p.muted', 'Rekord: ', bestEl, ' Punkte', weak.length ? h('span', ' · Schwachstellen-Modus: ', weak.map((c) => h('kbd', c))) : null),
    holder,
    result
  );
  play();
  state.cleanup = () => game?.destroy();
}
