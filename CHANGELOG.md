# Changelog

World and userscript share one version. "Client version" is the number the world sends in slot data: a userscript
older than that warns that it needs an update. Since 0.2.0 no item or location id has changed, so a newer apworld
still matches older seeds. Pushing a `vX.Y.Z` tag publishes the newest entry below as a GitHub release.

## [0.10.0] - 2026-10-28

Client version 7: seeds made with this version need the new userscript (an older one warns that it needs an
update). Every seed generates differently, because Liner Notes joined the filler items.

### Added
- `Seasons` as an optional unlock category: you start with `starting_seasons` random airing seasons (default 2) and
  Season Passes unlock the rest. With `season_checks`, the season checks need their passes. The room settings can't
  filter by season, so the lobby guide lists your seasons without changing the room. The Sweaty preset locks it.
- The `completionist` goal: the fragments plus `completion_percentage` percent of your checks (default 70). The
  count leaves out checks that only hold filler (`exclude_locations`, `own_list_safety`), but sending them still
  counts toward it.
- Liner Notes, a filler item: a free hint for one of your open checks, picking another player's progression item
  first. If nothing is worth hinting yet, it is kept until something is.
- Client: an open check that is out of logic says which unlocks it waits for (for example `needs Decade Pass:
  1990s` or `Genres: 3 more`) and is listed after the checks you can do now. Slot data gives each check the
  unlocks its rule needs.

## [0.9.0] - 2026-10-27

Client version 6 (unchanged; the userscript only gets a new version number). Seeds with `song_source: own_list`
generate differently.

### Added
- `own_list_safety` (on by default, only with `song_source: own_list`): checks a small anime list may not be able to
  reach (most genres, OVA, ONA and Special, the 1980s and 1990s, Brutal songs, Insert Songs, song categories,
  Overlooked anime, dubs and rebroadcasts, Nexus and the biggest variety challenges) are excluded, so they only hold
  filler or traps.
- A warning when `own_list` is combined with the `scholar` or `specialist` goal.
- The player guide explains what to do about a check your list can't reach: `exclude_locations` with group names,
  or `/send_location` from the server console.

### Fixed
- Excluded checks could fail generation when there were few traps, because most boosts are useful items and
  excluded checks only take filler. Hype Cheers now make up the difference, and milestones grow so the unlocks and
  fragments still fit outside the excluded checks.

## [0.8.1] - 2026-10-26

Client version 6 (unchanged). No changes to generation: seeds come out the same as with 0.8.0.

### Added
- Descriptions for every item, location, item group and location group, for the website and other tools.
- The userscript updates itself: its `@updateURL` and `@downloadURL` point at the latest GitHub release.
- Tagged releases on GitHub with `amq.apworld` and the userscript attached. CI checks that the world, userscript and
  changelog versions agree.

## [0.8.0] - 2026-10-26

Client version 6.

### Added
- Song Category, Anime Score and Dub & Rebroadcast as optional unlock categories, with passes, a Progressive Score
  Lens and their own checks.
- Quick Draw checks (on by default), Year Collector and optional Nexus checks.
- Mulligan and Spotlight boosts, and the Blind Trap.
- Ring Link, `death_link_trigger` (miss streak, poor game or either) and `death_link_amnesty`.
- Option presets: Casual, Watched-only Strict, Sweaty and Short Async.
- Client: keeps counting while offline and sends the held checks on reconnect (the save with more songs played
  wins), with export and import in a Backup section.
- Client: Play next suggestions with room focus (`/ap next`, `/ap lobby next`), hint buttons for missing unlocks
  (`/ap missing`) and an end-of-game summary.

### Changed
- Client: reads the new song fields leniently and counts songs when it can't read them.

## [0.7.0] - 2026-10-26

Client version 5.

### Added
- Sample Point as an optional unlock category: Start is open, Sample Passes unlock Middle, End and Random, each with
  a check for 10 correct songs.
- Comeback checks (with `challenge_checks`): Bounce Back, Comeback and Strong Finish.
- Trap Link: traps are shared, and other games' traps are matched by name to the closest trap here.
- Goals `scholar` (every Genre Scholar check) and `specialist` (every song type check). Checks collected remotely
  count.
- Universal Tracker support: slot data carries the options that shape locations and rules.
- Client: warns once per game in AMQ's chat when most of its songs didn't count, naming the most common reason.

## [0.6.0] - 2026-10-26

Client version 4.

### Added
- Client: scouts every open check on connect and shows what it holds (item and owner, importance only, or
  nothing).
- Guess Time as an optional unlock category, with Progressive Guess Time items.

## [0.5.0] - 2026-10-26

Client version 3.

### Added
- Season checks (on by default): 10 correct songs per airing season, and Four Seasons in one game.
- Client: multiworld messages, traps and Death Links in AMQ's chat, and `/ap ...` from AMQ's chat to the
  multiworld.
- Client: Apply to room (`/ap lobby`) writes your unlocks into the room settings.

### Changed
- Hype Cheer gives +2 milestone progress and shortens active traps.

## [0.4.0] - 2026-10-26

Client version 2.

### Added
- `easy_floor`, `medium_floor` and `hard_floor` set the difficulty tier boundaries, and `free_difficulty_tiers` how
  many tiers are open from the start.

## [0.3.0] - 2026-10-26

Client version 2.

### Added
- `song_source`: `any`, `own_list` (only songs from your own anime list count) or `mixed` (extra on-list and
  off-list checks).

## [0.2.0] - 2026-10-26

Client version 2.

### Added
- Mahou Shoujo, Psychological and Thriller genres, location groups, `start_inventory_from_pool` and Death Link.
- Stage-locked checks wait for fragments in the client.
- Client: progress, boosts and pending traps are saved on the Archipelago server, a lobby settings guide, a result
  line per song, auto-reconnect.
- World and client test suites, and CI against Archipelago 0.6.7 and `main`.

### Changed
- Stable ids: adding content no longer shifts existing item or location ids.
- Friendlier start: neighbouring starting decades, a broad starting genre, Easy and Medium open.

### Fixed
- The packed `.apworld` failed to load in Archipelago ("No functional world found"). `build.py` replaces
  `build.sh`.
- Generation no longer fails when the item pool doesn't fit; `milestone_count` is raised instead.

## [0.1.0] - 2026-10-26

First version of the world and the userscript client.
