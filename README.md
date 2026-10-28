# Anime Music Quiz – Archipelago World

An [Archipelago](https://archipelago.gg) randomizer world for the browser game
[Anime Music Quiz](https://animemusicquiz.com), plus a Tampermonkey/Violentmonkey userscript that acts as the client.

Unaffiliated fan project. It ships **no** anime titles, song/artist names, audio, video, logos or artwork, only generic
categories (Opening, 1990s, Comedy, ...).

## Idea

The lobby filters become progression. Song types, decades, genres, anime formats and song-difficulty tiers are locked
behind items, and songs outside your unlocks don't count. Correct guesses send checks: cumulative milestones,
per-category counts, streaks, flawless starts, variety challenges (Triple Threat, Time Capsule, Genre Sampler),
seasons, comebacks, marathons and optional multiplayer placements. `song_source` lets each player choose whether any song counts,
only songs from their own anime list (strict, with the checks a small list may not reach holding only filler), or
a mix with extra on-list/off-list checks. The difficulty tier
boundaries and how many tiers start unlocked are configurable too, and the optional Guess Time and Sample Point categories
lock the room's timer and sample point too, and Song Category, Anime Score, Dub & Rebroadcast and the airing season can
be locked as well.
Quick Draw checks reward fast answers, Year Collector many different years, and optional Nexus checks the solo mode.
Goals: fragments, a finale game, every Genre Scholar check, every song type check or a percentage of all checks. Trap Link, Ring Link, Death Link
(miss streak or poor game, with amnesty), option presets and Universal Tracker are supported. Mixtape Fragments open
later stages and the Grand Finale. Traps (mute, reversed or tiny answer box, hidden clip, streak wipe, tax) are cosmetic
and applied by the userscript. The userscript can apply your unlocks to the room settings in one click or focus the
room on the open check closest to done, shows what each open check holds and which unlocks a locked one waits for,
hints missing unlocks in one click, spends Liner Notes items on free hints for other players' items, keeps
counting while offline, and bridges multiworld chat into AMQ's chat (`/ap !hint ...` works from there).

Download `amq.apworld` and the userscript from the [latest release](https://github.com/niklaskodev/amq-apworld/releases/latest).

Player guide: [`amq/docs/en_Anime Music Quiz.md`](amq/docs/en_Anime%20Music%20Quiz.md) ·
setup: [`amq/docs/setup_en.md`](amq/docs/setup_en.md) · [changelog](CHANGELOG.md)

## Layout

* `amq/`: the world (`python build.py` packs it into `amq.apworld` for `custom_worlds/`)
* `release.py`: version and release-notes checks used by CI
* `tools/`: before/after checks for refactoring (see below)
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

## Checking a refactor

The tests check behaviour; these tools check that a change meant to alter nothing really alters nothing. Both write
JSON that is the same every run for the same code, so compare a run before the change with one after:

* `tools/snapshot_world.py` generates 9 option sets with 4 seeds each and records item placements, excluded checks,
  starting items, slot data, descriptions, ids and groups. Run it from an Archipelago checkout whose `worlds/amq`
  links to this repo's `amq`.
* `tools/trace_client.mjs` plays a scripted 150-song session per seed of a snapshot through the userscript, with AMQ,
  the clock and randomness mocked, and records every message sent, the log, AMQ chat, progress, lobby changes and the
  rendered panel. Give the old and the new userscript the same snapshot.
* `tools/diff_json.py` says whether two outputs are identical and, if not, where they differ.

```sh
# in the Archipelago checkout, before the change
SKIP_REQUIREMENTS_UPDATE=1 python /path/to/repo/tools/snapshot_world.py /tmp/before.json
# make the change, then
SKIP_REQUIREMENTS_UPDATE=1 python /path/to/repo/tools/snapshot_world.py /tmp/after.json
python /path/to/repo/tools/diff_json.py /tmp/before.json /tmp/after.json

# in this repo: the committed userscript against the edited one
git show HEAD:client/amq_archipelago.user.js > /tmp/old.user.js
node tools/trace_client.mjs /tmp/old.user.js /tmp/before.json /tmp/old-trace.json
node tools/trace_client.mjs client/amq_archipelago.user.js /tmp/before.json /tmp/new-trace.json
python tools/diff_json.py /tmp/old-trace.json /tmp/new-trace.json
```

A change that is meant to alter behaviour shows up as differences, which is a quick way to see everything it touches.
CI runs the tools on every push so they keep working.

## Releasing

Bump `world_version` in `amq/archipelago.json` and `@version` in the userscript, add an entry at the top of
`CHANGELOG.md`, then push a matching tag (`git tag v0.8.1 && git push origin v0.8.1`), or run the release workflow
from the Actions tab, which tags the current commit with its version. The release workflow runs the tests, checks
that the three versions match the tag, and publishes a GitHub release with `amq.apworld`, the userscript and the
changelog entry as notes. Installed userscripts update from the latest release.

## About the AMQ integration

The client listens to AMQ's in-page events (`answer results`, `quiz ready`, `quiz over`, `play next song`) and reads
`songInfo.type`, `vintage`, `animeType`, `animeDifficulty` and `animeGenre` plus the player list (`correct`,
`score`, `listStatus`). The optional Song Category, Anime Score and Dub & Rebroadcast categories also read
`songCategory`, `animeScore` and `isDub`/`isRebroadcast`; those names and the matching room settings (`songCategories`,
`animeScore`, `dubSongs`, `rebroadcastSongs`) have not been checked against the live site yet, so the client accepts
a few spellings and falls back to counting songs when it can't read them. For the room settings (and the room's guess time) it uses `lobby.settings`, `hostModal.getSettings`/`changeSettings` and
`lobby.changeGameSettings`, and for chat `gameChat.systemMessage` and the `#gcInput` box. These names were
checked against widely used community userscripts. All site-specific code is in the "AMQ adapters" section of the
userscript; `window.AMQAP` exposes state and helpers for debugging.
