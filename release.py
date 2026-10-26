"""Release helpers for CI.

    python release.py check [TAG]   world_version, the userscript's @version and the newest CHANGELOG entry agree
                                    (and match TAG, e.g. v0.8.1, when given)
    python release.py notes         prints the newest CHANGELOG entry, for the GitHub release body
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent


def world_version() -> str:
    return json.loads((ROOT / "amq" / "archipelago.json").read_text(encoding="utf-8"))["world_version"]


def client_version() -> str:
    header = (ROOT / "client" / "amq_archipelago.user.js").read_text(encoding="utf-8")
    return re.search(r"^// @version\s+(\S+)", header, re.M).group(1)


def changelog() -> tuple[str, str]:
    """The newest entry's version and body."""
    text = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    match = re.search(r"^## \[([^\]]+)\][^\n]*\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    return match.group(1), match.group(2).strip()


def check(tag: str | None) -> list[str]:
    versions = {"amq/archipelago.json world_version": world_version(),
                "userscript @version": client_version(),
                "newest CHANGELOG.md entry": changelog()[0]}
    if tag is not None:
        versions["tag"] = tag.removeprefix("v")
    if len(set(versions.values())) == 1:
        return []
    return [f"{where}: {version}" for where, version in versions.items()]


if __name__ == "__main__":
    command, *args = sys.argv[1:] or ["check"]
    if command == "notes":
        print(changelog()[1])
    elif command == "check":
        problems = check(args[0] if args else None)
        if problems:
            sys.exit("versions disagree:\n  " + "\n  ".join(problems))
        print(f"version {world_version()}")
    else:
        sys.exit(__doc__)
