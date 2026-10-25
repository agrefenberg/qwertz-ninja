// Worker für server/pln-eval.js: wertet eine Abschrift aus und schickt das Ergebnis zurück.
import { parentPort } from 'node:worker_threads';
import { evaluatePln } from './pln.js';

parentPort.on('message', ({ id, source, raw, rules }) => {
  try {
    parentPort.postMessage({ id, ev: evaluatePln(source, raw, rules) });
  } catch (err) {
    parentPort.postMessage({ id, error: err.message });
  }
});
