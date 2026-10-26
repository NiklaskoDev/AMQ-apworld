// Offline tests for the userscript: node --test client/test/
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { answer, FakeSocket, loadClient } from './harness.mjs';

const ITEMS = {
  'Opening Pass': 1, 'Ending Pass': 2, 'Decade Pass: 2000s': 12, 'Genre Key: Action': 20, 'Format Pass: TV': 60,
  'Progressive Rarity Lens': 70, 'Mixtape Fragment': 71, 'Encore Ticket': 80, 'Streak Shield': 81,
  'Mute Trap': 90, 'Reverse Typing Trap': 91, 'Streak Wipe Trap': 93, 'Tax Collector Trap': 94,
};
const CHECKS = [
  { id: 1010, name: 'Correct Answers: 10', kind: 'total', n: 10, stage: 0 },
  { id: 1040, name: 'Correct Answers: 40', kind: 'total', n: 40, stage: 2 },
  { id: 2000, name: 'First Correct Opening', kind: 'type', key: 'Opening', n: 1, stage: 0 },
  { id: 2500, name: 'Hot Streak: 3 in a Row', kind: 'streak', n: 3, stage: 0 },
  { id: 2601, name: 'Flawless Start: First 10 Songs', kind: 'flawless', n: 10, stage: 0 },
  { id: 2700, name: 'Podium Finish', kind: 'mp_podium', n: 4, stage: 0 },
  { id: 2701, name: 'Win a Multiplayer Game', kind: 'mp_win', n: 2, stage: 0 },
];
const slotData = extra => ({
  client_version: 2, goal: 'fragments', fragments_required: 4, finale_songs: 20, finale_accuracy: 70,
  stages: ['A', 'B', 'C', 'D'], stage_fragments: [0, 1, 2, 3],
  gated: ['Song Types', 'Decades', 'Genres', 'Formats', 'Rarity'], trap_duration: 2,
  death_link: true, death_link_misses: 3, checks: CHECKS, ...extra,
});
const START = ['Opening Pass', 'Decade Pass: 2000s', 'Genre Key: Action', 'Format Pass: TV'];
const items = names => names.map(n => ({ item: ITEMS[n], location: -2, player: 1, flags: 0 }));
const tick = () => new Promise(r => setTimeout(r, 5));

beforeEach(() => { FakeSocket.instances.length = 0; });

/** Connects a client through the full handshake. Starting items arrive before the data storage reply. */
async function connected({ storage, slot = {}, remote = null, seed = 'S1', selfId = 0, start = START } = {}) {
  const c = await loadClient({ WebSocket: FakeSocket, storage, selfId });
  c.api.connect('ws://test:1', 'Me', '');
  await tick();
  const ws = FakeSocket.instances.at(-1);
  ws.server([{ cmd: 'RoomInfo', seed_name: seed, games: ['Anime Music Quiz', 'Other Game'] }]);
  assert.deepEqual(JSON.parse(JSON.stringify(ws.take('GetDataPackage')[0].games)).sort(), ['Anime Music Quiz', 'Other Game']);
  ws.server([{ cmd: 'DataPackage', data: { games: {
    'Anime Music Quiz': { item_name_to_id: ITEMS, location_name_to_id: Object.fromEntries(CHECKS.map(x => [x.name, x.id])) },
    'Other Game': { item_name_to_id: { 'Big Sword': 5 }, location_name_to_id: { 'Cave Chest': 9 } },
  } } }]);
  assert.equal(ws.take('Connect')[0].name, 'Me');
  ws.server([{ cmd: 'Connected', team: 0, slot: 1, slot_data: slotData(slot), checked_locations: [],
    players: [{ team: 0, slot: 1, alias: 'Me', name: 'Me' }, { team: 0, slot: 2, alias: 'Friend', name: 'Friend' }],
    slot_info: { 1: { game: 'Anime Music Quiz' }, 2: { game: 'Other Game' } } }]);
  ws.server([{ cmd: 'ReceivedItems', index: 0, items: items(start) }]);
  assert.equal(c.S.ready, false, 'not ready before data storage answers');
  const get = ws.take('Get')[0];
  ws.server([{ cmd: 'Retrieved', keys: { [get.keys[0]]: remote } }]);
  assert.equal(c.S.ready, true);
  return { ...c, ws };
}
const sentChecks = ws => ws.take('LocationChecks').flatMap(m => m.locations);

test('handshake, eligible answers and stage-locked checks', async () => {
  const { ws, fire, S } = await connected();
  assert.deepEqual(JSON.parse(JSON.stringify(ws.take('ConnectUpdate')[0].tags)), ['DeathLink']);
  fire('quiz ready', {});
  for (let i = 0; i < 10; i++) fire('answer results', answer({ year: 2004 }));
  assert.deepEqual(sentChecks(ws).sort(), [1010, 2000, 2500, 2601]);
  for (let i = 0; i < 30; i++) fire('answer results', answer({ year: 2004 }));
  assert.equal(S.prog.total, 40);
  assert.deepEqual(sentChecks(ws), [], '"Correct Answers: 40" is in stage C and waits for 2 fragments');
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Mixtape Fragment', 'Mixtape Fragment']) }]);
  assert.deepEqual(sentChecks(ws), [1040], 'banked progress pays out when the stage opens');
});

test('ineligible songs are ignored and keep the streak', async () => {
  const { ws, fire, S } = await connected();
  fire('answer results', answer());
  fire('answer results', answer({ type: 2 }));
  assert.match(S.lastSong, /Ending locked/);
  fire('answer results', answer({ year: 1995 }));
  assert.match(S.lastSong, /1990s locked/);
  fire('answer results', answer({ format: 'movie' }));
  assert.match(S.lastSong, /Movie locked/);
  fire('answer results', answer({ difficulty: 12.5 }));
  assert.match(S.lastSong, /Hard songs locked/);
  fire('answer results', answer({ difficulty: 'Unrated' }));
  assert.match(S.lastSong, /unrated difficulty/);
  fire('answer results', answer({ genres: ['Romance'] }));
  assert.match(S.lastSong, /no unlocked genre/);
  assert.equal(S.prog.total, 1);
  assert.equal(S.game.streak, 1);
  assert.deepEqual(sentChecks(ws).sort(), [2000]);
});

test('ungated categories accept anything, including unrated songs', async () => {
  const { fire, S } = await connected({ slot: { gated: [] }, start: [] });
  fire('answer results', answer({ type: 3, year: 1979, format: 'ONA', difficulty: 'Unrated', genres: [] }));
  assert.equal(S.prog.total, 1);
});

test('genre data is normalised from strings or objects', async () => {
  const { fire, S } = await connected();
  fire('answer results', answer({ genres: [{ name: 'action' }, 'Slice of Life', { name: 'Unknown' }] }));
  assert.equal(S.prog.total, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(S.prog.genre)), { Action: 1 }, 'only unlocked genres are counted');
});

test('spectators and missing self are ignored', async () => {
  const { fire, S, sandbox } = await connected();
  sandbox.quiz.players[0].isSelf = false;
  sandbox.selfName = 'someone else';
  fire('answer results', answer());
  assert.equal(S.game.songs, 0);
});

test('encore doubles, shield absorbs, death link after misses', async () => {
  const { ws, fire, S } = await connected();
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Encore Ticket', 'Streak Shield']) }]);
  fire('answer results', answer());
  assert.equal(S.prog.total, 2);
  fire('answer results', answer({ correct: false }));
  assert.equal(S.game.streak, 1, 'shield kept the streak');
  for (let i = 0; i < 2; i++) fire('answer results', answer({ correct: false }));
  assert.equal(ws.take('Bounce').length, 0);
  fire('answer results', answer({ correct: false }));
  const [bounce] = ws.take('Bounce');
  assert.equal(bounce.data.source, 'Me');
});

test('death links from others wipe the streak and mute one song; own echo is ignored', async () => {
  const { ws, fire, S, sandbox } = await connected();
  for (let i = 0; i < 4; i++) fire('answer results', answer());
  ws.server([{ cmd: 'Bounced', tags: ['DeathLink'], data: { source: 'Me', time: 1 } }]);
  assert.equal(S.game.streak, 4);
  ws.server([{ cmd: 'Bounced', tags: ['DeathLink'], data: { source: 'Friend', cause: 'Friend fell.', time: 2 } }]);
  assert.equal(S.game.streak, 0);
  assert.equal(sandbox.volumeController.muted, true);
  fire('answer results', answer());
  assert.equal(sandbox.volumeController.muted, false);
});

test('timed traps last trap_duration songs; reverse typing uses css', async () => {
  const { ws, fire, sandbox } = await connected();
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Reverse Typing Trap']) }]);
  const css = () => sandbox.document.getElementById('amq-ap-trap-css').textContent;
  assert.match(css(), /qpAnswerInput\{direction:rtl/);
  fire('answer results', answer());
  assert.match(css(), /direction:rtl/);
  fire('answer results', answer());
  assert.doesNotMatch(css(), /direction:rtl/);
});

test('one-shot items are not replayed after reload, and seeds do not share storage', async () => {
  const storage = new Map();
  const first = await connected({ storage });
  first.ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Mute Trap', 'Tax Collector Trap']) }]);
  assert.equal(first.S.prog.traps.mute, 2);
  const [set] = first.ws.take('Set').slice(-1);
  const remote = JSON.parse(JSON.stringify(set.operations[0].value));

  const again = await connected({ storage, remote, start: [...START, 'Mute Trap', 'Tax Collector Trap'] });
  assert.equal(again.S.prog.traps.mute, 2, 'pending trap carried over, not doubled');
  assert.ok(!again.S.log.some(l => /Trap!/.test(l)));

  const otherSeed = await connected({ storage, seed: 'S2' });
  assert.equal(otherSeed.S.prog.processed, START.length);
  assert.equal(otherSeed.S.prog.traps.mute, 0);
});

test('an item index gap asks the server to resync', async () => {
  const { ws } = await connected();
  ws.server([{ cmd: 'ReceivedItems', index: 9, items: items(['Encore Ticket']) }]);
  assert.equal(ws.take('Sync').length, 1);
});

test('multiplayer checks are judged once at quiz over, ties share the better rank', async () => {
  const { ws, fire } = await connected();
  fire('quiz ready', {});
  fire('answer results', answer({ scores: [5, 5] }));
  sentChecks(ws);
  fire('quiz over', {});
  fire('quiz over', {});
  assert.deepEqual(sentChecks(ws), [2701], 'tied for first counts as a win; podium needs 4 players');
});

test('fragments goal sends StatusUpdate once', async () => {
  const { ws } = await connected();
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(Array(4).fill('Mixtape Fragment')) }]);
  ws.server([{ cmd: 'ReceivedItems', index: 8, items: items(['Encore Ticket']) }]);
  assert.deepEqual(ws.take('StatusUpdate').map(m => m.status), [30]);
});

test('finale goal needs a qualifying game after the fragments', async () => {
  const { ws, fire, S } = await connected({ slot: { goal: 'finale', finale_songs: 5, finale_accuracy: 80 } });
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(Array(4).fill('Mixtape Fragment')) }]);
  assert.equal(ws.take('StatusUpdate').length, 0);
  fire('quiz ready', {});
  for (let i = 0; i < 4; i++) fire('answer results', answer());
  fire('answer results', answer({ correct: false }));
  assert.equal(S.prog.finaleDone, true, '4/5 = 80%');
  assert.equal(ws.take('StatusUpdate').length, 1);
});

test('chat messages resolve players, items and locations across games', async () => {
  const { ws, S } = await connected();
  ws.server([{ cmd: 'PrintJSON', data: [
    { type: 'player_id', text: '2' }, { text: ' sent ' }, { type: 'item_id', text: '1', player: 1 },
    { text: ' from ' }, { type: 'location_id', text: '9', player: 2 },
  ] }]);
  assert.equal(S.log.at(-1), 'Friend sent Opening Pass from Cave Chest');
});

test('lobby guide merges neighbouring decades into one vintage range', async () => {
  const { ws, api } = await connected();
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Progressive Rarity Lens']) }]);
  const guide = Object.fromEntries(JSON.parse(JSON.stringify(api.lobbyGuide())));
  assert.equal(guide.Vintage, '2000–2009');
  assert.equal(guide['Song types'], 'Opening');
  assert.equal(guide.Difficulty, '10–100%');
});

test('no scheme tries wss first and falls back to ws', async () => {
  class FailingSecure extends FakeSocket {
    constructor(url) { super(url); this.shouldFail = url.startsWith('wss://'); }
  }
  const c = await loadClient({ WebSocket: FailingSecure });
  c.api.connect('localhost:38281', 'Me', '');
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(FakeSocket.instances.map(s => s.url), ['wss://localhost:38281', 'ws://localhost:38281']);
  c.api.disconnect();
});

const LIST_CHECKS = [
  { id: 2800, name: 'Home Turf: 10 Correct from Your List', kind: 'list_on', n: 2, stage: 0 },
  { id: 2803, name: 'Uncharted: 10 Correct off Your List', kind: 'list_off', n: 2, stage: 0 },
  { id: 2806, name: 'Best of Both', kind: 'game_list_mix', n: 1, stage: 0 },
];

test('song_source any: list status is irrelevant', async () => {
  const { fire, S } = await connected();
  fire('answer results', answer({ listStatus: 1 }));
  fire('answer results', answer());
  assert.equal(S.prog.total, 2);
  assert.doesNotMatch(S.lastSong, /list/);
});

test('song_source own_list: strict, off-list songs are ignored and keep the streak', async () => {
  const { fire, S, api } = await connected({ slot: { song_source: 'own_list' } });
  fire('answer results', answer({ listStatus: 1 }));
  assert.match(S.lastSong, /on list → counted/);
  fire('answer results', answer({ listStatus: null }));
  assert.match(S.lastSong, /ignored \(not on your list\)/);
  fire('answer results', answer({ listStatus: 0, correct: false }));
  assert.equal(S.prog.total, 1);
  assert.equal(S.game.streak, 1);
  const guide = Object.fromEntries(JSON.parse(JSON.stringify(api.lobbyGuide())));
  assert.equal(guide['Song selection'], 'watched only (your list)');
});

test('song_source mixed: everything counts and list checks track both sides', async () => {
  const { ws, fire, S } = await connected({ slot: { song_source: 'mixed', checks: [...CHECKS, ...LIST_CHECKS] } });
  sentChecks(ws);
  fire('quiz ready', {});
  fire('answer results', answer({ listStatus: 2 }));
  assert.deepEqual(sentChecks(ws).filter(id => id >= 2800), []);
  fire('answer results', answer());
  assert.deepEqual(sentChecks(ws).filter(id => id >= 2800), [2806], 'one of each in a game');
  fire('answer results', answer({ listStatus: 'watching' }));
  fire('answer results', answer({ listStatus: false }));
  assert.deepEqual(sentChecks(ws).filter(id => id >= 2800).sort(), [2800, 2803]);
  assert.equal(S.prog.total, 4);
  assert.match(S.lastSong, /off list → counted/);
});
