from __future__ import annotations

import math
from dataclasses import dataclass, field

from BaseClasses import Location

from .items import (
    BASE_ID, CATEGORY_ITEMS, DECADES, DECADE_ITEMS, DEFAULT_FREE_RARITY_TIERS, DUB, FORMATS, FORMAT_ITEMS,
    FREE_SCORE_TIERS, GAME_NAME, GENRES, GENRE_ITEMS, LENS, RARITY_TIERS, REBROADCAST, SAMPLE_ITEMS, SAMPLE_POINTS,
    SCORE_LENS, SCORE_TIERS, SONG_CATEGORIES, SONG_TYPES, SONG_TYPE_ITEMS,
)

STAGES = ["Warm-Up Lobby", "Listening Booth", "Recording Studio", "Concert Hall"]
MAX_MILESTONES = 50
MILESTONE_STEPS = range(5, 26)
EVENT_FINALE = "Grand Finale"
SEASONS = ["Winter", "Spring", "Summer", "Fall"]  # AMQ's vintage names, e.g. "Spring 2010"

# "Correct Answers: N" has id BASE_ID + N. Every other check gets its group's fixed block plus its index within the
# group, so appending a check to a group never shifts existing ids.
GROUP_OFFSETS = {
    "Song Types": 2000, "Decades": 2100, "Genres": 2200, "Formats": 2300, "Rarity": 2400,
    "Streaks": 2500, "Challenges": 2600, "Multiplayer": 2700, "Song Source": 2800, "Seasons": 2900,
    "Comebacks": 3000, "Sample Points": 3100, "Song Categories": 3200, "Anime Score": 3300, "Dubs & Rebroadcasts": 3400,
    "Quick Draw": 3500, "Nexus": 3600,
}


@dataclass(frozen=True)
class Req:
    """Needs at least `need` items (counting copies) out of `items`. Skipped when `category` is not gated."""
    category: str
    items: tuple[str, ...]
    need: int = 1


@dataclass(frozen=True)
class CheckSpec:
    name: str
    kind: str  # interpreted by the client
    stage: int
    group: str
    key: str = ""
    n: int = 0
    pct: int = 0
    secs: int = 0
    reqs: tuple[Req, ...] = field(default=())

    def client_dict(self, address: int) -> dict:
        out = {"id": address, "name": self.name, "kind": self.kind, "key": self.key, "n": self.n, "pct": self.pct,
               "stage": self.stage}
        if self.secs:
            out["secs"] = self.secs
        return out


def stage_fragments(required: int) -> list[int]:
    """Fragments needed to enter each stage."""
    return [math.ceil(required * index / len(STAGES)) for index in range(len(STAGES))]


def _stage_for(index: int, total: int) -> int:
    return min(3, 4 * index // max(1, total))


def milestone_name(n: int) -> str:
    return f"Correct Answers: {n}"


def build_check_specs(milestone_count: int, milestone_step: int, challenges: bool, multiplayer: bool,
                      list_checks: bool = False, free_tiers: int = DEFAULT_FREE_RARITY_TIERS,
                      seasons: bool = False, sample_points: bool = False, categories: bool = False,
                      score: bool = False, dubs: bool = False, quick_draw: bool = False,
                      nexus: bool = False) -> list[CheckSpec]:
    specs: list[CheckSpec] = []

    for i in range(milestone_count):
        specs.append(CheckSpec(milestone_name(milestone_step * (i + 1)), "total", _stage_for(i, milestone_count),
                               "Milestones", n=milestone_step * (i + 1)))

    for t in SONG_TYPES:
        for n, stage in ((1, 0), (10, 1), (25, 2)):
            name = f"First Correct {t}" if n == 1 else f"{t} Specialist: {n} Correct"
            specs.append(CheckSpec(name, "type", stage, "Song Types", key=t, n=n,
                                   reqs=(Req("Song Types", (SONG_TYPE_ITEMS[t],)),)))

    for d in DECADES:
        for n, stage in ((1, 0), (10, 1)):
            specs.append(CheckSpec(f"Decade Dive: {d} x{n}", "decade", stage, "Decades", key=d, n=n,
                                   reqs=(Req("Decades", (DECADE_ITEMS[d],)),)))

    for g in GENRES:
        specs.append(CheckSpec(f"Genre Scholar: {g}", "genre", 1, "Genres", key=g, n=3,
                               reqs=(Req("Genres", (GENRE_ITEMS[g],)),)))

    for f in FORMATS:
        if f != "TV":
            specs.append(CheckSpec(f"Format Hunter: {f}", "format", 1, "Formats", key=f, n=1,
                                   reqs=(Req("Formats", (FORMAT_ITEMS[f],)),)))

    for tier, n, stage in (("Easy", 10, 0), ("Medium", 10, 1), ("Hard", 1, 1), ("Hard", 5, 2),
                           ("Brutal", 1, 2), ("Brutal", 3, 3)):
        lenses = RARITY_TIERS.index(tier) - free_tiers + 1
        reqs = (Req("Rarity", (LENS,), lenses),) if lenses > 0 else ()
        specs.append(CheckSpec(f"{tier} Guess-Rate Songs x{n}", "rarity", stage, "Rarity", key=tier, n=n, reqs=reqs))

    if challenges:
        for n, stage in ((3, 0), (5, 0), (8, 1), (12, 2), (20, 3)):
            specs.append(CheckSpec(f"Hot Streak: {n} in a Row", "streak", stage, "Streaks", n=n))
        for n, stage in ((10, 1), (20, 2), (40, 3)):
            specs.append(CheckSpec(f"Flawless Start: First {n} Songs", "flawless", stage, "Challenges", n=n))
        for songs, pct, stage in ((20, 80, 2), (30, 90, 3)):
            specs.append(CheckSpec(f"Sharp Ears: {pct}% over {songs} Songs", "accuracy", stage, "Challenges",
                                   n=songs, pct=pct))
        for n, stage in ((30, 1), (50, 2)):
            specs.append(CheckSpec(f"Marathon: {n} Songs in One Game", "marathon", stage, "Challenges", n=n))
        specs.append(CheckSpec("Triple Threat: Opening, Ending and Insert in One Game", "game_types", 1, "Challenges",
                               n=3, reqs=(Req("Song Types", tuple(SONG_TYPE_ITEMS.values()), 3),)))
        for n, stage in ((3, 1), (5, 3)):
            specs.append(CheckSpec(f"Time Capsule: {n} Decades in One Game", "game_decades", stage, "Challenges",
                                   n=n, reqs=(Req("Decades", tuple(DECADE_ITEMS.values()), n),)))
        for n, stage in ((5, 1), (10, 3)):
            specs.append(CheckSpec(f"Genre Sampler: {n} Genres in One Game", "game_genres", stage, "Challenges",
                                   n=n, reqs=(Req("Genres", tuple(GENRE_ITEMS.values()), n),)))
        for n, stage in ((5, 0), (15, 2)):
            specs.append(CheckSpec(f"Bounce Back: {n} Correct Right After a Miss", "bounce", stage, "Comebacks", n=n))
        specs.append(CheckSpec("Comeback: 5 in a Row After Missing 3 in a Row", "comeback", 1, "Comebacks", n=5))
        for n, stage in ((5, 1), (10, 3)):
            specs.append(CheckSpec(f"Strong Finish: End a Game on a {n}-Song Streak", "finish", stage, "Comebacks",
                                   n=n))
        # one decade covers at most ten years (except "1980s & Earlier"), so logic asks for one per ten
        for n, stage in ((10, 1), (25, 3)):
            specs.append(CheckSpec(f"Year Collector: {n} Different Years", "years", stage, "Challenges", n=n,
                                   reqs=(Req("Decades", tuple(DECADE_ITEMS.values()), math.ceil(n / 10)),)))

    if seasons:
        for season in SEASONS:
            specs.append(CheckSpec(f"{season} Listener: 10 Correct", "season", 1, "Seasons", key=season, n=10))
        specs.append(CheckSpec("Four Seasons: Winter, Spring, Summer and Fall in One Game", "game_seasons", 1,
                               "Seasons", n=len(SEASONS)))

    if sample_points:
        for point in SAMPLE_POINTS:
            reqs = (Req("Sample Point", (SAMPLE_ITEMS[point],)),) if point in SAMPLE_ITEMS else ()
            specs.append(CheckSpec(f"{point} Sample: 10 Correct", "sample", 0 if point == "Start" else 1,
                                   "Sample Points", key=point, n=10, reqs=reqs))

    if categories:
        for cat in SONG_CATEGORIES:
            if cat == "Standard":
                specs.append(CheckSpec("Standard Songs: 10 Correct", "category", 0, "Song Categories", key=cat, n=10))
                continue
            for n, stage in ((1, 1), (3, 2)):
                specs.append(CheckSpec(f"{cat} Songs: {n} Correct", "category", stage, "Song Categories", key=cat,
                                       n=n, reqs=(Req("Song Category", (CATEGORY_ITEMS[cat],)),)))

    if score:
        for tier, n, stage in (("Acclaimed", 10, 0), ("Well Liked", 10, 1), ("Mixed", 5, 1), ("Mixed", 10, 2),
                               ("Overlooked", 3, 2)):
            lenses = SCORE_TIERS.index(tier) - FREE_SCORE_TIERS + 1
            reqs = (Req("Anime Score", (SCORE_LENS,), lenses),) if lenses > 0 else ()
            specs.append(CheckSpec(f"{tier} Anime Songs x{n}", "score", stage, "Anime Score", key=tier, n=n,
                                   reqs=reqs))

    if dubs:
        for key, item in (("Dub", DUB), ("Rebroadcast", REBROADCAST)):
            for n, stage in ((1, 1), (3, 2)):
                name = f"First Correct {key}" if n == 1 else f"{key} Regular: {n} Correct"
                specs.append(CheckSpec(name, "dub", stage, "Dubs & Rebroadcasts", key=key, n=n,
                                       reqs=(Req("Dub & Rebroadcast", (item,)),)))

    if quick_draw:
        for n, secs, stage in ((5, 5, 0), (15, 5, 1), (5, 3, 2), (30, 5, 3)):
            specs.append(CheckSpec(f"Quick Draw: {n} Correct within {secs}s", "quick", stage, "Quick Draw", n=n,
                                   secs=secs))

    if nexus:
        for n, stage in ((10, 0), (25, 1), (50, 2)):
            specs.append(CheckSpec(f"Nexus Explorer: {n} Correct in Nexus", "nexus", stage, "Nexus", n=n))

    if list_checks:  # song_source: mixed
        for n, stage in ((10, 0), (25, 1), (50, 2)):
            specs.append(CheckSpec(f"Home Turf: {n} Correct from Your List", "list_on", stage, "Song Source", n=n))
        for n, stage in ((10, 0), (25, 1), (50, 2)):
            specs.append(CheckSpec(f"Uncharted: {n} Correct off Your List", "list_off", stage, "Song Source", n=n))
        specs.append(CheckSpec("Best of Both: 5 On-List and 5 Off-List in One Game", "game_list_mix", 1,
                               "Song Source", n=5))

    if multiplayer:
        specs.append(CheckSpec("Podium Finish: Top 3 with 4+ Players", "mp_podium", 0, "Multiplayer", n=4))
        specs.append(CheckSpec("Win a Multiplayer Game", "mp_win", 1, "Multiplayer", n=2))
        specs.append(CheckSpec("Crowd Beater: Win with 8+ Players", "mp_win", 2, "Multiplayer", n=8))

    names = [s.name for s in specs]
    assert len(names) == len(set(names)), "duplicate location names"
    return specs


# every optional group switched on: the full location table, so ids never depend on a yaml
ALL_FLAGS = {"seasons": True, "sample_points": True, "categories": True, "score": True, "dubs": True, "quick_draw": True,
             "nexus": True}


def _build_ids() -> dict[str, int]:
    ids: dict[str, int] = {}
    for step in MILESTONE_STEPS:
        for i in range(1, MAX_MILESTONES + 1):
            ids[milestone_name(step * i)] = BASE_ID + step * i
    per_group: dict[str, int] = {}
    for spec in build_check_specs(0, 1, True, True, True, **ALL_FLAGS):
        index = per_group.get(spec.group, 0)
        assert index < 100, f"group {spec.group} overflowed its id block"
        per_group[spec.group] = index + 1
        ids[spec.name] = BASE_ID + GROUP_OFFSETS[spec.group] + index
    return dict(sorted(ids.items(), key=lambda kv: kv[1]))


LOCATION_NAME_TO_ID = _build_ids()

LOCATION_GROUPS: dict[str, set[str]] = {}
for _spec in build_check_specs(MAX_MILESTONES, max(MILESTONE_STEPS), True, True, True, **ALL_FLAGS):
    if _spec.group != "Milestones":
        LOCATION_GROUPS.setdefault(_spec.group, set()).add(_spec.name)
LOCATION_GROUPS["Milestones"] = {name for name in LOCATION_NAME_TO_ID if name.startswith("Correct Answers: ")}


class AMQLocation(Location):
    game = GAME_NAME
