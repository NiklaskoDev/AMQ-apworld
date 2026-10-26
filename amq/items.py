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
# By community guess rate, matching the lobby "song difficulty" slider:
# Easy 60-100%, Medium 25-60%, Hard 10-25%, Brutal 0-10%. Easy and Medium are always unlocked.
RARITY_TIERS = ["Easy", "Medium", "Hard", "Brutal"]
FREE_RARITY_TIERS = 2
LENS_COUNT = len(RARITY_TIERS) - FREE_RARITY_TIERS

FRAGMENT = "Mixtape Fragment"
LENS = "Progressive Rarity Lens"

SONG_TYPE_ITEMS = {t: f"{t} Pass" for t in SONG_TYPES}
DECADE_ITEMS = {d: f"Decade Pass: {d}" for d in DECADES}
GENRE_ITEMS = {g: f"Genre Key: {g}" for g in GENRES}
FORMAT_ITEMS = {f: f"Format Pass: {f}" for f in FORMATS}

ENCORE = "Encore Ticket"
SHIELD = "Streak Shield"
CHEER = "Hype Cheer"

TRAPS = ["Mute Trap", "Reverse Typing Trap", "Tiny Text Trap", "Streak Wipe Trap", "Tax Collector Trap"]

FILLER_WEIGHTS = {ENCORE: 3, SHIELD: 3, CHEER: 4}


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
    block(80, [ENCORE, SHIELD], ItemClassification.useful, "Boosts")
    block(82, [CHEER], ItemClassification.filler, "Boosts")
    block(90, TRAPS, ItemClassification.trap, "Traps")
    return table


ITEM_TABLE = _build()
ITEM_NAME_TO_ID = {name: data.code for name, data in ITEM_TABLE.items()}

ITEM_GROUPS = {
    "Song Pass": set(SONG_TYPE_ITEMS.values()),
    "Decade Pass": set(DECADE_ITEMS.values()),
    "Genre Key": set(GENRE_ITEMS.values()),
    "Format Pass": set(FORMAT_ITEMS.values()),
    "Traps": set(TRAPS),
    "Boosts": {ENCORE, SHIELD, CHEER},
}


class AMQItem(Item):
    game = GAME_NAME
