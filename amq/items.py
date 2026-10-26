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
]
FORMATS = ["TV", "Movie", "OVA", "ONA", "Special"]
RARITY_TIERS = ["Easy", "Medium", "Hard", "Brutal"]  # by community guess rate; Easy is always unlocked

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
    table: dict[str, ItemData] = {}
    prog = ItemClassification.progression

    def add(name: str, cls: ItemClassification, category: str) -> None:
        table[name] = ItemData(BASE_ID + len(table), cls, category)

    for name in SONG_TYPE_ITEMS.values():
        add(name, prog, "Song Types")
    for name in DECADE_ITEMS.values():
        add(name, prog, "Decades")
    for name in GENRE_ITEMS.values():
        add(name, prog, "Genres")
    for name in FORMAT_ITEMS.values():
        add(name, prog, "Formats")
    add(LENS, prog, "Rarity")
    add(FRAGMENT, prog, "Fragments")
    add(ENCORE, ItemClassification.useful, "Boosts")
    add(SHIELD, ItemClassification.useful, "Boosts")
    add(CHEER, ItemClassification.filler, "Boosts")
    for name in TRAPS:
        add(name, ItemClassification.trap, "Traps")
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
