// Trace of the userscript, to check that a refactor changes nothing.
//
// Runs the userscript in a sandbox with AMQ, the DOM, the clock and randomness mocked, and plays a scripted session
// per seed from a world snapshot (tools/snapshot_world.py): connect, items, 150 songs with random fields, traps,
// Death/Trap/Ring Link, a dropped connection, chat commands, lobby apply, export/import and the rendered panel.
// Writes everything the client sends, logs, posts to AMQ's chat and renders as JSON. Same code and snapshot, same
// output: compare a trace of the old userscript with one of the new (tools/diff_json.py).
//
//   node tools/trace_client.mjs USERSCRIPT SNAPSHOT_JSON OUT_JSON
import fs from 'node:fs';
import vm from 'node:vm';

const [, , SCRIPT, SNAPSHOT, OUT] = process.argv;
const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));

let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];

function fakeDocument() {
  const byId = {}, handlers = {};
  const element = tag => ({
    tagName: tag, style: {}, dataset: {}, children: [], textContent: '', innerHTML: '', id: '',
    appendChild(child) { this.children.push(child); if (child.id) byId[child.id] = child; return child; },
    querySelector: () => null, querySelectorAll: () => [],
  });
  return { head: element('head'), body: element('body'), createElement: element, getElementById: id => byId[id] || null,
    querySelectorAll: () => [], addEventListener(type, fn) { (handlers[type] ||= []).push(fn); }, handlers };
}

class Sock {
  static last = null;
  constructor(url) { this.url = url; this.readyState = 1; this.sent = []; Sock.last = this; setTimeout(() => this.onopen && this.onopen(), 0); }
  send(text) { this.sent.push(...JSON.parse(text)); }
  close() { this.readyState = 3; this.onclose && this.onclose(); }
  server(msgs) { this.onmessage({ data: JSON.stringify(msgs) }); }
}

async function run(key) {
  const g = snap[key];
  let now = 1_700_000_000_000;
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const chat = [], lobbyChanges = [];
  const settings = {
    numberOfSongs: 20, songType: { standardValue: { openings: true, endings: true, inserts: true }, advancedValue: {} },
    vintage: { standardValue: { years: [1944, 2026], seasons: [0, 3] }, advancedValueList: [] },
    type: { tv: true, movie: true, ova: true, ona: true, special: true },
    songDifficulity: { advancedOn: false, advancedValue: [0, 100] }, genre: [],
    guessTime: { randomOn: false, standardValue: 20, randomValue: [5, 60] },
    samplePoint: { randomOn: false, standardValue: 1 },
    songCategories: { standard: true, instrumental: true, chanting: true, character: true },
    animeScore: { standardValue: [2, 10], advancedOn: false }, dubSongs: true, rebroadcastSongs: true,
    songSelection: { standardValue: 1, advancedValue: { random: 20, unwatched: 0, watched: 0 } },
  };
  const listeners = {};
  const storage = new Map();
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, WebSocket: Sock, Date: FakeDate,
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    crypto: { randomUUID: () => 'uuid-fixed' },
    document: fakeDocument(),
    localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) },
    Listener: class { constructor(n, f) { this.n = n; this.f = f; } bindListener() { (listeners[this.n] ||= []).push(this.f); } },
    volumeController: { muted: false, adjustVolume() {} },
    quiz: { gameMode: 'Standard', players: { 0: { gamePlayerId: 0, _name: 'me', isSelf: true }, 1: { gamePlayerId: 1, _name: 'rival' } } },
    selfName: 'me',
    gameChat: { systemMessage: t => chat.push(t) },
    lobby: { inLobby: true, isHost: true, settings: JSON.parse(JSON.stringify(settings)), changeGameSettings() {} },
    hostModal: { getSettings: () => JSON.parse(JSON.stringify(settings)), changeSettings: d => lobbyChanges.push(d),
      DEFUALT_SETTINGS: { vintage: { standardValue: { years: [1944, 2026] } } } },
    idTranslator: { genreNames: { 1: 'Action', 2: 'Comedy', 3: 'Drama', 4: 'Fantasy', 5: 'Horror', 6: 'Mecha', 7: 'Romance', 8: 'Sci-Fi', 9: 'Slice of Life' } },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SCRIPT, 'utf8'), sandbox);
  await new Promise(r => setTimeout(r, 600));
  const fire = (n, p) => (listeners[n] || []).forEach(f => f(p));
  const api = sandbox.AMQAP, S = api.state;
  const out = { steps: [] };
  const mark = label => out.steps.push({ label, sent: Sock.last ? Sock.last.sent.splice(0) : [], log: S.log.slice(), chat: chat.splice(0),
    prog: JSON.parse(JSON.stringify(S.prog)), lastSong: S.lastSong, checked: [...S.checked].sort() });

  const items = g.ids.items, locs = g.ids.locations;
  api.connect('localhost:38281', 'Tester', '');
  await new Promise(r => setTimeout(r, 5));
  const ws = Sock.last;
  ws.server([{ cmd: 'RoomInfo', seed_name: 'S1', games: ['Anime Music Quiz'] }]);
  ws.server([{ cmd: 'DataPackage', data: { games: { 'Anime Music Quiz': { item_name_to_id: items, location_name_to_id: locs } } } }]);
  ws.server([{ cmd: 'Connected', team: 0, slot: 1, players: [{ team: 0, slot: 1, name: 'Tester', alias: 'Tester' }, { team: 0, slot: 2, name: 'Other' }],
    slot_info: { 1: { game: 'Anime Music Quiz' } }, checked_locations: [], slot_data: g.slot_data }]);
  ws.server([{ cmd: 'Retrieved', keys: { AMQ_0_1: null } }]);
  ws.server([{ cmd: 'LocationInfo', locations: Object.entries(g.placements).slice(0, 60).map(([l, it], i) => ({ location: locs[l], item: items[it] || 1, player: i % 2 ? 1 : 2, flags: i % 5 })) }]);
  mark('connected');

  const names = Object.keys(items);
  const got = [...g.precollected, ...names.filter(n => /Pass|Key|Lens|Guess Time|Category:/.test(n)).filter(() => rnd() < 0.45),
    'Encore Ticket', 'Streak Shield', 'Mulligan', 'Spotlight', 'Hype Cheer', 'Mute Trap', 'Reverse Typing Trap', 'Tiny Text Trap',
    'Blind Trap', 'Streak Wipe Trap', 'Tax Collector Trap', ...Array(7).fill('Mixtape Fragment'),
    ...names.filter(n => /Pass|Key|Category:/.test(n)), ...Array(4).fill('Progressive Rarity Lens'), ...Array(5).fill('Progressive Guess Time'),
    ...Array(2).fill('Progressive Score Lens'), ...Array(20).fill('Mixtape Fragment'), 'Encore Ticket', 'Spotlight', 'Mute Trap'];
  ws.server([{ cmd: 'ReceivedItems', index: 0, items: got.slice(0, 20).map(n => ({ item: items[n], location: 0, player: 2, flags: 0 })) }]);
  mark('items1');

  const types = [1, 2, 3], formats = ['TV', 'Movie', 'OVA', 'ONA', 'Special', 'tv special'], seasons = ['Winter', 'Spring', 'Summer', 'Fall', 'Autumn'];
  const genres = ['Action', 'Comedy', 'Drama', 'Horror', 'Mecha', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports'];
  for (let i = 0; i < 150; i++) {
    if (i === 40) { ws.server([{ cmd: 'ReceivedItems', index: 20, items: got.slice(20).map(n => ({ item: items[n], location: 0, player: 2, flags: 0 })) }]); mark('items2'); }
    if (i % 30 === 0) fire('quiz ready', {});
    sandbox.lobby.settings.guessTime.standardValue = pick([5, 10, 15, 20, 30]);
    sandbox.lobby.settings.samplePoint = rnd() < 0.2 ? { randomOn: true, standardValue: 1 } : { randomOn: false, standardValue: pick([1, 2, 3]) };
    fire('play next song', {});
    now += 1000 + Math.floor(rnd() * 6000);
    if (rnd() < 0.6) sandbox.document.handlers.keydown.forEach(f => f({ key: 'Enter', target: { id: 'qpAnswerInput' } }));
    now += 2000;
    const extra = { songCategory: pick(['Standard', 'Instrumental', 'Chanting', 'Character', { name: 'standard' }]),
      animeScore: pick([8.5, 7.2, 6.4, 5.1, null, '7.9']), isDub: rnd() < 0.15, isRebroadcast: rnd() < 0.1 };
    const p = {
      songInfo: { type: pick(types), vintage: `${pick(seasons)} ${1980 + Math.floor(rnd() * 46)}`, animeType: pick(formats),
        animeDifficulty: rnd() < 0.05 ? 'Unrated' : Math.round(rnd() * 1000) / 10, animeGenre: [pick(genres), pick(genres)], ...extra },
      players: [{ gamePlayerId: 0, correct: rnd() < 0.7, score: i % 7, listStatus: rnd() < 0.6 ? 1 : undefined },
        { gamePlayerId: 1, correct: false, score: (i * 3) % 11 }],
    };
    fire('answer results', p);
    if (i % 10 === 9) mark(`song${i}`);
    if (i % 30 === 29) { fire('quiz over', {}); mark(`over${i}`); }
    if (i === 70) {
      ws.server([{ cmd: 'Bounced', tags: ['DeathLink'], data: { source: 'Other', cause: 'fell' } }]);
      ws.server([{ cmd: 'Bounced', tags: ['TrapLink'], data: { source: 'Other', trap_name: 'Ice Trap' } }]);
      ws.server([{ cmd: 'Bounced', tags: ['TrapLink'], data: { source: 'Other', trap_name: 'Banana Peel' } }]);
      ws.server([{ cmd: 'Bounced', tags: ['RingLink'], data: { source: 7, amount: 23 } }]);
      ws.server([{ cmd: 'Bounced', tags: ['RingLink'], data: { source: 7, amount: -8 } }]);
      ws.server([{ cmd: 'PrintJSON', type: 'ItemSend', receiving: 1, item: { player: 2, item: 1, location: 1 },
        data: [{ type: 'player_id', text: '2' }, { text: ' sent ' }, { type: 'item_id', text: String(items['Hype Cheer']), player: 1 }] }]);
      ws.server([{ cmd: 'PrintJSON', type: 'Chat', data: [{ text: 'hello' }] }]);
      ws.server([{ cmd: 'RoomUpdate', checked_locations: [locs['Correct Answers: 150'] || 0] }]);
      mark('bounces');
    }
    if (i === 100) { ws.close(); mark('offline'); }
    if (i === 120) {
      api.connect('localhost:38281', 'Tester', '');
      await new Promise(r => setTimeout(r, 5));
      const w2 = Sock.last;
      w2.server([{ cmd: 'RoomInfo', seed_name: 'S1', games: ['Anime Music Quiz'] }]);
      w2.server([{ cmd: 'DataPackage', data: { games: { 'Anime Music Quiz': { item_name_to_id: items, location_name_to_id: locs } } } }]);
      w2.server([{ cmd: 'Connected', team: 0, slot: 1, players: [], slot_info: {}, checked_locations: [...S.checked].slice(0, 5), slot_data: g.slot_data }]);
      w2.server([{ cmd: 'Retrieved', keys: { AMQ_0_1: out.steps[out.steps.length - 1].prog } }]);
      w2.server([{ cmd: 'ReceivedItems', index: 0, items: got.map(n => ({ item: items[n], location: 0, player: 2, flags: 0 })) }]);
      mark('reconnected');
    }
  }
  for (const cmd of ['help', 'next', 'missing', 'lobby', 'lobby next', 'hello there', '']) { api.apCommand(cmd); mark(`cmd:${cmd}`); }
  out.lobbyChanges = lobbyChanges;
  out.wish = api.lobbyWish();
  out.guide = api.lobbyGuide();
  out.next = api.nextUp(5).map(c => c.name);
  out.missing = api.missingUnlocks();
  out.focus = S.data.checks.slice(0, 80).map(c => api.focusWish(c));
  out.scouts = S.data.checks.slice(0, 80).map(c => api.scoutLabel(c.id));
  out.settingsFor = [{ types: ['Opening'], years: [[1990, 2009]], formats: ['TV'], difficulty: [25, 100], genres: ['Action', 'Horror', 'Music'],
    guessTime: 10, samples: ['Start', 'End'], categories: ['Standard'], score: [6, 10], dub: false, rebroadcast: true, watchedOnly: true },
  { years: [[null, 1999], [2010, null]], samples: ['Random'] }, { samples: ['Middle'] }]
    .map(w => { const s = JSON.parse(JSON.stringify(settings)); const r = api.lobbySettingsFor(s, w); return { r, s }; });
  const exported = api.exportState();
  out.exported = exported;
  out.importBad = api.importState('nope');
  out.importOk = api.importState(exported);
  api.open();
  out.html = sandbox.document.body.children.find(c => c.id === 'amq-ap-panel').children[0].innerHTML;
  out.trapCss = sandbox.document.getElementById('amq-ap-trap-css').textContent;
  out.storage = Object.fromEntries([...storage.entries()].sort());
  out.extract = [
    { songInfo: { type: 2, vintage: 'Fall 1979', animeType: 'Movie', animeDifficulty: 12, animeGenre: { a: { name: 'mahou-shoujo' } } } },
    { songInfo: { type: 'Insert Song', vintage: '2021', animeType: 'ONA', animeDifficulty: 'Unrated', animeGenre: ['slice_of_life'], songCategoryName: 'chanting', animeScore: '9' } },
    {},
  ].map(p => api.extractSong(p));
  return out;
}

// snapshot keys are "<config index>/<seed>": every optional category, all links and traps, mixed list checks
const result = {};
for (const key of ['3/1', '7/2', '2/3']) result[key] = await run(key);
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log('trace written', Object.values(result).map(r => r.steps.length).join(','));
