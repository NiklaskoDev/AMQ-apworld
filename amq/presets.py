from typing import Any

# Option presets for the website's options page and template generation. Unlisted options keep their defaults.
OPTION_PRESETS: dict[str, dict[str, Any]] = {
    "Casual": {
        "goal": "fragments",
        "fragments_required": 8,
        "free_difficulty_tiers": 3,
        "starting_decades": 3,
        "starting_genres": 6,
        "trap_percentage": 10,
    },
    "Watched-only Strict": {
        "song_source": "own_list",
        # a personal list is small, so only the broad filters are locked
        "unlock_categories": ["Song Types", "Decades", "Formats", "Rarity"],
        "free_difficulty_tiers": 3,
        "starting_decades": 3,
    },
    "Sweaty": {
        "unlock_categories": ["Song Types", "Decades", "Genres", "Formats", "Rarity", "Guess Time", "Sample Point"],
        "free_difficulty_tiers": 1,
        "guess_time_start": 7,
        "guess_time_step": 3,
        "finale_songs": 40,
        "finale_accuracy": 85,
        "starting_genres": 3,
        "trap_percentage": 40,
    },
    "Short Async": {
        "goal": "fragments",
        "fragments_required": 6,
        "fragment_extra_percent": 0,
        "milestone_count": 8,
        "season_checks": False,
        "quick_draw_checks": False,
    },
}
