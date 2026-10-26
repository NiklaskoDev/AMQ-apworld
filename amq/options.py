from dataclasses import dataclass

from Options import (
    Choice, DeathLink, DefaultOnToggle, OptionCounter, OptionGroup, OptionSet, PerGameCommonOptions, Range,
    StartInventoryPool, Toggle,
)

from .items import TRAPS

GATING_CATEGORIES = ["Song Types", "Decades", "Genres", "Formats", "Rarity"]


class Goal(Choice):
    """
    Fragments: collect the required Mixtape Fragments.
    Finale: collect the fragments, then also win one "finale" game (see finale_songs / finale_accuracy)."""
    display_name = "Goal"
    option_fragments = 0
    option_finale = 1
    default = 1


class FragmentsRequired(Range):
    """How many Mixtape Fragments are needed to unlock the Grand Finale."""
    display_name = "Fragments Required"
    range_start = 5
    range_end = 30
    default = 12


class FragmentExtraPercent(Range):
    """Extra Mixtape Fragments hidden in the pool, as a percentage of the required amount."""
    display_name = "Extra Fragment Percentage"
    range_start = 0
    range_end = 100
    default = 25


class FinaleSongs(Range):
    """Minimum number of eligible songs in the finale game."""
    display_name = "Finale Length"
    range_start = 10
    range_end = 50
    default = 20


class FinaleAccuracy(Range):
    """Minimum percentage of eligible songs answered correctly in the finale game."""
    display_name = "Finale Accuracy"
    range_start = 50
    range_end = 95
    default = 70


class UnlockCategories(OptionSet):
    """
    Which parts of the quiz are locked behind items. Songs outside your unlocks do not count toward checks.
    These mirror the filters in the lobby settings: song types, vintage, genres, anime type and song difficulty.
    Rarity uses the difficulty tiers below: the free tiers are open, Progressive Rarity Lenses unlock the rest."""
    display_name = "Unlock Categories"
    valid_keys = frozenset(GATING_CATEGORIES)
    default = frozenset(GATING_CATEGORIES)


class SongSource(Choice):
    """
    Which songs count, based on your linked anime list (set the lobby's song selection to match).
    Any: every song counts, wherever it comes from.
    Own List: strict, only songs from your own list count; others are ignored.
    Mixed: every song counts, and extra checks reward correct answers both on and off your list."""
    display_name = "Song Source"
    option_any = 0
    option_own_list = 1
    option_mixed = 2
    default = 0


class EasyFloor(Range):
    """Lowest guess rate (%) that counts as Easy. Easy is this value up to 100%."""
    display_name = "Easy Difficulty Floor"
    range_start = 15
    range_end = 95
    default = 60


class MediumFloor(Range):
    """Lowest guess rate (%) that counts as Medium. Medium runs up to the Easy floor.
    Lowered automatically if it is not at least 5 below the Easy floor."""
    display_name = "Medium Difficulty Floor"
    range_start = 10
    range_end = 90
    default = 25


class HardFloor(Range):
    """Lowest guess rate (%) that counts as Hard. Hard runs up to the Medium floor; everything below is Brutal.
    Lowered automatically if it is not at least 5 below the Medium floor."""
    display_name = "Hard Difficulty Floor"
    range_start = 5
    range_end = 85
    default = 10


class FreeDifficultyTiers(Range):
    """How many difficulty tiers are unlocked from the start, easiest first (only matters if Rarity is locked).
    One Progressive Rarity Lens is added per remaining tier: 1 = start with Easy only (3 lenses),
    4 = everything open (no lenses)."""
    display_name = "Free Difficulty Tiers"
    range_start = 1
    range_end = 4
    default = 2


class StartingSongType(Choice):
    """Which song type you begin with (only matters if Song Types are locked)."""
    display_name = "Starting Song Type"
    option_any = 0
    option_opening = 1
    option_ending = 2
    option_insert_song = 3
    default = 1


class StartingDecades(Range):
    """How many decades you begin with, as one contiguous range (only matters if Decades are locked)."""
    display_name = "Starting Decades"
    range_start = 1
    range_end = 4
    default = 2


class StartingGenres(Range):
    """How many random genres you begin with; one is always a broad genre (only matters if Genres are locked)."""
    display_name = "Starting Genres"
    range_start = 2
    range_end = 8
    default = 4


class MilestoneCount(Range):
    """Number of cumulative "Correct Answers" checks. Raised automatically if the item pool would not fit."""
    display_name = "Milestone Count"
    range_start = 5
    range_end = 50
    default = 15


class MilestoneStep(Range):
    """Correct answers between two milestones."""
    display_name = "Milestone Step"
    range_start = 5
    range_end = 25
    default = 10


class ChallengeChecks(DefaultOnToggle):
    """Add streaks and single-game challenges (flawless games, marathons, variety runs)."""
    display_name = "Challenge Checks"


class SeasonChecks(DefaultOnToggle):
    """Add checks for the season an anime aired in (Winter, Spring, Summer, Fall). Seasons are never locked."""
    display_name = "Season Checks"


class MultiplayerChecks(Toggle):
    """Add checks for placing well in games with other players. Leave off for solo play."""
    display_name = "Multiplayer Checks"


class DeathLinkMisses(Range):
    """With Death Link on, missing this many eligible songs in a row sends a death.
    A received death wipes your streak and mutes the next song."""
    display_name = "Death Link Miss Streak"
    range_start = 1
    range_end = 10
    default = 3


class TrapPercentage(Range):
    """Percentage of filler items replaced by traps."""
    display_name = "Trap Percentage"
    range_start = 0
    range_end = 100
    default = 20


class TrapWeights(OptionCounter):
    """Relative weights of each trap. Set to 0 to disable one."""
    display_name = "Trap Weights"
    valid_keys = frozenset(TRAPS)
    min = 0
    default = {trap: 1 for trap in TRAPS}


class TrapDuration(Range):
    """How many songs a timed trap lasts."""
    display_name = "Trap Duration"
    range_start = 1
    range_end = 10
    default = 3


@dataclass
class AMQOptions(PerGameCommonOptions):
    goal: Goal
    fragments_required: FragmentsRequired
    fragment_extra_percent: FragmentExtraPercent
    finale_songs: FinaleSongs
    finale_accuracy: FinaleAccuracy
    unlock_categories: UnlockCategories
    starting_song_type: StartingSongType
    starting_decades: StartingDecades
    starting_genres: StartingGenres
    song_source: SongSource
    easy_floor: EasyFloor
    medium_floor: MediumFloor
    hard_floor: HardFloor
    free_difficulty_tiers: FreeDifficultyTiers
    milestone_count: MilestoneCount
    milestone_step: MilestoneStep
    challenge_checks: ChallengeChecks
    season_checks: SeasonChecks
    multiplayer_checks: MultiplayerChecks
    trap_percentage: TrapPercentage
    trap_weights: TrapWeights
    trap_duration: TrapDuration
    death_link: DeathLink
    death_link_misses: DeathLinkMisses
    start_inventory_from_pool: StartInventoryPool


OPTION_GROUPS = [
    OptionGroup("Goal", [Goal, FragmentsRequired, FragmentExtraPercent, FinaleSongs, FinaleAccuracy]),
    OptionGroup("Unlocks", [UnlockCategories, SongSource, StartingSongType, StartingDecades, StartingGenres]),
    OptionGroup("Difficulty", [EasyFloor, MediumFloor, HardFloor, FreeDifficultyTiers]),
    OptionGroup("Checks", [MilestoneCount, MilestoneStep, ChallengeChecks, SeasonChecks, MultiplayerChecks]),
    OptionGroup("Traps", [TrapPercentage, TrapWeights, TrapDuration]),
    OptionGroup("Death Link", [DeathLink, DeathLinkMisses]),
]
