import { Keyboard } from './keyboard.js';
import { compareTyped, metrics, normalizeChar } from './scoring.js';

// Tippbereich mit drei Fehlermodi:
//  continue – Fehler wird markiert, es geht trotzdem weiter; ein Leerzeichen springt zum nächsten Wort
//  correct  – erst nach dem richtigen Zeichen geht es weiter
//  free     – freies Tippen mit Rücktaste wie im Test; nur der Endstand zählt
export class Trainer {
  constructor({ text, errorMode = 'continue', showKeyboard = true, timeLimitMs = null, metric = 'apm', startAt = null, typed = '', onFinish }) {
    this.target = Array.from(text);
    this.errorMode = errorMode;
    this.timeLimitMs = timeLimitMs;
    this.metric = metric;
    this.onFinish = onFinish;
    this.startAt = startAt; // feste Startzeit (Test), sonst Start beim ersten Anschlag
    this.typed = errorMode === 'free' ? Array.from(typed) : []; // getippte Zeichen (continue/free); im Test fortgesetzter Stand
    this.pos = 0; // Position (correct)
    this.keystrokes = 0;
    this.extraStrokes = 0; // überzählige Anschläge am Wortende (continue)
    this.wrongStrokes = 0;
    this.correctedErrors = 0;
    this.keyStats = {};
    this.firstTry = new Set(); // Positionen, die schon einmal angeschlagen wurden
    this.missed = new Set(); // Positionen, an denen zuerst falsch getippt wurde (Korrekturmodus)
    this.confusions = {}; // "erwartet\u0000getippt" → Anzahl
    this.errorWords = {}; // Wort → Anzahl Fehler darin
    this.wordAt = wordIndex(this.target);
    this.started = null;
    this.finished = false;

    this.el = document.createElement('div');
    this.el.className = 'trainer';
    this.el.innerHTML = `
      <div class="trainer-stats">
        <div><span class="stat-value" data-s="time">0:00</span><span class="stat-label" data-s="time-label">Zeit</span></div>
        <div><span class="stat-value" data-s="speed">0</span><span class="stat-label">${metric === 'wpm' ? 'WPM' : 'Anschläge/min'}</span></div>
        <div><span class="stat-value" data-s="errors">0</span><span class="stat-label">Fehler</span></div>
        <div><span class="stat-value" data-s="progress">0 %</span><span class="stat-label">geschafft</span></div>
      </div>
      <div class="trainer-text" tabindex="-1"></div>
      <textarea class="trainer-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="Eingabe"></textarea>
      <div class="trainer-overlay">Hier klicken und lostippen</div>`;
    this.textEl = this.el.querySelector('.trainer-text');
    this.input = this.el.querySelector('.trainer-input');
    this.overlay = this.el.querySelector('.trainer-overlay');
    this.stat = (k) => this.el.querySelector(`[data-s="${k}"]`);

    const frag = document.createDocumentFragment();
    this.spans = this.target.map((ch) => {
      const s = document.createElement('span');
      s.textContent = ch;
      if (ch === ' ') s.className = 'space';
      frag.append(s);
      return s;
    });
    this.textEl.append(frag);

    if (showKeyboard) {
      this.keyboard = new Keyboard();
      this.el.append(this.keyboard.el);
    }

    this.el.addEventListener('click', () => this.focus());
    this.input.addEventListener('focus', () => this.overlay.classList.add('hidden'));
    this.input.addEventListener('blur', () => !this.finished && this.overlay.classList.remove('hidden'));
    this.input.addEventListener('beforeinput', (e) => this.onBeforeInput(e));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.key === 'Enter') e.preventDefault();
    });
    this.input.addEventListener('paste', (e) => e.preventDefault());
    this.input.addEventListener('drop', (e) => e.preventDefault());

    this.render();
    this.timer = setInterval(() => this.tick(), 200);
  }

  focus() {
    if (!this.finished) this.input.focus({ preventScroll: true });
  }

  get cursor() {
    return this.errorMode === 'correct' ? this.pos : this.typed.length;
  }

  onBeforeInput(e) {
    e.preventDefault();
    if (this.finished) return;
    if (this.startAt && Date.now() < this.startAt) return;
    if (e.inputType === 'deleteContentBackward') return this.backspace();
    if (e.inputType !== 'insertText' && e.inputType !== 'insertReplacementText') return;
    for (const raw of Array.from(e.data || '')) this.type(normalizeChar(raw));
  }

  type(ch) {
    if (this.finished || this.cursor >= this.target.length) return;
    if (!this.started) this.started = this.startAt || Date.now();
    this.keystrokes++;
    const i = this.cursor;
    const expected = this.target[i];

    if (this.errorMode === 'continue' && (ch === ' ') !== (expected === ' ')) {
      if (ch === ' ') {
        // Rest des Wortes übersprungen: als Fehler werten und zum nächsten Wort springen.
        let j = i;
        while (j < this.target.length && this.target[j] !== ' ') {
          const s = (this.keyStats[this.target[j]] ||= [0, 0]);
          if (!this.firstTry.has(j)) {
            s[1]++;
            if (j === i) this.noteError(j, ' ');
          }
          this.firstTry.add(j);
          this.typed.push(null);
          j++;
        }
        if (j < this.target.length) this.typed.push(' ');
      } else {
        // Zu viele Buchstaben im Wort: Fehler, aber das Leerzeichen bleibt die nächste Taste.
        this.extraStrokes++;
        this.noteError(i, ch);
        this.flash(i);
      }
      this.render(i);
      if (this.cursor >= this.target.length) this.finish(true);
      return;
    }

    const ok = ch === expected;
    if (!this.firstTry.has(i)) {
      this.firstTry.add(i);
      const s = (this.keyStats[expected] ||= [0, 0]);
      s[ok ? 0 : 1]++;
    }
    if (!ok) {
      this.wrongStrokes++;
      if (!this.missed.has(i)) this.noteError(i, ch);
      this.missed.add(i);
    }

    if (this.errorMode === 'correct') {
      if (ok) this.pos++;
      else this.flash(i);
    } else {
      this.typed.push(ch);
    }
    this.render(i);
    if (this.cursor >= this.target.length) this.finish(true);
  }

  noteError(i, typed) {
    const key = `${this.target[i]}\u0000${typed}`;
    this.confusions[key] = (this.confusions[key] || 0) + 1;
    const w = this.wordAt[i];
    if (w) this.errorWords[w] = (this.errorWords[w] || 0) + 1;
  }

  backspace() {
    if (this.errorMode !== 'free' || !this.typed.length) return;
    const i = this.typed.length - 1;
    if (this.typed[i] !== this.target[i]) this.correctedErrors++;
    this.typed.pop();
    this.render(i);
  }

  flash(i) {
    const s = this.spans[i];
    s.classList.remove('flash');
    void s.offsetWidth;
    s.classList.add('flash');
  }

  render(from = 0) {
    const cur = this.cursor;
    for (let i = from; i < this.spans.length; i++) {
      const s = this.spans[i];
      s.classList.remove('ok', 'err', 'current');
      if (this.errorMode === 'correct') {
        if (i < cur) s.classList.add(this.missed.has(i) ? 'err' : 'ok');
      } else if (i < this.typed.length) {
        s.classList.add(this.typed[i] === this.target[i] ? 'ok' : 'err');
      }
      if (i === cur) s.classList.add('current');
      if (i > cur + 1 && from > 0) break;
    }
    const curSpan = this.spans[cur];
    if (curSpan) {
      const top = curSpan.offsetTop - this.textEl.offsetTop;
      if (top > this.textEl.scrollTop + this.textEl.clientHeight * 0.55 || top < this.textEl.scrollTop) {
        this.textEl.scrollTop = Math.max(0, top - this.textEl.clientHeight * 0.3);
      }
    }
    this.keyboard?.highlight(this.target[cur] ?? null);
    this.updateStats();
  }

  counts() {
    if (this.errorMode === 'correct') {
      return { gross: this.keystrokes, correct: this.pos, errors: this.wrongStrokes };
    }
    if (this.errorMode === 'free') {
      return compareTyped(this.target.join(''), this.typed.join(''));
    }
    let correct = 0;
    for (let i = 0; i < this.typed.length; i++) if (this.typed[i] === this.target[i]) correct++;
    return { gross: this.keystrokes, correct, errors: this.typed.length - correct + this.extraStrokes };
  }

  elapsed() {
    if (!this.started) return 0;
    const now = this.finishedAt || Date.now();
    return Math.max(0, now - this.started);
  }

  tick() {
    if (this.finished) return;
    if (this.startAt && Date.now() < this.startAt) {
      this.stat('time').textContent = String(Math.ceil((this.startAt - Date.now()) / 1000));
      this.stat('time-label').textContent = 'Start in';
      return;
    }
    if (this.startAt && !this.started) {
      this.started = this.startAt;
      this.stat('time-label').textContent = 'Restzeit';
      this.focus();
    }
    if (this.timeLimitMs && this.started && this.elapsed() >= this.timeLimitMs) return this.finish(false);
    this.updateStats();
  }

  updateStats() {
    const ms = this.elapsed();
    const shown = this.timeLimitMs ? Math.max(0, this.timeLimitMs - ms) : ms;
    const sec = Math.floor(shown / 1000);
    if (!(this.startAt && Date.now() < this.startAt)) this.stat('time').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    const c = this.counts();
    const m = metrics({ ...c, durationMs: Math.max(ms, 1000) });
    this.stat('speed').textContent = ms > 2000 ? String(Math.round(this.metric === 'wpm' ? m.wpm : m.apm)) : '–';
    this.stat('errors').textContent = String(c.errors);
    this.stat('progress').textContent = `${Math.floor((this.cursor / this.target.length) * 100)} %`;
  }

  finish(completed) {
    if (this.finished) return;
    this.finished = true;
    this.finishedAt = Date.now();
    if (this.timeLimitMs && this.started) this.finishedAt = Math.min(this.finishedAt, this.started + this.timeLimitMs);
    clearInterval(this.timer);
    this.input.blur();
    this.keyboard?.highlight(null);
    const c = this.counts();
    this.onFinish?.({
      ...c,
      durationMs: Math.max(1, this.elapsed()),
      correctedErrors: this.correctedErrors,
      completed: completed || !!this.timeLimitMs,
      keyStats: this.keyStats,
      confusions: Object.entries(this.confusions).map(([k, n]) => [...k.split('\u0000'), n]),
      errorWords: this.errorWords,
      typed: this.typed.join(''),
    });
  }

  destroy() {
    this.finished = true;
    clearInterval(this.timer);
    this.el.remove();
  }
}

// Für jede Position das Wort, zu dem sie gehört (ohne Satzzeichen am Rand).
function wordIndex(chars) {
  const out = new Array(chars.length).fill(null);
  let start = 0;
  for (let i = 0; i <= chars.length; i++) {
    if (i === chars.length || chars[i] === ' ') {
      const word = chars.slice(start, i).join('').replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '');
      if (word.length >= 2) for (let j = start; j < i; j++) out[j] = word;
      start = i + 1;
    }
  }
  return out;
}
