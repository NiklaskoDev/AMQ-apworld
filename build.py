"""Build amq.apworld the same way Archipelago's "Build APWorlds" launcher component does.

The archive name must match the world folder name (the loader imports `worlds.<file stem>`), and the manifest
must carry the container `version` / `compatible_version` fields.
"""
import json
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).parent
WORLD = "amq"
CONTAINER_VERSION = 7


def build() -> pathlib.Path:
    world_dir = ROOT / WORLD
    manifest = json.loads((world_dir / "archipelago.json").read_text(encoding="utf-8"))
    manifest.update({"compatible_version": CONTAINER_VERSION, "version": CONTAINER_VERSION})
    out = ROOT / f"{WORLD}.apworld"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in sorted(world_dir.rglob("*")):
            if path.is_dir() or "__pycache__" in path.parts or path.name == "archipelago.json":
                continue
            zf.write(path, pathlib.Path(WORLD, path.relative_to(world_dir)))
        zf.writestr(f"{WORLD}/archipelago.json", json.dumps(manifest, indent=1))
    return out


if __name__ == "__main__":
    print(f"built {build().relative_to(ROOT)}")
