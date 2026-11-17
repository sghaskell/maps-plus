#!/usr/bin/env python3
"""Sanity checks for the Maps+ probe harness in test/.

Stdlib only. Run with:  python -I test/validate.py

Checks:
  1. every test/studio/*.json parses as JSON
  2. every test/classic/*.xml parses as XML
  3. every Studio viz of type leaflet_maps_app.maps-plus has a dataSources.primary
     that exists under the top-level dataSources
  4. every layout structure item refers to a defined visualization
  5. no file contains "key=" followed by anything other than ${CARTO_KEY}
"""

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

TEST_DIR = Path(__file__).resolve().parent
STUDIO_DIR = TEST_DIR / "studio"
CLASSIC_DIR = TEST_DIR / "classic"
MAPS_TYPE = "leaflet_maps_app.maps-plus"
KEY_PLACEHOLDER = "${CARTO_KEY}"

errors = []
checked = []


def fail(path, msg):
    errors.append(f"{path.relative_to(TEST_DIR)}: {msg}")


def check_studio(path):
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        fail(path, f"invalid JSON: {exc}")
        return
    checked.append(str(path.relative_to(TEST_DIR)))

    sources = doc.get("dataSources", {}) or {}
    vizs = doc.get("visualizations", {}) or {}
    maps_count = 0
    for viz_id, viz in vizs.items():
        if viz.get("type") != MAPS_TYPE:
            continue
        maps_count += 1
        primary = (viz.get("dataSources") or {}).get("primary")
        if not primary:
            fail(path, f"viz {viz_id} has no dataSources.primary")
        elif primary not in sources:
            fail(path, f"viz {viz_id} points at missing dataSource {primary!r}")

    layout = doc.get("layout", {}) or {}
    for item in layout.get("structure", []) or []:
        ref = item.get("item")
        if ref not in vizs:
            fail(path, f"layout item {ref!r} is not a defined visualization")

    if maps_count == 0:
        fail(path, "no leaflet_maps_app.maps-plus visualization found")


def check_classic(path):
    try:
        ET.parse(path)
    except ET.ParseError as exc:
        fail(path, f"invalid XML: {exc}")
        return
    checked.append(str(path.relative_to(TEST_DIR)))


def check_keys(path):
    text = path.read_text(encoding="utf-8")
    for match in re.finditer(r"key=", text):
        rest = text[match.end():match.end() + len(KEY_PLACEHOLDER)]
        if rest != KEY_PLACEHOLDER:
            line = text.count("\n", 0, match.start()) + 1
            fail(path, f"line {line}: 'key=' not followed by {KEY_PLACEHOLDER}")


def main():
    studio_files = sorted(STUDIO_DIR.glob("*.json"))
    classic_files = sorted(CLASSIC_DIR.glob("*.xml"))
    if not studio_files:
        errors.append("no test/studio/*.json files found")
    if not classic_files:
        errors.append("no test/classic/*.xml files found")

    for path in studio_files:
        check_studio(path)
        check_keys(path)
    for path in classic_files:
        check_classic(path)
        check_keys(path)

    for name in checked:
        print(f"ok  {name}")
    if errors:
        for err in errors:
            print(f"ERR {err}")
        print(f"FAILED: {len(errors)} problem(s)")
        return 1
    print(f"PASSED: {len(checked)} file(s) checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
