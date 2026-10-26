import json

from test.bases import WorldTestBase

from ..items import (
    BASE_ID, BROAD_GENRES, CATEGORY_ITEMS, CLOCK, DECADES, DECADE_ITEMS, DUB, FRAGMENT, GAME_NAME, GENRE_ITEMS,
    ITEM_NAME_TO_ID, LENS, MULLIGAN, REBROADCAST, SAMPLE_ITEMS, SCORE_LENS, SONG_TYPE_ITEMS, SPOTLIGHT,
)
from ..locations import EVENT_FINALE, LOCATION_GROUPS, LOCATION_NAME_TO_ID
from ..options import AMQOptions
from ..presets import OPTION_PRESETS


class AMQTestBase(WorldTestBase):
    game = GAME_NAME

    def amq(self):
        return self.multiworld.worlds[1]


class TestDefaults(AMQTestBase):
    def test_pool_matches_locations(self) -> None:
        locations = [loc for loc in self.multiworld.get_locations(1) if loc.address is not None]
        pool = [i for i in self.multiworld.itempool if i.player == 1]
        self.assertEqual(len(locations), len(pool))

    def test_fragment_gate(self) -> None:
        self.collect_all_but([FRAGMENT])
        self.assertFalse(self.can_reach_region("Grand Finale"))
        self.collect_by_name(FRAGMENT)
        self.assertTrue(self.can_reach_region("Grand Finale"))

    def test_stage_gates(self) -> None:
        required = self.amq().options.fragments_required.value
        self.assertTrue(self.can_reach_region("Warm-Up Lobby"))
        self.assertFalse(self.can_reach_region("Listening Booth"))
        fragments = self.get_items_by_name(FRAGMENT)
        self.collect(fragments[:-(-required // 4)])
        self.assertTrue(self.can_reach_region("Listening Booth"))

    def test_starting_items(self) -> None:
        start = [i.name for i in self.multiworld.precollected_items[1]]
        self.assertIn("Opening Pass", start)
        self.assertIn("Format Pass: TV", start)
        decades = [DECADES.index(n.removeprefix("Decade Pass: ")) for n in start if n in DECADE_ITEMS.values()]
        self.assertEqual(len(decades), 2)
        self.assertEqual(max(decades) - min(decades), 1, "starting decades must be neighbours")
        genres = [n.removeprefix("Genre Key: ") for n in start if n in GENRE_ITEMS.values()]
        self.assertEqual(len(genres), 4)
        self.assertTrue(set(genres) & set(BROAD_GENRES))
        pool_names = {i.name for i in self.multiworld.itempool if i.player == 1}
        self.assertFalse(set(start) & pool_names, "starting items must not also be in the pool")

    def test_key_rules(self) -> None:
        missing = next(g for g, item in GENRE_ITEMS.items()
                       if item not in {i.name for i in self.multiworld.precollected_items[1]})
        self.assertFalse(self.can_reach_location(f"Genre Scholar: {missing}"))
        self.collect_by_name(FRAGMENT)  # stage access
        self.assertFalse(self.can_reach_location(f"Genre Scholar: {missing}"))
        self.collect_by_name(GENRE_ITEMS[missing])
        self.assertTrue(self.can_reach_location(f"Genre Scholar: {missing}"))

    def test_rarity_lens(self) -> None:
        self.collect_by_name(FRAGMENT)
        self.assertTrue(self.can_reach_location("Easy Guess-Rate Songs x10"))
        self.assertTrue(self.can_reach_location("Medium Guess-Rate Songs x10"))
        self.assertFalse(self.can_reach_location("Hard Guess-Rate Songs x1"))
        lenses = self.get_items_by_name(LENS)
        self.assertEqual(len(lenses), 2)
        self.collect(lenses[0])
        self.assertTrue(self.can_reach_location("Hard Guess-Rate Songs x1"))
        self.assertFalse(self.can_reach_location("Brutal Guess-Rate Songs x1"))
        self.collect(lenses[1])
        self.assertTrue(self.can_reach_location("Brutal Guess-Rate Songs x1"))

    def test_slot_data(self) -> None:
        data = self.amq().fill_slot_data()
        json.dumps(data)
        ids = {loc.address for loc in self.multiworld.get_locations(1) if loc.address is not None}
        self.assertEqual({c["id"] for c in data["checks"]}, ids)
        self.assertEqual(data["goal"], "finale")


class TestStableIds(AMQTestBase):
    run_default_tests = False

    def test_ids(self) -> None:
        # pinned ids: changing these breaks compatibility with existing seeds
        self.assertEqual(ITEM_NAME_TO_ID["Opening Pass"], BASE_ID)
        self.assertEqual(ITEM_NAME_TO_ID["Genre Key: Action"], BASE_ID + 20)
        self.assertEqual(ITEM_NAME_TO_ID[FRAGMENT], BASE_ID + 71)
        self.assertEqual(ITEM_NAME_TO_ID[CLOCK], BASE_ID + 72)
        self.assertEqual(ITEM_NAME_TO_ID["Sample Pass: Middle"], BASE_ID + 73)
        self.assertEqual(LOCATION_NAME_TO_ID["Bounce Back: 5 Correct Right After a Miss"], BASE_ID + 3000)
        self.assertEqual(LOCATION_NAME_TO_ID["Start Sample: 10 Correct"], BASE_ID + 3100)
        self.assertEqual(LOCATION_NAME_TO_ID["Correct Answers: 120"], BASE_ID + 120)
        self.assertEqual(LOCATION_NAME_TO_ID["First Correct Opening"], BASE_ID + 2000)
        self.assertEqual(LOCATION_NAME_TO_ID["Genre Scholar: Action"], BASE_ID + 2200)
        self.assertEqual(LOCATION_NAME_TO_ID["Home Turf: 10 Correct from Your List"], BASE_ID + 2800)
        self.assertEqual(LOCATION_NAME_TO_ID["Winter Listener: 10 Correct"], BASE_ID + 2900)
        self.assertEqual(LOCATION_NAME_TO_ID[FOUR_SEASONS], BASE_ID + 2904)
        self.assertEqual(ITEM_NAME_TO_ID[MULLIGAN], BASE_ID + 83)
        self.assertEqual(ITEM_NAME_TO_ID[SPOTLIGHT], BASE_ID + 84)
        self.assertEqual(ITEM_NAME_TO_ID["Blind Trap"], BASE_ID + 95)
        self.assertEqual(ITEM_NAME_TO_ID[CATEGORY_ITEMS["Standard"]], BASE_ID + 100)
        self.assertEqual(ITEM_NAME_TO_ID[SCORE_LENS], BASE_ID + 110)
        self.assertEqual(ITEM_NAME_TO_ID[REBROADCAST], BASE_ID + 112)
        self.assertEqual(LOCATION_NAME_TO_ID["Year Collector: 10 Different Years"], BASE_ID + 2612)
        self.assertEqual(LOCATION_NAME_TO_ID["Standard Songs: 10 Correct"], BASE_ID + 3200)
        self.assertEqual(LOCATION_NAME_TO_ID["Acclaimed Anime Songs x10"], BASE_ID + 3300)
        self.assertEqual(LOCATION_NAME_TO_ID["First Correct Dub"], BASE_ID + 3400)
        self.assertEqual(LOCATION_NAME_TO_ID["Quick Draw: 5 Correct within 5s"], BASE_ID + 3500)
        self.assertEqual(LOCATION_NAME_TO_ID["Nexus Explorer: 10 Correct in Nexus"], BASE_ID + 3600)
        self.assertEqual(len(set(LOCATION_NAME_TO_ID.values())), len(LOCATION_NAME_TO_ID))
        self.assertEqual(len(set(ITEM_NAME_TO_ID.values())), len(ITEM_NAME_TO_ID))

    def test_groups_cover_everything(self) -> None:
        grouped = set().union(*LOCATION_GROUPS.values())
        self.assertEqual(grouped, set(LOCATION_NAME_TO_ID))


FOUR_SEASONS = "Four Seasons: Winter, Spring, Summer and Fall in One Game"


class TestSeasonChecks(AMQTestBase):
    def test_on_by_default(self) -> None:
        names = {loc.name for loc in self.multiworld.get_locations(1)}
        self.assertIn(FOUR_SEASONS, names)
        self.assertIn("Fall Listener: 10 Correct", names)
        self.assertFalse(self.can_reach_location("Fall Listener: 10 Correct"), "stage 1 needs fragments")
        self.collect_by_name(FRAGMENT)
        self.assertTrue(self.can_reach_location(FOUR_SEASONS), "seasons are never locked by items")


class TestSeasonChecksOff(AMQTestBase):
    options = {"season_checks": False}

    def test_absent(self) -> None:
        names = {loc.name for loc in self.multiworld.get_locations(1)}
        self.assertFalse(names & LOCATION_GROUPS["Seasons"])


class TestComebacksAndSamplePoints(AMQTestBase):
    def test_defaults(self) -> None:
        names = {loc.name for loc in self.multiworld.get_locations(1)}
        self.assertLessEqual(LOCATION_GROUPS["Comebacks"], names, "comebacks come with challenge_checks")
        self.assertFalse(names & LOCATION_GROUPS["Sample Points"], "sample points are opt-in")
        self.assertEqual(self.get_items_by_name("Sample Pass: Middle"), [])


class TestSamplePointGated(AMQTestBase):
    options = {"unlock_categories": ["Song Types", "Decades", "Genres", "Formats", "Rarity", "Sample Point"]}

    def test_passes(self) -> None:
        self.assertEqual(len(self.get_items_by_name(SAMPLE_ITEMS["End"])), 1)
        self.collect_by_name(FRAGMENT)
        self.assertTrue(self.can_reach_location("Start Sample: 10 Correct"))
        self.assertFalse(self.can_reach_location("End Sample: 10 Correct"))
        self.collect_by_name(SAMPLE_ITEMS["End"])
        self.assertTrue(self.can_reach_location("End Sample: 10 Correct"))


class TestScholarGoal(AMQTestBase):
    options = {"goal": "scholar"}

    def test_needs_every_genre(self) -> None:
        start = {i.name for i in self.multiworld.precollected_items[1]}
        missing = next(item for item in GENRE_ITEMS.values() if item not in start)
        self.collect_all_but([missing])
        self.assertFalse(self.can_reach_location(EVENT_FINALE))
        self.collect_by_name(missing)
        self.assertTrue(self.can_reach_location(EVENT_FINALE))
        data = self.amq().fill_slot_data()
        self.assertEqual((data["goal"], data["goal_kinds"]), ("scholar", ["genre"]))


class TestSpecialistGoal(AMQTestBase):
    options = {"goal": "specialist", "starting_song_type": "opening"}

    def test_needs_every_song_type(self) -> None:
        self.collect_all_but([SONG_TYPE_ITEMS["Ending"]])
        self.assertFalse(self.can_reach_location(EVENT_FINALE))
        self.collect_by_name(SONG_TYPE_ITEMS["Ending"])
        self.assertTrue(self.can_reach_location(EVENT_FINALE))


class TestUniversalTracker(AMQTestBase):
    """Universal Tracker rebuilds the world from slot data alone; it must come out the same."""
    options = {"challenge_checks": False, "multiplayer_checks": True, "milestone_count": 5, "fragments_required": 30,
               "unlock_categories": ["Decades", "Sample Point"], "song_source": "mixed", "goal": "scholar",
               "trap_link": True}

    def test_rebuild_from_slot_data(self) -> None:
        world = self.amq()
        data = world.fill_slot_data()
        json.dumps(data)
        self.assertTrue(data["trap_link"])
        before = [s.name for s in world.specs]
        o = world.options
        o.challenge_checks.value, o.multiplayer_checks.value, o.milestone_count.value = 1, 0, 10
        o.unlock_categories.value = set()
        o.song_source.value = 0
        self.multiworld.re_gen_passthrough = {GAME_NAME: world.interpret_slot_data(data)}
        world.generate_early()
        self.assertEqual([s.name for s in world.specs], before)
        self.assertEqual(world.gated, {"Decades", "Sample Point"})
        self.assertEqual(o.goal.current_key, "scholar")


LIST_CHECKS = {"Home Turf: 10 Correct from Your List", "Uncharted: 10 Correct off Your List",
               "Best of Both: 5 On-List and 5 Off-List in One Game"}


class TestSongSourceAny(AMQTestBase):
    def test_no_list_checks(self) -> None:
        names = {loc.name for loc in self.multiworld.get_locations(1)}
        self.assertFalse(names & LIST_CHECKS)
        self.assertEqual(self.amq().fill_slot_data()["song_source"], "any")


class TestSongSourceOwnList(AMQTestBase):
    options = {"song_source": "own_list"}

    def test_strict_mode_has_no_list_checks(self) -> None:
        names = {loc.name for loc in self.multiworld.get_locations(1)}
        self.assertFalse(names & LIST_CHECKS)
        self.assertEqual(self.amq().fill_slot_data()["song_source"], "own_list")


class TestSongSourceMixed(AMQTestBase):
    options = {"song_source": "mixed"}

    def test_list_checks_added(self) -> None:
        names = {loc.name for loc in self.multiworld.get_locations(1)}
        self.assertLessEqual(LIST_CHECKS, names)
        self.assertEqual(self.amq().fill_slot_data()["song_source"], "mixed")


class TestOneFreeTier(AMQTestBase):
    options = {"free_difficulty_tiers": 1, "easy_floor": 70, "medium_floor": 40, "hard_floor": 15}

    def test_three_lenses(self) -> None:
        self.collect_by_name(FRAGMENT)
        self.assertTrue(self.can_reach_location("Easy Guess-Rate Songs x10"))
        self.assertFalse(self.can_reach_location("Medium Guess-Rate Songs x10"))
        lenses = self.get_items_by_name(LENS)
        self.assertEqual(len(lenses), 3)
        self.collect(lenses[0])
        self.assertTrue(self.can_reach_location("Medium Guess-Rate Songs x10"))
        self.assertFalse(self.can_reach_location("Hard Guess-Rate Songs x1"))

    def test_slot_data(self) -> None:
        data = self.amq().fill_slot_data()
        self.assertEqual(data["difficulty_floors"], {"Easy": 70, "Medium": 40, "Hard": 15, "Brutal": 0})
        self.assertEqual(data["free_difficulty_tiers"], 1)


class TestAllTiersFree(AMQTestBase):
    options = {"free_difficulty_tiers": 4}

    def test_no_lenses(self) -> None:
        self.assertEqual(self.get_items_by_name(LENS), [])
        self.collect_by_name(FRAGMENT)
        self.assertTrue(self.can_reach_location("Brutal Guess-Rate Songs x3"))


class TestGuessTimeOffByDefault(AMQTestBase):
    def test_no_clocks(self) -> None:
        self.assertEqual(self.get_items_by_name(CLOCK), [])
        self.assertNotIn("Guess Time", self.amq().fill_slot_data()["gated"])


class TestGuessTime(AMQTestBase):
    options = {
        "unlock_categories": ["Song Types", "Decades", "Genres", "Formats", "Rarity", "Guess Time"],
        "guess_time_start": 8, "guess_time_step": 4, "guess_time_items": 3,
    }

    def test_clocks_in_pool(self) -> None:
        self.assertEqual(len(self.get_items_by_name(CLOCK)), 3)
        data = self.amq().fill_slot_data()
        self.assertIn("Guess Time", data["gated"])
        self.assertEqual(data["guess_time"], {"start": 8, "step": 4})


class TestFloorsCorrected(AMQTestBase):
    """Out-of-order floors are pushed down so each tier stays at least 5 points wide."""
    options = {"easy_floor": 30, "medium_floor": 40, "hard_floor": 50}

    def test_floors(self) -> None:
        floors = self.amq().fill_slot_data()["difficulty_floors"]
        self.assertEqual(floors, {"Easy": 30, "Medium": 25, "Hard": 20, "Brutal": 0})


class TestMinimal(AMQTestBase):
    options = {
        "unlock_categories": [],
        "challenge_checks": False,
        "milestone_count": 5,
        "fragments_required": 5,
        "fragment_extra_percent": 0,
        "goal": "fragments",
    }

    def test_nothing_precollected(self) -> None:
        self.assertEqual(self.multiworld.precollected_items[1], [])


class TestTooFewChecks(AMQTestBase):
    """A valid yaml that cannot fit its own item pool must grow milestones instead of failing generation."""
    options = {
        "challenge_checks": False,
        "milestone_count": 5,
        "fragments_required": 30,
        "fragment_extra_percent": 100,
    }

    def test_milestones_raised(self) -> None:
        self.assertGreater(self.amq().options.milestone_count.value, 5)
        fragments = [i for i in self.multiworld.itempool if i.name == FRAGMENT]
        self.assertEqual(len(fragments), 60)


class TestEverything(AMQTestBase):
    options = {
        "multiplayer_checks": True,
        "milestone_count": 50,
        "milestone_step": 25,
        "starting_song_type": "any",
        "starting_decades": 4,
        "starting_genres": 8,
        "trap_percentage": 100,
        "fragments_required": 30,
        "fragment_extra_percent": 100,
        "death_link": True,
    }

    def test_all_traps(self) -> None:
        filler = [i for i in self.multiworld.itempool if i.classification.name in ("filler", "useful")
                  and i.name not in (LENS,)]
        self.assertEqual(filler, [])


ALL_GATES = ["Song Types", "Decades", "Genres", "Formats", "Rarity"]


class TestNewChecksDefaults(AMQTestBase):
    def test_quick_draw_on_nexus_off(self) -> None:
        names = {loc.name for loc in self.multiworld.get_locations(1)}
        self.assertLessEqual(LOCATION_GROUPS["Quick Draw"], names)
        self.assertFalse(names & LOCATION_GROUPS["Nexus"])
        for group in ("Song Categories", "Anime Score", "Dubs & Rebroadcasts"):
            self.assertFalse(names & LOCATION_GROUPS[group], f"{group} is opt-in")
        self.assertEqual(self.get_items_by_name(SCORE_LENS), [])

    def test_year_collector_needs_decades(self) -> None:
        self.collect_by_name(FRAGMENT)
        self.assertTrue(self.can_reach_location("Year Collector: 10 Different Years"))
        start = {i.name for i in self.multiworld.precollected_items[1]}
        missing = [item for item in DECADE_ITEMS.values() if item not in start]
        self.collect_all_but(missing)
        self.assertFalse(self.can_reach_location("Year Collector: 25 Different Years"), "two decades are not enough")
        self.collect_by_name(missing[0])
        self.assertTrue(self.can_reach_location("Year Collector: 25 Different Years"))

    def test_slot_data_links(self) -> None:
        data = self.amq().fill_slot_data()
        self.assertEqual((data["death_link_trigger"], data["death_link_amnesty"]), ("miss_streak", 0))
        self.assertFalse(data["ring_link"])
        quick = next(c for c in data["checks"] if c["kind"] == "quick")
        self.assertIn("secs", quick)


class TestOptionalCategories(AMQTestBase):
    options = {"unlock_categories": ALL_GATES + ["Song Category", "Anime Score", "Dub & Rebroadcast"],
               "nexus_checks": True, "ring_link": True, "death_link_trigger": "either"}

    def test_category_passes(self) -> None:
        start = {i.name for i in self.multiworld.precollected_items[1]}
        self.assertIn(CATEGORY_ITEMS["Standard"], start)
        self.assertEqual(self.get_items_by_name(CATEGORY_ITEMS["Standard"]), [])
        self.assertEqual(len(self.get_items_by_name(CATEGORY_ITEMS["Chanting"])), 1)
        self.assertTrue(self.can_reach_location("Standard Songs: 10 Correct"))
        self.collect_by_name(FRAGMENT)
        self.assertFalse(self.can_reach_location("Chanting Songs: 1 Correct"))
        self.collect_by_name(CATEGORY_ITEMS["Chanting"])
        self.assertTrue(self.can_reach_location("Chanting Songs: 1 Correct"))

    def test_score_lenses(self) -> None:
        lenses = self.get_items_by_name(SCORE_LENS)
        self.assertEqual(len(lenses), 2)
        self.collect_by_name(FRAGMENT)
        self.assertTrue(self.can_reach_location("Well Liked Anime Songs x10"))
        self.assertFalse(self.can_reach_location("Mixed Anime Songs x5"))
        self.collect(lenses[0])
        self.assertTrue(self.can_reach_location("Mixed Anime Songs x5"))
        self.assertFalse(self.can_reach_location("Overlooked Anime Songs x3"))
        self.collect(lenses[1])
        self.assertTrue(self.can_reach_location("Overlooked Anime Songs x3"))

    def test_dub_passes(self) -> None:
        self.collect_by_name(FRAGMENT)
        self.assertFalse(self.can_reach_location("First Correct Dub"))
        self.collect_by_name(DUB)
        self.assertTrue(self.can_reach_location("First Correct Dub"))
        self.assertFalse(self.can_reach_location("First Correct Rebroadcast"))

    def test_nexus_and_slot_data(self) -> None:
        names = {loc.name for loc in self.multiworld.get_locations(1)}
        self.assertLessEqual(LOCATION_GROUPS["Nexus"], names)
        data = self.amq().fill_slot_data()
        self.assertTrue(data["ring_link"])
        self.assertEqual(data["death_link_trigger"], "either")
        self.assertEqual(data["score_floors"]["Well Liked"], 7)


class TestPresets(AMQTestBase):
    run_default_tests = False

    def test_presets_are_valid(self) -> None:
        fields = AMQOptions.type_hints
        for preset, values in OPTION_PRESETS.items():
            for name, value in values.items():
                self.assertIn(name, fields, f"{preset}: unknown option {name}")
                fields[name].from_any(value)


class TestDescriptions(AMQTestBase):
    run_default_tests = False

    def test_every_item_and_location_described(self) -> None:
        web = self.amq().web
        self.assertLessEqual(set(ITEM_NAME_TO_ID), set(web.item_descriptions))
        self.assertLessEqual(set(LOCATION_NAME_TO_ID), set(web.location_descriptions))
        self.assertLessEqual(set(LOCATION_GROUPS), set(web.location_descriptions))
        world = self.amq()
        # what Archipelago's webhost test requires: every key is a name or group name
        self.assertLessEqual(set(web.item_descriptions), set(ITEM_NAME_TO_ID) | set(world.item_name_groups))
        self.assertLessEqual(set(web.location_descriptions), set(LOCATION_NAME_TO_ID) | set(LOCATION_GROUPS))
        self.assertEqual(web.location_descriptions["Decade Dive: 1980s & Earlier x10"],
                         "Answer 10 songs from the 1980s or earlier correctly.")
        self.assertEqual(web.location_descriptions["Format Hunter: OVA"], "Answer 1 song from an OVA correctly.")
