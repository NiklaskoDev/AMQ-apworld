from __future__ import annotations

from .items import (
    CATEGORY_ITEMS, CHEER, CLOCK, DECADE_ITEMS, DUB, ENCORE, FORMAT_ITEMS, FRAGMENT, GENRE_ITEMS, LENS, MULLIGAN,
    REBROADCAST, SAMPLE_ITEMS, SCORE_LENS, SHIELD, SONG_TYPE_ITEMS, SPOTLIGHT,
)
from .locations import ALL_FLAGS, LOCATION_NAME_TO_ID, MAX_MILESTONES, MILESTONE_STEPS, CheckSpec, build_check_specs

def _decade(d: str) -> str:
    return d.replace(" & Earlier", " or earlier")


def _a(word: str) -> str:
    return ("an " if word[:1] in tuple("AEIOU") else "a ") + word


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


def describe(spec: CheckSpec) -> str:
    n, key = spec.n, spec.key
    texts = {
        "total": f"Answer {n} songs correctly in total.",
        "type": f"Answer {_songs(n)} of type {key} correctly.",
        "decade": f"Answer {_songs(n)} from the {_decade(key)} correctly.",
        "genre": f"Answer {_songs(n)} from {key} anime correctly.",
        "format": f"Answer {_songs(n)} from {_a(key)} correctly.",
        "rarity": f"Answer {_songs(n)} from the {key} song-difficulty tier correctly.",
        "streak": f"Answer {n} songs in a row correctly.",
        "flawless": f"Answer the first {n} counted songs of a game all correctly.",
        "accuracy": f"Finish a game of at least {n} counted songs with {spec.pct}% or more correct.",
        "marathon": f"Play a game with at least {n} counted songs.",
        "game_types": "Answer an Opening, an Ending and an Insert Song correctly in one game.",
        "game_decades": f"Answer songs from {n} different decades correctly in one game.",
        "game_genres": f"Answer songs from {n} different genres correctly in one game.",
        "bounce": f"Answer correctly right after a miss, {n} times in total.",
        "comeback": f"In one game, answer {n} in a row correctly after missing 3 in a row.",
        "finish": f"End a game on a streak of at least {n} correct answers.",
        "years": f"Answer songs from {n} different years correctly.",
        "season": f"Answer {_songs(n)} from anime that aired in {key} correctly.",
        "game_seasons": "Answer songs from all four airing seasons correctly in one game.",
        "sample": f"Answer {_songs(n)} played at the {key} sample point correctly.",
        "category": f"Answer {_songs(n)} of the {key} song category correctly.",
        "score": f"Answer {_songs(n)} from {key} anime (by anime score) correctly.",
        "dub": f"Answer {_songs(n, 'dubbed' if key == 'Dub' else 'rebroadcast')} correctly.",
        "quick": f"Answer {_songs(n)} correctly, each locked in with Enter within {spec.secs} seconds.",
        "nexus": f"Answer {n} songs correctly in Nexus mode.",
        "list_on": f"Answer {n} songs from your own anime list correctly.",
        "list_off": f"Answer {n} songs from outside your anime list correctly.",
        "game_list_mix": f"Answer {n} on-list and {n} off-list songs correctly in one game.",
        "mp_podium": f"Finish in the top 3 of a game with {n} or more players.",
        "mp_win": f"Win a game with {n} or more players.",
    }
    return texts[spec.kind]


def _location_descriptions() -> dict[str, str]:
    out = {spec.name: describe(spec)
           for spec in build_check_specs(0, 1, True, True, True, **ALL_FLAGS)}
    for step in MILESTONE_STEPS:
        for spec in build_check_specs(MAX_MILESTONES, step, False, False):
            if spec.kind == "total":
                out[spec.name] = describe(spec)
    assert set(out) == set(LOCATION_NAME_TO_ID), "every location needs a description"
    return {**out, **LOCATION_GROUP_DESCRIPTIONS}


LOCATION_DESCRIPTIONS = _location_descriptions()
