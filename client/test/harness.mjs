// Runs the unmodified userscript inside a VM sandbox with just enough of AMQ and the DOM mocked.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'amq_archipelago.user.js');

function fakeDocument() {
  const byId = {};
  const element = tag => ({
    tagName: tag, style: {}, dataset: {}, children: [], textContent: '', innerHTML: '', id: '',
    appendChild(child) { this.children.push(child); if (child.id) byId[child.id] = child; return child; },
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  return { head: element('head'), body: element('body'), createElement: element, getElementById: id => byId[id] || null,
    querySelectorAll: () => [] };
}

export async function loadClient({ WebSocket, storage = new Map(), selfId = 0 } = {}) {
  const listeners = {};
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, crypto: globalThis.crypto, WebSocket,
    document: fakeDocument(),
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k),
    },
    Listener: class { constructor(name, fn) { this.name = name; this.fn = fn; } bindListener() { (listeners[this.name] ||= []).push(this.fn); } },
    volumeController: { muted: false, adjustVolume() { this.adjusted = (this.adjusted || 0) + 1; } },
    quiz: { gameMode: 'Standard', players: { 0: { gamePlayerId: 0, _name: 'me' }, 1: { gamePlayerId: 1, _name: 'rival' } } },
    selfName: 'me',
  };
  sandbox.quiz.players[selfId].isSelf = true;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SCRIPT, 'utf8'), sandbox, { filename: 'amq_archipelago.user.js' });
  await new Promise(r => setTimeout(r, 600)); // boot waits for Listener on a 500ms interval
  const fire = (name, payload) => (listeners[name] || []).forEach(fn => fn(payload));
  return { api: sandbox.AMQAP, S: sandbox.AMQAP.state, fire, sandbox, storage, listeners };
}

/** An "answer results" payload. Placeholder strings only: no real titles or songs. */
export function answer({ type = 1, year = 2005, format = 'TV', difficulty = 45.5, genres = ['Action'],
  correct = true, scores = [0, 0] } = {}) {
  return {
    songInfo: {
      type, typeNumber: 1, vintage: `Spring ${year}`, animeType: format, animeDifficulty: difficulty,
      animeGenre: genres, animeTags: [], animeNames: { english: 'Placeholder', romaji: 'Placeholder' },
      songName: 'Placeholder', artist: 'Placeholder', altAnimeNames: [], altAnimeNamesAnswers: [],
    },
    players: [
      { gamePlayerId: 0, correct, score: scores[0] },
      { gamePlayerId: 1, correct: false, score: scores[1] },
    ],
  };
}

/** Fake socket: records what the client sends; tests push server messages with .server([...]). */
export class FakeSocket {
  static instances = [];
  constructor(url) {
    this.url = url; this.readyState = 0; this.sent = [];
    FakeSocket.instances.push(this);
    this.shouldFail = false; // subclasses set this to simulate a refused connection
    setTimeout(() => {
      if (this.shouldFail) { this.readyState = 3; this.onclose && this.onclose(); return; }
      this.readyState = 1; this.onopen && this.onopen();
    }, 0);
  }
  send(text) { this.sent.push(...JSON.parse(text)); }
  close() { this.readyState = 3; this.onclose && this.onclose(); }
  server(msgs) { this.onmessage({ data: JSON.stringify(msgs) }); }
  take(cmd) { const out = this.sent.filter(m => m.cmd === cmd); this.sent = this.sent.filter(m => m.cmd !== cmd); return out; }
}
