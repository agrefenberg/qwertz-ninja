// Kleine Helfer für DOM und Server-Zugriffe.

export const OFFLINE_MESSAGE = 'Keine Verbindung zum Server. Bitte prüfe das Netz und versuche es erneut.';

export async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    const err = new Error(OFFLINE_MESSAGE);
    err.offline = true;
    throw err;
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const err = new Error(data?.error || (res.status >= 500 ? 'Der Server hat gerade ein Problem. Bitte gleich noch einmal versuchen.' : `Fehler ${res.status}`));
    // Antworten ohne JSON (z. B. vom Proxy, wenn die App neu startet) gelten wie ein Verbindungsabbruch.
    if (!data) err.offline = true;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const get = (url) => api('GET', url);
export const post = (url, body = {}) => api('POST', url, body);
export const put = (url, body = {}) => api('PUT', url, body);
export const patch = (url, body = {}) => api('PATCH', url, body);
export const del = (url) => api('DELETE', url);

// h('div.card', { onclick }, 'Text', child)
export function h(spec, attrs, ...children) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    if (attrs != null) children.unshift(attrs);
    attrs = {};
  }
  const [tag, ...classes] = spec.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'onsubmit' || (k === 'onclick' && el.tagName === 'BUTTON')) el.addEventListener(k.slice(2), busyWhile(el, v));
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += ` ${v}`;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

// Gegen Doppelklicks: Solange der Handler (async) läuft, ist der Knopf bzw. das Formular gesperrt.
// So entstehen keine doppelten Klassen, Konten oder Abgaben, wenn der Server langsam antwortet.
function busyWhile(el, handler) {
  return (e) => {
    if (el.dataset.busy) {
      e.preventDefault();
      return;
    }
    const out = handler(e);
    if (!out || typeof out.then !== 'function') return out;
    const buttons = el.tagName === 'FORM' ? [...el.querySelectorAll('button:not([type=button])')] : [el];
    const locked = buttons.filter((b) => !b.disabled);
    el.dataset.busy = '1';
    el.setAttribute('aria-busy', 'true');
    for (const b of locked) b.disabled = true;
    const release = () => {
      delete el.dataset.busy;
      el.removeAttribute('aria-busy');
      for (const b of locked) b.disabled = false;
    };
    out.then(release, release);
    return out;
  };
}

export function append(el, ...children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function fmtDate(ms, withTime = true) {
  if (!ms) return '–';
  return new Date(ms).toLocaleString('de-DE', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'medium' });
}

export function fmtNum(n, digits = 0) {
  if (n == null) return '–';
  return Number(n).toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

// Prozentwerte ohne überflüssige Nachkommastelle: 3 %, 2,5 %.
export function fmtRate(n) {
  return Number(n).toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

export function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
}

export function toast(msg, kind = 'info') {
  for (const old of document.querySelectorAll('.toast')) old.remove();
  const t = h(`div.toast.toast-${kind}`, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

// Passwortfeld mit Augen-Knopf: zeigt das Passwort auf Wunsch kurz an und verbirgt es nach 10 Sekunden wieder.
export function passwordInput(attrs) {
  const input = h('input', { ...attrs, type: 'password' });
  let timer = null;
  const hide = () => {
    clearTimeout(timer);
    input.type = 'password';
    btn.replaceChildren(eyeIcon(true));
    btn.setAttribute('aria-label', 'Passwort anzeigen');
    btn.setAttribute('aria-pressed', 'false');
  };
  const btn = h('button.eye', {
    type: 'button',
    onclick: () => {
      if (input.type === 'text') return hide();
      input.type = 'text';
      btn.replaceChildren(eyeIcon(false));
      btn.setAttribute('aria-label', 'Passwort verbergen');
      btn.setAttribute('aria-pressed', 'true');
      timer = setTimeout(hide, 10000);
    },
  });
  hide();
  // Beim Verlassen des Felds wieder verbergen (außer der Klick ging auf den Augen-Knopf).
  input.addEventListener('blur', (e) => {
    if (e.relatedTarget !== btn) hide();
  });
  return h('span.password-field', input, btn);
}

// Offenes Auge: Passwort anzeigen. Durchgestrichenes Auge: wieder verbergen.
function eyeIcon(open) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const paths = ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'];
  if (!open) paths.push('M4 4l16 16');
  for (const d of paths) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

// Formular-Werte als Objekt.
export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export function errorBox(form) {
  let box = form.querySelector('.form-error');
  if (!box) {
    box = h('p.form-error', { role: 'alert' });
    form.prepend(box);
  }
  return (msg) => {
    box.textContent = msg || '';
    box.hidden = !msg;
  };
}

// Kleines Liniendiagramm als SVG (Verlauf der Geschwindigkeit).
export function sparkline(values, { width = 560, height = 140, label = '' } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  if (values.length < 2) return svg;
  const pad = { l: 36, r: 8, t: 10, b: 20 };
  const max = Math.max(...values) * 1.1 || 1;
  const x = (i) => pad.l + (i / (values.length - 1)) * (width - pad.l - pad.r);
  const y = (v) => height - pad.b - (v / max) * (height - pad.t - pad.b);
  for (const frac of [0, 0.5, 1]) {
    const v = max * frac;
    const line = document.createElementNS(ns, 'line');
    Object.entries({ x1: pad.l, x2: width - pad.r, y1: y(v), y2: y(v), class: 'grid' }).forEach(([k, val]) => line.setAttribute(k, val));
    const text = document.createElementNS(ns, 'text');
    Object.entries({ x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axis' }).forEach(([k, val]) => text.setAttribute(k, val));
    text.textContent = Math.round(v);
    svg.append(line, text);
  }
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '));
  path.setAttribute('class', 'line');
  svg.append(path);
  const last = document.createElementNS(ns, 'circle');
  Object.entries({ cx: x(values.length - 1), cy: y(values.at(-1)), r: 4, class: 'dot' }).forEach(([k, val]) => last.setAttribute(k, val));
  svg.append(last);
  return svg;
}
