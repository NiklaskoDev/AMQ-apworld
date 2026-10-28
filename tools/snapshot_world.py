"""Snapshot of what generation produces, to check that a refactor changes nothing.

Generates every option set in CONFIGS with every seed in SEEDS, fills the items, and writes placements, excluded
checks, starting items, slot data, descriptions, ids and groups as JSON. Same code, same output: compare a snapshot
taken before a change with one taken after (tools/diff_json.py).

Run from an Archipelago checkout whose worlds/amq links to the code to snapshot:
    python /path/to/tools/snapshot_world.py OUT.json
"""
import json
import os
import random
import sys
from argparse import Namespace

sys.path.insert(0, os.getcwd())  # the Archipelago checkout

from worlds import AutoWorld  # noqa: E402  (loads the worlds before Fill imports them)
from worlds.AutoWorld import call_all  # noqa: E402
from worlds.generic.Rules import exclusion_rules  # noqa: E402
from BaseClasses import CollectionState, MultiWorld  # noqa: E402
from Fill import distribute_items_restrictive  # noqa: E402
from Generate import get_seed_name  # noqa: E402

GAME = "Anime Music Quiz"
CONFIGS = [
    {},
    {"song_source": "own_list"},
    {"song_source": "mixed", "goal": "scholar", "multiplayer_checks": True},
    {"song_source": "own_list", "trap_percentage": 0, "nexus_checks": True,
     "unlock_categories": ["Song Types", "Decades", "Genres", "Formats", "Rarity", "Song Category", "Anime Score",
                           "Dub & Rebroadcast", "Guess Time", "Sample Point"]},
    {"unlock_categories": [], "goal": "fragments", "fragments_required": 5, "fragment_extra_percent": 0},
    {"challenge_checks": False, "milestone_count": 5, "fragments_required": 30, "fragment_extra_percent": 100},
    {"exclude_locations": ["Genres", "Formats"], "trap_percentage": 0, "goal": "specialist"},
    {"free_difficulty_tiers": 1, "easy_floor": 70, "medium_floor": 68, "hard_floor": 67, "starting_song_type": "any",
     "starting_decades": 4, "starting_genres": 8, "trap_percentage": 100, "death_link": True, "ring_link": True,
     "trap_link": True, "season_checks": False, "quick_draw_checks": False},
]
SEEDS = [1, 2, 3, 42]


def generate(options: dict, seed: int) -> dict:
    """One solo generation, set up the way Generate.py and WorldTestBase do it."""
    mw = MultiWorld(1)
    mw.game[1] = GAME
    mw.player_name = {1: "Tester"}
    mw.set_seed(seed)
    random.seed(mw.seed)
    mw.seed_name = get_seed_name(random)
    args = Namespace()
    for name, option in AutoWorld.AutoWorldRegister.world_types[GAME].options_dataclass.type_hints.items():
        value = option.from_any(options.get(name, option.default))
        if hasattr(value, "verify"):
            value.verify(AutoWorld.AutoWorldRegister.world_types[GAME], "Tester", None)
        setattr(args, name, {1: value})
    mw.set_options(args)
    mw.state = CollectionState(mw)
    for step in ("generate_early", "create_regions", "create_items", "set_rules", "connect_entrances",
                 "generate_basic", "pre_fill"):
        call_all(mw, step)
    exclusion_rules(mw, 1, mw.worlds[1].options.exclude_locations.value)
    distribute_items_restrictive(mw)
    world = mw.worlds[1]
    return {
        "placements": {loc.name: loc.item.name for loc in mw.get_locations(1) if loc.item},
        "excluded": sorted(loc.name for loc in mw.get_locations(1) if loc.progress_type.name == "EXCLUDED"),
        "precollected": sorted(i.name for i in mw.precollected_items[1]),
        "slot_data": world.fill_slot_data(),
        "web": {"items": world.web.item_descriptions, "locations": world.web.location_descriptions},
        "ids": {"items": world.item_name_to_id, "locations": world.location_name_to_id},
        "groups": {"items": {k: sorted(v) for k, v in world.item_name_groups.items()},
                   "locations": {k: sorted(v) for k, v in world.location_name_groups.items()}},
    }


if __name__ == "__main__":
    out = {f"{i}/{seed}": generate(cfg, seed) for i, cfg in enumerate(CONFIGS) for seed in SEEDS}
    with open(sys.argv[1], "w") as f:
        json.dump(out, f, indent=1, sort_keys=True, default=sorted)
    print(f"{len(out)} generations written")
