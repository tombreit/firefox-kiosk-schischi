#!/usr/bin/env python3
"""Build the Firefox Kiosk Schischi extension XPI into the public/ directory."""

import shutil
import zipfile
from pathlib import Path

FILES = [
    "manifest.json",
    "background.js",
    "content/content.js",
    "content/style.css",
    "icons/icon.svg",
]

Path("public").mkdir(exist_ok=True)

# build XPI
OUT = Path("public") / "firefox-kiosk-schischi.xpi"
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for f in FILES:
        z.write(f)
        print(f"  added {f}")
print(f"Built: {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")

# copy index page
shutil.copy("index.html", "public/index.html")
print("Copied: public/index.html")
