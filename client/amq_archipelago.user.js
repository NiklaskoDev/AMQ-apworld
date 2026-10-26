// ==UserScript==
// @name         Anime Music Quiz - Archipelago Client
// @namespace    https://github.com/niklaskodev/amq-apworld
// @version      0.3.0
// @description  Connects Anime Music Quiz to an Archipelago multiworld. Unaffiliated fan project.
// @match        https://animemusicquiz.com/*
// @match        https://*.animemusicquiz.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/* Everything read from AMQ lives in the "AMQ adapters" section. If the site changes, only that section needs edits.
   Debug from the browser console with window.AMQAP (state, last payload, helpers). */
(function () {
  'use strict';

  const GAME = 'Anime Music Quiz';
  const CLIENT_VERSION = 2;
  const TYPES = { 1: 'Opening', 2: 'Ending', 3: 'Insert Song' };
  const DECADES = ['1980s & Earlier', '1990s', '2000s', '2010s', '2020s'];
  const DECADE_YEARS = { '1980s & Earlier': [null, 1989], '1990s': [1990, 1999], '2000s': [2000, 2009], '2010s': [2010, 2019], '2020s': [2020, null] };
  const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mecha', 'Music', 'Mystery', 'Romance',
    'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Mahou Shoujo', 'Psychological', 'Thriller'];
  const FORMATS = ['TV', 'Movie', 'OVA', 'ONA', 'Special'];
  const TIERS = ['Easy', 'Medium', 'Hard', 'Brutal'];
  const FREE_TIERS = 2; // Easy + Medium are always unlocked
  const TIER_FLOOR = { Easy: 60, Medium: 25, Hard: 10, Brutal: 0 }; // guess rate %, matches the lobby slider
  const TIMED_TRAPS = { 'Mute Trap': 'mute', 'Reverse Typing Trap': 'reverse', 'Tiny Text Trap': 'tiny' };

  // ---------- storage (never throws) ----------
  const LS = 'amq_ap_';
  const load = (k, d) => { try { const v = localStorage.getItem(LS + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };
  const uuid = () => {
    let u = load('uuid', null);
    if (!u) { u = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); save('uuid', u); }
    return u;
  };

  // ---------- state ----------
  const freshProgress = () => ({
    v: 1, total: 0, type: {}, decade: {}, genre: {}, format: {}, rarity: {},
    listOn: 0, listOff: 0,
    processed: 0, encore: 0, shield: 0, traps: { mute: 0, reverse: 0, tiny: 0 }, finaleDone: false,
  });
  const freshGame = () => ({
    songs: 0, eligible: 0, eligibleCorrect: 0, streak: 0, best: 0, missRun: 0,
    types: new Set(), decades: new Set(), genres: new Set(), listOn: 0, listOff: 0, standing: null, finalized: false,
  });
  const S = {
    ws: null, connected: false, ready: false, manualClose: false, retries: 0, retryTimer: null,
    conn: load('conn', { url: 'archipelago.gg:38281', slot: '' }), password: '',
    seed: '', team: 0, slot: 0, slotName: '', data: null, players: {}, slotInfo: {}, games: {},
    checked: new Set(), received: [], queued: [],
    unlocks: null, fragments: 0, prog: freshProgress(), game: freshGame(),
    goalSent: false, lastPayload: null, lastSong: '', log: [],
  };

  // ---------- AMQ adapters ----------
  const canon = (list, value) => {
    if (typeof value !== 'string') return null;
    const v = value.trim().toLowerCase().replace(/[-_]/g, ' ');
    return list.find(x => x.toLowerCase().replace(/-/g, ' ') === v) || null;
  };
  function decadeOf(vintage) {
    const m = /(\d{4})/.exec(String(vintage || ''));
    if (!m) return null;
    const y = +m[1];
    return y < 1990 ? DECADES[0] : y < 2000 ? DECADES[1] : y < 2010 ? DECADES[2] : y < 2020 ? DECADES[3] : DECADES[4];
  }
  function tierOf(rate) { // animeDifficulty is a number, or the string "Unrated"
    if (typeof rate !== 'number' || !isFinite(rate)) return null;
    return TIERS.find(t => rate >= TIER_FLOOR[t]);
  }
  function formatOf(type) {
    if (typeof type !== 'string') return null;
    const t = type.toLowerCase();
    if (t.includes('special')) return 'Special';
    if (t.includes('movie') || t.includes('film')) return 'Movie';
    return canon(FORMATS, type);
  }
  function genresOf(raw) {
    const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object') ? Object.values(raw) : [];
    const names = list.map(g => (typeof g === 'string' ? g : g && (g.name || g.genre || g.tag || g.title)));
    return [...new Set(names.map(n => canon(GENRES, n)).filter(Boolean))];
  }
  function extractSong(p) {
    const s = (p && p.songInfo) || {};
    return {
      type: TYPES[s.type] || canon(Object.values(TYPES), s.type),
      decade: decadeOf(s.vintage),
      genres: genresOf(s.animeGenre),
      format: formatOf(s.animeType),
      tier: tierOf(s.animeDifficulty),
    };
  }
  function ownGamePlayerId() {
    if (typeof quiz === 'undefined' || !quiz) return null;
    if (quiz.ownGamePlayerId !== undefined && quiz.ownGamePlayerId !== null) return quiz.ownGamePlayerId;
    const players = Object.values(quiz.players || {});
    const name = typeof selfName !== 'undefined' ? selfName : null;
    const me = players.find(x => x && x.isSelf === true) || (name && players.find(x => x && x._name === name));
    return me ? me.gamePlayerId : null;
  }
  function extractOwn(p) {
    const players = Object.values((p && p.players) || {});
    if (!players.length) return null;
    const nexus = typeof quiz !== 'undefined' && quiz && quiz.gameMode === 'Nexus';
    const id = nexus ? players[0].gamePlayerId : ownGamePlayerId();
    if (id === null || id === undefined) return null; // spectating
    const me = players.find(x => x.gamePlayerId === id);
    if (!me) return null;
    const score = x => (typeof x.score === 'number' ? x.score : 0);
    return {
      correct: me.correct === true,
      // listStatus is set (watching, completed, ...) when the song's anime is on this player's linked list
      onList: !!me.listStatus,
      rank: 1 + players.filter(x => score(x) > score(me)).length, // ties share the better rank
      count: nexus ? 1 : players.length,
    };
  }
  function amqVolume(mute) { // returns false if AMQ's volume controller is unavailable
    if (typeof volumeController === 'undefined' || !volumeController) return false;
    volumeController.muted = mute;
    if (typeof volumeController.adjustVolume === 'function') volumeController.adjustVolume();
    return true;
  }
  const ANSWER_INPUT = '#qpAnswerInput';

  // ---------- unlocks / eligibility ----------
  const gated = c => !!(S.data && S.data.gated.includes(c));
  function rebuildUnlocks() {
    const u = { types: new Set(), decades: new Set(), genres: new Set(), formats: new Set(), lens: 0 };
    let fragments = 0, r;
    for (const name of S.received) {
      if ((r = /^(Opening|Ending|Insert Song) Pass$/.exec(name))) u.types.add(r[1]);
      else if ((r = /^Decade Pass: (.+)$/.exec(name))) u.decades.add(r[1]);
      else if ((r = /^Genre Key: (.+)$/.exec(name))) u.genres.add(r[1]);
      else if ((r = /^Format Pass: (.+)$/.exec(name))) u.formats.add(r[1]);
      else if (name === 'Progressive Rarity Lens') u.lens++;
      else if (name === 'Mixtape Fragment') fragments++;
    }
    S.unlocks = u; S.fragments = fragments;
  }
  const maxTier = () => (gated('Rarity') ? Math.min(TIERS.length - 1, FREE_TIERS - 1 + S.unlocks.lens) : TIERS.length - 1);
  const genreCounts = g => !gated('Genres') || S.unlocks.genres.has(g);
  /** Returns null when the song counts, otherwise a short reason. */
  const songSource = () => (S.data && S.data.song_source) || 'any';
  function ineligibleReason(song, own) {
    const U = S.unlocks;
    if (songSource() === 'own_list' && !own.onList) return 'not on your list';
    if (gated('Song Types') && !U.types.has(song.type)) return song.type ? `${song.type} locked` : 'unknown song type';
    if (gated('Decades') && !U.decades.has(song.decade)) return song.decade ? `${song.decade} locked` : 'unknown year';
    if (gated('Formats') && !U.formats.has(song.format)) return song.format ? `${song.format} locked` : 'unknown format';
    if (gated('Rarity') && !(song.tier && TIERS.indexOf(song.tier) <= maxTier())) return song.tier ? `${song.tier} songs locked` : 'unrated difficulty';
    if (gated('Genres') && !song.genres.some(g => U.genres.has(g))) return song.genres.length ? 'no unlocked genre' : 'no genre data';
    return null;
  }

  // ---------- Archipelago connection ----------
  const send = msgs => { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(msgs)); };
  function say(text) {
    S.log.push(text);
    if (S.log.length > 80) S.log.shift();
    render();
  }
  const storeKey = k => `${k}_${S.seed}_${S.team}_${S.slot}`;
  const dsKey = () => `AMQ_${S.team}_${S.slot}`;

  function connect(url, slotName, password) {
    disconnect();
    S.manualClose = false; S.retries = 0;
    S.conn = { url: url.trim(), slot: slotName.trim() }; S.password = password || '';
    save('conn', S.conn);
    open(S.conn.url, !/^wss?:\/\//.test(S.conn.url));
  }
  function open(url, tryBoth) {
    const target = /^wss?:\/\//.test(url) ? url : 'wss://' + url;
    let opened = false;
    const ws = (S.ws = new WebSocket(target));
    ws.onopen = () => { opened = true; S.retries = 0; say(`Connected to ${target}.`); };
    ws.onmessage = ev => { let msgs; try { msgs = JSON.parse(ev.data); } catch (e) { return; } msgs.forEach(handle); };
    ws.onclose = () => {
      if (S.ws !== ws) return;
      const was = S.connected;
      S.connected = false; S.ready = false;
      if (!opened && tryBoth && target.startsWith('wss://')) return open('ws://' + url, false);
      if (S.manualClose) { render(); return; }
      if (was || opened) say('Connection lost.');
      scheduleRetry(url, tryBoth);
    };
  }
  function scheduleRetry(url, tryBoth) {
    if (S.retries >= 8) { say('Giving up reconnecting. Press Connect to try again.'); return; }
    const delay = Math.min(30, 2 ** ++S.retries);
    say(`Reconnecting in ${delay}s...`);
    S.retryTimer = setTimeout(() => open(url, tryBoth), delay * 1000);
  }
  function disconnect() {
    S.manualClose = true;
    clearTimeout(S.retryTimer);
    if (S.ws) { try { S.ws.close(); } catch (e) { /* already closed */ } }
    S.ws = null; S.connected = false; S.ready = false;
  }

  function handle(m) {
    switch (m.cmd) {
      case 'RoomInfo':
        S.seed = m.seed_name || '';
        send([{ cmd: 'GetDataPackage', games: [...new Set([GAME, ...(m.games || [])])] }]);
        break;
      case 'DataPackage':
        for (const [game, pkg] of Object.entries(m.data.games || {})) {
          const flip = o => Object.fromEntries(Object.entries(o || {}).map(([n, i]) => [i, n]));
          S.games[game] = { items: flip(pkg.item_name_to_id), locations: flip(pkg.location_name_to_id) };
        }
        if (!S.connected) {
          send([{ cmd: 'Connect', password: S.password, game: GAME, name: S.conn.slot, uuid: uuid(),
            version: { major: 0, minor: 6, build: 0, class: 'Version' }, items_handling: 7, tags: [], slot_data: true }]);
        }
        break;
      case 'ConnectionRefused':
        S.manualClose = true;
        say('Connection refused: ' + (m.errors || ['unknown']).join(', '));
        break;
      case 'Connected':
        S.connected = true; S.ready = false; S.goalSent = false;
        S.team = m.team; S.slot = m.slot; S.slotName = S.conn.slot; S.data = m.slot_data || {};
        S.data.gated = S.data.gated || [];
        S.data.checks = S.data.checks || [];
        S.players = {};
        (m.players || []).forEach(p => { if (p.team === m.team) S.players[p.slot] = p.alias || p.name; });
        S.slotInfo = m.slot_info || {};
        S.checked = new Set(m.checked_locations || []);
        S.received = []; S.queued = [];
        rebuildUnlocks();
        S.game = freshGame();
        if ((S.data.client_version || 0) > CLIENT_VERSION) say('This seed expects a newer userscript. Please update.');
        if (S.data.death_link) send([{ cmd: 'ConnectUpdate', tags: ['DeathLink'] }]);
        send([{ cmd: 'Get', keys: [dsKey()] }]);
        say(`Logged in as ${S.slotName}.`);
        break;
      case 'Retrieved': {
        if (!m.keys || !(dsKey() in m.keys) || S.ready) break;
        const remote = m.keys[dsKey()];
        const local = load(storeKey('prog'), null);
        const pick = [remote, local].find(x => x && typeof x === 'object' && x.v === 1);
        S.prog = Object.assign(freshProgress(), pick || {});
        S.ready = true;
        S.queued.splice(0).forEach(onItems);
        applyTraps();
        evaluate();
        break;
      }
      case 'ReceivedItems':
        if (S.ready) onItems(m); else S.queued.push(m);
        break;
      case 'RoomUpdate':
        (m.checked_locations || []).forEach(l => S.checked.add(l));
        break;
      case 'PrintJSON':
        say(printJson(m.data || []));
        break;
      case 'Bounced':
        if ((m.tags || []).includes('DeathLink')) onDeath(m.data || {});
        break;
    }
    render();
  }

  const playerName = slot => S.players[slot] || `Player ${slot}`;
  const gameOf = slot => (S.slotInfo[slot] && S.slotInfo[slot].game) || GAME;
  function printJson(parts) {
    return parts.map(p => {
      const lookup = (kind, id, slot) => ((S.games[gameOf(slot)] || {})[kind] || {})[id] || `#${id}`;
      switch (p.type) {
        case 'player_id': return playerName(+p.text);
        case 'item_id': return lookup('items', p.text, p.player);
        case 'location_id': return lookup('locations', p.text, p.player);
        default: return p.text || '';
      }
    }).join('');
  }

  function onItems(m) {
    if (m.index === 0) S.received = [];
    else if (m.index !== S.received.length) { send([{ cmd: 'Sync' }]); return; }
    const names = S.games[GAME] ? S.games[GAME].items : {};
    m.items.forEach(it => S.received.push(names[it.item] || `#${it.item}`));
    rebuildUnlocks();
    for (let i = S.prog.processed; i < S.received.length; i++) applyOneShot(S.received[i]);
    S.prog.processed = Math.max(S.prog.processed, S.received.length);
    saveProg();
    evaluate();
  }

  function applyOneShot(name) {
    const d = (S.data && S.data.trap_duration) || 3;
    if (name in TIMED_TRAPS) { S.prog.traps[TIMED_TRAPS[name]] += d; say(`${name}! Lasts ${d} songs.`); }
    else if (name === 'Encore Ticket') { S.prog.encore++; say('Encore Ticket: your next counted answer is worth 2.'); }
    else if (name === 'Streak Shield') { S.prog.shield++; say('Streak Shield ready.'); }
    else if (name === 'Hype Cheer') say('Hype Cheer! The crowd goes wild.');
    else if (name === 'Streak Wipe Trap') { S.game.streak = 0; say('Streak Wipe Trap! Your streak is gone.'); }
    else if (name === 'Tax Collector Trap') { S.prog.total = Math.max(0, S.prog.total - 5); say('Tax Collector Trap! -5 milestone progress.'); }
    applyTraps();
  }

  function saveProg() {
    if (!S.ready) return;
    save(storeKey('prog'), S.prog);
    send([{ cmd: 'Set', key: dsKey(), default: {}, want_reply: false, operations: [{ operation: 'replace', value: S.prog }] }]);
  }

  // ---------- DeathLink ----------
  function sendDeath() {
    const cause = `${S.slotName} missed ${S.data.death_link_misses} songs in a row.`;
    S.lastDeathSent = Date.now() / 1000;
    send([{ cmd: 'Bounce', tags: ['DeathLink'], data: { time: S.lastDeathSent, source: S.slotName, cause } }]);
    say('Death Link sent: ' + cause);
  }
  function onDeath(d) {
    if (!S.data || !S.data.death_link || d.source === S.slotName) return;
    S.game.streak = 0;
    S.prog.traps.mute += 1;
    applyTraps(); saveProg();
    say(`Death Link from ${d.source || 'someone'}${d.cause ? `: ${d.cause}` : ''} Streak wiped, next song muted.`);
  }

  // ---------- traps (cosmetic only: CSS and the volume toggle) ----------
  let trapMuted = false;
  function applyTraps() {
    const T = S.prog.traps;
    let st = document.getElementById('amq-ap-trap-css');
    if (!st) { st = document.createElement('style'); st.id = 'amq-ap-trap-css'; (document.head || document.body).appendChild(st); }
    st.textContent = [
      T.reverse > 0 ? `${ANSWER_INPUT}{direction:rtl!important;unicode-bidi:bidi-override!important}` : '',
      T.tiny > 0 ? `${ANSWER_INPUT}{font-size:5px!important}` : '',
    ].join('\n');
    if (T.mute > 0) {
      if (!amqVolume(true)) document.querySelectorAll('video,audio').forEach(el => { el.muted = true; });
      trapMuted = true;
    } else if (trapMuted) {
      if (!amqVolume(false)) document.querySelectorAll('video,audio').forEach(el => { el.muted = false; });
      trapMuted = false;
    }
  }
  function tickTraps() {
    for (const k of Object.keys(S.prog.traps)) if (S.prog.traps[k] > 0) S.prog.traps[k]--;
    applyTraps();
  }

  // ---------- quiz events ----------
  const bump = (obj, key) => { obj[key] = (obj[key] || 0) + 1; };
  function onAnswerResults(p) {
    S.lastPayload = p;
    if (!S.connected || !S.ready) return;
    const own = extractOwn(p);
    if (!own) return;
    const song = extractSong(p);
    const g = S.game;
    g.songs++;
    g.standing = { rank: own.rank, count: own.count };
    const reason = ineligibleReason(song, own);
    let status;
    if (reason) {
      status = `ignored (${reason})`;
    } else {
      g.eligible++;
      if (own.correct) {
        g.eligibleCorrect++; g.streak++; g.best = Math.max(g.best, g.streak); g.missRun = 0;
        const weight = S.prog.encore > 0 ? 2 : 1;
        if (weight === 2) S.prog.encore--;
        S.prog.total += weight;
        bump(S.prog.type, song.type); bump(S.prog.decade, song.decade); bump(S.prog.format, song.format);
        bump(S.prog.rarity, song.tier);
        song.genres.filter(genreCounts).forEach(x => { bump(S.prog.genre, x); g.genres.add(x); });
        g.types.add(song.type); g.decades.add(song.decade);
        if (own.onList) { S.prog.listOn++; g.listOn++; } else { S.prog.listOff++; g.listOff++; }
        status = weight === 2 ? 'counted x2 (Encore)' : 'counted';
      } else if (S.prog.shield > 0) {
        S.prog.shield--;
        status = 'missed, Streak Shield held';
      } else {
        g.streak = 0; g.missRun++;
        status = 'missed';
        if (S.data.death_link && g.missRun >= S.data.death_link_misses) { g.missRun = 0; sendDeath(); }
      }
    }
    const origin = songSource() === 'any' ? null : own.onList ? 'on list' : 'off list';
    S.lastSong = [song.type, song.decade, song.format, song.tier, origin].filter(Boolean).join(' · ') + ' → ' + status;
    tickTraps();
    evaluate();
    saveProg();
  }
  function onQuizOver() {
    const g = S.game;
    if (!S.connected || !S.ready || g.finalized || !g.songs) return;
    g.finalized = true;
    evaluate(true);
    S.game = freshGame();
  }
  function onQuizReady() { S.game = freshGame(); applyTraps(); render(); }

  // ---------- checks ----------
  function progressOf(c, final) {
    const g = S.game, P = S.prog;
    const count = (bucket, key) => (P[bucket][key] || 0);
    switch (c.kind) {
      case 'total': return [P.total, c.n];
      case 'type': return [count('type', c.key), c.n];
      case 'decade': return [count('decade', c.key), c.n];
      case 'genre': return [count('genre', c.key), c.n];
      case 'format': return [count('format', c.key), c.n];
      case 'rarity': return [count('rarity', c.key), c.n];
      case 'streak': return [g.best, c.n];
      case 'flawless': return [g.eligible === g.eligibleCorrect ? g.eligible : 0, c.n];
      case 'accuracy': return [g.eligibleCorrect * 100 >= c.pct * g.eligible ? g.eligible : 0, c.n];
      case 'marathon': return [g.songs, c.n];
      case 'game_types': return [g.types.size, c.n];
      case 'game_decades': return [g.decades.size, c.n];
      case 'game_genres': return [g.genres.size, c.n];
      case 'list_on': return [P.listOn, c.n];
      case 'list_off': return [P.listOff, c.n];
      case 'game_list_mix': return [Math.min(g.listOn, g.listOff), c.n];
      case 'mp_podium': return [final && g.standing && g.standing.count >= c.n && g.standing.rank <= 3 ? 1 : 0, 1];
      case 'mp_win': return [final && g.standing && g.standing.count >= c.n && g.standing.rank === 1 ? 1 : 0, 1];
    }
    return [0, 1];
  }
  /** Fragments still missing before this check's stage opens, or 0. Progress keeps counting while locked. */
  function stageLock(c) {
    const need = ((S.data && S.data.stage_fragments) || [])[c.stage || 0] || 0;
    return Math.max(0, need - S.fragments);
  }
  function evaluate(final = false) {
    if (!S.ready || !S.data) return;
    const hits = S.data.checks.filter(c => !S.checked.has(c.id) && !stageLock(c) &&
      (([a, b]) => a >= b)(progressOf(c, final))).map(c => c.id);
    if (hits.length) { hits.forEach(id => S.checked.add(id)); send([{ cmd: 'LocationChecks', locations: hits }]); }

    const g = S.game, D = S.data;
    if (D.goal === 'finale' && !S.prog.finaleDone && S.fragments >= D.fragments_required &&
        g.eligible >= D.finale_songs && g.eligibleCorrect * 100 >= D.finale_accuracy * g.eligible) {
      S.prog.finaleDone = true;
      say('Grand Finale cleared!');
      saveProg();
    }
    if (!S.goalSent && S.fragments >= D.fragments_required && (D.goal === 'fragments' || S.prog.finaleDone)) {
      S.goalSent = true;
      send([{ cmd: 'StatusUpdate', status: 30 }]);
      say('Goal complete!');
    }
    render();
  }

  // ---------- lobby guide ----------
  function vintageRanges() {
    if (!gated('Decades')) return 'any';
    const idx = DECADES.map((d, i) => (S.unlocks.decades.has(d) ? i : -1)).filter(i => i >= 0);
    const runs = [];
    for (const i of idx) { const last = runs[runs.length - 1]; if (last && last[1] === i - 1) last[1] = i; else runs.push([i, i]); }
    return runs.map(([a, b]) => {
      const from = DECADE_YEARS[DECADES[a]][0], to = DECADE_YEARS[DECADES[b]][1];
      return from === null ? `up to ${to}` : to === null ? `${from} onward` : `${from}–${to}`;
    }).join(', ') || 'none';
  }
  function lobbyGuide() {
    const U = S.unlocks;
    const list = (cat, set, all) => (!gated(cat) ? 'any' : all.filter(x => set.has(x)).join(', ') || 'none');
    return [
      ['Song types', list('Song Types', U.types, Object.values(TYPES))],
      ['Vintage', vintageRanges()],
      ['Anime type', list('Formats', U.formats, FORMATS)],
      ['Difficulty', `${TIER_FLOOR[TIERS[maxTier()]]}–100%`],
      ['Genres (optional)', list('Genres', U.genres, GENRES)],
      ['Song selection', { any: 'any', own_list: 'watched only (your list)', mixed: 'mix of watched and random' }[songSource()] || 'any'],
    ];
  }

  // ---------- UI ----------
  let panel = null, body = null;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function buildUi() {
    const css = document.createElement('style');
    css.textContent = `
      #amq-ap-btn{position:fixed;right:8px;bottom:8px;z-index:99999;padding:6px 10px;border-radius:6px;border:0;background:#6d4aff;color:#fff;font-weight:700;cursor:pointer}
      #amq-ap-panel{position:fixed;right:8px;bottom:44px;width:360px;max-height:75vh;overflow:auto;z-index:99999;display:none;background:#1b1b26;color:#eee;font:12px/1.45 sans-serif;padding:10px;border-radius:8px;border:1px solid #444}
      #amq-ap-panel input{width:100%;box-sizing:border-box;margin-bottom:4px;color:#000}
      #amq-ap-panel table{width:100%;border-collapse:collapse}#amq-ap-panel td{padding:1px 4px;vertical-align:top}
      #amq-ap-panel summary{cursor:pointer;font-weight:700;margin-top:6px}
      #amq-ap-panel .bar{background:#333;border-radius:3px;height:6px}#amq-ap-panel .bar>i{display:block;height:6px;border-radius:3px;background:#6d4aff}
      #amq-ap-panel .dim{color:#999}`;
    document.head.appendChild(css);
    const btn = document.createElement('button');
    btn.id = 'amq-ap-btn'; btn.textContent = 'AP';
    panel = document.createElement('div'); panel.id = 'amq-ap-panel';
    body = document.createElement('div'); panel.appendChild(body);
    btn.onclick = () => { panel.style.display = panel.style.display === 'block' ? 'none' : 'block'; render(); };
    document.body.appendChild(btn); document.body.appendChild(panel);
  }
  const openState = {};
  function section(id, title, html) {
    return `<details data-id="${id}"${openState[id] ? ' open' : ''}><summary>${title}</summary>${html}</details>`;
  }
  function render() {
    if (!body || panel.style.display !== 'block') return;
    body.querySelectorAll && body.querySelectorAll('details').forEach(d => { openState[d.dataset.id] = d.open; });
    let h = '';
    if (!S.connected) {
      h += `<input id="ap-url" placeholder="server:port" value="${esc(S.conn.url)}">
        <input id="ap-slot" placeholder="slot name" value="${esc(S.conn.slot)}">
        <input id="ap-pw" type="password" placeholder="password (optional)">
        <button id="ap-go">Connect</button>`;
    } else {
      const D = S.data, P = S.prog, g = S.game;
      const done = D.checks.filter(c => S.checked.has(c.id)).length;
      h += `<b>${esc(S.slotName)}</b> · checks ${done}/${D.checks.length} · fragments ${S.fragments}/${D.fragments_required}
        <button id="ap-dc" style="float:right">Disconnect</button><br>
        <span class="dim">Correct ${P.total} · streak ${g.streak} (best ${g.best}) · encore ${P.encore} · shield ${P.shield}</span><br>`;
      const traps = Object.entries(P.traps).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`);
      if (traps.length) h += `<b style="color:#ff7a7a">Traps: ${traps.join(', ')} songs</b><br>`;
      if (S.lastSong) h += `<span class="dim">Last song: ${esc(S.lastSong)}</span><br>`;
      if (D.goal === 'finale') {
        h += P.finaleDone ? 'Finale: cleared<br>' : S.fragments >= D.fragments_required
          ? `<b>Finale open:</b> ${D.finale_songs}+ counted songs at ${D.finale_accuracy}% in one game<br>` : '';
      }
      h += section('guide', 'Lobby settings', '<table>' + lobbyGuide().map(([k, v]) => `<tr><td class="dim">${k}</td><td>${esc(v)}</td></tr>`).join('') + '</table>');
      const open = D.checks.filter(c => !S.checked.has(c.id)).map(c => {
        const [a, b] = progressOf(c, false);
        return { c, a: Math.min(a, b), b };
      }).sort((x, y) => (stageLock(x.c) > 0) - (stageLock(y.c) > 0) || y.a / y.b - x.a / x.b);
      const stageName = c => ((D.stages || [])[c.stage || 0]) || 'next stage';
      h += section('checks', `Open checks (${open.length})`, '<table>' + open.slice(0, 40).map(({ c, a, b }) => {
        const lock = stageLock(c);
        const note = lock ? `<br><span class="dim">${esc(stageName(c))}: ${lock} more fragment${lock > 1 ? 's' : ''}</span>` : '';
        return `<tr><td>${esc(c.name)}${note}</td><td style="width:70px"><div class="bar"><i style="width:${Math.round(100 * a / b)}%"></i></div><span class="dim">${a}/${b}</span></td></tr>`;
      }).join('') + '</table>');
    }
    h += section('log', 'Log', `<div style="max-height:140px;overflow:auto">${S.log.slice(-25).map(esc).join('<br>')}</div>`);
    body.innerHTML = h;
    const $ = sel => body.querySelector(sel);
    const go = $('#ap-go'), dc = $('#ap-dc');
    if (go) go.onclick = () => connect($('#ap-url').value, $('#ap-slot').value, $('#ap-pw').value);
    if (dc) dc.onclick = () => { disconnect(); say('Disconnected.'); };
  }

  // ---------- boot ----------
  window.AMQAP = { state: S, connect, disconnect, handle, onAnswerResults, onQuizOver, onQuizReady, extractSong, extractOwn,
    lobbyGuide, stageLock, open: () => { panel.style.display = 'block'; render(); } };
  const wait = setInterval(() => {
    if (typeof Listener === 'undefined' || !document.body) return;
    clearInterval(wait);
    buildUi();
    const listen = (name, fn) => {
      try { new Listener(name, fn).bindListener(); } catch (e) { console.error('[AMQ-AP] cannot bind', name, e); }
    };
    listen('answer results', p => { try { onAnswerResults(p); } catch (e) { console.error('[AMQ-AP]', e); } });
    listen('quiz ready', onQuizReady);
    listen('play next song', applyTraps); // AMQ resets volume per song; re-assert the mute trap
    listen('quiz over', onQuizOver);
  }, 500);
})();
