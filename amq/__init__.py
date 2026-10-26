from __future__ import annotations

import math
from typing import Any

from BaseClasses import Item, ItemClassification, Region, Tutorial
from Options import OptionError
from worlds.AutoWorld import WebWorld, World

from .items import (
    AMQItem, DECADES, DECADE_ITEMS, FILLER_WEIGHTS, FORMAT_ITEMS, FRAGMENT, GAME_NAME, GENRES, GENRE_ITEMS, ITEM_GROUPS,
    ITEM_NAME_TO_ID, ITEM_TABLE, LENS, SONG_TYPE_ITEMS, SONG_TYPES, TRAPS,
)
from .locations import (
    AMQLocation, CheckSpec, EVENT_FINALE, LOCATION_NAME_TO_ID, STAGES, build_check_specs,
)
from .options import AMQOptions, OPTION_GROUPS

CLIENT_VERSION = 1


class AMQWebWorld(WebWorld):
    theme = "partyTime"
    option_groups = OPTION_GROUPS
    tutorials = [Tutorial(
        "Multiworld Setup Guide",
        "How to play Anime Music Quiz with Archipelago using the companion userscript.",
        "English",
        "setup_en.md",
        "setup/en",
        ["niklaskodev"],
    )]


class AMQWorld(World):
    """
    Anime Music Quiz is a browser game where you identify anime from short opening, ending and insert song clips.
    Here, the lobby filters are locked behind items, your correct guesses send checks, and the mixtape traps
    mess with your listening setup. Unaffiliated fan project: no game content is included.
    """
    game = GAME_NAME
    web = AMQWebWorld()
    options_dataclass = AMQOptions
    options: AMQOptions
    topology_present = False

    item_name_to_id = ITEM_NAME_TO_ID
    location_name_to_id = LOCATION_NAME_TO_ID
    item_name_groups = ITEM_GROUPS

    specs: list[CheckSpec]
    gated: set[str]
    starting: list[str]
    fragment_total: int

    def generate_early(self) -> None:
        o = self.options
        self.gated = set(o.unlock_categories.value)
        self.specs = build_check_specs(
            o.milestone_count.value, o.milestone_step.value, bool(o.challenge_checks), bool(o.multiplayer_checks))

        self.starting = []
        if "Song Types" in self.gated:
            if o.starting_song_type.value == 0:
                choice = self.random.choice(SONG_TYPES)
            else:
                choice = SONG_TYPES[o.starting_song_type.value - 1]
            self.starting.append(SONG_TYPE_ITEMS[choice])
        if "Decades" in self.gated:
            picks = self.random.sample(DECADES, o.starting_decades.value)
            self.starting += [DECADE_ITEMS[d] for d in picks]
        if "Genres" in self.gated:
            picks = self.random.sample(GENRES, o.starting_genres.value)
            self.starting += [GENRE_ITEMS[g] for g in picks]

        req = o.fragments_required.value
        self.fragment_total = req + math.ceil(req * o.fragment_extra_percent.value / 100)

    def _unlock_items(self) -> list[str]:
        names: list[str] = []
        if "Song Types" in self.gated:
            names += SONG_TYPE_ITEMS.values()
        if "Decades" in self.gated:
            names += DECADE_ITEMS.values()
        if "Genres" in self.gated:
            names += GENRE_ITEMS.values()
        if "Formats" in self.gated:
            names += [n for f, n in FORMAT_ITEMS.items() if f != "TV"]
        names = [n for n in names if n not in self.starting]
        if "Rarity" in self.gated:
            names += [LENS] * 3
        return names

    def create_item(self, name: str) -> Item:
        return AMQItem(name, ITEM_TABLE[name].classification, ITEM_TABLE[name].code, self.player)

    def get_filler_item_name(self) -> str:
        names = list(FILLER_WEIGHTS)
        return self.random.choices(names, [FILLER_WEIGHTS[n] for n in names])[0]

    def create_regions(self) -> None:
        menu = Region("Menu", self.player, self.multiworld)
        self.multiworld.regions.append(menu)
        req = self.options.fragments_required.value

        previous = menu
        regions: list[Region] = []
        for stage, name in enumerate(STAGES):
            region = Region(name, self.player, self.multiworld)
            regions.append(region)
            self.multiworld.regions.append(region)
            needed = math.ceil(req * stage / 4)
            previous.connect(
                region, f"Enter {name}",
                (lambda state, n=needed: state.has(FRAGMENT, self.player, n)) if needed else None)
            previous = region

        for spec in self.specs:
            loc = AMQLocation(self.player, spec.name, LOCATION_NAME_TO_ID[spec.name], regions[spec.stage])
            for r in spec.reqs:
                if r.category in self.gated:
                    loc.access_rule = self._chain(loc.access_rule, r.items, r.need)
            regions[spec.stage].locations.append(loc)

        finale = Region("Grand Finale", self.player, self.multiworld)
        self.multiworld.regions.append(finale)
        menu.connect(finale, "Enter Grand Finale", lambda state: state.has(FRAGMENT, self.player, req))
        event = AMQLocation(self.player, EVENT_FINALE, None, finale)
        event.place_locked_item(AMQItem("Victory", ItemClassification.progression, None, self.player))
        finale.locations.append(event)

    def _chain(self, existing, items: tuple[str, ...], need: int):
        player = self.player

        def rule(state) -> bool:
            return sum(state.count(i, player) for i in items) >= need

        if existing is None:
            return rule
        return lambda state: existing(state) and rule(state)

    def create_items(self) -> None:
        for name in self.starting:
            self.multiworld.push_precollected(self.create_item(name))
        if "Formats" in self.gated:
            self.multiworld.push_precollected(self.create_item(FORMAT_ITEMS["TV"]))

        pool = self._unlock_items()
        free_slots = len(self.specs) - len(pool)
        fragments = self.fragment_total
        if free_slots < fragments:
            fragments = max(self.options.fragments_required.value, free_slots)
        if free_slots < self.options.fragments_required.value:
            raise OptionError(
                f"Anime Music Quiz ({self.player_name}): not enough checks ({len(self.specs)}) for the unlock items "
                f"and {self.options.fragments_required.value} required fragments. Raise milestone_count or "
                f"enable more check types.")
        pool += [FRAGMENT] * fragments

        filler = len(self.specs) - len(pool)
        weights = {t: w for t, w in self.options.trap_weights.value.items() if t in TRAPS and w > 0}
        trap_count = round(filler * self.options.trap_percentage.value / 100) if weights else 0
        if trap_count:
            pool += self.random.choices(list(weights), list(weights.values()), k=trap_count)
        pool += [self.get_filler_item_name() for _ in range(filler - trap_count)]

        self.multiworld.itempool += [self.create_item(n) for n in pool]

    def set_rules(self) -> None:
        self.multiworld.completion_condition[self.player] = lambda state: state.has("Victory", self.player)

    def fill_slot_data(self) -> dict[str, Any]:
        o = self.options
        return {
            "client_version": CLIENT_VERSION,
            "goal": "finale" if o.goal.value == 1 else "fragments",
            "fragments_required": o.fragments_required.value,
            "finale_songs": o.finale_songs.value,
            "finale_accuracy": o.finale_accuracy.value,
            "gated": sorted(self.gated),
            "trap_duration": o.trap_duration.value,
            "checks": [s.client_dict(LOCATION_NAME_TO_ID[s.name]) for s in self.specs],
        }
