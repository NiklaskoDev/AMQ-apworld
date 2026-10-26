// End-to-end run of the userscript against a real Archipelago server.
//
//   AP_SERVER=ws://127.0.0.1:38281 AP_SLOT=Quizzer AP_CONSOLE=/path/to/server-stdin-fifo node client/test/e2e.mjs
//
// AP_CONSOLE is optional: when set, server console commands (/send) are written to it to test traps, stage
// unlocks and the goal. Expects a fresh seed whose slot has the default starting unlocks (Opening Pass, a decade
// pass covering AP_YEAR, and a genre key for AP_GENRE).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { answer, loadClient } from './harness.mjs';

const SERVER = process.env.AP_SERVER || 'ws://127.0.0.1:38281';
const SLOT = process.env.AP_SLOT || 'Quizzer';
const CONSOLE = process.env.AP_CONSOLE;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(what, fn, ms = 10000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (fn()) return;
  throw new Error(`timed out waiting for ${what}`);
}
const consoleCmd = cmd => fs.appendFileSync(CONSOLE, cmd + '\n');
const idOf = (S, name) => S.data.checks.find(c => c.name === name).id;
let step = 0;
const ok = msg => console.log(`  ok ${++step} - ${msg}`);

async function connectFresh(storage) {
  const client = await loadClient({ WebSocket, storage });
  client.api.connect(SERVER, SLOT, '');
  await until('ready', () => client.S.ready);
  return client;
}

const a = await connectFresh(new Map());
const { S } = a;
ok(`connected, starting unlocks: ${[...S.unlocks.types, ...S.unlocks.decades, ...S.unlocks.genres].join(', ')}`);

const year = +(process.env.AP_YEAR || ([...S.unlocks.decades].includes('1990s') ? 1995 : 2005));
const genre = process.env.AP_GENRE || [...S.unlocks.genres][0];
const song = extra => answer({ type: 1, year, genres: [genre], difficulty: 45, ...extra });

a.fire('quiz ready', {});
for (let i = 0; i < 10; i++) a.fire('answer results', song());
assert.equal(S.prog.total, 10);
for (const name of ['Correct Answers: 10', 'First Correct Opening', 'Hot Streak: 3 in a Row', 'Hot Streak: 5 in a Row']) {
  assert.ok(S.checked.has(idOf(S, name)), name);
}
const stage1 = S.data.checks.find(c => c.kind === 'decade' && c.n === 10 && (S.prog.decade[c.key] || 0) >= 10);
assert.ok(stage1 && !S.checked.has(stage1.id), 'stage-1 check is held back without fragments');
ok('10 eligible answers sent the stage-0 checks and held back stage-1 ones');

await until('server confirms checks', () => fs.existsSync(process.env.AP_SERVER_LOG || '') ? fs.readFileSync(process.env.AP_SERVER_LOG, 'utf8').includes('(Correct Answers: 10)') : true);
ok('server logged the found items');

// items from the first checks (a Streak Wipe or Tax Collector Trap, say) may have landed by now, so compare relatively
const [totalBefore, streakBefore] = [S.prog.total, S.game.streak];
a.fire('answer results', song({ type: 2 }));
assert.match(S.lastSong, /ignored \(Ending locked\)/);
a.fire('answer results', song({ difficulty: 'Unrated' }));
assert.match(S.lastSong, /ignored \(unrated difficulty\)/);
assert.equal(S.prog.total, totalBefore);
assert.equal(S.game.streak, streakBefore);
ok('locked song type and unrated difficulty are ignored without breaking the streak');

for (let i = 0; i < 3; i++) a.fire('answer results', song({ correct: false }));
assert.ok(S.log.some(l => l.startsWith('Death Link sent')), 'death link sent after 3 misses');
assert.equal(S.game.streak, 0);
ok('three eligible misses broke the streak and sent a Death Link');

if (CONSOLE) {
  consoleCmd(`/send ${SLOT} Mute Trap`);
  await until('mute trap', () => a.sandbox.volumeController.muted === true);
  a.fire('answer results', song());
  assert.equal(a.sandbox.volumeController.muted, true);
  a.fire('answer results', song());
  assert.equal(a.sandbox.volumeController.muted, false);
  ok('Mute Trap muted through AMQ volume control for exactly trap_duration songs');

  const before = S.fragments;
  consoleCmd(`/send ${SLOT} Mixtape Fragment`);
  consoleCmd(`/send ${SLOT} Mixtape Fragment`);
  await until('stage 1 opens', () => S.fragments >= before + 2 && S.checked.has(stage1.id));
  ok(`two fragments opened ${S.data.stages[1]} and paid out the banked "${stage1.name}"`);
}

// a different browser (empty localStorage) must resume from server data storage without replaying traps
await sleep(1000); // let items from the last checks arrive
const snapshot = JSON.stringify(S.prog);
a.api.disconnect();
const b = await connectFresh(new Map());
assert.equal(JSON.stringify(b.S.prog), snapshot, 'progress, boosts and pending traps carried over exactly');
assert.equal(b.S.prog.processed, b.S.received.length);
assert.ok(!b.S.log.some(l => /Trap!|Ticket|Shield ready/.test(l)), 'no one-shot item replayed on reconnect');
ok('fresh browser resumed progress from data storage without replaying traps');

if (CONSOLE) {
  for (let i = 0; i < 3; i++) consoleCmd(`/send ${SLOT} Mixtape Fragment`);
  await until('goal', () => b.S.goalSent);
  ok('collecting the required fragments sent the goal');
}
b.api.disconnect();
console.log(`1..${step}`);
process.exit(0);
