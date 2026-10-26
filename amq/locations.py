from __future__ import annotations

from dataclasses import dataclass, field

from BaseClasses import Location

from .items import (
    BASE_ID, DECADES, DECADE_ITEMS, FORMATS, FORMAT_ITEMS, GAME_NAME, GENRES, GENRE_ITEMS, LENS, RARITY_TIERS,
    SONG_TYPES, SONG_TYPE_ITEMS,
)

STAGES = ["Warm-Up Lobby", "Listening Booth", "Recording Studio", "Concert Hall"]
MAX_MILESTONES = 50
EVENT_FINALE = "Grand Finale"


@dataclass(frozen=True)
class Req:
    """Needs at least `need` items (counting copies) out of `items`. Skipped when `category` is not gated."""
    category: str
    items: tuple[str, ...]
    need: int = 1


@dataclass(frozen=True)
class CheckSpec:
    name: str
    kind: str  # interpreted by the client, see client/README.md
    stage: int
    key: str = ""
    n: int = 0
    pct: int = 0
    reqs: tuple[Req, ...] = field(default=())

    def client_dict(self, address: int) -> dict:
        return {"id": address, "name": self.name, "kind": self.kind, "key": self.key, "n": self.n, "pct": self.pct}


def _stage_for(index: int, total: int) -> int:
    return min(3, 4 * index // max(1, total))


def build_check_specs(milestone_count: int, milestone_step: int, challenges: bool, multiplayer: bool) -> list[CheckSpec]:
    specs: list[CheckSpec] = []

    for i in range(milestone_count):
        n = milestone_step * (i + 1)
        specs.append(CheckSpec(f"Correct Answers: {n}", "total", _stage_for(i, milestone_count), n=n))

    for t, (n, stage) in ((t, x) for t in SONG_TYPES for x in ((1, 0), (10, 1), (25, 2))):
        name = f"First Correct {t}" if n == 1 else f"{t} Specialist: {n} Correct"
        specs.append(CheckSpec(name, "type", stage, key=t, n=n, reqs=(Req("Song Types", (SONG_TYPE_ITEMS[t],)),)))

    for d in DECADES:
        for n, stage in ((1, 0), (10, 1)):
            specs.append(CheckSpec(f"Decade Dive: {d} x{n}", "decade", stage, key=d, n=n,
                                   reqs=(Req("Decades", (DECADE_ITEMS[d],)),)))

    for g in GENRES:
        specs.append(CheckSpec(f"Genre Scholar: {g}", "genre", 1, key=g, n=3, reqs=(Req("Genres", (GENRE_ITEMS[g],)),)))

    for f in FORMATS:
        if f != "TV":
            specs.append(CheckSpec(f"Format Hunter: {f}", "format", 1, key=f, n=1,
                                   reqs=(Req("Formats", (FORMAT_ITEMS[f],)),)))

    for tier, n, stage in (("Medium", 1, 0), ("Medium", 5, 1), ("Hard", 1, 1), ("Hard", 5, 2),
                           ("Brutal", 1, 2), ("Brutal", 3, 3)):
        idx = RARITY_TIERS.index(tier)
        specs.append(CheckSpec(f"{tier} Guess-Rate Songs x{n}", "rarity", stage, key=tier, n=n,
                               reqs=(Req("Rarity", (LENS,), idx),)))

    if challenges:
        for n, stage in ((3, 0), (5, 0), (8, 1), (12, 2), (20, 3)):
            specs.append(CheckSpec(f"Hot Streak: {n} in a Row", "streak", stage, n=n))
        for n, stage in ((10, 1), (20, 2), (40, 3)):
            specs.append(CheckSpec(f"Flawless Game: {n} Songs", "flawless", stage, n=n))
        for songs, pct, stage in ((20, 80, 2), (30, 90, 3)):
            specs.append(CheckSpec(f"Sharp Ears: {pct}% over {songs} Songs", "accuracy", stage, n=songs, pct=pct))
        for n, stage in ((30, 1), (50, 2)):
            specs.append(CheckSpec(f"Marathon: {n} Songs in One Game", "marathon", stage, n=n))
        specs.append(CheckSpec("Triple Threat: Opening, Ending and Insert in One Game", "game_types", 1, n=3,
                               reqs=(Req("Song Types", tuple(SONG_TYPE_ITEMS.values()), 3),)))
        for n, stage in ((3, 1), (5, 3)):
            specs.append(CheckSpec(f"Time Capsule: {n} Decades in One Game", "game_decades", stage, n=n,
                                   reqs=(Req("Decades", tuple(DECADE_ITEMS.values()), n),)))
        for n, stage in ((5, 1), (10, 3)):
            specs.append(CheckSpec(f"Genre Sampler: {n} Genres in One Game", "game_genres", stage, n=n,
                                   reqs=(Req("Genres", tuple(GENRE_ITEMS.values()), n),)))

    if multiplayer:
        specs.append(CheckSpec("Podium Finish", "mp_podium", 0))
        specs.append(CheckSpec("Win a Multiplayer Game", "mp_win", 1))
        specs.append(CheckSpec("Crowd Beater: Win with 4+ Players", "mp_win_big", 2, n=4))

    names = [s.name for s in specs]
    assert len(names) == len(set(names)), "duplicate location names"
    return specs


# Every possible location, so the datapackage is stable regardless of options.
def _all_names() -> list[str]:
    seen: dict[str, None] = {}
    for spec in build_check_specs(0, 1, True, True):
        seen[spec.name] = None
    # milestone names depend on step; register every plausible one (steps 5..25)
    for step in range(5, 26):
        for i in range(1, MAX_MILESTONES + 1):
            seen[f"Correct Answers: {step * i}"] = None
    return list(seen)


LOCATION_NAME_TO_ID = {name: BASE_ID + i for i, name in enumerate(_all_names())}


class AMQLocation(Location):
    game = GAME_NAME
