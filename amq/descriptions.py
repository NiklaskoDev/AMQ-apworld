from __future__ import annotations

from .items import (
    CATEGORY_ITEMS, CHEER, CLOCK, DECADE_ITEMS, DUB, ENCORE, FORMAT_ITEMS, FRAGMENT, GENRE_ITEMS, LENS, MULLIGAN,
    REBROADCAST, SAMPLE_ITEMS, SCORE_LENS, SHIELD, SONG_TYPE_ITEMS, SPOTLIGHT,
)
from .locations import LOCATION_NAME_TO_ID, MILESTONE_COUNTS, OTHER_CHECKS, CheckSpec, milestone_name


def _decade(d: str) -> str:
    return d.replace(" & Earlier", " or earlier")


def _a(word: str) -> str:
    return ("an " if word[0] in "AEIOU" else "a ") + word


# Short texts for the website and tools. Only songs inside your current unlocks count toward any check.

ITEM_DESCRIPTIONS: dict[str, str] = {
    **{item: f"{t} songs count toward your checks." for t, item in SONG_TYPE_ITEMS.items()},
    **{item: f"Songs from anime that aired in the {_decade(d)} count toward your checks."
       for d, item in DECADE_ITEMS.items()},
    **{item: f"Songs from {g} anime count toward your checks." for g, item in GENRE_ITEMS.items()},
    **{item: f"Songs from {f} anime count toward your checks." for f, item in FORMAT_ITEMS.items() if f != "TV"},
    FORMAT_ITEMS["TV"]: "Songs from TV anime count toward your checks. Always open.",
    **{item: f"Songs played at the {p} sample point count toward your checks." for p, item in SAMPLE_ITEMS.items()},
    **{item: f"{c} songs count toward your checks." for c, item in CATEGORY_ITEMS.items()},
    LENS: "Opens the next harder song-difficulty tier (by community guess rate): Hard, then Brutal by default.",
    SCORE_LENS: "Opens songs from lower-scored anime: Mixed (6-7), then Overlooked (below 6).",
    DUB: "Dubbed songs count toward your checks.",
    REBROADCAST: "Rebroadcast songs count toward your checks.",
    CLOCK: "Raises the longest room guess time at which songs still count.",
    FRAGMENT: "Opens the later stages; with enough of them, the Grand Finale.",
    ENCORE: "Your next counted answer is worth two toward the Correct Answers milestones.",
    SHIELD: "Absorbs your next wrong answer, so your streak survives it.",
    CHEER: "+2 milestone progress, and every active timed trap ends one song sooner.",
    MULLIGAN: "Your next eligible miss is forgiven as if the song never played.",
    SPOTLIGHT: "Your next counted answer counts twice toward its category checks.",
    "Mute Trap": "Mutes the audio for a few songs.",
    "Reverse Typing Trap": "The answer box shows your text backwards for a few songs.",
    "Tiny Text Trap": "The answer box text becomes tiny for a few songs.",
    "Streak Wipe Trap": "Resets your current streak.",
    "Tax Collector Trap": "Takes 5 points of Correct Answers milestone progress.",
    "Blind Trap": "The anime clip stays hidden after the reveal for a few songs.",
    # groups
    "Song Pass": "Unlocks a song type (Opening, Ending, Insert Song).",
    "Decade Pass": "Unlocks the songs of an airing decade.",
    "Genre Key": "Unlocks the songs of an anime genre.",
    "Format Pass": "Unlocks an anime format. TV is always open.",
    "Sample Pass": "Unlocks a sample point of the room settings. Start is always open.",
    "Song Category": "Unlocks a song category. Standard is always open.",
    "Traps": "Cosmetic traps applied by the userscript. They never change your answers.",
    "Boosts": "One-shot helpers for milestones, streaks and category checks.",
}

LOCATION_GROUP_DESCRIPTIONS: dict[str, str] = {
    "Milestones": "Correct answers in total, across every game.",
    "Song Types": "Correct songs of each song type.",
    "Decades": "Correct songs from each airing decade.",
    "Genres": "Correct songs from each genre.",
    "Formats": "Correct songs from each anime format other than TV.",
    "Rarity": "Correct songs from each song-difficulty tier.",
    "Streaks": "Correct answers in a row.",
    "Challenges": "Single-game challenges: flawless starts, accuracy, long games and variety.",
    "Comebacks": "Recovering from misses.",
    "Seasons": "Correct songs from each airing season.",
    "Sample Points": "Correct songs at each sample point (only with Sample Point locked).",
    "Song Categories": "Correct songs of each song category (only with Song Category locked).",
    "Anime Score": "Correct songs by the anime's score (only with Anime Score locked).",
    "Dubs & Rebroadcasts": "Correct dubbed and rebroadcast songs (only with Dub & Rebroadcast locked).",
    "Quick Draw": "Correct answers locked in with Enter soon after the song starts.",
    "Nexus": "Correct answers in AMQ's solo Nexus mode.",
    "Song Source": "On-list and off-list songs (only with song_source: mixed).",
    "Multiplayer": "Placements in games against other players.",
}


def _songs(n: int, kind: str = "") -> str:
    kind = f"{kind} " if kind else ""
    return f"1 {kind}song" if n == 1 else f"{n} {kind}songs"


_CHECK_TEXTS = {
    "total": lambda s: f"Answer {s.n} songs correctly in total.",
    "type": lambda s: f"Answer {_songs(s.n)} of type {s.key} correctly.",
    "decade": lambda s: f"Answer {_songs(s.n)} from the {_decade(s.key)} correctly.",
    "genre": lambda s: f"Answer {_songs(s.n)} from {s.key} anime correctly.",
    "format": lambda s: f"Answer {_songs(s.n)} from {_a(s.key)} correctly.",
    "rarity": lambda s: f"Answer {_songs(s.n)} from the {s.key} song-difficulty tier correctly.",
    "streak": lambda s: f"Answer {s.n} songs in a row correctly.",
    "flawless": lambda s: f"Answer the first {s.n} counted songs of a game all correctly.",
    "accuracy": lambda s: f"Finish a game of at least {s.n} counted songs with {s.pct}% or more correct.",
    "marathon": lambda s: f"Play a game with at least {s.n} counted songs.",
    "game_types": lambda s: "Answer an Opening, an Ending and an Insert Song correctly in one game.",
    "game_decades": lambda s: f"Answer songs from {s.n} different decades correctly in one game.",
    "game_genres": lambda s: f"Answer songs from {s.n} different genres correctly in one game.",
    "bounce": lambda s: f"Answer correctly right after a miss, {s.n} times in total.",
    "comeback": lambda s: f"In one game, answer {s.n} in a row correctly after missing 3 in a row.",
    "finish": lambda s: f"End a game on a streak of at least {s.n} correct answers.",
    "years": lambda s: f"Answer songs from {s.n} different years correctly.",
    "season": lambda s: f"Answer {_songs(s.n)} from anime that aired in {s.key} correctly.",
    "game_seasons": lambda s: "Answer songs from all four airing seasons correctly in one game.",
    "sample": lambda s: f"Answer {_songs(s.n)} played at the {s.key} sample point correctly.",
    "category": lambda s: f"Answer {_songs(s.n)} of the {s.key} song category correctly.",
    "score": lambda s: f"Answer {_songs(s.n)} from {s.key} anime (by anime score) correctly.",
    "dub": lambda s: f"Answer {_songs(s.n, 'dubbed' if s.key == 'Dub' else 'rebroadcast')} correctly.",
    "quick": lambda s: f"Answer {_songs(s.n)} correctly, each locked in with Enter within {s.secs} seconds.",
    "nexus": lambda s: f"Answer {s.n} songs correctly in Nexus mode.",
    "list_on": lambda s: f"Answer {s.n} songs from your own anime list correctly.",
    "list_off": lambda s: f"Answer {s.n} songs from outside your anime list correctly.",
    "game_list_mix": lambda s: f"Answer {s.n} on-list and {s.n} off-list songs correctly in one game.",
    "mp_podium": lambda s: f"Finish in the top 3 of a game with {s.n} or more players.",
    "mp_win": lambda s: f"Win a game with {s.n} or more players.",
}


def describe(spec: CheckSpec) -> str:
    return _CHECK_TEXTS[spec.kind](spec)


def _location_descriptions() -> dict[str, str]:
    milestones = [CheckSpec(milestone_name(n), "total", 0, "Milestones", n=n) for n in MILESTONE_COUNTS]
    out = {spec.name: describe(spec) for spec in milestones + OTHER_CHECKS}
    assert set(out) == set(LOCATION_NAME_TO_ID), "every location needs a description"
    return {**out, **LOCATION_GROUP_DESCRIPTIONS}


LOCATION_DESCRIPTIONS = _location_descriptions()
