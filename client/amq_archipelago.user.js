// ==UserScript==
// @name         Anime Music Quiz - Archipelago Client
// @namespace    https://github.com/niklaskodev/amq-apworld
// @version      0.8.0
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
  const CLIENT_VERSION = 6;
  const TYPES = { 1: 'Opening', 2: 'Ending', 3: 'Insert Song' };
  const DECADES = ['1980s & Earlier', '1990s', '2000s', '2010s', '2020s'];
  const DECADE_YEARS = { '1980s & Earlier': [null, 1989], '1990s': [1990, 1999], '2000s': [2000, 2009], '2010s': [2010, 2019], '2020s': [2020, null] };
  const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mecha', 'Music', 'Mystery', 'Romance',
    'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Mahou Shoujo', 'Psychological', 'Thriller'];
  const FORMATS = ['TV', 'Movie', 'OVA', 'ONA', 'Special'];
  const TIERS = ['Easy', 'Medium', 'Hard', 'Brutal'];
  const SEASONS = ['Winter', 'Spring', 'Summer', 'Fall'];
  const SAMPLE_POINTS = ['Start', 'Middle', 'End', 'Random']; // Start is always open
  // guess-rate floors (%) matching the lobby slider; seeds set their own via slot data, these are the defaults
  const DEFAULT_FLOORS = { Easy: 60, Medium: 25, Hard: 10, Brutal: 0 };
  const DEFAULT_FREE_TIERS = 2;
  const tierFloor = t => ((S.data && S.data.difficulty_floors) || DEFAULT_FLOORS)[t];
  const freeTiers = () => (S.data && S.data.free_difficulty_tiers) || DEFAULT_FREE_TIERS;
  const GUESS_TIME_MAX = 60; // AMQ's longest guess time
  const CATEGORIES = ['Standard', 'Instrumental', 'Chanting', 'Character']; // Standard is always open
  const SCORE_TIERS = ['Acclaimed', 'Well Liked', 'Mixed', 'Overlooked'];
  const DEFAULT_SCORE_FLOORS = { Acclaimed: 8, 'Well Liked': 7, Mixed: 6, Overlooked: 0 };
  const scoreFloor = t => ((S.data && S.data.score_floors) || DEFAULT_SCORE_FLOORS)[t];
  const freeScoreTiers = () => (S.data && S.data.free_score_tiers) || 2;
  const TIMED_TRAPS = { 'Mute Trap': 'mute', 'Reverse Typing Trap': 'reverse', 'Tiny Text Trap': 'tiny', 'Blind Trap': 'blind' };
  const TRAPS = [...Object.keys(TIMED_TRAPS), 'Streak Wipe Trap', 'Tax Collector Trap'];
  const DEATH_GAME_SONGS = 10; // a Poor Game death needs at least this many eligible songs

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
    v: 1, total: 0, type: {}, decade: {}, genre: {}, format: {}, rarity: {}, season: {}, sample: {},
    category: {}, score: {}, dub: {}, years: {}, quick: {}, nexus: 0,
    listOn: 0, listOff: 0, bounce: 0,
    processed: 0, encore: 0, shield: 0, mulligan: 0, spotlight: 0, traps: { mute: 0, reverse: 0, tiny: 0, blind: 0 },
    finaleDone: false, ringBank: 0, deathCharges: 0, answered: 0,
  });
  const freshGame = () => ({
    songs: 0, eligible: 0, eligibleCorrect: 0, streak: 0, best: 0, missRun: 0,
    types: new Set(), decades: new Set(), genres: new Set(), seasons: new Set(), listOn: 0, listOff: 0, standing: null,
    finalized: false, afterMiss: false, dry: 0, armed: false, comebackBest: 0, ignored: 0, reasons: {}, lobbyWarned: false,
    checksSent: 0,
  });
  const S = {
    ws: null, connected: false, ready: false, offline: false, manualClose: false, retries: 0, retryTimer: null,
    conn: load('conn', { url: 'archipelago.gg:38281', slot: '' }), password: '',
    seed: '', team: 0, slot: 0, slotName: '', data: null, players: {}, slotInfo: {}, games: {},
    checked: new Set(), received: [], queued: [], scouts: {}, scoutMode: load('scout', 'items'), warned: new Set(),
    unlocks: null, fragments: 0, prog: freshProgress(), game: freshGame(), pending: [],
    goalSent: false, lastPayload: null, lastSong: '', log: [], chatMode: load('chat', 'mine'),
    songStart: 0, lastSubmit: 0, ringSource: Math.floor(Math.random() * 2 ** 31),
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
  function seasonOf(vintage) {
    const m = /^\s*([a-z]+)/i.exec(String(vintage || ''));
    if (!m) return null;
    return /^autumn$/i.test(m[1]) ? 'Fall' : canon(SEASONS, m[1]);
  }
  function tierOf(rate) { // animeDifficulty is a number, or the string "Unrated"
    if (typeof rate !== 'number' || !isFinite(rate)) return null;
    return TIERS.find(t => rate >= tierFloor(t));
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
  function yearOf(vintage) {
    const m = /(\d{4})/.exec(String(vintage || ''));
    return m ? +m[1] : null;
  }
  // The fields below are not used by the community scripts this client was checked against, so several spellings are
  // accepted. undefined means AMQ sent nothing readable: the song counts and that category's checks can't progress.
  const firstSet = (s, keys) => keys.map(k => s[k]).find(v => v !== undefined && v !== null);
  function categoryOf(s) {
    const raw = firstSet(s, ['songCategory', 'category', 'songCategoryName']);
    const name = raw && typeof raw === 'object' ? raw.name : raw;
    return canon(CATEGORIES, name) || undefined;
  }
  function scoreTierOf(s) { // null: the anime has no score
    if (!('animeScore' in s)) return undefined;
    const v = typeof s.animeScore === 'string' ? parseFloat(s.animeScore) : s.animeScore;
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return SCORE_TIERS.find(t => v >= scoreFloor(t));
  }
  const flagOf = (s, keys) => keys.map(k => s[k]).find(v => typeof v === 'boolean');
  function extractSong(p) {
    const s = (p && p.songInfo) || {};
    return {
      type: TYPES[s.type] || canon(Object.values(TYPES), s.type),
      decade: decadeOf(s.vintage),
      year: yearOf(s.vintage),
      season: seasonOf(s.vintage),
      genres: genresOf(s.animeGenre),
      format: formatOf(s.animeType),
      tier: tierOf(s.animeDifficulty),
      category: categoryOf(s),
      categoryRaw: firstSet(s, ['songCategory', 'category', 'songCategoryName']),
      scoreTier: scoreTierOf(s),
      dub: flagOf(s, ['isDub', 'dub']),
      rebroadcast: flagOf(s, ['isRebroadcast', 'rebroadcast']),
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
      nexus,
    };
  }
  function amqVolume(mute) { // returns false if AMQ's volume controller is unavailable
    if (typeof volumeController === 'undefined' || !volumeController) return false;
    volumeController.muted = mute;
    if (typeof volumeController.adjustVolume === 'function') volumeController.adjustVolume();
    return true;
  }
  /** The room's guess time in seconds (the top of the range when it is random), or null if unreadable. */
  function roomGuessTime() {
    const g = typeof lobby !== 'undefined' && lobby && lobby.settings && lobby.settings.guessTime;
    if (!g) return null;
    const t = g.randomOn && Array.isArray(g.randomValue) ? g.randomValue[1] : g.standardValue;
    return typeof t === 'number' && isFinite(t) ? t : null;
  }
  /** The room's sample point (Start, Middle, End or Random), or null if unreadable. */
  function roomSamplePoint() {
    const sp = typeof lobby !== 'undefined' && lobby && lobby.settings && lobby.settings.samplePoint;
    if (!sp) return null;
    if (sp.randomOn) return 'Random';
    return { 1: 'Start', 2: 'Middle', 3: 'End' }[sp.standardValue] || null;
  }
  const ANSWER_INPUT = '#qpAnswerInput';
  const ANSWER_INPUT_ID = 'qpAnswerInput';
  const QUIZ_VIDEO = '#qpVideosInner video, #qpVideoContainer video'; // the clip shown once a song is revealed
  const CHAT_INPUT_ID = 'gcInput';
  /** Calls `onSubmit` when an answer is locked in with Enter (also picking a suggestion with Enter). */
  function hookAnswerInput(onSubmit) {
    if (!document.addEventListener) return;
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && ev.target && ev.target.id === ANSWER_INPUT_ID) onSubmit();
    }, true);
  }
  function amqChat(text) { // returns false if AMQ's chat is unavailable
    if (typeof gameChat === 'undefined' || !gameChat || typeof gameChat.systemMessage !== 'function') return false;
    try { gameChat.systemMessage(esc(text)); return true; } catch (e) { return false; }
  }
  /** Intercepts "/ap ..." typed into AMQ's chat before AMQ sends it to the room. */
  function hookChatInput(onCommand) {
    if (!document.addEventListener) return;
    let swallow = false;
    document.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' || !ev.target || ev.target.id !== CHAT_INPUT_ID) return;
      const m = /^\/ap(?:\s+([\s\S]*))?$/i.exec(ev.target.value || '');
      if (!m) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      ev.target.value = ''; swallow = true;
      onCommand((m[1] || '').trim());
    }, true);
    document.addEventListener('keypress', ev => { if (swallow && ev.key === 'Enter') { ev.preventDefault(); ev.stopImmediatePropagation(); } }, true);
    document.addEventListener('keyup', ev => { if (ev.key === 'Enter') swallow = false; }, true);
  }
  /** Own chat messages that reached the room anyway (the interception above missed), from either chat event. */
  function ownChatCommands(p) {
    const msgs = p && Array.isArray(p.messages) ? p.messages : p ? [p] : [];
    const me = typeof selfName !== 'undefined' ? selfName : null;
    return msgs.filter(x => x && x.sender === me && typeof x.message === 'string')
      .map(x => /^\/ap(?:\s+([\s\S]*))?$/i.exec(x.message)).filter(Boolean).map(m => (m[1] || '').trim());
  }

  const FORMAT_KEYS = { TV: 'tv', Movie: 'movie', OVA: 'ova', ONA: 'ona', Special: 'special' };
  /** Rewrites a copy of AMQ's room settings to match `want`. Categories left out of `want` are not touched. */
  function lobbySettingsFor(s, want) {
    const done = [], manual = [];
    const songs = s.numberOfSongs || 20;
    if (want.types) {
      const st = s.songType;
      if (st && st.standardValue && typeof st.standardValue.openings === 'boolean') {
        Object.assign(st.standardValue, { openings: want.types.includes('Opening'), endings: want.types.includes('Ending'),
          inserts: want.types.includes('Insert Song') });
        if (st.advancedValue) Object.assign(st.advancedValue, { openings: 0, endings: 0, inserts: 0, random: songs });
        done.push('song types');
      } else manual.push('song types');
    }
    if (want.years) {
      const v = s.vintage;
      if (want.years.length !== 1) manual.push('vintage (your decades are not one range)');
      else if (v && v.standardValue && Array.isArray(v.standardValue.years)) {
        const dflt = typeof hostModal !== 'undefined' && hostModal && hostModal.DEFUALT_SETTINGS; // sic, AMQ's spelling
        const bounds = (dflt && dflt.vintage && dflt.vintage.standardValue && dflt.vintage.standardValue.years) ||
          [1944, new Date().getFullYear()];
        const [from, to] = want.years[0];
        v.standardValue = { years: [from === null ? bounds[0] : from, to === null ? bounds[1] : to], seasons: [0, 3] };
        v.advancedValueList = [];
        done.push('vintage');
      } else manual.push('vintage');
    }
    if (want.formats) {
      const key = Object.keys(s).find(k => s[k] && typeof s[k] === 'object' &&
        Object.values(FORMAT_KEYS).every(f => typeof s[k][f] === 'boolean'));
      if (key) { for (const f of FORMATS) s[key][FORMAT_KEYS[f]] = want.formats.includes(f); done.push('anime type'); }
      else manual.push('anime type');
    }
    if (want.difficulty) {
      const d = s.songDifficulity || s.songDifficulty; // sic, AMQ's spelling
      if (d && Array.isArray(d.advancedValue)) { d.advancedOn = true; d.advancedValue = want.difficulty.slice(); done.push('difficulty'); }
      else manual.push('difficulty');
    }
    if (want.genres) {
      const names = typeof idTranslator !== 'undefined' && idTranslator && idTranslator.genreNames;
      if (names && Array.isArray(s.genre)) {
        const ids = Object.entries(names).map(([id, n]) => [String(id), canon(GENRES, n)]).filter(([, g]) => g && want.genres.includes(g));
        s.genre = ids.map(([id]) => ({ id, state: 3 })); // 3 = optional: a song needs at least one of them
        done.push('genres');
        if (ids.length < want.genres.length) manual.push('some genres AMQ does not list');
      } else manual.push('genres');
    }
    if (want.guessTime) {
      const g = s.guessTime;
      if (g && typeof g.standardValue === 'number') {
        const top = g.randomOn && Array.isArray(g.randomValue) ? g.randomValue[1] : g.standardValue;
        if (top > want.guessTime) { g.randomOn = false; g.standardValue = want.guessTime; } // shorter is fine as it is
        done.push('guess time');
      } else manual.push('guess time');
    }
    if (want.samples) {
      const sp = s.samplePoint;
      if (sp && typeof sp.standardValue === 'number') {
        const now = sp.randomOn ? 'Random' : { 1: 'Start', 2: 'Middle', 3: 'End' }[sp.standardValue];
        if (want.samples.length === 1 && want.samples[0] === 'Random') sp.randomOn = true;
        else if (want.samples.length === 1) { sp.randomOn = false; sp.standardValue = SAMPLE_POINTS.indexOf(want.samples[0]) + 1; }
        else if (!want.samples.includes(now)) { sp.randomOn = false; sp.standardValue = 1; } // Start is always open
        done.push('sample point');
      } else manual.push('sample point');
    }
    if (want.categories) {
      // assumed shape: { standard: bool | {openings, endings, inserts}, instrumental: ..., ... }
      const sc = s.songCategories;
      if (sc && typeof sc === 'object' && CATEGORIES.every(c => c.toLowerCase() in sc)) {
        for (const c of CATEGORIES) {
          const on = want.categories.includes(c), k = c.toLowerCase();
          if (typeof sc[k] === 'boolean') sc[k] = on;
          else if (sc[k] && typeof sc[k] === 'object') for (const t of Object.keys(sc[k])) if (typeof sc[k][t] === 'boolean') sc[k][t] = on;
        }
        done.push('song categories');
      } else manual.push('song categories');
    }
    if (want.score) {
      const a = s.animeScore;
      if (a && Array.isArray(a.standardValue) && a.standardValue.length === 2) {
        a.standardValue = [Math.max(2, want.score[0]), want.score[1]]; // the lobby slider runs from 2 to 10
        a.advancedOn = false;
        done.push('anime score');
      } else manual.push('anime score');
    }
    for (const [k, key, label] of [['dub', 'dubSongs', 'dub songs'], ['rebroadcast', 'rebroadcastSongs', 'rebroadcast songs']]) {
      if (want[k] === undefined) continue;
      if (typeof s[key] === 'boolean') { s[key] = want[k]; done.push(label); } else manual.push(label);
    }
    if (want.watchedOnly) {
      const sel = s.songSelection;
      if (sel && sel.advancedValue) {
        sel.standardValue = 3; sel.advancedValue = { random: 0, unwatched: 0, watched: songs };
        done.push('song selection');
      } else manual.push('song selection');
    }
    return { done, manual };
  }
  /** Sends the changed room settings. Returns { error } or { done, manual, changed }. */
  function amqApplyLobby(want) {
    if (typeof lobby === 'undefined' || !lobby || !lobby.inLobby) return { error: 'Join a lobby first.' };
    if (!lobby.isHost) return { error: 'Only the room host can change the settings.' };
    if (typeof hostModal === 'undefined' || !hostModal || typeof hostModal.getSettings !== 'function' ||
        typeof hostModal.changeSettings !== 'function' || typeof lobby.changeGameSettings !== 'function') {
      return { error: "Can't reach AMQ's room settings. Set them by hand." };
    }
    const s = JSON.parse(JSON.stringify(hostModal.getSettings(true)));
    const result = lobbySettingsFor(s, want);
    const current = lobby.settings || {};
    const diff = Object.fromEntries(Object.entries(s).filter(([k, v]) => JSON.stringify(current[k]) !== JSON.stringify(v)));
    if (Object.keys(diff).length) {
      hostModal.changeSettings(diff);
      setTimeout(() => lobby.changeGameSettings(), 1);
    }
    return { ...result, changed: Object.keys(diff).length > 0 };
  }

  // ---------- unlocks / eligibility ----------
  const gated = c => !!(S.data && S.data.gated.includes(c));
  function rebuildUnlocks() {
    const u = { types: new Set(), decades: new Set(), genres: new Set(), formats: new Set(), lens: 0, clocks: 0,
      samples: new Set(['Start']), categories: new Set(['Standard']), scoreLens: 0, dub: false, rebroadcast: false };
    let fragments = 0, r;
    for (const name of S.received) {
      if ((r = /^(Opening|Ending|Insert Song) Pass$/.exec(name))) u.types.add(r[1]);
      else if ((r = /^Decade Pass: (.+)$/.exec(name))) u.decades.add(r[1]);
      else if ((r = /^Genre Key: (.+)$/.exec(name))) u.genres.add(r[1]);
      else if ((r = /^Format Pass: (.+)$/.exec(name))) u.formats.add(r[1]);
      else if (name === 'Progressive Rarity Lens') u.lens++;
      else if (name === 'Progressive Guess Time') u.clocks++;
      else if ((r = /^Sample Pass: (.+)$/.exec(name))) u.samples.add(r[1]);
      else if ((r = /^Song Category: (.+)$/.exec(name))) u.categories.add(r[1]);
      else if (name === 'Progressive Score Lens') u.scoreLens++;
      else if (name === 'Dub Pass') u.dub = true;
      else if (name === 'Rebroadcast Pass') u.rebroadcast = true;
      else if (name === 'Mixtape Fragment') fragments++;
    }
    S.unlocks = u; S.fragments = fragments;
  }
  const maxTier = () => (gated('Rarity') ? Math.min(TIERS.length - 1, freeTiers() - 1 + S.unlocks.lens) : TIERS.length - 1);
  const maxScoreTier = () => (gated('Anime Score') ? Math.min(SCORE_TIERS.length - 1, freeScoreTiers() - 1 + S.unlocks.scoreLens)
    : SCORE_TIERS.length - 1);
  const genreCounts = g => !gated('Genres') || S.unlocks.genres.has(g);
  /** Longest room guess time that counts, in seconds. */
  function allowedGuessTime() {
    const gt = (S.data && S.data.guess_time) || { start: 10, step: 5 };
    return Math.min(GUESS_TIME_MAX, gt.start + gt.step * S.unlocks.clocks);
  }
  /** Returns null when the song counts, otherwise a short reason. */
  const songSource = () => (S.data && S.data.song_source) || 'any';
  function ineligibleReason(song, own, room = {}) {
    const U = S.unlocks;
    if (gated('Guess Time') && room.guessTime !== null && room.guessTime !== undefined && room.guessTime > allowedGuessTime()) {
      return `guess time ${room.guessTime}s, ${allowedGuessTime()}s allowed`;
    }
    if (gated('Sample Point') && room.samplePoint && !U.samples.has(room.samplePoint)) {
      return `${room.samplePoint} sample point locked`;
    }
    if (songSource() === 'own_list' && !own.onList) return 'not on your list';
    if (gated('Song Types') && !U.types.has(song.type)) return song.type ? `${song.type} locked` : 'unknown song type';
    if (gated('Decades') && !U.decades.has(song.decade)) return song.decade ? `${song.decade} locked` : 'unknown year';
    if (gated('Formats') && !U.formats.has(song.format)) return song.format ? `${song.format} locked` : 'unknown format';
    if (gated('Rarity') && !(song.tier && TIERS.indexOf(song.tier) <= maxTier())) return song.tier ? `${song.tier} songs locked` : 'unrated difficulty';
    if (gated('Genres') && !song.genres.some(g => U.genres.has(g))) return song.genres.length ? 'no unlocked genre' : 'no genre data';
    // unreadable (undefined) values never block a song; see extractSong
    if (gated('Song Category') && song.category && !U.categories.has(song.category)) return `${song.category} songs locked`;
    if (gated('Anime Score') && song.scoreTier !== undefined && !(song.scoreTier && SCORE_TIERS.indexOf(song.scoreTier) <= maxScoreTier())) {
      return song.scoreTier ? `${song.scoreTier} anime locked` : 'unscored anime';
    }
    if (gated('Dub & Rebroadcast') && song.dub && !U.dub) return 'dub songs locked';
    if (gated('Dub & Rebroadcast') && song.rebroadcast && !U.rebroadcast) return 'rebroadcasts locked';
    return null;
  }

  // ---------- Archipelago connection ----------
  const send = msgs => { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(msgs)); };
  function say(text) {
    S.log.push(text);
    if (S.log.length > 80) S.log.shift();
    render();
  }
  /** Logs and, unless the AMQ chat bridge is off, also posts to AMQ's chat. */
  function notify(text) {
    say(text);
    if (S.chatMode !== 'off') amqChat('[AP] ' + text);
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
      S.connected = false;
      if (!opened && tryBoth && target.startsWith('wss://')) { S.ready = false; return open('ws://' + url, false); }
      if (S.manualClose) { S.ready = false; S.offline = false; render(); return; }
      // keep counting while the connection is down; checks wait in the pending queue until the next login
      S.offline = S.ready && !!S.data;
      if (!S.offline) S.ready = false;
      if (was || opened) say(S.offline ? 'Connection lost. Still counting; checks are sent once you are back.' : 'Connection lost.');
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
    S.ws = null; S.connected = false; S.ready = false; S.offline = false;
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
      case 'Connected': {
        // after a dropped connection to the same slot, the game in progress carries on
        const resume = S.offline && S.team === m.team && S.slot === m.slot && S.lastSeed === S.seed;
        S.connected = true; S.ready = false; S.offline = false; S.goalSent = false; S.lastSeed = S.seed;
        S.team = m.team; S.slot = m.slot; S.slotName = S.conn.slot; S.data = m.slot_data || {};
        S.data.gated = S.data.gated || [];
        S.data.checks = S.data.checks || [];
        S.players = {};
        (m.players || []).forEach(p => { if (p.team === m.team) S.players[p.slot] = p.alias || p.name; });
        S.slotInfo = m.slot_info || {};
        S.checked = new Set(m.checked_locations || []);
        S.received = []; S.queued = []; S.scouts = {};
        rebuildUnlocks();
        if (!resume) S.game = freshGame();
        if ((S.data.client_version || 0) > CLIENT_VERSION) say('This seed expects a newer userscript. Please update.');
        {
          const tags = [S.data.death_link && 'DeathLink', S.data.trap_link && 'TrapLink', S.data.ring_link && 'RingLink']
            .filter(Boolean);
          if (tags.length) send([{ cmd: 'ConnectUpdate', tags }]);
        }
        send([{ cmd: 'Get', keys: [dsKey()] }]);
        { // what each open check holds; create_as_hint 0 so nothing is announced or spent
          const open = S.data.checks.map(c => c.id).filter(id => !S.checked.has(id));
          if (open.length) send([{ cmd: 'LocationScouts', locations: open, create_as_hint: 0 }]);
        }
        say(`Logged in as ${S.slotName}.`);
        break;
      }
      case 'Retrieved': {
        if (!m.keys || !(dsKey() in m.keys) || S.ready) break;
        const remote = m.keys[dsKey()];
        const local = load(storeKey('prog'), null);
        // the save with more songs played wins (local after playing offline); on a tie the server's copy
        const pick = [remote, local].filter(x => x && typeof x === 'object' && x.v === 1)
          .sort((a, b) => (b.answered || 0) - (a.answered || 0))[0];
        S.prog = Object.assign(freshProgress(), pick || {});
        S.prog.traps = Object.assign(freshProgress().traps, (pick && pick.traps) || {});
        S.ready = true;
        S.queued.splice(0).forEach(onItems);
        applyTraps();
        flushPending();
        evaluate();
        break;
      }
      case 'ReceivedItems':
        if (S.ready) onItems(m); else S.queued.push(m);
        break;
      case 'LocationInfo':
        (m.locations || []).forEach(it => { S.scouts[it.location] = it; });
        break;
      case 'RoomUpdate':
        (m.checked_locations || []).forEach(l => S.checked.add(l));
        if ((m.checked_locations || []).length) evaluate(); // a collect can finish a check-based goal
        break;
      case 'PrintJSON': {
        const text = printJson(m.data || []);
        say(text);
        if (chatWants(m)) amqChat('[AP] ' + text);
        break;
      }
      case 'Bounced':
        if ((m.tags || []).includes('DeathLink')) onDeath(m.data || {});
        if ((m.tags || []).includes('TrapLink')) onTrapLink(m.data || {});
        if ((m.tags || []).includes('RingLink')) onRingLink(m.data || {});
        break;
    }
    render();
  }

  // ---------- offline queue ----------
  const allPending = () => [...new Set([...load(storeKey('pending'), []), ...S.pending])];
  /** Sends the checks found while the connection was down. */
  function flushPending() {
    const ids = new Set(S.data.checks.map(c => c.id));
    const pending = allPending().filter(id => ids.has(id) && !S.checked.has(id));
    S.pending = []; save(storeKey('pending'), []);
    if (!pending.length) return;
    pending.forEach(id => S.checked.add(id));
    send([{ cmd: 'LocationChecks', locations: pending }]);
    say(`Sent ${pending.length} check${pending.length > 1 ? 's' : ''} found while offline.`);
  }
  /** Progress and unsent checks as text, to carry to another browser when the server can't be reached. */
  function exportState() {
    return JSON.stringify({ amqap: 1, seed: S.seed, team: S.team, slot: S.slot, prog: S.prog, pending: allPending() });
  }
  function importState(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { d = null; }
    if (!d || d.amqap !== 1 || !d.prog || typeof d.prog !== 'object') return 'That is not an export from this client.';
    if (!S.data) return 'Connect to the slot first.';
    if (d.seed !== S.seed || d.team !== S.team || d.slot !== S.slot) return 'That export is for a different seed or slot.';
    const newer = (d.prog.answered || 0) > (S.prog.answered || 0);
    if (newer) {
      S.prog = Object.assign(freshProgress(), d.prog);
      S.prog.traps = Object.assign(freshProgress().traps, d.prog.traps || {});
    }
    S.pending = [...new Set([...allPending(), ...(Array.isArray(d.pending) ? d.pending : [])])];
    save(storeKey('pending'), S.pending);
    if (S.connected && S.ready) { flushPending(); saveProg(); evaluate(); } else save(storeKey('prog'), S.prog);
    applyTraps();
    return newer ? 'Imported progress and unsent checks.' : 'Imported unsent checks; this browser has already played more songs.';
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

  // ---------- AMQ chat bridge ----------
  const CHAT_ALWAYS = ['Chat', 'ServerChat', 'CommandResult', 'AdminCommandResult', 'Countdown'];
  const CHAT_MINE = ['ItemSend', 'ItemCheat', 'Hint', 'Goal', 'Release', 'Collect'];
  /** off: nothing; mine: chat, command replies and items or hints involving this slot; all: everything. */
  function chatWants(m) {
    if (S.chatMode === 'off') return false;
    if (S.chatMode === 'all' || !m.type || CHAT_ALWAYS.includes(m.type)) return true;
    const mine = m.receiving === S.slot || (m.item && m.item.player === S.slot) || m.slot === S.slot;
    return mine && CHAT_MINE.includes(m.type);
  }
  function reply(text) { say(text); amqChat('[AP] ' + text); }
  /** "/ap ..." from AMQ's chat: local commands, everything else goes to the Archipelago room (so !hint etc. work). */
  function apCommand(text) {
    if (!text || /^help$/i.test(text)) {
      reply('/ap <message> talks to the multiworld. Server commands work too: /ap !hint <item>, /ap !remaining. ' +
        '/ap lobby applies your unlocks to the room settings, /ap next suggests what to play, /ap lobby next ' +
        'focuses the room on that, /ap missing lists the unlocks you have not found.');
    } else if (/^lobby$/i.test(text)) {
      applyLobby(reply);
    } else if (/^lobby\s+next$/i.test(text)) {
      applyFocus(reply);
    } else if (/^next$/i.test(text)) {
      if (!S.ready) return reply('Connect to Archipelago first.');
      const next = nextUp(3);
      reply(next.length ? 'Closest checks: ' + next.map(c => { const [a, b] = progressOf(c, false); return `${c.name} (${a}/${b})`; }).join('; ') +
        '. /ap lobby next focuses the room on the first.' : 'No open check can be focused with the room settings right now.');
    } else if (/^missing$/i.test(text)) {
      if (!S.ready) return reply('Connect to Archipelago first.');
      const missing = missingUnlocks();
      reply(missing.length ? `Not found yet: ${missing.join(', ')}. Hint one with /ap !hint <item> or the panel.` : 'You have every unlock.');
    } else if (!S.connected) {
      reply('Not connected. Open the AP panel to connect.');
    } else {
      send([{ cmd: 'Say', text }]);
    }
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

  /** Applies one of this world's traps and returns what happened, or null if `name` is not a trap here. */
  function trapEffect(name) {
    const d = (S.data && S.data.trap_duration) || 3;
    if (name in TIMED_TRAPS) { S.prog.traps[TIMED_TRAPS[name]] += d; return `${name}! Lasts ${d} songs.`; }
    if (name === 'Streak Wipe Trap') { S.game.streak = 0; return 'Streak Wipe Trap! Your streak is gone.'; }
    if (name === 'Tax Collector Trap') { S.prog.total = Math.max(0, S.prog.total - 5); return 'Tax Collector Trap! -5 milestone progress.'; }
    return null;
  }
  function applyOneShot(name) {
    const trap = trapEffect(name);
    if (trap) {
      notify(trap);
      if (S.data.trap_link) {
        send([{ cmd: 'Bounce', tags: ['TrapLink'], data: { time: Date.now() / 1000, source: S.slotName, trap_name: name } }]);
      }
    }
    else if (name === 'Encore Ticket') { S.prog.encore++; notify('Encore Ticket: your next counted answer is worth 2.'); }
    else if (name === 'Streak Shield') { S.prog.shield++; notify('Streak Shield ready.'); }
    else if (name === 'Mulligan') { S.prog.mulligan++; notify('Mulligan: your next eligible miss is forgiven as if the song never played.'); }
    else if (name === 'Spotlight') { S.prog.spotlight++; notify('Spotlight: your next counted answer counts twice toward its category checks.'); }
    else if (name === 'Hype Cheer') {
      S.prog.total += 2;
      for (const k of Object.keys(S.prog.traps)) if (S.prog.traps[k] > 0) S.prog.traps[k]--;
      notify('Hype Cheer! +2 milestone progress, and active traps end a song sooner.');
    }
    applyTraps();
  }

  // ---------- TrapLink ----------
  // Other games' trap names, matched by keyword to the closest trap here. Unknown kinds are ignored.
  const LINKED_TRAPS = [
    [/mute|silen|deaf|quiet|sound|audio|music/i, 'Mute Trap'],
    [/revers|confus|invert|mirror|backward|flip|scramble/i, 'Reverse Typing Trap'],
    [/blind|dark|blur|pixel|fog|black|night/i, 'Blind Trap'],
    [/tiny|small|shrink|zoom|fuzz|text|font/i, 'Tiny Text Trap'],
    [/tax|money|coin|rupee|cash|gold|bank|debt/i, 'Tax Collector Trap'],
    [/reset|wipe|amnesia|forget|stun|freeze|slow|paraly/i, 'Streak Wipe Trap'],
  ];
  function linkedTrap(name) {
    if (typeof name !== 'string') return null;
    if (TRAPS.includes(name)) return name;
    const hit = LINKED_TRAPS.find(([re]) => re.test(name));
    return hit ? hit[1] : null;
  }
  function onTrapLink(d) {
    if (!S.data || !S.data.trap_link || !S.ready || d.source === S.slotName) return;
    const mine = linkedTrap(d.trap_name);
    if (!mine) { say(`TrapLink: ${d.trap_name} from ${d.source || 'someone'} has no match here.`); return; }
    const text = trapEffect(mine);
    applyTraps(); saveProg();
    notify(`TrapLink from ${d.source || 'someone'} (${d.trap_name}): ${text}`);
  }

  // ---------- RingLink ----------
  /** Rings in (other games) become milestone progress at ring_link_rate rings per point; lost rings take it away. */
  function onRingLink(d) {
    if (!S.data || !S.data.ring_link || !S.ready || d.source === S.ringSource) return;
    const amount = Math.trunc(Number(d.amount) || 0);
    if (!amount) return;
    const rate = S.data.ring_link_rate || 10;
    S.prog.ringBank += amount;
    const whole = Math.trunc(S.prog.ringBank / rate);
    if (whole) {
      S.prog.ringBank -= whole * rate;
      S.prog.total = Math.max(0, S.prog.total + whole);
      say(`Ring Link: ${whole > 0 ? '+' : ''}${whole} milestone progress.`);
    }
    saveProg();
    evaluate();
  }
  function sendRings(amount) {
    if (!S.data.ring_link || !S.connected) return;
    send([{ cmd: 'Bounce', tags: ['RingLink'], data: { time: Date.now() / 1000, source: S.ringSource, amount } }]);
  }

  function saveProg() {
    if (!S.ready) return;
    save(storeKey('prog'), S.prog);
    send([{ cmd: 'Set', key: dsKey(), default: {}, want_reply: false, operations: [{ operation: 'replace', value: S.prog }] }]);
  }

  // ---------- DeathLink ----------
  const deathTrigger = () => (S.data && S.data.death_link_trigger) || 'miss_streak';
  /** A death is due; amnesty forgives the first death_link_amnesty of them, then one is sent and it starts over. */
  function dueDeath(cause) {
    const amnesty = S.data.death_link_amnesty || 0;
    if (S.prog.deathCharges < amnesty) {
      S.prog.deathCharges++;
      notify(`Death Link amnesty: ${cause} Forgiven (${amnesty - S.prog.deathCharges} left before one is sent).`);
      return;
    }
    S.prog.deathCharges = 0;
    sendDeath(cause);
  }
  function sendDeath(cause) {
    S.lastDeathSent = Date.now() / 1000;
    send([{ cmd: 'Bounce', tags: ['DeathLink'], data: { time: S.lastDeathSent, source: S.slotName, cause } }]);
    say('Death Link sent: ' + cause);
  }
  function onDeath(d) {
    if (!S.data || !S.data.death_link || d.source === S.slotName) return;
    S.game.streak = 0;
    S.prog.traps.mute += 1;
    applyTraps(); saveProg();
    notify(`Death Link from ${d.source || 'someone'}${d.cause ? `: ${d.cause}` : ''} Streak wiped, next song muted.`);
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
      T.blind > 0 ? `${QUIZ_VIDEO}{visibility:hidden!important}` : '',
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
  const bump = (obj, key, n = 1) => { obj[key] = (obj[key] || 0) + n; };
  const quickLimits = () => [...new Set(S.data.checks.filter(c => c.kind === 'quick').map(c => c.secs))];
  /** Seconds from the song starting to the last answer locked in with Enter, or null. */
  function answerSeconds() {
    const t = S.songStart && S.lastSubmit >= S.songStart ? (S.lastSubmit - S.songStart) / 1000 : null;
    S.lastSubmit = 0;
    return t;
  }
  function onAnswerResults(p) {
    S.lastPayload = p;
    const secs = answerSeconds();
    if (!(S.connected || S.offline) || !S.ready) return;
    const own = extractOwn(p);
    if (!own) return;
    const song = extractSong(p);
    const g = S.game, P = S.prog;
    g.songs++; P.answered++;
    g.standing = { rank: own.rank, count: own.count };
    const room = { guessTime: roomGuessTime(), samplePoint: roomSamplePoint() };
    const warnOnce = (key, text) => { if (!S.warned.has(key)) { S.warned.add(key); say(text); } };
    if (gated('Guess Time') && room.guessTime === null) {
      warnOnce('guess', "Can't read the room's guess time, so songs count regardless. Keep it within your allowed time.");
    }
    if (gated('Sample Point') && room.samplePoint === null) {
      warnOnce('sample', "Can't read the room's sample point, so songs count regardless and sample point checks can't progress.");
    }
    if (gated('Song Category') && song.category === undefined) {
      const got = song.categoryRaw === undefined ? '' : ` (AMQ sent ${JSON.stringify(song.categoryRaw)})`;
      warnOnce('category', `Can't read the song category${got}, so songs count regardless and song category checks can't progress.`);
    }
    if (gated('Anime Score') && song.scoreTier === undefined) {
      warnOnce('score', "Can't read the anime score, so songs count regardless and anime score checks can't progress.");
    }
    if (gated('Dub & Rebroadcast') && (song.dub === undefined || song.rebroadcast === undefined)) {
      warnOnce('dub', "Can't tell dubs and rebroadcasts apart, so songs count regardless and their checks can't progress.");
    }
    const reason = ineligibleReason(song, own, room);
    let status;
    if (reason) {
      status = `ignored (${reason})`;
      g.ignored++; bump(g.reasons, reason);
    } else {
      g.eligible++;
      if (own.correct) {
        g.eligibleCorrect++; g.streak++; g.best = Math.max(g.best, g.streak); g.missRun = 0; g.dry = 0;
        if (g.afterMiss) { P.bounce++; g.afterMiss = false; }
        if (g.armed) g.comebackBest = Math.max(g.comebackBest, g.streak);
        const weight = P.encore > 0 ? 2 : 1;
        if (weight === 2) P.encore--;
        P.total += weight;
        // Spotlight doubles the per-category counts, Encore the milestones
        const spot = P.spotlight > 0 ? 2 : 1;
        if (spot === 2) P.spotlight--;
        const tally = (bucket, key) => { if (key !== undefined && key !== null) bump(bucket, key, spot); };
        tally(P.type, song.type); tally(P.decade, song.decade); tally(P.format, song.format); tally(P.rarity, song.tier);
        tally(P.sample, room.samplePoint); tally(P.season, song.season); tally(P.category, song.category);
        tally(P.score, song.scoreTier);
        if (song.dub) tally(P.dub, 'Dub');
        if (song.rebroadcast) tally(P.dub, 'Rebroadcast');
        song.genres.filter(genreCounts).forEach(x => { bump(P.genre, x, spot); g.genres.add(x); });
        g.types.add(song.type); g.decades.add(song.decade);
        if (song.season) g.seasons.add(song.season);
        if (song.year) bump(P.years, song.year);
        if (secs !== null) quickLimits().forEach(limit => { if (secs <= limit) bump(P.quick, limit); });
        if (own.nexus) P.nexus++;
        if (own.onList) { P.listOn++; g.listOn++; } else { P.listOff++; g.listOff++; }
        status = weight === 2 ? 'counted x2 (Encore)' : 'counted';
        if (spot === 2) status += ', Spotlight';
        if (secs !== null) status += ` in ${secs.toFixed(1)}s`;
        sendRings(1);
      } else if (P.mulligan > 0) {
        P.mulligan--; g.eligible--; // forgiven as if the song had not played
        status = 'missed, Mulligan used';
      } else if (P.shield > 0) {
        P.shield--; g.afterMiss = true;
        status = 'missed, Streak Shield held';
      } else {
        g.streak = 0; g.missRun++; g.afterMiss = true;
        if (++g.dry >= 3) g.armed = true;
        status = 'missed';
        if (S.data.death_link && deathTrigger() !== 'poor_game' && g.missRun >= S.data.death_link_misses) {
          g.missRun = 0;
          dueDeath(`${S.slotName} missed ${S.data.death_link_misses} songs in a row.`);
        }
      }
    }
    const origin = songSource() === 'any' ? null : own.onList ? 'on list' : 'off list';
    const sample = gated('Sample Point') && room.samplePoint ? `${room.samplePoint} sample` : null;
    const extra = [gated('Song Category') && song.category, gated('Anime Score') && song.scoreTier && `${song.scoreTier} anime`,
      song.dub && 'dub', song.rebroadcast && 'rebroadcast'];
    S.lastSong = [song.type, song.decade, song.format, song.tier, ...extra, sample, origin].filter(Boolean).join(' · ') +
      ' → ' + status;
    if (!g.lobbyWarned && g.songs >= 5 && g.ignored * 5 >= g.songs * 3) {
      g.lobbyWarned = true;
      const top = Object.entries(g.reasons).sort((a, b) => b[1] - a[1])[0][0];
      notify(`${g.ignored} of ${g.songs} songs this game didn't count (most often: ${top}). ` +
        'Use Apply to room in the panel or /ap lobby to match your unlocks.');
    }
    tickTraps();
    evaluate();
    saveProg();
  }
  function onQuizOver() {
    const g = S.game;
    if (!(S.connected || S.offline) || !S.ready || g.finalized || !g.songs) return;
    g.finalized = true;
    evaluate(true);
    const pct = g.eligible ? Math.round(100 * g.eligibleCorrect / g.eligible) : 0;
    if (S.data.death_link && deathTrigger() !== 'miss_streak' && g.eligible >= DEATH_GAME_SONGS &&
        g.eligibleCorrect * 100 < (S.data.death_link_accuracy || 40) * g.eligible) {
      dueDeath(`${S.slotName} finished a game at ${pct}%.`);
    }
    const next = nextUp(1)[0];
    const [a, b] = next ? progressOf(next, false) : [0, 0];
    notify(`Game over: ${g.eligible} of ${g.songs} songs counted, ${g.eligibleCorrect} correct (${pct}%), ` +
      `${g.checksSent} check${g.checksSent === 1 ? '' : 's'} sent.` + (next ? ` Closest: ${next.name} (${a}/${b}).` : ''));
    S.game = freshGame();
    saveProg();
  }
  function onQuizReady() { S.game = freshGame(); applyTraps(); render(); }
  function onSongStart() { S.songStart = Date.now(); S.lastSubmit = 0; applyTraps(); }

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
      case 'season': return [count('season', c.key), c.n];
      case 'sample': return [count('sample', c.key), c.n];
      case 'category': return [count('category', c.key), c.n];
      case 'score': return [count('score', c.key), c.n];
      case 'dub': return [count('dub', c.key), c.n];
      case 'years': return [Object.keys(P.years).length, c.n];
      case 'quick': return [count('quick', c.secs), c.n];
      case 'nexus': return [P.nexus, c.n];
      case 'bounce': return [P.bounce, c.n];
      case 'comeback': return [g.comebackBest, c.n];
      case 'finish': return [final ? g.streak : Math.min(g.streak, c.n - 1), c.n]; // only judged when the game ends
      case 'streak': return [g.best, c.n];
      case 'flawless': return [g.eligible === g.eligibleCorrect ? g.eligible : 0, c.n];
      case 'accuracy': return [g.eligibleCorrect * 100 >= c.pct * g.eligible ? g.eligible : 0, c.n];
      case 'marathon': return [g.songs, c.n];
      case 'game_types': return [g.types.size, c.n];
      case 'game_decades': return [g.decades.size, c.n];
      case 'game_genres': return [g.genres.size, c.n];
      case 'game_seasons': return [g.seasons.size, c.n];
      case 'list_on': return [P.listOn, c.n];
      case 'list_off': return [P.listOff, c.n];
      case 'game_list_mix': return [Math.min(g.listOn, g.listOff), c.n];
      case 'mp_podium': return [final && g.standing && g.standing.count >= c.n && g.standing.rank <= 3 ? 1 : 0, 1];
      case 'mp_win': return [final && g.standing && g.standing.count >= c.n && g.standing.rank === 1 ? 1 : 0, 1];
    }
    return [0, 1];
  }
  /** [done, total] of the checks a check-based goal (scholar, specialist) needs; [0, 0] for other goals. */
  function goalChecks() {
    const kinds = (S.data && S.data.goal_kinds) || [];
    const targets = kinds.length ? S.data.checks.filter(c => kinds.includes(c.kind)) : [];
    return [targets.filter(c => S.checked.has(c.id)).length, targets.length];
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
    if (hits.length) {
      hits.forEach(id => S.checked.add(id));
      S.game.checksSent += hits.length;
      if (S.connected) send([{ cmd: 'LocationChecks', locations: hits }]);
      else { S.pending.push(...hits); save(storeKey('pending'), S.pending); }
    }

    const g = S.game, D = S.data;
    if (D.goal === 'finale' && !S.prog.finaleDone && S.fragments >= D.fragments_required &&
        g.eligible >= D.finale_songs && g.eligibleCorrect * 100 >= D.finale_accuracy * g.eligible) {
      S.prog.finaleDone = true;
      notify('Grand Finale cleared!');
      saveProg();
    }
    const [goalDone, goalTotal] = goalChecks();
    const goalMet = D.goal === 'fragments' || (D.goal === 'finale' && S.prog.finaleDone) ||
      (goalTotal > 0 && goalDone === goalTotal);
    if (!S.goalSent && S.fragments >= D.fragments_required && goalMet) {
      S.goalSent = true;
      send([{ cmd: 'StatusUpdate', status: 30 }]);
      notify('Goal complete!');
    }
    render();
  }

  // ---------- lobby guide ----------
  /** Unlocked decades merged into [from, to] year ranges; null means open-ended. */
  function yearRanges() {
    const idx = DECADES.map((d, i) => (S.unlocks.decades.has(d) ? i : -1)).filter(i => i >= 0);
    const runs = [];
    for (const i of idx) { const last = runs[runs.length - 1]; if (last && last[1] === i - 1) last[1] = i; else runs.push([i, i]); }
    return runs.map(([a, b]) => [DECADE_YEARS[DECADES[a]][0], DECADE_YEARS[DECADES[b]][1]]);
  }
  function vintageRanges() {
    if (!gated('Decades')) return 'any';
    return yearRanges().map(([from, to]) => (from === null ? `up to ${to}` : to === null ? `${from} onward` : `${from}–${to}`))
      .join(', ') || 'none';
  }
  /** What the room settings should be for the current unlocks. Ungated categories are left as they are. */
  function lobbyWish() {
    const U = S.unlocks, want = {};
    if (gated('Song Types')) want.types = Object.values(TYPES).filter(t => U.types.has(t));
    if (gated('Decades')) want.years = yearRanges();
    if (gated('Formats')) want.formats = FORMATS.filter(f => U.formats.has(f));
    if (gated('Rarity')) want.difficulty = [tierFloor(TIERS[maxTier()]), 100];
    if (gated('Genres')) want.genres = GENRES.filter(g => U.genres.has(g));
    if (gated('Guess Time')) want.guessTime = allowedGuessTime();
    if (gated('Sample Point')) want.samples = SAMPLE_POINTS.filter(p => U.samples.has(p));
    if (gated('Song Category')) want.categories = CATEGORIES.filter(c => U.categories.has(c));
    if (gated('Anime Score')) want.score = [scoreFloor(SCORE_TIERS[maxScoreTier()]), 10];
    if (gated('Dub & Rebroadcast')) { want.dub = U.dub; want.rebroadcast = U.rebroadcast; }
    if (songSource() === 'own_list') want.watchedOnly = true;
    return want;
  }

  // ---------- what to play next ----------
  /** The room settings narrowed to one check's category, or null when the room can't be focused on it. */
  function focusWish(c) {
    const U = S.unlocks, want = lobbyWish();
    const open = (cat, ok) => !gated(cat) || ok;
    switch (c.kind) {
      case 'type': if (!open('Song Types', U.types.has(c.key))) return null; want.types = [c.key]; break;
      case 'decade': if (!open('Decades', U.decades.has(c.key))) return null; want.years = [DECADE_YEARS[c.key]]; break;
      case 'genre': if (!genreCounts(c.key)) return null; want.genres = [c.key]; break;
      case 'format': if (!open('Formats', U.formats.has(c.key))) return null; want.formats = [c.key]; break;
      case 'sample': if (!open('Sample Point', U.samples.has(c.key))) return null; want.samples = [c.key]; break;
      case 'category': if (!open('Song Category', U.categories.has(c.key))) return null; want.categories = [c.key]; break;
      case 'rarity': {
        const i = TIERS.indexOf(c.key);
        if (i < 0 || i > maxTier()) return null;
        want.difficulty = [tierFloor(c.key), i ? tierFloor(TIERS[i - 1]) : 100];
        break;
      }
      case 'score': {
        const i = SCORE_TIERS.indexOf(c.key);
        if (i < 0 || i > maxScoreTier()) return null;
        want.score = [scoreFloor(c.key), i ? scoreFloor(SCORE_TIERS[i - 1]) : 10];
        break;
      }
      default: return null;
    }
    return want;
  }
  /** Open checks the room can be focused on, closest to done first. */
  function nextUp(limit) {
    if (!S.data || !S.unlocks) return [];
    return S.data.checks.filter(c => !S.checked.has(c.id) && !stageLock(c) && focusWish(c))
      .map(c => { const [a, b] = progressOf(c, false); return { c, left: b - Math.min(a, b), ratio: Math.min(a, b) / b }; })
      .sort((x, y) => x.left - y.left || y.ratio - x.ratio).slice(0, limit).map(x => x.c);
  }
  function applyFocus(out = say) {
    if (!S.connected || !S.unlocks) return out('Connect to Archipelago first.');
    const c = nextUp(1)[0];
    if (!c) return out('No open check can be focused with the room settings right now.');
    const r = amqApplyLobby(focusWish(c));
    if (r.error) return out(r.error);
    const parts = [`Room focused on ${c.name}${r.changed ? '' : ' (already set)'}.`];
    if (r.manual.length) parts.push(`Set by hand: ${r.manual.join(', ')}.`);
    out(parts.join(' '));
  }

  // ---------- hints ----------
  /** Unlock items this slot has not received yet, for the categories it locks. */
  function missingUnlocks() {
    if (!S.data || !S.unlocks) return [];
    const U = S.unlocks, out = [];
    const add = (cat, all, has, name) => { if (gated(cat)) all.filter(x => !has(x)).forEach(x => out.push(name(x))); };
    add('Song Types', Object.values(TYPES), t => U.types.has(t), t => `${t} Pass`);
    add('Decades', DECADES, d => U.decades.has(d), d => `Decade Pass: ${d}`);
    add('Genres', GENRES, g => U.genres.has(g), g => `Genre Key: ${g}`);
    add('Formats', FORMATS.slice(1), f => U.formats.has(f), f => `Format Pass: ${f}`);
    add('Sample Point', SAMPLE_POINTS.slice(1), x => U.samples.has(x), x => `Sample Pass: ${x}`);
    add('Song Category', CATEGORIES.slice(1), x => U.categories.has(x), x => `Song Category: ${x}`);
    if (gated('Rarity') && maxTier() < TIERS.length - 1) out.push('Progressive Rarity Lens');
    if (gated('Guess Time') && U.clocks < (S.data.guess_time_items || 0)) out.push('Progressive Guess Time');
    if (gated('Anime Score') && maxScoreTier() < SCORE_TIERS.length - 1) out.push('Progressive Score Lens');
    if (gated('Dub & Rebroadcast') && !U.dub) out.push('Dub Pass');
    if (gated('Dub & Rebroadcast') && !U.rebroadcast) out.push('Rebroadcast Pass');
    if (S.fragments < S.data.fragments_required) out.push('Mixtape Fragment');
    return out;
  }
  function hintItem(name) {
    if (!S.connected) return say('Not connected.');
    send([{ cmd: 'Say', text: `!hint ${name}` }]);
    say(`Asked for a hint: ${name}.`);
  }
  function applyLobby(out = say) {
    if (!S.connected || !S.unlocks) return out('Connect to Archipelago first.');
    const r = amqApplyLobby(lobbyWish());
    if (r.error) return out(r.error);
    const parts = [r.changed ? `Lobby updated: ${r.done.join(', ')}.` : 'The lobby already matches your unlocks.'];
    if (r.manual.length) parts.push(`Set by hand: ${r.manual.join(', ')}.`);
    out(parts.join(' '));
  }
  function lobbyGuide() {
    const U = S.unlocks;
    const list = (cat, set, all) => (!gated(cat) ? 'any' : all.filter(x => set.has(x)).join(', ') || 'none');
    return [
      ['Song types', list('Song Types', U.types, Object.values(TYPES))],
      ['Vintage', vintageRanges()],
      ['Anime type', list('Formats', U.formats, FORMATS)],
      ['Difficulty', `${tierFloor(TIERS[maxTier()])}–100%`],
      ['Genres (optional)', list('Genres', U.genres, GENRES)],
      ['Guess time', gated('Guess Time') ? `${allowedGuessTime()}s or less` : 'any'],
      ['Sample point', list('Sample Point', U.samples, SAMPLE_POINTS)],
      ...(gated('Song Category') ? [['Song categories', list('Song Category', U.categories, CATEGORIES)]] : []),
      ...(gated('Anime Score') ? [['Anime score', `${Math.max(2, scoreFloor(SCORE_TIERS[maxScoreTier()]))}–10`]] : []),
      ...(gated('Dub & Rebroadcast') ? [['Dubs / rebroadcasts', `${U.dub ? 'on' : 'off'} / ${U.rebroadcast ? 'on' : 'off'}`]] : []),
      ['Song selection', { any: 'any', own_list: 'watched only (your list)', mixed: 'mix of watched and random' }[songSource()] || 'any'],
    ];
  }

  // ---------- scouting ----------
  const IMPORTANCE = it => (it.flags & 1 ? 'progression' : it.flags & 2 ? 'useful' : it.flags & 4 ? 'trap' : 'filler');
  /** What a check holds, per the panel's scouting setting, or '' when unknown or hidden. */
  function scoutLabel(id) {
    const it = S.scouts[id];
    if (!it || S.scoutMode === 'off') return '';
    const kind = IMPORTANCE(it);
    if (S.scoutMode === 'importance') return kind;
    const name = ((S.games[gameOf(it.player)] || {}).items || {})[it.item] || `#${it.item}`;
    const owner = it.player === S.slot ? 'your' : `${playerName(it.player)}'s`;
    return `${owner} ${name} (${kind})`;
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
      #amq-ap-panel .dim{color:#999}#amq-ap-panel .prog{color:#ffd76a}`;
    document.head.appendChild(css);
    const btn = document.createElement('button');
    btn.id = 'amq-ap-btn'; btn.textContent = 'AP';
    panel = document.createElement('div'); panel.id = 'amq-ap-panel';
    body = document.createElement('div'); panel.appendChild(body);
    btn.onclick = () => { panel.style.display = panel.style.display === 'block' ? 'none' : 'block'; render(); };
    document.body.appendChild(btn); document.body.appendChild(panel);
  }
  const openState = {};
  let backupDraft = ''; // survives re-renders while something is pasted into the Backup box
  function section(id, title, html) {
    return `<details data-id="${id}"${openState[id] ? ' open' : ''}><summary>${title}</summary>${html}</details>`;
  }
  function render() {
    if (!body || panel.style.display !== 'block') return;
    body.querySelectorAll && body.querySelectorAll('details').forEach(d => { openState[d.dataset.id] = d.open; });
    const draft = body.querySelector && body.querySelector('#ap-backup');
    if (draft) backupDraft = draft.value;
    let h = '';
    if (!S.connected && !S.offline) {
      h += `<input id="ap-url" placeholder="server:port" value="${esc(S.conn.url)}">
        <input id="ap-slot" placeholder="slot name" value="${esc(S.conn.slot)}">
        <input id="ap-pw" type="password" placeholder="password (optional)">
        <button id="ap-go">Connect</button>`;
    } else {
      const D = S.data, P = S.prog, g = S.game;
      const done = D.checks.filter(c => S.checked.has(c.id)).length;
      h += `<b>${esc(S.slotName)}</b> · checks ${done}/${D.checks.length} · fragments ${S.fragments}/${D.fragments_required}
        <button id="ap-dc" style="float:right">Disconnect</button><br>
        <span class="dim">Correct ${P.total} · streak ${g.streak} (best ${g.best}) · encore ${P.encore} · shield ${P.shield}` +
        `${P.mulligan ? ` · mulligan ${P.mulligan}` : ''}${P.spotlight ? ` · spotlight ${P.spotlight}` : ''}</span><br>`;
      if (S.offline) h += '<b style="color:#ffd76a">Offline: still counting, checks are sent when the connection is back.</b><br>';
      const traps = Object.entries(P.traps).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`);
      if (traps.length) h += `<b style="color:#ff7a7a">Traps: ${traps.join(', ')} songs</b><br>`;
      if (S.lastSong) h += `<span class="dim">Last song: ${esc(S.lastSong)}</span><br>`;
      if (D.goal === 'finale') {
        h += P.finaleDone ? 'Finale: cleared<br>' : S.fragments >= D.fragments_required
          ? `<b>Finale open:</b> ${D.finale_songs}+ counted songs at ${D.finale_accuracy}% in one game<br>` : '';
      }
      const [goalDone, goalTotal] = goalChecks();
      if (goalTotal) h += `Goal: ${goalDone}/${goalTotal} ${D.goal === 'scholar' ? 'Genre Scholar' : 'song type'} checks<br>`;
      h += section('guide', 'Lobby settings', '<table>' + lobbyGuide().map(([k, v]) => `<tr><td class="dim">${k}</td><td>${esc(v)}</td></tr>`).join('') + '</table>' +
        '<button id="ap-lobby">Apply to room (host only)</button>');
      const next = nextUp(3);
      h += section('next', 'Play next', next.length ? '<table>' + next.map(c => {
        const [a, b] = progressOf(c, false);
        return `<tr><td>${esc(c.name)}</td><td class="dim" style="width:50px">${Math.min(a, b)}/${b}</td></tr>`;
      }).join('') + '</table><button id="ap-focus">Focus room on the first (host only)</button>'
        : '<span class="dim">No open check can be focused with the room settings right now.</span>');
      const missing = missingUnlocks();
      h += section('hints', `Hint an unlock (${missing.length})`, missing.length
        ? missing.map(n => `<button data-hint="${esc(n)}" style="margin:1px">${esc(n)}</button>`).join('') +
          '<br><span class="dim">Asks the server for a hint (costs hint points like !hint).</span>'
        : '<span class="dim">You have every unlock.</span>');
      const open = D.checks.filter(c => !S.checked.has(c.id)).map(c => {
        const [a, b] = progressOf(c, false);
        return { c, a: Math.min(a, b), b };
      }).sort((x, y) => (stageLock(x.c) > 0) - (stageLock(y.c) > 0) || y.a / y.b - x.a / x.b);
      const stageName = c => ((D.stages || [])[c.stage || 0]) || 'next stage';
      const scoutOpt = (v, label) => `<option value="${v}"${S.scoutMode === v ? ' selected' : ''}>${label}</option>`;
      h += section('checks', `Open checks (${open.length})`, `<span class="dim">Show contents</span> <select id="ap-scout">` +
        `${scoutOpt('items', 'items')}${scoutOpt('importance', 'importance only')}${scoutOpt('off', 'nothing')}</select>` + '<table>' + open.slice(0, 40).map(({ c, a, b }) => {
        const lock = stageLock(c);
        const scout = scoutLabel(c.id), star = S.scouts[c.id] && S.scouts[c.id].flags & 1 && S.scoutMode !== 'off';
        const note = (scout ? `<br><span class="${star ? 'prog' : 'dim'}">→ ${esc(scout)}</span>` : '') +
          (lock ? `<br><span class="dim">${esc(stageName(c))}: ${lock} more fragment${lock > 1 ? 's' : ''}</span>` : '');
        return `<tr><td>${esc(c.name)}${note}</td><td style="width:70px"><div class="bar"><i style="width:${Math.round(100 * a / b)}%"></i></div><span class="dim">${a}/${b}</span></td></tr>`;
      }).join('') + '</table>');
    }
    const chatOpt = (v, label) => `<option value="${v}"${S.chatMode === v ? ' selected' : ''}>${label}</option>`;
    h += section('log', 'Log', `<div style="max-height:140px;overflow:auto">${S.log.slice(-25).map(esc).join('<br>')}</div>` +
      `<span class="dim">Show in AMQ chat</span> <select id="ap-chat">${chatOpt('mine', 'my items, hints, chat')}${chatOpt('all', 'everything')}${chatOpt('off', 'nothing')}</select>` +
      '<br><span class="dim">Type /ap help in AMQ chat for commands.</span>');
    if (S.data) {
      h += section('backup', 'Backup', `<textarea id="ap-backup" rows="3" style="width:100%;box-sizing:border-box;color:#000">${esc(backupDraft)}</textarea>` +
        '<button id="ap-export">Export</button> <button id="ap-import">Import</button>' +
        '<br><span class="dim">Carries progress and unsent checks to another browser when the server is unreachable.</span>');
    }
    body.innerHTML = h;
    const $ = sel => body.querySelector(sel);
    const go = $('#ap-go'), dc = $('#ap-dc'), lob = $('#ap-lobby'), chat = $('#ap-chat'), scout = $('#ap-scout');
    const focus = $('#ap-focus'), exp = $('#ap-export'), imp = $('#ap-import');
    if (focus) focus.onclick = () => applyFocus();
    if (exp) exp.onclick = () => { $('#ap-backup').value = exportState(); say('Exported to the Backup box. Copy it from there.'); };
    if (imp) imp.onclick = () => { const text = $('#ap-backup').value; $('#ap-backup').value = ''; say(importState(text)); };
    body.querySelectorAll('[data-hint]').forEach(b => { b.onclick = () => hintItem(b.dataset.hint); });
    if (go) go.onclick = () => connect($('#ap-url').value, $('#ap-slot').value, $('#ap-pw').value);
    if (dc) dc.onclick = () => { disconnect(); say('Disconnected.'); };
    if (lob) lob.onclick = () => applyLobby();
    if (chat) chat.onchange = () => { S.chatMode = chat.value; save('chat', chat.value); };
    if (scout) scout.onchange = () => { S.scoutMode = scout.value; save('scout', scout.value); render(); };
  }

  // ---------- boot ----------
  window.AMQAP = { state: S, connect, disconnect, handle, onAnswerResults, onQuizOver, onQuizReady, extractSong, extractOwn,
    lobbyGuide, lobbyWish, lobbySettingsFor, applyLobby, apCommand, stageLock, scoutLabel, focusWish, nextUp, applyFocus,
    missingUnlocks, hintItem, exportState, importState,
    open: () => { panel.style.display = 'block'; render(); } };
  const wait = setInterval(() => {
    if (typeof Listener === 'undefined' || !document.body) return;
    clearInterval(wait);
    buildUi();
    const listen = (name, fn) => {
      try { new Listener(name, fn).bindListener(); } catch (e) { console.error('[AMQ-AP] cannot bind', name, e); }
    };
    listen('answer results', p => { try { onAnswerResults(p); } catch (e) { console.error('[AMQ-AP]', e); } });
    listen('quiz ready', onQuizReady);
    listen('play next song', onSongStart); // AMQ resets volume per song, so this also re-asserts the mute trap
    listen('quiz over', onQuizOver);
    hookChatInput(apCommand);
    hookAnswerInput(() => { S.lastSubmit = Date.now(); });
    let lastEcho = { text: null, at: 0 }; // both chat events can carry the same message; never spend a hint twice
    const fromChat = p => ownChatCommands(p).forEach(text => {
      if (text === lastEcho.text && Date.now() - lastEcho.at < 3000) return;
      lastEcho = { text, at: Date.now() };
      apCommand(text);
    });
    listen('game chat update', fromChat);
    listen('Game Chat Message', fromChat);
  }, 500);
})();
