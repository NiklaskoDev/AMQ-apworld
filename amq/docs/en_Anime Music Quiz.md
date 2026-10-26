# Anime Music Quiz

## What is this?

[Anime Music Quiz](https://animemusicquiz.com) is a free browser game in which you guess the anime behind short
opening, ending and insert song clips. This world turns the *lobby filters* into progression: song types, decades,
genres, anime formats and difficulty tiers are locked until you find the matching item. Your own correct guesses
send checks.

This is an unaffiliated fan project. It contains no anime titles, song names, artist names, audio, video or artwork.
It only uses generic categories ("Opening", "1990s", "Comedy", ...).

## What is randomized?

Items are unlocks that live in the multiworld:

* **Song passes**: Opening / Ending / Insert Song
* **Decade passes**: 1980s & Earlier, 1990s, 2000s, 2010s, 2020s
* **Genre keys**: 17 broad genres (Action, Comedy, Mecha, Slice of Life, ...)
* **Format passes**: Movie, OVA, ONA, Special (TV is always unlocked)
* **Progressive Rarity Lens**: difficulty follows the lobby "song difficulty" slider (community guess rate).
  By default Easy (60–100%) and Medium (25–60%) are free and two lenses add Hard (10–25%), then Brutal (0–10%).
  Both the boundaries and the number of free tiers are options (see below).
* **Mixtape Fragments**: open the later stages and, once you have enough, the Grand Finale

You start with one song type (Opening by default), two neighbouring decades, four genres (at least one of them broad)
and TV. Categories you leave out of `unlock_categories` are simply always open.

## Song source

`song_source` decides which songs count, based on the anime list linked to your AMQ account:

| Value | Effect | Lobby song selection |
| --- | --- | --- |
| `any` (default) | Every song counts, wherever it comes from. | anything |
| `own_list` | Strict: only songs from your own list count; others are ignored and don't break streaks. | watched only |
| `mixed` | Every song counts, plus extra checks: Home Turf (correct on-list songs), Uncharted (correct off-list songs) and Best of Both (both in one game). | a mix of watched and random |

## Difficulty tiers

| Option | Default | Meaning |
| --- | --- | --- |
| `easy_floor` | 60 | Easy is this guess rate up to 100% |
| `medium_floor` | 25 | Medium runs from here up to the Easy floor |
| `hard_floor` | 10 | Hard runs from here up to the Medium floor; everything below is Brutal |
| `free_difficulty_tiers` | 2 | Tiers open from the start, easiest first. One lens per remaining tier: `1` means three lenses, `4` means none. |

Each tier stays at least 5 points wide: if the floors are out of order or too close, the lower ones are pushed down
(and a warning is logged), so no tier's checks become impossible. The client's lobby guide shows the difficulty
range to set for your current unlocks.

## Stages

Checks are spread over four stages. A check in a locked stage keeps counting progress but is only sent once you hold
enough fragments, so long-term goals pay out the moment the stage opens.

| Stage | Fragments needed |
| --- | --- |
| Warm-Up Lobby | none |
| Listening Booth | 25% of required |
| Recording Studio | 50% of required |
| Concert Hall | 75% of required |

## What is a check?

Everything is detected from songs you answer in the real game:

* Cumulative correct answers (every 10 by default)
* Correct songs per song type, decade, genre, format and difficulty tier
* Hot streaks, and flawless starts (the first N songs of a game all correct)
* Sharp Ears: a minimum accuracy over a minimum number of songs in one game
* Marathons: long games
* Variety challenges: Triple Threat (all three song types in one game), Time Capsule (several decades),
  Genre Sampler (several genres)
* Seasons (`season_checks`, on by default): 10 correct songs from each airing season (Winter, Spring, Summer, Fall)
  and Four Seasons (all four in one game). Seasons are never locked by items.
* Optional multiplayer placements (podium with 4+ players, wins, wins with 8+ players)

Songs outside your current unlocks are ignored: they don't count and don't break streaks. The client tells you why
a song was ignored and shows lobby settings that match your unlocks.

## Other items

* **Encore Ticket**: your next counted answer is worth two toward milestones
* **Streak Shield**: absorbs your next wrong answer for streaks
* **Hype Cheer**: +2 cumulative milestone progress, and every active timed trap ends one song sooner

## Traps

Traps are cosmetic. They never touch your answers or the game itself.

* **Mute Trap**: audio muted for a few songs (default 3)
* **Reverse Typing Trap**: the answer box displays text backwards
* **Tiny Text Trap**: the answer box text shrinks to near-unreadable size
* **Streak Wipe Trap**: your current streak resets
* **Tax Collector Trap**: you lose 5 points of cumulative milestone progress

## AMQ chat

The client can post multiworld messages into AMQ's chat: by default your own items and hints, chat and command
replies (choose "everything" or "nothing" in the panel's Log section). Traps and Death Links are announced there too.
Type `/ap <message>` in AMQ's chat to talk to the multiworld; server commands work, for example `/ap !hint <item>` or
`/ap !remaining`. `/ap lobby` applies your unlocks to the room settings and `/ap help` lists the commands. These lines
are not sent to the AMQ room.

## Death Link

With `death_link` on, missing `death_link_misses` eligible songs in a row (default 3) sends a death. Receiving one
wipes your streak and mutes the next song.

## Goal

Collect the required Mixtape Fragments. With the `finale` goal (default) you must then also play one finale game:
at least `finale_songs` counted songs at `finale_accuracy` percent or better.
