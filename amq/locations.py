from __future__ import annotations

import math
from dataclasses import dataclass, field

from BaseClasses import Location

from .items import (
    BASE_ID, DECADES, DECADE_ITEMS, FORMATS, FORMAT_ITEMS, FREE_RARITY_TIERS, GAME_NAME, GENRES, GENRE_ITEMS, LENS,
    RARITY_TIERS, SONG_TYPES, SONG_TYPE_ITEMS,
)

STAGES = ["Warm-Up Lobby", "Listening Booth", "Recording Studio", "Concert Hall"]
MAX_MILESTONES = 50
MILESTONE_STEPS = range(5, 26)
EVENT_FINALE = "Grand Finale"

# "Correct Answers: N" has id BASE_ID + N. Every other check gets its group's fixed block plus its index within the
# group, so appending a check to a group never shifts existing ids.
GROUP_OFFSETS = {
    "Song Types": 2000, "Decades": 2100, "Genres": 2200, "Formats": 2300, "Rarity": 2400,
    "Streaks": 2500, "Challenges": 2600, "Multiplayer": 2700, "Song Source": 2800,
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
    reqs: tuple[Req, ...] = field(default=())

    def client_dict(self, address: int) -> dict:
        return {"id": address, "name": self.name, "kind": self.kind, "key": self.key, "n": self.n, "pct": self.pct,
                "stage": self.stage}


def stage_fragments(required: int) -> list[int]:
    """Fragments needed to enter each stage."""
    return [math.ceil(required * index / len(STAGES)) for index in range(len(STAGES))]


def _stage_for(index: int, total: int) -> int:
    return min(3, 4 * index // max(1, total))


def milestone_name(n: int) -> str:
    return f"Correct Answers: {n}"


def build_check_specs(milestone_count: int, milestone_step: int, challenges: bool, multiplayer: bool,
                      list_checks: bool = False) -> list[CheckSpec]:
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
        lenses = RARITY_TIERS.index(tier) - FREE_RARITY_TIERS + 1
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


def _build_ids() -> dict[str, int]:
    ids: dict[str, int] = {}
    for step in MILESTONE_STEPS:
        for i in range(1, MAX_MILESTONES + 1):
            ids[milestone_name(step * i)] = BASE_ID + step * i
    per_group: dict[str, int] = {}
    for spec in build_check_specs(0, 1, True, True, True):
        index = per_group.get(spec.group, 0)
        assert index < 100, f"group {spec.group} overflowed its id block"
        per_group[spec.group] = index + 1
        ids[spec.name] = BASE_ID + GROUP_OFFSETS[spec.group] + index
    return dict(sorted(ids.items(), key=lambda kv: kv[1]))


LOCATION_NAME_TO_ID = _build_ids()

LOCATION_GROUPS: dict[str, set[str]] = {}
for _spec in build_check_specs(MAX_MILESTONES, max(MILESTONE_STEPS), True, True, True):
    if _spec.group != "Milestones":
        LOCATION_GROUPS.setdefault(_spec.group, set()).add(_spec.name)
LOCATION_GROUPS["Milestones"] = {name for name in LOCATION_NAME_TO_ID if name.startswith("Correct Answers: ")}


class AMQLocation(Location):
    game = GAME_NAME
