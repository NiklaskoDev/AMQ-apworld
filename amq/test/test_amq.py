from test.bases import WorldTestBase

from ..items import FRAGMENT, GAME_NAME


class AMQTestBase(WorldTestBase):
    game = GAME_NAME


class TestDefaults(AMQTestBase):
    def test_pool_matches_locations(self) -> None:
        locations = [loc for loc in self.multiworld.get_locations(1) if loc.address is not None]
        pool = [i for i in self.multiworld.itempool if i.player == 1]
        self.assertEqual(len(locations), len(pool))

    def test_finale_needs_fragments(self) -> None:
        self.assertBeatable(False)
        self.collect_all_but([])  # everything
        self.assertBeatable(True)

    def test_fragment_gate(self) -> None:
        self.collect_all_but([FRAGMENT])
        self.assertFalse(self.multiworld.state.can_reach_region("Grand Finale", 1))
        self.collect_by_name(FRAGMENT)
        self.assertTrue(self.multiworld.state.can_reach_region("Grand Finale", 1))


class TestMinimal(AMQTestBase):
    options = {
        "unlock_categories": [],
        "challenge_checks": False,
        "milestone_count": 5,
        "fragments_required": 5,
        "fragment_extra_percent": 0,
        "goal": "fragments",
    }


class TestEverything(AMQTestBase):
    options = {
        "multiplayer_checks": True,
        "milestone_count": 50,
        "starting_song_type": "any",
        "trap_percentage": 100,
        "fragments_required": 30,
        "fragment_extra_percent": 100,
    }
