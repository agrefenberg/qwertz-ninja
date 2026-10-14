import { FINGER_NAMES, HOME_KEYS, ROWS, fingerFor, keysFor } from './layout.js';

// Bildschirmtastatur mit farbiger Fingerzuordnung. highlight(ch) hebt die Tasten für das nächste Zeichen hervor.
export class Keyboard {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'keyboard';
    this.el.setAttribute('aria-hidden', 'true');
    this.keys = new Map();
    for (const row of ROWS) {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';
      for (const key of row) {
        const keyEl = document.createElement('div');
        keyEl.className = `kb-key finger-${key.finger}${key.modifier ? ' kb-mod' : ''}${HOME_KEYS.includes(key.code) ? ' kb-home' : ''}`;
        keyEl.style.flexGrow = key.width;
        if (key.modifier) {
          keyEl.textContent = key.label;
        } else if (key.code === 'Space') {
          keyEl.textContent = '';
        } else {
          const showShift = key.shift.toLowerCase() !== key.base;
          keyEl.innerHTML = `<span class="kb-shift">${showShift ? esc(key.shift) : ''}</span><span class="kb-base">${esc(
            showShift ? key.base : key.shift
          )}</span>${key.altgr ? `<span class="kb-altgr">${esc(key.altgr)}</span>` : ''}`;
        }
        this.keys.set(key.code, keyEl);
        rowEl.append(keyEl);
      }
      this.el.append(rowEl);
    }
    this.hint = document.createElement('div');
    this.hint.className = 'kb-hint';
    this.el.append(this.hint);
  }

  highlight(ch) {
    for (const el of this.el.querySelectorAll('.kb-active')) el.classList.remove('kb-active');
    if (ch == null) {
      this.hint.textContent = '';
      return;
    }
    for (const code of keysFor(ch)) this.keys.get(code)?.classList.add('kb-active');
    const finger = fingerFor(ch);
    this.hint.textContent = finger ? `${ch === ' ' ? 'Leertaste' : `„${ch}“`}: ${FINGER_NAMES[finger]}` : '';
  }

  // Für die Grundstellung: alle Tasten außer den gewünschten abblenden.
  focusKeys(codes) {
    for (const [code, el] of this.keys) el.classList.toggle('kb-dim', codes != null && !codes.includes(code));
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
