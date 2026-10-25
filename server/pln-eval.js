// Auswertung von PLN-Abschriften außerhalb des Hauptthreads.
// Der Abgleich mit dem Vorlagetext ist teuer (auf dem Raspberry Pi bis zu einigen hundert Millisekunden je
// Abschrift). Er läuft deshalb in einem Worker, und jedes Ergebnis wird zwischengespeichert: Die Übersicht der
// Lehrkraft fragt alle 15 Sekunden nach und soll dabei weder warten noch den Server für andere blockieren.
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { evaluatePln } from './pln.js';

const CACHE_MAX = 600;
const cache = new Map(); // Schlüssel → Promise des Ergebnisses, älteste zuerst
let worker = null;
let nextId = 1;
const waiting = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./pln-eval-worker.js', import.meta.url));
  worker.on('message', ({ id, ev, error }) => {
    const w = waiting.get(id);
    if (!w) return;
    waiting.delete(id);
    if (!waiting.size) worker?.unref();
    if (error) w.reject(new Error(error));
    else w.resolve(ev);
  });
  const fail = (err) => {
    for (const w of waiting.values()) w.reject(err);
    waiting.clear();
    worker = null;
  };
  worker.on('error', fail);
  worker.on('exit', (code) => code && fail(new Error(`PLN-Auswertung beendet (${code})`)));
  return worker;
}

function inWorker(source, raw, rules) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    try {
      // Nur solange Aufträge offen sind, hält der Worker den Prozess am Leben.
      const w = getWorker();
      w.ref();
      w.postMessage({ id, source, raw, rules });
    } catch (err) {
      waiting.delete(id);
      reject(err);
    }
  });
}

// Liefert dasselbe wie evaluatePln, aber asynchron und zwischengespeichert.
export function evaluatePlnCached(source, raw, rules) {
  const key = createHash('sha256').update(JSON.stringify([source, raw ?? '', rules])).digest('base64');
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  // Fällt der Worker aus, wird im Hauptthread gerechnet: lieber langsam als gar keine Note.
  const p = inWorker(source, raw, rules).catch(() => evaluatePln(source, raw, rules));
  p.catch(() => cache.delete(key));
  cache.set(key, p);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return p;
}
