// ==UserScript==
// @name         Anime Music Quiz - Archipelago Client
// @namespace    https://github.com/niklaskodev/amq-apworld
// @version      0.1.0
// @description  Connects Anime Music Quiz to an Archipelago multiworld. Unaffiliated fan project.
// @match        https://animemusicquiz.com/*
// @match        https://*.animemusicquiz.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/* Field names read from AMQ's "answer results" payload live in ONE place: extractSong() / extractOwn().
   If AMQ changes its payload, adjust only those two functions. */
(function () {
  'use strict';

  const GAME = 'Anime Music Quiz';
  const LS = 'amq_ap_';
  const TIERS = ['Easy', 'Medium', 'Hard', 'Brutal'];
  const TYPES = { 1: 'Opening', 2: 'Ending', 3: 'Insert Song' };
  const DECADES = ['1980s & Earlier', '1990s', '2000s', '2010s', '2020s'];

  // ---------- small helpers ----------
  const load = (k, d) => { try { const v = localStorage.getItem(LS + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  const uuid = () => load('uuid', null) || (() => { const u = crypto.randomUUID(); save('uuid', u); return u; })();

  // ---------- state ----------
  const S = {
    ws: null, connected: false, slot: null, team: 0, slotNum: 0, data: null,
    idToItem: {}, idToLoc: {}, locToId: {},
    checked: new Set(), received: [], processed: 0,
    unlocks: { types: new Set(), decades: new Set(), genres: new Set(), formats: new Set(), lens: 0 },
    fragments: 0, finaleDone: false, goalSent: false,
    prog: load('prog', { total: 0, type: {}, decade: {}, genre: {}, format: {}, rarity: {} }),
    boost: { encore: 0, shield: 0 },
    traps: { mute: 0, reverse: 0, tiny: 0 },
    game: null,
    log: [],
  };
  const newGame = () => ({ songs: 0, correct: 0, eligible: 0, eligibleCorrect: 0, streak: 0, best: 0,
    types: new Set(), decades: new Set(), genres: new Set() });

  // ---------- AMQ payload adapters (single place to fix if the site changes) ----------
  function vintageToDecade(vintage) {
    const m = /(\d{4})/.exec(vintage || '');
    if (!m) return null;
    const y = +m[1];
    return y < 1990 ? DECADES[0] : y < 2000 ? DECADES[1] : y < 2010 ? DECADES[2] : y < 2020 ? DECADES[3] : DECADES[4];
  }
  function rateToTier(rate) {
    if (typeof rate !== 'number' || isNaN(rate)) return null;
    return rate >= 70 ? 'Easy' : rate >= 40 ? 'Medium' : rate >= 20 ? 'Hard' : 'Brutal';
  }
  function extractSong(p) {
    const s = (p && p.songInfo) || {};
    const genresRaw = s.animeGenre || s.genres || [];
    return {
      type: TYPES[s.type] || (typeof s.type === 'string' ? s.type : null),
      decade: vintageToDecade(s.vintage),
      genres: genresRaw.map(g => (typeof g === 'string' ? g : g && g.name)).filter(Boolean),
      format: s.animeType || null,
      tier: rateToTier(s.animeDifficulty),
    };
  }
  function extractOwn(p) {
    const id = (typeof quiz !== 'undefined' && quiz) ? quiz.ownGamePlayerId : undefined;
    if (id === undefined || id === null) return null; // spectating
    const players = p.players || [];
    const me = players.find(x => x.gamePlayerId === id);
    if (!me) return null;
    const ranked = players.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    return { correct: !!(me.correct || me.correctGuess), score: me.score || 0, count: players.length,
      rank: ranked.findIndex(x => x.gamePlayerId === id) + 1 };
  }

  // ---------- eligibility ----------
  const gated = c => S.data && S.data.gated.includes(c);
  function eligible(song) {
    if (!song.type || !song.decade || !song.format || !song.tier) return false; // unknown fields never count
    if (gated('Song Types') && !S.unlocks.types.has(song.type)) return false;
    if (gated('Decades') && !S.unlocks.decades.has(song.decade)) return false;
    if (gated('Formats') && !S.unlocks.formats.has(song.format)) return false;
    if (gated('Rarity') && TIERS.indexOf(song.tier) > S.unlocks.lens) return false;
    if (gated('Genres') && !song.genres.some(g => S.unlocks.genres.has(g))) return false;
    return true;
  }

  // ---------- Archipelago protocol ----------
  const send = msgs => S.ws && S.ws.readyState === 1 && S.ws.send(JSON.stringify(msgs));
  const say = t => { S.log.push(t); if (S.log.length > 60) S.log.shift(); render(); };

  function connect(url, slot, pw) {
    if (!/^wss?:\/\//.test(url)) url = 'wss://' + url;
    S.slot = slot; S.pw = pw;
    save('conn', { url, slot });
    const ws = (S.ws = new WebSocket(url));
    ws.onopen = () => say('Socket open.');
    ws.onclose = () => { S.connected = false; say('Disconnected.'); render(); };
    ws.onerror = () => say('Connection error. Try ws:// for non-TLS servers.');
    ws.onmessage = ev => JSON.parse(ev.data).forEach(handle);
  }

  function handle(m) {
    switch (m.cmd) {
      case 'RoomInfo':
        send([{ cmd: 'GetDataPackage', games: [GAME] }]);
        break;
      case 'DataPackage': {
        const g = m.data.games[GAME];
        S.idToItem = Object.fromEntries(Object.entries(g.item_name_to_id).map(([n, i]) => [i, n]));
        S.idToLoc = Object.fromEntries(Object.entries(g.location_name_to_id).map(([n, i]) => [i, n]));
        send([{ cmd: 'Connect', password: S.pw || '', game: GAME, name: S.slot, uuid: uuid(),
          version: { major: 0, minor: 6, build: 7, class: 'Version' }, items_handling: 7, tags: [], slot_data: true }]);
        break;
      }
      case 'ConnectionRefused': say('Refused: ' + (m.errors || []).join(', ')); break;
      case 'Connected':
        S.connected = true; S.team = m.team; S.slotNum = m.slot; S.data = m.slot_data;
        S.checked = new Set(m.checked_locations);
        S.processed = load(`proc_${S.team}_${S.slotNum}`, 0);
        S.finaleDone = load(`finale_${S.team}_${S.slotNum}`, false);
        S.prog = load(`prog_${S.team}_${S.slotNum}`, S.prog);
        S.game = newGame();
        say('Connected as ' + S.slot + '.');
        send([{ cmd: 'Get', keys: [dsKey()] }]);
        break;
      case 'Retrieved': {
        const v = m.keys && m.keys[dsKey()];
        if (v && v.total > S.prog.total) { S.prog = v; saveProg(); }
        break;
      }
      case 'ReceivedItems': onItems(m); break;
      case 'RoomUpdate': (m.checked_locations || []).forEach(l => S.checked.add(l)); break;
      case 'PrintJSON': say((m.data || []).map(p => p.text || '').join('')); break;
    }
    render();
  }

  const dsKey = () => `AMQ_${S.team}_${S.slotNum}_progress`;
  function saveProg() {
    save(`prog_${S.team}_${S.slotNum}`, S.prog);
    send([{ cmd: 'Set', key: dsKey(), default: {}, want_reply: false, operations: [{ operation: 'replace', value: S.prog }] }]);
  }

  function onItems(m) {
    if (m.index === 0) { // full resync
      S.received = []; S.unlocks = { types: new Set(), decades: new Set(), genres: new Set(), formats: new Set(), lens: 0 };
      S.fragments = 0; S.boost = { encore: 0, shield: 0 };
    }
    m.items.forEach((it, i) => {
      const name = S.idToItem[it.item];
      const idx = m.index + i;
      S.received.push(name);
      applyPermanent(name);
      if (idx >= S.processed) applyOneShot(name);
    });
    S.processed = Math.max(S.processed, m.index + m.items.length);
    save(`proc_${S.team}_${S.slotNum}`, S.processed);
    evaluateGoal();
  }

  function applyPermanent(name) {
    let r;
    if ((r = /^(Opening|Ending|Insert Song) Pass$/.exec(name))) S.unlocks.types.add(r[1]);
    else if ((r = /^Decade Pass: (.+)$/.exec(name))) S.unlocks.decades.add(r[1]);
    else if ((r = /^Genre Key: (.+)$/.exec(name))) S.unlocks.genres.add(r[1]);
    else if ((r = /^Format Pass: (.+)$/.exec(name))) S.unlocks.formats.add(r[1]);
    else if (name === 'Progressive Rarity Lens') S.unlocks.lens++;
    else if (name === 'Mixtape Fragment') S.fragments++;
  }

  function applyOneShot(name) {
    const d = (S.data && S.data.trap_duration) || 3;
    switch (name) {
      case 'Encore Ticket': S.boost.encore++; say('Encore Ticket ready: next correct answer counts twice.'); break;
      case 'Streak Shield': S.boost.shield++; say('Streak Shield ready.'); break;
      case 'Hype Cheer': say('Hype Cheer! \u{1F389}'); break;
      case 'Mute Trap': S.traps.mute += d; say(`Mute Trap! ${d} songs.`); break;
      case 'Reverse Typing Trap': S.traps.reverse += d; say(`Reverse Typing Trap! ${d} songs.`); break;
      case 'Tiny Text Trap': S.traps.tiny += d; say(`Tiny Text Trap! ${d} songs.`); break;
      case 'Streak Wipe Trap': if (S.game) S.game.streak = 0; say('Streak Wipe Trap! Streak reset.'); break;
      case 'Tax Collector Trap': S.prog.total = Math.max(0, S.prog.total - 5); saveProg(); say('Tax Collector Trap! -5 progress.'); break;
    }
    applyTrapCss();
  }

  // ---------- trap effects (CSS/DOM only; nothing touches game state) ----------
  function applyTrapCss() {
    let st = document.getElementById('amq-ap-trap-css');
    if (!st) { st = document.createElement('style'); st.id = 'amq-ap-trap-css'; document.head.appendChild(st); }
    st.textContent = [
      S.traps.reverse > 0 ? '#qpAnswerInput{direction:rtl!important;unicode-bidi:bidi-override!important}' : '',
      S.traps.tiny > 0 ? '#qpAnswerInput{font-size:5px!important}' : '',
    ].join('\n');
    document.querySelectorAll('video,audio').forEach(el => {
      if (S.traps.mute > 0) { el.dataset.apMuted = '1'; el.muted = true; }
      else if (el.dataset.apMuted) { delete el.dataset.apMuted; el.muted = false; }
    });
  }
  const tickTraps = () => { ['mute', 'reverse', 'tiny'].forEach(k => { if (S.traps[k] > 0) S.traps[k]--; }); applyTrapCss(); };

  // ---------- check evaluation ----------
  const bump = (obj, key) => { obj[key] = (obj[key] || 0) + 1; };

  function onAnswerResults(p) {
    if (!S.connected || !S.data) return;
    const own = extractOwn(p);
    if (!own) return;
    const song = extractSong(p);
    const g = S.game || (S.game = newGame());
    g.songs++;
    if (own.correct) g.correct++;

    if (eligible(song)) {
      g.eligible++;
      if (own.correct) {
        g.eligibleCorrect++; g.streak++; g.best = Math.max(g.best, g.streak);
        const weight = S.boost.encore > 0 ? (S.boost.encore--, 2) : 1;
        S.prog.total += weight;
        bump(S.prog.type, song.type); bump(S.prog.decade, song.decade); bump(S.prog.format, song.format);
        bump(S.prog.rarity, song.tier);
        song.genres.forEach(gn => { if (!gated('Genres') || S.unlocks.genres.has(gn)) bump(S.prog.genre, gn); });
        g.types.add(song.type); g.decades.add(song.decade);
        song.genres.forEach(gn => { if (!gated('Genres') || S.unlocks.genres.has(gn)) g.genres.add(gn); });
      } else if (S.boost.shield > 0) { S.boost.shield--; say('Streak Shield absorbed a miss.'); }
      else g.streak = 0;
    }
    tickTraps();
    saveProg();
    evaluateChecks(false, own);
  }

  function onGameOver(p) {
    if (!S.connected || !S.game) return;
    const own = (() => { try { return extractOwn(p || {}); } catch (e) { return null; } })();
    evaluateChecks(true, own);
    S.game = newGame();
  }

  function checkMet(c, final, ownEnd) {
    const g = S.game || newGame();
    const P = S.prog;
    switch (c.kind) {
      case 'total': return P.total >= c.n;
      case 'type': return (P.type[c.key] || 0) >= c.n;
      case 'decade': return (P.decade[c.key] || 0) >= c.n;
      case 'genre': return (P.genre[c.key] || 0) >= c.n;
      case 'format': return (P.format[c.key] || 0) >= c.n;
      case 'rarity': return (P.rarity[c.key] || 0) >= c.n;
      case 'streak': return g.best >= c.n;
      case 'flawless': return g.eligible >= c.n && g.eligible === g.eligibleCorrect;
      case 'accuracy': return g.eligible >= c.n && g.eligibleCorrect * 100 >= c.pct * g.eligible;
      case 'marathon': return g.songs >= c.n;
      case 'game_types': return g.types.size >= c.n;
      case 'game_decades': return g.decades.size >= c.n;
      case 'game_genres': return g.genres.size >= c.n;
      case 'mp_podium': return !!(final && ownEnd && ownEnd.count > 1 && ownEnd.rank >= 1 && ownEnd.rank <= 3);
      case 'mp_win': return !!(final && ownEnd && ownEnd.count > 1 && ownEnd.rank === 1);
      case 'mp_win_big': return !!(final && ownEnd && ownEnd.count >= c.n && ownEnd.rank === 1);
    }
    return false;
  }

  function evaluateChecks(final, ownEnd) {
    const hits = S.data.checks.filter(c => !S.checked.has(c.id) && checkMet(c, final, ownEnd)).map(c => c.id);
    if (hits.length) { hits.forEach(id => S.checked.add(id)); send([{ cmd: 'LocationChecks', locations: hits }]); }
    if (final && S.data.goal === 'finale' && S.fragments >= S.data.fragments_required && S.game) {
      const g = S.game;
      if (g.eligible >= S.data.finale_songs && g.eligibleCorrect * 100 >= S.data.finale_accuracy * g.eligible) {
        S.finaleDone = true; save(`finale_${S.team}_${S.slotNum}`, true);
      }
    }
    evaluateGoal();
    render();
  }

  function evaluateGoal() {
    if (!S.data || S.goalSent) return;
    const fragOk = S.fragments >= S.data.fragments_required;
    if (fragOk && (S.data.goal === 'fragments' || S.finaleDone)) {
      S.goalSent = true; send([{ cmd: 'StatusUpdate', status: 30 }]); say('Goal complete!');
    }
  }

  // ---------- UI ----------
  let panel, body;
  function buildUi() {
    const btn = document.createElement('button');
    btn.textContent = 'AP';
    btn.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:99999;padding:6px 10px;border-radius:6px;border:0;background:#6d4aff;color:#fff;font-weight:700;cursor:pointer';
    panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;right:8px;bottom:44px;width:340px;max-height:70vh;overflow:auto;z-index:99999;display:none;background:#1b1b26;color:#eee;font:12px/1.4 sans-serif;padding:10px;border-radius:8px;border:1px solid #444';
    body = document.createElement('div');
    panel.appendChild(body);
    btn.onclick = () => { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; render(); };
    document.body.append(btn, panel);
  }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function render() {
    if (!body || panel.style.display === 'none') return;
    const c = load('conn', { url: 'archipelago.gg:38281', slot: '' });
    let h = '';
    if (!S.connected) {
      h += `<input id=ap-url placeholder="server:port" value="${esc(c.url)}" style="width:100%;margin-bottom:4px">
            <input id=ap-slot placeholder="slot name" value="${esc(c.slot)}" style="width:100%;margin-bottom:4px">
            <input id=ap-pw type=password placeholder="password (optional)" style="width:100%;margin-bottom:4px">
            <button id=ap-go>Connect</button>`;
    } else {
      const U = S.unlocks;
      h += `<b>${esc(S.slot)}</b> &middot; checks ${S.checked.size}/${S.data.checks.length}<br>
        Fragments ${S.fragments}/${S.data.fragments_required} &middot; correct ${S.prog.total}<br>
        Types: ${[...U.types].join(', ') || (gated('Song Types') ? 'none' : 'all')}<br>
        Decades: ${[...U.decades].join(', ') || (gated('Decades') ? 'none' : 'all')}<br>
        Genres: ${[...U.genres].join(', ') || (gated('Genres') ? 'none' : 'all')}<br>
        Formats: ${[...U.formats].join(', ') || (gated('Formats') ? 'none' : 'all')}<br>
        Rarity up to: ${gated('Rarity') ? TIERS[U.lens] : 'all'}<br>
        Boosts: encore ${S.boost.encore}, shield ${S.boost.shield}<br>
        Traps: mute ${S.traps.mute}, reverse ${S.traps.reverse}, tiny ${S.traps.tiny}<br>
        ${S.data.goal === 'finale' ? `Finale: ${S.finaleDone ? 'done' : `win a ${S.data.finale_songs}+ song game at ${S.data.finale_accuracy}%`}<br>` : ''}`;
    }
    h += `<hr><div style="max-height:120px;overflow:auto">${S.log.slice(-12).map(esc).join('<br>')}</div>`;
    body.innerHTML = h;
    const go = body.querySelector('#ap-go');
    if (go) go.onclick = () => connect(body.querySelector('#ap-url').value.trim(), body.querySelector('#ap-slot').value.trim(), body.querySelector('#ap-pw').value);
  }

  // ---------- boot ----------
  function bind() {
    const mk = (name, fn) => new Listener(name, fn).bindListener();
    mk('answer results', onAnswerResults);
    mk('quiz over', onGameOver);
    mk('Game Starting', () => { S.game = newGame(); });
    mk('quiz end result', onGameOver);
  }
  const wait = setInterval(() => {
    if (typeof Listener !== 'undefined' && document.body) {
      clearInterval(wait);
      buildUi();
      try { bind(); } catch (e) { console.error('[AMQ-AP] listener binding failed', e); }
    }
  }, 500);
})();
