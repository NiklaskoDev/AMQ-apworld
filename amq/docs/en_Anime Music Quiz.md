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
* **Progressive Guess Time** (only with `Guess Time` in `unlock_categories`, see below)
* **Sample Passes**: Middle, End, Random (only with `Sample Point` in `unlock_categories`, see below)
* **Song Category passes**: Instrumental, Chanting, Character (only with `Song Category`, see below)
* **Progressive Score Lens** (only with `Anime Score`, see below)
* **Dub Pass** and **Rebroadcast Pass** (only with `Dub & Rebroadcast`, see below)

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

## Guess time

Add `Guess Time` to `unlock_categories` (it is not in the default) to start with a short timer. Songs only count
when the room's guess time is at most your allowed time: `guess_time_start` seconds (default 10), plus
`guess_time_step` (default 5) for each Progressive Guess Time; `guess_time_items` (default 4) of them are in the
pool. A random guess time is judged by the top of its range; extra guess time is not counted. Nothing in logic needs a
longer timer, since a shorter one always works, so these items are useful rather than progression. If the client
cannot read the room's timer it counts songs anyway and says so once.

## Sample point

Add `Sample Point` to `unlock_categories` (not in the default) to lock the room's sample point setting. Start is
always open; Sample Passes unlock Middle, End and Random (any random range counts as Random). Songs played at a
locked sample point are ignored. Each sample point also gets a check for 10 correct songs played at it. Apply to
room switches a locked sample point back to Start. If the client cannot read the room's sample point it counts songs
anyway, but sample point checks cannot progress.

## Song category, anime score, dubs and rebroadcasts

Three more optional entries for `unlock_categories`, none of them in the default:

| Category | Open from the start | Unlocked by | Checks |
| --- | --- | --- | --- |
| `Song Category` | Standard | one pass each for Instrumental, Chanting, Character | 10 Standard, then 1 and 3 of each other category |
| `Anime Score` | anime scored 7 or more (Acclaimed 8+, Well Liked 7–8) | two Progressive Score Lenses: Mixed (6–7), then Overlooked (below 6) | per tier, 3 to 10 correct songs |
| `Dub & Rebroadcast` | everything except dubs and rebroadcasts | Dub Pass, Rebroadcast Pass | first correct and 3 correct of each |

Anime without a score are ignored while `Anime Score` is locked. These categories use song data that the client
reads from AMQ but that has not been checked against the live site yet. If it can't read a field, songs count anyway,
the client says so once in the panel log, and that category's checks can't progress. If that happens, please report
it together with `AMQAP.state.lastPayload.songInfo` from the browser console.

## Presets

The options page offers presets: **Casual** (fragments goal, more free tiers and starting unlocks, fewer traps),
**Watched-only Strict** (`own_list` with only the broad filters locked), **Sweaty** (guess time and sample point
locked, one free difficulty tier, a long and accurate finale, more traps) and **Short Async** (fewer fragments and
milestones, no season or quick draw checks).

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
* Comebacks (with `challenge_checks`): Bounce Back (correct answers right after a miss), Comeback (5 in a row after
  missing 3 in a row in one game) and Strong Finish (end a game on a 5- or 10-song streak)
* Sample points (only with `Sample Point` locked): 10 correct songs at each sample point
* Year Collector (with `challenge_checks`): correct songs from 10 and 25 different years
* Quick Draw (`quick_draw_checks`, on by default): correct answers locked in with Enter within 5 or 3 seconds of the
  song starting. The client times this itself. An answer you never press Enter on (AMQ submits it at the end) is not
  quick, and neither is one changed later.
* Nexus (`nexus_checks`, off by default): 10, 25 and 50 correct answers in AMQ's solo Nexus mode
* Optional multiplayer placements (podium with 4+ players, wins, wins with 8+ players)

Songs outside your current unlocks are ignored: they don't count and don't break streaks. The client tells you why
a song was ignored and shows lobby settings that match your unlocks. If at least 5 songs have played in a game and
three in five of them didn't count, it warns you once in AMQ's chat and names the most common reason.

## Other items

* **Encore Ticket**: your next counted answer is worth two toward milestones
* **Streak Shield**: absorbs your next wrong answer for streaks
* **Hype Cheer**: +2 cumulative milestone progress, and every active timed trap ends one song sooner
* **Mulligan**: your next eligible miss is forgiven as if the song never played: the streak, flawless start,
  accuracy and Death Link are untouched. It is used before a Streak Shield.
* **Spotlight**: your next counted answer counts twice toward its category checks (song type, decade, genre,
  format, difficulty, season and so on). Encore Ticket does the same for milestones, and both can apply at once.

## Traps

Traps are cosmetic. They never touch your answers or the game itself.

* **Mute Trap**: audio muted for a few songs (default 3)
* **Reverse Typing Trap**: the answer box displays text backwards
* **Tiny Text Trap**: the answer box text shrinks to near-unreadable size
* **Streak Wipe Trap**: your current streak resets
* **Tax Collector Trap**: you lose 5 points of cumulative milestone progress
* **Blind Trap**: the anime clip stays hidden after the song is revealed, for a few songs

## Scouting

The client asks the server what each open check holds (without creating hints) and shows it under the check in the
panel, for example `→ Friend's Hookshot (progression)`. Choose "importance only" or "nothing" in the Open checks
section if you'd rather not know.

## AMQ chat

The client can post multiworld messages into AMQ's chat: by default your own items and hints, chat and command
replies (choose "everything" or "nothing" in the panel's Log section). Traps, Death Links and a short summary at the
end of each game are announced there too. Type `/ap <message>` in AMQ's chat to talk to the multiworld; server
commands work, for example `/ap !hint <item>` or `/ap !remaining`. These lines are not sent to the AMQ room.

| Command | Does |
| --- | --- |
| `/ap lobby` | applies your unlocks to the room settings (host only) |
| `/ap next` | lists the three open checks closest to done that the room settings can aim at |
| `/ap lobby next` | narrows the room to the first of them, for example Ending only or the 1990s (host only) |
| `/ap missing` | lists the unlock items you haven't found yet |
| `/ap help` | lists the commands |

The panel has the same tools: **Play next** with a Focus button, and **Hint an unlock**, which lists your missing
unlocks with a button each that sends `!hint` for it (this spends hint points like typing it would).

## Playing offline

If the connection drops, the client keeps counting your songs and holds the checks they earn until it is back. Then
it sends them and keeps the progress made in the meantime. A game in progress carries on. If you want to keep
playing in another browser while the server is unreachable, use **Export** in the panel's Backup section and
**Import** the text there once you're connected to the same slot.

## Trap Link

With `trap_link` on, traps you receive are also sent to every other game using Trap Link, and theirs reach you as
the closest trap here, matched by name: muting or silence becomes a Mute Trap, confusion or reversal a Reverse
Typing Trap, blindness, blur or darkness a Blind Trap, shrinking or tiny text a Tiny Text Trap, money or tax a Tax
Collector Trap, resets, freezes and stuns a Streak Wipe Trap. Trap kinds with no match are ignored (the panel log
says so).

## Ring Link

With `ring_link` on, every counted correct answer sends one ring to the other Ring Link games. Rings they send you
become cumulative milestone progress: every `ring_link_rate` rings (default 10) is one point, and lost rings take
points away.

## Death Link

With `death_link` on, `death_link_trigger` decides what sends a death:

| `death_link_trigger` | Sends a death when |
| --- | --- |
| `miss_streak` (default) | you miss `death_link_misses` eligible songs in a row (default 3) |
| `poor_game` | you finish a game of 10+ eligible songs below `death_link_accuracy` percent (default 40) |
| `either` | either of these happens |

`death_link_amnesty` (default 0) forgives that many deaths before one is really sent, then counts again. Receiving
a death wipes your streak and mutes the next song.

## Goal

Every goal needs the required Mixtape Fragments. On top of that:

| `goal` | Also needed |
| --- | --- |
| `fragments` | nothing |
| `finale` (default) | one finale game: at least `finale_songs` counted songs at `finale_accuracy` percent or better |
| `scholar` | every Genre Scholar check (so every Genre Key, if genres are locked) |
| `specialist` | every song type check: First Correct and both Specialist checks for Opening, Ending and Insert Song |

The panel shows how many of the goal's checks are done. Checks collected by another client also count.

## Universal Tracker

The world can be rebuilt from its slot data, so Universal Tracker can show which checks are in logic without your
YAML.
