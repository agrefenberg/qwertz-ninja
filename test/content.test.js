import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_TEXTS, MAX_TEXT_CHARS, MIN_TEXT_CHARS } from '../server/content.js';

test('mitgelieferte Texte sind zwischen 400 und 1500 Zeichen lang', () => {
  for (const t of BUILTIN_TEXTS) {
    const n = t.content.length;
    assert.ok(n >= MIN_TEXT_CHARS && n <= MAX_TEXT_CHARS, `${t.key}: ${n} Zeichen`);
  }
});

test('Schlüssel der mitgelieferten Texte sind eindeutig und vollständig', () => {
  const keys = BUILTIN_TEXTS.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
  // Aufgaben verweisen auf diese Texte, daher darf keiner wegfallen.
  for (const k of ['grundstellung-ruhe', 'bahnhof', 'fahrradtour', 'bewerbung', 'wetter', 'kochen', 'computer', 'bienen', 'email', 'fussball', 'mond', 'umzug', 'pln-schreibmaschine', 'pln-wald', 'pln-brot']) {
    assert.ok(keys.includes(k), k);
  }
});
