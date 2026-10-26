# Anime Music Quiz – Archipelago World

An [Archipelago](https://archipelago.gg) randomizer world for the browser game
[Anime Music Quiz](https://animemusicquiz.com), plus a Tampermonkey/Violentmonkey userscript that acts as the client.

Unaffiliated fan project. It ships **no** anime titles, song/artist names, audio, video, logos or artwork, only generic
categories (Opening, 1990s, Comedy, ...).

## Idea

The lobby filters become progression. Song types, decades, genres, anime formats and song-difficulty tiers are locked
behind items, and songs outside your unlocks don't count. Correct guesses send checks: cumulative milestones,
per-category counts, streaks, flawless starts, variety challenges (Triple Threat, Time Capsule, Genre Sampler),
marathons and optional multiplayer placements. `song_source` lets each player choose whether any song counts,
only songs from their own anime list (strict), or a mix with extra on-list/off-list checks. Mixtape Fragments open later stages and the Grand Finale. Traps (mute,
reversed or tiny answer box, streak wipe, tax) are cosmetic and applied by the userscript. Death Link is supported.

Player guide: [`amq/docs/en_Anime Music Quiz.md`](amq/docs/en_Anime%20Music%20Quiz.md) ·
setup: [`amq/docs/setup_en.md`](amq/docs/setup_en.md)

## Layout

* `amq/`: the world (`python build.py` packs it into `amq.apworld` for `custom_worlds/`)
* `client/amq_archipelago.user.js`: the userscript client
* `client/test/`: client tests (an offline suite, plus an end-to-end script for a real server)

## Testing

World tests, run from an Archipelago checkout (0.6.7 or newer):

```sh
ln -s /path/to/this/repo/amq worlds/amq
SKIP_REQUIREMENTS_UPDATE=1 python -m pytest worlds/amq
```

Client tests (Node 22+). The userscript runs unmodified in a sandbox with AMQ's globals mocked:

```sh
node --test client/test/client.test.mjs
```

End to end against a running MultiServer hosting a fresh seed (optionally pass the server's stdin FIFO so the script
can `/send` traps and fragments):

```sh
AP_SERVER=ws://127.0.0.1:38281 AP_SLOT=Quizzer AP_CONSOLE=/path/to/fifo node client/test/e2e.mjs
```

CI runs the world tests against Archipelago 0.6.7 and `main`, builds the apworld and runs the client suite.

## About the AMQ integration

The client listens to AMQ's in-page events (`answer results`, `quiz ready`, `quiz over`, `play next song`) and reads
`songInfo.type`, `vintage`, `animeType`, `animeDifficulty` and `animeGenre` plus the player list (`correct`,
`score`, `listStatus`). These names were
checked against widely used community userscripts. All site-specific code is in the "AMQ adapters" section of the
userscript; `window.AMQAP` exposes state and helpers for debugging.
