from dataclasses import dataclass

from Options import Choice, DefaultOnToggle, OptionCounter, OptionGroup, OptionSet, PerGameCommonOptions, Range, Toggle

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
    These mirror the filters in the lobby settings: song types, vintage, genres, anime type and guess rate."""
    display_name = "Unlock Categories"
    valid_keys = frozenset(GATING_CATEGORIES)
    default = frozenset(GATING_CATEGORIES)


class StartingSongType(Choice):
    """Which song type you begin with (only matters if Song Types are locked)."""
    display_name = "Starting Song Type"
    option_any = 0
    option_opening = 1
    option_ending = 2
    option_insert_song = 3
    default = 1


class StartingDecades(Range):
    """How many random decades you begin with (only matters if Decades are locked)."""
    display_name = "Starting Decades"
    range_start = 1
    range_end = 4
    default = 2


class StartingGenres(Range):
    """How many random genres you begin with (only matters if Genres are locked)."""
    display_name = "Starting Genres"
    range_start = 2
    range_end = 8
    default = 4


class MilestoneCount(Range):
    """Number of cumulative "Correct Answers" checks."""
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


class MultiplayerChecks(Toggle):
    """Add checks for placing well in games with other players. Leave off for solo play."""
    display_name = "Multiplayer Checks"


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
    milestone_count: MilestoneCount
    milestone_step: MilestoneStep
    challenge_checks: ChallengeChecks
    multiplayer_checks: MultiplayerChecks
    trap_percentage: TrapPercentage
    trap_weights: TrapWeights
    trap_duration: TrapDuration


OPTION_GROUPS = [
    OptionGroup("Goal", [Goal, FragmentsRequired, FragmentExtraPercent, FinaleSongs, FinaleAccuracy]),
    OptionGroup("Unlocks", [UnlockCategories, StartingSongType, StartingDecades, StartingGenres]),
    OptionGroup("Checks", [MilestoneCount, MilestoneStep, ChallengeChecks, MultiplayerChecks]),
    OptionGroup("Traps", [TrapPercentage, TrapWeights, TrapDuration]),
]
