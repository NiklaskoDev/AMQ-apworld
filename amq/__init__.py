from __future__ import annotations

import logging
import math
from typing import Any

from BaseClasses import CollectionState, Item, ItemClassification, Region, Tutorial
from worlds.AutoWorld import WebWorld, World

from .items import (
    AMQItem, BROAD_GENRES, DECADES, DECADE_ITEMS, FILLER_WEIGHTS, FORMAT_ITEMS, FRAGMENT, GAME_NAME, GENRES,
    GENRE_ITEMS, ITEM_GROUPS, ITEM_NAME_TO_ID, ITEM_TABLE, LENS, LENS_COUNT, SONG_TYPE_ITEMS, SONG_TYPES, TRAPS,
)
from .locations import (
    AMQLocation, CheckSpec, EVENT_FINALE, LOCATION_GROUPS, LOCATION_NAME_TO_ID, MAX_MILESTONES, Req, STAGES,
    build_check_specs, stage_fragments,
)
from .options import AMQOptions, OPTION_GROUPS, SongSource

CLIENT_VERSION = 2

logger = logging.getLogger("Anime Music Quiz")


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
    location_name_groups = LOCATION_GROUPS

    specs: list[CheckSpec]
    gated: set[str]
    starting: list[str]
    fragment_total: int

    def generate_early(self) -> None:
        o = self.options
        self.gated = set(o.unlock_categories.value)
        self.starting = self._pick_starting()

        required = o.fragments_required.value
        extra = math.ceil(required * o.fragment_extra_percent.value / 100)
        needed = len(self._unlock_items()) + required + extra

        def specs_for(milestones: int) -> list[CheckSpec]:
            return build_check_specs(milestones, o.milestone_step.value, bool(o.challenge_checks),
                                     bool(o.multiplayer_checks), o.song_source.value == SongSource.option_mixed)

        milestones = o.milestone_count.value
        self.specs = specs_for(milestones)
        while len(self.specs) < needed and milestones < MAX_MILESTONES:
            milestones += 1
            self.specs = specs_for(milestones)
        if milestones != o.milestone_count.value:
            logger.warning(f"{self.player_name}: raised milestone_count from {o.milestone_count.value} to "
                           f"{milestones} so the item pool fits.")
            o.milestone_count.value = milestones

        spare = len(self.specs) - len(self._unlock_items()) - required
        if spare < extra:
            # cannot happen with the current option ranges, kept as a guard
            logger.warning(f"{self.player_name}: only room for {max(0, spare)} extra fragments.")
            extra = max(0, spare)
        self.fragment_total = required + extra

    def _pick_starting(self) -> list[str]:
        o = self.options
        starting: list[str] = []
        if "Song Types" in self.gated:
            choice = (self.random.choice(SONG_TYPES) if o.starting_song_type.value == 0
                      else SONG_TYPES[o.starting_song_type.value - 1])
            starting.append(SONG_TYPE_ITEMS[choice])
        if "Decades" in self.gated:
            # the lobby vintage filter is a single range, so start with neighbouring decades
            count = o.starting_decades.value
            first = self.random.randint(0, len(DECADES) - count)
            starting += [DECADE_ITEMS[d] for d in DECADES[first:first + count]]
        if "Genres" in self.gated:
            broad = self.random.choice(BROAD_GENRES)
            rest = self.random.sample([g for g in GENRES if g != broad], o.starting_genres.value - 1)
            starting += [GENRE_ITEMS[g] for g in [broad, *rest]]
        return starting

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
            names += [LENS] * LENS_COUNT
        return names

    def create_item(self, name: str) -> Item:
        return AMQItem(name, ITEM_TABLE[name].classification, ITEM_TABLE[name].code, self.player)

    def get_filler_item_name(self) -> str:
        names = list(FILLER_WEIGHTS)
        return self.random.choices(names, [FILLER_WEIGHTS[n] for n in names])[0]

    def create_regions(self) -> None:
        menu = Region("Menu", self.player, self.multiworld)
        self.multiworld.regions.append(menu)
        required = self.options.fragments_required.value

        previous = menu
        stages: list[Region] = []
        for name, needed in zip(STAGES, stage_fragments(required)):
            region = Region(name, self.player, self.multiworld)
            stages.append(region)
            self.multiworld.regions.append(region)
            previous.connect(region, f"Enter {name}",
                             (lambda state, n=needed: state.has(FRAGMENT, self.player, n)) if needed else None)
            previous = region

        for spec in self.specs:
            region = stages[spec.stage]
            location = AMQLocation(self.player, spec.name, LOCATION_NAME_TO_ID[spec.name], region)
            reqs = [r for r in spec.reqs if r.category in self.gated]
            if reqs:
                location.access_rule = self._rule(reqs)
            region.locations.append(location)

        finale = Region("Grand Finale", self.player, self.multiworld)
        self.multiworld.regions.append(finale)
        menu.connect(finale, "Enter Grand Finale", lambda state: state.has(FRAGMENT, self.player, required))
        event = AMQLocation(self.player, EVENT_FINALE, None, finale)
        event.place_locked_item(AMQItem("Victory", ItemClassification.progression, None, self.player))
        finale.locations.append(event)

    def _rule(self, reqs: list[Req]):
        player = self.player

        def rule(state: CollectionState) -> bool:
            return all(sum(state.count(i, player) for i in r.items) >= r.need for r in reqs)
        return rule

    def create_items(self) -> None:
        for name in self.starting:
            self.multiworld.push_precollected(self.create_item(name))
        if "Formats" in self.gated:
            self.multiworld.push_precollected(self.create_item(FORMAT_ITEMS["TV"]))

        pool = self._unlock_items() + [FRAGMENT] * self.fragment_total
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
            "stages": STAGES,
            "stage_fragments": stage_fragments(o.fragments_required.value),
            "finale_songs": o.finale_songs.value,
            "finale_accuracy": o.finale_accuracy.value,
            "gated": sorted(self.gated),
            "song_source": o.song_source.current_key,
            "trap_duration": o.trap_duration.value,
            "death_link": bool(o.death_link),
            "death_link_misses": o.death_link_misses.value,
            "checks": [s.client_dict(LOCATION_NAME_TO_ID[s.name]) for s in self.specs],
        }
