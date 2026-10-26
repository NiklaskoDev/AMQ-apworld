// Offline tests for the userscript: node --test client/test/
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { answer, FakeSocket, loadClient } from './harness.mjs';

const ITEMS = {
  'Opening Pass': 1, 'Ending Pass': 2, 'Decade Pass: 1980s & Earlier': 10, 'Decade Pass: 2000s': 12, 'Genre Key: Action': 20, 'Format Pass: TV': 60,
  'Progressive Rarity Lens': 70, 'Mixtape Fragment': 71, 'Progressive Guess Time': 72, 'Sample Pass: Middle': 73, 'Sample Pass: End': 74, 'Encore Ticket': 80, 'Streak Shield': 81, 'Hype Cheer': 82,
  'Mute Trap': 90, 'Reverse Typing Trap': 91, 'Tiny Text Trap': 92, 'Streak Wipe Trap': 93, 'Tax Collector Trap': 94,
  'Mulligan': 83, 'Spotlight': 84, 'Blind Trap': 95, 'Song Category: Standard': 100, 'Song Category: Instrumental': 101,
  'Song Category: Chanting': 102, 'Song Category: Character': 103, 'Progressive Score Lens': 110, 'Dub Pass': 111,
  'Rebroadcast Pass': 112,
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
  client_version: 5, goal: 'fragments', fragments_required: 4, finale_songs: 20, finale_accuracy: 70,
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
  return { ...c, ws: handshake(c, { slot, remote, seed, start }) };
}
/** Plays the server side of a login on the newest socket. */
function handshake(c, { slot = {}, remote = null, seed = 'S1', start = START } = {}) {
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
  return ws;
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

test('custom difficulty floors and free tiers come from slot data', async () => {
  const slot = { difficulty_floors: { Easy: 80, Medium: 50, Hard: 20, Brutal: 0 }, free_difficulty_tiers: 1 };
  const { ws, fire, S, api } = await connected({ slot });
  fire('answer results', answer({ difficulty: 85 }));
  assert.match(S.lastSong, /Easy → counted/);
  fire('answer results', answer({ difficulty: 70 }));
  assert.match(S.lastSong, /ignored \(Medium songs locked\)/, '70% is Medium with these floors and only Easy is free');
  let guide = Object.fromEntries(JSON.parse(JSON.stringify(api.lobbyGuide())));
  assert.equal(guide.Difficulty, '80–100%');
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Progressive Rarity Lens']) }]);
  fire('answer results', answer({ difficulty: 70 }));
  assert.match(S.lastSong, /Medium → counted/);
  guide = Object.fromEntries(JSON.parse(JSON.stringify(api.lobbyGuide())));
  assert.equal(guide.Difficulty, '50–100%');
});

test('seeds without difficulty settings keep the old defaults', async () => {
  const { fire, S } = await connected();
  fire('answer results', answer({ difficulty: 30 }));
  assert.match(S.lastSong, /Medium → counted/);
  fire('answer results', answer({ difficulty: 20 }));
  assert.match(S.lastSong, /Hard songs locked/);
});

test('hype cheer adds milestone progress and shortens active traps', async () => {
  const { ws, fire, S } = await connected();
  for (let i = 0; i < 8; i++) fire('answer results', answer());
  sentChecks(ws);
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Mute Trap', 'Hype Cheer']) }]);
  assert.equal(S.prog.total, 10);
  assert.deepEqual(sentChecks(ws), [1010], 'the cheer can complete a milestone');
  assert.equal(S.prog.traps.mute, 1, 'two-song mute trap cut to one');
});

const SEASON_CHECKS = [
  { id: 2900, name: 'Fall Listener: 10 Correct', kind: 'season', key: 'Fall', n: 2, stage: 0 },
  { id: 2904, name: 'Four Seasons', kind: 'game_seasons', n: 4, stage: 0 },
];

test('seasons are read from the vintage and counted per song and per game', async () => {
  const { ws, fire, S, api } = await connected({ slot: { checks: [...CHECKS, ...SEASON_CHECKS] } });
  assert.equal(api.extractSong(answer({ season: 'Autumn' })).season, 'Fall');
  assert.equal(api.extractSong({ songInfo: { vintage: '2005' } }).season, null);
  fire('quiz ready', {});
  fire('answer results', answer({ season: 'Fall' }));
  fire('answer results', answer({ season: 'Fall', type: 2 }));
  assert.equal(S.prog.season.Fall, 1, 'ignored songs do not count');
  fire('answer results', answer({ season: 'Winter' }));
  fire('answer results', answer({ season: 'Summer' }));
  sentChecks(ws);
  fire('answer results', answer({ season: 'Fall' }));
  assert.ok(sentChecks(ws).includes(2900));
  fire('quiz ready', {});
  fire('answer results', answer({ season: 'Spring' }));
  assert.ok(!sentChecks(ws).includes(2904), 'a new game starts the season set over');
});

test('progress saved by an older client gains the season bucket', async () => {
  const remote = { v: 1, total: 3, type: {}, decade: {}, genre: {}, format: {}, rarity: {}, listOn: 0, listOff: 0,
    processed: 4, encore: 0, shield: 0, traps: { mute: 0, reverse: 0, tiny: 0 }, finaleDone: false };
  const { fire, S } = await connected({ remote });
  fire('answer results', answer({ season: 'Winter' }));
  assert.equal(S.prog.season.Winter, 1);
  assert.equal(S.prog.total, 4);
});

function withChat(sandbox) {
  const lines = [];
  sandbox.gameChat = { systemMessage: text => lines.push(text) };
  return lines;
}

test('chat bridge posts relevant multiworld messages and traps to AMQ chat', async () => {
  const { ws, S, sandbox } = await connected();
  const lines = withChat(sandbox);
  const itemSend = (from, to) => ({ cmd: 'PrintJSON', type: 'ItemSend', receiving: to, item: { item: 5, location: 9, player: from },
    data: [{ type: 'player_id', text: String(from) }, { text: ' sent an item' }] });
  ws.server([itemSend(2, 1)]);
  ws.server([itemSend(2, 3)]);
  ws.server([{ cmd: 'PrintJSON', type: 'Join', data: [{ text: 'Someone joined' }] }]);
  ws.server([{ cmd: 'PrintJSON', type: 'Chat', slot: 2, message: 'hi', data: [{ text: 'Friend: hi <b>' }] }]);
  assert.deepEqual(lines, ['[AP] Friend sent an item', '[AP] Friend: hi &lt;b&gt;'], 'others\' items and joins are skipped, text is escaped');
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Streak Wipe Trap']) }]);
  assert.match(lines.at(-1), /Streak Wipe Trap!/);
  S.chatMode = 'all';
  ws.server([itemSend(2, 3)]);
  assert.equal(lines.length, 4);
  S.chatMode = 'off';
  ws.server([itemSend(2, 1)]);
  ws.server([{ cmd: 'ReceivedItems', index: 5, items: items(['Mute Trap']) }]);
  assert.equal(lines.length, 4);
  assert.equal(S.log.at(-1), 'Mute Trap! Lasts 2 songs.', 'the panel log still gets everything');
});

test('/ap in AMQ chat is intercepted and sent to the multiworld', async () => {
  const { ws, sandbox, fire } = await connected();
  const lines = withChat(sandbox);
  const doc = sandbox.document;
  const input = { id: 'gcInput', value: '/ap !hint Big Sword' };
  assert.equal(doc.key('keydown', 'Enter', input), true);
  assert.equal(doc.key('keypress', 'Enter', input), true, 'AMQ never sees the Enter');
  doc.key('keyup', 'Enter', input);
  assert.equal(input.value, '');
  assert.deepEqual(ws.take('Say').map(m => m.text), ['!hint Big Sword']);

  const plain = { id: 'gcInput', value: 'hello room' };
  assert.equal(doc.key('keydown', 'Enter', plain), false);
  assert.equal(doc.key('keypress', 'Enter', plain), false);
  assert.equal(doc.key('keydown', 'Enter', { id: 'qpAnswerInput', value: '/ap x' }), false, 'only the chat box');

  input.value = '/ap help';
  doc.key('keydown', 'Enter', input);
  assert.match(lines.at(-1), /\/ap !hint/);
  assert.equal(ws.take('Say').length, 0);

  fire('game chat update', { messages: [{ sender: 'me', message: '/ap !remaining' }, { sender: 'rival', message: '/ap !release' }] });
  assert.deepEqual(ws.take('Say').map(m => m.text), ['!remaining'], 'fallback: own echoed commands only');
  fire('Game Chat Message', { sender: 'me', message: '/ap !remaining' });
  assert.equal(ws.take('Say').length, 0, 'the same echo from the other chat event is not sent twice');
});

/** A room settings object shaped like AMQ's. */
const roomSettings = () => ({
  numberOfSongs: 20,
  songType: { standardValue: { openings: true, endings: true, inserts: true }, advancedValue: { openings: 0, endings: 0, inserts: 0, random: 20 } },
  vintage: { standardValue: { years: [1944, 2026], seasons: [0, 3] }, advancedValueList: [] },
  type: { tv: true, movie: true, ova: true, ona: true, special: true },
  songDifficulity: { advancedOn: false, standardValue: { easy: true, medium: true, hard: true }, advancedValue: [0, 100] },
  genre: [],
  songSelection: { standardValue: 1, advancedValue: { random: 20, unwatched: 0, watched: 0 } },
  guessTime: { randomOn: false, standardValue: 20 },
});
function withRoom(sandbox, { host = true } = {}) {
  const calls = [];
  sandbox.lobby = { inLobby: true, isHost: host, settings: roomSettings(), changeGameSettings() { calls.push('commit'); } };
  sandbox.hostModal = { getSettings: () => roomSettings(), changeSettings: diff => calls.push(JSON.parse(JSON.stringify(diff))),
    DEFUALT_SETTINGS: { vintage: { standardValue: { years: [1944, 2026] } } } };
  sandbox.idTranslator = { genreNames: { 1: 'Action', 2: 'Adventure', 3: 'Comedy', 17: 'Slice of Life' } };
  return calls;
}

test('apply to room writes the unlocks into the host settings', async () => {
  const { ws, S, api, sandbox } = await connected({ slot: { song_source: 'own_list' } });
  const calls = withRoom(sandbox);
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Ending Pass', 'Progressive Rarity Lens']) }]);
  api.applyLobby();
  await tick();
  const [diff, commit] = calls;
  assert.equal(commit, 'commit');
  assert.deepEqual(diff.songType.standardValue, { openings: true, endings: true, inserts: false });
  assert.deepEqual(diff.vintage.standardValue, { years: [2000, 2009], seasons: [0, 3] });
  assert.deepEqual(diff.type, { tv: true, movie: false, ova: false, ona: false, special: false });
  assert.deepEqual(diff.songDifficulity.advancedValue, [10, 100]);
  assert.equal(diff.songDifficulity.advancedOn, true);
  assert.deepEqual(diff.genre, [{ id: '1', state: 3 }]);
  assert.equal(diff.songSelection.standardValue, 3);
  assert.equal(diff.guessTime, undefined, 'only changed keys are sent');
  assert.match(S.log.at(-1), /^Lobby updated: song types, vintage, anime type, difficulty, genres, song selection\.$/);

  sandbox.lobby.settings = Object.assign(roomSettings(), diff);
  calls.length = 0;
  api.applyLobby();
  assert.deepEqual(calls, []);
  assert.match(S.log.at(-1), /already matches/);
});

test('apply to room explains what it cannot do', async () => {
  const { ws, S, api, sandbox } = await connected();
  api.applyLobby();
  assert.equal(S.log.at(-1), 'Join a lobby first.');
  const calls = withRoom(sandbox, { host: false });
  api.applyLobby();
  assert.equal(S.log.at(-1), 'Only the room host can change the settings.');
  sandbox.lobby.isHost = true;
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Decade Pass: 1980s & Earlier']) }]);
  api.applyLobby();
  assert.match(S.log.at(-1), /Set by hand: vintage \(your decades are not one range\)\./);
  assert.ok(calls.length > 0, 'the other categories are still applied');
});

test('ungated categories are left alone when applying', async () => {
  const { api } = await connected({ slot: { gated: ['Song Types'] }, start: ['Opening Pass'] });
  const s = roomSettings();
  const r = api.lobbySettingsFor(s, api.lobbyWish());
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { done: ['song types'], manual: [] });
  assert.deepEqual(s.vintage, roomSettings().vintage);
  assert.deepEqual(s.genre, []);
});

test('open checks are scouted on connect without creating hints', async () => {
  const { ws, S, api } = await connected();
  const [scout] = ws.take('LocationScouts');
  assert.deepEqual(JSON.parse(JSON.stringify(scout.locations)).sort(), CHECKS.map(c => c.id).sort());
  assert.equal(scout.create_as_hint, 0);
  ws.server([{ cmd: 'LocationInfo', locations: [
    { item: 5, location: 2000, player: 2, flags: 1 },
    { item: 80, location: 2500, player: 1, flags: 2 },
    { item: 90, location: 2601, player: 1, flags: 4 },
  ] }]);
  assert.equal(api.scoutLabel(2000), "Friend's Big Sword (progression)");
  assert.equal(api.scoutLabel(2500), 'your Encore Ticket (useful)');
  assert.equal(api.scoutLabel(2601), 'your Mute Trap (trap)');
  assert.equal(api.scoutLabel(1010), '', 'not scouted yet');
  S.scoutMode = 'importance';
  assert.equal(api.scoutLabel(2000), 'progression');
  S.scoutMode = 'off';
  assert.equal(api.scoutLabel(2000), '');
});

test('already checked locations are not scouted', async () => {
  const c = await loadClient({ WebSocket: FakeSocket });
  c.api.connect('ws://test:1', 'Me', '');
  await tick();
  const ws = FakeSocket.instances.at(-1);
  ws.server([{ cmd: 'RoomInfo', seed_name: 'S1', games: ['Anime Music Quiz'] }]);
  ws.server([{ cmd: 'DataPackage', data: { games: { 'Anime Music Quiz': { item_name_to_id: ITEMS, location_name_to_id: {} } } } }]);
  ws.server([{ cmd: 'Connected', team: 0, slot: 1, slot_data: slotData(), checked_locations: CHECKS.map(x => x.id).filter(id => id !== 2000),
    players: [], slot_info: {} }]);
  assert.deepEqual(JSON.parse(JSON.stringify(ws.take('LocationScouts')[0].locations)), [2000]);
});

const GT = { gated: ['Song Types', 'Decades', 'Genres', 'Formats', 'Rarity', 'Guess Time'], guess_time: { start: 10, step: 5 } };
const room = (sandbox, guessTime) => { sandbox.lobby = { inLobby: true, isHost: true, settings: { guessTime } }; };

test('guess time: songs only count when the room timer is within the allowed time', async () => {
  const { ws, fire, S, api, sandbox } = await connected({ slot: GT });
  room(sandbox, { randomOn: false, standardValue: 20 });
  fire('answer results', answer());
  assert.match(S.lastSong, /ignored \(guess time 20s, 10s allowed\)/);
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Progressive Guess Time']) }]);
  fire('answer results', answer());
  assert.match(S.lastSong, /ignored \(guess time 20s, 15s allowed\)/);
  ws.server([{ cmd: 'ReceivedItems', index: 5, items: items(['Progressive Guess Time']) }]);
  fire('answer results', answer());
  assert.match(S.lastSong, /→ counted/);
  room(sandbox, { randomOn: true, standardValue: 5, randomValue: [5, 25] });
  fire('answer results', answer());
  assert.match(S.lastSong, /guess time 25s/, 'a random timer is judged by its longest value');
  assert.equal(S.prog.total, 1);
  const guide = Object.fromEntries(JSON.parse(JSON.stringify(api.lobbyGuide())));
  assert.equal(guide['Guess time'], '20s or less');
});

test('guess time: an unreadable room timer counts and warns once', async () => {
  const { fire, S } = await connected({ slot: GT });
  fire('answer results', answer());
  fire('answer results', answer());
  assert.equal(S.prog.total, 2);
  assert.equal(S.log.filter(l => /guess time/.test(l)).length, 1);
});

test('guess time is ignored unless gated', async () => {
  const { fire, S, api, sandbox } = await connected();
  room(sandbox, { randomOn: false, standardValue: 60 });
  fire('answer results', answer());
  assert.match(S.lastSong, /→ counted/);
  assert.equal(api.lobbyWish().guessTime, undefined);
});

test('apply to room shortens a too-long guess time and leaves a shorter one', async () => {
  const { api } = await connected({ slot: GT });
  const long = { guessTime: { randomOn: true, standardValue: 20, randomValue: [5, 30] } };
  assert.deepEqual(JSON.parse(JSON.stringify(api.lobbySettingsFor(long, api.lobbyWish()))).done.includes('guess time'), true);
  assert.deepEqual(long.guessTime, { randomOn: false, standardValue: 10, randomValue: [5, 30] });
  const short = { guessTime: { randomOn: false, standardValue: 7 } };
  api.lobbySettingsFor(short, { guessTime: 10 });
  assert.equal(short.guessTime.standardValue, 7);
});

const SP = { gated: ['Song Types', 'Decades', 'Genres', 'Formats', 'Rarity', 'Sample Point'],
  checks: [...CHECKS, { id: 3101, name: 'Middle Sample: 10 Correct', kind: 'sample', key: 'Middle', n: 2, stage: 0 }] };
const sampleRoom = (sandbox, samplePoint) => { sandbox.lobby = { inLobby: true, isHost: true, settings: { samplePoint } }; };

test('sample point: locked points are ignored, passes open them and count toward their check', async () => {
  const { ws, fire, S, api, sandbox } = await connected({ slot: SP });
  sampleRoom(sandbox, { randomOn: false, standardValue: 1 });
  fire('answer results', answer());
  assert.match(S.lastSong, /Start sample → counted/);
  sampleRoom(sandbox, { randomOn: false, standardValue: 2 });
  fire('answer results', answer());
  assert.match(S.lastSong, /ignored \(Middle sample point locked\)/);
  sampleRoom(sandbox, { randomOn: true, standardValue: 1, randomValue: [0, 100] });
  fire('answer results', answer());
  assert.match(S.lastSong, /Random sample point locked/);
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Sample Pass: Middle']) }]);
  sampleRoom(sandbox, { randomOn: false, standardValue: 2 });
  sentChecks(ws);
  fire('answer results', answer());
  fire('answer results', answer());
  assert.deepEqual(sentChecks(ws).filter(id => id === 3101), [3101]);
  const guide = Object.fromEntries(JSON.parse(JSON.stringify(api.lobbyGuide())));
  assert.equal(guide['Sample point'], 'Start, Middle');
  const room = { samplePoint: { randomOn: true, standardValue: 2, randomValue: [0, 100] } };
  api.lobbySettingsFor(room, api.lobbyWish());
  assert.deepEqual(room.samplePoint, { randomOn: false, standardValue: 1, randomValue: [0, 100] }, 'a locked point falls back to Start');
  const ok = { samplePoint: { randomOn: false, standardValue: 2 } };
  api.lobbySettingsFor(ok, api.lobbyWish());
  assert.equal(ok.samplePoint.standardValue, 2, 'an unlocked point is kept');
});

const COMEBACKS = [
  { id: 3000, name: 'Bounce Back', kind: 'bounce', n: 2, stage: 0 },
  { id: 3002, name: 'Comeback', kind: 'comeback', n: 3, stage: 0 },
  { id: 3003, name: 'Strong Finish', kind: 'finish', n: 3, stage: 0 },
];

test('comebacks: bounce back, comeback after three misses, strong finish at quiz over', async () => {
  const { ws, fire, S } = await connected({ slot: { checks: [...CHECKS, ...COMEBACKS], death_link: false } });
  sentChecks(ws);
  fire('quiz ready', {});
  const miss = () => fire('answer results', answer({ correct: false }));
  const hit = () => fire('answer results', answer());
  miss(); hit();
  assert.equal(S.prog.bounce, 1);
  hit();
  assert.equal(S.prog.bounce, 1, 'only the answer right after a miss');
  miss(); miss(); hit(); hit();
  assert.deepEqual(sentChecks(ws).filter(id => id >= 3000), [3000]);
  miss(); miss(); miss();
  hit(); hit(); hit();
  assert.deepEqual(sentChecks(ws).filter(id => id >= 3000), [3002], 'finish waits for the end of the game');
  fire('quiz over', {});
  assert.deepEqual(sentChecks(ws).filter(id => id >= 3000), [3003]);
});

test('strong finish needs the streak at the very end', async () => {
  const { ws, fire } = await connected({ slot: { checks: [...CHECKS, ...COMEBACKS], death_link: false } });
  sentChecks(ws);
  fire('quiz ready', {});
  for (let i = 0; i < 4; i++) fire('answer results', answer());
  fire('answer results', answer({ correct: false }));
  fire('quiz over', {});
  assert.ok(!sentChecks(ws).includes(3003));
});

test('trap link: received traps are shared, linked ones are matched by name', async () => {
  const { ws, S } = await connected({ slot: { trap_link: true, death_link: false } });
  assert.deepEqual(JSON.parse(JSON.stringify(ws.take('ConnectUpdate')[0].tags)), ['TrapLink']);
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Tiny Text Trap', 'Encore Ticket']) }]);
  const out = ws.take('Bounce');
  assert.equal(out.length, 1, 'only traps are shared');
  assert.deepEqual([...out[0].tags], ['TrapLink']);
  assert.equal(out[0].data.trap_name, 'Tiny Text Trap');
  assert.equal(out[0].data.source, 'Me');

  const link = (trap_name, source = 'Friend') => ws.server([{ cmd: 'Bounced', tags: ['TrapLink'], data: { time: 1, source, trap_name } }]);
  link('Silence Trap');
  assert.equal(S.prog.traps.mute, 2);
  assert.match(S.log.at(-1), /^TrapLink from Friend \(Silence Trap\): Mute Trap!/);
  link('Confusion Trap');
  assert.equal(S.prog.traps.reverse, 2);
  S.prog.total = 9;
  link('Rupee Tax');
  assert.equal(S.prog.total, 4);
  link('Tiny Text Trap', 'Me');
  assert.equal(S.prog.traps.tiny, 2, 'own echo ignored');
  link('Gravity Trap');
  assert.match(S.log.at(-1), /no match here/);
  assert.equal(ws.take('Bounce').length, 0, 'linked traps are not passed on again');
});

test('trap link off: nothing is shared or received', async () => {
  const { ws, S } = await connected({ slot: { death_link: false } });
  assert.equal(ws.take('ConnectUpdate').length, 0);
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Mute Trap']) }]);
  ws.server([{ cmd: 'Bounced', tags: ['TrapLink'], data: { time: 1, source: 'Friend', trap_name: 'Mute Trap' } }]);
  assert.equal(S.prog.traps.mute, 2);
  assert.equal(ws.take('Bounce').length, 0);
});

const GENRE_CHECKS = [
  { id: 2200, name: 'Genre Scholar: Action', kind: 'genre', key: 'Action', n: 1, stage: 0 },
  { id: 2201, name: 'Genre Scholar: Adventure', kind: 'genre', key: 'Adventure', n: 1, stage: 0 },
];

test('scholar goal needs the fragments and every genre check, also when collected remotely', async () => {
  const { ws, fire } = await connected({ slot: { goal: 'scholar', goal_kinds: ['genre'], checks: [...CHECKS, ...GENRE_CHECKS] } });
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(Array(4).fill('Mixtape Fragment')) }]);
  fire('answer results', answer());
  assert.ok(sentChecks(ws).includes(2200));
  assert.equal(ws.take('StatusUpdate').length, 0, 'Adventure is still open');
  ws.server([{ cmd: 'RoomUpdate', checked_locations: [2201] }]);
  assert.deepEqual(ws.take('StatusUpdate').map(m => m.status), [30]);
});

test('a lobby letting in mostly locked songs gets one warning per game', async () => {
  const { fire, S, sandbox } = await connected();
  const lines = [];
  sandbox.gameChat = { systemMessage: t => lines.push(t) };
  fire('quiz ready', {});
  fire('answer results', answer());
  for (let i = 0; i < 4; i++) fire('answer results', answer({ type: 2 }));
  assert.equal(lines.filter(l => /didn't count/.test(l)).length, 1);
  assert.match(lines.at(-1), /4 of 5 songs this game didn't count \(most often: Ending locked\)/);
  for (let i = 0; i < 5; i++) fire('answer results', answer({ type: 2 }));
  assert.equal(lines.filter(l => /didn't count/.test(l)).length, 1, 'once per game');
  fire('quiz ready', {});
  for (let i = 0; i < 5; i++) fire('answer results', answer({ year: 1995 }));
  assert.equal(lines.filter(l => /didn't count/.test(l)).length, 2);
  assert.match(S.log.at(-1), /1990s locked/);
});

// ---------- song categories, anime score, dubs and rebroadcasts ----------
const ALL_GATES = ['Song Types', 'Decades', 'Genres', 'Formats', 'Rarity'];
const CATEGORY_CHECKS = [
  { id: 3200, name: 'Standard Songs: 10 Correct', kind: 'category', key: 'Standard', n: 2, stage: 0 },
  { id: 3201, name: 'Instrumental Songs: 1 Correct', kind: 'category', key: 'Instrumental', n: 1, stage: 0 },
];

test('song category: unreadable counts and warns once, locked categories are ignored until their pass', async () => {
  const { ws, fire, S, api } = await connected({ slot: { gated: [...ALL_GATES, 'Song Category'], checks: [...CHECKS, ...CATEGORY_CHECKS] } });
  sentChecks(ws);
  fire('answer results', answer({ extra: { songCategory: 7 } }));
  fire('answer results', answer());
  assert.equal(S.prog.total, 2, 'songs without a readable category still count');
  assert.equal(S.log.filter(l => /Can't read the song category/.test(l)).length, 1);
  assert.match(S.log.find(l => /Can't read the song category/.test(l)), /AMQ sent 7/);
  fire('answer results', answer({ extra: { songCategory: 'Instrumental' } }));
  assert.match(S.lastSong, /ignored \(Instrumental songs locked\)/);
  fire('answer results', answer({ extra: { songCategory: 'standard' } }));
  fire('answer results', answer({ extra: { songCategory: { name: 'Standard' } } }));
  assert.deepEqual(sentChecks(ws).filter(id => id >= 3200), [3200]);
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Song Category: Instrumental']) }]);
  fire('answer results', answer({ extra: { songCategory: 'Instrumental' } }));
  assert.deepEqual(sentChecks(ws).filter(id => id >= 3200), [3201]);
  const room = { songCategories: { standard: true, instrumental: { openings: false, endings: true, inserts: true }, chanting: true, character: true } };
  const r = api.lobbySettingsFor(room, api.lobbyWish());
  assert.deepEqual(JSON.parse(JSON.stringify(room.songCategories)), { standard: true,
    instrumental: { openings: true, endings: true, inserts: true }, chanting: false, character: false });
  assert.ok(r.done.includes('song categories'));
  assert.ok(api.lobbySettingsFor({}, api.lobbyWish()).manual.includes('song categories'), 'unknown shape: set by hand');
  assert.ok(api.missingUnlocks().includes('Song Category: Chanting'));
});

const SCORE_CHECKS = [
  { id: 3300, name: 'Acclaimed Anime Songs x10', kind: 'score', key: 'Acclaimed', n: 1, stage: 0 },
  { id: 3302, name: 'Mixed Anime Songs x5', kind: 'score', key: 'Mixed', n: 1, stage: 0 },
];

test('anime score: open tiers count, lower ones need lenses, unscored anime are ignored', async () => {
  const { ws, fire, S, api } = await connected({ slot: { gated: [...ALL_GATES, 'Anime Score'], checks: [...CHECKS, ...SCORE_CHECKS] } });
  sentChecks(ws);
  fire('answer results', answer({ extra: { animeScore: 8.4 } }));
  assert.match(S.lastSong, /Acclaimed anime → counted/);
  fire('answer results', answer({ extra: { animeScore: '7.1' } }));
  assert.equal(S.prog.score['Well Liked'], 1);
  fire('answer results', answer({ extra: { animeScore: 6.5 } }));
  assert.match(S.lastSong, /ignored \(Mixed anime locked\)/);
  fire('answer results', answer({ extra: { animeScore: null } }));
  assert.match(S.lastSong, /ignored \(unscored anime\)/);
  assert.equal(api.lobbyGuide().find(([k]) => k === 'Anime score')[1], '7–10');
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Progressive Score Lens']) }]);
  fire('answer results', answer({ extra: { animeScore: 6.5 } }));
  assert.deepEqual(sentChecks(ws).filter(id => id >= 3300).sort(), [3300, 3302]);
  const room = { animeScore: { standardValue: [2, 10], advancedOn: true } };
  api.lobbySettingsFor(room, api.lobbyWish());
  assert.deepEqual(JSON.parse(JSON.stringify(room.animeScore)), { standardValue: [6, 10], advancedOn: false });
});

test('dubs and rebroadcasts: ignored until their pass, then counted toward their checks', async () => {
  const DUBS = [{ id: 3400, name: 'First Correct Dub', kind: 'dub', key: 'Dub', n: 1, stage: 0 },
    { id: 3402, name: 'First Correct Rebroadcast', kind: 'dub', key: 'Rebroadcast', n: 1, stage: 0 }];
  const { ws, fire, S, api } = await connected({ slot: { gated: [...ALL_GATES, 'Dub & Rebroadcast'], checks: [...CHECKS, ...DUBS] } });
  sentChecks(ws);
  fire('answer results', answer());
  assert.equal(S.log.filter(l => /dubs and rebroadcasts/.test(l)).length, 1, 'missing flags warn once');
  fire('answer results', answer({ extra: { isDub: true, isRebroadcast: false } }));
  assert.match(S.lastSong, /ignored \(dub songs locked\)/);
  fire('answer results', answer({ extra: { isDub: false, isRebroadcast: true } }));
  assert.match(S.lastSong, /ignored \(rebroadcasts locked\)/);
  const room = { dubSongs: true, rebroadcastSongs: true };
  api.lobbySettingsFor(room, api.lobbyWish());
  assert.deepEqual(room, { dubSongs: false, rebroadcastSongs: false });
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Dub Pass', 'Rebroadcast Pass']) }]);
  fire('answer results', answer({ extra: { isDub: true, isRebroadcast: false } }));
  fire('answer results', answer({ extra: { isDub: false, isRebroadcast: true } }));
  assert.deepEqual(sentChecks(ws).filter(id => id >= 3400).sort(), [3400, 3402]);
});

// ---------- quick draw, year collector, nexus ----------
test('quick draw: answers locked in with Enter soon after the song starts count, slow or unsent ones do not', async () => {
  const QUICK = [{ id: 3500, name: 'Quick Draw: 2 Correct within 5s', kind: 'quick', n: 2, secs: 5, stage: 0 },
    { id: 3502, name: 'Quick Draw: 1 Correct within 3s', kind: 'quick', n: 1, secs: 3, stage: 0 }];
  const { ws, fire, S, sandbox } = await connected({ slot: { checks: [...CHECKS, ...QUICK] } });
  sentChecks(ws);
  const input = { id: 'qpAnswerInput', value: 'x' };
  fire('play next song', {});
  sandbox.document.key('keydown', 'Enter', input);
  fire('answer results', answer());
  assert.equal(S.prog.quick[3], 1);
  assert.match(S.lastSong, /counted in 0\.\ds/);
  fire('play next song', {});
  fire('answer results', answer());
  assert.equal(S.prog.quick[5], 1, 'no Enter: autosubmitted at the end, not quick');
  fire('play next song', {});
  S.songStart -= 4000;
  sandbox.document.key('keydown', 'Enter', input);
  fire('answer results', answer());
  assert.deepEqual([S.prog.quick[3], S.prog.quick[5]], [1, 2]);
  assert.deepEqual(sentChecks(ws).filter(id => id >= 3500).sort(), [3500, 3502]);
});

test('year collector counts distinct years, nexus checks count answers in Nexus', async () => {
  const MORE = [{ id: 2612, name: 'Year Collector: 10 Different Years', kind: 'years', n: 3, stage: 0 },
    { id: 3600, name: 'Nexus Explorer: 10 Correct in Nexus', kind: 'nexus', n: 2, stage: 0 }];
  const { ws, fire, S, sandbox } = await connected({ slot: { checks: [...CHECKS, ...MORE] } });
  sentChecks(ws);
  for (const year of [2001, 2001, 2002]) fire('answer results', answer({ year }));
  assert.equal(Object.keys(S.prog.years).length, 2);
  sandbox.quiz.gameMode = 'Nexus';
  fire('answer results', answer({ year: 2003 }));
  fire('answer results', answer({ year: 2003 }));
  assert.equal(S.prog.nexus, 2);
  assert.deepEqual(sentChecks(ws).filter(id => id >= 2612).sort(), [2612, 3600]);
});

// ---------- new items and traps ----------
test('mulligan forgives a miss entirely; spotlight doubles category counts but not milestones', async () => {
  const { ws, fire, S } = await connected();
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Mulligan', 'Spotlight', 'Streak Shield']) }]);
  fire('quiz ready', {});
  fire('answer results', answer());
  assert.equal(S.prog.total, 1);
  assert.equal(S.prog.type.Opening, 2, 'spotlight');
  assert.equal(S.prog.genre.Action, 2);
  fire('answer results', answer({ correct: false }));
  assert.match(S.lastSong, /Mulligan used/);
  assert.deepEqual([S.game.eligible, S.game.eligibleCorrect, S.game.streak, S.prog.shield], [1, 1, 1, 1], 'the song never happened');
  fire('answer results', answer({ correct: false }));
  assert.match(S.lastSong, /Streak Shield held/);
});

test('blind trap hides the quiz video; trap link maps darkness to it', async () => {
  const { ws, fire, S, sandbox } = await connected({ slot: { trap_link: true, death_link: false } });
  const css = () => sandbox.document.getElementById('amq-ap-trap-css').textContent;
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Blind Trap']) }]);
  assert.match(css(), /#qpVideosInner video[^{]*\{visibility:hidden/);
  fire('answer results', answer());
  fire('answer results', answer());
  assert.doesNotMatch(css(), /visibility/);
  ws.server([{ cmd: 'Bounced', tags: ['TrapLink'], data: { time: 1, source: 'Friend', trap_name: 'Darkness Trap' } }]);
  assert.equal(S.prog.traps.blind, 2);
});

test('older saves gain the new trap counters', async () => {
  const remote = { v: 1, total: 3, traps: { mute: 1, reverse: 0, tiny: 0 } };
  const { S } = await connected({ remote });
  assert.deepEqual(JSON.parse(JSON.stringify(S.prog.traps)), { mute: 1, reverse: 0, tiny: 0, blind: 0 });
  assert.equal(S.prog.total, 3);
});

// ---------- ring link and death link modes ----------
test('ring link: correct answers send a ring, received rings become milestone progress', async () => {
  const { ws, fire, S } = await connected({ slot: { ring_link: true, ring_link_rate: 5, death_link: false } });
  assert.deepEqual(JSON.parse(JSON.stringify(ws.take('ConnectUpdate')[0].tags)), ['RingLink']);
  fire('answer results', answer());
  fire('answer results', answer({ correct: false }));
  const [ring] = ws.take('Bounce');
  assert.deepEqual([[...ring.tags], ring.data.amount, ring.data.source], [['RingLink'], 1, S.ringSource]);
  assert.equal(ws.take('Bounce').length, 0, 'misses send nothing');
  const rings = (amount, source = 99) => ws.server([{ cmd: 'Bounced', tags: ['RingLink'], data: { time: 1, source, amount } }]);
  rings(12);
  assert.deepEqual([S.prog.total, S.prog.ringBank], [3, 2]);
  rings(50, S.ringSource);
  assert.equal(S.prog.total, 3, 'own echo ignored');
  rings(-8);
  assert.deepEqual([S.prog.total, S.prog.ringBank], [2, -1]);
});

test('death link: poor game trigger fires at quiz over, amnesty forgives the first ones', async () => {
  const { ws, fire, S } = await connected({ slot: { death_link_trigger: 'poor_game', death_link_accuracy: 50, death_link_amnesty: 1 } });
  const game = (hits, misses) => {
    fire('quiz ready', {});
    for (let i = 0; i < hits; i++) fire('answer results', answer());
    for (let i = 0; i < misses; i++) fire('answer results', answer({ correct: false }));
    fire('quiz over', {});
  };
  game(2, 8);
  assert.equal(ws.take('Bounce').length, 0, 'miss streaks do not count with poor_game, and amnesty forgave this one');
  assert.match(S.log.join('\n'), /Death Link amnesty: Me finished a game at 20%\. Forgiven \(0 left/);
  game(2, 8);
  const [death] = ws.take('Bounce');
  assert.match(death.data.cause, /finished a game at 20%/);
  game(1, 3);
  assert.equal(ws.take('Bounce').length, 0, 'too short to judge');
  game(6, 4);
  assert.equal(ws.take('Bounce').length, 0, '60% is fine');
});

test('death link: either trigger still sends on a miss streak', async () => {
  const { ws, fire } = await connected({ slot: { death_link_trigger: 'either' } });
  for (let i = 0; i < 3; i++) fire('answer results', answer({ correct: false }));
  assert.equal(ws.take('Bounce').length, 1);
});

// ---------- hints, what to play next, session summary ----------
test('hint panel lists missing unlocks and asks the server', async () => {
  const { ws, S, api } = await connected();
  const missing = api.missingUnlocks();
  assert.ok(missing.includes('Ending Pass') && missing.includes('Genre Key: Mecha') && missing.includes('Format Pass: Movie'));
  assert.ok(!missing.includes('Opening Pass') && !missing.includes('Format Pass: TV'));
  assert.ok(missing.includes('Progressive Rarity Lens') && missing.includes('Mixtape Fragment'));
  api.hintItem('Ending Pass');
  assert.deepEqual(ws.take('Say').map(m => m.text), ['!hint Ending Pass']);
  S.data.gated = [];
  assert.deepEqual([...api.missingUnlocks()], ['Mixtape Fragment']);
});

test('play next: closest focusable checks first, focus narrows the room to that category', async () => {
  const NEAR = [{ id: 2001, name: 'Ending Specialist', kind: 'type', key: 'Ending', n: 3, stage: 0 },
    { id: 2210, name: 'Genre Scholar: Action', kind: 'genre', key: 'Action', n: 3, stage: 0 },
    { id: 2402, name: 'Medium Guess-Rate Songs', kind: 'rarity', key: 'Medium', n: 5, stage: 0 },
    { id: 2403, name: 'Hard Guess-Rate Songs', kind: 'rarity', key: 'Hard', n: 1, stage: 0 }];
  const { ws, fire, S, api, sandbox } = await connected({ slot: { checks: [...CHECKS, ...NEAR] } });
  fire('answer results', answer());
  fire('answer results', answer());
  const names = () => [...api.nextUp(5).map(c => c.name)];
  assert.deepEqual(names(), ['Genre Scholar: Action', 'Medium Guess-Rate Songs'], 'Ending and Hard are locked');
  const calls = withRoom(sandbox);
  api.applyFocus();
  assert.deepEqual(calls[0].genre, [{ id: '1', state: 3 }]);
  assert.match(S.log.at(-1), /^Room focused on Genre Scholar: Action\./);
  ws.server([{ cmd: 'ReceivedItems', index: 4, items: items(['Ending Pass']) }]);
  assert.deepEqual(names().slice(0, 3), ['Genre Scholar: Action', 'Medium Guess-Rate Songs', 'Ending Specialist'],
    'ties on songs left go to the further along');
  const medium = api.focusWish(S.data.checks.find(c => c.id === 2402));
  assert.deepEqual([...medium.difficulty], [25, 60]);
  const lines = withChat(sandbox);
  api.apCommand('next');
  assert.match(lines.at(-1), /Closest checks: Genre Scholar: Action \(2\/3\); Medium Guess-Rate Songs \(2\/5\); Ending Specialist \(0\/3\)/);
});

test('quiz over posts a summary of the game', async () => {
  const { fire, sandbox } = await connected();
  const lines = withChat(sandbox);
  fire('quiz ready', {});
  for (let i = 0; i < 3; i++) fire('answer results', answer());
  fire('answer results', answer({ type: 2 }));
  fire('quiz over', {});
  assert.match(lines.at(-1), /Game over: 3 of 4 songs counted, 3 correct \(100%\), 3 checks sent\./);
});

// ---------- offline queue and backup ----------
test('a dropped connection keeps counting; checks and progress reach the server after reconnecting', async () => {
  const storage = new Map();
  const c = await connected({ storage, slot: { death_link: false } });
  c.fire('quiz ready', {});
  c.fire('answer results', answer());
  sentChecks(c.ws);
  const [{ operations: [{ value: before }] }] = c.ws.take('Set').slice(-1);
  c.ws.close(); // not a manual disconnect
  assert.equal(c.S.offline, true);
  assert.match(c.S.log.join('\n'), /Still counting/);
  for (let i = 0; i < 9; i++) c.fire('answer results', answer());
  assert.equal(c.S.prog.total, 10);
  assert.deepEqual([...c.S.pending].sort(), [1010, 2500, 2601]);
  await new Promise(r => setTimeout(r, 2100)); // the client retries after 2s
  const ws2 = handshake(c, { remote: JSON.parse(JSON.stringify(before)), start: START });
  assert.equal(c.S.prog.total, 10, 'the newer local save wins over the server copy');
  assert.equal(c.S.game.streak, 10, 'the game in progress carried on');
  // the fake server reports nothing checked, so the cumulative 2000 is sent again from progress; a real one has it
  assert.deepEqual(sentChecks(ws2).sort(), [1010, 2000, 2500, 2601]);
  assert.deepEqual(JSON.parse(storage.get('amq_ap_pending_S1_0_1')), []);
});

test('export and import carry progress and unsent checks to another browser', async () => {
  const a = await connected({ slot: { death_link: false } });
  a.ws.close();
  for (let i = 0; i < 10; i++) a.fire('answer results', answer());
  const text = a.api.exportState();
  clearTimeout(a.S.retryTimer);
  const b = await connected({ storage: new Map() });
  assert.equal(b.api.importState('nonsense'), 'That is not an export from this client.');
  assert.equal(b.api.importState(text.replace('"seed":"S1"', '"seed":"S2"')), 'That export is for a different seed or slot.');
  sentChecks(b.ws);
  assert.equal(b.api.importState(text), 'Imported progress and unsent checks.');
  assert.equal(b.S.prog.total, 10);
  assert.deepEqual(sentChecks(b.ws).sort(), [1010, 2000, 2500, 2601]);
});

test('the panel renders the new sections, and its status view while offline', async () => {
  const { ws, api, S, sandbox } = await connected({ slot: { gated: [...ALL_GATES, 'Anime Score'] } });
  api.open();
  const html = () => sandbox.document.body.children.find(x => x.id === 'amq-ap-panel').children[0].innerHTML;
  for (const part of [/Play next/, /Hint an unlock \(\d+\)/, /data-hint="Ending Pass"/, /Backup/, /Anime score/]) assert.match(html(), part);
  ws.close();
  assert.match(html(), /Offline: still counting/);
  clearTimeout(S.retryTimer);
});
