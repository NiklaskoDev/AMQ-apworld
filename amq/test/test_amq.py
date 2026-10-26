import json

from test.bases import WorldTestBase

from ..items import (
    BASE_ID, BROAD_GENRES, DECADES, DECADE_ITEMS, FRAGMENT, GAME_NAME, GENRE_ITEMS, ITEM_NAME_TO_ID, LENS,
)
from ..locations import LOCATION_GROUPS, LOCATION_NAME_TO_ID


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
        self.assertEqual(LOCATION_NAME_TO_ID["Correct Answers: 120"], BASE_ID + 120)
        self.assertEqual(LOCATION_NAME_TO_ID["First Correct Opening"], BASE_ID + 2000)
        self.assertEqual(LOCATION_NAME_TO_ID["Genre Scholar: Action"], BASE_ID + 2200)
        self.assertEqual(LOCATION_NAME_TO_ID["Home Turf: 10 Correct from Your List"], BASE_ID + 2800)
        self.assertEqual(LOCATION_NAME_TO_ID["Winter Listener: 10 Correct"], BASE_ID + 2900)
        self.assertEqual(LOCATION_NAME_TO_ID[FOUR_SEASONS], BASE_ID + 2904)
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
