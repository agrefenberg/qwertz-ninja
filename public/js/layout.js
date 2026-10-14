// Deutsche QWERTZ-Tastatur (T1, DIN 2137) mit Fingerzuordnung für das 10-Finger-System.
// Finger: l5 kleiner Finger links … l2 Zeigefinger links, r2 … r5 rechts, th Daumen.

const k = (code, base, shift, finger, altgr = null, width = 1) => ({ code, base, shift, altgr, finger, width });
const mod = (code, label, finger, width) => ({ code, label, finger, width, modifier: true });

export const ROWS = [
  [
    k('Backquote', '^', '°', 'l5'),
    k('Digit1', '1', '!', 'l5'),
    k('Digit2', '2', '"', 'l4', '²'),
    k('Digit3', '3', '§', 'l3', '³'),
    k('Digit4', '4', '$', 'l2'),
    k('Digit5', '5', '%', 'l2'),
    k('Digit6', '6', '&', 'r2'),
    k('Digit7', '7', '/', 'r2', '{'),
    k('Digit8', '8', '(', 'r3', '['),
    k('Digit9', '9', ')', 'r4', ']'),
    k('Digit0', '0', '=', 'r5', '}'),
    k('Minus', 'ß', '?', 'r5', '\\'),
    k('Equal', '´', '`', 'r5'),
    mod('Backspace', '⟵', 'r5', 2),
  ],
  [
    mod('Tab', 'Tab', 'l5', 1.5),
    k('KeyQ', 'q', 'Q', 'l5', '@'),
    k('KeyW', 'w', 'W', 'l4'),
    k('KeyE', 'e', 'E', 'l3', '€'),
    k('KeyR', 'r', 'R', 'l2'),
    k('KeyT', 't', 'T', 'l2'),
    k('KeyY', 'z', 'Z', 'r2'),
    k('KeyU', 'u', 'U', 'r2'),
    k('KeyI', 'i', 'I', 'r3'),
    k('KeyO', 'o', 'O', 'r4'),
    k('KeyP', 'p', 'P', 'r5'),
    k('BracketLeft', 'ü', 'Ü', 'r5'),
    k('BracketRight', '+', '*', 'r5', '~'),
    mod('Enter', '⏎', 'r5', 1.5),
  ],
  [
    mod('CapsLock', '⇩', 'l5', 1.75),
    k('KeyA', 'a', 'A', 'l5'),
    k('KeyS', 's', 'S', 'l4'),
    k('KeyD', 'd', 'D', 'l3'),
    k('KeyF', 'f', 'F', 'l2'),
    k('KeyG', 'g', 'G', 'l2'),
    k('KeyH', 'h', 'H', 'r2'),
    k('KeyJ', 'j', 'J', 'r2'),
    k('KeyK', 'k', 'K', 'r3'),
    k('KeyL', 'l', 'L', 'r4'),
    k('Semicolon', 'ö', 'Ö', 'r5'),
    k('Quote', 'ä', 'Ä', 'r5'),
    k('Backslash', '#', "'", 'r5'),
    mod('Enter2', '', 'r5', 1.25),
  ],
  [
    mod('ShiftLeft', '⇧', 'l5', 1.25),
    k('IntlBackslash', '<', '>', 'l5', '|'),
    k('KeyZ', 'y', 'Y', 'l5'),
    k('KeyX', 'x', 'X', 'l4'),
    k('KeyC', 'c', 'C', 'l3'),
    k('KeyV', 'v', 'V', 'l2'),
    k('KeyB', 'b', 'B', 'l2'),
    k('KeyN', 'n', 'N', 'r2'),
    k('KeyM', 'm', 'M', 'r2', 'µ'),
    k('Comma', ',', ';', 'r3'),
    k('Period', '.', ':', 'r4'),
    k('Slash', '-', '_', 'r5'),
    mod('ShiftRight', '⇧', 'r5', 2.75),
  ],
  [
    mod('ControlLeft', 'Strg', 'l5', 1.5),
    mod('MetaLeft', '', 'l5', 1.25),
    mod('AltLeft', 'Alt', 'th', 1.25),
    { code: 'Space', base: ' ', shift: ' ', finger: 'th', width: 6.25 },
    mod('AltRight', 'Alt Gr', 'th', 1.25),
    mod('MetaRight', '', 'r5', 1.25),
    mod('ControlRight', 'Strg', 'r5', 1.5),
  ],
];

export const HOME_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'];

export const FINGER_NAMES = {
  l5: 'linker kleiner Finger',
  l4: 'linker Ringfinger',
  l3: 'linker Mittelfinger',
  l2: 'linker Zeigefinger',
  r2: 'rechter Zeigefinger',
  r3: 'rechter Mittelfinger',
  r4: 'rechter Ringfinger',
  r5: 'rechter kleiner Finger',
  th: 'Daumen',
};

// Zeichen → { key, shift, altgr }
const CHAR_MAP = new Map();
for (const row of ROWS) {
  for (const key of row) {
    if (key.modifier) continue;
    if (!CHAR_MAP.has(key.base)) CHAR_MAP.set(key.base, { key, shift: false, altgr: false });
    if (!CHAR_MAP.has(key.shift)) CHAR_MAP.set(key.shift, { key, shift: true, altgr: false });
    if (key.altgr && !CHAR_MAP.has(key.altgr)) CHAR_MAP.set(key.altgr, { key, shift: false, altgr: true });
  }
}

// Welche Tasten für ein Zeichen gedrückt werden. Die Umschalttaste nimmt immer die andere Hand.
export function keysFor(ch) {
  const m = CHAR_MAP.get(ch);
  if (!m) return [];
  const out = [m.key.code];
  if (m.shift) out.push(m.key.finger.startsWith('l') ? 'ShiftRight' : 'ShiftLeft');
  if (m.altgr) out.push('AltRight');
  return out;
}

export function fingerFor(ch) {
  const m = CHAR_MAP.get(ch);
  return m ? m.key.finger : null;
}

export function isTypeable(ch) {
  return CHAR_MAP.has(ch);
}
