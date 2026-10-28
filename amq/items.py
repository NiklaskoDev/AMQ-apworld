from __future__ import annotations

from typing import NamedTuple

from BaseClasses import Item, ItemClassification

BASE_ID = 0x414D5100  # "AMQ\0"

GAME_NAME = "Anime Music Quiz"

# Only generic, descriptive categories are used anywhere in this world: no titles, songs, artists or artwork.
SONG_TYPES = ["Opening", "Ending", "Insert Song"]
DECADES = ["1980s & Earlier", "1990s", "2000s", "2010s", "2020s"]
GENRES = [
    "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mecha",
    "Music", "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural",
    # appended later; keep this list append-only so item ids stay stable
    "Mahou Shoujo", "Psychological", "Thriller",
]
# Broad genres; one of these is always among the starting genres so the first lobby has enough songs.
BROAD_GENRES = ["Action", "Comedy", "Drama", "Fantasy", "Romance", "Slice of Life"]
FORMATS = ["TV", "Movie", "OVA", "ONA", "Special"]
# By community guess rate, matching the lobby "song difficulty" slider. Boundaries and the number of tiers unlocked
# from the start are options; by default Easy 60-100%, Medium 25-60%, Hard 10-25%, Brutal 0-10%, Easy+Medium free.
RARITY_TIERS = ["Easy", "Medium", "Hard", "Brutal"]
DEFAULT_FREE_RARITY_TIERS = 2

FRAGMENT = "Mixtape Fragment"
LENS = "Progressive Rarity Lens"
CLOCK = "Progressive Guess Time"
# the room's sample point setting; Start is always open, the others need a pass
SAMPLE_POINTS = ["Start", "Middle", "End", "Random"]
SAMPLE_ITEMS = {p: f"Sample Pass: {p}" for p in SAMPLE_POINTS[1:]}

# AMQ's song categories; Standard is always open, the others need a pass (only with Song Category locked)
SONG_CATEGORIES = ["Standard", "Instrumental", "Chanting", "Character"]
CATEGORY_ITEMS = {c: f"Song Category: {c}" for c in SONG_CATEGORIES}
# by the anime's score (the lobby "anime score" filter); the top two tiers are open, a lens adds each lower one
SCORE_TIERS = ["Acclaimed", "Well Liked", "Mixed", "Overlooked"]
SCORE_FLOORS = {"Acclaimed": 8, "Well Liked": 7, "Mixed": 6, "Overlooked": 0}
FREE_SCORE_TIERS = 2
SCORE_LENS = "Progressive Score Lens"
DUB = "Dub Pass"
REBROADCAST = "Rebroadcast Pass"
# airing seasons, AMQ's vintage names (e.g. "Spring 2010"); only locked with Seasons in unlock_categories
SEASONS = ["Winter", "Spring", "Summer", "Fall"]
SEASON_ITEMS = {s: f"Season Pass: {s}" for s in SEASONS}

SONG_TYPE_ITEMS = {t: f"{t} Pass" for t in SONG_TYPES}
DECADE_ITEMS = {d: f"Decade Pass: {d}" for d in DECADES}
GENRE_ITEMS = {g: f"Genre Key: {g}" for g in GENRES}
FORMAT_ITEMS = {f: f"Format Pass: {f}" for f in FORMATS}

ENCORE = "Encore Ticket"
SHIELD = "Streak Shield"
CHEER = "Hype Cheer"
MULLIGAN = "Mulligan"
SPOTLIGHT = "Spotlight"
LINER_NOTES = "Liner Notes"

# append-only, the list order is the id order
TRAPS = ["Mute Trap", "Reverse Typing Trap", "Tiny Text Trap", "Streak Wipe Trap", "Tax Collector Trap", "Blind Trap"]

FILLER_WEIGHTS = {ENCORE: 3, SHIELD: 3, CHEER: 4, MULLIGAN: 2, SPOTLIGHT: 2, LINER_NOTES: 2}


class ItemData(NamedTuple):
    code: int
    classification: ItemClassification
    category: str


def _build() -> dict[str, ItemData]:
    """Each category owns a fixed id block, so appending to a list never shifts existing ids."""
    table: dict[str, ItemData] = {}
    prog = ItemClassification.progression

    def block(offset: int, names, cls: ItemClassification, category: str) -> None:
        for i, name in enumerate(names):
            table[name] = ItemData(BASE_ID + offset + i, cls, category)

    block(0, SONG_TYPE_ITEMS.values(), prog, "Song Types")
    block(10, DECADE_ITEMS.values(), prog, "Decades")
    block(20, GENRE_ITEMS.values(), prog, "Genres")
    block(60, FORMAT_ITEMS.values(), prog, "Formats")
    block(70, [LENS], prog, "Rarity")
    block(71, [FRAGMENT], prog, "Fragments")
    # nothing needs a longer timer (a short one always works), so it only makes play easier
    block(72, [CLOCK], ItemClassification.useful, "Guess Time")
    block(73, SAMPLE_ITEMS.values(), prog, "Sample Point")
    block(80, [ENCORE, SHIELD], ItemClassification.useful, "Boosts")
    block(82, [CHEER], ItemClassification.filler, "Boosts")
    block(83, [MULLIGAN, SPOTLIGHT], ItemClassification.useful, "Boosts")
    # hints one of your open checks for whoever's item it holds; nothing depends on it
    block(85, [LINER_NOTES], ItemClassification.filler, "Boosts")
    block(90, TRAPS, ItemClassification.trap, "Traps")
    block(100, CATEGORY_ITEMS.values(), prog, "Song Category")
    block(110, [SCORE_LENS], prog, "Anime Score")
    block(111, [DUB, REBROADCAST], prog, "Dub & Rebroadcast")
    block(120, SEASON_ITEMS.values(), prog, "Seasons")
    return table


ITEM_TABLE = _build()
ITEM_NAME_TO_ID = {name: data.code for name, data in ITEM_TABLE.items()}

ITEM_GROUPS = {
    "Song Pass": set(SONG_TYPE_ITEMS.values()),
    "Decade Pass": set(DECADE_ITEMS.values()),
    "Genre Key": set(GENRE_ITEMS.values()),
    "Format Pass": set(FORMAT_ITEMS.values()),
    "Sample Pass": set(SAMPLE_ITEMS.values()),
    "Song Category": set(CATEGORY_ITEMS.values()),
    "Season Pass": set(SEASON_ITEMS.values()),
    "Traps": set(TRAPS),
    "Boosts": {ENCORE, SHIELD, CHEER, MULLIGAN, SPOTLIGHT, LINER_NOTES},
}


class AMQItem(Item):
    game = GAME_NAME
