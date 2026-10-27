from __future__ import annotations

import logging
import math
from typing import Any

from BaseClasses import CollectionState, Item, ItemClassification, LocationProgressType, Region, Tutorial
from Options import OptionSet
from worlds.AutoWorld import WebWorld, World

from .descriptions import ITEM_DESCRIPTIONS, LOCATION_DESCRIPTIONS
from .items import (
    AMQItem, BROAD_GENRES, CATEGORY_ITEMS, CHEER, CLOCK, DECADES, DECADE_ITEMS, DUB, FILLER_WEIGHTS, FORMAT_ITEMS,
    FRAGMENT, FREE_SCORE_TIERS, GAME_NAME, GENRES, GENRE_ITEMS, ITEM_GROUPS, ITEM_NAME_TO_ID, ITEM_TABLE, LENS,
    RARITY_TIERS, REBROADCAST, SAMPLE_ITEMS, SCORE_FLOORS, SCORE_LENS, SCORE_TIERS, SONG_TYPE_ITEMS, SONG_TYPES, TRAPS,
)
from .locations import (
    AMQLocation, CheckSpec, EVENT_FINALE, LOCATION_GROUPS, LOCATION_NAME_TO_ID, MAX_MILESTONES, Req, STAGES,
    build_check_specs, needs_wide_list, stage_fragments,
)
from .options import AMQOptions, OPTION_GROUPS, SongSource
from .presets import OPTION_PRESETS

CLIENT_VERSION = 6
# goals that need every check of these kinds on top of the fragments
GOAL_KINDS = {"scholar": {"genre"}, "specialist": {"type"}}
# options that shape the locations, rules or pool; sent in slot data so Universal Tracker can rebuild the world
TRACKER_OPTIONS = [
    "goal", "unlock_categories", "fragments_required", "fragment_extra_percent", "milestone_count", "milestone_step",
    "challenge_checks", "multiplayer_checks", "season_checks", "song_source", "free_difficulty_tiers",
    "guess_time_items", "starting_decades", "starting_genres", "quick_draw_checks", "nexus_checks", "own_list_safety",
]

logger = logging.getLogger("Anime Music Quiz")


class AMQWebWorld(WebWorld):
    theme = "partyTime"
    option_groups = OPTION_GROUPS
    options_presets = OPTION_PRESETS
    item_descriptions = ITEM_DESCRIPTIONS
    location_descriptions = LOCATION_DESCRIPTIONS
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
    excluded: set[str]

    ut_can_gen_without_yaml = True  # Universal Tracker: everything needed comes from slot data

    @staticmethod
    def interpret_slot_data(slot_data: dict[str, Any]) -> dict[str, Any]:
        return slot_data

    def generate_early(self) -> None:
        o = self.options
        passthrough = getattr(self.multiworld, "re_gen_passthrough", {}).get(self.game)
        if passthrough and "tracker" in passthrough:
            for name, value in passthrough["tracker"].items():
                option = getattr(o, name)
                option.value = set(value) if isinstance(option, OptionSet) else value
        self.gated = set(o.unlock_categories.value)
        self._fix_difficulty_floors()
        self.starting = self._pick_starting()

        required = o.fragments_required.value
        extra = math.ceil(required * o.fragment_extra_percent.value / 100)
        needed = len(self._unlock_items()) + required + extra

        def specs_for(milestones: int) -> list[CheckSpec]:
            return build_check_specs(milestones, o.milestone_step.value, bool(o.challenge_checks),
                                     bool(o.multiplayer_checks), o.song_source.value == SongSource.option_mixed,
                                     o.free_difficulty_tiers.value, bool(o.season_checks),
                                     "Sample Point" in self.gated, "Song Category" in self.gated,
                                     "Anime Score" in self.gated, "Dub & Rebroadcast" in self.gated,
                                     bool(o.quick_draw_checks), bool(o.nexus_checks))

        milestones = o.milestone_count.value
        self.specs = specs_for(milestones)
        # excluded checks can only take filler, so they don't count toward fitting the unlocks and fragments
        while (len(self.specs) < needed + len(self._excluded(self.specs)) and milestones < MAX_MILESTONES
               and not passthrough):
            milestones += 1
            self.specs = specs_for(milestones)
        self.excluded = self._excluded(self.specs)
        if milestones != o.milestone_count.value:
            logger.warning(f"{self.player_name}: raised milestone_count from {o.milestone_count.value} to "
                           f"{milestones} so the item pool fits.")
            o.milestone_count.value = milestones

        spare = len(self.specs) - len(self.excluded) - len(self._unlock_items()) - required
        if spare < extra:
            # only when milestones hit MAX_MILESTONES, e.g. many fragments plus many excluded checks
            logger.warning(f"{self.player_name}: only room for {max(0, spare)} extra fragments.")
            extra = max(0, spare)
        self.fragment_total = required + extra

        if o.song_source.value == SongSource.option_own_list and o.goal.current_key in GOAL_KINDS:
            what = {"scholar": "every Genre Scholar check", "specialist": "Insert Song checks"}[o.goal.current_key]
            logger.warning(f"{self.player_name}: the {o.goal.current_key} goal needs {what}; with song_source "
                           f"own_list, make sure your anime list has the songs for them.")

    def _excluded(self, specs: list[CheckSpec]) -> set[str]:
        """Checks that may only hold filler: the player's exclude_locations, and with own_list_safety the checks a
        small anime list may not be able to reach."""
        o = self.options
        names: set[str] = set()
        for name in o.exclude_locations.value:
            names |= LOCATION_GROUPS.get(name, {name})
        if o.song_source.value == SongSource.option_own_list and o.own_list_safety:
            names |= {s.name for s in specs if needs_wide_list(s)}
        return names & {s.name for s in specs}

    def _fix_difficulty_floors(self) -> None:
        """Keep every tier at least 5 percentage points wide so no tier's checks become impossible."""
        o = self.options
        easy = o.easy_floor.value
        medium = min(o.medium_floor.value, easy - 5)
        hard = min(o.hard_floor.value, medium - 5)
        if (medium, hard) != (o.medium_floor.value, o.hard_floor.value):
            logger.warning(f"{self.player_name}: difficulty floors must be at least 5 apart and descending; "
                           f"using Easy {easy}, Medium {medium}, Hard {hard}.")
            o.medium_floor.value, o.hard_floor.value = medium, hard

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
            names += [LENS] * (len(RARITY_TIERS) - self.options.free_difficulty_tiers.value)
        if "Guess Time" in self.gated:
            names += [CLOCK] * self.options.guess_time_items.value
        if "Sample Point" in self.gated:
            names += SAMPLE_ITEMS.values()
        if "Song Category" in self.gated:
            names += [n for c, n in CATEGORY_ITEMS.items() if c != "Standard"]
        if "Anime Score" in self.gated:
            names += [SCORE_LENS] * (len(SCORE_TIERS) - FREE_SCORE_TIERS)
        if "Dub & Rebroadcast" in self.gated:
            names += [DUB, REBROADCAST]
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

        goal_targets: list[AMQLocation] = []
        goal_kinds = GOAL_KINDS.get(self.options.goal.current_key, set())
        for spec in self.specs:
            region = stages[spec.stage]
            location = AMQLocation(self.player, spec.name, LOCATION_NAME_TO_ID[spec.name], region)
            reqs = [r for r in spec.reqs if r.category in self.gated]
            if reqs:
                location.access_rule = self._rule(reqs)
            if spec.name in self.excluded:
                location.progress_type = LocationProgressType.EXCLUDED
            region.locations.append(location)
            if spec.kind in goal_kinds:
                goal_targets.append(location)

        finale = Region("Grand Finale", self.player, self.multiworld)
        self.multiworld.regions.append(finale)
        menu.connect(finale, "Enter Grand Finale", lambda state: state.has(FRAGMENT, self.player, required))
        event = AMQLocation(self.player, EVENT_FINALE, None, finale)
        if goal_targets:
            event.access_rule = lambda state: all(loc.can_reach(state) for loc in goal_targets)
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
        if "Song Category" in self.gated:
            self.multiworld.push_precollected(self.create_item(CATEGORY_ITEMS["Standard"]))

        pool = self._unlock_items() + [FRAGMENT] * self.fragment_total
        filler = len(self.specs) - len(pool)
        weights = {t: w for t, w in self.options.trap_weights.value.items() if t in TRAPS and w > 0}
        trap_count = round(filler * self.options.trap_percentage.value / 100) if weights else 0
        if trap_count:
            pool += self.random.choices(list(weights), list(weights.values()), k=trap_count)
        boosts = [self.get_filler_item_name() for _ in range(filler - trap_count)]
        # excluded checks only take filler and traps, and most boosts are useful: swap in Hype Cheers where short
        short = len(self.excluded) - trap_count - boosts.count(CHEER)
        for i, name in enumerate(boosts):
            if short <= 0:
                break
            if name != CHEER:
                boosts[i] = CHEER
                short -= 1
        pool += boosts

        self.multiworld.itempool += [self.create_item(n) for n in pool]

    def set_rules(self) -> None:
        self.multiworld.completion_condition[self.player] = lambda state: state.has("Victory", self.player)

    def fill_slot_data(self) -> dict[str, Any]:
        o = self.options
        return {
            "client_version": CLIENT_VERSION,
            "goal": o.goal.current_key,
            "goal_kinds": sorted(GOAL_KINDS.get(o.goal.current_key, set())),
            "fragments_required": o.fragments_required.value,
            "stages": STAGES,
            "stage_fragments": stage_fragments(o.fragments_required.value),
            "finale_songs": o.finale_songs.value,
            "finale_accuracy": o.finale_accuracy.value,
            "gated": sorted(self.gated),
            "song_source": o.song_source.current_key,
            "difficulty_floors": {"Easy": o.easy_floor.value, "Medium": o.medium_floor.value,
                                  "Hard": o.hard_floor.value, "Brutal": 0},
            "free_difficulty_tiers": o.free_difficulty_tiers.value,
            "guess_time": {"start": o.guess_time_start.value, "step": o.guess_time_step.value},
            "guess_time_items": o.guess_time_items.value,
            "score_floors": SCORE_FLOORS,
            "free_score_tiers": FREE_SCORE_TIERS,
            "trap_duration": o.trap_duration.value,
            "death_link": bool(o.death_link),
            "death_link_trigger": o.death_link_trigger.current_key,
            "death_link_misses": o.death_link_misses.value,
            "death_link_accuracy": o.death_link_accuracy.value,
            "death_link_amnesty": o.death_link_amnesty.value,
            "trap_link": bool(o.trap_link),
            "ring_link": bool(o.ring_link),
            "ring_link_rate": o.ring_link_rate.value,
            "tracker": {name: (sorted(getattr(o, name).value) if isinstance(getattr(o, name), OptionSet)
                               else getattr(o, name).value) for name in TRACKER_OPTIONS},
            "checks": [s.client_dict(LOCATION_NAME_TO_ID[s.name]) for s in self.specs],
        }
