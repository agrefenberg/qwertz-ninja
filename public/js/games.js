// Lernspiele: Fallende Wörter, Tipp-Snake und Ninja-Lauf. Alle drei zeichnen auf eine Leinwand mit fester
// logischer Größe (W × H), die per CSS auf die Breite der Seite skaliert wird. Getippt wird wie im Trainer
// in ein unsichtbares Textfeld, damit auch iPads mit angeschlossener Tastatur zuverlässig funktionieren.
import { normalizeChar } from './scoring.js';
import { WORDS } from './words.js';

const W = 960;
const H = 540;
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const SANS = "'Jakarta', system-ui, sans-serif";

function palette() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return {
    bg: v('--soft'),
    surface: v('--surface'),
    ink: v('--ink'),
    muted: v('--muted'),
    border: v('--border'),
    ok: v('--ok'),
    err: v('--err'),
    current: v('--current'),
    tiles: [v('--coral'), v('--purple'), v('--cyan'), v('--green'), v('--pink'), v('--blue')],
    field: v('--f-l2'),
  };
}

// Wörter für das Spiel: Mit der Stufe werden sie länger. Im Schwachstellen-Modus kommen bevorzugt Wörter
// mit den Zeichen, bei denen die Person die meisten Fehler macht.
export class WordSource {
  constructor(weakChars = []) {
    const weak = weakChars.filter((c) => c.trim());
    const lower = weak.map((c) => c.toLowerCase());
    const hits = (w) => Array.from(w).filter((c) => weak.includes(c) || lower.includes(c.toLowerCase())).length;
    this.pool = weak.length ? WORDS.filter((w) => hits(w) > 0) : WORDS;
    if (this.pool.length < 12) this.pool = WORDS;
    this.weak = this.pool !== WORDS;
    this.queue = [];
  }

  maxLen(level) {
    return [4, 5, 6, 7, 8][level - 1] ?? 99;
  }

  next(level, { avoidFirst = new Set(), maxLen = this.maxLen(level) } = {}) {
    let fits = this.pool.filter((w) => w.length <= maxLen && !avoidFirst.has(w[0]));
    if (!fits.length) fits = this.pool.filter((w) => !avoidFirst.has(w[0]));
    if (!fits.length) fits = this.pool;
    return fits[Math.floor(Math.random() * fits.length)];
  }
}

// Gemeinsamer Rahmen: Leinwand, Eingabe, Spielschleife, Pause und Ende.
class Game {
  constructor({ words, onEnd }) {
    this.words = words;
    this.onEnd = onEnd;
    this.colors = palette();
    this.score = 0;
    this.level = 1;
    this.errors = 0;
    this.strokes = 0;
    this.running = false;
    this.paused = false;
    this.over = false;
    this.last = 0;

    this.el = document.createElement('div');
    this.el.className = 'game';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Spielfeld');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = W * dpr;
    this.canvas.height = H * dpr;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
    this.input = document.createElement('textarea');
    this.input.className = 'trainer-input';
    for (const [k, v] of Object.entries({ autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Eingabe' })) this.input.setAttribute(k, v);
    this.status = document.createElement('p');
    this.status.className = 'visually-hidden';
    this.status.setAttribute('role', 'status');
    this.overlay = document.createElement('div');
    this.overlay.className = 'game-overlay';
    this.el.append(this.canvas, this.input, this.overlay, this.status);

    this.input.addEventListener('beforeinput', (e) => {
      e.preventDefault();
      if (!this.running || this.paused) return;
      if (e.inputType !== 'insertText' && e.inputType !== 'insertReplacementText') return;
      for (const raw of Array.from(e.data || '')) {
        this.strokes++;
        this.key(normalizeChar(raw));
      }
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.key === 'Enter') e.preventDefault();
      if (e.key === 'Escape') this.input.blur();
    });
    this.input.addEventListener('paste', (e) => e.preventDefault());
    this.input.addEventListener('blur', () => this.running && !this.over && this.pause());
    this.el.addEventListener('click', () => this.input.focus({ preventScroll: true }));
    this.frame = (t) => this.loop(t);
  }

  showOverlay(title, text, button, action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'primary';
    b.textContent = button;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      action();
    });
    const h = document.createElement('strong');
    h.textContent = title;
    const p = document.createElement('span');
    p.textContent = text;
    this.overlay.replaceChildren(h, p, b);
    this.overlay.hidden = false;
    return b;
  }

  // Nach dem Erzeugen aufrufen (die Unterklassen müssen ihren Zustand schon haben).
  showIntro() {
    this.draw();
    this.showOverlay(this.title, this.howto, 'Start', () => this.start()).focus();
  }

  start() {
    this.overlay.hidden = true;
    this.running = true;
    this.input.focus({ preventScroll: true });
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  pause() {
    this.paused = true;
    this.showOverlay('Pause', 'Klick auf Weiter, dann geht es genau hier weiter.', 'Weiter', () => this.resume());
  }

  resume() {
    this.paused = false;
    this.overlay.hidden = true;
    this.input.focus({ preventScroll: true });
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  loop(t) {
    if (!this.running || this.paused || this.over) return;
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.update(dt);
    this.draw();
    if (!this.over) requestAnimationFrame(this.frame);
  }

  say(msg) {
    this.status.textContent = msg;
  }

  levelUp() {
    this.level++;
    this.flashText = { text: `Stufe ${this.level}`, until: performance.now() + 1500 };
    this.say(`Stufe ${this.level}`);
  }

  end(reason) {
    this.over = true;
    this.running = false;
    this.draw();
    this.input.blur();
    this.say(`Spiel vorbei. ${this.score} Punkte.`);
    this.onEnd?.({ score: this.score, level: this.level, errors: this.errors, strokes: this.strokes, reason });
  }

  destroy() {
    this.running = false;
    this.over = true;
  }

  // ---------- Zeichenhilfen ----------

  clear() {
    const c = this.ctx;
    c.fillStyle = this.colors.surface;
    c.fillRect(0, 0, W, H);
  }

  roundRect(x, y, w, h, r, fill, stroke) {
    const c = this.ctx;
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 2;
      c.stroke();
    }
  }

  // Wort mit bereits getipptem Anfang in Grün; liefert die Breite.
  wordWidth(word, size = 26) {
    this.ctx.font = `700 ${size}px ${MONO}`;
    return this.ctx.measureText(word).width;
  }

  drawWord(word, typed, cx, y, { size = 26, pill = this.colors.surface, active = false } = {}) {
    const c = this.ctx;
    const w = this.wordWidth(word, size);
    const pad = 12;
    this.roundRect(cx - w / 2 - pad, y - size * 0.85, w + pad * 2, size * 1.45, size * 0.7, active ? this.colors.current : pill, this.colors.ink);
    c.font = `700 ${size}px ${MONO}`;
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    const done = word.slice(0, typed);
    c.fillStyle = this.colors.ok;
    c.fillText(done, cx - w / 2, y + size * 0.15);
    c.fillStyle = this.colors.ink;
    c.fillText(word.slice(typed), cx - w / 2 + c.measureText(done).width, y + size * 0.15);
  }

  hud(items) {
    const c = this.ctx;
    c.font = `700 18px ${SANS}`;
    c.textBaseline = 'top';
    let x = 16;
    for (const [label, value] of items) {
      c.fillStyle = this.colors.muted;
      c.textAlign = 'left';
      c.fillText(label, x, 12);
      const lw = c.measureText(label).width;
      c.fillStyle = this.colors.ink;
      c.fillText(String(value), x + lw + 6, 12);
      x += lw + c.measureText(String(value)).width + 30;
    }
    if (this.flashText && performance.now() < this.flashText.until) {
      c.font = `800 44px ${SANS}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = this.colors.ink;
      c.fillText(this.flashText.text, W / 2, H / 2 - 40);
    }
  }

  lives(n, max = 3) {
    const c = this.ctx;
    for (let i = 0; i < max; i++) {
      c.beginPath();
      c.arc(W - 24 - i * 26, 22, 9, 0, Math.PI * 2);
      c.fillStyle = i < n ? this.colors.tiles[0] : this.colors.border;
      c.fill();
    }
  }
}

// ---------- Fallende Wörter ----------

export class RainGame extends Game {
  get title() {
    return 'Fallende Wörter';
  }
  get howto() {
    return 'Tipp jedes Wort, bevor es unten aufschlägt. Das erste Zeichen wählt das Wort aus. Ein Wort am Boden kostet ein Leben, fünf Tippfehler auch.';
  }

  constructor(opts) {
    super(opts);
    this.drops = [];
    this.active = null;
    this.spawnIn = 0.3;
    this.cleared = 0;
    this.hearts = 3;
    this.strikes = 0;
  }

  update(dt) {
    const speed = 34 * (1 + 0.14 * (this.level - 1));
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.drops.length < 6) {
      const firsts = new Set(this.drops.map((d) => d.word[0]));
      const word = this.words.next(this.level, { avoidFirst: firsts });
      const w = this.wordWidth(word) + 24;
      this.drops.push({ word, typed: 0, x: w / 2 + 10 + Math.random() * (W - w - 20), y: 60, color: this.colors.tiles[Math.floor(Math.random() * 6)] });
      this.spawnIn = Math.max(1.0, 3.0 * 0.9 ** (this.level - 1));
    }
    for (const d of this.drops) d.y += speed * dt;
    const ground = H - 40;
    for (const d of this.drops.filter((x) => x.y >= ground)) {
      this.drops.splice(this.drops.indexOf(d), 1);
      if (this.active === d) this.active = null;
      this.loseHeart(`„${d.word}“ ist aufgeschlagen.`);
    }
  }

  loseHeart(msg) {
    this.hearts--;
    this.say(msg);
    if (this.hearts <= 0) this.end('lives');
  }

  key(ch) {
    if (!this.active) {
      const candidates = this.drops.filter((d) => d.word[0] === ch).sort((a, b) => b.y - a.y);
      if (!candidates.length) return this.typo();
      this.active = candidates[0];
    } else if (this.active.word[this.active.typed] !== ch) {
      return this.typo();
    }
    const d = this.active;
    d.typed++;
    if (d.typed === d.word.length) {
      this.score += d.word.length * this.level * 10;
      this.drops.splice(this.drops.indexOf(d), 1);
      this.active = null;
      this.cleared++;
      if (this.cleared % 10 === 0) this.levelUp();
    }
  }

  typo() {
    this.errors++;
    this.strikes++;
    if (this.strikes >= 5) {
      this.strikes = 0;
      this.loseHeart('Fünf Tippfehler: ein Leben weniger.');
    }
  }

  draw() {
    const c = this.ctx;
    this.clear();
    c.fillStyle = this.colors.bg;
    c.fillRect(0, H - 40, W, 40);
    for (const d of this.drops) this.drawWord(d.word, d.typed, d.x, d.y, { pill: d.color, active: d === this.active });
    this.hud([
      ['Punkte', this.score],
      ['Stufe', this.level],
      ['Fehler', `${this.strikes}/5`],
    ]);
    this.lives(this.hearts);
  }
}

// ---------- Tipp-Snake ----------

const DIRS = {
  up: { dx: 0, dy: -1, name: 'oben' },
  down: { dx: 0, dy: 1, name: 'unten' },
  left: { dx: -1, dy: 0, name: 'links' },
  right: { dx: 1, dy: 0, name: 'rechts' },
};
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const CELL = 40;
const COLS = 20;
const ROWS = 11;
const OX = 80;
const OY = 50;

export class SnakeGame extends Game {
  get title() {
    return 'Tipp-Snake';
  }
  get howto() {
    return 'Die Schlange läuft von allein. Tipp das Wort am Rand, um in diese Richtung abzubiegen. Friss die Punkte, aber stoß nicht an die Wand oder an dich selbst.';
  }

  constructor(opts) {
    super(opts);
    this.snake = [
      { x: 6, y: 5 },
      { x: 5, y: 5 },
      { x: 4, y: 5 },
    ];
    this.dir = 'right';
    this.pending = null;
    this.buffer = '';
    this.labels = {};
    for (const d of Object.keys(DIRS)) this.newLabel(d);
    this.food = this.placeFood();
    this.eaten = 0;
    this.acc = 0;
  }

  get interval() {
    return Math.max(0.32, 0.75 - this.eaten * 0.02);
  }

  newLabel(dir) {
    const firsts = new Set(Object.entries(this.labels).filter(([d]) => d !== dir).map(([, w]) => w[0]));
    this.labels[dir] = this.words.next(this.level, { avoidFirst: firsts, maxLen: Math.min(3 + this.level, 7) });
  }

  placeFood() {
    for (;;) {
      const f = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      if (!this.snake.some((s) => s.x === f.x && s.y === f.y)) return f;
    }
  }

  // Richtung, in die die Schlange gerade nicht umkehren darf.
  get blocked() {
    return OPPOSITE[this.pending || this.dir];
  }

  key(ch) {
    const next = this.buffer + ch;
    const options = Object.keys(DIRS).filter((d) => d !== this.blocked && this.labels[d].startsWith(next));
    if (!options.length) {
      this.errors++;
      this.buffer = '';
      return;
    }
    this.buffer = next;
    const done = options.find((d) => this.labels[d] === next);
    if (done) {
      this.pending = done;
      this.buffer = '';
      this.score += next.length * this.level * 2;
      this.newLabel(done);
    }
  }

  update(dt) {
    this.acc += dt;
    if (this.acc < this.interval) return;
    this.acc = 0;
    if (this.pending) {
      this.dir = this.pending;
      this.pending = null;
      // Ein angefangenes Wort für die jetzt gesperrte Richtung verfällt.
      if (this.buffer && !Object.keys(DIRS).some((d) => d !== this.blocked && this.labels[d].startsWith(this.buffer))) this.buffer = '';
    }
    const head = this.snake[0];
    const n = { x: head.x + DIRS[this.dir].dx, y: head.y + DIRS[this.dir].dy };
    const hitsSelf = this.snake.slice(0, -1).some((s) => s.x === n.x && s.y === n.y);
    if (n.x < 0 || n.y < 0 || n.x >= COLS || n.y >= ROWS || hitsSelf) return this.end(hitsSelf ? 'self' : 'wall');
    this.snake.unshift(n);
    if (n.x === this.food.x && n.y === this.food.y) {
      this.eaten++;
      this.score += 50 * this.level;
      this.food = this.placeFood();
      if (this.eaten % 5 === 0) this.levelUp();
    } else {
      this.snake.pop();
    }
  }

  draw() {
    const c = this.ctx;
    this.clear();
    this.roundRect(OX, OY, COLS * CELL, ROWS * CELL, 10, this.colors.bg);
    // Futter
    c.beginPath();
    c.arc(OX + this.food.x * CELL + CELL / 2, OY + this.food.y * CELL + CELL / 2, CELL * 0.3, 0, Math.PI * 2);
    c.fillStyle = this.colors.tiles[0];
    c.fill();
    // Schlange
    this.snake.forEach((s, i) => {
      this.roundRect(OX + s.x * CELL + 3, OY + s.y * CELL + 3, CELL - 6, CELL - 6, 10, i === 0 ? this.colors.ink : this.colors.tiles[3], i === 0 ? null : this.colors.ink);
    });
    // Richtungswörter am Rand
    const at = { up: [OX + (COLS * CELL) / 2, 34], down: [OX + (COLS * CELL) / 2, H - 14], left: [OX / 2 + 2, OY + (ROWS * CELL) / 2], right: [W - OX / 2 - 2, OY + (ROWS * CELL) / 2] };
    for (const d of Object.keys(DIRS)) {
      const word = this.labels[d];
      const typed = this.labels[d].startsWith(this.buffer) && d !== this.blocked ? this.buffer.length : 0;
      const [x, y] = at[d];
      const size = d === 'left' || d === 'right' ? Math.min(22, 140 / Math.max(3, word.length)) : 22;
      c.globalAlpha = d === this.blocked ? 0.25 : 1;
      this.drawWord(word, typed, x, y, { size, active: d === this.pending });
      c.globalAlpha = 1;
    }
    this.hud([
      ['Punkte', this.score],
      ['Stufe', this.level],
    ]);
  }
}

// ---------- Ninja-Lauf ----------

const GROUND = H - 90;
const NINJA_X = 140;

export class RunGame extends Game {
  get title() {
    return 'Ninja-Lauf';
  }
  get howto() {
    return 'Der Ninja rennt. Tipp das Wort über dem nächsten Hindernis ganz, dann springt er drüber. Schaffst du es nicht rechtzeitig, kostet das ein Leben.';
  }

  constructor(opts) {
    super(opts);
    this.ninja = new Image();
    this.ninja.src = '/img/ninja.svg';
    this.ninja.onload = () => !this.running && this.draw();
    this.obstacles = [];
    this.jumpT = 0;
    this.hearts = 3;
    this.cleared = 0;
    this.distance = 0;
    this.spawnIn = 0;
  }

  get speed() {
    return 70 * (1 + 0.12 * (this.level - 1));
  }

  get target() {
    return this.obstacles.find((o) => !o.done);
  }

  update(dt) {
    this.distance += this.speed * dt;
    this.jumpT = Math.max(0, this.jumpT - dt);
    this.spawnIn -= dt;
    const lastX = this.obstacles.at(-1)?.x ?? 0;
    if (this.spawnIn <= 0 && lastX < W - 260) {
      const word = this.words.next(this.level);
      this.obstacles.push({ word, typed: 0, x: W + 40, h: 40 + Math.random() * 40, color: this.colors.tiles[Math.floor(Math.random() * 6)], done: false });
      this.spawnIn = 1.2 + Math.random() * 1.2;
    }
    for (const o of this.obstacles) o.x -= this.speed * dt;
    const t = this.target;
    if (t && t.x <= NINJA_X + 40) {
      t.done = true;
      t.crashed = true;
      this.hearts--;
      this.say(`Gegen „${t.word}“ gelaufen.`);
      if (this.hearts <= 0) return this.end('lives');
    }
    this.obstacles = this.obstacles.filter((o) => o.x > -80);
  }

  key(ch) {
    const t = this.target;
    if (!t) return;
    if (t.word[t.typed] !== ch) {
      this.errors++;
      t.shake = performance.now() + 200;
      return;
    }
    t.typed++;
    if (t.typed === t.word.length) {
      t.done = true;
      this.jumpT = Math.max(0.6, (t.x - NINJA_X) / this.speed + 0.35);
      this.jumpTotal = this.jumpT;
      this.score += t.word.length * this.level * 10;
      this.cleared++;
      if (this.cleared % 8 === 0) this.levelUp();
    }
  }

  draw() {
    const c = this.ctx;
    this.clear();
    // Boden mit Streifen, die sich mitbewegen
    c.fillStyle = this.colors.bg;
    c.fillRect(0, GROUND, W, H - GROUND);
    c.fillStyle = this.colors.border;
    for (let x = -(this.distance % 60); x < W; x += 60) c.fillRect(x, GROUND + 18, 30, 4);
    // Hindernisse und Wörter
    for (const o of this.obstacles) {
      this.roundRect(o.x - 22, GROUND - o.h, 44, o.h, 8, o.crashed ? this.colors.border : o.color, this.colors.ink);
      if (!o.done) {
        const dx = o.shake && performance.now() < o.shake ? Math.sin(performance.now() / 20) * 4 : 0;
        this.drawWord(o.word, o.typed, Math.max(this.wordWidth(o.word) / 2 + 16, Math.min(W - this.wordWidth(o.word) / 2 - 16, o.x)) + dx, GROUND - o.h - 30, { active: o === this.target });
      }
    }
    // Ninja: läuft auf und ab, springt in einem Bogen
    const p = this.jumpTotal ? 1 - this.jumpT / this.jumpTotal : 0;
    const jump = this.jumpT > 0 ? Math.sin(Math.PI * p) * 140 : Math.abs(Math.sin(this.distance / 18)) * 4;
    const size = 84;
    if (this.ninja.complete && this.ninja.naturalWidth) c.drawImage(this.ninja, NINJA_X - size / 2, GROUND - size - jump, size, size);
    else this.roundRect(NINJA_X - 20, GROUND - 60 - jump, 40, 60, 10, this.colors.ink);
    this.hud([
      ['Punkte', this.score],
      ['Stufe', this.level],
      ['Hindernisse', this.cleared],
    ]);
    this.lives(this.hearts);
  }
}

export const GAME_CLASSES = { regen: RainGame, snake: SnakeGame, lauf: RunGame };
