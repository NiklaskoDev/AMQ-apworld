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
* **Progressive Rarity Lens** (x2): difficulty follows the lobby "song difficulty" slider (community guess rate).
  Easy (60–100%) and Medium (25–60%) are free; the lenses add Hard (10–25%), then Brutal (0–10%).
* **Mixtape Fragments**: open the later stages and, once you have enough, the Grand Finale

You start with one song type (Opening by default), two neighbouring decades, four genres (at least one of them broad)
and TV. Categories you leave out of `unlock_categories` are simply always open.

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
* Optional multiplayer placements (podium with 4+ players, wins, wins with 8+ players)

Songs outside your current unlocks are ignored: they don't count and don't break streaks. The client tells you why
a song was ignored and shows lobby settings that match your unlocks.

## Other items

* **Encore Ticket**: your next counted answer is worth two toward milestones
* **Streak Shield**: absorbs your next wrong answer for streaks
* **Hype Cheer**: pure applause

## Traps

Traps are cosmetic. They never touch your answers or the game itself.

* **Mute Trap**: audio muted for a few songs (default 3)
* **Reverse Typing Trap**: the answer box displays text backwards
* **Tiny Text Trap**: the answer box text shrinks to near-unreadable size
* **Streak Wipe Trap**: your current streak resets
* **Tax Collector Trap**: you lose 5 points of cumulative milestone progress

## Death Link

With `death_link` on, missing `death_link_misses` eligible songs in a row (default 3) sends a death. Receiving one
wipes your streak and mutes the next song.

## Goal

Collect the required Mixtape Fragments. With the `finale` goal (default) you must then also play one finale game:
at least `finale_songs` counted songs at `finale_accuracy` percent or better.
