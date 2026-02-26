#!/usr/bin/env python3
"""Build the Firefox Kiosk Schischi extension XPI into the public/ directory."""

import zipfile
from pathlib import Path

FILES = [
    "manifest.json",
    "background.js",
    "content/content.js",
    "content/style.css",
    "icons/icon.svg",
]

OUT = Path("public") / "firefox-kiosk-schischi.xpi"

Path("public").mkdir(exist_ok=True)

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for f in FILES:
        z.write(f)
        print(f"  added {f}")

print(f"Built: {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")
