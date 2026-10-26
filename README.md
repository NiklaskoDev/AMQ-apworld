# Anime Music Quiz – Archipelago World

An [Archipelago](https://archipelago.gg) randomizer world for the browser game
[Anime Music Quiz](https://animemusicquiz.com), plus a Tampermonkey/Violentmonkey userscript that acts as the client.

Unaffiliated fan project. It ships **no** anime titles, song/artist names, audio, video, logos or artwork, only generic
categories (Opening, 1990s, Comedy, ...).

## Idea

The lobby filters become progression. Song types, decades, genres, anime formats and guess-rate tiers are locked behind
items. Songs outside your unlocks don't count. Correct guesses send checks: cumulative milestones, per-category
counts, streaks, flawless games, variety challenges (Triple Threat, Time Capsule, Genre Sampler), marathons and optional
multiplayer placements. Traps (mute, reversed/tiny answer box, streak wipe, tax) are applied client-side by the
userscript. Goal: collect Mixtape Fragments, then optionally win a finale game.

See `amq/docs/` for the player guide and setup.

## Layout

* `amq/` – the apworld (copy or zip into Archipelago `custom_worlds/`)
* `client/amq_archipelago.user.js` – the userscript client
* `build.sh` – builds `anime_music_quiz.apworld`

## Testing

Symlink `amq/` into `Archipelago/worlds/` and run `pytest worlds/amq`.

## Known caveat

The client reads AMQ's in-page `answer results` payload. Field names were written from memory of the site's script API
and are isolated in `extractSong()` / `extractOwn()` in the userscript. Verify them against the live site
(log `p` in `onAnswerResults`) and adjust there if needed.
