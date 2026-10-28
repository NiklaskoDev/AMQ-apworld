"""Compares two JSON files and prints where they differ, e.g. snapshots or traces taken before and after a change.

    python tools/diff_json.py BEFORE.json AFTER.json [--max N]

Exits 0 when they are equal, 1 otherwise.
"""
import argparse
import json
import sys


def differences(a, b, path="$"):
    """Yields (path, before, after) for every place the two values differ."""
    if isinstance(a, dict) and isinstance(b, dict):
        for key in sorted(set(a) | set(b), key=str):
            if key not in a or key not in b:
                yield f"{path}.{key}", a.get(key, "<missing>"), b.get(key, "<missing>")
            else:
                yield from differences(a[key], b[key], f"{path}.{key}")
    elif isinstance(a, list) and isinstance(b, list):
        for i, (x, y) in enumerate(zip(a, b)):
            yield from differences(x, y, f"{path}[{i}]")
        if len(a) != len(b):
            yield f"{path} length", len(a), len(b)
    elif a != b:
        yield path, a, b


def around(x, y, limit=160):
    """Both values as short text; for long strings, the part around the first character that differs."""
    if isinstance(x, str) and isinstance(y, str) and max(len(x), len(y)) > limit:
        i = next((i for i, (c, d) in enumerate(zip(x, y)) if c != d), min(len(x), len(y)))
        start = max(0, i - limit // 3)
        cut = (lambda t: ("..." if start else "") + json.dumps(t[start:start + limit])
               + ("..." if start + limit < len(t) else ""))
        return cut(x), cut(y)
    return tuple(t if len(t) <= limit else t[:limit] + "..." for t in (json.dumps(x), json.dumps(y)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("before")
    parser.add_argument("after")
    parser.add_argument("--max", type=int, default=20, help="differences to print (default 20)")
    args = parser.parse_args()
    with open(args.before, encoding="utf-8") as f:
        before = json.load(f)
    with open(args.after, encoding="utf-8") as f:
        after = json.load(f)
    found = 0
    for path, x, y in differences(before, after):
        found += 1
        if found <= args.max:
            x, y = around(x, y)
            print(f"{path}\n  before: {x}\n  after:  {y}")
    if found:
        print(f"{found} difference{'s' if found > 1 else ''}")
        sys.exit(1)
    print("identical")
